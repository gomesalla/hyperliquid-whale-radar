import type Redis from "ioredis";
import { prisma } from "@whale/db";
import type { WhaleEvent } from "@whale/core";

/**
 * Fans whale events out to Redis (pub/sub + capped list for the feed) and
 * batches durable inserts into Postgres. Snapshots are stored + published.
 */
export class Publisher {
  private buf: WhaleEvent[] = [];

  constructor(private redis: Redis, flushMs = 2000) {
    setInterval(() => void this.flush(), flushMs);
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
      id: e.id,
      ts: new Date(e.ts),
      coin: e.coin,
      taker: e.taker,
      maker: e.maker,
      side: e.side,
      direction: e.direction,
      usd: e.usd,
      sz: e.sz,
      px: e.px,
      change: e.change,
      estimated: e.estimated,
      leverage: e.leverage ?? null,
      liqPx: e.liqPx ?? null,
      entryPx: e.entryPx ?? null,
      uPnl: e.uPnl ?? null,
    }));
    try {
      await prisma.whaleEvent.createMany({ data: rows, skipDuplicates: true });
    } catch (err) {
      console.error("pg flush failed", err);
    }
  }
}
