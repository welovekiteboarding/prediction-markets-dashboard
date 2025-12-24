import React from 'react';

function Wallet({ wallet }) {
  if (!wallet) {
    return (
      <div className="wallet">
        <h2>Wallet</h2>
        <div className="wallet-info">
          <p><em>Wallet not connected. Connect your wallet to view balance.</em></p>
        </div>
      </div>
    );
  }

  return (
    <div className="wallet">
      <h2>Wallet</h2>
      <div className="wallet-info">
        <p><strong>Balance:</strong> ${wallet.balance?.toFixed(2) || 'N/A'}</p>
        <p><strong>Available:</strong> ${wallet.available?.toFixed(2) || 'N/A'}</p>
        <p><strong>Locked:</strong> ${wallet.locked?.toFixed(2) || 'N/A'}</p>
      </div>
    </div>
  );
}

export default Wallet;
