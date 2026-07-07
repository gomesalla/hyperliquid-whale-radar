import type Redis from "ioredis";
import { Ledger } from "./ledger.js";
import {
  classify, usd, parseNum, WindowAggregator,
  type RawTrade, type WhaleEvent, type CoinCtx,
} from "@whale/core";

interface Deps {
  redis: Redis;
  whaleFloorUsd: number;
  agg: WindowAggregator;
  ctx?: Map<string, CoinCtx>;
  seeder?: (w: string, c: string) => Promise<number>;
  enrich?: (ev: WhaleEvent) => Promise<void>;
}

export class Pipeline {
  private ledger: Ledger;
  constructor(private d: Deps) {
    this.ledger = new Ledger(d.redis, d.seeder);
  }

  async handleTrade(t: RawTrade): Promise<WhaleEvent | null> {
    const px = parseNum(t.px);
    const sz = parseNum(t.sz);
    const notional = usd(px, sz);
    if (notional < this.d.whaleFloorUsd) return null;

    const taker = t.users[1];
    const delta = t.side === "B" ? sz : -sz;
    const { prevNet, seeded } = await this.ledger.apply(taker, t.coin, delta);
    const { change, direction } = classify(prevNet, delta);

    const ev: WhaleEvent = {
      id: String(t.tid),
      ts: t.time,
      coin: t.coin,
      taker,
      maker: t.users[0],
      side: t.side,
      direction,
      usd: notional,
      sz,
      px,
      change,
      estimated: seeded, // baseline guessed => flagged "est." downstream
    };

    if (this.d.enrich) {
      try {
        await this.d.enrich(ev);
      } catch {
        /* best-effort enrichment; never blocks the event */
      }
    }
    this.d.agg.add({ ts: ev.ts, coin: ev.coin, direction: ev.direction, usd: ev.usd, taker });
    return ev;
  }
}
