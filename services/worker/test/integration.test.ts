import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import RedisMock from "ioredis-mock";
import { Pipeline } from "../src/pipeline.js";
import { WindowAggregator, RawTradeSchema } from "@whale/core";

const here = dirname(fileURLToPath(import.meta.url));

describe("integration: replay real fixture", () => {
  it("processes recorded trades and produces whale events with valid shape", async () => {
    // Resolve relative to this test file so it runs under any cwd (root or package runner).
    const path = resolve(here, "../../../fixtures/trades-sample.jsonl");
    if (!existsSync(path)) return; // fixture optional when captured without network
    const lines = readFileSync(path, "utf8").trim().split("\n").filter(Boolean);
    const agg = new WindowAggregator();
    const p = new Pipeline({ redis: new RedisMock() as any, whaleFloorUsd: 1, agg });
    let events = 0;
    for (const line of lines) {
      const parsed = RawTradeSchema.safeParse(JSON.parse(line));
      if (!parsed.success) continue;
      const ev = await p.handleTrade(parsed.data);
      if (ev) {
        events++;
        expect(["long", "short"]).toContain(ev.direction);
        expect(ev.usd).toBeGreaterThan(0);
      }
    }
    expect(events).toBeGreaterThan(0);
  });
});
