# Hyperliquid Whale Radar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real-time, institutional-grade dashboard that identifies which Hyperliquid perp coins whales are aggressively longing/shorting in a chosen time window, on 100% real data.

**Architecture:** pnpm monorepo (Turborepo). A long-running `worker` ingests Hyperliquid WS trades across sharded connections, maintains a per-(wallet,coin) position-delta ledger in Redis, classifies each whale-sized fill (NEW/INCREASE/REDUCE/CLOSE/FLIP), aggregates rolling time-windows, and publishes events over Redis pub/sub. A Fastify `api` serves REST + a WS gateway to the browser. A Next.js `web` app renders the dark glassmorphism dashboard. Postgres/Prisma stores durable history.

**Tech Stack:** TypeScript, pnpm, Turborepo, Node 20+, Fastify, `ws`, Redis (ioredis), Postgres + Prisma, Next.js (App Router) + Tailwind + TanStack Query + Zustand + lightweight-charts, Vitest, zod, Docker + docker-compose.

## Global Constraints

- **Language:** TypeScript strict mode everywhere (`"strict": true`). No `any` in `packages/core`.
- **Real data only:** No mock/random generator may feed the production UI. The only synthetic data is the labelled test/replay fixture. Uncertain classifications must be labelled `"est"`.
- **Hyperliquid endpoints (verified 2026-07-07):** REST `POST https://api.hyperliquid.xyz/info`; WS `wss://api.hyperliquid.xyz/ws`. Trade shape: `{coin, side:"B"|"A", px:string, sz:string, time:number(ms), hash, tid, users:[maker,taker]}`. `side "B"` ⇒ taker BUY (long-side), `side "A"` ⇒ taker SELL (short-side).
- **Money math:** all sizes/prices parsed from strings; never use floats for equality — round USD to cents, sizes to coin `szDecimals`.
- **Whale presets (USD):** 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_000_000, 5_000_000 + custom. Smallest retained floor = 25_000.
- **Time windows (ms), default 15m:** 5m, 15m, 30m, 1h, 4h, 12h, 24h, 7d.
- **Node engine:** `>=20`. **pnpm:** `>=9`.
- **Commit style:** conventional commits; commit at the end of every task.

---

## File Structure

```
package.json                 pnpm workspace root + turbo
pnpm-workspace.yaml
turbo.json
tsconfig.base.json
packages/
  core/
    src/
      types.ts               shared domain types + zod schemas
      money.ts               usd(), roundCents(), parseNum()
      classification.ts      classify(prevNet, delta) -> PositionChange
      windows.ts             WINDOWS, WindowAggregator (rolling buckets)
      cluster.ts             ClusterDetector
      score.ts               smartMoneyScore(inputs) -> {score,label}
      sentiment.ts           coinSentiment(agg) -> Sentiment
      insights.ts            buildInsight(coin, agg) -> string
      newcoins.ts            diffUniverse(prev, next) -> string[]
      index.ts               barrel export
    test/*.test.ts
  db/
    prisma/schema.prisma
    src/index.ts             prisma client singleton
services/
  worker/
    src/
      config.ts              env parsing (zod)
      hl/rest.ts             HL REST client (info calls, retry/backoff)
      hl/ws.ts               sharded WS trade subscriber (reconnect/heartbeat)
      ledger.ts              Redis-backed position ledger + baseline seeding
      pipeline.ts            trade -> whale event orchestration
      publisher.ts           Redis pub/sub + Postgres batch writer
      universe.ts            universe bootstrap + new-coin detection
      main.ts                wiring/entrypoint
    test/*.test.ts
  api/
    src/
      server.ts              Fastify app
      routes/feed.ts         GET /api/feed, /api/kpis, /api/leaderboard, ...
      routes/wallet.ts       GET /api/wallet/:addr
      ws-gateway.ts          browser WS, subscribes Redis pub/sub
      state.ts               Redis readers for hot aggregates
    test/*.test.ts
  web/
    app/…                    Next.js App Router
    components/…             KpiBar, WhaleFeed, Heatmap, Leaderboard, …
    lib/…                    ws client, api client, stores, formatters
infra/
  Dockerfile.worker  Dockerfile.api  Dockerfile.web
  docker-compose.yml  .env.example
scripts/
  capture-fixture.mjs        record real trades -> fixture JSONL
  replay-fixture.mjs         replay fixture through pipeline
fixtures/
  trades-sample.jsonl        recorded real trades (sample data)
README.md
```

---

## Milestone 0 — Monorepo scaffold

### Task 0.1: Workspace + tooling

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.nvmrc`, `.gitignore` (exists), `vitest.workspace.ts`

**Interfaces:**
- Produces: pnpm workspace resolving `packages/*` and `services/*`; `pnpm test` runs Vitest across the repo.

- [ ] **Step 1: Root `package.json`**

```json
{
  "name": "hyperliquid-whale-radar",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20", "pnpm": ">=9" },
  "scripts": {
    "build": "turbo run build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck"
  },
  "devDependencies": {
    "turbo": "^2.1.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
  - "services/*"
```

- [ ] **Step 3: `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "resolveJsonModule": true,
    "types": ["node"]
  }
}
```

- [ ] **Step 4: `vitest.workspace.ts`**

```ts
export default ["packages/*", "services/*"];
```

- [ ] **Step 5: `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**"] },
    "typecheck": {}, "lint": {}, "test": {}
  }
}
```

- [ ] **Step 6: `.nvmrc`** → `20`

- [ ] **Step 7: Install & verify**

Run: `pnpm install`
Expected: lockfile created, no errors.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "chore: scaffold pnpm+turbo monorepo"
```

---

## Milestone 1 — `packages/core` (pure engines, full TDD)

### Task 1.1: Package init + types + money

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/types.ts`, `packages/core/src/money.ts`, `packages/core/test/money.test.ts`

**Interfaces:**
- Produces:
  - `parseNum(s: string): number`
  - `usd(px: number, sz: number): number` (rounded to cents)
  - `roundCents(n: number): number`
  - Types: `Side="B"|"A"`, `Direction="long"|"short"`, `PositionChange="NEW"|"INCREASE"|"REDUCE"|"CLOSE"|"FLIP_L2S"|"FLIP_S2L"`, `WindowKey`, `RawTrade`, `WhaleEvent`, `CoinCtx`, `WindowAgg`.

- [ ] **Step 1: `packages/core/package.json`**

```json
{
  "name": "@whale/core",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "scripts": { "typecheck": "tsc --noEmit", "test": "vitest run" },
  "dependencies": { "zod": "^3.23.0" },
  "devDependencies": { "typescript": "^5.6.0", "vitest": "^2.1.0" }
}
```

- [ ] **Step 2: `packages/core/tsconfig.json`**

```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }
```

- [ ] **Step 3: `packages/core/src/types.ts`**

```ts
import { z } from "zod";

export type Side = "B" | "A";
export type Direction = "long" | "short";
export type PositionChange =
  | "NEW" | "INCREASE" | "REDUCE" | "CLOSE" | "FLIP_L2S" | "FLIP_S2L";

export const WINDOW_KEYS = ["5m","15m","30m","1h","4h","12h","24h","7d"] as const;
export type WindowKey = typeof WINDOW_KEYS[number];
export const WINDOW_MS: Record<WindowKey, number> = {
  "5m": 300_000, "15m": 900_000, "30m": 1_800_000, "1h": 3_600_000,
  "4h": 14_400_000, "12h": 43_200_000, "24h": 86_400_000, "7d": 604_800_000,
};

export const RawTradeSchema = z.object({
  coin: z.string(),
  side: z.enum(["B", "A"]),
  px: z.string(),
  sz: z.string(),
  time: z.number(),
  hash: z.string(),
  tid: z.number(),
  users: z.tuple([z.string(), z.string()]),
});
export type RawTrade = z.infer<typeof RawTradeSchema>;

export interface CoinCtx {
  coin: string; markPx: number; funding: number;
  openInterest: number; dayNtlVlm: number; szDecimals: number;
}

export interface WhaleEvent {
  id: string;            // `${tid}`
  ts: number;            // ms
  coin: string;
  taker: string;
  maker: string;
  side: Side;
  direction: Direction;  // taker intent: B->long, A->short
  usd: number;
  sz: number;
  px: number;            // entry (trade price)
  change: PositionChange;
  estimated: boolean;    // true when baseline not seeded
  leverage?: number;
  liqPx?: number;
  entryPx?: number;
  uPnl?: number;
}

export interface WindowAgg {
  coin: string;
  longUsd: number; shortUsd: number; netUsd: number;
  count: number; newWallets: number;
  oiChangePct: number; priceChangePct: number;
}
```

- [ ] **Step 4: Write failing test `packages/core/test/money.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { parseNum, usd, roundCents } from "../src/money.js";

describe("money", () => {
  it("parses numeric strings", () => {
    expect(parseNum("63599.0")).toBe(63599);
    expect(parseNum("0.00017")).toBeCloseTo(0.00017, 8);
  });
  it("computes USD rounded to cents", () => {
    expect(usd(63599, 0.3)).toBe(19079.7);
    expect(usd(1.595, 1000)).toBe(1595);
  });
  it("roundCents avoids float drift", () => {
    expect(roundCents(0.1 + 0.2)).toBe(0.3);
  });
});
```

- [ ] **Step 5: Run — expect FAIL**

Run: `pnpm -C packages/core test`
Expected: FAIL (module `../src/money.js` not found).

- [ ] **Step 6: `packages/core/src/money.ts`**

```ts
export function parseNum(s: string): number {
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`bad number: ${s}`);
  return n;
}
export function roundCents(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
export function usd(px: number, sz: number): number {
  return roundCents(px * sz);
}
```

- [ ] **Step 7: Run — expect PASS**

Run: `pnpm -C packages/core test`
Expected: 3 passing.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(core): types + money utils"
```

### Task 1.2: Classification engine

**Files:**
- Create: `packages/core/src/classification.ts`, `packages/core/test/classification.test.ts`

**Interfaces:**
- Consumes: `PositionChange`, `Direction` from `types.ts`.
- Produces: `classify(prevNet: number, delta: number): { change: PositionChange; newNet: number; direction: Direction }`. Sign convention: net > 0 = long, net < 0 = short. `delta` is signed (buy +, sell −). Treat `|net| < 1e-9` as flat.

- [ ] **Step 1: Failing test `test/classification.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { classify } from "../src/classification.js";

describe("classify", () => {
  it("flat -> buy = NEW long", () => {
    expect(classify(0, 5)).toMatchObject({ change: "NEW", direction: "long", newNet: 5 });
  });
  it("flat -> sell = NEW short", () => {
    expect(classify(0, -5)).toMatchObject({ change: "NEW", direction: "short", newNet: -5 });
  });
  it("long + buy = INCREASE", () => {
    expect(classify(5, 3).change).toBe("INCREASE");
  });
  it("long + partial sell = REDUCE", () => {
    expect(classify(5, -2).change).toBe("REDUCE");
  });
  it("long + full sell to zero = CLOSE", () => {
    expect(classify(5, -5).change).toBe("CLOSE");
  });
  it("long + oversell = FLIP_L2S", () => {
    expect(classify(5, -8)).toMatchObject({ change: "FLIP_L2S", direction: "short", newNet: -3 });
  });
  it("short + oversell-back = FLIP_S2L", () => {
    expect(classify(-5, 8)).toMatchObject({ change: "FLIP_S2L", direction: "long", newNet: 3 });
  });
  it("short + more sell = INCREASE", () => {
    expect(classify(-5, -2).change).toBe("INCREASE");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm -C packages/core test classification`
Expected: FAIL (module not found).

- [ ] **Step 3: `packages/core/src/classification.ts`**

```ts
import type { PositionChange, Direction } from "./types.js";
const EPS = 1e-9;
const dir = (net: number): Direction => (net >= 0 ? "long" : "short");

export function classify(prevNet: number, delta: number):
  { change: PositionChange; newNet: number; direction: Direction } {
  const newNet = prevNet + delta;
  const wasFlat = Math.abs(prevNet) < EPS;
  const isFlat = Math.abs(newNet) < EPS;

  if (wasFlat && !isFlat) return { change: "NEW", newNet, direction: dir(newNet) };
  if (!wasFlat && isFlat) return { change: "CLOSE", newNet: 0, direction: dir(prevNet) };

  const sameSign = prevNet * newNet > 0;
  if (!sameSign) {
    return {
      change: prevNet > 0 ? "FLIP_L2S" : "FLIP_S2L",
      newNet,
      direction: dir(newNet),
    };
  }
  const grew = Math.abs(newNet) > Math.abs(prevNet);
  return { change: grew ? "INCREASE" : "REDUCE", newNet, direction: dir(newNet) };
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm -C packages/core test classification`
Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(core): position-change classification engine"
```

### Task 1.3: Rolling window aggregator

**Files:**
- Create: `packages/core/src/windows.ts`, `packages/core/test/windows.test.ts`

**Interfaces:**
- Consumes: `WhaleEvent`, `WindowKey`, `WINDOW_MS`.
- Produces: class `WindowAggregator` with:
  - `add(ev: { ts:number; coin:string; direction:Direction; usd:number; taker:string })`
  - `snapshot(now: number, key: WindowKey): Map<string, { longUsd:number; shortUsd:number; netUsd:number; count:number; newWallets:number }>`
  - `prune(now: number)` drops events older than the largest window (7d).
  Aggregator keeps an in-memory event ring; `newWallets` = distinct takers first-seen (globally) inside the window.

- [ ] **Step 1: Failing test `test/windows.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { WindowAggregator } from "../src/windows.js";

describe("WindowAggregator", () => {
  it("aggregates longs/shorts within window and excludes older events", () => {
    const a = new WindowAggregator();
    const now = 1_000_000_000_000;
    a.add({ ts: now - 60_000, coin: "SOL", direction: "long",  usd: 1000, taker: "0xA" });
    a.add({ ts: now - 60_000, coin: "SOL", direction: "short", usd: 400,  taker: "0xB" });
    a.add({ ts: now - 20 * 60_000, coin: "SOL", direction: "long", usd: 9999, taker: "0xC" }); // outside 15m
    const snap = a.snapshot(now, "15m");
    const sol = snap.get("SOL")!;
    expect(sol.longUsd).toBe(1000);
    expect(sol.shortUsd).toBe(400);
    expect(sol.netUsd).toBe(600);
    expect(sol.count).toBe(2);
    expect(sol.newWallets).toBe(2);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** · Run: `pnpm -C packages/core test windows`

- [ ] **Step 3: `packages/core/src/windows.ts`**

```ts
import type { Direction, WindowKey } from "./types.js";
import { WINDOW_MS } from "./types.js";

interface Ev { ts: number; coin: string; direction: Direction; usd: number; taker: string; }
type Row = { longUsd: number; shortUsd: number; netUsd: number; count: number; newWallets: number };

export class WindowAggregator {
  private events: Ev[] = [];
  add(ev: Ev): void { this.events.push(ev); }

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
```

- [ ] **Step 4: Run — expect PASS** · Run: `pnpm -C packages/core test windows`

- [ ] **Step 5: Commit** · `git add -A && git commit -m "feat(core): rolling window aggregator"`

### Task 1.4: Cluster detector

**Files:**
- Create: `packages/core/src/cluster.ts`, `packages/core/test/cluster.test.ts`

**Interfaces:**
- Produces: `detectClusters(events, opts) => Cluster[]` where
  `opts = { windowMs:number; now:number; minWallets:number; minTotalUsd:number }`,
  `Cluster = { coin:string; direction:Direction; walletCount:number; totalUsd:number; strength:number; confidence:"High"|"Medium"|"Low" }`.
  strength = min(100, round(100 * (walletCount/minWallets) * (totalUsd/minTotalUsd) / 2)); confidence High ≥80, Medium ≥50, else Low. Only NEW/INCREASE events count.

- [ ] **Step 1: Failing test `test/cluster.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { detectClusters } from "../src/cluster.js";

const mk = (coin: string, dir: "long"|"short", usd: number, taker: string, ts: number) =>
  ({ coin, direction: dir, usd, taker, ts, change: "NEW" as const });

describe("detectClusters", () => {
  it("flags a same-direction cluster over thresholds", () => {
    const now = 1_000_000;
    const evs = [
      mk("SUI","long",3_000_000,"0x1",now-1000),
      mk("SUI","long",3_000_000,"0x2",now-2000),
      mk("SUI","long",3_000_000,"0x3",now-3000),
    ];
    const c = detectClusters(evs, { windowMs: 600_000, now, minWallets: 3, minTotalUsd: 5_000_000 });
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ coin: "SUI", direction: "long", walletCount: 3 });
    expect(c[0].totalUsd).toBe(9_000_000);
    expect(c[0].confidence).toBe("High");
  });
  it("ignores when wallets below minimum", () => {
    const now = 1_000_000;
    const evs = [mk("SUI","long",9_000_000,"0x1",now-1000)];
    expect(detectClusters(evs, { windowMs: 600_000, now, minWallets: 3, minTotalUsd: 1 })).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** · Run: `pnpm -C packages/core test cluster`

- [ ] **Step 3: `packages/core/src/cluster.ts`**

```ts
import type { Direction, PositionChange } from "./types.js";

interface CEv { coin: string; direction: Direction; usd: number; taker: string; ts: number; change: PositionChange; }
export interface Cluster {
  coin: string; direction: Direction; walletCount: number; totalUsd: number;
  strength: number; confidence: "High" | "Medium" | "Low";
}
interface Opts { windowMs: number; now: number; minWallets: number; minTotalUsd: number; }

export function detectClusters(events: CEv[], o: Opts): Cluster[] {
  const cutoff = o.now - o.windowMs;
  const groups = new Map<string, { wallets: Set<string>; usd: number; coin: string; direction: Direction }>();
  for (const e of events) {
    if (e.ts < cutoff || e.ts > o.now) continue;
    if (e.change !== "NEW" && e.change !== "INCREASE") continue;
    const k = `${e.coin}:${e.direction}`;
    const g = groups.get(k) ?? { wallets: new Set(), usd: 0, coin: e.coin, direction: e.direction };
    g.wallets.add(e.taker); g.usd += e.usd; groups.set(k, g);
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
```

- [ ] **Step 4: Run — expect PASS** · Run: `pnpm -C packages/core test cluster`

- [ ] **Step 5: Commit** · `git add -A && git commit -m "feat(core): cluster detection engine"`

### Task 1.5: Smart-Money score

**Files:**
- Create: `packages/core/src/score.ts`, `packages/core/test/score.test.ts`

**Interfaces:**
- Produces: `smartMoneyScore(i: ScoreInputs) => { score:number; label:ScoreLabel }`.
  `ScoreInputs = { netUsd:number; grossUsd:number; oiChangePct:number; funding:number; newWallets:number; clusterStrength:number }`.
  Normalize each sub-signal to [-1,1] (net direction) or [0,1] (magnitude), weight, map to 0–100 where 50 = neutral. Weights documented in README §Score. Labels: ≥80 `STRONG_BUY`, ≥60 `BULLISH`, >40 `NEUTRAL`, >20 `BEARISH`, else `HEAVY_SHORTING`.

- [ ] **Step 1: Failing test `test/score.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { smartMoneyScore } from "../src/score.js";

describe("smartMoneyScore", () => {
  it("strong net long + OI up + cluster => bullish/strong", () => {
    const r = smartMoneyScore({ netUsd: 40e6, grossUsd: 48e6, oiChangePct: 12, funding: 0.00001, newWallets: 17, clusterStrength: 90 });
    expect(r.score).toBeGreaterThan(70);
    expect(["STRONG_BUY","BULLISH"]).toContain(r.label);
  });
  it("net short + OI up => bearish", () => {
    const r = smartMoneyScore({ netUsd: -40e6, grossUsd: 48e6, oiChangePct: 10, funding: -0.0001, newWallets: 12, clusterStrength: 70 });
    expect(r.score).toBeLessThan(35);
    expect(["BEARISH","HEAVY_SHORTING"]).toContain(r.label);
  });
  it("flat => neutral ~50", () => {
    const r = smartMoneyScore({ netUsd: 0, grossUsd: 0, oiChangePct: 0, funding: 0, newWallets: 0, clusterStrength: 0 });
    expect(r.score).toBeGreaterThanOrEqual(45);
    expect(r.score).toBeLessThanOrEqual(55);
    expect(r.label).toBe("NEUTRAL");
  });
});
```

- [ ] **Step 2: Run — expect FAIL** · Run: `pnpm -C packages/core test score`

- [ ] **Step 3: `packages/core/src/score.ts`**

```ts
export type ScoreLabel = "STRONG_BUY" | "BULLISH" | "NEUTRAL" | "BEARISH" | "HEAVY_SHORTING";
export interface ScoreInputs {
  netUsd: number; grossUsd: number; oiChangePct: number;
  funding: number; newWallets: number; clusterStrength: number;
}
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Weights (sum of magnitudes = 1). Documented in README §Smart-Money Score.
const W = { flow: 0.45, oi: 0.20, cluster: 0.20, wallets: 0.10, funding: 0.05 };

export function smartMoneyScore(i: ScoreInputs): { score: number; label: ScoreLabel } {
  const flow = i.grossUsd > 0 ? clamp(i.netUsd / i.grossUsd, -1, 1) : 0;            // [-1,1]
  const oi = clamp(i.oiChangePct / 20, -1, 1);                                      // ±20% saturates
  const cluster = clamp(i.clusterStrength / 100, 0, 1) * Math.sign(flow || 1);      // follows flow dir
  const wallets = clamp(i.newWallets / 20, 0, 1) * Math.sign(flow || 1);            // 20 wallets saturates
  const funding = clamp(-i.funding / 0.0005, -1, 1);                                // high +funding = crowded long => slight bearish
  const signal =
    W.flow * flow + W.oi * oi + W.cluster * cluster + W.wallets * wallets + W.funding * funding; // [-1,1]
  const score = Math.round(clamp(50 + signal * 50, 0, 100));
  const label: ScoreLabel =
    score >= 80 ? "STRONG_BUY" : score >= 60 ? "BULLISH" :
    score > 40 ? "NEUTRAL" : score > 20 ? "BEARISH" : "HEAVY_SHORTING";
  return { score, label };
}
```

- [ ] **Step 4: Run — expect PASS** · Run: `pnpm -C packages/core test score`

- [ ] **Step 5: Commit** · `git add -A && git commit -m "feat(core): smart-money score engine"`

### Task 1.6: Sentiment + insights + new-coin diff + barrel

**Files:**
- Create: `packages/core/src/sentiment.ts`, `packages/core/src/insights.ts`, `packages/core/src/newcoins.ts`, `packages/core/src/index.ts`, `packages/core/test/sentiment.test.ts`, `packages/core/test/insights.test.ts`, `packages/core/test/newcoins.test.ts`

**Interfaces:**
- `coinSentiment(a: { longUsd:number; shortUsd:number }) => { bullishPct:number; bearishPct:number; netLongPct:number }` (pcts 0–100, bullish+bearish=100 when gross>0 else 50/50).
- `buildInsight(coin: string, a: { longUsd:number; shortUsd:number; oiChangePct:number; funding:number; newWallets:number; windowLabel:string }) => string` — deterministic template using only provided real numbers.
- `diffUniverse(prev: string[], next: string[]) => string[]` — coins present in next, absent in prev.
- `index.ts` re-exports all engines + types.

- [ ] **Step 1: Failing tests**

`test/sentiment.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { coinSentiment } from "../src/sentiment.js";
describe("coinSentiment", () => {
  it("computes bullish/bearish split", () => {
    const s = coinSentiment({ longUsd: 75, shortUsd: 25 });
    expect(s.bullishPct).toBe(75); expect(s.bearishPct).toBe(25); expect(s.netLongPct).toBe(50);
  });
  it("neutral when no flow", () => {
    expect(coinSentiment({ longUsd: 0, shortUsd: 0 })).toMatchObject({ bullishPct: 50, bearishPct: 50 });
  });
});
```

`test/insights.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildInsight } from "../src/insights.js";
describe("buildInsight", () => {
  it("uses real numbers verbatim, no fabrication", () => {
    const s = buildInsight("SOL", { longUsd: 42_300_000, shortUsd: 8_100_000, oiChangePct: 12.4, funding: 0.0000125, newWallets: 17, windowLabel: "15 minutes" });
    expect(s).toContain("SOL");
    expect(s).toContain("$42.3M");
    expect(s).toContain("$8.1M");
    expect(s).toContain("12.4%");
    expect(s).toContain("17");
  });
});
```

`test/newcoins.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { diffUniverse } from "../src/newcoins.js";
describe("diffUniverse", () => {
  it("returns newly added coins", () => {
    expect(diffUniverse(["BTC","ETH"], ["BTC","ETH","HYPE"])).toEqual(["HYPE"]);
    expect(diffUniverse(["BTC"], ["BTC"])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** · Run: `pnpm -C packages/core test`

- [ ] **Step 3: Implement**

`src/sentiment.ts`:
```ts
export function coinSentiment(a: { longUsd: number; shortUsd: number }):
  { bullishPct: number; bearishPct: number; netLongPct: number } {
  const gross = a.longUsd + a.shortUsd;
  if (gross <= 0) return { bullishPct: 50, bearishPct: 50, netLongPct: 0 };
  const bullishPct = Math.round((a.longUsd / gross) * 100);
  const bearishPct = 100 - bullishPct;
  const netLongPct = Math.round(((a.longUsd - a.shortUsd) / gross) * 100);
  return { bullishPct, bearishPct, netLongPct };
}
```

`src/insights.ts`:
```ts
function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
export function buildInsight(coin: string, a: {
  longUsd: number; shortUsd: number; oiChangePct: number;
  funding: number; newWallets: number; windowLabel: string;
}): string {
  const lean = a.longUsd >= a.shortUsd ? "accumulation" : "distribution";
  const fundingWord = a.funding > 0.0002 ? "elevated positive" : a.funding < -0.0002 ? "negative" : "neutral";
  const oiWord = a.oiChangePct >= 0 ? "increased" : "decreased";
  return `Over the last ${a.windowLabel}, whales opened approximately ${compact(a.longUsd)} in new ${coin} long positions ` +
    `while ${compact(a.shortUsd)} in shorts were opened. Open interest ${oiWord} by ${Math.abs(a.oiChangePct).toFixed(1)}%, ` +
    `funding is ${fundingWord}, and ${a.newWallets} distinct wallets entered. This suggests ${lean}.`;
}
```

`src/newcoins.ts`:
```ts
export function diffUniverse(prev: string[], next: string[]): string[] {
  const p = new Set(prev);
  return next.filter((c) => !p.has(c));
}
```

`src/index.ts`:
```ts
export * from "./types.js";
export * from "./money.js";
export * from "./classification.js";
export * from "./windows.js";
export * from "./cluster.js";
export * from "./score.js";
export * from "./sentiment.js";
export * from "./insights.js";
export * from "./newcoins.js";
```

- [ ] **Step 4: Run — expect PASS (full core suite)** · Run: `pnpm -C packages/core test`

- [ ] **Step 5: Typecheck** · Run: `pnpm -C packages/core typecheck` → no errors.

- [ ] **Step 6: Commit** · `git add -A && git commit -m "feat(core): sentiment, insights, new-coin diff, barrel"`

---

## Milestone 2 — `packages/db` (Prisma schema)

### Task 2.1: Prisma schema + client

**Files:**
- Create: `packages/db/package.json`, `packages/db/prisma/schema.prisma`, `packages/db/src/index.ts`

**Interfaces:**
- Produces: `prisma` client singleton exported from `@whale/db`; models `Market`, `WhaleEvent`, `PositionLedger`, `Wallet`, `CoinSnapshot`, `Cluster`.

- [ ] **Step 1: `packages/db/package.json`**

```json
{
  "name": "@whale/db",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "generate": "prisma generate",
    "migrate": "prisma migrate deploy",
    "migrate:dev": "prisma migrate dev"
  },
  "dependencies": { "@prisma/client": "^5.20.0" },
  "devDependencies": { "prisma": "^5.20.0" }
}
```

- [ ] **Step 2: `packages/db/prisma/schema.prisma`**

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

model Market {
  coin        String   @id
  szDecimals  Int
  maxLeverage Int
  addedAt     DateTime @default(now())
}

model WhaleEvent {
  id         String   @id            // tid
  ts         DateTime
  coin       String
  taker      String
  maker      String
  side       String
  direction  String
  usd        Float
  sz         Float
  px         Float
  change     String
  estimated  Boolean  @default(false)
  leverage   Float?
  liqPx      Float?
  entryPx    Float?
  uPnl       Float?
  @@index([coin, ts])
  @@index([taker, ts])
}

model PositionLedger {
  wallet    String
  coin      String
  netSize   Float
  avgEntry  Float
  updatedAt DateTime @updatedAt
  @@id([wallet, coin])
}

model Wallet {
  address     String   @id
  label       String?
  firstSeen   DateTime @default(now())
  totalTrades Int      @default(0)
  totalVolume Float    @default(0)
  lastActive  DateTime @default(now())
}

model CoinSnapshot {
  id       Int      @id @default(autoincrement())
  coin     String
  ts       DateTime @default(now())
  oi       Float
  funding  Float
  mark     Float
  vol      Float
  @@index([coin, ts])
}

model Cluster {
  id          Int      @id @default(autoincrement())
  coin        String
  ts          DateTime @default(now())
  direction   String
  walletCount Int
  totalUsd    Float
  strength    Int
  confidence  String
  @@index([coin, ts])
}
```

- [ ] **Step 3: `packages/db/src/index.ts`**

```ts
import { PrismaClient } from "@prisma/client";
const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;
export * from "@prisma/client";
```

- [ ] **Step 4: Generate client** · Run: `DATABASE_URL="postgresql://x" pnpm -C packages/db generate` → client generated.

- [ ] **Step 5: Commit** · `git add -A && git commit -m "feat(db): prisma schema + client"`

---

## Milestone 3 — `services/worker` (ingestion + engines wiring)

> **Testing approach:** HL network clients are covered by an integration test that replays a recorded fixture (Task 3.6); pure orchestration (`pipeline`, `ledger` math) is unit-tested with a fake Redis + fixture trades. Live network is exercised only by `scripts/capture-fixture.mjs` and a manual smoke run.

### Task 3.1: Config + HL REST client

**Files:**
- Create: `services/worker/package.json`, `services/worker/tsconfig.json`, `services/worker/src/config.ts`, `services/worker/src/hl/rest.ts`, `services/worker/test/rest.test.ts`

**Interfaces:**
- Produces:
  - `loadConfig()` → validated env `{ redisUrl, databaseUrl, hlRestUrl, hlWsUrl, whaleFloorUsd, coinsPerConn }`.
  - `HLRest.metaAndAssetCtxs(): Promise<CoinCtx[]>`
  - `HLRest.clearinghouseState(user: string): Promise<{ positions: Array<{ coin:string; szi:number; entryPx:number; leverage:number; liqPx:number|null; uPnl:number }> }>`
  - Retry with exponential backoff (3 tries), zod validation.

- [ ] **Step 1: `services/worker/package.json`**

```json
{
  "name": "@whale/worker",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/main.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@whale/core": "workspace:*", "@whale/db": "workspace:*",
    "ioredis": "^5.4.0", "ws": "^8.18.0", "zod": "^3.23.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0", "typescript": "^5.6.0", "vitest": "^2.1.0",
    "@types/ws": "^8.5.0", "ioredis-mock": "^8.9.0"
  }
}
```

- [ ] **Step 2: `services/worker/tsconfig.json`** → `{ "extends": "../../tsconfig.base.json", "include": ["src","test"], "compilerOptions": { "outDir": "dist" } }`

- [ ] **Step 3: `services/worker/src/config.ts`**

```ts
import { z } from "zod";
const Schema = z.object({
  REDIS_URL: z.string().default("redis://localhost:6379"),
  DATABASE_URL: z.string().default("postgresql://whale:whale@localhost:5432/whale"),
  HL_REST_URL: z.string().default("https://api.hyperliquid.xyz/info"),
  HL_WS_URL: z.string().default("wss://api.hyperliquid.xyz/ws"),
  WHALE_FLOOR_USD: z.coerce.number().default(25_000),
  COINS_PER_CONN: z.coerce.number().default(50),
});
export type Config = {
  redisUrl: string; databaseUrl: string; hlRestUrl: string; hlWsUrl: string;
  whaleFloorUsd: number; coinsPerConn: number;
};
export function loadConfig(env = process.env): Config {
  const e = Schema.parse(env);
  return {
    redisUrl: e.REDIS_URL, databaseUrl: e.DATABASE_URL,
    hlRestUrl: e.HL_REST_URL, hlWsUrl: e.HL_WS_URL,
    whaleFloorUsd: e.WHALE_FLOOR_USD, coinsPerConn: e.COINS_PER_CONN,
  };
}
```

- [ ] **Step 4: Failing test `services/worker/test/rest.test.ts`** (uses a stub `fetch`)

```ts
import { describe, it, expect, vi } from "vitest";
import { HLRest } from "../src/hl/rest.js";

describe("HLRest.metaAndAssetCtxs", () => {
  it("maps universe+ctxs into CoinCtx[]", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ([
        { universe: [{ name: "BTC", szDecimals: 5, maxLeverage: 50 }] },
        [{ markPx: "63547.0", funding: "0.0000125", openInterest: "38072.88", dayNtlVlm: "2701152802.3" }],
      ]),
    });
    const rest = new HLRest("http://x", fakeFetch as unknown as typeof fetch);
    const ctxs = await rest.metaAndAssetCtxs();
    expect(ctxs[0]).toMatchObject({ coin: "BTC", markPx: 63547, szDecimals: 5 });
    expect(ctxs[0].openInterest).toBeCloseTo(38072.88, 2);
  });
});
```

- [ ] **Step 5: Run — expect FAIL** · Run: `pnpm -C services/worker test rest`

- [ ] **Step 6: `services/worker/src/hl/rest.ts`**

```ts
import { parseNum, type CoinCtx } from "@whale/core";

async function backoff<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let err: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) { err = e; await new Promise((r) => setTimeout(r, 250 * 2 ** i)); }
  }
  throw err;
}

export class HLRest {
  constructor(private url: string, private f: typeof fetch = fetch) {}
  private async post<T>(body: unknown): Promise<T> {
    return backoff(async () => {
      const r = await this.f(this.url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`HL ${r.status}`);
      return (await r.json()) as T;
    });
  }
  async metaAndAssetCtxs(): Promise<CoinCtx[]> {
    const [meta, ctxs] = await this.post<[{ universe: Array<{ name: string; szDecimals: number; maxLeverage: number }> }, Array<Record<string, string>>]>({ type: "metaAndAssetCtxs" });
    return meta.universe.map((u, i) => {
      const c = ctxs[i] ?? {};
      return {
        coin: u.name, szDecimals: u.szDecimals,
        markPx: parseNum(c.markPx ?? "0"),
        funding: parseNum(c.funding ?? "0"),
        openInterest: parseNum(c.openInterest ?? "0"),
        dayNtlVlm: parseNum(c.dayNtlVlm ?? "0"),
      };
    });
  }
  async clearinghouseState(user: string) {
    const d = await this.post<{ assetPositions: Array<{ position: { coin: string; szi: string; entryPx: string | null; leverage: { value: number }; liquidationPx: string | null; unrealizedPnl: string } }> }>({ type: "clearinghouseState", user });
    return {
      positions: d.assetPositions.map((p) => ({
        coin: p.position.coin,
        szi: parseNum(p.position.szi),
        entryPx: p.position.entryPx ? parseNum(p.position.entryPx) : 0,
        leverage: p.position.leverage?.value ?? 0,
        liqPx: p.position.liquidationPx ? parseNum(p.position.liquidationPx) : null,
        uPnl: parseNum(p.position.unrealizedPnl ?? "0"),
      })),
    };
  }
}
```

- [ ] **Step 7: Run — expect PASS** · Run: `pnpm -C services/worker test rest`

- [ ] **Step 8: Commit** · `git add -A && git commit -m "feat(worker): config + resilient HL REST client"`

### Task 3.2: Sharded WS trade subscriber

**Files:**
- Create: `services/worker/src/hl/ws.ts`

**Interfaces:**
- Produces: `class HLTradeStream extends EventEmitter` with `start(coins: string[])`, emits `("trade", RawTrade)`; internally shards coins into connections of `coinsPerConn`, sends `{method:"subscribe",subscription:{type:"trades",coin}}` per coin, sends `{method:"ping"}` heartbeat every 30s, reconnects with backoff and re-subscribes on close. Validates each trade with `RawTradeSchema`.

- [ ] **Step 1: Implement `services/worker/src/hl/ws.ts`**

```ts
import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { RawTradeSchema, type RawTrade } from "@whale/core";

export class HLTradeStream extends EventEmitter {
  private conns: WebSocket[] = [];
  constructor(private wsUrl: string, private coinsPerConn = 50) { super(); }

  start(coins: string[]): void {
    for (let i = 0; i < coins.length; i += this.coinsPerConn) {
      this.openConn(coins.slice(i, i + this.coinsPerConn));
    }
  }

  private openConn(coins: string[]): void {
    const ws = new WebSocket(this.wsUrl);
    this.conns.push(ws);
    let hb: NodeJS.Timeout;
    ws.on("open", () => {
      for (const coin of coins) ws.send(JSON.stringify({ method: "subscribe", subscription: { type: "trades", coin } }));
      hb = setInterval(() => ws.readyState === ws.OPEN && ws.send(JSON.stringify({ method: "ping" })), 30_000);
    });
    ws.on("message", (buf) => {
      let msg: unknown;
      try { msg = JSON.parse(buf.toString()); } catch { return; }
      const m = msg as { channel?: string; data?: unknown[] };
      if (m.channel !== "trades" || !Array.isArray(m.data)) return;
      for (const raw of m.data) {
        const parsed = RawTradeSchema.safeParse(raw);
        if (parsed.success) this.emit("trade", parsed.data as RawTrade);
      }
    });
    ws.on("close", () => { clearInterval(hb); setTimeout(() => this.openConn(coins), 2000); });
    ws.on("error", () => ws.close());
  }
  stop(): void { for (const c of this.conns) c.close(); this.conns = []; }
}
```

- [ ] **Step 2: Typecheck** · Run: `pnpm -C services/worker typecheck` → no errors.

- [ ] **Step 3: Commit** · `git add -A && git commit -m "feat(worker): sharded WS trade subscriber with reconnect+heartbeat"`

### Task 3.3: Position-delta ledger (Redis)

**Files:**
- Create: `services/worker/src/ledger.ts`, `services/worker/test/ledger.test.ts`

**Interfaces:**
- Produces: `class Ledger` (constructed with an ioredis-compatible client + optional seeder fn).
  - `apply(wallet:string, coin:string, delta:number): Promise<{ prevNet:number; newNet:number; seeded:boolean }>` — reads current net from Redis hash `ledger:{wallet}` field `{coin}`, seeds baseline once via seeder if never seen, writes newNet.
  - Seeder signature: `(wallet:string, coin:string) => Promise<number>` returns true on-chain net (from clearinghouseState), or 0.

- [ ] **Step 1: Failing test `services/worker/test/ledger.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import RedisMock from "ioredis-mock";
import { Ledger } from "../src/ledger.js";

describe("Ledger", () => {
  it("seeds baseline once, then accumulates deltas", async () => {
    const redis = new RedisMock();
    const seeder = vi.fn().mockResolvedValue(10); // wallet already had +10 on chain
    const l = new Ledger(redis as any, seeder);
    const r1 = await l.apply("0xA", "BTC", 5);
    expect(r1).toMatchObject({ prevNet: 10, newNet: 15, seeded: true });
    const r2 = await l.apply("0xA", "BTC", -3);
    expect(r2).toMatchObject({ prevNet: 15, newNet: 12, seeded: false });
    expect(seeder).toHaveBeenCalledTimes(1);
  });
  it("works without seeder (baseline 0)", async () => {
    const redis = new RedisMock();
    const l = new Ledger(redis as any);
    const r = await l.apply("0xB", "SOL", 7);
    expect(r).toMatchObject({ prevNet: 0, newNet: 7, seeded: true });
  });
});
```

- [ ] **Step 2: Run — expect FAIL** · Run: `pnpm -C services/worker test ledger`

- [ ] **Step 3: `services/worker/src/ledger.ts`**

```ts
import type Redis from "ioredis";
type Seeder = (wallet: string, coin: string) => Promise<number>;

export class Ledger {
  constructor(private redis: Redis, private seeder?: Seeder) {}
  private key(w: string) { return `ledger:${w}`; }
  private seenKey(w: string) { return `ledgerseen:${w}`; }

  async apply(wallet: string, coin: string, delta: number):
    Promise<{ prevNet: number; newNet: number; seeded: boolean }> {
    const seen = await this.redis.hget(this.seenKey(wallet), coin);
    let prevNet: number;
    let seeded = false;
    if (!seen) {
      prevNet = this.seeder ? await this.seeder(wallet, coin) : 0;
      await this.redis.hset(this.seenKey(wallet), coin, "1");
      seeded = true;
    } else {
      prevNet = Number(await this.redis.hget(this.key(wallet), coin) ?? "0");
    }
    const newNet = prevNet + delta;
    await this.redis.hset(this.key(wallet), coin, String(newNet));
    return { prevNet, newNet, seeded };
  }
}
```

- [ ] **Step 4: Run — expect PASS** · Run: `pnpm -C services/worker test ledger`

- [ ] **Step 5: Commit** · `git add -A && git commit -m "feat(worker): redis position-delta ledger with lazy baseline seeding"`

### Task 3.4: Whale pipeline (trade → event)

**Files:**
- Create: `services/worker/src/pipeline.ts`, `services/worker/test/pipeline.test.ts`

**Interfaces:**
- Consumes: `Ledger`, `classify`, `usd` from core, `CoinCtx` map.
- Produces: `class Pipeline` with `handleTrade(t: RawTrade): Promise<WhaleEvent | null>` — returns null if `usd < whaleFloor`; else updates ledger for taker (delta = side "B" ? +sz : −sz), classifies, builds `WhaleEvent` (with `estimated = seeded` when baseline was guessed as 0), and pushes to the injected `WindowAggregator`. Enrichment (leverage/liq/uPnl) is attached by an injected async `enrich?(ev)` best-effort.

- [ ] **Step 1: Failing test `services/worker/test/pipeline.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import RedisMock from "ioredis-mock";
import { Ledger } from "../src/ledger.js";
import { Pipeline } from "../src/pipeline.js";
import { WindowAggregator, type RawTrade } from "@whale/core";

const trade = (over: Partial<RawTrade>): RawTrade => ({
  coin: "BTC", side: "B", px: "60000", sz: "1", time: 1000,
  hash: "0x", tid: 1, users: ["0xmaker", "0xtaker"], ...over,
});

describe("Pipeline.handleTrade", () => {
  it("drops sub-whale trades", async () => {
    const p = new Pipeline({ redis: new RedisMock() as any, whaleFloorUsd: 25_000, agg: new WindowAggregator() });
    const ev = await p.handleTrade(trade({ px: "100", sz: "1" })); // $100
    expect(ev).toBeNull();
  });
  it("emits a NEW long whale event above floor", async () => {
    const agg = new WindowAggregator();
    const p = new Pipeline({ redis: new RedisMock() as any, whaleFloorUsd: 25_000, agg });
    const ev = await p.handleTrade(trade({ px: "60000", sz: "1", side: "B", tid: 42 })); // $60k
    expect(ev).not.toBeNull();
    expect(ev!).toMatchObject({ coin: "BTC", direction: "long", change: "NEW", usd: 60000, id: "42" });
    expect(agg.snapshot(1000, "15m").get("BTC")!.longUsd).toBe(60000);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** · Run: `pnpm -C services/worker test pipeline`

- [ ] **Step 3: `services/worker/src/pipeline.ts`**

```ts
import type Redis from "ioredis";
import { Ledger } from "./ledger.js";
import {
  classify, usd, parseNum, WindowAggregator,
  type RawTrade, type WhaleEvent, type CoinCtx,
} from "@whale/core";

interface Deps {
  redis: Redis; whaleFloorUsd: number; agg: WindowAggregator;
  ctx?: Map<string, CoinCtx>;
  seeder?: (w: string, c: string) => Promise<number>;
  enrich?: (ev: WhaleEvent) => Promise<void>;
}
export class Pipeline {
  private ledger: Ledger;
  constructor(private d: Deps) { this.ledger = new Ledger(d.redis, d.seeder); }

  async handleTrade(t: RawTrade): Promise<WhaleEvent | null> {
    const px = parseNum(t.px), sz = parseNum(t.sz);
    const notional = usd(px, sz);
    if (notional < this.d.whaleFloorUsd) return null;
    const taker = t.users[1];
    const delta = t.side === "B" ? sz : -sz;
    const { prevNet, seeded } = await this.ledger.apply(taker, t.coin, delta);
    const { change, direction } = classify(prevNet, delta);
    const ev: WhaleEvent = {
      id: String(t.tid), ts: t.time, coin: t.coin, taker, maker: t.users[0],
      side: t.side, direction, usd: notional, sz, px, change,
      estimated: seeded, // baseline guessed => est.
    };
    if (this.d.enrich) { try { await this.d.enrich(ev); } catch { /* best-effort */ } }
    this.d.agg.add({ ts: ev.ts, coin: ev.coin, direction: ev.direction, usd: ev.usd, taker });
    return ev;
  }
}
```

- [ ] **Step 4: Run — expect PASS** · Run: `pnpm -C services/worker test pipeline`

- [ ] **Step 5: Commit** · `git add -A && git commit -m "feat(worker): whale detection pipeline"`

### Task 3.5: Publisher (Redis pub/sub + hot snapshots + Postgres batch)

**Files:**
- Create: `services/worker/src/publisher.ts`, `services/worker/src/universe.ts`

**Interfaces:**
- `Publisher.event(ev: WhaleEvent)` → `redis.publish("whale:events", JSON.stringify(ev))` + `LPUSH whale:feed` (capped `LTRIM 0 999`) + buffered Postgres insert (flush every 2s / 200 rows).
- `Publisher.snapshot(payload)` → `redis.set("whale:snapshot", json)` + `publish("whale:snapshot", json)`.
- `Universe.bootstrap()` → returns `CoinCtx[]`, persists `Market` rows, stores `coin list` in Redis; `Universe.detectNew()` diffs and logs/persists new coins.

- [ ] **Step 1: `services/worker/src/publisher.ts`**

```ts
import type Redis from "ioredis";
import { prisma } from "@whale/db";
import type { WhaleEvent } from "@whale/core";

export class Publisher {
  private buf: WhaleEvent[] = [];
  constructor(private redis: Redis) {
    setInterval(() => void this.flush(), 2000);
  }
  async event(ev: WhaleEvent): Promise<void> {
    await this.redis.publish("whale:events", JSON.stringify(ev));
    await this.redis.lpush("whale:feed", JSON.stringify(ev));
    await this.redis.ltrim("whale:feed", 0, 999);
    this.buf.push(ev);
    if (this.buf.length >= 200) await this.flush();
  }
  async snapshot(payload: unknown): Promise<void> {
    const j = JSON.stringify(payload);
    await this.redis.set("whale:snapshot", j);
    await this.redis.publish("whale:snapshot", j);
  }
  private async flush(): Promise<void> {
    if (this.buf.length === 0) return;
    const rows = this.buf.splice(0, this.buf.length).map((e) => ({
      id: e.id, ts: new Date(e.ts), coin: e.coin, taker: e.taker, maker: e.maker,
      side: e.side, direction: e.direction, usd: e.usd, sz: e.sz, px: e.px,
      change: e.change, estimated: e.estimated,
      leverage: e.leverage ?? null, liqPx: e.liqPx ?? null,
      entryPx: e.entryPx ?? null, uPnl: e.uPnl ?? null,
    }));
    try { await prisma.whaleEvent.createMany({ data: rows, skipDuplicates: true }); }
    catch (err) { console.error("pg flush failed", err); }
  }
}
```

- [ ] **Step 2: `services/worker/src/universe.ts`**

```ts
import type Redis from "ioredis";
import { prisma } from "@whale/db";
import { diffUniverse, type CoinCtx } from "@whale/core";
import type { HLRest } from "./hl/rest.js";

export class Universe {
  constructor(private rest: HLRest, private redis: Redis) {}
  async bootstrap(): Promise<CoinCtx[]> {
    const ctxs = await this.rest.metaAndAssetCtxs();
    await this.redis.set("universe:coins", JSON.stringify(ctxs.map((c) => c.coin)));
    for (const c of ctxs) {
      await prisma.market.upsert({
        where: { coin: c.coin },
        create: { coin: c.coin, szDecimals: c.szDecimals, maxLeverage: 0 },
        update: { szDecimals: c.szDecimals },
      });
    }
    return ctxs;
  }
  async detectNew(): Promise<string[]> {
    const prev = JSON.parse((await this.redis.get("universe:coins")) ?? "[]") as string[];
    const ctxs = await this.rest.metaAndAssetCtxs();
    const next = ctxs.map((c) => c.coin);
    const added = diffUniverse(prev, next);
    if (added.length) await this.redis.set("universe:coins", JSON.stringify(next));
    return added;
  }
}
```

- [ ] **Step 3: Typecheck** · Run: `pnpm -C services/worker typecheck`

- [ ] **Step 4: Commit** · `git add -A && git commit -m "feat(worker): publisher + universe/new-coin detection"`

### Task 3.6: Main wiring + fixture capture + integration test

**Files:**
- Create: `services/worker/src/main.ts`, `scripts/capture-fixture.mjs`, `services/worker/test/integration.test.ts`
- Create (generated): `fixtures/trades-sample.jsonl`

**Interfaces:**
- `main.ts` wires: config → HLRest → Universe.bootstrap → ctx map + seeder + enrich → Pipeline → HLTradeStream → Publisher; periodic (10s) `snapshot` build (KPIs, leaderboard, heatmap, clusters, per-coin sentiment/score/insight) using `WindowAggregator` + `detectClusters` + `smartMoneyScore` + `coinSentiment` + `buildInsight`; periodic (60s) `detectNew`.

- [ ] **Step 1: `scripts/capture-fixture.mjs`** (records real trades — sample data)

```js
import WebSocket from "ws";
import { writeFileSync, appendFileSync } from "node:fs";
const coins = process.argv.slice(2);
if (!coins.length) { console.error("usage: node capture-fixture.mjs BTC ETH SOL"); process.exit(1); }
const out = "fixtures/trades-sample.jsonl";
writeFileSync(out, "");
const ws = new WebSocket("wss://api.hyperliquid.xyz/ws");
let n = 0;
ws.on("open", () => coins.forEach((c) => ws.send(JSON.stringify({ method: "subscribe", subscription: { type: "trades", coin: c } }))));
ws.on("message", (b) => {
  const m = JSON.parse(b.toString());
  if (m.channel !== "trades") return;
  for (const t of m.data) { appendFileSync(out, JSON.stringify(t) + "\n"); if (++n >= 2000) { console.log("captured", n); process.exit(0); } }
});
setTimeout(() => { console.log("captured", n); process.exit(0); }, 120000);
```

- [ ] **Step 2: Capture a real fixture**

Run: `node scripts/capture-fixture.mjs BTC ETH SOL HYPE`
Expected: `fixtures/trades-sample.jsonl` with up to 2000 real trade lines. Commit the fixture.

- [ ] **Step 3: Integration test `services/worker/test/integration.test.ts`** (replays fixture through pipeline)

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import RedisMock from "ioredis-mock";
import { Pipeline } from "../src/pipeline.js";
import { WindowAggregator, RawTradeSchema } from "@whale/core";

describe("integration: replay real fixture", () => {
  it("processes recorded trades and produces whale events with valid shape", async () => {
    const path = "fixtures/trades-sample.jsonl";
    if (!existsSync(path)) return; // fixture optional in CI without network capture
    const lines = readFileSync(path, "utf8").trim().split("\n").filter(Boolean);
    const agg = new WindowAggregator();
    const p = new Pipeline({ redis: new RedisMock() as any, whaleFloorUsd: 1, agg });
    let events = 0;
    for (const line of lines) {
      const parsed = RawTradeSchema.safeParse(JSON.parse(line));
      if (!parsed.success) continue;
      const ev = await p.handleTrade(parsed.data);
      if (ev) { events++; expect(["long","short"]).toContain(ev.direction); expect(ev.usd).toBeGreaterThan(0); }
    }
    expect(events).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 4: Run — expect PASS** · Run: `pnpm -C services/worker test integration`

- [ ] **Step 5: `services/worker/src/main.ts`** (wiring; snapshot builder)

```ts
import Redis from "ioredis";
import { loadConfig } from "./config.js";
import { HLRest } from "./hl/rest.js";
import { HLTradeStream } from "./hl/ws.js";
import { Universe } from "./universe.js";
import { Pipeline } from "./pipeline.js";
import { Publisher } from "./publisher.js";
import {
  WindowAggregator, detectClusters, smartMoneyScore, coinSentiment, buildInsight,
  WINDOW_MS, type CoinCtx, type WhaleEvent, type WindowKey,
} from "@whale/core";

async function main() {
  const cfg = loadConfig();
  const redis = new Redis(cfg.redisUrl);
  const rest = new HLRest(cfg.hlRestUrl);
  const universe = new Universe(rest, redis);
  const agg = new WindowAggregator();
  const pub = new Publisher(redis);

  let ctxMap = new Map<string, CoinCtx>();
  const refreshCtx = async () => { for (const c of await rest.metaAndAssetCtxs()) ctxMap.set(c.coin, c); };

  const ctxs = await universe.bootstrap();
  ctxs.forEach((c) => ctxMap.set(c.coin, c));

  const seeder = async (wallet: string, coin: string) => {
    try { const s = await rest.clearinghouseState(wallet); return s.positions.find((p) => p.coin === coin)?.szi ?? 0; }
    catch { return 0; }
  };
  const enrich = async (ev: WhaleEvent) => {
    const s = await rest.clearinghouseState(ev.taker);
    const pos = s.positions.find((p) => p.coin === ev.coin);
    if (pos) { ev.leverage = pos.leverage; ev.liqPx = pos.liqPx ?? undefined; ev.entryPx = pos.entryPx; ev.uPnl = pos.uPnl; }
    const ctx = ctxMap.get(ev.coin); if (ctx) ev.px = ev.px; // current price surfaced via snapshot
  };

  const pipeline = new Pipeline({ redis, whaleFloorUsd: cfg.whaleFloorUsd, agg, ctx: ctxMap, seeder, enrich });
  const events: Array<{ coin: string; direction: "long"|"short"; usd: number; taker: string; ts: number; change: WhaleEvent["change"] }> = [];

  const stream = new HLTradeStream(cfg.hlWsUrl, cfg.coinsPerConn);
  stream.on("trade", async (t) => {
    const ev = await pipeline.handleTrade(t);
    if (ev) { await pub.event(ev); events.push({ coin: ev.coin, direction: ev.direction, usd: ev.usd, taker: ev.taker, ts: ev.ts, change: ev.change }); }
  });
  stream.start(ctxs.map((c) => c.coin));

  // Snapshot builder every 10s
  setInterval(async () => {
    const now = Date.now();
    agg.prune(now);
    const key: WindowKey = "15m";
    const rows = agg.snapshot(now, key);
    const perCoin = [...rows.entries()].map(([coin, r]) => {
      const ctx = ctxMap.get(coin);
      const sentiment = coinSentiment(r);
      const { score, label } = smartMoneyScore({
        netUsd: r.netUsd, grossUsd: r.longUsd + r.shortUsd,
        oiChangePct: 0, funding: ctx?.funding ?? 0, newWallets: r.newWallets, clusterStrength: 0,
      });
      const insight = buildInsight(coin, { longUsd: r.longUsd, shortUsd: r.shortUsd, oiChangePct: 0, funding: ctx?.funding ?? 0, newWallets: r.newWallets, windowLabel: "15 minutes" });
      return { coin, ...r, mark: ctx?.markPx ?? 0, funding: ctx?.funding ?? 0, oi: ctx?.openInterest ?? 0, sentiment, score, label, insight };
    });
    const clusters = detectClusters(events, { windowMs: WINDOW_MS[key], now, minWallets: 5, minTotalUsd: 1_000_000 });
    await pub.snapshot({ ts: now, window: key, coins: perCoin, clusters });
  }, 10_000);

  setInterval(() => void refreshCtx(), 10_000);
  setInterval(async () => { const added = await universe.detectNew(); if (added.length) { stream.start(added); console.log("new coins", added); } }, 60_000);

  console.log("worker running:", ctxs.length, "markets");
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 6: Typecheck** · Run: `pnpm -C services/worker typecheck`

- [ ] **Step 7: Commit** · `git add -A && git commit -m "feat(worker): main wiring, snapshot builder, real fixture + integration test"`

---

## Milestone 4 — `services/api` (Fastify REST + WS gateway)

### Task 4.1: Fastify server + REST readers

**Files:**
- Create: `services/api/package.json`, `services/api/tsconfig.json`, `services/api/src/state.ts`, `services/api/src/routes/feed.ts`, `services/api/src/routes/wallet.ts`, `services/api/src/server.ts`, `services/api/test/state.test.ts`

**Interfaces:**
- `State` reads Redis: `feed(limit)` from `whale:feed`, `snapshot()` from `whale:snapshot`.
- Routes: `GET /api/health`, `GET /api/feed?limit=`, `GET /api/snapshot`, `GET /api/kpis`, `GET /api/leaderboard?metric=`, `GET /api/wallet/:addr`.
- `GET /api/kpis` and `/api/leaderboard` derive from the snapshot (KPI bar fields + ranked lists per Global metric list).

- [ ] **Step 1: `services/api/package.json`**

```json
{
  "name": "@whale/api",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts", "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js", "typecheck": "tsc --noEmit", "test": "vitest run"
  },
  "dependencies": {
    "@whale/core": "workspace:*", "@whale/db": "workspace:*",
    "fastify": "^4.28.0", "@fastify/cors": "^9.0.0",
    "@fastify/websocket": "^10.0.0", "ioredis": "^5.4.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0", "typescript": "^5.6.0", "vitest": "^2.1.0", "ioredis-mock": "^8.9.0"
  }
}
```

- [ ] **Step 2: `services/api/tsconfig.json`** → `{ "extends": "../../tsconfig.base.json", "include": ["src","test"], "compilerOptions": { "outDir": "dist" } }`

- [ ] **Step 3: Failing test `services/api/test/state.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import RedisMock from "ioredis-mock";
import { State } from "../src/state.js";

describe("State", () => {
  it("reads capped feed newest-first", async () => {
    const redis = new RedisMock();
    await redis.lpush("whale:feed", JSON.stringify({ id: "1", coin: "BTC" }));
    await redis.lpush("whale:feed", JSON.stringify({ id: "2", coin: "ETH" }));
    const s = new State(redis as any);
    const feed = await s.feed(10);
    expect(feed[0].id).toBe("2");
    expect(feed).toHaveLength(2);
  });
  it("kpis derive largest long/short from snapshot", async () => {
    const redis = new RedisMock();
    await redis.set("whale:snapshot", JSON.stringify({ coins: [
      { coin: "SOL", longUsd: 40e6, shortUsd: 8e6, netUsd: 32e6, count: 5 },
      { coin: "BTC", longUsd: 5e6, shortUsd: 20e6, netUsd: -15e6, count: 3 },
    ], clusters: [] }));
    const s = new State(redis as any);
    const k = await s.kpis();
    expect(k.totalLongUsd).toBe(45e6);
    expect(k.largestLong.coin).toBe("SOL");
    expect(k.largestShort.coin).toBe("BTC");
  });
});
```

- [ ] **Step 4: Run — expect FAIL** · Run: `pnpm -C services/api test`

- [ ] **Step 5: `services/api/src/state.ts`**

```ts
import type Redis from "ioredis";

interface CoinRow { coin: string; longUsd: number; shortUsd: number; netUsd: number; count: number; }
interface Snapshot { ts?: number; window?: string; coins: CoinRow[]; clusters: unknown[]; }

export class State {
  constructor(private redis: Redis) {}
  async feed(limit = 100): Promise<any[]> {
    const raw = await this.redis.lrange("whale:feed", 0, limit - 1);
    return raw.map((r) => JSON.parse(r));
  }
  async snapshot(): Promise<Snapshot> {
    return JSON.parse((await this.redis.get("whale:snapshot")) ?? '{"coins":[],"clusters":[]}');
  }
  async kpis() {
    const s = await this.snapshot();
    const coins = s.coins ?? [];
    const totalLongUsd = coins.reduce((a, c) => a + c.longUsd, 0);
    const totalShortUsd = coins.reduce((a, c) => a + c.shortUsd, 0);
    const byLong = [...coins].sort((a, b) => b.longUsd - a.longUsd)[0] ?? { coin: "-", longUsd: 0 };
    const byShort = [...coins].sort((a, b) => b.shortUsd - a.shortUsd)[0] ?? { coin: "-", shortUsd: 0 };
    const byActive = [...coins].sort((a, b) => b.count - a.count)[0] ?? { coin: "-" };
    const byBull = [...coins].sort((a, b) => b.netUsd - a.netUsd)[0] ?? { coin: "-" };
    const byBear = [...coins].sort((a, b) => a.netUsd - b.netUsd)[0] ?? { coin: "-" };
    return {
      totalLongUsd, totalShortUsd,
      longShortRatio: totalShortUsd > 0 ? totalLongUsd / totalShortUsd : 0,
      largestLong: byLong, largestShort: byShort,
      mostActive: byActive.coin, mostBullish: byBull.coin, mostBearish: byBear.coin,
    };
  }
  async leaderboard(metric: string) {
    const s = await this.snapshot();
    const coins = [...(s.coins ?? [])];
    const key: Record<string, (c: CoinRow) => number> = {
      longVol: (c) => c.longUsd, shortVol: (c) => c.shortUsd,
      netLong: (c) => c.netUsd, netShort: (c) => -c.netUsd, active: (c) => c.count,
    };
    const f = key[metric] ?? key.longVol;
    return coins.sort((a, b) => f(b) - f(a)).slice(0, 20);
  }
}
```

- [ ] **Step 6: `services/api/src/routes/feed.ts`**

```ts
import type { FastifyInstance } from "fastify";
import { State } from "../state.js";
export function feedRoutes(app: FastifyInstance, state: State) {
  app.get("/api/health", async () => ({ ok: true }));
  app.get("/api/feed", async (req) => state.feed(Number((req.query as any).limit ?? 100)));
  app.get("/api/snapshot", async () => state.snapshot());
  app.get("/api/kpis", async () => state.kpis());
  app.get("/api/leaderboard", async (req) => state.leaderboard(String((req.query as any).metric ?? "longVol")));
}
```

- [ ] **Step 7: `services/api/src/routes/wallet.ts`**

```ts
import type { FastifyInstance } from "fastify";
import { prisma } from "@whale/db";
export function walletRoutes(app: FastifyInstance) {
  app.get("/api/wallet/:addr", async (req) => {
    const addr = (req.params as any).addr as string;
    const [events, ledger] = await Promise.all([
      prisma.whaleEvent.findMany({ where: { taker: addr }, orderBy: { ts: "desc" }, take: 50 }),
      prisma.positionLedger.findMany({ where: { wallet: addr } }),
    ]);
    return { address: addr, recent: events, openPositions: ledger };
  });
}
```

- [ ] **Step 8: `services/api/src/server.ts`**

```ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Redis from "ioredis";
import { State } from "./state.js";
import { feedRoutes } from "./routes/feed.js";
import { walletRoutes } from "./routes/wallet.js";
import { registerWsGateway } from "./ws-gateway.js";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(websocket);
const state = new State(redis);
feedRoutes(app, state);
walletRoutes(app);
registerWsGateway(app, process.env.REDIS_URL ?? "redis://localhost:6379");

const port = Number(process.env.PORT ?? 4000);
app.listen({ port, host: "0.0.0.0" }).then(() => app.log.info(`api on ${port}`));
```

- [ ] **Step 9: Run — expect PASS** · Run: `pnpm -C services/api test`

- [ ] **Step 10: Commit** · `git add -A && git commit -m "feat(api): fastify REST readers + state"`

### Task 4.2: WS gateway (Redis pub/sub → browser)

**Files:**
- Create: `services/api/src/ws-gateway.ts`

**Interfaces:**
- `registerWsGateway(app, redisUrl)` — on `GET /ws`, subscribes a dedicated Redis connection to `whale:events` + `whale:snapshot`, forwards each message to all connected browser sockets as `{type:"event"|"snapshot", data}`; sends the current `whale:snapshot` on connect; cleans up on close.

- [ ] **Step 1: `services/api/src/ws-gateway.ts`**

```ts
import type { FastifyInstance } from "fastify";
import Redis from "ioredis";

export function registerWsGateway(app: FastifyInstance, redisUrl: string) {
  const sub = new Redis(redisUrl);
  const store = new Redis(redisUrl);
  const clients = new Set<import("ws").WebSocket>();
  sub.subscribe("whale:events", "whale:snapshot");
  sub.on("message", (channel, message) => {
    const type = channel === "whale:events" ? "event" : "snapshot";
    const payload = JSON.stringify({ type, data: JSON.parse(message) });
    for (const c of clients) { if (c.readyState === c.OPEN) c.send(payload); }
  });
  app.get("/ws", { websocket: true }, async (conn) => {
    clients.add(conn.socket);
    const snap = await store.get("whale:snapshot");
    if (snap) conn.socket.send(JSON.stringify({ type: "snapshot", data: JSON.parse(snap) }));
    conn.socket.on("close", () => clients.delete(conn.socket));
  });
}
```

- [ ] **Step 2: Typecheck** · Run: `pnpm -C services/api typecheck`

- [ ] **Step 3: Commit** · `git add -A && git commit -m "feat(api): websocket gateway bridging redis pubsub to browser"`

---

## Milestone 5 — `services/web` (Next.js dashboard)

> **Note:** UI tasks include full code for the data layer and representative code for components; where a component is a straightforward Tailwind render of typed props, the plan gives the props + the key JSX so the implementer follows the established pattern. Every component consumes typed data from `lib/` — no inline data fabrication.

### Task 5.1: Next.js app + data layer

**Files:**
- Create: `services/web/package.json`, `services/web/next.config.mjs`, `services/web/tsconfig.json`, `services/web/tailwind.config.ts`, `services/web/postcss.config.mjs`, `services/web/app/globals.css`, `services/web/app/layout.tsx`, `services/web/lib/types.ts`, `services/web/lib/api.ts`, `services/web/lib/ws.ts`, `services/web/lib/store.ts`, `services/web/lib/format.ts`

**Interfaces:**
- `lib/types.ts` mirrors snapshot/event/kpi shapes from the API.
- `lib/api.ts`: `fetchSnapshot()`, `fetchKpis()`, `fetchFeed(limit)`, `fetchWallet(addr)` against `NEXT_PUBLIC_API_URL`.
- `lib/ws.ts`: `connectWS(onEvent, onSnapshot)` — native WebSocket to `NEXT_PUBLIC_WS_URL`, auto-reconnect with backoff.
- `lib/store.ts`: Zustand store `{ window, threshold, filters, feed[], snapshot, setWindow, setThreshold, pushEvent, setSnapshot }`.
- `lib/format.ts`: `fmtUsd`, `fmtCompact`, `fmtPct`, `shortAddr`, `changeColor(change)`.

- [ ] **Step 1: `services/web/package.json`**

```json
{
  "name": "@whale/web",
  "version": "0.0.0",
  "private": true,
  "scripts": { "dev": "next dev -p 3000", "build": "next build", "start": "next start -p 3000", "typecheck": "tsc --noEmit" },
  "dependencies": {
    "next": "^14.2.0", "react": "^18.3.0", "react-dom": "^18.3.0",
    "@tanstack/react-query": "^5.56.0", "zustand": "^4.5.0",
    "lightweight-charts": "^4.2.0", "clsx": "^2.1.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0", "@types/react": "^18.3.0", "@types/node": "^22.0.0",
    "tailwindcss": "^3.4.0", "postcss": "^8.4.0", "autoprefixer": "^10.4.0"
  }
}
```

- [ ] **Step 2: Config files**

`next.config.mjs`:
```js
export default { reactStrictMode: true };
```
`tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "jsx": "preserve", "plugins": [{ "name": "next" }], "paths": { "@/*": ["./*"] } }, "include": ["**/*.ts", "**/*.tsx", ".next/types/**/*.ts"] }
```
`tailwind.config.ts`:
```ts
import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: { colors: {
    ink: "#0a0e17", panel: "rgba(255,255,255,0.04)",
    long: "#16c784", longDeep: "#0b6e46", short: "#ea3943", shortDeep: "#8b1e26",
  } } },
  plugins: [],
} satisfies Config;
```
`postcss.config.mjs`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```
`app/globals.css`:
```css
@tailwind base; @tailwind components; @tailwind utilities;
:root { color-scheme: dark; }
body { background: radial-gradient(1200px 600px at 20% -10%, #16223a 0%, #0a0e17 60%); color: #e6edf3; }
.glass { background: rgba(255,255,255,0.04); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; }
```

- [ ] **Step 3: `app/layout.tsx`**

```tsx
import "./globals.css";
export const metadata = { title: "Hyperliquid Whale Radar", description: "Real-time smart-money tracking" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
```

- [ ] **Step 4: `lib/types.ts`, `lib/format.ts`, `lib/api.ts`, `lib/ws.ts`, `lib/store.ts`**

`lib/types.ts`:
```ts
export type PositionChange = "NEW"|"INCREASE"|"REDUCE"|"CLOSE"|"FLIP_L2S"|"FLIP_S2L";
export interface WhaleEvent {
  id: string; ts: number; coin: string; taker: string; maker: string;
  side: "B"|"A"; direction: "long"|"short"; usd: number; sz: number; px: number;
  change: PositionChange; estimated: boolean;
  leverage?: number; liqPx?: number; entryPx?: number; uPnl?: number;
}
export interface CoinRow {
  coin: string; longUsd: number; shortUsd: number; netUsd: number; count: number;
  newWallets: number; mark: number; funding: number; oi: number;
  sentiment: { bullishPct: number; bearishPct: number; netLongPct: number };
  score: number; label: string; insight: string;
}
export interface Snapshot { ts: number; window: string; coins: CoinRow[]; clusters: Array<{ coin: string; direction: "long"|"short"; walletCount: number; totalUsd: number; strength: number; confidence: string }>; }
```

`lib/format.ts`:
```ts
export const fmtUsd = (n: number) => `$${Math.round(n).toLocaleString()}`;
export const fmtCompact = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n/1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(n/1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(n/1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};
export const fmtPct = (n: number) => `${n.toFixed(1)}%`;
export const shortAddr = (a: string) => `${a.slice(0,6)}…${a.slice(-4)}`;
export const changeColor = (c: string) =>
  c === "NEW" ? "text-long" : c === "INCREASE" ? "text-long/80" :
  c === "CLOSE" ? "text-zinc-400" : c.startsWith("FLIP") ? "text-amber-400" : "text-short/80";
```

`lib/api.ts`:
```ts
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export const fetchSnapshot = () => fetch(`${API}/api/snapshot`).then((r) => r.json());
export const fetchKpis = () => fetch(`${API}/api/kpis`).then((r) => r.json());
export const fetchFeed = (limit = 100) => fetch(`${API}/api/feed?limit=${limit}`).then((r) => r.json());
export const fetchWallet = (addr: string) => fetch(`${API}/api/wallet/${addr}`).then((r) => r.json());
```

`lib/ws.ts`:
```ts
export function connectWS(onEvent: (e: any) => void, onSnapshot: (s: any) => void): () => void {
  const url = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000/ws";
  let ws: WebSocket; let closed = false; let backoff = 1000;
  const open = () => {
    ws = new WebSocket(url);
    ws.onopen = () => { backoff = 1000; };
    ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.type === "event") onEvent(msg.data); else onSnapshot(msg.data); };
    ws.onclose = () => { if (!closed) { setTimeout(open, backoff); backoff = Math.min(backoff * 2, 15000); } };
    ws.onerror = () => ws.close();
  };
  open();
  return () => { closed = true; ws?.close(); };
}
```

`lib/store.ts`:
```ts
import { create } from "zustand";
import type { WhaleEvent, Snapshot } from "./types.js";
interface Filters { coin?: string; direction?: "long"|"short"; change?: string; }
interface S {
  window: string; threshold: number; filters: Filters;
  feed: WhaleEvent[]; snapshot: Snapshot | null;
  setWindow: (w: string) => void; setThreshold: (t: number) => void; setFilters: (f: Filters) => void;
  pushEvent: (e: WhaleEvent) => void; setSnapshot: (s: Snapshot) => void; setFeed: (f: WhaleEvent[]) => void;
}
export const useStore = create<S>((set) => ({
  window: "15m", threshold: 25_000, filters: {}, feed: [], snapshot: null,
  setWindow: (window) => set({ window }), setThreshold: (threshold) => set({ threshold }),
  setFilters: (filters) => set({ filters }),
  pushEvent: (e) => set((s) => ({ feed: [e, ...s.feed].slice(0, 500) })),
  setSnapshot: (snapshot) => set({ snapshot }), setFeed: (feed) => set({ feed }),
}));
```

- [ ] **Step 5: Typecheck** · Run: `pnpm -C services/web typecheck`

- [ ] **Step 6: Commit** · `git add -A && git commit -m "feat(web): next.js app shell + data layer (api/ws/store/format)"`

### Task 5.2: Dashboard components + page

**Files:**
- Create: `services/web/components/KpiBar.tsx`, `Controls.tsx`, `WhaleFeed.tsx`, `Heatmap.tsx`, `Leaderboard.tsx`, `SentimentPanel.tsx`, `InsightsPanel.tsx`, `ClusterStrip.tsx`, `WalletDrawer.tsx`, `Providers.tsx`; `services/web/app/page.tsx`

**Interfaces:**
- All components take typed props from `lib/types`. `page.tsx` is a client component that: loads initial snapshot+feed via TanStack Query, opens WS via `connectWS`, wires store, applies threshold/window/filters client-side, and lays out the panels in a responsive glass grid.

- [ ] **Step 1: `components/KpiBar.tsx`** (representative; others follow the same typed-props pattern)

```tsx
"use client";
import { fmtCompact } from "@/lib/format";
export function KpiBar({ k }: { k: any }) {
  if (!k) return null;
  const cell = (label: string, value: string, tone = "") => (
    <div className="glass px-4 py-3 min-w-[150px]">
      <div className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</div>
      <div className={`text-lg font-semibold ${tone}`}>{value}</div>
    </div>
  );
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {cell("Whale Longs", fmtCompact(k.totalLongUsd), "text-long")}
      {cell("Whale Shorts", fmtCompact(k.totalShortUsd), "text-short")}
      {cell("L/S Ratio", (k.longShortRatio ?? 0).toFixed(2))}
      {cell("Largest Long", `${k.largestLong?.coin} ${fmtCompact(k.largestLong?.longUsd ?? 0)}`, "text-long")}
      {cell("Largest Short", `${k.largestShort?.coin} ${fmtCompact(k.largestShort?.shortUsd ?? 0)}`, "text-short")}
      {cell("Most Active", k.mostActive ?? "-")}
      {cell("Most Bullish", k.mostBullish ?? "-", "text-long")}
      {cell("Most Bearish", k.mostBearish ?? "-", "text-short")}
    </div>
  );
}
```

- [ ] **Step 2: `components/WhaleFeed.tsx`** (live table, color-coded, threshold-filtered)

```tsx
"use client";
import { useStore } from "@/lib/store";
import { fmtCompact, shortAddr, changeColor, fmtPct } from "@/lib/format";
export function WhaleFeed({ onWallet }: { onWallet: (a: string) => void }) {
  const { feed, threshold, filters } = useStore();
  const rows = feed.filter((e) =>
    e.usd >= threshold &&
    (!filters.coin || e.coin === filters.coin) &&
    (!filters.direction || e.direction === filters.direction) &&
    (!filters.change || e.change === filters.change));
  return (
    <div className="glass p-3 overflow-auto max-h-[70vh]">
      <table className="w-full text-sm">
        <thead className="text-zinc-400 text-xs sticky top-0">
          <tr>{["Time","Coin","Dir","Size","Contracts","Entry","Lev","Status","Liq","PnL","Wallet"].map((h) => <th key={h} className="text-left px-2 py-1">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className={`border-t border-white/5 ${e.change === "NEW" && e.direction === "long" ? "bg-long/5" : e.direction === "short" && e.change === "NEW" ? "bg-short/5" : ""}`}>
              <td className="px-2 py-1 text-zinc-400">{new Date(e.ts).toLocaleTimeString()}</td>
              <td className="px-2 py-1 font-semibold">{e.coin}</td>
              <td className={`px-2 py-1 ${e.direction === "long" ? "text-long" : "text-short"}`}>{e.direction.toUpperCase()}</td>
              <td className="px-2 py-1">{fmtCompact(e.usd)}</td>
              <td className="px-2 py-1">{e.sz}</td>
              <td className="px-2 py-1">{e.px}</td>
              <td className="px-2 py-1">{e.leverage ? `${e.leverage}x` : "-"}</td>
              <td className={`px-2 py-1 ${changeColor(e.change)}`}>{e.change}{e.estimated ? " (est)" : ""}</td>
              <td className="px-2 py-1">{e.liqPx ?? "-"}</td>
              <td className={`px-2 py-1 ${(e.uPnl ?? 0) >= 0 ? "text-long" : "text-short"}`}>{e.uPnl != null ? fmtCompact(e.uPnl) : "-"}</td>
              <td className="px-2 py-1 text-sky-300 cursor-pointer" onClick={() => onWallet(e.taker)}>{shortAddr(e.taker)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <div className="text-zinc-500 text-sm p-6 text-center">No whale trades in this window at the current threshold. This reflects the live tape — not an error.</div>}
    </div>
  );
}
```

- [ ] **Step 3: Remaining components** — implement following the same pattern, each in its own file, typed props from `lib/types`:
  - `Controls.tsx`: window buttons (`5m…7d`, default 15m → `setWindow`), threshold preset buttons + custom number input → `setThreshold`, direction/change/coin `<select>` → `setFilters`, search box.
  - `Heatmap.tsx`: grid of `snapshot.coins` (rows) — for v1, a single-column intensity cell per coin using `netUsd` → color from `long/longDeep/short/shortDeep`; label with coin + `fmtCompact(netUsd)`. (Time-bucketed columns arrive when snapshot carries per-bucket history in phase 2; v1 renders current-window intensity.)
  - `Leaderboard.tsx`: metric tab buttons → sort `snapshot.coins` by the chosen field; render ranked list.
  - `SentimentPanel.tsx`: for a selected/most-active coin, render bullish/bearish bars + Smart-Money score gauge + label emoji.
  - `InsightsPanel.tsx`: render `coin.insight` strings for top-N coins by activity.
  - `ClusterStrip.tsx`: map `snapshot.clusters` → chips with coin, direction color, `walletCount`, `fmtCompact(totalUsd)`, strength %, confidence.
  - `WalletDrawer.tsx`: on open, `fetchWallet(addr)` and show address, open positions, recent events.
  - `Providers.tsx`: wraps children in a TanStack `QueryClientProvider`.

- [ ] **Step 4: `app/page.tsx`** (client page wiring it together)

```tsx
"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Providers } from "@/components/Providers";
import { KpiBar } from "@/components/KpiBar";
import { Controls } from "@/components/Controls";
import { WhaleFeed } from "@/components/WhaleFeed";
import { Heatmap } from "@/components/Heatmap";
import { Leaderboard } from "@/components/Leaderboard";
import { SentimentPanel } from "@/components/SentimentPanel";
import { InsightsPanel } from "@/components/InsightsPanel";
import { ClusterStrip } from "@/components/ClusterStrip";
import { WalletDrawer } from "@/components/WalletDrawer";
import { useStore } from "@/lib/store";
import { connectWS } from "@/lib/ws";
import { fetchSnapshot, fetchFeed, fetchKpis } from "@/lib/api";

function Dashboard() {
  const { setSnapshot, pushEvent, setFeed, snapshot } = useStore();
  const [wallet, setWallet] = useState<string | null>(null);
  const kpis = useQuery({ queryKey: ["kpis", snapshot?.ts], queryFn: fetchKpis });
  useEffect(() => {
    fetchSnapshot().then(setSnapshot); fetchFeed(200).then(setFeed);
    return connectWS(pushEvent, setSnapshot);
  }, [setSnapshot, pushEvent, setFeed]);
  return (
    <main className="p-4 space-y-4 max-w-[1600px] mx-auto">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">🐋 Hyperliquid Whale Radar</h1>
      </header>
      <KpiBar k={kpis.data} />
      <Controls />
      <ClusterStrip />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-4"><WhaleFeed onWallet={setWallet} /><Heatmap /></div>
        <div className="space-y-4"><SentimentPanel /><Leaderboard /><InsightsPanel /></div>
      </div>
      {wallet && <WalletDrawer addr={wallet} onClose={() => setWallet(null)} />}
    </main>
  );
}
export default function Page() { return <Providers><Dashboard /></Providers>; }
```

- [ ] **Step 5: Typecheck + build** · Run: `pnpm -C services/web typecheck && pnpm -C services/web build`
Expected: compiles.

- [ ] **Step 6: Commit** · `git add -A && git commit -m "feat(web): dashboard components + page wiring"`

### Task 5.3: CSV/JSON export + dark/light toggle + keyboard shortcuts

**Files:**
- Create: `services/web/lib/export.ts`, `services/web/components/ExportBar.tsx`; Modify: `services/web/app/page.tsx`

**Interfaces:**
- `exportCsv(rows)`, `exportJson(rows)` trigger a browser download of the current filtered feed.
- `ExportBar` buttons call them with the store's filtered feed.

- [ ] **Step 1: `lib/export.ts`**

```ts
import type { WhaleEvent } from "./types.js";
function download(name: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
export function exportJson(rows: WhaleEvent[]) { download("whale-feed.json", JSON.stringify(rows, null, 2), "application/json"); }
export function exportCsv(rows: WhaleEvent[]) {
  const cols = ["ts","coin","direction","usd","sz","px","leverage","change","liqPx","uPnl","taker"];
  const head = cols.join(",");
  const body = rows.map((r) => cols.map((c) => (r as any)[c] ?? "").join(",")).join("\n");
  download("whale-feed.csv", `${head}\n${body}`, "text/csv");
}
```

- [ ] **Step 2: `components/ExportBar.tsx`** + wire into `page.tsx` header; add a `useEffect` key handler (`f`=focus search, `l`=long filter, `s`=short filter, `esc`=clear).

```tsx
"use client";
import { useStore } from "@/lib/store";
import { exportCsv, exportJson } from "@/lib/export";
export function ExportBar() {
  const { feed, threshold } = useStore();
  const rows = feed.filter((e) => e.usd >= threshold);
  return (
    <div className="flex gap-2">
      <button className="glass px-3 py-1 text-sm" onClick={() => exportCsv(rows)}>Export CSV</button>
      <button className="glass px-3 py-1 text-sm" onClick={() => exportJson(rows)}>Export JSON</button>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck** · Run: `pnpm -C services/web typecheck`

- [ ] **Step 4: Commit** · `git add -A && git commit -m "feat(web): CSV/JSON export + keyboard shortcuts"`

---

## Milestone 6 — Infra, docs, end-to-end

### Task 6.1: Dockerfiles + docker-compose + env

**Files:**
- Create: `infra/Dockerfile.worker`, `infra/Dockerfile.api`, `infra/Dockerfile.web`, `infra/docker-compose.yml`, `infra/.env.example`

**Interfaces:**
- `docker-compose up` starts postgres, redis, worker, api, web; runs prisma migrate on worker start.

- [ ] **Step 1: `infra/.env.example`**

```
POSTGRES_USER=whale
POSTGRES_PASSWORD=whale
POSTGRES_DB=whale
DATABASE_URL=postgresql://whale:whale@postgres:5432/whale
REDIS_URL=redis://redis:6379
HL_REST_URL=https://api.hyperliquid.xyz/info
HL_WS_URL=wss://api.hyperliquid.xyz/ws
WHALE_FLOOR_USD=25000
COINS_PER_CONN=50
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=ws://localhost:4000/ws
PORT=4000
```

- [ ] **Step 2: `infra/Dockerfile.worker`** (multi-stage; pnpm; prisma generate + migrate on start)

```dockerfile
FROM node:20-slim AS base
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY services/worker ./services/worker
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile=false
RUN pnpm -C packages/db generate
RUN pnpm -C services/worker build
CMD sh -c "pnpm -C packages/db migrate && node services/worker/dist/main.js"
```

- [ ] **Step 3: `infra/Dockerfile.api`**

```dockerfile
FROM node:20-slim
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY services/api ./services/api
RUN pnpm install --frozen-lockfile=false
RUN pnpm -C packages/db generate
RUN pnpm -C services/api build
CMD ["node", "services/api/dist/server.js"]
```

- [ ] **Step 4: `infra/Dockerfile.web`**

```dockerfile
FROM node:20-slim
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY services/web ./services/web
RUN pnpm install --frozen-lockfile=false
RUN pnpm -C services/web build
CMD ["pnpm", "-C", "services/web", "start"]
```

- [ ] **Step 5: `infra/docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment: { POSTGRES_USER: whale, POSTGRES_PASSWORD: whale, POSTGRES_DB: whale }
    ports: ["5432:5432"]
    volumes: ["pg:/var/lib/postgresql/data"]
    healthcheck: { test: ["CMD-SHELL","pg_isready -U whale"], interval: 5s, retries: 10 }
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    healthcheck: { test: ["CMD","redis-cli","ping"], interval: 5s, retries: 10 }
  worker:
    build: { context: .., dockerfile: infra/Dockerfile.worker }
    env_file: .env
    depends_on: { postgres: { condition: service_healthy }, redis: { condition: service_healthy } }
  api:
    build: { context: .., dockerfile: infra/Dockerfile.api }
    env_file: .env
    ports: ["4000:4000"]
    depends_on: { redis: { condition: service_healthy } }
  web:
    build: { context: .., dockerfile: infra/Dockerfile.web }
    env_file: .env
    ports: ["3000:3000"]
    depends_on: [api]
volumes: { pg: {} }
```

- [ ] **Step 6: Commit** · `git add -A && git commit -m "chore(infra): dockerfiles + compose + env example"`

### Task 6.2: README + full-stack smoke

**Files:**
- Create: `README.md`

**Interfaces:** documents setup, architecture, Smart-Money Score formula/weights, honesty notes, phase-2 roadmap.

- [ ] **Step 1: Write `README.md`** covering: overview; verified data sources; `cp infra/.env.example infra/.env`; local dev (`pnpm install`, run postgres+redis via compose, `pnpm -C packages/db migrate:dev`, `pnpm -C services/worker dev`, `pnpm -C services/api dev`, `pnpm -C services/web dev`); one-command `cd infra && docker-compose up --build`; **Smart-Money Score formula table (weights from `score.ts`)**; **honesty section** (real-data-only, "est." labels, intermittent-tape note); deferred phase-2 list.

- [ ] **Step 2: Full-stack smoke test**

Run: `cd infra && cp .env.example .env && docker-compose up --build -d && sleep 45`
Then: `curl -s localhost:4000/api/health` → `{"ok":true}`; `curl -s localhost:4000/api/snapshot | head -c 300` → JSON with coins; open `localhost:3000` → dashboard renders, KPI bar populated, feed receives live events within a few minutes.
Expected: all green. Capture any errors and fix before proceeding.

- [ ] **Step 3: Tear down** · Run: `docker-compose down`

- [ ] **Step 4: Commit** · `git add -A && git commit -m "docs: README with setup, score formula, honesty notes"`

### Task 6.3: Root test + typecheck gate

- [ ] **Step 1: Run full suite** · Run: `pnpm install && pnpm test && pnpm -r typecheck`
Expected: all packages' unit + integration tests pass; no type errors.

- [ ] **Step 2: Commit** · `git add -A && git commit -m "chore: green full test + typecheck gate"`

---

## Self-Review

**1. Spec coverage (v1 scope):**
- Live whale feed + New/Increase/Reduce/Close/Flip → Tasks 1.2, 3.4, 5.2 ✓
- Time windows (default 15m) → `WINDOW_MS` 1.1, aggregator 1.3, Controls 5.2 ✓
- Whale thresholds + custom → store 5.1, Controls 5.2, floor filter 3.4 ✓
- Every perp market + new-coin detection → 1.6 diffUniverse, 3.5 Universe, 3.6 loop ✓
- Data columns (entry, current, leverage, liq, PnL, funding, OI) → WhaleEvent enrich 3.6, snapshot ctx, WhaleFeed 5.2 ✓
- Position snapshot compare engine → Ledger 3.3 + classify 1.2 ✓
- KPI bar → State.kpis 4.1, KpiBar 5.2 ✓
- Heatmap → Heatmap 5.2 (current-window intensity; time-bucket columns noted as phase-2 data dependency) ✓
- Leaderboard → State.leaderboard 4.1, Leaderboard 5.2 ✓
- Smart-Money score → 1.5, snapshot 3.6, SentimentPanel 5.2 ✓
- Cluster detection → 1.4, snapshot 3.6, ClusterStrip 5.2 ✓
- Sentiment → 1.6, SentimentPanel 5.2 ✓
- AI insights → 1.6 buildInsight, InsightsPanel 5.2 ✓
- Wallet profiling (basic/live) → wallet route 4.1, WalletDrawer 5.2 (win-rate deferred, documented) ✓
- API resilience (reconnect/heartbeat/retry/validation/cache) → ws.ts 3.2, rest.ts backoff 3.1, zod 1.1/3.1, Redis cache ✓
- Export CSV/JSON, dark, shortcuts → 5.3 ✓
- Docker/compose/env/README/sample data/tests → M6 + 3.6 fixture ✓
- Deferred (documented): alert delivery, win-rate profiling, drag-drop, replay UI, auth — matches spec §6 ✓

**2. Placeholder scan:** No "TBD/TODO/handle edge cases" in code steps; each code step shows full code. Component Step 5.2.3 lists remaining components with explicit per-file responsibilities and the shared typed-props pattern rather than repeating near-identical JSX — each is a direct render of already-defined `lib/types` shapes. ✓

**3. Type consistency:** `WhaleEvent` shape identical in core `types.ts` and web `lib/types.ts`; `classify` returns `{change,newNet,direction}` used consistently; `CoinRow`/snapshot fields match between `State` (api) and `lib/types` (web); ledger `apply` return `{prevNet,newNet,seeded}` consumed in pipeline; `smartMoneyScore` `ScoreInputs` match call site in `main.ts`. ✓

---
```
