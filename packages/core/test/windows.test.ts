import { describe, it, expect } from "vitest";
import { WindowAggregator } from "../src/windows.js";

describe("WindowAggregator", () => {
  it("aggregates longs/shorts within window and excludes older events", () => {
    const a = new WindowAggregator();
    const now = 1_000_000_000_000;
    a.add({ ts: now - 60_000, coin: "SOL", direction: "long", usd: 1000, taker: "0xA" });
    a.add({ ts: now - 60_000, coin: "SOL", direction: "short", usd: 400, taker: "0xB" });
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
