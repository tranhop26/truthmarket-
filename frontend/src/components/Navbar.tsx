'use client';

import Link from 'next/link';
import { shortAddress } from '@/lib/genlayer';

export default function Navbar() {
  // Trong production: lấy từ wallet connect (MetaMask, WalletConnect...)
  // Demo: dùng địa chỉ tĩnh
  const DEMO_ADDRESS = '0x0000...0001';

  return (
    <nav className="navbar">
      <div className="container">
        <div className="navbar-inner">
          <Link href="/" className="navbar-logo">
            <div className="navbar-logo-icon">⚖️</div>
            <span className="navbar-logo-text">TruthMarket</span>
          </Link>

          <div className="navbar-actions">
            <span className="navbar-address">
              {DEMO_ADDRESS}
            </span>
            <Link href="/" className="btn btn-secondary btn-sm">
              🏠 Markets
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
