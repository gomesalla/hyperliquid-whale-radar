import { describe, it, expect } from "vitest";
import { classify } from "../src/classification.js";

describe("classify", () => {
  it("flat -> buy = NEW long", () => {
    expect(classify(0, 5)).toMatchObject({ change: "NEW", direction: "long", newNet: 5 });
  });
  it("flat -> sell = NEW short", () => {
    expect(classify(0, -5)).toMatchObject({ change: "NEW", direction: "short", newNet: -5 });
  });
  it("long + buy = INCREASE", () => {
    expect(classify(5, 3).change).toBe("INCREASE");
  });
  it("long + partial sell = REDUCE", () => {
    expect(classify(5, -2).change).toBe("REDUCE");
  });
  it("long + full sell to zero = CLOSE", () => {
    expect(classify(5, -5).change).toBe("CLOSE");
  });
  it("long + oversell = FLIP_L2S", () => {
    expect(classify(5, -8)).toMatchObject({ change: "FLIP_L2S", direction: "short", newNet: -3 });
  });
  it("short + oversell-back = FLIP_S2L", () => {
    expect(classify(-5, 8)).toMatchObject({ change: "FLIP_S2L", direction: "long", newNet: 3 });
  });
  it("short + more sell = INCREASE", () => {
    expect(classify(-5, -2).change).toBe("INCREASE");
  });
});
