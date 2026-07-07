import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import RedisMock from "ioredis-mock";
import { State } from "../src/state.js";
import { feedRoutes } from "../src/routes/feed.js";

async function buildApp() {
  const redis = new RedisMock();
  await redis.set("whale:snapshot", JSON.stringify({
    coins: [
      { coin: "SOL", longUsd: 40e6, shortUsd: 8e6, netUsd: 32e6, count: 5, newWallets: 4, oiChangePct: 3, vol: 9e8 },
      { coin: "BTC", longUsd: 5e6, shortUsd: 20e6, netUsd: -15e6, count: 3, newWallets: 2, oiChangePct: 1, vol: 2e9 },
    ],
    clusters: [],
  }));
  await redis.lpush("whale:feed", JSON.stringify({ id: "1", coin: "BTC", usd: 60000 }));
  const app = Fastify();
  feedRoutes(app, new State(redis as never));
  return app;
}

describe("api routes (fastify inject)", () => {
  it("GET /api/health", async () => {
    const app = await buildApp();
    const r = await app.inject({ method: "GET", url: "/api/health" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true });
  });
  it("GET /api/kpis returns derived totals", async () => {
    const app = await buildApp();
    const r = await app.inject({ method: "GET", url: "/api/kpis" });
    expect(r.statusCode).toBe(200);
    const k = r.json();
    expect(k.totalLongUsd).toBe(45e6);
    expect(k.largestLong.coin).toBe("SOL");
    expect(k.largestShort.coin).toBe("BTC");
  });
  it("GET /api/leaderboard?metric=shortVol ranks BTC first", async () => {
    const app = await buildApp();
    const r = await app.inject({ method: "GET", url: "/api/leaderboard?metric=shortVol" });
    expect(r.statusCode).toBe(200);
    expect(r.json()[0].coin).toBe("BTC");
  });
  it("GET /api/feed returns the capped list", async () => {
    const app = await buildApp();
    const r = await app.inject({ method: "GET", url: "/api/feed?limit=10" });
    expect(r.statusCode).toBe(200);
    expect(r.json()[0].coin).toBe("BTC");
  });
});
