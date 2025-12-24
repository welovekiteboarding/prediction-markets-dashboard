# SCANS_AND_INTERVALS_GUIDE.md

## Purpose
This document explains:
- What happens when you run scans in the UI (step-by-step)
- What happens automatically in the background (polling)
- Exactly where to change:
  - scan intervals / auto-scan intervals
  - which crypto/markets are searched
  - timeframe matching (15m vs 30m vs 1h)
  - pacing / rate limiting
  - fee assumptions and thresholds

All references below map to the current code in this repo.

---

## 1) Key files (where things live)

### Frontend (React)
- `frontend/src/components/ArbitrageScanner.js`
  - Manual arbitrage check + optional auto-refresh
  - Controls `refreshInterval`, `alertThreshold`, `investmentAmount`
- `frontend/src/components/BtcArbScanner.jsx`
  - BTC 15-min cross-market scan UI + optional auto-scan
- `frontend/src/components/BtcIntraArbScanner.jsx`
  - BTC intra-polymarket scan UI + optional auto-scan
- `frontend/src/components/MarketList.jsx`
  - Price polling every 20 seconds, flashes UI when prices change
- `frontend/src/App.js`
  - Imports CSS, wires layout, fetches markets

### Backend (Express)
- `backend/index.js`
  - `GET /api/arbitrage/btc-check`
  - `GET /api/arbitrage/btc-intra-check`
  - `GET /api/arbitrage/check?market_slug=...`
  - `GET /api/markets`
  - `GET /api/market-price/:tokenId`
  - Dome API client + pacing / rate limiting

---

## 2) “Scan” vs “Polling” (important distinction)

### Scan
A scan is initiated by:
- a button click OR
- auto-scan interval timer

Examples:
- `GET /api/arbitrage/check?market_slug=...`
- `GET /api/arbitrage/btc-check`
- `GET /api/arbitrage/btc-intra-check`

### Polling
Polling runs automatically in the background to keep the UI fresh.

Example:
- `MarketList.jsx` polling calls:
  - `GET /api/market-price/:tokenId` for each displayed market

---

## 3) BTC 15‑Min Arbitrage Scanner: frontend behavior

### File: `frontend/src/components/BtcArbScanner.jsx`

#### Step-by-step
1. Click **Scan BTC Arbitrage**
2. `scanBtcArbitrage()`:
   - sets loading
   - clears error
   - calls backend: `fetch('http://localhost:5000/api/arbitrage/btc-check')`
3. Parses JSON
4. Sets `results` (or sets `error` on failure)
5. UI prints:
   - `results.arbs` count
   - per-arb cards including direction, netProfit, fees, volumes, maxPosition

#### Where to change: auto-scan defaults
Current default:
```js
const [refreshInterval, setRefreshInterval] = useState(30); // seconds
```

Timer:
```js
intervalRef.current = setInterval(() => {
  scanBtcArbitrage();
}, refreshInterval * 1000);
```

Dropdown options:
```jsx
<option value="20">20s</option>
<option value="30">30s</option>
<option value="45">45s</option>
<option value="60">60s</option>
```

**To add 90s / 120s:**
```jsx
<option value="90">90s</option>
<option value="120">120s</option>
```

---

## 4) BTC 15‑Min Arbitrage Scanner: backend behavior (`GET /api/arbitrage/btc-check`)

### File: `backend/index.js`

#### Step-by-step execution (exact logic)
1. Express receives `GET /api/arbitrage/btc-check`
2. Logs request:
   - `=== /api/arbitrage/btc-check called ===`
3. Defines helpers:
   - `delay(ms)`
   - `extractBtcTimeframe(title)`
   - `extractStrikePrice(title)`
   - `normalizeTitle(title)` (**defined but currently unused**)
4. Fetch Polymarket markets via Dome:
   ```js
   const polyRes = await domeApi.get('/polymarket/markets', {
     params: {
       tags: ['Bitcoin'],
       status: 'open',
       min_volume: 5000,
       limit: 10
     }
   });
   ```
5. Filters Polymarket results to short-term BTC:
   ```js
   const polyBtcMarkets = polyRes.data.markets.filter(m => {
     const title = m.question || m.title || '';
     const timeframe = extractBtcTimeframe(title);
     return timeframe === '15m' || timeframe === '30m'; // Focus on short-term
   });
   ```
6. Sleeps 1.1s:
   - `await delay(1100)` (free-tier pacing)
7. Fetch Kalshi markets via Dome:
   ```js
   const kalshiRes = await domeApi.get('/kalshi/markets', {
     params: {
       status: 'open',
       min_volume: 5000,
       limit: 30
     }
   });
   ```
8. Filters Kalshi results to BTC-ish titles:
   ```js
   const kalshiBtc = kalshiRes.data.markets.filter(m =>
     m.title.toLowerCase().includes('bitcoin') ||
     m.title.toLowerCase().includes('btc')
   );
   ```
9. For each Polymarket BTC short-term market:
   - parse timeframe + strike from title
   - compute Poly yes/no implied probabilities:
     ```js
     const polyYes = polyMarket.side_a.price / 100;
     const polyNo = polyMarket.side_b.price / 100;
     ```
   - find matching Kalshi market by:
     - same timeframe
     - strike within $1000
10. If Kalshi match found:
    - compute two arb directions:
      ```js
      const arb1 = polyYes + kalshiNo;
      const arb2 = polyNo + kalshiYes;
      ```
    - if either < 1.0 → opportunity
    - compute:
      ```js
      const grossProfit = ((1 - Math.min(arb1, arb2)) * 100);
      const kalshiFee = 1.2; // Conservative taker fee
      const polyFee = 0.3;
      const totalFee = kalshiFee + polyFee;
      const netProfit = grossProfit - totalFee;
      ```
    - push result object into `arbs`
11. If no Kalshi match:
    - check “intra-polymarket slippage” condition:
      ```js
      if (!kalshiMatch && polyYes + polyNo < 1.0) {
        const grossProfit = ((1 - (polyYes + polyNo)) * 100);
        const fees = { kalshi: 0, polymarket: 0.3, total: 0.3 };
        const netProfit = grossProfit - fees.total;
        // push intra-poly result
      }
      ```
12. Respond JSON:
    ```json
    {
      "success": true,
      "arbs": [...],
      "count": <arbs.length>,
      "timestamp": "<ISO>",
      "note": "BTC 15-min arbitrage scan using free-tier APIs..."
    }
    ```
13. On error, returns:
    ```json
    {
      "error": "Failed to check BTC arbitrage",
      "details": "<error message>"
    }
    ```

---

## 5) Where to change: crypto/markets searched

### Backend: Polymarket tag filter
In `/api/arbitrage/btc-check`:
```js
tags: ['Bitcoin'],  // Change to ['Ethereum'] or ['Crypto'] etc.
```

### Backend: Kalshi title filter
```js
const kalshiBtc = kalshiRes.data.markets.filter(m =>
  m.title.toLowerCase().includes('bitcoin') ||
  m.title.toLowerCase().includes('btc')
);
```

**To support ETH or other crypto:**
```js
const kalshiCrypto = kalshiRes.data.markets.filter(m =>
  m.title.toLowerCase().includes('ethereum') ||
  m.title.toLowerCase().includes('eth')
);
```

---

## 6) Where to change: timeframe matching

### Helper: `extractBtcTimeframe(title)`
Current logic (supports 15m, 30m, 1h, daily):
```js
const extractBtcTimeframe = (title) => {
  const lower = title.toLowerCase();
  if (lower.includes('15 minute') || lower.includes('15min') || lower.includes('15m')) return '15m';
  if (lower.includes('30 minute') || lower.includes('30min') || lower.includes('30m')) return '30m';
  if (lower.includes('1 hour') || lower.includes('1h') || lower.includes('60m')) return '1h';
  if (lower.includes('daily') || lower.includes('24h') || lower.includes('day')) return 'daily';
  return null;
};
```

**To add 5m or 2h:**
```js
if (lower.includes('5 minute') || lower.includes('5min') || lower.includes('5m')) return '5m';
if (lower.includes('2 hour') || lower.includes('2h')) return '2h';
```

### Filter: which timeframes to include
Current filter keeps only `'15m'` or `'30m'`:
```js
return timeframe === '15m' || timeframe === '30m';
```

**To include 1h:**
```js
return timeframe === '15m' || timeframe === '30m' || timeframe === '1h';
```

---

## 7) Where to change: backend pacing / rate limiting

### Free‑tier delay (between Polymarket and Kalshi calls)
```js
await delay(1100); // 1.1 seconds
```

**To increase to 2s:**
```js
await delay(2000);
```

### Rate‑limiting queue spacing
The `domeApi.get` wrapper enforces a minimum gap between all Dome API calls:
```js
await new Promise(resolve => setTimeout(resolve, 1100));
```

**To change to 1.5s:**
```js
await new Promise(resolve => setTimeout(resolve, 1500));
```

---

## 8) Where to change: fee assumptions

### In `/api/arbitrage/btc-check`
Current fees:
```js
const kalshiFee = 1.2; // Conservative taker fee
const polyFee = 0.3;
const totalFee = kalshiFee + polyFee;
```

**To adjust:**
```js
const kalshiFee = 0.7; // Example: lower estimate
const polyFee = 0.3;
```

### Intra‑Polymarket slippage fees
```js
const fees = { kalshi: 0, polymarket: 0.3, total: 0.3 };
```

---

## 9) Where to change: market limits & volume thresholds

### Polymarket request limits
```js
params: {
  tags: ['Bitcoin'],
  status: 'open',
  min_volume: 5000,    // <-- change here
  limit: 10           // <-- change here
}
```

**To fetch more markets:**
```js
min_volume: 1000,
limit: 20
```

### Kalshi request limits
```js
params: {
  status: 'open',
  min_volume: 5000,   // <-- change here
  limit: 30           // <-- change here
}
```

---

## 10) ArbitrageScanner.js (manual market picker)

### File: `frontend/src/components/ArbitrageScanner.js`

#### Auto-refresh defaults
```js
const [refreshInterval, setRefreshInterval] = useState(45); // seconds
```

#### Alert threshold
```js
const [alertThreshold, setAlertThreshold] = useState(0); // percent
```

#### Investment amount
```js
const [investmentAmount, setInvestmentAmount] = useState(1000); // dollars
```

#### UI controls (range slider)
```jsx
<input
  type="range"
  min="30"
  max="120"
  step="15"
  value={refreshInterval}
  onChange={(e) => setRefreshInterval(parseInt(e.target.value))}
/>
```

**To extend range to 180s:**
```jsx
max="180"
step="15"
```

---

## 11) Market price polling (MarketList.jsx)

### File: `frontend/src/components/MarketList.jsx`

#### Polling interval
```js
const interval = setInterval(() => {
  fetchIncrementalPrices();
}, 20000); // 20 seconds
```

**To change to 10s:**
```js
}, 10000);
```

#### Price change detection tolerance
```js
if (price !== null && (oldPrice === undefined || Math.abs(price - oldPrice) > 0.0001)) {
```

**To make it more sensitive:**
```js
> 0.00001
```

#### Flash animation durations
```js
setTimeout(() => setIsUpdating(false), 1000);        // timestamp flash
setTimeout(() => setChangedPrices(new Set()), 2000); // price/card flash
```

**To make flashes longer:**
```js
setTimeout(() => setIsUpdating(false), 2000);
setTimeout(() => setChangedPrices(new Set()), 3000);
```

---

## 12) BtcIntraArbScanner.jsx (intra‑polymarket scanner)

### File: `frontend/src/components/BtcIntraArbScanner.jsx`

#### Auto-refresh defaults
```js
const [refreshInterval, setRefreshInterval] = useState(30); // seconds
```

#### Endpoint
```js
const response = await fetch('http://localhost:5000/api/arbitrage/btc-intra-check');
```

#### UI interval options
```jsx
<option value="20">20s</option>
<option value="30">30s</option>
<option value="45">45s</option>
<option value="60">60s</option>
```

**To add 90s/120s:**
```jsx
<option value="90">90s</option>
<option value="120">120s</option>
```

---

## 13) App.js: markets fetch interval

### File: `frontend/src/App.js`

#### Markets refresh
```js
const interval = setInterval(() => {
  fetchMarkets();
}, 60000); // 60 seconds
```

**To change to 30s:**
```js
}, 30000);
```

#### Markets payload normalization
```js
const marketsData = Array.isArray(response.data?.markets)
  ? response.data.markets
  : Array.isArray(response.data)
    ? response.data
    : [];
```

---

## 14) Summary of the most common knobs you’ll want to change

| What you want to change | File | Where (line/section) | Example change |
|--------------------------|------|----------------------|----------------|
| BTC auto-scan interval | `frontend/src/components/BtcArbScanner.jsx` | `useState(30)` | `useState(45)` |
| Add 90s/120s dropdown options | `frontend/src/components/BtcArbScanner.jsx` | `<option value="60">60s</option>` | Add `<option value="90">90s</option><option value="120">120s</option>` |
| Market price polling cadence | `frontend/src/components/MarketList.jsx` | `setInterval(..., 20000)` | `setInterval(..., 10000)` |
| Markets list refresh | `frontend/src/App.js` | `setInterval(..., 60000)` | `setInterval(..., 30000)` |
| BTC timeframe filter | `backend/index.js` (`/api/arbitrage/btc-check`) | `return timeframe === '15m' || timeframe === '30m';` | Add `|| timeframe === '1h'` |
| Crypto searched (Polymarket tag) | `backend/index.js` | `tags: ['Bitcoin']` | `tags: ['Ethereum']` |
| Kalshi title filter | `backend/index.js` | `includes('bitcoin') || includes('btc')` | `includes('ethereum') || includes('eth')` |
| Free‑tier pacing delay | `backend/index.js` | `await delay(1100)` | `await delay(2000)` |
| Fee assumptions | `backend/index.js` | `kalshiFee = 1.2; polyFee = 0.3` | `kalshiFee = 0.7; polyFee = 0.3` |
| Volume thresholds | `backend/index.js` | `min_volume: 5000` | `min_volume: 1000` |
| Market limits | `backend/index.js` | `limit: 10` / `limit: 30` | `limit: 20` / `limit: 50` |

---

## 15) Quick copy/paste snippets for common changes

### Make BTC scanner auto-scan every 45s by default
```js
// frontend/src/components/BtcArbScanner.jsx
const [refreshInterval, setRefreshInterval] = useState(45); // seconds
```

### Add 1h to BTC timeframe matching
```js
// backend/index.js, /api/arbitrage/btc-check
// In extractBtcTimeframe:
if (lower.includes('1 hour') || lower.includes('1h') || lower.includes('60m')) return '1h';

// In filter:
return timeframe === '15m' || timeframe === '30m' || timeframe === '1h';
```

### Change market price polling to 10s
```js
// frontend/src/components/MarketList.jsx
const interval = setInterval(() => {
  fetchIncrementalPrices();
}, 10000); // 10 seconds
```

### Lower volume threshold to include more markets
```js
// backend/index.js
params: {
  tags: ['Bitcoin'],
  status: 'open',
  min_volume: 1000, // <-- changed from 5000
  limit: 20        // <-- changed from 10
}
```

### Adjust fee assumptions
```js
// backend/index.js, /api/arbitrage/btc-check
const kalshiFee = 0.7; // Example: lower estimate
const polyFee = 0.3;
```

---

## 16) Reminder: earlier breakage we fixed

If you ever see:
- React “Element type is invalid … got: object”
- UI looks unstyled (light background)

It’s likely `MarketList.js` or `App.css` got truncated to 0 bytes again. The workaround we used was:
- Use `MarketList.jsx` and `AppStyles.css` instead of the unstable files.
- Update `App.js` to import `./components/MarketList.jsx` and `./AppStyles.css`.

---

## 17) How to verify changes

1. After editing a file:
   - Restart the backend (`npm start` in `backend/`) if you changed backend code.
   - Refresh the frontend (hard refresh) if you changed frontend code.
2. Open browser console and watch the Network tab to see the new intervals/requests.
3. In the UI, confirm:
   - Auto-scan dropdown shows new intervals (if you added them)
   - “Last updated” flashes at the new polling cadence
   - Results include the new timeframes/crypto if you expanded the filters

---

**End of guide**
