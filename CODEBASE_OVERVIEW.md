# Prediction Markets Dashboard - Complete Codebase Overview

## Project Overview

The Prediction Markets Dashboard is a real-time web application that displays Polymarket prediction markets with a focus on cryptocurrency markets and arbitrage opportunities. It provides live price feeds, market analysis, and automated scanning for arbitrage opportunities across BTC-related markets.

## Architecture Overview

### Tech Stack
- **Frontend**: React.js with CSS styling
- **Backend**: Node.js/Express.js
- **Database**: None (real-time API integration)
- **APIs**: Dome API (Polymarket data provider)
- **Deployment**: Netlify-ready

### Directory Structure
```
prediction-markets-dashboard/
├── backend/                    # Node.js Express server
│   ├── index.js               # Main server file with all endpoints
│   └── package.json           # Backend dependencies
├── frontend/                   # React application
│   ├── src/
│   │   ├── components/        # React components
│   │   │   ├── MarketList.jsx # Main markets display
│   │   │   ├── BtcIntraArbScanner.jsx # BTC arbitrage scanner
│   │   │   └── MarketCard.jsx # Individual market cards
│   │   ├── App.js             # Main React app
│   │   ├── AppStyles.css      # Global CSS styles
│   │   └── index.js           # React entry point
│   └── package.json           # Frontend dependencies
├── docs/                      # Documentation
├── .windsurf/workflows/       # IDE workflows
└── README.md                  # Project documentation
```

## Backend API (Node.js/Express)

### Server Configuration
- **Port**: 5000
- **CORS**: Enabled for frontend development
- **Rate Limiting**: Dome API calls are queued and paced (free-tier friendly). The backend also propagates Dome rate-limit metadata to the frontend so the UI can enforce a global cooldown.
- **Error Handling**: Basic try/catch blocks

### API Endpoints

#### `/api/markets` (GET)
**Purpose**: Fetch main markets list
**Parameters**:
- `status`: "open" (default)
- `limit`: number of markets to return (backend defaults to 10)
- `tags[]` / `tags[0]`, `tags[1]`, ...: optional tag filtering (forwarded to Dome)

**Response**:
```json
{
  "markets": [
    {
      "title": "Market Title",
      "market_slug": "market-slug",
      "volume_total": 123.45,
      "start_time": 1640995200,
      "end_time": 1640995200,
      "side_a": {"label": "Yes", "id": "..."},
      "side_b": {"label": "No", "id": "..."},
      "status": "open"
    }
  ],
  "rateLimit": {
    "limit": 10,
    "remaining": 7,
    "reset": 1766767691
  }
}
```

Notes:
- Backend may serve cached markets for up to ~30 seconds for identical query params.
- `rateLimit.reset` is epoch seconds from Dome response headers.

#### `/api/market-prices` (GET)
**Purpose**: Batch fetch prices for the displayed markets
**Parameters**:
- `tokenIds`: comma-separated token IDs

**Response**:
```json
{
  "prices": { "<tokenId>": 0.42 },
  "timestamp": "2025-12-26T...Z",
  "successCount": 10,
  "totalCount": 10,
  "rateLimit": { "limit": 10, "remaining": 7, "reset": 1766767691 }
}
```

#### `/api/arbitrage/btc-intra-check` (GET)
**Purpose**: Scan for BTC intra-market arbitrage opportunities
**Response**:
```json
{
  "success": true,
  "arbs": [...],
  "count": 0,
  "marketsScanned": 2,
  "marketsSkipped": 16,
  "totalBtcMarkets": 18,
  "marketTypes": {
    "yes_no": 2,
    "up_down": 16,
    "other": 0
  }
}
```

#### `/api/debug/markets` (GET)
**Purpose**: Debug endpoint showing BTC market filtering results
**Response**:
```json
{
  "totalMarkets": 50,
  "sampleMarkets": [...],
  "btcMarkets": [...],
}
```

### Dependencies
```json
{
  "express": "^4.18.0",
  "cors": "^2.8.5",
  "axios": "^1.6.0",
  "dotenv": "^16.0.0"
}
```

## Frontend (React)

### Components

#### MarketList.jsx
**Purpose**: Main component displaying all markets
**Features**:
- Fetches markets from backend
- Displays market cards in 4-column grid
- Shows volume, status, creation/expiration dates
- Fetches batch prices for the currently displayed markets
- Auto-refreshes prices on a slower interval and applies a backoff after errors
- Highlights price changes

#### BtcIntraArbScanner.jsx
**Purpose**: BTC arbitrage scanner interface
**Features**:
- Triggers BTC scanning
- Shows scan results and statistics
- Displays arbitrage opportunities found
- Shows "X checked" status (now accurate)

#### MarketCard.jsx
**Purpose**: Individual market display component
**Layout**:
```
[Title]
[Created: Date] [Market Slug]
[Vol: X] [Status] [Exp: Date]
[Yes: $X.XX] [No: $X.XX]
```

### Styling (AppStyles.css)
- **Grid Layout**: 4 columns for market cards
- **Responsive**: Adapts to smaller screens
- **Theme**: Dark/light mode support
- **Animations**: Price change highlights

### Dependencies
```json
{
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "axios": "^1.6.0",
  "react-scripts": "5.0.1"
}
```

## Data Flow

### Market Data Flow
1. **Frontend** → Requests markets via `/api/markets`
2. **Backend** → Calls Dome API `/polymarket/markets`
3. **Dome API** → Returns markets in creation date order
4. **Backend** → Returns markets to frontend (with `rateLimit` metadata)
5. **Frontend** → Displays markets in responsive grid

### Rate Limit Handling (End-to-End)
1. Backend extracts Dome headers (`x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`).
2. Backend includes a `rateLimit` object in responses.
3. Frontend enforces a global cooldown until `rateLimit.reset` and blocks category switching during cooldown.

### BTC Scanner Flow
1. **Frontend** → Triggers BTC scan
2. **Backend** → Fetches all markets from Dome API
3. **Backend** → Filters BTC markets by keywords
4. **Backend** → Attempts arbitrage check on each BTC market
5. **Backend** → Returns results with detailed statistics

## Key Features

### Core Features
- **Real-time Market Display**: Live prices for prediction markets
- **BTC Arbitrage Scanner**: Automated intra-market arbitrage detection
- **Responsive Design**: Works on desktop and mobile
- **Auto-refresh**: Batch price updates on an interval (default 60 seconds)

### Recent Enhancements
- **Market Type Detection**: Handles Yes/No vs Up/Down markets
- **Accurate Counting**: Shows markets checked vs skipped
- **Enhanced Logging**: Detailed backend logging for debugging
- **Improved UI**: 4-column grid, better date formatting

### Known Limitations
- **Sorting**: Dome API doesn't support volume/price sorting
- **Up/Down Markets**: Currently skipped in arbitrage scanning
- **Rate Limits**: Dome free-tier limits apply; UI enforces a global cooldown based on Dome `x-ratelimit-reset`.
- **Caching**: `/api/markets` has a short TTL cache keyed by query params.

## API Integration (Dome API)

### Base URL: `https://api.domeapi.io/v1`

### Available Endpoints Used
- `/polymarket/markets` - Get markets with filtering
- `/polymarket/market-price/{token_id}` - Get individual market prices

### Authentication
- API Key via `DOME_API_KEY` environment variable
- Header: `Authorization: Bearer {API_KEY}`

### Rate Limits
- The backend defaults `/api/markets` to `limit=10` for responsiveness.
- Backend scanners may request higher limits (for example, `/api/arbitrage/btc-intra-check` requests 100).

## Development Setup

### Backend Setup
```bash
cd backend
npm install
cp .env.example .env  # Add DOME_API_KEY
npm start
```

### Frontend Setup
```bash
cd frontend
npm install
npm start
```

### Environment Variables
```bash
# backend/.env
DOME_API_KEY=your_api_key_here
PORT=5000
```

## Deployment

### Frontend (Netlify-ready)
- Static build: `npm run build`
- No backend required for basic functionality
- Can be deployed to Netlify, Vercel, etc.

### Backend
- Requires Node.js hosting (Heroku, Railway, etc.)
- Environment variables for API key
- CORS configured for frontend domains

## Roadmap & Future Development

### Phase 1: Enhanced Market Support (Short-term)
- [ ] Support Up/Down market arbitrage scanning
- [ ] Add market price caching for better performance
- [ ] Implement rate limiting to prevent API abuse

### Phase 2: Advanced Features (Medium-term)
- [ ] Multi-market arbitrage detection (across different markets)
- [ ] Historical price charts and analysis
- [ ] Market trend analysis and alerts
- [ ] User portfolio tracking

### Phase 3: Platform Expansion (Long-term)
- [ ] Support for Kalshi markets (via Dome API)
- [ ] Multi-exchange arbitrage (Polymarket + Kalshi)
- [ ] Mobile app development
- [ ] Advanced analytics dashboard

### Phase 4: Enterprise Features (Future)
- [ ] Real-time price alerts and notifications
- [ ] Automated trading strategies
- [ ] Risk management tools
- [ ] API for third-party integrations

## Current Issues & Limitations

### Critical Issues
1. **Up/Down Market Support**: BTC scanner skips 16/18 markets due to missing token IDs
2. **API Sorting**: No volume-based sorting available from Dome API
3. **Rate Limiting**: No protection against API abuse

### Technical Debt
- Error handling could be more robust
- No unit tests implemented
- Code comments could be more comprehensive
- Environment variable validation missing

### Performance Concerns
- No caching implemented for market data
- Frontend re-renders entire market list on updates
- No lazy loading for large market lists

## Testing Strategy

### Manual Testing
- Market loading and display
- BTC scanner functionality
- Price update highlighting
- Responsive design across devices

### API Testing
```bash
# Test markets endpoint
curl "http://localhost:5000/api/markets"

# Test BTC scanner
curl "http://localhost:5000/api/arbitrage/btc-intra-check"

# Test debug endpoint
curl "http://localhost:5000/api/debug/markets"
```

### Browser Testing
- Chrome/Firefox/Safari compatibility
- Mobile responsiveness
- Network error handling

## Security Considerations

### API Key Security
- Stored in environment variables
- Not exposed to frontend
- Backend-only API calls

### CORS Configuration
- Configured for development
- Needs updating for production domains

### Data Validation
- Basic input validation on API responses
- No user input validation (no forms)

## Monitoring & Logging

### Current Logging
- Backend console logging with request IDs
- BTC scanner detailed market analysis logging
- Error logging for failed API calls

### Future Monitoring
- [ ] Performance metrics
- [ ] Error tracking (Sentry, etc.)
- [ ] API usage analytics

## Contributing Guidelines

### Code Style
- React functional components with hooks
- ES6+ JavaScript features
- Consistent async/await usage
- JSDoc comments for complex functions

### Git Workflow
- Feature branches from main
- Pull requests for all changes
- Code review required
- Automated testing (future)

## Documentation

### Current Documentation
- `README.md` - Basic project overview
- `DOME_API_PARAMETERS_GUIDE.md` - API usage guide
- `BTC_SCANNER_ISSUE_ANALYSIS.md` - BTC scanner technical details
- `ERROR_LOGGING_GUIDE.md` - Error handling patterns
- `.windsurf/workflows/` - IDE automation workflows

### Documentation Needs
- [ ] API endpoint documentation (Swagger/OpenAPI)
- [ ] Component documentation
- [ ] Deployment guides
- [ ] Troubleshooting guides

## License & Attribution

### Open Source
- MIT License (assumed)
- Dome API integration
- React/Axios dependencies

### Third-party Services
- **Dome API**: Polymarket data provider
- **Polymarket**: Underlying prediction market platform
- **Chainlink**: Price feed data source

---

**Last Updated**: December 25, 2025
**Version**: 1.0.0
**Status**: Active Development
**Repository**: prediction-markets-dashboard
