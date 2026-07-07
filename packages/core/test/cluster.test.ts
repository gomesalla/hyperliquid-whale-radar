import { describe, it, expect } from "vitest";
import { detectClusters } from "../src/cluster.js";

const mk = (coin: string, dir: "long" | "short", usd: number, taker: string, ts: number) =>
  ({ coin, direction: dir, usd, taker, ts, change: "NEW" as const });

describe("detectClusters", () => {
  it("flags a same-direction cluster over thresholds", () => {
    const now = 1_000_000;
    const evs = [
      mk("SUI", "long", 3_000_000, "0x1", now - 1000),
      mk("SUI", "long", 3_000_000, "0x2", now - 2000),
      mk("SUI", "long", 3_000_000, "0x3", now - 3000),
    ];
    const c = detectClusters(evs, { windowMs: 600_000, now, minWallets: 3, minTotalUsd: 5_000_000 });
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ coin: "SUI", direction: "long", walletCount: 3 });
    expect(c[0]!.totalUsd).toBe(9_000_000);
    expect(c[0]!.confidence).toBe("High");
  });
  it("ignores when wallets below minimum", () => {
    const now = 1_000_000;
    const evs = [mk("SUI", "long", 9_000_000, "0x1", now - 1000)];
    expect(detectClusters(evs, { windowMs: 600_000, now, minWallets: 3, minTotalUsd: 1 })).toHaveLength(0);
  });
});
