import { describe, it, expect } from "vitest";
import { buildInsight } from "../src/insights.js";

describe("buildInsight", () => {
  it("uses real numbers verbatim, no fabrication", () => {
    const s = buildInsight("SOL", { longUsd: 42_300_000, shortUsd: 8_100_000, oiChangePct: 12.4, funding: 0.0000125, newWallets: 17, windowLabel: "15 minutes" });
    expect(s).toContain("SOL");
    expect(s).toContain("$42.3M");
    expect(s).toContain("$8.1M");
    expect(s).toContain("12.4%");
    expect(s).toContain("17");
  });
});
