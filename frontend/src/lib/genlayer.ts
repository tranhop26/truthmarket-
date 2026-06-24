/**
 * TruthMarket — genlayer-js client + utilities
 * Read-only glClient: no account needed for view calls.
 * Write calls go through WalletContext (MetaMask signer).
 */

import { createClient, chains } from 'genlayer-js';
import { formatEther } from 'viem';

export const CONTRACT_ADDRESSES = {
  market:          (process.env.NEXT_PUBLIC_MARKET_CONTRACT_ADDRESS          ?? '') as `0x${string}`,
  registry:        (process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ADDRESS        ?? '') as `0x${string}`,
  disputeResolver: (process.env.NEXT_PUBLIC_DISPUTE_RESOLVER_ADDRESS         ?? '') as `0x${string}`,
};

// Read-only client — no account; writes use WalletContext (MetaMask)
export const glClient = createClient({ chain: chains.studionet });

// Fix #5: GEN has 18 decimals — use viem's formatEther
export function formatGLT(wei: number | bigint): string {
  const n = typeof wei === 'bigint' ? wei : BigInt(Math.round(Number(wei)));
  if (n === 0n) return '0 GEN';
  const num = parseFloat(formatEther(n));
  if (num < 0.0001) return `${n.toString()} wei`;
  return `${num.toFixed(4).replace(/\.?0+$/, '')} GEN`;
}

export function formatDeadline(ts: number): string {
  if (!ts) return 'No deadline';
  const diff = ts * 1000 - Date.now();
  if (diff < 0) {
    const abs = Math.abs(diff);
    if (abs < 3_600_000) return `${Math.floor(abs / 60_000)}m ago`;
    if (abs < 86_400_000) return `${Math.floor(abs / 3_600_000)}h ago`;
    return `${Math.floor(abs / 86_400_000)}d ago`;
  }
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m left`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h left`;
  return `${Math.floor(diff / 86_400_000)}d left`;
}

export function isDeadlinePassed(ts: number): boolean {
  return ts > 0 && Date.now() / 1000 > ts;
}

export function shortAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr || '—';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
