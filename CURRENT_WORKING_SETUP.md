# Current Working Setup Documentation

## Overview
Prediction Markets Dashboard with Node.js/Express backend and React frontend, integrating with Dome API for Polymarket data. Features real-time price updates, BTC arbitrage scanning, modern responsive UI, and comprehensive market data display.

## Architecture

### Backend (Port 5000)
- **Framework**: Express.js
- **API Integration**: Dome API (https://api.domeapi.io/v1)
- **Authentication**: Bearer token via DOME_API_KEY environment variable
- **Dependencies**: express, cors, axios, dotenv
- **Rate Limiting**:
  - Backend queues and paces Dome API calls.
  - Backend extracts Dome rate-limit headers (`x-ratelimit-*`) and returns a `rateLimit` object in API responses.
  - Frontend enforces a global cooldown until `rateLimit.reset`.
- **Features**: BTC arbitrage scanner, market type detection, comprehensive logging

### Frontend (Port 3000)
- **Framework**: React
- **HTTP Client**: Axios
- **Development Server**: Standard React dev server
- **Styling**: Modern CSS with gradients, animations, responsive design
- **Real-time Updates**:
  - Markets refresh is triggered by category selection and an App-level interval.
  - Market prices are fetched via a batch endpoint with throttling/backoff.

## API Endpoints Status

### Working Endpoints (Tested via curl)
- `GET /api/markets` - Returns markets (default limit 10 unless overridden) with volume, status, creation/expiration dates
- `GET /api/market-prices` - Batch fetches market prices for displayed markets
- `GET /api/arbitrage/btc-intra-check` - Scans for BTC intra-market arbitrage opportunities
- `GET /api/debug/markets` - Debug endpoint showing BTC market filtering results

## Implemented Features

### Backend Improvements
- **Rate Limiting Queue**: Sequential Dome API calls with 1.1s delays (Free tier compliance)
- **BTC Arbitrage Scanner**: Automated scanning for BTC intra-market arbitrage opportunities
- **Market Type Detection**: Handles Yes/No vs Up/Down market structures
- **Enhanced Logging**: Detailed logging with request IDs for debugging
- **Accurate Counting**: Shows markets checked vs skipped in BTC scanner
- **Batch Price Endpoint**: `/api/market-prices` fetches multiple market prices in a single backend call

### Frontend Enhancements
- **4-Column Grid Layout**: Optimized responsive grid for market display
- **Modern UI Design**: Gradient backgrounds, glassmorphism effects, hover animations
- **Market Information Display**: Volume (trader count), status, creation/expiration dates
- **Auto-Polling**: Batch price updates on an interval (with backoff after batch errors)
- **Visual Change Indicators**: Green flicker animation for price movements
- **Responsive Design**: Adapts to different screen sizes (4xN → 3xN → 2xN → 1xN)

### User Experience Features
- **Last Updated Timestamp**: Shows when data was last refreshed
- **Price Change Animations**: 2-second green flicker effect on changed markets
- **Hover Effects**: Interactive card animations and transitions
- **Mobile Responsive**: Optimized layout for tablets and phones

## Rate Limiting & Performance

### Current Behavior
- **Rate Limiting Implemented**:
  - Backend paces Dome API calls.
  - Backend returns `rateLimit` in responses.
  - Frontend enforces a global cooldown until `rateLimit.reset`.
- **Markets list**: `/api/markets` defaults to 10 markets for responsiveness
- **BTC Scanner**: Up to 100 markets + individual price checks with pacing
- **Caching**: `/api/markets` caches responses for a short TTL (query-param keyed)

### Performance Notes
- Frontend uses the batch price endpoint and backs off after batch price errors
- BTC scanner processes markets sequentially with individual price API calls
- `/api/markets` uses a short TTL cache to reduce Dome calls

## Environment Configuration
- `.env` file contains DOME_API_KEY (40 characters)
- Backend runs on port 5000
- Frontend runs on port 3000
- CORS enabled for all origins

## Technical Implementation Details

### Frontend Components
- **App.js**: Main React app component
- **MarketList.jsx**: Displays markets in responsive grid with price polling
- **BtcIntraArbScanner.jsx**: BTC arbitrage scanner interface and controls
- **MarketCard.jsx**: Individual market display component

### CSS Features
- **Grid Layout**: CSS Grid for responsive market display
- **Animations**: Keyframe animations for price changes
- **Glassmorphism**: Backdrop-filter and transparency effects
- **Responsive Breakpoints**: 1400px, 1200px, 900px, 768px

### Data Flow
1. Initial load: Fetch markets from backend
2. Polling cycle: Fetch batch prices for displayed markets on an interval
3. Change detection: Compare with tolerance of 0.0001
4. Visual feedback: Highlight changed markets for 2 seconds
5. BTC Scanner: On-demand scanning with detailed market type analysis

### BTC Scanner Flow
1. Fetch up to 100 markets from Dome API
2. Filter for BTC-related markets (title/slug keywords)
3. Detect market types (Yes/No vs Up/Down)
4. Check Yes/No markets for arbitrage opportunities
5. Report results with accurate counting (checked vs skipped)

## WebSocket Research
- **Endpoint**: `wss://ws.domeapi.io/<API_KEY>`
- **Polymarket WebSocket (v1)**: Real-time order events and user activity tracking
- **Dome WebSocket Platform**: Supports multiple stream types (orders, trades, orderbook changes)
- **Current Implementation**: Documented but not implemented in this dashboard
- **Use Case**: Order tracking for specific wallet addresses or wildcard (Dev tier only)

## Future Enhancement Opportunities
1. **Up/Down Market Support**: Extend BTC scanner to handle Up/Down market arbitrage
2. **Backend Price Caching**: Reduce Dome API calls with intelligent caching
3. **Batch Price Endpoint**: Single API call for multiple market prices
4. **WebSocket Integration**: Real-time push updates for price changes
5. **Advanced Filtering**: User-selectable markets and update intervals
6. **Historical Data**: Price charts and trend analysis
7. **Multi-Market Arbitrage**: Cross-market arbitrage detection
8. **Portfolio Tracking**: User position monitoring and alerts

**Last Updated**: December 25, 2025
**Version**: 2.0.0
**Status**: Updated to reflect current codebase state