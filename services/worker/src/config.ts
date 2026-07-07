import { z } from "zod";

const Schema = z.object({
  REDIS_URL: z.string().default("redis://localhost:6379"),
  DATABASE_URL: z.string().default("postgresql://whale:whale@localhost:5432/whale"),
  HL_REST_URL: z.string().default("https://api.hyperliquid.xyz/info"),
  HL_WS_URL: z.string().default("wss://api.hyperliquid.xyz/ws"),
  WHALE_FLOOR_USD: z.coerce.number().default(25_000),
  COINS_PER_CONN: z.coerce.number().default(50),
});

export interface Config {
  redisUrl: string;
  databaseUrl: string;
  hlRestUrl: string;
  hlWsUrl: string;
  whaleFloorUsd: number;
  coinsPerConn: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const e = Schema.parse(env);
  return {
    redisUrl: e.REDIS_URL,
    databaseUrl: e.DATABASE_URL,
    hlRestUrl: e.HL_REST_URL,
    hlWsUrl: e.HL_WS_URL,
    whaleFloorUsd: e.WHALE_FLOOR_USD,
    coinsPerConn: e.COINS_PER_CONN,
  };
}
