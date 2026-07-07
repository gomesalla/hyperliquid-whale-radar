import { describe, it, expect, vi } from "vitest";
import RedisMock from "ioredis-mock";
import { Ledger } from "../src/ledger.js";

describe("Ledger", () => {
  it("seeds baseline once, then accumulates deltas", async () => {
    const redis = new RedisMock();
    const seeder = vi.fn().mockResolvedValue(10); // wallet already had +10 on chain
    const l = new Ledger(redis as any, seeder);
    const r1 = await l.apply("0xA", "BTC", 5);
    expect(r1).toMatchObject({ prevNet: 10, newNet: 15, seeded: true });
    const r2 = await l.apply("0xA", "BTC", -3);
    expect(r2).toMatchObject({ prevNet: 15, newNet: 12, seeded: false });
    expect(seeder).toHaveBeenCalledTimes(1);
  });
  it("works without seeder (baseline 0)", async () => {
    const redis = new RedisMock();
    const l = new Ledger(redis as any);
    const r = await l.apply("0xB", "SOL", 7);
    expect(r).toMatchObject({ prevNet: 0, newNet: 7, seeded: true });
  });
});
