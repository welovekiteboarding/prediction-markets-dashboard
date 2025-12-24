# Current Working Setup Documentation

## Overview
Prediction Markets Dashboard with Node.js/Express backend and React frontend, integrating with Dome API for Polymarket data. Features real-time price updates, modern UI design, and responsive layout.

## Architecture

### Backend (Port 5000)
- **Framework**: Express.js
- **API Integration**: Dome API (https://api.domeapi.io/v1)
- **Authentication**: Bearer token via DOME_API_KEY environment variable
- **Dependencies**: express, cors, axios, dotenv
- **Rate Limiting**: Request queue system (1 req/sec for Dome API)

### Frontend (Port 3000)
- **Framework**: React
- **HTTP Client**: Axios
- **Development Server**: Standard React dev server
- **Styling**: Modern CSS with gradients, animations, responsive design
- **Real-time Updates**: Auto-polling every 20 seconds with visual change indicators

## API Endpoints Status

### Working Endpoints (Tested via curl)
- `GET /api/markets` - Returns array of market data
- `GET /api/market-price/:tokenId` - Returns price data for specific token
- `GET /api/bot/status` - Returns bot running status
- `POST /api/bot/start` - Starts trading bot
- `POST /api/bot/stop` - Stops trading bot
- `GET /api/wallet?eoa=address` - Returns wallet info (404 for non-existent addresses)

## Implemented Features

### Backend Improvements
- **Rate Limiting Queue**: Prevents Dome API 429 errors with 1.1s delays
- **Error Handling**: Comprehensive logging and response interceptors
- **Request Serialization**: Sequential processing to respect API limits

### Frontend Enhancements
- **Full Screen Layout**: 5x2 grid for optimal space utilization
- **Modern UI Design**: Gradient backgrounds, glassmorphism effects, hover animations
- **Percentage Display**: Shows Yes/No probabilities instead of raw token IDs
- **Auto-Polling**: Real-time price updates every 20 seconds
- **Incremental Fetching**: Only updates prices that have changed
- **Visual Change Indicators**: Green flicker animation for price movements
- **Responsive Design**: Adapts to different screen sizes (5x2 → 4x3 → 2xauto → 1xauto)

### User Experience Features
- **Last Updated Timestamp**: Shows when data was last refreshed
- **Price Change Animations**: 2-second green flicker effect on changed markets
- **Hover Effects**: Interactive card animations and transitions
- **Mobile Responsive**: Optimized layout for tablets and phones

## Rate Limiting & Performance

### Current Behavior
- **10 markets = 10 API calls** every 20 seconds
- **Sequential requests** due to Dome API 1/sec limit
- **Total fetch time**: ~11 seconds for all markets
- **Average rate**: 0.5 calls/sec (within limits)

### Optimization Notes
- Incremental fetching still makes all API calls but only updates UI for changed prices
- Future improvements could include backend caching or WebSocket implementation
- Dome API WebSocket available for real-time order events (not price feeds)

## Environment Configuration
- `.env` file contains DOME_API_KEY (40 characters)
- Backend runs on port 5000
- Frontend runs on port 3000
- CORS enabled for all origins
- Voice notifications enabled via localhost:8888/notify

## Technical Implementation Details

### Frontend Components
- **App.js**: Main component with market and wallet state management
- **MarketList.js**: Handles price fetching, polling, and change detection
- **Wallet.js**: Displays wallet balance information
- **AutoBot.js**: Trading bot controls

### CSS Features
- **Grid Layout**: CSS Grid for responsive market display
- **Animations**: Keyframe animations for price changes
- **Glassmorphism**: Backdrop-filter and transparency effects
- **Responsive Breakpoints**: 1400px, 1200px, 900px, 768px

### Data Flow
1. Initial load: Fetch all markets and prices
2. Polling cycle: Check each market for changes every 20 seconds
3. Change detection: Compare with tolerance of 0.0001
4. Visual feedback: Highlight changed markets for 2 seconds

## WebSocket Research
- **Endpoint**: `wss://ws.domeapi.io/<API_KEY>`
- **Purpose**: Real-time order events and user activity
- **Limitations**: Tracks specific wallet addresses, not general price feeds
- **Current Status**: Documented but not implemented

## Future Enhancement Opportunities
1. **Backend Price Caching**: Reduce Dome API calls with intelligent caching
2. **Batch Price Endpoint**: Single API call for multiple market prices
3. **WebSocket Integration**: Real-time push updates for price changes
4. **Advanced Filtering**: User-selectable markets and update intervals
5. **Historical Data**: Price charts and trend analysis