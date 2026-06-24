/**
 * TruthMarket — Contract hooks
 *
 * Reads use glClient (read-only, no account).
 * Writes use walletClient from WalletContext (MetaMask signer).
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { glClient, CONTRACT_ADDRESSES } from '@/lib/genlayer';
import { useWallet } from '@/context/WalletContext';
import { parseEther } from 'viem';

// ──────────────────────────────────────────────────────────
//  Types
// ──────────────────────────────────────────────────────────

export interface Market {
  market_id: number;
  question: string;
  sources: string[];
  deadline: number;
  creator: string;
  resolved: boolean;
  outcome: 'YES' | 'NO' | 'UNRESOLVED';
  reasoning: string;
  resolved_at: number;
  yes_pool: number;
  no_pool: number;
  total_pool: number;
  yes_pct: number;
  no_pct: number;
}

export interface MarketSummary {
  market_id: number;
  question: string;
  deadline: number;
  resolved: boolean;
  outcome: string;
  yes_pct: number;
  total_pool: number;
}

export interface UserStake {
  yes_stake: number;
  no_stake: number;
  claimed: boolean;
}

export interface Dispute {
  market_id: number;
  active: boolean;
  initiator: string;
  bond: number;
  raised_at: number;
  resolved: boolean;
  original_outcome: string;
}

// ──────────────────────────────────────────────────────────
//  Write helper — enforces wallet connection
// ──────────────────────────────────────────────────────────

function useWriteHook() {
  const { client: walletClient, address } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function execute(fn: () => Promise<unknown>) {
    if (!walletClient || !address) {
      const msg = 'Wallet not connected. Click "🦊 Connect" in the top-right corner.';
      setError(msg);
      return { success: false, error: msg };
    }
    setLoading(true);
    setError(null);
    try {
      const hash = await fn();
      return { success: true, hash: hash as string };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  }

  return { loading, error, execute, walletClient };
}

// ──────────────────────────────────────────────────────────
//  Read Hooks
// ──────────────────────────────────────────────────────────

export function useAllMarkets() {
  const [markets, setMarkets] = useState<MarketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!CONTRACT_ADDRESSES.market) {
      setError('NEXT_PUBLIC_MARKET_CONTRACT_ADDRESS is not configured');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const result = await glClient.readContract({
        address: CONTRACT_ADDRESSES.market,
        functionName: 'get_all_markets_summary',
        args: [],
      });
      const parsed: MarketSummary[] = JSON.parse(result as string);
      setMarkets(parsed.reverse());
    } catch (err: unknown) {
      setError(`Error reading markets: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
    const interval = setInterval(refetch, 30_000);
    return () => clearInterval(interval);
  }, [refetch]);

  return { markets, loading, error, refetch };
}

export function useMarket(marketId: number) {
  const [market, setMarket] = useState<Market | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!CONTRACT_ADDRESSES.market) { setError('Contract address not configured'); setLoading(false); return; }
    try {
      setLoading(true);
      setError(null);
      const result = await glClient.readContract({
        address: CONTRACT_ADDRESSES.market,
        functionName: 'get_market',
        args: [BigInt(marketId)],
      });
      setMarket(JSON.parse(result as string));
    } catch (err: unknown) {
      setError(`Error reading market: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => {
    refetch();
    const interval = setInterval(refetch, 15_000);
    return () => clearInterval(interval);
  }, [refetch]);

  return { market, loading, error, refetch };
}

export function useUserStake(marketId: number, userAddress: string) {
  const [stake, setStake] = useState<UserStake | null>(null);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!CONTRACT_ADDRESSES.market || !userAddress) return;
    try {
      setLoading(true);
      const result = await glClient.readContract({
        address: CONTRACT_ADDRESSES.market,
        functionName: 'get_user_stake',
        args: [BigInt(marketId), userAddress],
      });
      setStake(JSON.parse(result as string));
    } catch { setStake(null); }
    finally { setLoading(false); }
  }, [marketId, userAddress]);

  // Fix: poll every 15s so stake stays fresh
  useEffect(() => {
    refetch();
    const t = setInterval(refetch, 15_000);
    return () => clearInterval(t);
  }, [refetch]);

  return { stake, loading, refetch };
}

export function useDispute(marketId: number) {
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!CONTRACT_ADDRESSES.disputeResolver) return;
    try {
      setLoading(true);
      const result = await glClient.readContract({
        address: CONTRACT_ADDRESSES.disputeResolver,
        functionName: 'get_dispute',
        args: [BigInt(marketId)],
      });
      setDispute(JSON.parse(result as string));
    } catch { setDispute(null); }
    finally { setLoading(false); }
  }, [marketId]);

  // Fix: expose refetch + poll every 30s
  useEffect(() => {
    refetch();
    const t = setInterval(refetch, 30_000);
    return () => clearInterval(t);
  }, [refetch]);

  return { dispute, loading, refetch };
}

// ──────────────────────────────────────────────────────────
//  Write Hooks — use walletClient (MetaMask)
// ──────────────────────────────────────────────────────────

export function useCreateMarket() {
  const { loading, error, execute, walletClient } = useWriteHook();

  const createMarket = useCallback(async (params: {
    question: string;
    sources: string[];
    deadlineTimestamp: number;
  }) => {
    return execute(() =>
      walletClient!.writeContract({
        address: CONTRACT_ADDRESSES.market,
        functionName: 'create_market',
        args: [params.question, JSON.stringify(params.sources), BigInt(params.deadlineTimestamp)],
        value: 0n,
      })
    );
  }, [execute, walletClient]);

  return { createMarket, loading, error };
}

export function usePlaceStake() {
  const { loading, error, execute, walletClient } = useWriteHook();

  const placeStake = useCallback(async (params: {
    marketId: number;
    side: boolean;
    amountGEN: string; // Fix #5: accept GEN string, convert with parseEther
  }) => {
    return execute(() =>
      walletClient!.writeContract({
        address: CONTRACT_ADDRESSES.market,
        functionName: 'place_stake',
        args: [BigInt(params.marketId), params.side],
        value: parseEther(params.amountGEN), // 18 decimals
      })
    );
  }, [execute, walletClient]);

  return { placeStake, loading, error };
}

export function useResolveMarket() {
  const { loading, error, execute, walletClient } = useWriteHook();

  const resolveMarket = useCallback(async (marketId: number) => {
    return execute(() =>
      walletClient!.writeContract({
        address: CONTRACT_ADDRESSES.market,
        functionName: 'resolve_market',
        args: [BigInt(marketId)],
        value: 0n,
        consensusMaxRotations: 5,
      })
    );
  }, [execute, walletClient]);

  return { resolveMarket, loading, error };
}

export function useClaimPayout() {
  const { loading, error, execute, walletClient } = useWriteHook();

  const claimPayout = useCallback(async (marketId: number) => {
    return execute(() =>
      walletClient!.writeContract({
        address: CONTRACT_ADDRESSES.market,
        functionName: 'claim_payout',
        args: [BigInt(marketId)],
        value: 0n,
      })
    );
  }, [execute, walletClient]);

  return { claimPayout, loading, error };
}

export function useRaiseDispute() {
  const { loading, error, execute, walletClient } = useWriteHook();

  // Fix #5: bondAmountGEN string → parseEther (18 decimals)
  const raiseDispute = useCallback(async (params: {
    marketId: number;
    extraSources: string[];
    originalOutcome: string;
    bondAmountGEN: string;
  }) => {
    return execute(() =>
      walletClient!.writeContract({
        address: CONTRACT_ADDRESSES.disputeResolver,
        functionName: 'raise_dispute',
        args: [BigInt(params.marketId), params.originalOutcome, JSON.stringify(params.extraSources)],
        value: parseEther(params.bondAmountGEN),
      })
    );
  }, [execute, walletClient]);

  return { raiseDispute, loading, error };
}
