import { z } from "zod";

export type Side = "B" | "A";
export type Direction = "long" | "short";
export type PositionChange =
  | "NEW" | "INCREASE" | "REDUCE" | "CLOSE" | "FLIP_L2S" | "FLIP_S2L";

export const WINDOW_KEYS = ["5m", "15m", "30m", "1h", "4h", "12h", "24h", "7d"] as const;
export type WindowKey = typeof WINDOW_KEYS[number];
export const WINDOW_MS: Record<WindowKey, number> = {
  "5m": 300_000, "15m": 900_000, "30m": 1_800_000, "1h": 3_600_000,
  "4h": 14_400_000, "12h": 43_200_000, "24h": 86_400_000, "7d": 604_800_000,
};

export const RawTradeSchema = z.object({
  coin: z.string(),
  side: z.enum(["B", "A"]),
  px: z.string(),
  sz: z.string(),
  time: z.number(),
  hash: z.string(),
  tid: z.number(),
  users: z.tuple([z.string(), z.string()]),
});
export type RawTrade = z.infer<typeof RawTradeSchema>;

export interface CoinCtx {
  coin: string;
  markPx: number;
  funding: number;
  openInterest: number;
  dayNtlVlm: number;
  szDecimals: number;
}

export interface WhaleEvent {
  id: string;            // `${tid}`
  ts: number;            // ms epoch
  coin: string;
  taker: string;
  maker: string;
  side: Side;
  direction: Direction;  // taker intent: B->long, A->short
  usd: number;
  sz: number;
  px: number;            // entry (trade price)
  change: PositionChange;
  estimated: boolean;    // true when baseline was not seeded from chain
  leverage?: number;
  liqPx?: number;
  entryPx?: number;
  uPnl?: number;
}

export interface WindowAgg {
  coin: string;
  longUsd: number;
  shortUsd: number;
  netUsd: number;
  count: number;
  newWallets: number;
  oiChangePct: number;
  priceChangePct: number;
}
