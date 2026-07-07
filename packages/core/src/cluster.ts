import type { Direction, PositionChange } from "./types.js";

interface CEv { coin: string; direction: Direction; usd: number; taker: string; ts: number; change: PositionChange; }

export interface Cluster {
  coin: string;
  direction: Direction;
  walletCount: number;
  totalUsd: number;
  strength: number;
  confidence: "High" | "Medium" | "Low";
}

interface Opts { windowMs: number; now: number; minWallets: number; minTotalUsd: number; }

export function detectClusters(events: CEv[], o: Opts): Cluster[] {
  const cutoff = o.now - o.windowMs;
  const groups = new Map<string, { wallets: Set<string>; usd: number; coin: string; direction: Direction }>();
  for (const e of events) {
    if (e.ts < cutoff || e.ts > o.now) continue;
    if (e.change !== "NEW" && e.change !== "INCREASE") continue;
    const k = `${e.coin}:${e.direction}`;
    const g = groups.get(k) ?? { wallets: new Set<string>(), usd: 0, coin: e.coin, direction: e.direction };
    g.wallets.add(e.taker);
    g.usd += e.usd;
    groups.set(k, g);
  }
  const out: Cluster[] = [];
  for (const g of groups.values()) {
    if (g.wallets.size < o.minWallets || g.usd < o.minTotalUsd) continue;
    const strength = Math.min(100, Math.round(
      (100 * (g.wallets.size / o.minWallets) * (g.usd / o.minTotalUsd)) / 2));
    const confidence = strength >= 80 ? "High" : strength >= 50 ? "Medium" : "Low";
    out.push({ coin: g.coin, direction: g.direction, walletCount: g.wallets.size, totalUsd: g.usd, strength, confidence });
  }
  return out.sort((a, b) => b.strength - a.strength);
}
