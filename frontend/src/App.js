import React, { useState, useEffect } from 'react';
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
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMarkets();
    fetchWallet();

    // Auto-refresh markets every 60 seconds
    const interval = setInterval(() => {
      fetchMarkets();
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const fetchMarkets = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/markets');
      const marketsData = Array.isArray(response.data?.markets)
        ? response.data.markets
        : Array.isArray(response.data)
          ? response.data
          : [];
      setMarkets(marketsData);
    } catch (error) {
      console.error('Error fetching markets:', error);
    }
  };

  const fetchWallet = async () => {
    try {
      // For demo purposes, skip wallet fetch since we don't have a real EOA address
      // In production, you'd get the EOA from user's connected wallet
      setWallet(null);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching wallet:', error);
      setWallet(null);
      setLoading(false);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Prediction Markets Trading Dashboard</h1>
      </header>
      <main>
        {loading ? (
          <div>Loading...</div>
        ) : (
          <div className="dashboard">
            <Wallet wallet={wallet} />
            <div className="arb-bots-grid">
              <AutoBot />
              <ArbitrageScanner />
              <BtcArbScanner />
              <BtcIntraArbScanner />
            </div>
            <MarketList markets={markets} />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
