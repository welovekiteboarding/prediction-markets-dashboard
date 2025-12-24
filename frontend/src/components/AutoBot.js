import React, { useState, useEffect } from 'react';
import axios from 'axios';

function AutoBot() {
  const [isRunning, setIsRunning] = useState(false);
  const [strategy, setStrategy] = useState('momentum');
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    checkBotStatus();
  }, []);

  const checkBotStatus = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/bot/status');
      setIsRunning(response.data.running);
      setStrategy(response.data.strategy);
    } catch (error) {
      console.error('Error checking bot status:', error);
    }
  };

  const startBot = async () => {
    try {
      await axios.post('http://localhost:5000/api/bot/start', { strategy });
      setIsRunning(true);
      addLog('Bot started with ' + strategy + ' strategy');
    } catch (error) {
      console.error('Error starting bot:', error);
      addLog('Error starting bot');
    }
  };

  const stopBot = async () => {
    try {
      await axios.post('http://localhost:5000/api/bot/stop');
      setIsRunning(false);
      addLog('Bot stopped');
    } catch (error) {
      console.error('Error stopping bot:', error);
      addLog('Error stopping bot');
    }
  };

  const addLog = (message) => {
    setLogs(prev => [...prev, new Date().toLocaleTimeString() + ': ' + message]);
  };

  return (
    <div className="bot-card">
      <div className="bot-header">
        <h2>Auto-Bot Trading</h2>
      </div>
      
      <div className="bot-body">
        <div className="bot-controls-row">
          <div style={{ flex: 1 }}>
            <label className="bot-label">Strategy</label>
            <select 
              value={strategy} 
              onChange={(e) => setStrategy(e.target.value)}
              className="bot-select"
            >
              <option value="momentum">Momentum</option>
              <option value="mean-reversion">Mean Reversion</option>
              <option value="arbitrage">Arbitrage</option>
            </select>
          </div>
        </div>

        <div>
          <div className="bot-label">Status: <span style={{ color: isRunning ? '#4ade80' : '#ccc' }}>{isRunning ? 'Running' : 'Stopped'}</span></div>
          <div className="bot-label">Current Strategy: <span style={{ color: '#fff' }}>{strategy}</span></div>
        </div>

        <div className="bot-action-area">
          {!isRunning ? (
            <button onClick={startBot} className="bot-primary-btn">Start Bot</button>
          ) : (
            <button onClick={stopBot} className="bot-primary-btn bot-stop-btn">Stop Bot</button>
          )}
        </div>
      </div>

      <div className="bot-footer">
        <div className="bot-label" style={{ marginBottom: '0.25rem' }}>Trading Logs</div>
        <div className="bot-logs-window" style={{ height: '100px' }}>
          {logs.length === 0 ? (
            <div className="log-line log-info">Ready to start...</div>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="log-line">{log}</div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default AutoBot;
