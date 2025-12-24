import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const BtcArbScanner = () => {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30); // seconds
  const intervalRef = useRef(null);

  const scanBtcArbitrage = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:5000/api/arbitrage/btc-check');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Request failed');
      }

      setResults(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        scanBtcArbitrage();
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
  }, [autoRefresh, refreshInterval]);

  return (
    <div className="bot-card">
      <div className="bot-header">
        <h2>BTC 15-Min Arbitrage Scanner</h2>
      </div>
      
      <div className="bot-body">
        <div style={{ flex: 1 }}>
          <p className="bot-description">
            Demo using free-tier APIs. Scans Polymarket BTC 15-min markets for arbitrage opportunities.
          </p>
        </div>
        
        <div className="bot-controls-row">
          <div className="control-group-compact">
            <input
              type="checkbox"
              id="btc-auto-refresh"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <label htmlFor="btc-auto-refresh">Auto-scan ({refreshInterval}s)</label>
          </div>
          
          {autoRefresh && (
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(parseInt(e.target.value))}
              className="bot-select"
              style={{ width: 'auto', padding: '0.2rem', height: '30px' }}
            >
              <option value="20">20s</option>
              <option value="30">30s</option>
              <option value="45">45s</option>
              <option value="60">60s</option>
            </select>
          )}
        </div>

        <div className="bot-action-area">
          <button 
            onClick={scanBtcArbitrage} 
            disabled={loading}
            className="bot-primary-btn"
          >
            {loading ? 'Scanning...' : 'Scan BTC Arbitrage'}
          </button>
        </div>
      </div>

      <div className="bot-footer">
        <div className="bot-label" style={{ marginBottom: '0.25rem' }}>Scan Results</div>
        <div className="bot-logs-window" style={{ height: '100px' }}>
          {error ? (
            <div className="log-line log-error">{error}</div>
          ) : results ? (
            <>
              <div className={`log-line ${results.arbs.length > 0 ? 'log-success' : 'log-info'}`}>
                <strong>{results.arbs.length > 0 ? `${results.arbs.length} ARBITRAGE FOUND!` : 'NO ARBITRAGE'}</strong>
              </div>
              
              <div style={{ fontSize: '0.7rem', color: '#ccc' }}>
                <div style={{ marginBottom: '0.5rem', color: '#888' }}>
                  {new Date(results.timestamp).toLocaleTimeString()} - {results.count} checked
                </div>
                
                {results.arbs.length > 0 ? (
                  <div className="arb-results-list">
                    {results.arbs.map((arb, idx) => (
                      <div key={idx} className="arb-result-card" style={{ marginBottom: '0.5rem' }}>
                        <div style={{ color: '#fff', fontWeight: '600' }}>{arb.market}</div>
                        <div>{arb.direction}</div>
                        <div style={{ color: '#4ade80' }}>Net: {arb.netProfit}% (Gross: {arb.grossProfit}%)</div>
                        <div>Fees: {arb.fees.total}%</div>
                        <div>Poly Vol: {arb.polyVolume} | Kalshi Vol: {arb.kalshiVolume}</div>
                        <div>Max Pos: ${arb.maxPosition.toFixed(0)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div>{results.note}</div>
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

export default BtcArbScanner;
