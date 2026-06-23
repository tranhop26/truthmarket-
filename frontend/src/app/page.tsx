'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAllMarkets } from '@/hooks/useContracts';
import { formatGLT, formatDeadline, isDeadlinePassed, shortAddress } from '@/lib/genlayer';
import CreateMarketModal from '@/components/CreateMarketModal';
import Navbar from '@/components/Navbar';

export default function HomePage() {
  const { markets, loading, error, refetch } = useAllMarkets();
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('all');

  const filtered = markets.filter((m) => {
    if (filter === 'active') return !m.resolved;
    if (filter === 'resolved') return m.resolved;
    return true;
  });

  return (
    <div className="page-wrapper">
      <Navbar />

      {/* Hero */}
      <section className="hero">
        <div className="container">
          <div className="hero-badge">
            <span className="hero-badge-dot" />
            Powered by GenLayer AI
          </div>

          <h1 className="hero-title">
            Who is right about{' '}
            <span className="hero-title-gradient">the subjective world?</span>
          </h1>

          <p className="hero-subtitle">
            Bet on qualitative questions that no oracle can answer.
            GenLayer&apos;s AI reads the internet and delivers its verdict — no human arbitrator needed.
          </p>

          <div className="hero-cta">
            <button
              id="btn-create-market"
              className="btn btn-primary btn-lg"
              onClick={() => setShowCreate(true)}
            >
              ✨ Create New Market
            </button>
            <a
              href="https://github.com/tranhop26/truthmarket-"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-lg"
            >
              📖 View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Markets List */}
      <section>
        <div className="container">
          {/* Header + Filter */}
          <div className="section-header">
            <h2 className="section-title">
              Prediction Markets
            </h2>
            <span className="section-count">{filtered.length} market{filtered.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Filter tabs */}
          <div className="tabs" style={{ marginBottom: '24px' }}>
            <button
              id="filter-all"
              className={`tab ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All
            </button>
            <button
              id="filter-active"
              className={`tab ${filter === 'active' ? 'active' : ''}`}
              onClick={() => setFilter('active')}
            >
              🟢 Open
            </button>
            <button
              id="filter-resolved"
              className={`tab ${filter === 'resolved' ? 'active' : ''}`}
              onClick={() => setFilter('resolved')}
            >
              ✅ Resolved
            </button>
          </div>

          {/* Loading state */}
          {loading && (
            <div className="loading-state">
              <div className="loading-spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
              <span className="loading-state-text">Loading markets from GenLayer...</span>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="card" style={{ borderColor: 'var(--no-border)', textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
              <div style={{ color: 'var(--no-color)', fontWeight: 600, marginBottom: 8 }}>
                Unable to connect to contract
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
                {error}
              </div>
              <button className="btn btn-secondary" onClick={refetch}>
                Retry
              </button>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && filtered.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">🔮</div>
              <div className="empty-state-title">No markets yet</div>
              <div className="empty-state-sub">
                Create the first prediction market about a subjective question you care about!
              </div>
              <button
                className="btn btn-primary"
                onClick={() => setShowCreate(true)}
              >
                ✨ Create First Market
              </button>
            </div>
          )}

          {/* Markets grid */}
          {!loading && !error && filtered.length > 0 && (
            <div className="markets-grid">
              {filtered.map((m) => (
                <MarketCard key={m.market_id} market={m} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Create Market Modal */}
      {showCreate && (
        <CreateMarketModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
//  Market Card Component (inline)
// ──────────────────────────────────────────────────────────

function MarketCard({ market }: { market: ReturnType<typeof useAllMarkets>['markets'][0] }) {
  const deadlinePassed = isDeadlinePassed(market.deadline);

  let statusClass = 'active';
  let statusLabel = '🟢 Open';

  if (market.resolved) {
    if (market.outcome === 'YES') {
      statusClass = 'resolved-yes';
      statusLabel = '✅ YES';
    } else {
      statusClass = 'resolved-no';
      statusLabel = '❌ NO';
    }
  } else if (deadlinePassed) {
    statusClass = 'pending';
    statusLabel = '⏳ Awaiting resolution';
  }

  return (
    <Link href={`/market/${market.market_id}`} style={{ textDecoration: 'none' }}>
      <div
        id={`market-card-${market.market_id}`}
        className="card market-card"
      >
        {/* Header */}
        <div className="card-header">
          <span className={`market-status-badge ${statusClass}`}>
            {statusLabel}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            #{market.market_id}
          </span>
        </div>

        {/* Question */}
        <p
          className="card-title"
          style={{
            marginBottom: 16,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {market.question}
        </p>

        {/* Odds Bar */}
        <OddsBar yesPct={market.yes_pct} />

        {/* Stats */}
        <div className="divider" style={{ margin: '12px 0' }} />
        <div className="stats-row">
          <div className="stat-item">
            <span className="stat-label">Total Pool</span>
            <span className="stat-value">{formatGLT(market.total_pool)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Deadline</span>
            <span className="stat-value">{formatDeadline(market.deadline)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ──────────────────────────────────────────────────────────
//  Odds Bar (inline)
// ──────────────────────────────────────────────────────────

function OddsBar({ yesPct }: { yesPct: number }) {
  return (
    <div className="odds-bar-container">
      <div className="odds-labels">
        <span className="odds-label-yes">YES {yesPct}%</span>
        <span className="odds-label-no">NO {100 - yesPct}%</span>
      </div>
      <div className="odds-bar">
        <div
          className="odds-bar-yes"
          style={{ width: `${yesPct}%` }}
        />
        <div
          className="odds-bar-no-fill"
          style={{ width: `${100 - yesPct}%` }}
        />
      </div>
    </div>
  );
}
