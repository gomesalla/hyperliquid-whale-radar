import type { Snapshot, Kpis, WhaleEvent } from "./types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`);
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return (await r.json()) as T;
}

export const fetchSnapshot = () => getJson<Snapshot>("/api/snapshot");
export const fetchKpis = () => getJson<Kpis>("/api/kpis");
export const fetchFeed = (limit = 100) => getJson<WhaleEvent[]>(`/api/feed?limit=${limit}`);
export const fetchWallet = (addr: string) =>
  getJson<{
    address: string;
    firstSeen: string | null;
    totalTrades: number;
    totalVolume: number;
    openPositions: Array<{ coin: string; netSize: number; avgEntry: number }>;
    recent: WhaleEvent[];
  }>(`/api/wallet/${addr}`);
