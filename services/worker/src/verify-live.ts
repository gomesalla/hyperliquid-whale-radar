// Live end-to-end verification of the worker brain against REAL Hyperliquid data.
// Uses an in-memory Redis (ioredis-mock) and no Postgres, so it needs no infra.
// Run: pnpm -C services/worker exec tsx src/verify-live.ts
import RedisMock from "ioredis-mock";
import { HLRest } from "./hl/rest.js";
import { HLTradeStream } from "./hl/ws.js";
import { Pipeline } from "./pipeline.js";
import {
  WindowAggregator, detectClusters, smartMoneyScore, coinSentiment, buildInsight,
  WINDOW_MS, type CoinCtx, type WhaleEvent,
} from "@whale/core";

const FLOOR = 25_000;
const RUN_MS = 40_000;

async function main() {
  const redis = new RedisMock();
  const rest = new HLRest("https://api.hyperliquid.xyz/info");
  console.log("Fetching live universe…");
  const ctxs = await rest.metaAndAssetCtxs();
  const ctxMap = new Map<string, CoinCtx>(ctxs.map((c) => [c.coin, c]));
  console.log(`  ${ctxs.length} markets live.`);

  // Focus on the 40 highest-volume coins to surface whale hits quickly.
  const topCoins = [...ctxs].sort((a, b) => b.dayNtlVlm - a.dayNtlVlm).slice(0, 40).map((c) => c.coin);

  const agg = new WindowAggregator();
  const events: Array<{ coin: string; direction: "long" | "short"; usd: number; taker: string; ts: number; change: WhaleEvent["change"] }> = [];
  const collected: WhaleEvent[] = [];
  let enrichedOnce = false;

  const enrich = async (ev: WhaleEvent) => {
    if (enrichedOnce) return; // enrich just one, to prove clearinghouseState works without hammering
    enrichedOnce = true;
    const s = await rest.clearinghouseState(ev.taker);
    const pos = s.positions.find((p) => p.coin === ev.coin);
    if (pos) { ev.leverage = pos.leverage; ev.liqPx = pos.liqPx ?? undefined; ev.entryPx = pos.entryPx; ev.uPnl = pos.uPnl; }
  };

  const pipeline = new Pipeline({ redis: redis as never, whaleFloorUsd: FLOOR, agg, ctx: ctxMap, enrich });

  const stream = new HLTradeStream("wss://api.hyperliquid.xyz/ws", 50);
  stream.on("trade", (t) => {
    void pipeline.handleTrade(t).then((ev) => {
      if (!ev) return;
      collected.push(ev);
      events.push({ coin: ev.coin, direction: ev.direction, usd: ev.usd, taker: ev.taker, ts: ev.ts, change: ev.change });
      const tag = `${ev.change}${ev.estimated ? "·est" : ""}`;
      console.log(`  🐋 ${ev.coin.padEnd(6)} ${ev.direction.toUpperCase().padEnd(5)} $${Math.round(ev.usd).toLocaleString().padStart(12)}  ${tag}`);
    });
  });
  console.log(`Subscribing to top ${topCoins.length} coins for ${RUN_MS / 1000}s (whale floor $${FLOOR.toLocaleString()})…\n`);
  stream.start(topCoins);

  await new Promise((r) => setTimeout(r, RUN_MS));
  stream.stop();

  // Build a snapshot exactly as main.ts does.
  const now = Date.now();
  const rows = agg.snapshot(now, "15m");
  const clusters = detectClusters(events, { windowMs: WINDOW_MS["15m"], now, minWallets: 3, minTotalUsd: 250_000 });
  const coins = [...rows.entries()].map(([coin, r]) => {
    const ctx = ctxMap.get(coin);
    const sentiment = coinSentiment(r);
    const { score, label } = smartMoneyScore({
      netUsd: r.netUsd, grossUsd: r.longUsd + r.shortUsd, oiChangePct: 0,
      funding: ctx?.funding ?? 0, newWallets: r.newWallets, clusterStrength: 0,
    });
    const insight = buildInsight(coin, { longUsd: r.longUsd, shortUsd: r.shortUsd, oiChangePct: 0, funding: ctx?.funding ?? 0, newWallets: r.newWallets, windowLabel: "15 minutes" });
    return { coin, ...r, score, label, sentiment, insight };
  }).sort((a, b) => (b.longUsd + b.shortUsd) - (a.longUsd + a.shortUsd));

  console.log("\n========== SNAPSHOT (built from live data) ==========");
  console.log(`Whale events detected: ${collected.length}`);
  const totalLong = coins.reduce((a, c) => a + c.longUsd, 0);
  const totalShort = coins.reduce((a, c) => a + c.shortUsd, 0);
  console.log(`Total whale LONG:  $${Math.round(totalLong).toLocaleString()}`);
  console.log(`Total whale SHORT: $${Math.round(totalShort).toLocaleString()}`);
  console.log(`\nTop coins by whale activity:`);
  for (const c of coins.slice(0, 5)) {
    console.log(`  ${c.coin.padEnd(6)} net $${Math.round(c.netUsd).toLocaleString().padStart(12)}  score ${c.score} ${c.label}  (${c.count} trades, ${c.newWallets} wallets)`);
  }
  if (coins[0]) console.log(`\nInsight: ${coins[0].insight}`);
  const enriched = collected.find((e) => e.leverage !== undefined);
  if (enriched) console.log(`\nEnriched sample (real clearinghouseState): ${enriched.coin} lev=${enriched.leverage}x liqPx=${enriched.liqPx} uPnl=${enriched.uPnl}`);
  if (clusters.length) console.log(`\nClusters: ${clusters.map((c) => `${c.coin} ${c.direction} ${c.walletCount}w ${c.strength}%`).join(", ")}`);
  console.log("=====================================================");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
