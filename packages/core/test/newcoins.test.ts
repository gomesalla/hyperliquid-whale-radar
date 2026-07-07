import { describe, it, expect } from "vitest";
import { diffUniverse } from "../src/newcoins.js";

describe("diffUniverse", () => {
  it("returns newly added coins", () => {
    expect(diffUniverse(["BTC", "ETH"], ["BTC", "ETH", "HYPE"])).toEqual(["HYPE"]);
    expect(diffUniverse(["BTC"], ["BTC"])).toEqual([]);
  });
});
