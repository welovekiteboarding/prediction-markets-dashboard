import React, { useState, useEffect } from 'react';

const BtcIntraArbScanner = () => {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30); // seconds

  const scanIntraArb = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('http://localhost:5000/api/arbitrage/btc-intra-check');
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Request failed');
      }
      setResults(data);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(scanIntraArb, refreshInterval * 1000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval]);

  return (
    <div className="bot-card">
      <div className="bot-header">
        <h2>Intra-Polymarket BTC Arb Scanner</h2>
      </div>
      
      <div className="bot-body">
        <div style={{ flex: 1 }}>
          <p className="bot-description">
            Detects slippage within Polymarket BTC 15-minute markets using Dome SDK with order book data.
          </p>
        </div>

        <div className="bot-controls-row">
          <div className="control-group-compact">
            <input
              type="checkbox"
              id="intra-auto-refresh"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <label htmlFor="intra-auto-refresh">Auto-scan ({refreshInterval}s)</label>
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
            onClick={scanIntraArb}
            disabled={loading}
            className="bot-primary-btn"
          >
            {loading ? 'Scanning...' : 'Scan BTC Intra-Arb'}
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
                <strong>{results.arbs.length > 0 ? `${results.arbs.length} SLIPPAGE FOUND!` : 'NO BTC SLIPPAGE FOUND'}</strong>
              </div>
              
              <div style={{ fontSize: '0.7rem', color: '#ccc' }}>
                <div style={{ marginBottom: '0.5rem', color: '#888' }}>
                  {new Date(results.timestamp).toLocaleTimeString()} - {results.marketsScanned || results.count} checked
                </div>

                {results.arbs.length > 0 ? (
                  <div className="arb-results-list">
                    {results.arbs.map((arb, idx) => (
                      <div key={idx} className="arb-result-card" style={{ marginBottom: '0.5rem' }}>
                        <div style={{ color: '#fff', fontWeight: '600' }}>{arb.market} ({arb.timeframe})</div>
                        <div>{arb.direction}</div>
                        <div>Total Cost: {arb.totalCost}</div>
                        <div style={{ color: '#4ade80' }}>Net: {arb.netProfit}% (Gross: {arb.grossProfit}%)</div>
                        <div>Vol: ${arb.polyVolume} | Max Pos: ${arb.maxPosition}</div>
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

export default BtcIntraArbScanner;
