import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';

const MarketList = ({ markets, cooldownUntilMs = 0, onRateLimit }) => {
  console.log('MarketList received markets:', markets?.length, 'markets');
  console.log('MarketList sample titles:', markets?.slice(0, 3).map(m => m.title));
  
  const [prices, setPrices] = useState({});
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isUpdating, setIsUpdating] = useState(false);
  const [changedPrices, setChangedPrices] = useState(new Set());
  const [priceBackoffUntilMs, setPriceBackoffUntilMs] = useState(0);
  const [showTimeUntilExpiry, setShowTimeUntilExpiry] = useState(true);
  const isFetching = useRef(false);

  const formatTimeUntilExpiry = (endTimeSeconds) => {
    if (!Number.isFinite(endTimeSeconds)) return 'N/A';
    const remainingMs = (endTimeSeconds * 1000) - Date.now();
    if (!Number.isFinite(remainingMs)) return 'N/A';
    if (remainingMs <= 0) return 'Expired';

    const totalMinutes = Math.floor(remainingMs / 60000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const fetchAllPrices = async () => {
    if (!Array.isArray(markets) || markets.length === 0) return;
    if (cooldownUntilMs > Date.now()) return;
    if (priceBackoffUntilMs > Date.now()) return;
    if (isFetching.current) return;

    const tokenIds = markets
      .map(market => market.side_a?.id)
      .filter(id => id); // Filter out null/undefined IDs

    if (tokenIds.length === 0) return;

    isFetching.current = true;
    try {
      console.log(`Fetching prices for ${tokenIds.length} markets...`);
      
      // Show markets immediately with loading prices, then update as prices come in
      const response = await axios.get('http://localhost:5000/api/market-prices', {
        params: { tokenIds: tokenIds.join(',') },
        timeout: 30000 // 30 second timeout for batch request
      });

      onRateLimit?.(response.data?.rateLimit);

      console.log(`Received ${Object.keys(response.data.prices).length} prices`);
      setPrices(response.data.prices);
      setLastUpdated(new Date());
      setPriceBackoffUntilMs(0);
    } catch (error) {
      if (error?.code === 'ECONNABORTED') {
        console.log('Batch price request timed out');
      } else {
        console.error('Error fetching batch prices:', error);
      }
      onRateLimit?.(error.response?.data?.rateLimit);
      // Don't fall back to individual requests - just show markets without prices
      console.log('Showing markets without prices due to API error');
      setPrices({});
      setLastUpdated(new Date());
      setPriceBackoffUntilMs(Date.now() + 60000);
    } finally {
      isFetching.current = false;
    }
  };

  const fetchPricesIndividually = async (tokenIds) => {
    const pricePromises = tokenIds.map(async (tokenId) => {
      try {
        const response = await axios.get(`http://localhost:5000/api/market-price/${tokenId}`);
        onRateLimit?.(response.data?.rateLimit);
        return { tokenId, price: response.data.price };
      } catch (error) {
        console.error('Error fetching price:', error);
        onRateLimit?.(error.response?.data?.rateLimit);
        return { tokenId, price: null };
      }
    });

    const priceResults = await Promise.all(pricePromises);
    const priceMap = {};
    priceResults.forEach((result) => {
      if (result.tokenId) {
        priceMap[result.tokenId] = result.price;
      }
    });

    setPrices(priceMap);
    setLastUpdated(new Date());
  };

  const fetchIncrementalPrices = async () => {
    if (!Array.isArray(markets) || markets.length === 0) return;
    if (cooldownUntilMs > Date.now()) return;
    if (isFetching.current) return;

    isFetching.current = true;
    try {
      const newPrices = { ...prices };
      const changedTokenIds = new Set();

      const pricePromises = markets.map(async (market) => {
        const tokenId = market.side_a?.id;
        if (!tokenId) return null;

        try {
          const response = await axios.get(`http://localhost:5000/api/market-price/${tokenId}`);
          onRateLimit?.(response.data?.rateLimit);
          return { tokenId, price: response.data.price };
        } catch (error) {
          console.error('Error fetching price:', error);
          onRateLimit?.(error.response?.data?.rateLimit);
          return null;
        }
      });

      const results = await Promise.all(pricePromises);
      results.forEach((result) => {
        if (!result) return;
        const { tokenId, price } = result;

        const oldPrice = prices[tokenId];
        if (price !== null && (oldPrice === undefined || Math.abs(price - oldPrice) > 0.0001)) {
          newPrices[tokenId] = price;
          changedTokenIds.add(tokenId);
        }
      });

      setLastUpdated(new Date());
      setIsUpdating(true);
      setTimeout(() => setIsUpdating(false), 1000);

      if (changedTokenIds.size > 0) {
        setPrices(newPrices);
        setChangedPrices(changedTokenIds);
        setTimeout(() => setChangedPrices(new Set()), 2000);
      }
    } finally {
      isFetching.current = false;
    }
  };

  useEffect(() => {
    if (Array.isArray(markets) && markets.length > 0) {
      fetchAllPrices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markets, cooldownUntilMs]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchAllPrices();
    }, 60000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markets, cooldownUntilMs, priceBackoffUntilMs]);

  return (
    <div className="market-list">
      <div className="market-header">
        <h2>Prediction Markets</h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#bbb' }}>
          <input
            type="checkbox"
            checked={showTimeUntilExpiry}
            onChange={(e) => setShowTimeUntilExpiry(e.target.checked)}
          />
          Time until expiry
        </label>
        <div className={`last-updated ${isUpdating ? 'updated' : ''}`}>
          Last updated: {lastUpdated.toLocaleTimeString()}
        </div>
      </div>

      <div className="markets">
        {Array.isArray(markets) && markets.length > 0 ? (
          markets.map((market) => {
            const tokenId = market.side_a?.id;
            const yesPrice = tokenId ? prices[tokenId] : undefined;
            const noPrice = yesPrice !== undefined ? 1 - yesPrice : undefined;
            const hasChanged = Boolean(tokenId && changedPrices.has(tokenId));

            return (
              <div
                key={market.condition_id || market.market_slug}
                className={`market-card ${hasChanged ? 'price-changed' : ''}`}
              >
                <div className="market-content">
                  <div className="market-header-info">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <h3>{market.title}</h3>
                        <span className="created-stat" style={{ display: 'block', fontSize: '0.8rem', color: '#888', marginTop: '4px' }}>
                          Created: {market.start_time ? new Date(market.start_time * 1000).toLocaleDateString() : 'N/A'}
                        </span>
                        <span className="market-slug" style={{ display: 'block', fontSize: '0.7rem', color: '#666', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                          {market.market_slug || market.condition_id}
                        </span>
                      </div>
                      <div className="market-stats" style={{ textAlign: 'right' }}>
                        <span className="volume-stat">Vol: {(market.volume_total || 0).toLocaleString()}</span>
                        <span className={`status-stat ${market.status || 'unknown'}`}>{market.status || 'N/A'}</span>
                        <span className="expiry-stat">
                          Exp: {showTimeUntilExpiry
                            ? formatTimeUntilExpiry(market.end_time)
                            : (market.end_time ? new Date(market.end_time * 1000).toLocaleDateString() : 'N/A')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="price-display">
                    <div className="price-row">
                      <span className="outcome-label">Yes</span>
                      <span className={`outcome-price yes-price ${hasChanged ? 'price-updated' : ''}`}>
                        {yesPrice !== null && yesPrice !== undefined ? `${(yesPrice * 100).toFixed(1)}%` : '...'}
                      </span>
                      <span className="outcome-label">No</span>
                      <span className={`outcome-price no-price ${hasChanged ? 'price-updated' : ''}`}>
                        {noPrice !== null && noPrice !== undefined ? `${(noPrice * 100).toFixed(1)}%` : '...'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : markets && markets.length === 0 ? (
          <div className="no-markets">
            <h3>No markets found for this category</h3>
            <p>Try selecting a different category or check back later for new markets.</p>
          </div>
        ) : (
          <div className="loading">
            <div>Loading markets...</div>
            <div style={{fontSize: '12px', color: '#666', marginTop: '10px'}}>
              Check browser console for API call details
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketList;
