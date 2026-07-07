import { describe, it, expect } from "vitest";
import { smartMoneyScore } from "../src/score.js";

describe("smartMoneyScore", () => {
  it("strong net long + OI up + cluster => bullish/strong", () => {
    const r = smartMoneyScore({ netUsd: 40e6, grossUsd: 48e6, oiChangePct: 12, funding: 0.00001, newWallets: 17, clusterStrength: 90 });
    expect(r.score).toBeGreaterThan(70);
    expect(["STRONG_BUY", "BULLISH"]).toContain(r.label);
  });
  it("net short + OI up => bearish", () => {
    const r = smartMoneyScore({ netUsd: -40e6, grossUsd: 48e6, oiChangePct: 10, funding: -0.0001, newWallets: 12, clusterStrength: 70 });
    expect(r.score).toBeLessThan(35);
    expect(["BEARISH", "HEAVY_SHORTING"]).toContain(r.label);
  });
  it("flat => neutral ~50", () => {
    const r = smartMoneyScore({ netUsd: 0, grossUsd: 0, oiChangePct: 0, funding: 0, newWallets: 0, clusterStrength: 0 });
    expect(r.score).toBeGreaterThanOrEqual(45);
    expect(r.score).toBeLessThanOrEqual(55);
    expect(r.label).toBe("NEUTRAL");
  });
});
