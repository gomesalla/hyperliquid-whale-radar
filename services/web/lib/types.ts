export type PositionChange = "NEW" | "INCREASE" | "REDUCE" | "CLOSE" | "FLIP_L2S" | "FLIP_S2L";

export interface WhaleEvent {
  id: string;
  ts: number;
  coin: string;
  taker: string;
  maker: string;
  side: "B" | "A";
  direction: "long" | "short";
  usd: number;
  sz: number;
  px: number;
  change: PositionChange;
  estimated: boolean;
  leverage?: number;
  liqPx?: number;
  entryPx?: number;
  uPnl?: number;
}

export interface CoinRow {
  coin: string;
  longUsd: number;
  shortUsd: number;
  netUsd: number;
  count: number;
  newWallets: number;
  oiChangePct: number;
  mark: number;
  funding: number;
  oi: number;
  vol: number;
  sentiment: { bullishPct: number; bearishPct: number; netLongPct: number };
  score: number;
  label: string;
  insight: string;
}

export interface Cluster {
  coin: string;
  direction: "long" | "short";
  walletCount: number;
  totalUsd: number;
  strength: number;
  confidence: string;
}

export interface Snapshot {
  ts: number;
  window: string;
  coins: CoinRow[];
  clusters: Cluster[];
}

export interface Kpis {
  totalLongUsd: number;
  totalShortUsd: number;
  longShortRatio: number;
  largestLong: { coin: string; longUsd: number };
  largestShort: { coin: string; shortUsd: number };
  mostActive: string;
  mostBullish: string;
  mostBearish: string;
  highestOiIncrease: string;
  highestVolume: string;
}
