import React, { useState, useEffect } from 'react';

const BtcIntraArbScanner = () => {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30); // seconds
  const [lastAlertTime, setLastAlertTime] = useState(0);
  const [notificationPermission, setNotificationPermission] = useState('default');

  const requestNotificationPermission = () => {
    if ('Notification' in window) {
      Notification.requestPermission().then(permission => {
        setNotificationPermission(permission);
        if (permission === 'granted') {
          console.log('✅ Notification permission granted!');
        } else {
          console.log('❌ Notification permission denied');
        }
      });
    }
  };

  // Update permission status when component mounts
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  // macOS notification function
  const showMacOSNotification = (title, message, arbitrageCount) => {
    // Check if Notification API is available
    if ('Notification' in window) {
      // Request permission if not granted (handles Safari user gesture requirement)
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            sendNotification(title, message, arbitrageCount);
          } else {
            console.log('Notification permission denied by user');
          }
        });
      } else if (Notification.permission === 'granted') {
        sendNotification(title, message, arbitrageCount);
      } else {
        console.log('Notifications blocked by browser');
      }
    } else {
      console.log('Notifications not supported in this browser');
    }
  };

  const sendNotification = (title, message, arbitrageCount) => {
    // Prevent notification spam (minimum 5 minutes between alerts)
    const now = Date.now();
    if (now - lastAlertTime < 300000) return; // 5 minutes
    
    const notification = new Notification(title, {
      body: message,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'btc-arbitrage',
      requireInteraction: true,
      silent: false
    });

    // Play system sound on macOS
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT');
      audio.volume = 0.3;
      audio.play().catch(() => {}); // Ignore audio errors
    } catch (e) {}

    // Auto-close after 10 seconds
    setTimeout(() => notification.close(), 10000);
    
    setLastAlertTime(now);
  };

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
      
      // Trigger macOS notification for positive arbitrage results
      if (data.arbs && data.arbs.length > 0) {
        const totalProfit = data.arbs.reduce((sum, arb) => sum + parseFloat(arb.netProfit || 0), 0);
        const message = `${data.arbs.length} BTC arbitrage${data.arbs.length > 1 ? 's' : ''} found! Total potential profit: ${totalProfit.toFixed(2)}%`;
        showMacOSNotification('🚨 BTC Arbitrage Alert!', message, data.arbs.length);
      }
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
          
          {/* Notification Status */}
          <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#888' }}>
            <span>Notifications: </span>
            <span style={{ 
              color: notificationPermission === 'granted' ? '#4ade80' : 
                     notificationPermission === 'denied' ? '#ef4444' : '#f59e0b' 
            }}>
              {notificationPermission === 'granted' ? '✅ Enabled' : 
               notificationPermission === 'denied' ? '❌ Blocked' : '⚠️ Click to Enable'}
            </span>
            {notificationPermission !== 'granted' && (
              <button
                onClick={requestNotificationPermission}
                style={{ 
                  marginLeft: '0.5rem', 
                  padding: '0.2rem 0.5rem', 
                  fontSize: '0.7rem',
                  background: '#4ade80',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer'
                }}
              >
                Enable
              </button>
            )}
          </div>
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
