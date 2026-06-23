'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMarket, useUserStake, useDispute, useResolveMarket, usePlaceStake, useClaimPayout, useRaiseDispute } from '@/hooks/useContracts';
import { formatGLT, formatDeadline, isDeadlinePassed, shortAddress } from '@/lib/genlayer';
import Navbar from '@/components/Navbar';

// Demo account — in production this would come from wallet connect
const DEMO_ACCOUNT = '0x0000000000000000000000000000000000000001' as `0x${string}`;

export default function MarketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const marketId = parseInt(params.id as string);

  const { market, loading, error, refetch } = useMarket(marketId);
  const { stake, refetch: refetchStake } = useUserStake(marketId, DEMO_ACCOUNT);
  const { dispute } = useDispute(marketId);

  const { resolveMarket, loading: resolving } = useResolveMarket();
  const { placeStake, loading: staking } = usePlaceStake();
  const { claimPayout, loading: claiming } = useClaimPayout();
  const { raiseDispute, loading: disputing } = useRaiseDispute();

  const [selectedSide, setSelectedSide] = useState<boolean | null>(null);
  const [stakeAmount, setStakeAmount] = useState('');
  const [activeTab, setActiveTab] = useState<'stake' | 'resolve' | 'dispute'>('stake');
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; title: string; msg: string } | null>(null);
  const [extraSources, setExtraSources] = useState('');

  const showToast = (type: 'success' | 'error' | 'info', title: string, msg: string) => {
    setToast({ type, title, msg });
    setTimeout(() => setToast(null), 5000);
  };

  const deadlinePassed = market ? isDeadlinePassed(market.deadline) : false;

  // ── Handle: Place Stake ──
  const handleStake = async () => {
    if (selectedSide === null || !stakeAmount) return;
    const amount = BigInt(Math.floor(parseFloat(stakeAmount) * 1_000_000));

    const result = await placeStake({ marketId, side: selectedSide, amount, account: DEMO_ACCOUNT });

    if (result.success) {
      showToast('success', 'Stake placed!', `Tx: ${shortAddress(result.hash ?? '')}`);
      refetch();
      refetchStake();
      setStakeAmount('');
    } else {
      showToast('error', 'Stake failed', result.error ?? '');
    }
  };

  // ── Handle: Resolve ──
  const handleResolve = async () => {
    showToast('info', 'AI is analyzing...', 'This process may take 30–120 seconds. Please wait.');
    const result = await resolveMarket({ marketId, account: DEMO_ACCOUNT });

    if (result.success) {
      showToast('success', 'Verdict reached!', 'The AI has read the internet and delivered a result.');
      refetch();
    } else {
      showToast('error', 'Resolution failed', result.error ?? '');
    }
  };

  // ── Handle: Claim ──
  const handleClaim = async () => {
    const result = await claimPayout({ marketId, account: DEMO_ACCOUNT });

    if (result.success) {
      showToast('success', 'Payout claimed!', `Tx: ${shortAddress(result.hash ?? '')}`);
      refetch();
      refetchStake();
    } else {
      showToast('error', 'Claim failed', result.error ?? '');
    }
  };

  // ── Handle: Dispute ──
  const handleDispute = async () => {
    const sources = extraSources.split('\n').map(s => s.trim()).filter(Boolean);
    if (sources.length === 0) {
      showToast('error', 'Missing extra sources', 'Please provide at least 1 additional source URL.');
      return;
    }

    const result = await raiseDispute({
      marketId,
      extraSources: sources,
      originalOutcome: market?.outcome ?? 'NO',
      bondAmount: BigInt(100_000),
      account: DEMO_ACCOUNT,
    });

    if (result.success) {
      showToast('success', 'Dispute submitted!', 'Bond locked. Final resolve expected within 2 hours.');
      refetch();
    } else {
      showToast('error', 'Dispute failed', result.error ?? '');
    }
  };

  if (loading) {
    return (
      <div className="page-wrapper">
        <Navbar />
        <div className="loading-state" style={{ marginTop: 80 }}>
          <div className="loading-spinner" style={{ width: 40, height: 40, borderWidth: 3 }} />
          <span className="loading-state-text">Loading market from GenLayer...</span>
        </div>
      </div>
    );
  }

  if (error || !market) {
    return (
      <div className="page-wrapper">
        <Navbar />
        <div className="container" style={{ paddingTop: 60 }}>
          <div className="card" style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Market not found</div>
            <div style={{ color: 'var(--text-muted)', marginBottom: 24 }}>{error}</div>
            <button className="btn btn-secondary" onClick={() => router.push('/')}>← Back to markets</button>
          </div>
        </div>
      </div>
    );
  }

  const totalPool = market.yes_pool + market.no_pool;
  const userHasYes = (stake?.yes_stake ?? 0) > 0;
  const userHasNo = (stake?.no_stake ?? 0) > 0;
  const userIsWinner =
    (market.outcome === 'YES' && userHasYes) ||
    (market.outcome === 'NO' && userHasNo);

  return (
    <div className="page-wrapper">
      <Navbar />

      <div className="container" style={{ paddingTop: 40 }}>
        {/* Back */}
        <button
          id="btn-back"
          className="btn btn-secondary btn-sm"
          onClick={() => router.push('/')}
          style={{ marginBottom: 24 }}
        >
          ← All Markets
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24, alignItems: 'start' }}>
          {/* ── LEFT COLUMN ── */}
          <div>
            {/* Market Info */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-meta">
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  Market #{market.market_id}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>•</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Creator: {shortAddress(market.creator)}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>•</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {formatDeadline(market.deadline)}
                </span>
              </div>

              <h1 style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.4, marginBottom: 24, letterSpacing: '-0.5px' }}>
                {market.question}
              </h1>

              {/* Odds Bar */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--yes-color)' }}>
                    YES — {market.yes_pct}%
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--no-color)' }}>
                    NO — {market.no_pct}%
                  </span>
                </div>
                <div className="odds-bar" style={{ height: 12 }}>
                  <div className="odds-bar-yes" style={{ width: `${market.yes_pct}%` }} />
                  <div className="odds-bar-no-fill" style={{ width: `${market.no_pct}%` }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {formatGLT(market.yes_pool)} staked
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {formatGLT(market.no_pool)} staked
                  </span>
                </div>
              </div>

              {/* Pool stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                <div style={{ background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }}>
                  <div className="stat-label">Total Pool</div>
                  <div className="stat-value">{formatGLT(totalPool)}</div>
                </div>
                <div style={{ background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }}>
                  <div className="stat-label">Deadline</div>
                  <div className="stat-value" style={{ fontSize: 12 }}>{new Date(market.deadline * 1000).toLocaleDateString('en-US')}</div>
                </div>
                <div style={{ background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }}>
                  <div className="stat-label">Status</div>
                  <div className="stat-value" style={{ fontSize: 12, color: market.resolved ? 'var(--yes-color)' : 'var(--brand-cyan)' }}>
                    {market.resolved ? '✅ Resolved' : deadlinePassed ? '⏳ Awaiting resolution' : '🟢 Open'}
                  </div>
                </div>
              </div>
            </div>

            {/* VERDICT PANEL (if resolved) */}
            {market.resolved && (
              <div className={`verdict-panel ${market.outcome.toLowerCase()}`} style={{ marginBottom: 20 }}>
                <span className="verdict-emoji">
                  {market.outcome === 'YES' ? '🟢' : '🔴'}
                </span>
                <div className="verdict-label">AI Verdict</div>
                <div className={`verdict-value ${market.outcome.toLowerCase()}`}>
                  {market.outcome}
                </div>

                {/* Reasoning — important UX: show AI's reasoning */}
                {market.reasoning && (
                  <div className="verdict-reasoning">
                    <div className="verdict-reasoning-label">💭 AI reasoning:</div>
                    {market.reasoning}
                  </div>
                )}

                {/* Claim button */}
                {userIsWinner && !stake?.claimed && (
                  <button
                    id="btn-claim-payout"
                    className="btn btn-primary"
                    style={{ marginTop: 20, width: '100%' }}
                    onClick={handleClaim}
                    disabled={claiming}
                  >
                    {claiming ? (
                      <><div className="loading-spinner" /> Processing...</>
                    ) : (
                      '💰 Claim Payout'
                    )}
                  </button>
                )}

                {stake?.claimed && (
                  <div style={{ marginTop: 16, padding: '10px 16px', background: 'rgba(16,185,129,0.1)', borderRadius: 'var(--radius-md)', color: 'var(--yes-color)', fontSize: 14, fontWeight: 600 }}>
                    ✅ Payout already claimed
                  </div>
                )}
              </div>
            )}

            {/* AI Resolving loading state */}
            {resolving && (
              <div className="ai-resolving" style={{ marginBottom: 20 }}>
                <div className="ai-resolving-spinner" />
                <div className="ai-resolving-title">AI is analyzing evidence...</div>
                <div className="ai-resolving-steps">
                  <div className="ai-step active">
                    <div className="ai-step-icon" />
                    Reading content from source URLs
                  </div>
                  <div className="ai-step active">
                    <div className="ai-step-icon" />
                    Calling LLM to analyze evidence
                  </div>
                  <div className="ai-step active">
                    <div className="ai-step-icon" />
                    Validators reaching consensus
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                  This usually takes 30–120 seconds depending on the number of validators
                </div>
              </div>
            )}

            {/* Sources */}
            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 15 }}>
                📰 AI Data Sources
              </div>
              <div className="sources-list">
                {market.sources.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="source-item"
                  >
                    <span className="source-item-icon">🔗</span>
                    <span className="source-item-url">{url}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div style={{ position: 'sticky', top: 80 }}>
            {/* User Stake Summary */}
            {(stake?.yes_stake ?? 0) + (stake?.no_stake ?? 0) > 0 && (
              <div className="card" style={{ marginBottom: 16, borderColor: 'rgba(124,58,237,0.3)' }}>
                <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>📊 Your Stake</div>
                {(stake?.yes_stake ?? 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ color: 'var(--yes-color)', fontSize: 14 }}>YES</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>{formatGLT(stake!.yes_stake)}</span>
                  </div>
                )}
                {(stake?.no_stake ?? 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--no-color)', fontSize: 14 }}>NO</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>{formatGLT(stake!.no_stake)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Action Tabs */}
            {!market.resolved && (
              <div className="card">
                <div className="tabs" style={{ marginBottom: 20 }}>
                  <button
                    id="tab-stake"
                    className={`tab ${activeTab === 'stake' ? 'active' : ''}`}
                    onClick={() => setActiveTab('stake')}
                  >
                    💰 Stake
                  </button>
                  {deadlinePassed && (
                    <button
                      id="tab-resolve"
                      className={`tab ${activeTab === 'resolve' ? 'active' : ''}`}
                      onClick={() => setActiveTab('resolve')}
                    >
                      🤖 Resolve
                    </button>
                  )}
                </div>

                {/* Stake Tab */}
                {activeTab === 'stake' && !deadlinePassed && (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>Place a Stake</div>

                    {/* Side Selection */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                      <button
                        id="btn-yes"
                        className={`btn btn-yes ${selectedSide === true ? 'selected' : ''}`}
                        onClick={() => setSelectedSide(true)}
                        style={{ justifyContent: 'center', padding: '16px' }}
                      >
                        ✅ YES
                      </button>
                      <button
                        id="btn-no"
                        className={`btn btn-no ${selectedSide === false ? 'selected' : ''}`}
                        onClick={() => setSelectedSide(false)}
                        style={{ justifyContent: 'center', padding: '16px' }}
                      >
                        ❌ NO
                      </button>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Amount (GLT)</label>
                      <input
                        id="input-stake-amount"
                        type="number"
                        className="form-input"
                        placeholder="0.1"
                        min="0"
                        step="0.01"
                        value={stakeAmount}
                        onChange={(e) => setStakeAmount(e.target.value)}
                      />
                      <div className="form-hint">
                        {selectedSide !== null && stakeAmount && (
                          <>Current odds: {selectedSide ? market.yes_pct : market.no_pct}%</>
                        )}
                      </div>
                    </div>

                    <button
                      id="btn-place-stake"
                      className="btn btn-primary"
                      style={{ width: '100%', justifyContent: 'center' }}
                      onClick={handleStake}
                      disabled={staking || selectedSide === null || !stakeAmount}
                    >
                      {staking ? (
                        <><div className="loading-spinner" /> Submitting...</>
                      ) : (
                        `Stake ${selectedSide === true ? 'YES' : selectedSide === false ? 'NO' : '?'}`
                      )}
                    </button>
                  </div>
                )}

                {/* Resolve Tab */}
                {activeTab === 'resolve' && deadlinePassed && (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>🤖 Resolve with AI</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.7 }}>
                      The AI will read all source URLs and deliver a verdict. This may take <strong style={{ color: 'var(--text-secondary)' }}>30–120 seconds</strong>.
                    </div>

                    <div style={{ background: 'var(--gradient-brand-subtle)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 20, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                      💡 Process: Read web → Call LLM → Achieve consensus among GenLayer validators
                    </div>

                    <button
                      id="btn-resolve"
                      className="btn btn-primary"
                      style={{ width: '100%', justifyContent: 'center' }}
                      onClick={handleResolve}
                      disabled={resolving}
                    >
                      {resolving ? (
                        <><div className="loading-spinner" /> AI analyzing...</>
                      ) : (
                        '🚀 Trigger AI Resolution'
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Dispute Panel (after resolved, within 2h window) */}
            {market.resolved && !dispute?.active && !dispute?.resolved && (
              <div className="card" style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>⚖️ Appeal the Verdict</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.7 }}>
                  Disagree with the verdict? Submit an appeal with additional sources. Bond: 100,000 wei.
                </div>

                <div className="form-group">
                  <label className="form-label">Additional source URLs (one per line)</label>
                  <textarea
                    id="input-extra-sources"
                    className="form-textarea"
                    placeholder={"https://new-source1.com\nhttps://new-source2.com"}
                    value={extraSources}
                    onChange={(e) => setExtraSources(e.target.value)}
                    style={{ minHeight: 80 }}
                  />
                </div>

                <button
                  id="btn-raise-dispute"
                  className="btn btn-secondary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={handleDispute}
                  disabled={disputing}
                >
                  {disputing ? (
                    <><div className="loading-spinner" /> Submitting...</>
                  ) : (
                    '🛡️ Submit Appeal (100k wei)'
                  )}
                </button>
              </div>
            )}

            {/* Active dispute info */}
            {dispute?.active && (
              <div className="card" style={{ marginTop: 16, borderColor: 'rgba(245,158,11,0.3)' }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: '#f59e0b' }}>⏳ Active Appeal</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Appellant: {shortAddress(dispute.initiator)}<br />
                  Bond: {formatGLT(dispute.bond)}<br />
                  Final resolve expected 2 hours after appeal was raised.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>
            <span className="toast-icon">
              {toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : 'ℹ️'}
            </span>
            <div className="toast-text">
              <div className="toast-title">{toast.title}</div>
              {toast.msg && <div className="toast-message">{toast.msg}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
