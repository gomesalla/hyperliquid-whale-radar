# Hyperliquid Whale Radar — Design Spec (v1: Core Whale Radar)

**Date:** 2026-07-07
**Status:** Approved — ready for implementation planning
**One-line goal:** Answer, in real time, *"Which coin did whales aggressively LONG or SHORT in the last 15 minutes — and why?"* using only real Hyperliquid data.

---

## 0. Scope decision

This spec covers **v1: Core Whale Radar** only. The full brief describes ~8 subsystems; we build the core radar first, to a real, tested, deployed state, then layer the rest.

**In v1:** live whale feed with New/Increase/Reduce/Close/Flip classification, time-window + threshold selectors, KPI bar, heatmap, leaderboard, coin sentiment, Smart-Money score, cluster detection, template AI insights, wallet drill-down (live profile), CSV/JSON export — all on **real live Hyperliquid data**, deployable via one `docker-compose`.

**Deferred to phase 2 (clean seams left, documented, not silently dropped):** wallet win-rate/realized-PnL profiling, alert *delivery* (Telegram/Discord/email/webhook), drag-drop resizable layout, full historical replay UI, auth/accounts.

---

## 1. Feasibility (verified live against `api.hyperliquid.xyz`, 2026-07-07)

These are confirmed by live calls, not assumptions:

- **Per-trade wallet attribution is real.** WS `trades` returns on every fill:
  `{coin, side("B"|"A"), px, sz, time, hash, tid, users:[maker, taker]}`. This is the enabler for "which whale" — Hyperliquid is transparent on-chain.
- **231 live perp markets** from a single `POST /info {type:"metaAndAssetCtxs"}`, each with real **openInterest, funding, markPx, dayNtlVlm (24h volume)**.
- **Per-wallet position state** via `POST /info {type:"clearinghouseState", user}` returns real **entryPx, leverage, liquidationPx, unrealizedPnl, positionValue** per open position.

Consequence: entry price, leverage, liquidation price, and unrealized PnL are **genuine**, not estimated. No fabrication anywhere in the product.

---

## 2. Architecture

**pnpm monorepo (Turborepo).** Engine logic lives in a shared package so it is unit-testable in isolation and reused by worker + api.

```
services/
  worker/   Hyperliquid ingestion + detection engines (the brain; long-running)
  api/      Fastify REST + WebSocket gateway to the browser
  web/      Next.js (App Router) dashboard — dark glassmorphism
packages/
  core/     shared TS types + PURE engines (classification, cluster, scoring,
            sentiment, window-aggregation, usd/new-coin utils) — unit-tested
  db/       Prisma schema + generated client
infra/      Dockerfile(s), docker-compose.yml, .env.example
```

**Runtime services (docker-compose):** `postgres`, `redis`, `worker`, `api`, `web`.
`docker-compose up` brings the full system live on any always-on host (VPS / Railway / Fly / Render). This satisfies the "portable, host decided later" requirement.

**Framework choices (locked):** Fastify (not NestJS) for the API — lighter, faster, less boilerplate. Redis for hot state + pub/sub. Postgres + Prisma for durable history.

**Frontend stack:** Next.js App Router + TypeScript + TailwindCSS + TanStack Query + Zustand + lightweight-charts/Recharts + native WebSocket client with auto-reconnect.

---

## 3. Data flow

1. **Bootstrap universe.** Worker fetches `metaAndAssetCtxs` → coin list + per-coin OI/funding/mark/24h-vol. Re-diffs the universe on an interval to **auto-detect newly listed coins**.
2. **Subscribe to trades.** WS `trades` subscription for every coin, **sharded across multiple WS connections** (~50 coins/connection) with heartbeat, auto-reconnect, exponential backoff — respects Hyperliquid per-connection subscription limits.
3. **Per-trade processing.** USD = `px × sz`. Attribute the **aggressive** actor = the **taker**; `side "B"` = long-side buy, `side "A"` = short-side sell. Both wallets' ledgers update; the whale *event* is attributed to the taker. Trades below the smallest whale preset ($25k) are dropped cheaply; all ≥ $25k are retained so the UI threshold slider filters without reprocessing.
4. **Position-delta ledger** in Redis, keyed `(wallet, coin)` → signed net size. On first encounter of a whale-sized wallet, **seed the true baseline** from `clearinghouseState` (rate-limited queue, cached) so New-vs-Increase is accurate.
5. **Classify** (pure fn): `prevNet + delta → NEW | INCREASE | REDUCE | CLOSE | FLIP_L2S | FLIP_S2L`. NEW long → green highlight, etc. If baseline not yet seeded, event is labelled **"est."** — never silently faked.
6. **Enrich** with real coin ctx (funding, OI, OI-change-over-window, price-change) and real per-wallet `clearinghouseState` (leverage, liquidationPx, entryPx, unrealizedPnl), via a rate-limited queue with caching.
7. **Rolling window aggregates** (5m/15m/30m/1h/4h/12h/24h/7d; default **15m**) per coin: whale long $, whale short $, net, event count, distinct-new-wallet count. Feeds KPI bar, heatmap, leaderboard, sentiment.
8. **Publish** each whale event + aggregate-snapshot deltas to Redis pub/sub → API WS gateway → browser. Live motion is driven by **real trades landing**, not a timer.

**Rate-limit / resilience requirements:** automatic reconnect, heartbeat monitoring, request throttling with backoff, retry logic, payload validation (zod), snapshot re-sync on reconnect, incremental updates, Redis cache layer.

---

## 4. Detection engines (`packages/core`, deterministic, unit-tested)

- **Classification** — as in §3.5.
- **Cluster detection** — ≥ N distinct wallets, same coin, same direction, within window, ≥ $X total → cluster with strength % and confidence (High/Med/Low). Formula documented in code + README.
- **Smart-Money Score (0–100)** — transparent weighted blend: whale net-volume + OI change + funding + position growth + cluster activity (+ wallet-quality in phase 2). Emits label: 🔥 Strong Buy / 🟢 Bullish / 🟡 Neutral / 🔴 Bearish / ⚠ Heavy Shorting. **Weights and formula ship in README — no black box.**
- **Sentiment** — per coin: Bullish %, Bearish %, Net-Long %, Whale confidence, momentum/trend proxies.
- **AI Insights** — template natural-language generated from the **real aggregates** (deterministic fill-ins). Numbers always trace to real aggregates; an optional LLM may prettify prose later but never invents figures.

---

## 5. Persistence (Postgres via Prisma)

- `markets` — coin, szDecimals, maxLeverage, addedAt (new-coin detection).
- `whale_events` — ts, coin, taker, maker, side, usd, sz, px, classification, leverage, liqPx, entryPx, uPnl.
- `position_ledger` — wallet, coin, netSize, avgEntry, updatedAt (Redis-hot, periodically snapshotted here).
- `wallet` — address, firstSeen, label, totalTrades, totalVolume (phase-2: winRate, realizedPnl).
- `coin_snapshots` — coin, ts, oi, funding, mark, vol (drives OI/price change + charts history).
- `clusters` — coin, ts, direction, walletCount, totalUsd, strength, confidence.

Redis holds hot rolling-window state + pub/sub + ledger cache + rate-limit buckets + dedup sets.

---

## 6. Frontend — Core Whale Radar (dark, glassmorphism, responsive)

- **KPI bar:** Total Whale Longs, Total Whale Shorts, L/S ratio, Largest Long, Largest Short, Most Active Coin, Highest OI Increase, Highest Volume Increase, Most Bullish, Most Bearish.
- **Controls:** time-window selector (default 15m), whale-threshold presets ($25k/$50k/$100k/$250k/$500k/$1M/$2M/$5M) + custom input, refresh interval, filters (coin, direction, position-type, leverage, min/max size, New/Increase/Close/Cluster-only), search (wallet/coin/size/label).
- **Live Whale Feed table** — every column in the brief: timestamp, coin, direction, size USD, contracts, entry, current price, leverage, wallet + label, position status (color-coded: NEW=green, Increase, Reduce, Close, Flip), liquidation price, PnL, funding, OI. New positions highlighted green; shorts red.
- **Heatmap** — rows = coins, columns = time buckets; green (whale longs) → dark green (extreme bullish), red → dark red.
- **Leaderboard** — tabbed by: most whale long vol, most whale short vol, largest net long/short, most new wallets, highest OI growth, highest long/short growth, largest increase/close.
- **Sentiment panel + Smart-Money gauge** with label.
- **AI Insights panel** — live text.
- **Cluster strip** — active clusters with strength/confidence.
- **Wallet drill-down drawer** — live profile (address, first seen, current open positions, recent activity; deep win-rate profiling phase 2).
- **Extras in v1:** dark/light toggle, CSV/JSON export of current feed, auto-refresh, keyboard shortcuts.

---

## 7. Testing & sample data

- **Vitest unit tests** on every pure engine: classification, cluster, scoring, sentiment, window-aggregation, USD calc, new-coin diff. These are the correctness-critical, deterministic pieces.
- **Integration test** replays a **real recorded trade fixture** (captured from the live WS) through the pipeline and asserts whale events + aggregates. Runs offline.
- **Sample data** = recorded JSONL of real trades + a replay seed script (also the foundation for phase-2 replay mode).
- **Live smoke script** — connects ~30s, asserts events are received and classified.

---

## 8. Honesty guardrails (hard requirements)

- Every displayed number traces to a real Hyperliquid source.
- Classifications without a seeded baseline are labelled **"est."**, never hidden or invented.
- **No mock/random generator ever feeds the production UI.** The only synthetic data is the clearly-labelled test/demo replay fixture.
- Whale trades are intermittent: a quiet window legitimately shows few events. This is real, not a bug. Replay fixture is available for demos; production reflects the true tape.
- Smart-Money Score and cluster formulas are documented; nothing is presented as a signal without a stated derivation.

---

## 9. Deliverables (v1)

Full frontend · Fastify REST + WS API · WebSocket ingestion worker · whale detection engine · position snapshot/ledger comparison engine · Smart-Money scoring engine · cluster engine · sentiment + insights engines · Prisma/Postgres schema · Hyperliquid API integration layer (REST + WS, resilient) · Docker + docker-compose · `.env.example` · README with setup + score-formula docs · recorded sample data + replay seed · unit + integration tests.

Phase-2 seams left for: alert delivery, wallet win-rate profiling, drag-drop layout, replay UI, auth.
