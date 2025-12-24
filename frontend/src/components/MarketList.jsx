import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';

const MarketList = ({ markets }) => {
  const [prices, setPrices] = useState({});
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isUpdating, setIsUpdating] = useState(false);
  const [changedPrices, setChangedPrices] = useState(new Set());
  const isFetching = useRef(false);

  const fetchAllPrices = async () => {
    if (!Array.isArray(markets) || markets.length === 0) return;

    const pricePromises = markets.map(async (market) => {
      try {
        const tokenId = market.side_a?.id;
        if (!tokenId) return { tokenId: null, price: null };

        const response = await axios.get(`http://localhost:5000/api/market-price/${tokenId}`);
        return { tokenId, price: response.data.price };
      } catch (error) {
        console.error('Error fetching price:', error);
        return { tokenId: market.side_a?.id, price: null };
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
          return { tokenId, price: response.data.price };
        } catch (error) {
          console.error('Error fetching price:', error);
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
  }, [markets]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchIncrementalPrices();
    }, 20000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markets, prices]);

  return (
    <div className="market-list">
      <div className="market-header">
        <h2>Prediction Markets</h2>
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
                    <h3>{market.title}</h3>
                    <div className="market-stats">
                      <span className="volume-stat">${(market.volume_total || 0).toLocaleString()}</span>
                      <span className={`status-stat ${market.status || 'unknown'}`}>{market.status || 'N/A'}</span>
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
        ) : (
          <div className="loading">Loading markets...</div>
        )}
      </div>
    </div>
  );
};

export default MarketList;
