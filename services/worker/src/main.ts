import Redis from "ioredis";
import { loadConfig } from "./config.js";
import { HLRest } from "./hl/rest.js";
import { HLTradeStream } from "./hl/ws.js";
import { Universe } from "./universe.js";
import { Pipeline } from "./pipeline.js";
import { Publisher } from "./publisher.js";
import {
  WindowAggregator, detectClusters, smartMoneyScore, coinSentiment, buildInsight,
  WINDOW_MS, type CoinCtx, type WhaleEvent, type WindowKey, type Direction, type PositionChange,
} from "@whale/core";

interface AggEv {
  coin: string; direction: Direction; usd: number; taker: string; ts: number; change: PositionChange;
}

async function main() {
  const cfg = loadConfig();
  const redis = new Redis(cfg.redisUrl);
  const rest = new HLRest(cfg.hlRestUrl);
  const universe = new Universe(rest, redis);
  const agg = new WindowAggregator();
  const pub = new Publisher(redis);
  const ctxMap = new Map<string, CoinCtx>();
  // Rolling per-coin open-interest baseline for OI-change %.
  const oiBaseline = new Map<string, number>();

  const refreshCtx = async () => {
    for (const c of await rest.metaAndAssetCtxs()) {
      if (!oiBaseline.has(c.coin)) oiBaseline.set(c.coin, c.openInterest);
      ctxMap.set(c.coin, c);
    }
  };

  const ctxs = await universe.bootstrap();
  ctxs.forEach((c) => {
    ctxMap.set(c.coin, c);
    oiBaseline.set(c.coin, c.openInterest);
  });

  const seeder = async (wallet: string, coin: string): Promise<number> => {
    try {
      const s = await rest.clearinghouseState(wallet);
      return s.positions.find((p) => p.coin === coin)?.szi ?? 0;
    } catch {
      return 0;
    }
  };

  const enrich = async (ev: WhaleEvent): Promise<void> => {
    const s = await rest.clearinghouseState(ev.taker);
    const pos = s.positions.find((p) => p.coin === ev.coin);
    if (pos) {
      ev.leverage = pos.leverage;
      ev.liqPx = pos.liqPx ?? undefined;
      ev.entryPx = pos.entryPx;
      ev.uPnl = pos.uPnl;
    }
  };

  const pipeline = new Pipeline({ redis, whaleFloorUsd: cfg.whaleFloorUsd, agg, ctx: ctxMap, seeder, enrich });
  const events: AggEv[] = [];

  const stream = new HLTradeStream(cfg.hlWsUrl, cfg.coinsPerConn);
  stream.on("trade", (t) => {
    void pipeline.handleTrade(t).then((ev) => {
      if (!ev) return;
      void pub.event(ev);
      events.push({ coin: ev.coin, direction: ev.direction, usd: ev.usd, taker: ev.taker, ts: ev.ts, change: ev.change });
    });
  });
  stream.start(ctxs.map((c) => c.coin));

  const oiChangePct = (coin: string, current: number): number => {
    const base = oiBaseline.get(coin);
    if (!base || base === 0) return 0;
    return ((current - base) / base) * 100;
  };

  // Snapshot builder — default 15m window, every 10s.
  const buildSnapshot = () => {
    const now = Date.now();
    agg.prune(now);
    // keep the cluster event log within the largest window
    const cutoff7d = now - WINDOW_MS["7d"];
    while (events.length && events[0]!.ts < cutoff7d) events.shift();

    const key: WindowKey = "15m";
    const rows = agg.snapshot(now, key);
    const clusters = detectClusters(events, { windowMs: WINDOW_MS[key], now, minWallets: 5, minTotalUsd: 1_000_000 });
    const clusterStrengthByCoin = new Map<string, number>();
    for (const c of clusters) {
      const cur = clusterStrengthByCoin.get(c.coin) ?? 0;
      if (c.strength > cur) clusterStrengthByCoin.set(c.coin, c.strength);
    }

    const coins = [...rows.entries()].map(([coin, r]) => {
      const ctx = ctxMap.get(coin);
      const oiPct = ctx ? oiChangePct(coin, ctx.openInterest) : 0;
      const sentiment = coinSentiment(r);
      const { score, label } = smartMoneyScore({
        netUsd: r.netUsd,
        grossUsd: r.longUsd + r.shortUsd,
        oiChangePct: oiPct,
        funding: ctx?.funding ?? 0,
        newWallets: r.newWallets,
        clusterStrength: clusterStrengthByCoin.get(coin) ?? 0,
      });
      const insight = buildInsight(coin, {
        longUsd: r.longUsd, shortUsd: r.shortUsd, oiChangePct: oiPct,
        funding: ctx?.funding ?? 0, newWallets: r.newWallets, windowLabel: "15 minutes",
      });
      return {
        coin, ...r,
        oiChangePct: oiPct,
        mark: ctx?.markPx ?? 0,
        funding: ctx?.funding ?? 0,
        oi: ctx?.openInterest ?? 0,
        vol: ctx?.dayNtlVlm ?? 0,
        sentiment, score, label, insight,
      };
    });
    coins.sort((a, b) => (b.longUsd + b.shortUsd) - (a.longUsd + a.shortUsd));
    void pub.snapshot({ ts: now, window: key, coins, clusters });
  };

  setInterval(buildSnapshot, 10_000);
  setInterval(() => void refreshCtx(), 10_000);
  setInterval(async () => {
    const added = await universe.detectNew();
    if (added.length) {
      stream.start(added);
      console.log("new coins listed:", added.join(", "));
    }
  }, 60_000);

  console.log(`worker running: subscribed to ${ctxs.length} markets`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
