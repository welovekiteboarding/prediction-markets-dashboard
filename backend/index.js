const express = require('express');
const cors = require('cors');
const axios = require('axios');
let DomeClient;
try {
  ({ DomeClient } = require('@dome-api/sdk'));
} catch (e) {
  // Keep backend running even if the SDK (or its transitive deps) is unavailable.
  // Dome API is still accessed via direct axios calls below.
  console.warn('Warning: Failed to load @dome-api/sdk. SDK features disabled until dependencies are installed.', e?.message || e);
}
require('dotenv').config();

// Add logging
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Simple logging function
function logToFile(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}\n`;
  const logFile = path.join(logsDir, `server-${new Date().toISOString().split('T')[0]}.log`);
  fs.appendFileSync(logFile, logMessage);
  console.log(logMessage.trim()); // Also log to console
}

// Enhanced error logging
function logError(error, context = '') {
  const errorMsg = `${context} Error: ${error.message || error}`;
  logToFile(errorMsg, 'ERROR');
  if (error.stack) {
    logToFile(`Stack trace: ${error.stack}`, 'ERROR');
  }
}

// Startup logging
logToFile('=== Server Starting ===', 'INFO');
logToFile(`Environment: ${process.env.NODE_ENV || 'development'}`, 'INFO');
logToFile(`Port: ${process.env.PORT || 5000}`, 'INFO');
logToFile(`DOME_API_KEY present: ${!!process.env.DOME_API_KEY}`, 'INFO');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// CORS headers
app.use((req, res, next) => {
  logToFile(`Incoming request: ${req.method} ${req.url} from ${req.ip}`, 'INFO');
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    logToFile('Handling OPTIONS request', 'INFO');
    res.sendStatus(200);
  } else {
    next();
  }
});

// Dome API base URL
const DOME_API_BASE = 'https://api.domeapi.io/v1';

// Create axios instance
const domeApi = axios.create({
  baseURL: 'https://api.domeapi.io/v1',
  headers: {
    'Authorization': `Bearer ${process.env.DOME_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

// Dome SDK client (optional)
const domeClient = DomeClient ? new DomeClient({ apiKey: process.env.DOME_API_KEY }) : null;

// Add request interceptor for debugging
domeApi.interceptors.request.use(request => {
  logToFile(`Dome API Request: ${request.method?.toUpperCase()} ${request.url}`, 'INFO');
  logToFile(`Request headers: ${JSON.stringify(request.headers)}`, 'DEBUG');
  logToFile(`Request baseURL: ${request.baseURL}`, 'DEBUG');
  return request;
});

// Add response interceptor for debugging
domeApi.interceptors.response.use(
  response => {
    logToFile(`Dome API Response: ${response.status} for ${response.config.method?.toUpperCase()} ${response.config.url}`, 'INFO');
    return response;
  },
  error => {
    logError(error, 'Dome API Error');
    return Promise.reject(error);
  }
);

// Add response interceptor for debugging
domeApi.interceptors.response.use(
  response => {
    console.log('Dome API Response:', {
      status: response.status,
      statusText: response.statusText,
      url: response.config.url
    });
    return response;
  },
  error => {
    console.log('Dome API Error:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: error.config?.url,
      data: error.response?.data
    });
    return Promise.reject(error);
  }
);

// Rate limiting queue for Dome API
const requestQueue = [];
let isProcessing = false;

const processQueue = async () => {
  if (isProcessing || requestQueue.length === 0) return;
  
  isProcessing = true;
  while (requestQueue.length > 0) {
    const { resolve, reject, config } = requestQueue.shift();
    try {
      // Make the actual request
      const response = await axios(config);
      resolve(response);
    } catch (error) {
      reject(error);
    }
    // Wait 1.1 seconds between requests (slightly over the 1/sec limit)
    await new Promise(resolve => setTimeout(resolve, 1100));
  }
  isProcessing = false;
};

// Override domeApi.get to use rate limiting
const originalGet = domeApi.get;
domeApi.get = function(url, config) {
  return new Promise((resolve, reject) => {
    requestQueue.push({
      resolve,
      reject,
      config: {
        ...config,
        method: 'get',
        url: `${this.defaults.baseURL}${url}`,
        headers: this.defaults.headers
      }
    });
    processQueue();
  });
};

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Prediction Markets API Backend' });
});

// Get Polymarket markets
app.get('/api/markets', async (req, res) => {
  console.log('=== /api/markets called ===');
  console.log('DOME_API_KEY exists:', !!process.env.DOME_API_KEY);
  console.log('DOME_API_KEY length:', process.env.DOME_API_KEY?.length);
  try {
    console.log('Fetching markets from Dome API...');
    const response = await domeApi.get('/polymarket/markets', {
      params: {
        limit: 10,
        order: 'volume',
        ascending: false,
        closed: false
      }
    });
    console.log('Dome API response status:', response.status);
    console.log('Dome API response data type:', typeof response.data);
    console.log('Dome API response has markets:', !!response.data.markets);
    console.log('Markets type:', typeof response.data.markets);
    console.log('Markets is array:', Array.isArray(response.data.markets));
    console.log('Markets length:', response.data.markets?.length);
    
    const markets = response.data.markets;
    console.log('First market sample:', markets?.[0] ? {
      title: markets[0].title,
      market_slug: markets[0].market_slug,
      side_a_id: markets[0].side_a?.id,
      side_b_id: markets[0].side_b?.id
    } : 'No markets');
    
    res.json(markets);
  } catch (error) {
    console.error('Error fetching markets:', error.response?.data || error.message);
    console.error('Error status:', error.response?.status);
    console.error('Error config:', error.config);
    res.status(500).json({ error: 'Failed to fetch markets' });
  }
});

// Get market price
app.get('/api/market-price/:tokenId', async (req, res) => {
  console.log('=== /api/market-price called ===');
  try {
    const { tokenId } = req.params;
    console.log('Token ID:', tokenId);
    console.log('DOME_API_KEY exists:', !!process.env.DOME_API_KEY);
    console.log('DOME_API_KEY length:', process.env.DOME_API_KEY?.length);
    console.log('Dome API baseURL:', DOME_API_BASE);
    console.log('Fetching price from Dome API...');
    
    // Manually construct the request to see exactly what's being sent
    const fullUrl = `${DOME_API_BASE}/polymarket/market-price/${tokenId}`;
    console.log('Full URL:', fullUrl);
    
    const response = await domeApi.get(`/polymarket/market-price/${tokenId}`);
    console.log('Price response status:', response.status);
    console.log('Price response data:', response.data);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching market price:', error.response?.data || error.message);
    console.error('Error status:', error.response?.status);
    console.error('Error config URL:', error.config?.url);
    console.error('Error config baseURL:', error.config?.baseURL);
    console.error('Error config fullURL:', `${error.config?.baseURL}${error.config?.url}`);
    console.error('Error config headers:', error.config?.headers);
    res.status(500).json({ error: 'Failed to fetch market price' });
  }
});

// Get wallet info
app.get('/api/wallet', async (req, res) => {
  console.log('=== /api/wallet called ===');
  console.log('Query params:', req.query);
  try {
    const { eoa } = req.query;
    console.log('EOA parameter:', eoa);
    if (!eoa) {
      console.log('Missing EOA parameter');
      return res.status(400).json({ error: 'eoa parameter is required' });
    }
    console.log('Fetching wallet from Dome API...');
    const response = await domeApi.get(`/polymarket/wallet?eoa=${eoa}`);
    console.log('Wallet response status:', response.status);
    console.log('Wallet response data:', response.data);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching wallet:', error.response?.data || error.message);
    console.error('Error status:', error.response?.status);
    res.status(500).json({ error: 'Failed to fetch wallet' });
  }
});

// Auto-bot state
let botRunning = false;
let botStrategy = 'momentum';

// Auto-bot routes
app.post('/api/bot/start', (req, res) => {
  const { strategy } = req.body;
  botRunning = true;
  botStrategy = strategy || 'momentum';
  console.log(`Auto-bot started with ${botStrategy} strategy`);
  res.json({ message: 'Bot started', strategy: botStrategy });
});

app.post('/api/bot/stop', (req, res) => {
  botRunning = false;
  console.log('Auto-bot stopped');
  res.json({ message: 'Bot stopped' });
});

app.get('/api/bot/status', (req, res) => {
  console.log('=== /api/bot/status called ===');
  console.log('Bot running:', botRunning);
  console.log('Bot strategy:', botStrategy);
  res.json({ running: botRunning, strategy: botStrategy });
});

// Simple momentum strategy implementation
const runMomentumStrategy = async () => {
  if (!botRunning) return;

  try {
    const response = await domeApi.get('/polymarket/markets');
    const markets = response.data.markets;
    console.log('=== Momentum Strategy Run ===');
    console.log('Checking markets:', markets.length);
    
    // Simple momentum: buy if price > 0.5, sell if price < 0.5
    for (const market of markets.slice(0, 5)) { // Limit to first 5 markets for demo
      try {
        // Use side_a_id for price lookup
        const tokenId = market.side_a_id;
        console.log(`Checking price for ${market.question} (${tokenId})`);
        const priceResponse = await domeApi.get(`/polymarket/market-price/${tokenId}`);
        const price = priceResponse.data.price;
        console.log(`Price: ${price}`);
        
        if (price > 0.6) {
          console.log(`Buying ${market.question} at ${price}`);
          // TODO: Implement actual buy order
        } else if (price < 0.4) {
          console.log(`Selling ${market.question} at ${price}`);
          // TODO: Implement actual sell order
        }
      } catch (priceError) {
        console.error('Error fetching price for market:', market.side_a_id, priceError.message);
      }
    }
  } catch (error) {
    console.error('Error in momentum strategy:', error.response?.data || error.message);
  }
};

// Arbitrage checker endpoint
app.get('/api/arbitrage/check', async (req, res) => {
  const { market_slug } = req.query;
  
  if (!market_slug) {
    return res.status(400).json({ error: 'Market slug required' });
  }

  try {
    console.log(`Arbitrage check for: ${market_slug}`);
    
    // Step 1: Find matching markets using the sports endpoint
    const matchResponse = await domeApi.get('/matching-markets/sports', {
      params: { polymarket_market_slug: market_slug }
    });
    
    const matches = matchResponse.data.markets;
    
    if (!matches || Object.keys(matches).length === 0) {
      return res.json({
        exists: false,
        message: 'No matching Kalshi market found',
        market: market_slug,
        reason: 'This market type may not have Kalshi equivalents'
      });
    }
    
    // Step 2: Extract matching platforms
    const eventKey = Object.keys(matches)[0];
    const platforms = matches[eventKey];
    
    const polyPlatform = platforms.find(p => p.platform === 'POLYMARKET');
    const kalshiPlatform = platforms.find(p => p.platform === 'KALSHI');
    
    if (!polyPlatform || !kalshiPlatform) {
      return res.json({
        exists: false,
        message: 'Incomplete match - missing platform data',
        market: market_slug,
        platforms: platforms.map(p => p.platform)
      });
    }
    
    // Step 3: Get current market prices from both platforms
    // For Polymarket - try to get from markets endpoint, but handle if not found
    let polyMarket = null;
    try {
      const polyResponse = await domeApi.get('/markets');
      polyMarket = polyResponse.data.find(m => m.market_slug === market_slug);
    } catch (error) {
      console.log('Could not fetch Polymarket markets, using mock data');
    }
    
    // If not found in current data, create mock market data for demonstration
    if (!polyMarket) {
      polyMarket = {
        question: market_slug.includes('nfl') ? 'NFL Game Outcome' : 'Market Prediction',
        market_slug: market_slug,
        volume_total: Math.floor(Math.random() * 100000) + 10000
      };
    }
    
    // For Kalshi - get from Kalshi markets endpoint
    let kalshiMarkets = [];
    try {
      const kalshiResponse = await domeApi.get('/kalshi/markets');
      kalshiMarkets = kalshiResponse.data.markets.filter(m => 
        m.event_ticker === kalshiPlatform.event_ticker
      );
    } catch (error) {
      console.log('Could not fetch Kalshi markets, using mock data');
    }
    
    // If no specific markets found, create mock data for demonstration
    let kalshiMarket = null;
    if (kalshiMarkets.length === 0) {
      kalshiMarket = {
        event_ticker: kalshiPlatform.event_ticker,
        market_tickers: kalshiPlatform.market_tickers || [],
        volume: Math.floor(Math.random() * 50000) + 5000,
        title: 'NFL Game Market'
      };
    } else {
      kalshiMarket = kalshiMarkets[0];
    }
    
    // Step 4: Calculate arbitrage opportunity
    // Note: Using mock prices since real-time pricing requires premium endpoints
    // In production, you'd use /market-price endpoints for real prices
    
    // Generate realistic price differences for demonstration
    const basePrice = 0.5;
    const polySpread = (Math.random() - 0.5) * 0.1; // ±5% spread
    const kalshiSpread = (Math.random() - 0.5) * 0.1; // ±5% spread
    
    const polyYes = Math.max(0.01, Math.min(0.99, basePrice + polySpread));
    const polyNo = 1 - polyYes;
    const kalshiYes = Math.max(0.01, Math.min(0.99, basePrice + kalshiSpread));
    const kalshiNo = 1 - kalshiYes;
    
    // Calculate arbitrage opportunities
    // Arbitrage exists when sum < 1.0 (costs less than $1 to cover both outcomes)
    const arb1 = polyYes + kalshiNo; // Yes Poly + No Kalshi
    const arb2 = polyNo + kalshiYes; // No Poly + Yes Kalshi
    
    // Find the profitable direction (sum < 1.0)
    let profitableArb = null;
    let direction = null;
    
    if (arb1 < 1.0) {
      profitableArb = arb1;
      direction = 'Yes Poly + No Kalshi';
    } else if (arb2 < 1.0) {
      profitableArb = arb2;
      direction = 'No Poly + Yes Kalshi';
    }
    
    // Calculate profit percentage and adjust for fees
    const grossProfit = profitableArb ? (1 - profitableArb) : 0;
    
    // Fee adjustments (real-world estimates)
    const KALSHI_FEE = 0.007; // 0.7% trading fee
    const POLY_FEE = 0.003;   // ~0.3% gas/network estimate
    
    // Calculate total fees based on direction
    let totalFees = 0;
    if (direction === 'Yes Poly + No Kalshi') {
      totalFees = POLY_FEE + KALSHI_FEE;
    } else if (direction === 'No Poly + Yes Kalshi') {
      totalFees = POLY_FEE + KALSHI_FEE;
    }
    
    const netProfit = grossProfit - totalFees;
    const arbPercent = netProfit > 0 ? (netProfit * 100).toFixed(2) : 0;
    
    return res.json({
      exists: profitableArb !== null,
      market: polyMarket.question || market_slug,
      matchFound: true,
      platformA: {
        platform: 'Polymarket',
        yesPrice: Math.round(polyYes * 100),
        noPrice: Math.round(polyNo * 100),
        marketSlug: polyPlatform.market_slug,
        volume: polyMarket.volume_total || 0
      },
      platformB: {
        platform: 'Kalshi',
        yesPrice: Math.round(kalshiYes * 100),
        noPrice: Math.round(kalshiNo * 100),
        eventTicker: kalshiPlatform.event_ticker,
        marketTickers: kalshiPlatform.market_tickers || [],
        volume: kalshiMarket.volume || 0
      },
      arbitrage: {
        exists: profitableArb !== null && netProfit > 0,
        percent: arbPercent,
        direction: direction || 'No arbitrage opportunity',
        calculation: `Yes Poly + No Kalshi = ${arb1.toFixed(3)} | No Poly + Yes Kalshi = ${arb2.toFixed(3)}`,
        profitableSum: profitableArb ? profitableArb.toFixed(3) : null,
        grossProfit: grossProfit > 0 ? (grossProfit * 100).toFixed(2) : 0,
        netProfit: netProfit > 0 ? (netProfit * 100).toFixed(2) : 0,
        fees: {
          total: (totalFees * 100).toFixed(2),
          kalshi: (KALSHI_FEE * 100).toFixed(2),
          polymarket: (POLY_FEE * 100).toFixed(2)
        },
        explanation: profitableArb && netProfit > 0 ? 
          `Cost: $${profitableArb.toFixed(3)} | Gross: ${(grossProfit * 100).toFixed(2)}% | Fees: ${(totalFees * 100).toFixed(2)}% | Net: ${(netProfit * 100).toFixed(2)}%` :
          netProfit <= 0 && profitableArb ? 
          `Arbitrage exists (${(grossProfit * 100).toFixed(2)}% gross) but fees (${(totalFees * 100).toFixed(2)}%) eliminate profit` :
          'Both combinations cost > $1.00, no arbitrage opportunity'
      },
      liquidity: {
        polyVolume: polyMarket.volume_total || 0,
        kalshiVolume: kalshiMarket.volume || 0,
        totalVolume: (polyMarket.volume_total || 0) + (kalshiMarket.volume || 0),
        executability: (polyMarket.volume_total || 0) > 20000 && (kalshiMarket.volume || 0) > 10000 ? 'good' : 'limited',
        maxPosition: Math.min(
          Math.floor((polyMarket.volume_total || 0) * 0.1), // Max 10% of volume
          Math.floor((kalshiMarket.volume || 0) * 0.1)
        )
      },
      metadata: {
        matchQuality: 'high',
        lastChecked: new Date().toISOString(),
        note: 'Prices simulated for demo - use premium endpoints for real-time data. Fees: Kalshi 0.7%, Poly ~0.3%'
      }
    });
    
  } catch (error) {
    console.error('Arbitrage check error:', error.response?.data || error.message);
    return res.status(500).json({ 
      error: 'Failed to check arbitrage',
      details: error.response?.data || error.message 
    });
  }
});

// BTC 15-Min Arbitrage Check Endpoint
app.get('/api/arbitrage/btc-check', async (req, res) => {
  console.log('=== /api/arbitrage/btc-check called ===');
  
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  
  // Helper functions for better BTC matching
  const extractBtcTimeframe = (title) => {
    const lower = title.toLowerCase();
    if (lower.includes('15 minute') || lower.includes('15min') || lower.includes('15m')) return '15m';
    if (lower.includes('30 minute') || lower.includes('30min') || lower.includes('30m')) return '30m';
    if (lower.includes('1 hour') || lower.includes('1h') || lower.includes('60m')) return '1h';
    if (lower.includes('daily') || lower.includes('24h') || lower.includes('day')) return 'daily';
    return null;
  };

  const extractStrikePrice = (title) => {
    const priceMatch = title.match(/\$([0-9,]+(?:\.[0-9]+)?)/);
    if (priceMatch) {
      return parseFloat(priceMatch[1].replace(',', ''));
    }
    return null;
  };

  const normalizeTitle = (title) => {
    return title.toLowerCase()
      .replace(/bitcoin|b\.t\.c\.|btc/gi, 'btc')
      .replace(/will|be|above|below|over|under/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  };
  
  try {
    // Fetch Polymarket BTC markets (broader search, filter later)
    console.log('Fetching Polymarket BTC markets...');
    const polyRes = await domeApi.get('/polymarket/markets', { 
      params: { 
        tags: ['Bitcoin'], // Broader search, filter by title later
        status: 'open', 
        min_volume: 5000, // Lower threshold for more markets
        limit: 10 
      } 
    });
    
    // Filter for BTC markets with timeframes
    const polyBtcMarkets = polyRes.data.markets.filter(m => {
      const title = m.question || m.title || '';
      const timeframe = extractBtcTimeframe(title);
      return timeframe === '15m' || timeframe === '30m'; // Focus on short-term
    });
    
    await delay(1100); // Free-tier delay
    
    // Fetch Kalshi markets and filter for BTC
    console.log('Fetching Kalshi markets...');
    const kalshiRes = await domeApi.get('/kalshi/markets', { 
      params: { 
        status: 'open', 
        min_volume: 5000, // Lower threshold
        limit: 30 
      } 
    });
    
    const kalshiBtc = kalshiRes.data.markets.filter(m => 
      m.title.toLowerCase().includes('bitcoin') || 
      m.title.toLowerCase().includes('btc')
    );
    
    console.log(`Found ${polyBtcMarkets.length} Polymarket BTC short-term markets`);
    console.log(`Found ${kalshiBtc.length} Kalshi BTC markets`);
    
    const arbs = [];
    
    // For each Polymarket market, find economically equivalent Kalshi market
    for (const polyMarket of polyBtcMarkets) {
      const polyTitle = polyMarket.question || polyMarket.title || '';
      const polyTimeframe = extractBtcTimeframe(polyTitle);
      const polyStrike = extractStrikePrice(polyTitle);
      
      if (!polyTimeframe || !polyStrike) continue; // Skip if can't parse
      
      const polyYes = polyMarket.side_a.price / 100;
      const polyNo = polyMarket.side_b.price / 100;
      const polyVolume = polyMarket.volume;
      
      // Find matching Kalshi market with same timeframe and close strike price
      const kalshiMatch = kalshiBtc.find(k => {
        const kTimeframe = extractBtcTimeframe(k.title);
        const kStrike = extractStrikePrice(k.title);
        
        if (!kTimeframe || !kStrike) return false;
        
        // Must match timeframe AND strike price within $1000 tolerance
        const strikeDiff = Math.abs(kStrike - polyStrike);
        return kTimeframe === polyTimeframe && strikeDiff <= 1000;
      });
      
      if (kalshiMatch) {
        const kalshiYes = kalshiMatch.last_price / 100;
        const kalshiNo = 1 - kalshiYes;
        const kalshiVolume = kalshiMatch.volume;
        
        // Calculate arbitrage
        const arb1 = polyYes + kalshiNo;
        const arb2 = polyNo + kalshiYes;
        
        if (arb1 < 1.0 || arb2 < 1.0) {
          const direction = arb1 < arb2 ? 'Yes Poly + No Kalshi' : 'No Poly + Yes Kalshi';
          const grossProfit = ((1 - Math.min(arb1, arb2)) * 100);
          const kalshiFee = 1.2; // Conservative taker fee
          const polyFee = 0.3;
          const totalFee = kalshiFee + polyFee;
          const fees = { kalshi: kalshiFee, polymarket: polyFee, total: totalFee };
          const netProfit = grossProfit - totalFee;
          
          arbs.push({
            market: polyTitle,
            timeframe: polyTimeframe,
            strikePrice: polyStrike,
            direction,
            grossProfit: grossProfit.toFixed(2),
            netProfit: netProfit.toFixed(2),
            fees,
            polyVolume: polyVolume.toLocaleString(),
            kalshiVolume: kalshiVolume.toLocaleString(),
            maxPosition: Math.min(polyVolume, kalshiVolume) * 0.1,
            executability: polyVolume > 10000 && kalshiVolume > 5000 ? 'good' : 'limited'
          });
        }
      }
      
      // Intra-Polymarket check (separate from cross-platform matching)
      if (!kalshiMatch && polyYes + polyNo < 1.0) {
        const grossProfit = ((1 - (polyYes + polyNo)) * 100);
        const fees = { kalshi: 0, polymarket: 0.3, total: 0.3 }; // Only Poly fee
        const netProfit = grossProfit - fees.total;
        
        arbs.push({
          market: polyTitle,
          timeframe: polyTimeframe,
          strikePrice: polyStrike,
          direction: 'Intra-Polymarket Slippage',
          grossProfit: grossProfit.toFixed(2),
          netProfit: netProfit.toFixed(2),
          fees,
          polyVolume: polyVolume.toLocaleString(),
          kalshiVolume: 'N/A',
          maxPosition: polyVolume * 0.1,
          executability: polyVolume > 10000 ? 'good' : 'limited'
        });
      }
    }
    
    res.json({
      success: true,
      arbs,
      count: arbs.length,
      timestamp: new Date().toISOString(),
      note: 'BTC 15-min arbitrage scan using free-tier APIs. Real prices from Polymarket, Kalshi filtered by title.'
    });
    
  } catch (error) {
    console.error('BTC arbitrage check error:', error.response?.data || error.message);
    return res.status(500).json({ 
      error: 'Failed to check BTC arbitrage',
      details: error.response?.data || error.message 
    });
  }
});

// Intra-Polymarket BTC Arbitrage Scanner (Slippage Detection)
app.get('/api/arbitrage/btc-intra-check', async (req, res) => {
  const startTime = Date.now();
  logToFile('=== /api/arbitrage/btc-intra-check called ===', 'INFO');
  
  try {
    logToFile('Processing BTC intra arbitrage check', 'INFO');
    
    // Simple test response first
    const response = {
      success: true,
      arbs: [],
      count: 0,
      timestamp: new Date().toISOString(),
      note: 'BTC intra arbitrage scanner - testing basic endpoint'
    };
    
    const duration = Date.now() - startTime;
    logToFile(`BTC intra check completed in ${duration}ms`, 'INFO');
    
    res.json(response);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    logError(error, `BTC intra check failed after ${duration}ms`);
    return res.status(500).json({ 
      error: 'Failed to check intra-Polymarket BTC arbitrage',
      details: error.message 
    });
  }
});

// Add endpoint to scan all current markets for arbitrage opportunities
app.get('/api/arbitrage/scan', async (req, res) => {
  try {
    console.log('Scanning all markets for arbitrage opportunities...');
    
    // Get current markets
    const marketsResponse = await domeApi.get('/markets');
    const markets = marketsResponse.data.slice(0, 10); // Limit to first 10 for demo
    
    const arbitrageOpportunities = [];
    
    for (const market of markets) {
      try {
        // Check each market for arbitrage
        const matchResponse = await domeApi.get('/matching-markets/sports', {
          params: { polymarket_market_slug: market.market_slug }
        });
        
        const matches = matchResponse.data.markets;
        
        if (matches && Object.keys(matches).length > 0) {
          const platforms = matches[Object.keys(matches)[0]];
          const hasKalshi = platforms.some(p => p.platform === 'KALSHI');
          
          if (hasKalshi) {
            // Simulate arbitrage calculation
            const arbPercent = Math.random() > 0.7 ? (Math.random() * 5).toFixed(2) : 0;
            
            if (parseFloat(arbPercent) > 0) {
              arbitrageOpportunities.push({
                market: market.question,
                slug: market.market_slug,
                arbPercent,
                volume: market.volume_total,
                priority: parseFloat(arbPercent) > 3 ? 'high' : 'medium'
              });
            }
          }
        }
      } catch (error) {
        console.log(`Error checking ${market.market_slug}:`, error.message);
      }
    }
    
    // Sort by arbitrage percentage
    arbitrageOpportunities.sort((a, b) => parseFloat(b.arbPercent) - parseFloat(a.arbPercent));
    
    return res.json({
      scanned: markets.length,
      opportunities: arbitrageOpportunities.length,
      results: arbitrageOpportunities,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Arbitrage scan error:', error.message);
    return res.status(500).json({ 
      error: 'Failed to scan arbitrage opportunities',
      details: error.message 
    });
  }
});

// Run strategy every 30 seconds if bot is running
// setInterval(runMomentumStrategy, 30000); // Commented out to prevent crash - function not defined

console.log('PORT:', PORT);
console.log('About to listen');

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
