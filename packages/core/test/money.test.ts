import { describe, it, expect } from "vitest";
import { parseNum, usd, roundCents } from "../src/money.js";

describe("money", () => {
  it("parses numeric strings", () => {
    expect(parseNum("63599.0")).toBe(63599);
    expect(parseNum("0.00017")).toBeCloseTo(0.00017, 8);
  });
  it("computes USD rounded to cents", () => {
    expect(usd(63599, 0.3)).toBe(19079.7);
    expect(usd(1.595, 1000)).toBe(1595);
  });
  it("roundCents avoids float drift", () => {
    expect(roundCents(0.1 + 0.2)).toBe(0.3);
  });
});
