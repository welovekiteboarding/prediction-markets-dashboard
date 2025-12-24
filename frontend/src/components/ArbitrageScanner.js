import React, { useState, useEffect, useRef } from 'react';

const ArbitrageScanner = () => {
  const [selectedMarket, setSelectedMarket] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(45); // seconds
  const [alertThreshold, setAlertThreshold] = useState(0); // percent - changed from 2.0
  const [investmentAmount, setInvestmentAmount] = useState(1000); // dollars
  const [historicalArbs, setHistoricalArbs] = useState([]);
  const intervalRef = useRef(null);

  const checkArbitrage = async () => {
    if (!selectedMarket) {
      setError('Please select a market to check');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`http://localhost:5000/api/arbitrage/check?market_slug=${encodeURIComponent(selectedMarket)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Request failed');
      }

      setResult(data);
      
      // Check for alert threshold
      if (data.exists && data.arbitrage && parseFloat(data.arbitrage.percent) >= alertThreshold) {
        sendAlert(data);
      }
      
      // Add to historical log
      if (data.exists) {
        const historicalEntry = {
          timestamp: new Date(),
          market: data.market,
          netProfit: parseFloat(data.arbitrage.percent),
          grossProfit: parseFloat(data.arbitrage.grossProfit),
          direction: data.arbitrage.direction,
          stillAvailable: true // Will be updated on next check
        };
        setHistoricalArbs(prev => [historicalEntry, ...prev].slice(0, 20)); // Keep last 20
      }
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Alert system
  const sendAlert = (arbitrageData) => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;

    // Request permission only when actually sending an alert
    if (window.Notification.permission === 'default') {
      window.Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          new window.Notification('Arbitrage Alert!', {
            body: `${arbitrageData.market}: ${arbitrageData.arbitrage.percent}% net profit`,
            icon: '/favicon.ico'
          });
        }
      });
    } else if (window.Notification.permission === 'granted') {
      new window.Notification('Arbitrage Alert!', {
        body: `${arbitrageData.market}: ${arbitrageData.arbitrage.percent}% net profit`,
        icon: '/favicon.ico'
      });
    }
    
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBi2Gy/DaizsIGGS57O2gUBELUKzn77hXGAg9k9n1unEiBC13yO/eizEIHWq+8+OZURE');
      audio.volume = 0.3;
      audio.play().catch(() => {});
    } catch (e) {}
  };

  // Removed automatic notification permission request useEffect

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefresh && selectedMarket) {
      intervalRef.current = setInterval(() => {
        checkArbitrage();
      }, refreshInterval * 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh, refreshInterval, selectedMarket]);

  // Calculate position sizing
  const calculatePosition = () => {
    if (!result || !result.exists) return null;
    
    const netProfitPercent = parseFloat(result.arbitrage.percent) / 100;
    const expectedProfit = investmentAmount * netProfitPercent;
    const maxPosition = result.liquidity.maxPosition;
    const recommendedPosition = Math.min(investmentAmount, maxPosition);
    
    return {
      investment: recommendedPosition,
      expectedProfit: recommendedPosition * netProfitPercent,
      contracts: Math.floor(recommendedPosition / 100), // Rough estimate
      withinLimits: recommendedPosition <= maxPosition
    };
  };

  const position = calculatePosition();

  return (
    <div className="bot-card">
      <div className="bot-header">
        <h2>Arbitrage Scanner</h2>
      </div>
      
      <div className="bot-body">
        <div className="bot-controls-row">
          <div style={{ flex: 1 }}>
            <label className="bot-label">Select Market</label>
            <select 
              id="market-select"
              value={selectedMarket} 
              onChange={(e) => setSelectedMarket(e.target.value)}
              className="bot-select"
            >
              <option value="">Choose a market...</option>
              <option value="nfl-ari-den-2025-08-16">
                NFL: Cardinals vs Broncos (Aug 16)
              </option>
              <option value="nfl-dal-phi-2025-09-04">
                NFL: Cowboys vs Eagles (Sep 4)
              </option>
              <option value="will-elon-musk-post-more-than-500-tweets-from-dec-26-to-jan-2-2026">
                Elon Musk &gt;500 Tweets
              </option>
              <option value="nba-nyk-min-2025-12-23-total-225pt5">
                Knicks vs Wolves O/U 225.5
              </option>
              <option value="nba-nyk-min-2025-12-23-total-226pt5">
                Knicks vs Wolves O/U 226.5
              </option>
            </select>
          </div>
        </div>

        <div className="bot-controls-row">
          <div className="control-group-compact">
            <input
              type="checkbox"
              id="arb-auto-refresh"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <label htmlFor="arb-auto-refresh">Auto-refresh ({refreshInterval}s)</label>
          </div>
          
          {autoRefresh && (
            <input
              type="range"
              min="30"
              max="120"
              step="15"
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(parseInt(e.target.value))}
              style={{ width: '60px' }}
            />
          )}
        </div>

        <div className="bot-controls-row">
          <div style={{ flex: 1 }}>
            <label className="bot-label">Threshold (%)</label>
            <input
              type="number"
              min="0.5"
              max="10"
              step="0.5"
              value={alertThreshold}
              onChange={(e) => setAlertThreshold(parseFloat(e.target.value))}
              className="bot-input"
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="bot-label">Invest ($)</label>
            <input
              type="number"
              min="100"
              max="10000"
              step="100"
              value={investmentAmount}
              onChange={(e) => setInvestmentAmount(parseInt(e.target.value))}
              className="bot-input"
            />
          </div>
        </div>

        <div className="bot-action-area">
          <button 
            onClick={checkArbitrage} 
            className="bot-primary-btn"
          >
            {loading ? 'Checking...' : 'Check Arbitrage'}
          </button>
        </div>
      </div>

      <div className="bot-footer">
        <div className="bot-label" style={{ marginBottom: '0.25rem' }}>Scan Results</div>
        <div className="bot-logs-window" style={{ height: '100px' }}>
          {error ? (
            <div className="log-line log-error">{error}</div>
          ) : result ? (
            <>
              <div className={`log-line ${result.exists ? 'log-success' : 'log-info'}`}>
                <strong>{result.exists ? 'OPPORTUNITY FOUND' : 'NO ARBITRAGE'}</strong>
              </div>
              <div style={{ fontSize: '0.7rem', color: '#ccc' }}>
                <div>{result.market}</div>
                {result.exists ? (
                   <>
                    <div>{result.arbitrage.direction} | Net: {result.arbitrage.percent}%</div>
                    <div>Gross: {result.arbitrage.grossProfit}% | Fees: {result.arbitrage.fees.total}%</div>
                    <div>Poly: Yes {result.platformA.yesPrice}¢ | No {result.platformA.noPrice}¢</div>
                    <div>Kalshi: Yes {result.platformB.yesPrice}¢ | No {result.platformB.noPrice}¢</div>
                    {position && (
                      <div style={{ marginTop: '0.5rem', borderTop: '1px solid #333', paddingTop: '0.25rem' }}>
                        Position: ${position.investment} | Exp. Profit: ${position.expectedProfit.toFixed(2)}
                      </div>
                    )}
                  </>
                ) : (
                  <div>{result.message || 'No arbitrage opportunity found'}</div>
                )}
              </div>
            </>
          ) : (
            <div className="log-line log-info">Ready to scan...</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ArbitrageScanner;
