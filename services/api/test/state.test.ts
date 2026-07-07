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
    expect((feed[0] as any).id).toBe("2");
    expect(feed).toHaveLength(2);
  });
  it("kpis derive largest long/short from snapshot", async () => {
    const redis = new RedisMock();
    await redis.set("whale:snapshot", JSON.stringify({
      coins: [
        { coin: "SOL", longUsd: 40e6, shortUsd: 8e6, netUsd: 32e6, count: 5 },
        { coin: "BTC", longUsd: 5e6, shortUsd: 20e6, netUsd: -15e6, count: 3 },
      ],
      clusters: [],
    }));
    const s = new State(redis as any);
    const k = await s.kpis();
    expect(k.totalLongUsd).toBe(45e6);
    expect(k.largestLong.coin).toBe("SOL");
    expect(k.largestShort.coin).toBe("BTC");
  });
});
