import type Redis from "ioredis";
import { prisma } from "@whale/db";
import { diffUniverse, type CoinCtx } from "@whale/core";
import type { HLRest } from "./hl/rest.js";

/**
 * Bootstraps the tradable universe and detects newly listed coins by
 * diffing the current coin list against the last-seen list in Redis.
 */
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
