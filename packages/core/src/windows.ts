import type { Direction, WindowKey } from "./types.js";
import { WINDOW_MS } from "./types.js";

interface Ev { ts: number; coin: string; direction: Direction; usd: number; taker: string; }
type Row = { longUsd: number; shortUsd: number; netUsd: number; count: number; newWallets: number };

export class WindowAggregator {
  private events: Ev[] = [];

  add(ev: Ev): void {
    this.events.push(ev);
  }

  snapshot(now: number, key: WindowKey): Map<string, Row> {
    const cutoff = now - WINDOW_MS[key];
    const out = new Map<string, Row>();
    const seen = new Map<string, Set<string>>();
    for (const e of this.events) {
      if (e.ts < cutoff || e.ts > now) continue;
      const r = out.get(e.coin) ?? { longUsd: 0, shortUsd: 0, netUsd: 0, count: 0, newWallets: 0 };
      if (e.direction === "long") { r.longUsd += e.usd; r.netUsd += e.usd; }
      else { r.shortUsd += e.usd; r.netUsd -= e.usd; }
      r.count += 1;
      const s = seen.get(e.coin) ?? new Set<string>();
      if (!s.has(e.taker)) { s.add(e.taker); r.newWallets += 1; }
      seen.set(e.coin, s);
      out.set(e.coin, r);
    }
    return out;
  }

  prune(now: number): void {
    const cutoff = now - WINDOW_MS["7d"];
    this.events = this.events.filter((e) => e.ts >= cutoff);
  }
}
