# 🐋 Hyperliquid Whale Radar

Real-time, institutional-grade dashboard that answers one question:

> **Which coin did whales aggressively LONG or SHORT in the last 15 minutes — and why?**

Built entirely on **real Hyperliquid data**. Every trade on Hyperliquid carries the
maker/taker wallet addresses, so whale attribution is genuine — not inferred from
aggregate order flow like on a CEX.

---

## What it does

- Streams **every trade** on **every Hyperliquid perp** (231+ markets) over WebSocket.
- Maintains a per-`(wallet, coin)` **position ledger** and classifies each whale-sized
  fill as **NEW / INCREASE / REDUCE / CLOSE / FLIP** (baseline seeded from on-chain
  `clearinghouseState`; unseeded classifications are flagged `·est`).
- Rolls flow into time windows (**5m → 7d**, default **15m**) powering the KPI bar,
  heatmap, leaderboard, per-coin sentiment, **Smart-Money Score**, cluster detection,
  and template AI insights.
- Pushes updates to the browser live over a WebSocket — the numbers move because real
  trades are landing.

## Architecture

pnpm + Turborepo monorepo:

| Path | Responsibility |
|------|----------------|
| `packages/core` | Pure, unit-tested engines: classification, windows, cluster, score, sentiment, insights |
| `packages/db` | Prisma schema + client (Postgres) |
| `services/worker` | HL ingestion (sharded WS + REST), ledger, pipeline, snapshot builder, Redis publisher |
| `services/api` | Fastify REST readers + Redis→browser WebSocket gateway |
| `services/web` | Next.js dark-glassmorphism dashboard |

Runtime services (docker-compose): **postgres · redis · worker · api · web**.

Data flow: `HL WS trades → worker (ledger + classify + aggregate) → Redis (hot state + pub/sub) + Postgres (history) → api → browser`.

## Quick start (Docker — one command)

```bash
cd infra
cp .env.example .env
docker compose up --build
```

Then open **http://localhost:3000**. The API is on **http://localhost:4000**
(`/api/health`, `/api/snapshot`, `/api/kpis`, `/api/feed`, `/api/leaderboard`, `/api/wallet/:addr`).

> Whale trades are intermittent. A quiet window legitimately shows few rows — that is
> the live tape, not a bug. Lower the whale threshold to see more flow.

## Local development (no Docker for the app)

```bash
# 1. deps
pnpm install

# 2. infra (postgres + redis only)
cd infra && cp .env.example .env && docker compose up -d postgres redis && cd ..

# 3. db schema
DATABASE_URL="postgresql://whale:whale@localhost:5432/whale" pnpm -C packages/db push

# 4. run the three services (separate terminals)
REDIS_URL=redis://localhost:6379 DATABASE_URL=postgresql://whale:whale@localhost:5432/whale pnpm -C services/worker dev
REDIS_URL=redis://localhost:6379 pnpm -C services/api dev
NEXT_PUBLIC_API_URL=http://localhost:4000 NEXT_PUBLIC_WS_URL=ws://localhost:4000/ws pnpm -C services/web dev
```

## Tests

```bash
pnpm test           # all unit + integration suites (vitest)
pnpm -r typecheck   # strict TypeScript across every package
```

`services/worker/test/integration.test.ts` replays a **real recorded trade fixture**
(`fixtures/trades-sample.jsonl`) through the whole pipeline. Recapture anytime:

```bash
node scripts/capture-fixture.mjs BTC ETH SOL HYPE DOGE
```

## Smart-Money Score (0–100) — the formula, no black box

`score = round(clamp(50 + signal·50, 0, 100))`, where `signal ∈ [-1,1]` is a weighted blend:

| Sub-signal | Weight | Definition |
|-----------|:------:|------------|
| Flow direction | **0.45** | `netUsd / grossUsd` (whale long$ vs short$), clamped ±1 |
| OI change | **0.20** | `oiChangePct / 20`, clamped ±1 (±20% saturates) |
| Cluster activity | **0.20** | `clusterStrength/100`, signed by flow direction |
| New wallets | **0.10** | `newWallets/20`, signed by flow direction (20 saturates) |
| Funding | **0.05** | `-funding / 0.0005`, clamped ±1 (crowded longs = mild bearish) |

Labels: **≥80** 🔥 Strong Buy · **≥60** 🟢 Bullish · **>40** 🟡 Neutral · **>20** 🔴 Bearish · **else** ⚠ Heavy Shorting.
Weights live in [`packages/core/src/score.ts`](packages/core/src/score.ts).

**Cluster detection:** ≥ `minWallets` distinct wallets opening the same coin/direction
(NEW or INCREASE) within the window, totaling ≥ `minTotalUsd`. Strength scales with how
far both thresholds are exceeded; confidence = High ≥80, Medium ≥50, else Low.

## Data-integrity guarantees

- Every displayed number traces to a real Hyperliquid source (WS trades, `metaAndAssetCtxs`, `clearinghouseState`).
- No mock/random generator feeds the production UI. The only synthetic data is the
  clearly-labelled `fixtures/trades-sample.jsonl` used by tests.
- Classifications without an on-chain-seeded baseline are labelled `·est`, never hidden.

## Roadmap (phase 2 — clean seams already in place)

Alert delivery (Telegram/Discord/email/webhook) · wallet win-rate & realized-PnL
profiling · drag-drop resizable layout · full historical replay UI · auth/accounts ·
time-bucketed heatmap columns (worker already persists `CoinSnapshot` history).

---

*Not financial advice.*
