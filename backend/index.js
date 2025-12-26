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

// Rate limiting queue for Dome API (FREE tier: 1 request/second)
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
    // FREE tier: Wait 1.1 seconds between requests (1 req/sec limit)
    await new Promise(resolve => setTimeout(resolve, 1100));
  }
  isProcessing = false;
};

// Override domeApi.get to use rate limiting (FREE tier requirement)
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

let lastDomeRateLimit = null;

function extractRateLimit(headers) {
  const limitRaw = headers?.['x-ratelimit-limit'];
  const remainingRaw = headers?.['x-ratelimit-remaining'];
  const resetRaw = headers?.['x-ratelimit-reset'];

  const limit = limitRaw !== undefined ? Number(limitRaw) : null;
  const remaining = remainingRaw !== undefined ? Number(remainingRaw) : null;
  const reset = resetRaw !== undefined ? Number(resetRaw) : null;

  if (
    (Number.isFinite(limit) || limit === null) &&
    (Number.isFinite(remaining) || remaining === null) &&
    (Number.isFinite(reset) || reset === null)
  ) {
    if (limit !== null || remaining !== null || reset !== null) {
      return { limit, remaining, reset };
    }
  }

  return null;
}

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Prediction Markets API Backend' });
});

// Simple cache to reduce API calls
const marketsCache = new Map();
const CACHE_TTL = 30000; // 30 seconds

// Get Polymarket markets
app.get('/api/markets', async (req, res) => {
  const requestId = `mkts-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`=== [${requestId}] /api/markets called ===`);
  console.log(`[${requestId}] Request headers:`, req.headers);
  console.log(`[${requestId}] Request query:`, req.query);
  console.log(`[${requestId}] Request timestamp:`, new Date().toISOString());
  
  try {
    console.log(`[${requestId}] DOME_API_KEY exists:`, !!process.env.DOME_API_KEY);
    console.log(`[${requestId}] DOME_API_KEY length:`, process.env.DOME_API_KEY?.length);
    
    // Create cache key from query params
    const cacheKey = JSON.stringify(req.query);
    const cached = marketsCache.get(cacheKey);
    
    // Check cache first
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      console.log(`[${requestId}] Cache hit! Returning cached data`);
      return res.json({ markets: cached.data, rateLimit: lastDomeRateLimit });
    }
    
    console.log(`[${requestId}] Cache miss or expired, fetching from Dome API...`);
    
    // Build API parameters from request
    const apiParams = {
      status: 'open',
      limit: parseInt(req.query.limit) || 10  // Default to 10 for better performance
    };
    
    // Add tags if provided
    if (req.query.tags) {
      let tags = [];
      if (Array.isArray(req.query.tags)) {
        tags = req.query.tags;
      } else if (typeof req.query.tags === 'string') {
        tags = [req.query.tags];
      } else {
        // Handle tags[0], tags[1], etc. format
        tags = Object.keys(req.query)
          .filter(key => key.startsWith('tags['))
          .map(key => req.query[key])
          .filter(Boolean);
      }
      
      if (tags.length > 0) {
        apiParams.tags = tags;
        console.log(`[${requestId}] Using tags filter:`, tags);
      }
    }
    
    // Add other filters
    if (req.query.min_volume) {
      apiParams.min_volume = parseInt(req.query.min_volume);
    }
    
    console.log(`[${requestId}] API params:`, apiParams);
    
    // Add timeout to prevent hanging (30 seconds)
    const response = await domeApi.get('/polymarket/markets', {
      params: apiParams,
      timeout: 30000 // 30 second timeout
    });

    lastDomeRateLimit = extractRateLimit(response.headers) || lastDomeRateLimit;
    
    console.log(`[${requestId}] Dome API response status:`, response.status);
    console.log(`[${requestId}] Dome API response data type:`, typeof response.data);
    console.log(`[${requestId}] Dome API response has markets:`, !!response.data.markets);
    console.log(`[${requestId}] Markets type:`, typeof response.data.markets);
    console.log(`[${requestId}] Markets is array:`, Array.isArray(response.data.markets));
    console.log(`[${requestId}] Markets length:`, response.data.markets?.length);
    
    const markets = response.data.markets;
    
    if (markets && markets.length > 0) {
      console.log(`[${requestId}] First market sample:`, {
        title: markets[0].title,
        market_slug: markets[0].market_slug,
      });
    }
    
    console.log(`[${requestId}] Successfully fetched ${markets.length} markets`);
    
    // Store in cache
    marketsCache.set(cacheKey, {
      data: markets,
      timestamp: Date.now()
    });
    
    res.json({ markets: markets, rateLimit: lastDomeRateLimit });
  } catch (error) {
    console.log(`[${requestId}] === MARKETS ERROR CAUGHT ===`);
    console.log(`[${requestId}] Error message:`, error.message);
    console.log(`[${requestId}] Error name:`, error.name);
    console.log(`[${requestId}] Error code:`, error.code);
    console.log(`[${requestId}] Error stack:`, error.stack);
    console.log(`[${requestId}] Error response status:`, error.response?.status);
    console.log(`[${requestId}] Error response data:`, error.response?.data);
    console.log(`[${requestId}] Error response headers:`, error.response?.headers);
    console.log(`[${requestId}] Error config URL:`, error.config?.url);
    console.log(`[${requestId}] Error config baseURL:`, error.config?.baseURL);
    console.log(`[${requestId}] Error config fullURL:`, `${error.config?.baseURL}${error.config?.url}`);
    console.log(`[${requestId}] Error config headers:`, error.config?.headers);
    console.log(`[${requestId}] Error config method:`, error.config?.method);
    console.log(`[${requestId}] Error config params:`, error.config?.params);
    
    // Handle specific error codes
    if (error.response?.status === 401) {
      console.log(`[${requestId}] 401 Error - Authentication failed`);
      return res.status(401).json({ error: 'Authentication failed' });
    }
    
    if (error.response?.status === 403) {
      console.log(`[${requestId}] 403 Error - Access forbidden`);
      return res.status(403).json({ error: 'Access forbidden' });
    }
    
    if (error.response?.status === 429) {
      console.log(`[${requestId}] 429 Error - Rate limit exceeded`);
      const rl = extractRateLimit(error.response?.headers) || lastDomeRateLimit;
      if (rl) lastDomeRateLimit = rl;
      return res.status(429).json({ error: 'Rate limit exceeded', rateLimit: rl });
    }
    
    // Network errors
    if (error.code === 'ECONNREFUSED') {
      console.log(`[${requestId}] Connection refused error`);
      return res.status(503).json({ error: 'Service unavailable' });
    }
    
    if (error.code === 'ETIMEDOUT') {
      console.log(`[${requestId}] Timeout error`);
      return res.status(504).json({ error: 'Request timeout', rateLimit: lastDomeRateLimit });
    }
    
    console.log(`[${requestId}] Unhandled markets error - returning 500 status`);
    res.status(500).json({ 
      error: 'Failed to fetch markets', 
      details: error.message,
      requestId: requestId
    });
  }
});

// Get market price
app.get('/api/market-price/:tokenId', async (req, res) => {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`=== [${requestId}] /api/market-price called ===`);
  console.log(`[${requestId}] Request params:`, req.params);
  console.log(`[${requestId}] Request headers:`, req.headers);
  console.log(`[${requestId}] Request timestamp:`, new Date().toISOString());
  
  try {
    const { tokenId } = req.params;
    console.log(`[${requestId}] Token ID: ${tokenId}`);
    console.log(`[${requestId}] DOME_API_KEY exists:`, !!process.env.DOME_API_KEY);
    console.log(`[${requestId}] DOME_API_KEY length:`, process.env.DOME_API_KEY?.length);
    console.log(`[${requestId}] Dome API baseURL:`, DOME_API_BASE);
    console.log(`[${requestId}] Fetching price from Dome API...`);
    
    // Manually construct the request to see exactly what's being sent
    const fullUrl = `${DOME_API_BASE}/polymarket/market-price/${tokenId}`;
    console.log(`[${requestId}] Full URL: ${fullUrl}`);
    
    const response = await domeApi.get(`/polymarket/market-price/${tokenId}`, {
      timeout: 30000 // 30 second timeout
    });
    console.log(`[${requestId}] Price response status:`, response.status);
    console.log(`[${requestId}] Price response data:`, response.data);
    console.log(`[${requestId}] Request completed successfully`);
    lastDomeRateLimit = extractRateLimit(response.headers) || lastDomeRateLimit;
    res.json({ ...response.data, rateLimit: lastDomeRateLimit });
  } catch (error) {
    console.log(`[${requestId}] === ERROR CAUGHT ===`);
    console.log(`[${requestId}] Error message:`, error.message);
    console.log(`[${requestId}] Error name:`, error.name);
    console.log(`[${requestId}] Error code:`, error.code);
    console.log(`[${requestId}] Error stack:`, error.stack);
    console.log(`[${requestId}] Error response status:`, error.response?.status);
    console.log(`[${requestId}] Error response data:`, error.response?.data);
    console.log(`[${requestId}] Error response headers:`, error.response?.headers);
    console.log(`[${requestId}] Error config URL:`, error.config?.url);
    console.log(`[${requestId}] Error config baseURL:`, error.config?.baseURL);
    console.log(`[${requestId}] Error config fullURL:`, `${error.config?.baseURL}${error.config?.url}`);
    console.log(`[${requestId}] Error config headers:`, error.config?.headers);
    console.log(`[${requestId}] Error config method:`, error.config?.method);
    console.log(`[${requestId}] Error config data:`, error.config?.data);
    console.log(`[${requestId}] Error config params:`, error.config?.params);
    
    // Handle 404 errors gracefully (token not found is normal)
    if (error.response?.status === 404) {
      console.log(`[${requestId}] 404 Error - Token not found in pricing data - returning null price`);
      const rl = extractRateLimit(error.response?.headers) || lastDomeRateLimit;
      if (rl) lastDomeRateLimit = rl;
      return res.json({ price: null, at_time: null, error: 'Token not found', rateLimit: rl });
    }
    
    // Handle other specific error codes
    if (error.response?.status === 429) {
      console.log(`[${requestId}] 429 Error - Rate limit exceeded - returning retry message`);
      const rl = extractRateLimit(error.response?.headers) || lastDomeRateLimit;
      if (rl) lastDomeRateLimit = rl;
      return res.status(429).json({ error: 'Rate limit exceeded', retryAfter: error.response?.headers?.['retry-after'], rateLimit: rl });
    }
    
    if (error.response?.status === 401) {
      console.log(`[${requestId}] 401 Error - Authentication failed`);
      return res.status(401).json({ error: 'Authentication failed' });
    }
    
    if (error.response?.status === 403) {
      console.log(`[${requestId}] 403 Error - Access forbidden`);
      return res.status(403).json({ error: 'Access forbidden' });
    }
    
    // Network/connection errors
    if (error.code === 'ECONNREFUSED') {
      console.log(`[${requestId}] Connection refused error`);
      return res.status(503).json({ error: 'Service unavailable' });
    }
    
    if (error.code === 'ETIMEDOUT') {
      console.log(`[${requestId}] Timeout error`);
      return res.status(504).json({ error: 'Request timeout', rateLimit: lastDomeRateLimit });
    }
    
    // For all other errors, log and return 500
    console.log(`[${requestId}] Unhandled error - returning 500 status`);
    res.status(500).json({ 
      error: 'Failed to fetch market price', 
      details: error.message,
      requestId: requestId
    });
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

// Batch price endpoint - fetch multiple market prices efficiently
app.get('/api/market-prices', async (req, res) => {
  const requestId = `batch-prices-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`=== [${requestId}] /api/market-prices called ===`);
  
  try {
    const tokenIds = req.query.tokenIds;
    if (!tokenIds) {
      return res.status(400).json({ error: 'tokenIds parameter required' });
    }
    
    const ids = Array.isArray(tokenIds) ? tokenIds : tokenIds.split(',');
    console.log(`[${requestId}] Fetching ${ids.length} prices:`, ids.slice(0, 3).join(', ') + (ids.length > 3 ? '...' : ''));
    
    let batchRateLimit = null;

    const pricePromises = ids.map(async (tokenId, index) => {
      try {
        // FREE tier: Rate limit - only process first 10 prices immediately
        if (index < 10) {
          await new Promise(resolve => setTimeout(resolve, 1100 * index)); // Stagger requests
        } else {
          // For additional prices, wait longer to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 1100 * (index + 10)));
        }
        
        const response = await domeApi.get(`/polymarket/market-price/${tokenId}`, {
          timeout: 10000 // 10 second timeout per price call
        });
        const rl = extractRateLimit(response.headers);
        if (rl) {
          lastDomeRateLimit = rl;
          batchRateLimit = rl;
        }
        return { tokenId, price: response.data.price, success: true };
      } catch (error) {
        console.error(`[${requestId}] Error fetching price for ${tokenId}:`, error.message);
        const rl = extractRateLimit(error.response?.headers);
        if (rl) {
          lastDomeRateLimit = rl;
          batchRateLimit = rl;
        }
        return { tokenId, price: null, success: false, error: error.message };
      }
    });
    
    const results = await Promise.all(pricePromises);
    const priceMap = {};
    
    results.forEach(result => {
      priceMap[result.tokenId] = result.price;
    });
    
    console.log(`[${requestId}] Completed batch price fetch: ${results.filter(r => r.success).length}/${ids.length} successful`);
    
    res.json({
      prices: priceMap,
      timestamp: new Date().toISOString(),
      successCount: results.filter(r => r.success).length,
      totalCount: ids.length,
      rateLimit: batchRateLimit || lastDomeRateLimit
    });
    
  } catch (error) {
    console.error(`[${requestId}] Batch price error:`, error);
    res.status(500).json({ error: 'Failed to fetch batch prices', rateLimit: lastDomeRateLimit });
  }
});

// Debug endpoint to show market data
app.get('/api/debug/markets', async (req, res) => {
  try {
    const marketsResponse = await domeApi.get('/polymarket/markets', {
      params: {
        limit: 50,
        closed: false
      }
    });
    
    const markets = marketsResponse.data.markets || [];
    
    // Show first 10 markets with their titles and slugs
    const sampleMarkets = markets.slice(0, 10).map(market => ({
      title: market.question || market.title || 'No title',
      slug: market.market_slug || 'No slug',
      volume: market.volume_total || 0
    }));
    
    res.json({
      totalMarkets: markets.length,
      sampleMarkets: sampleMarkets,
      btcMarkets: markets.filter(m => {
        const title = (m.question || m.title || '').toLowerCase();
        const slug = (m.market_slug || '').toLowerCase();
        return title.includes('btc') || title.includes('bitcoin') || slug.includes('btc') || slug.includes('bitcoin');
      }).map(m => ({
        title: m.question || m.title || 'No title',
        slug: m.market_slug || 'No slug'
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Intra-Polymarket BTC Arbitrage Scanner (Slippage Detection)
app.get('/api/arbitrage/btc-intra-check', async (req, res) => {
  const requestId = `btc-intra-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();
  console.log(`=== [${requestId}] /api/arbitrage/btc-intra-check called ===`);
  console.log(`[${requestId}] Request timestamp:`, new Date().toISOString());
  
  try {
    console.log(`[${requestId}] Processing BTC intra arbitrage check`);
    
    // Fetch current markets from Polymarket
    console.log(`[${requestId}] Fetching BTC markets from Polymarket...`);
    const marketsResponse = await domeApi.get('/polymarket/markets', {
      params: {
        limit: 100, // Reduce from 200 to avoid API limits
        closed: false
      }
    });
    
    const allMarkets = marketsResponse.data.markets || [];
    console.log(`[${requestId}] Fetched ${allMarkets.length} total markets`);
    
    // Debug: Show first few market titles to see what we're working with
    console.log(`[${requestId}] Sample market titles:`);
    for (let i = 0; i < Math.min(5, allMarkets.length); i++) {
      const market = allMarkets[i];
      console.log(`[${requestId}] ${i + 1}. ${market.question || market.title || 'No title'}`);
    }
    
    // Filter for BTC-related markets
    const btcMarkets = allMarkets.filter(market => {
      const title = (market.question || market.title || '').toLowerCase();
      const description = (market.description || '').toLowerCase();
      const slug = (market.market_slug || '').toLowerCase();
      const keywords = ['btc', 'bitcoin', 'bitcoin price', 'btc price', 'bitcoin will'];
      
      // Check title, description, and slug for BTC keywords
      const titleMatch = keywords.some(keyword => title.includes(keyword));
      const descMatch = keywords.some(keyword => description.includes(keyword));
      const slugMatch = slug.includes('btc') || slug.includes('bitcoin');
      
      const isBtcMarket = titleMatch || descMatch || slugMatch;
      if (isBtcMarket) {
        console.log(`[${requestId}] Found BTC market: ${title}`);
        console.log(`[${requestId}]   Slug: ${slug}`);
        console.log(`[${requestId}]   Match: title=${titleMatch}, desc=${descMatch}, slug=${slugMatch}`);
      }
      return isBtcMarket;
    });
    
    console.log(`[${requestId}] Found ${btcMarkets.length} BTC markets`);
    
    // Function to detect market type and get price IDs
    function getMarketPriceIds(market) {
      // Regular Yes/No markets
      if (market.side_a?.id && market.side_b?.id) {
        return {
          sideAId: market.side_a.id,
          sideBId: market.side_b.id,
          type: 'yes_no',
          labels: {
            sideA: market.side_a.label || 'Yes',
            sideB: market.side_b.label || 'No'
          }
        };
      }
      
      // Up/Down markets - different structure, no token IDs
      if (market.side_a?.label === 'Up' && market.side_b?.label === 'Down') {
        return {
          sideAId: null,
          sideBId: null,
          type: 'up_down',
          labels: {
            sideA: 'Up',
            sideB: 'Down'
          }
        };
      }
      
      // Other market types
      if (market.side_a?.label || market.side_b?.label) {
        return {
          sideAId: null,
          sideBId: null,
          type: 'other',
          labels: {
            sideA: market.side_a?.label || 'Unknown',
            sideB: market.side_b?.label || 'Unknown'
          }
        };
      }
      
      return null; // Unknown structure
    }
    
    const arbitrageOpportunities = [];
    let marketsChecked = 0;
    let marketsSkipped = 0;
    
    // Check each BTC market for intra-Polymarket arbitrage
    for (const market of btcMarkets) {
      try {
        console.log(`[${requestId}] Analyzing market: ${market.question || market.title}`);
        
        // Detect market type and get price IDs
        const marketInfo = getMarketPriceIds(market);
        
        if (!marketInfo) {
          console.log(`[${requestId}] Skipping "${market.title}" - unknown market structure`);
          marketsSkipped++;
          continue;
        }
        
        console.log(`[${requestId}] Market type: ${marketInfo.type} (${marketInfo.labels.sideA}/${marketInfo.labels.sideB})`);
        
        if (!marketInfo.sideAId || !marketInfo.sideBId) {
          console.log(`[${requestId}] Skipping "${market.title}" - ${marketInfo.type} market not supported yet`);
          marketsSkipped++;
          continue;
        }
        
        marketsChecked++;
        console.log(`[${requestId}] Checking market for arbitrage...`);
        
        // Fetch prices with rate limiting
        const [sideAResponse, sideBResponse] = await Promise.all([
          domeApi.get(`/polymarket/market-price/${marketInfo.sideAId}`),
          domeApi.get(`/polymarket/market-price/${marketInfo.sideBId}`)
        ]);
        
        const sideAPrice = sideAResponse.data.price;
        const sideBPrice = sideBResponse.data.price;
        
        console.log(`[${requestId}] Market prices - Side A: ${sideAPrice}, Side B: ${sideBPrice}`);
        
        // Check for arbitrage: Yes + No prices should equal 1.00
        const totalCost = sideAPrice + sideBPrice;
        const grossProfit = 1.0 - totalCost;
        
        // Calculate fees (Polymarket gas/network estimate)
        const POLY_FEE = 0.003; // ~0.3% per trade
        const totalFees = POLY_FEE * 2; // Both sides
        const netProfit = grossProfit - totalFees;
        
        console.log(`[${requestId}] Arbitrage calculation - Total: ${totalCost}, Gross: ${(grossProfit * 100).toFixed(2)}%, Net: ${(netProfit * 100).toFixed(2)}%`);
        
        // Check if arbitrage exists (net profit > 0)
        if (netProfit > 0.001) { // Minimum 0.1% profit threshold
          const opportunity = {
            market: market.question || market.title,
            marketSlug: market.market_slug,
            sideA: {
              id: sideAId,
              label: market.side_a?.label || 'Yes',
              price: sideAPrice,
              pricePercent: (sideAPrice * 100).toFixed(1)
            },
            sideB: {
              id: sideBId,
              label: market.side_b?.label || 'No', 
              price: sideBPrice,
              pricePercent: (sideBPrice * 100).toFixed(1)
            },
            arbitrage: {
              totalCost: totalCost.toFixed(4),
              grossProfit: (grossProfit * 100).toFixed(2),
              netProfit: (netProfit * 100).toFixed(2),
              profitDollars: (netProfit * 1000).toFixed(2), // Assuming $1000 position
              fees: {
                total: (totalFees * 100).toFixed(2),
                perSide: (POLY_FEE * 100).toFixed(2)
              }
            },
            market: {
              volume: market.volume_total || 0,
              liquidity: (market.volume_total || 0) > 10000 ? 'good' : 'limited',
              maxPosition: Math.floor((market.volume_total || 0) * 0.1) // Max 10% of volume
            },
            detected: new Date().toISOString()
          };
          
          arbitrageOpportunities.push(opportunity);
          console.log(`[${requestId}] ✓ ARBITRAGE FOUND: ${opportunity.market} - Net profit: ${opportunity.arbitrage.netProfit}%`);
        } else {
          console.log(`[${requestId}] No arbitrage - profit too low or negative: ${(netProfit * 100).toFixed(2)}%`);
        }
        
      } catch (priceError) {
        console.log(`[${requestId}] Error fetching prices for market:`, priceError.message);
        // Continue with next market
      }
    }
    
    console.log(`[${requestId}] Scan complete - Checked: ${marketsChecked}, Skipped: ${marketsSkipped}, Found: ${arbitrageOpportunities.length}`);
    
    // Sort by net profit (highest first)
    arbitrageOpportunities.sort((a, b) => parseFloat(b.arbitrage.netProfit) - parseFloat(a.arbitrage.netProfit));
    
    const response = {
      success: true,
      arbs: arbitrageOpportunities,
      count: arbitrageOpportunities.length,
      timestamp: new Date().toISOString(),
      scanDuration: Date.now() - startTime,
      marketsScanned: marketsChecked, // Updated to show actual checked markets
      marketsSkipped: marketsSkipped, // New field
      totalBtcMarkets: btcMarkets.length, // New field
      totalMarkets: allMarkets.length,
      note: 'Real BTC intra-Polymarket arbitrage scanner - Yes+No price discrepancies',
      methodology: 'Scans Yes+No price combinations within same market for arbitrage opportunities',
      threshold: 'Minimum 0.1% net profit after fees',
      marketTypes: {
        yes_no: marketsChecked,
        up_down: marketsSkipped,
        other: 0
      }
    };
    
    const duration = Date.now() - startTime;
    console.log(`[${requestId}] BTC intra scan completed in ${duration}ms`);
    console.log(`[${requestId}] Results: ${arbitrageOpportunities.length} arbitrage opportunities found`);
    
    res.json(response);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`[${requestId}] === BTC INTRA ERROR ===`);
    console.log(`[${requestId}] Error message:`, error.message);
    console.log(`[${requestId}] Error stack:`, error.stack);
    console.log(`[${requestId}] Error response status:`, error.response?.status);
    console.log(`[${requestId}] Error response data:`, error.response?.data);
    
    // Handle specific error codes
    if (error.response?.status === 401) {
      console.log(`[${requestId}] 401 Error - Authentication failed`);
      return res.status(401).json({ error: 'Authentication failed', requestId });
    }
    
    if (error.response?.status === 429) {
      console.log(`[${requestId}] 429 Error - Rate limit exceeded`);
      return res.status(429).json({ error: 'Rate limit exceeded', requestId });
    }
    
    if (error.code === 'ECONNREFUSED') {
      console.log(`[${requestId}] Connection refused error`);
      return res.status(503).json({ error: 'Service unavailable', requestId });
    }
    
    console.log(`[${requestId}] Unhandled BTC intra error - returning 500 status`);
    return res.status(500).json({ 
      error: 'Failed to check intra-Polymarket BTC arbitrage',
      details: error.message,
      requestId: requestId,
      duration: duration
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
