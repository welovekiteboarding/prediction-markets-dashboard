import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './AppStyles.css';
import MarketList from './components/MarketList.jsx';
import Wallet from './components/Wallet';
import AutoBot from './components/AutoBot';
import ArbitrageScanner from './components/ArbitrageScanner';
import BtcArbScanner from './components/BtcArbScanner.jsx';
import BtcIntraArbScanner from './components/BtcIntraArbScanner.jsx';

function App() {
  const [markets, setMarkets] = useState([]);
  const [filteredMarkets, setFilteredMarkets] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [marketsLoaded, setMarketsLoaded] = useState(false); // Track if we have initial markets
  const [selectedCategory, setSelectedCategory] = useState('All');
  const intervalRef = useRef(null);
  const currentRequestId = useRef(null);
  const [cooldownUntilMs, setCooldownUntilMs] = useState(0);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const rateLimitTimerRef = useRef(null);

  // Category to serverside filter mapping
  const categoryFilters = {
    'All': { tags: [], clientFilter: null },
    'Crypto': { tags: ['Bitcoin', 'Crypto Prices', 'Hit Price'], clientFilter: null },
    'Finance': { tags: ['Economy', 'Fed Rates', 'Business'], clientFilter: null },
    'Tech': { tags: ['Technology', 'AI', 'Big Tech'], clientFilter: null },
    'Politics': { tags: ['Politics', 'US Election', 'World Elections', 'World', 'Geopolitics', 'Macro Geopolitics'], clientFilter: null },
    'Sports': { tags: ['Sports', 'Soccer', 'NFL', 'UCL', 'Champions League'], clientFilter: null },
    'Trump': { tags: ['Trump', 'Trump Trials', 'Trump-Putin', 'Trump-Zelenskyy'], clientFilter: null },
    'Elections': { tags: ['US Election', 'World Elections', 'elections 2024', 'election forecasting', 'election results'], clientFilter: null },
    'Mentions': { tags: [], clientFilter: (market) => {
      const title = (market.title || market.question || '').toLowerCase();
      return title.includes('will') || title.includes('out in') || title.includes('reach');
    }},
    'Geopolitics': { tags: [], clientFilter: (market) => {
      const title = (market.title || market.question || '').toLowerCase();
      return title.includes('war') || title.includes('conflict') || title.includes('international') || title.includes('geopolitic');
    }},
    'Economy': { tags: [], clientFilter: (market) => {
      const title = (market.title || market.question || '').toLowerCase();
      return title.includes('economy') || title.includes('economic') || title.includes('fed') || title.includes('federal reserve') || title.includes('inflation');
    }},
    'Earnings': { tags: [], clientFilter: (market) => {
      const title = (market.title || market.question || '').toLowerCase();
      return title.includes('earnings') || title.includes('revenue') || title.includes('profit') || title.includes('quarter');
    }},
    'Culture': { tags: [], clientFilter: (market) => {
      const title = (market.title || market.question || '').toLowerCase();
      return title.includes('culture') || title.includes('music') || title.includes('movie') || title.includes('celebrity') || title.includes('award');
    }},
    'World': { tags: [], clientFilter: (market) => {
      const title = (market.title || market.question || '').toLowerCase();
      return title.includes('world') || title.includes('global') || title.includes('international');
    }},
    // Categories without specific serverside filters - use client-side only
    'Trending': { tags: [], clientFilter: null }, // Would need serverside support
    'Breaking': { tags: [], clientFilter: null }, // Would need serverside support  
    'New': { tags: [], clientFilter: null } // Would need serverside support
  };

  // Extract categories from categoryFilters keys for UI rendering
  const categories = Object.keys(categoryFilters);

  const applyRateLimit = (rateLimit) => {
    const resetSeconds = rateLimit?.reset;
    if (!Number.isFinite(resetSeconds)) return;

    const untilMs = resetSeconds * 1000;
    if (!Number.isFinite(untilMs)) return;

    setCooldownUntilMs(prev => (untilMs > prev ? untilMs : prev));
    if (untilMs > Date.now()) {
      startCooldownTimer(untilMs);
    }
  };

  const startCooldownTimer = (untilMs) => {
    if (rateLimitTimerRef.current) {
      clearInterval(rateLimitTimerRef.current);
      rateLimitTimerRef.current = null;
    }

    const tick = () => {
      const remainingMs = untilMs - Date.now();
      if (remainingMs <= 0) {
        setCooldownSeconds(0);
        if (rateLimitTimerRef.current) {
          clearInterval(rateLimitTimerRef.current);
          rateLimitTimerRef.current = null;
        }
        return;
      }
      setCooldownSeconds(Math.ceil(remainingMs / 1000));
    };

    tick();
    rateLimitTimerRef.current = setInterval(tick, 250);
  };

  useEffect(() => {
    // Only load "All" markets on initial mount, not on category change
    const requestId = Date.now();
    currentRequestId.current = requestId;
    fetchMarketsForCategory('All', requestId); // Load "All" markets on mount
    fetchWallet();

    // Prevent multiple intervals in React Strict Mode
    if (!intervalRef.current) {
      // Auto-refresh current category every 5 minutes (300 seconds)
      intervalRef.current = setInterval(() => {
        const refreshRequestId = Date.now();
        currentRequestId.current = refreshRequestId;
        fetchMarketsForCategory(selectedCategory, refreshRequestId);
      }, 300000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // Cancel any ongoing request by invalidating the ID
      currentRequestId.current = null;
    };
  }, []); // Remove selectedCategory dependency

  const handleCategoryChange = (category) => {
    console.log(`=== Category Change: ${category} ===`);
    const filter = categoryFilters[category];
    console.log('Filter found:', filter);

    if (cooldownUntilMs > Date.now()) {
      startCooldownTimer(cooldownUntilMs);
      return;
    }
    
    setSelectedCategory(category);
    setMarketsLoaded(false); // Clear markets to show loading state
    
    const requestId = Date.now();
    currentRequestId.current = requestId;
    fetchMarketsForCategory(category, requestId);
  };

  const fetchMarketsForCategory = async (category, requestId) => {
    const filter = categoryFilters[category] || categoryFilters['All'];
    
    // Build API parameters based on category
    const apiParams = {
      status: 'open',
      limit: 10  // Reduced from 100 to help with API rate limits
    };
    
    // Add serverside tag filtering if available
    if (filter.tags && filter.tags.length > 0) {
      // Send each tag as a separate parameter for proper backend handling
      filter.tags.forEach((tag, index) => {
        apiParams[`tags[${index}]`] = tag;
      });
      console.log(`Fetching markets with serverside tags:`, filter.tags);
    } else {
      console.log(`Fetching all markets for client-side filtering: ${category}`);
    }

    console.log(`API call params:`, apiParams);
    console.log(`API call URL:`, 'http://localhost:5000/api/markets?' + new URLSearchParams(apiParams).toString());

    try {
      const response = await axios.get('http://localhost:5000/api/markets', { 
        params: apiParams,
        timeout: 10000  // Reduced from 30000 to 10 seconds
      });

      applyRateLimit(response.data?.rateLimit);

      // Check if this request is still valid
      if (currentRequestId.current !== requestId) {
        console.log('Request superseded by newer request');
        return;
      }

      const marketsData = Array.isArray(response.data?.markets)
        ? response.data.markets
        : Array.isArray(response.data)
        ? response.data
        : [];
      
      console.log(`Received ${marketsData.length} markets for category ${category}`);
      console.log('Sample markets:', marketsData.slice(0, 3).map(m => m.title));
      
      // Apply client-side filtering if needed
      let filteredData = marketsData;
      if (filter.clientFilter) {
        filteredData = marketsData.filter(filter.clientFilter);
        console.log(`Applied client-side filter: ${marketsData.length} → ${filteredData.length} markets`);
      }
      
      // Only update state if this request is still the current one
      if (currentRequestId.current === requestId) {
        console.log('Updating state with filtered markets');
        console.log('Setting filteredMarkets to:', filteredData.slice(0, 3).map(m => m.title));
        setMarkets(marketsData);
        setFilteredMarkets(filteredData);
        setMarketsLoaded(true);
        console.log('State updated, marketsLoaded set to true');
      } else {
        console.log('NOT updating state - request superseded');
      }
      
      // Log helpful info for debugging
      if (category === 'Politics' && filteredData.length === 0) {
        console.log('No politics markets found - sample titles:', marketsData.slice(0, 5).map(m => m.title).join('; '));
      }
    } catch (error) {
      if (currentRequestId.current !== requestId) {
        console.log('Request superseded, ignoring error');
        return;
      }

      applyRateLimit(error.response?.data?.rateLimit);
      
      if (error.code === 'ECONNABORTED') {
        console.log('Request timeout - API rate limit likely exceeded');
        setMarketsLoaded(true); // Show error state
        return;
      }
      
      console.error('Market fetch error:', error);
      setMarketsLoaded(true); // Show error state
    }
  };

  const fetchWallet = async () => {
    try {
      // For demo purposes, skip wallet fetch since we don't have a real EOA address
      // In production, you'd get the EOA from user's connected wallet
      setWallet(null);
    } catch (error) {
      console.error('Error fetching wallet:', error);
      setWallet(null);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Prediction Markets Trading Dashboard</h1>
      </header>
      <main>
        {marketsLoaded ? (
          <div className="dashboard">
            <Wallet wallet={wallet} />
            
            <div className="arb-bots-grid">
              <AutoBot />
              <ArbitrageScanner />
              <BtcArbScanner />
              <BtcIntraArbScanner />
            </div>

            {/* Category Filter Buttons */}
            <div className="category-filters">
              <h3>Filter by Category:</h3>
              <div className="category-buttons">
                {categories.map(category => (
                  <button
                    key={category}
                    className={`category-btn ${selectedCategory === category ? 'active' : ''}`}
                    onClick={() => {
                      console.log('Button clicked!', category);
                      handleCategoryChange(category);
                    }}
                  >
                    {category}
                  </button>
                ))}
              </div>
              {cooldownSeconds > 0 && (
                <div className="rate-limit-notice" style={{marginTop: '10px', fontSize: '12px', color: '#ff6b6b'}}>
                  Please wait {cooldownSeconds} second{cooldownSeconds !== 1 ? 's' : ''} before switching categories...
                </div>
              )}
              <div className="filter-info">
                Showing {filteredMarkets.length} of {markets.length} markets
              </div>
            </div>
            
            <MarketList markets={filteredMarkets} key={selectedCategory} cooldownUntilMs={cooldownUntilMs} onRateLimit={applyRateLimit} />
          </div>
        ) : (
          <div className="loading">
            <div>Loading markets...</div>
            <div style={{fontSize: '12px', color: '#666', marginTop: '10px'}}>
              {selectedCategory === 'All' 
                ? 'Fetching all markets...' 
                : `Fetching ${selectedCategory} markets...`
              }
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
