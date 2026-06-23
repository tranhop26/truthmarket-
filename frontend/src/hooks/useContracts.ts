/**
 * TruthMarket — Contract hooks
 *
 * React hooks for reading and writing state to the 3 GenLayer contracts.
 * All calls are REAL — no mocks or hardcoded data.
 * API follows genlayer-js v1.x: readContract / writeContract
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { glClient, CONTRACT_ADDRESSES } from '@/lib/genlayer';

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
//  Read Hooks
// ──────────────────────────────────────────────────────────

/**
 * Hook: read the list of all markets from the contract (live)
 */
export function useAllMarkets() {
  const [markets, setMarkets] = useState<MarketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!CONTRACT_ADDRESSES.market) {
      setError('NEXT_PUBLIC_MARKET_CONTRACT_ADDRESS is not configured in .env.local');
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
      setMarkets(parsed.reverse()); // newest first
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Error reading markets: ${msg}`);
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

/**
 * Hook: read details of a single market by market_id (live)
 */
export function useMarket(marketId: number) {
  const [market, setMarket] = useState<Market | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!CONTRACT_ADDRESSES.market) {
      setError('Contract address not configured');
      setLoading(false);
      return;
    }

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
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Error reading market: ${msg}`);
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

/**
 * Hook: read a user's stake in a market (live)
 */
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
    } catch {
      setStake(null);
    } finally {
      setLoading(false);
    }
  }, [marketId, userAddress]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { stake, loading, refetch };
}

/**
 * Hook: read dispute information for a market (live)
 */
export function useDispute(marketId: number) {
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!CONTRACT_ADDRESSES.disputeResolver) return;

    const fetchDispute = async () => {
      try {
        setLoading(true);
        const result = await glClient.readContract({
          address: CONTRACT_ADDRESSES.disputeResolver,
          functionName: 'get_dispute',
          args: [BigInt(marketId)],
        });
        setDispute(JSON.parse(result as string));
      } catch {
        setDispute(null);
      } finally {
        setLoading(false);
      }
    };

    fetchDispute();
  }, [marketId]);

  return { dispute, loading };
}

// ──────────────────────────────────────────────────────────
//  Write Hooks — using real glClient.writeContract calls
// ──────────────────────────────────────────────────────────

/**
 * Hook: create a new market (real contract call)
 */
export function useCreateMarket() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createMarket = useCallback(async (params: {
    question: string;
    sources: string[];
    deadlineTimestamp: number;
    account: `0x${string}`;
  }) => {
    setLoading(true);
    setError(null);

    try {
      // writeContract genlayer-js v1.x: value is required (even if 0n)
      const hash = await glClient.writeContract({
        address: CONTRACT_ADDRESSES.market,
        functionName: 'create_market',
        args: [
          params.question,
          JSON.stringify(params.sources),
          BigInt(params.deadlineTimestamp),
        ],
        value: 0n,
      });

      return { success: true, hash: hash as string };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  }, []);

  return { createMarket, loading, error };
}

/**
 * Hook: place a stake (real contract call, payable)
 */
export function usePlaceStake() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placeStake = useCallback(async (params: {
    marketId: number;
    side: boolean;
    amount: bigint;
    account: `0x${string}`;
  }) => {
    setLoading(true);
    setError(null);

    try {
      const hash = await glClient.writeContract({
        address: CONTRACT_ADDRESSES.market,
        functionName: 'place_stake',
        args: [BigInt(params.marketId), params.side],
        value: params.amount,
      });

      return { success: true, hash: hash as string };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  }, []);

  return { placeStake, loading, error };
}

/**
 * Hook: resolve a market — triggers AI resolution
 * NOTE: this can take 30–120s (AI reads web + LLM + consensus)
 */
export function useResolveMarket() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolveMarket = useCallback(async (params: {
    marketId: number;
    account: `0x${string}`;
  }) => {
    setLoading(true);
    setError(null);

    try {
      const hash = await glClient.writeContract({
        address: CONTRACT_ADDRESSES.market,
        functionName: 'resolve_market',
        args: [BigInt(params.marketId)],
        value: 0n,
        // Increase timeout because AI resolution takes time
        consensusMaxRotations: 5,
      });

      return { success: true, hash: hash as string };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  }, []);

  return { resolveMarket, loading, error };
}

/**
 * Hook: claim payout (real contract call)
 */
export function useClaimPayout() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const claimPayout = useCallback(async (params: {
    marketId: number;
    account: `0x${string}`;
  }) => {
    setLoading(true);
    setError(null);

    try {
      const hash = await glClient.writeContract({
        address: CONTRACT_ADDRESSES.market,
        functionName: 'claim_payout',
        args: [BigInt(params.marketId)],
        value: 0n,
      });

      return { success: true, hash: hash as string };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  }, []);

  return { claimPayout, loading, error };
}

/**
 * Hook: raise a dispute (real contract call, payable bond)
 */
export function useRaiseDispute() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const raiseDispute = useCallback(async (params: {
    marketId: number;
    extraSources: string[];
    originalOutcome: string;
    bondAmount: bigint;
    account: `0x${string}`;
  }) => {
    setLoading(true);
    setError(null);

    try {
      const hash = await glClient.writeContract({
        address: CONTRACT_ADDRESSES.disputeResolver,
        functionName: 'raise_dispute',
        args: [
          BigInt(params.marketId),
          params.originalOutcome,               // market_id, original_outcome, extra_sources_json
          JSON.stringify(params.extraSources),
        ],
        value: params.bondAmount,
      });

      return { success: true, hash: hash as string };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setLoading(false);
    }
  }, []);

  return { raiseDispute, loading, error };
}
