'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@/context/WalletContext';

function shortAddr(addr: string) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function Navbar() {
  const { address, isConnecting, connect, disconnect } = useWallet();
  const [showMenu, setShowMenu] = useState(false);

  return (
    <nav className="navbar">
      <div className="container">
        <div className="navbar-inner">
          <Link href="/" className="navbar-logo">
            <div className="navbar-logo-icon">⚖️</div>
            <span className="navbar-logo-text">TruthMarket</span>
          </Link>

          <div className="navbar-actions">
            <span className="navbar-badge studionet">● Studionet</span>

            {address ? (
              <div style={{ position: 'relative' }}>
                <button
                  id="btn-wallet-menu"
                  className="navbar-address"
                  style={{ cursor: 'pointer', background: 'rgba(251,191,36,0.1)', borderColor: 'var(--gold)' }}
                  onClick={() => setShowMenu(v => !v)}
                >
                  👤 {shortAddr(address)} ▾
                </button>
                {showMenu && (
                  <div className="wallet-dropdown">
                    <div className="wallet-dropdown-addr">{address}</div>
                    <hr className="wallet-dropdown-divider" />
                    <button
                      id="btn-disconnect"
                      className="wallet-dropdown-disconnect"
                      onClick={() => { disconnect(); setShowMenu(false); }}
                    >
                      🔌 Disconnect
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                id="btn-connect-wallet"
                className="btn btn-gold btn-sm"
                onClick={connect}
                disabled={isConnecting}
              >
                {isConnecting ? 'Connecting…' : '🦊 Connect'}
              </button>
            )}

            <Link href="/" className="btn btn-secondary btn-sm">🏠 Markets</Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
