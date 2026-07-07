import type { FastifyInstance } from "fastify";
import { prisma } from "@whale/db";

export function walletRoutes(app: FastifyInstance): void {
  app.get("/api/wallet/:addr", async (req) => {
    const addr = (req.params as { addr: string }).addr;
    const [recent, openPositions] = await Promise.all([
      prisma.whaleEvent.findMany({ where: { taker: addr }, orderBy: { ts: "desc" }, take: 50 }),
      prisma.positionLedger.findMany({ where: { wallet: addr } }),
    ]);
    const totalVolume = recent.reduce((a, e) => a + e.usd, 0);
    return {
      address: addr,
      firstSeen: recent.length ? recent[recent.length - 1]!.ts : null,
      totalTrades: recent.length,
      totalVolume,
      openPositions,
      recent,
    };
  });
}
