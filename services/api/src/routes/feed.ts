import type { FastifyInstance } from "fastify";
import type { State } from "../state.js";

export function feedRoutes(app: FastifyInstance, state: State): void {
  app.get("/api/health", async () => ({ ok: true }));
  app.get("/api/feed", async (req) => {
    const limit = Number((req.query as { limit?: string }).limit ?? 100);
    return state.feed(Number.isFinite(limit) ? limit : 100);
  });
  app.get("/api/snapshot", async () => state.snapshot());
  app.get("/api/kpis", async () => state.kpis());
  app.get("/api/leaderboard", async (req) =>
    state.leaderboard(String((req.query as { metric?: string }).metric ?? "longVol")));
}
