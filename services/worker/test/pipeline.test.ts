import { describe, it, expect } from "vitest";
import RedisMock from "ioredis-mock";
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
