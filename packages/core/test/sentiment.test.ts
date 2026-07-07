import { describe, it, expect } from "vitest";
import { coinSentiment } from "../src/sentiment.js";

describe("coinSentiment", () => {
  it("computes bullish/bearish split", () => {
    const s = coinSentiment({ longUsd: 75, shortUsd: 25 });
    expect(s.bullishPct).toBe(75);
    expect(s.bearishPct).toBe(25);
    expect(s.netLongPct).toBe(50);
  });
  it("neutral when no flow", () => {
    expect(coinSentiment({ longUsd: 0, shortUsd: 0 })).toMatchObject({ bullishPct: 50, bearishPct: 50 });
  });
});
