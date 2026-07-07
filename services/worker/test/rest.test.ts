import { describe, it, expect, vi } from "vitest";
import { HLRest } from "../src/hl/rest.js";

describe("HLRest.metaAndAssetCtxs", () => {
  it("maps universe+ctxs into CoinCtx[]", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ([
        { universe: [{ name: "BTC", szDecimals: 5, maxLeverage: 50 }] },
        [{ markPx: "63547.0", funding: "0.0000125", openInterest: "38072.88", dayNtlVlm: "2701152802.3" }],
      ]),
    });
    const rest = new HLRest("http://x", fakeFetch as unknown as typeof fetch);
    const ctxs = await rest.metaAndAssetCtxs();
    expect(ctxs[0]).toMatchObject({ coin: "BTC", markPx: 63547, szDecimals: 5 });
    expect(ctxs[0]!.openInterest).toBeCloseTo(38072.88, 2);
  });
});
