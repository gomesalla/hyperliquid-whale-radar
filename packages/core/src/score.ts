export type ScoreLabel = "STRONG_BUY" | "BULLISH" | "NEUTRAL" | "BEARISH" | "HEAVY_SHORTING";

export interface ScoreInputs {
  netUsd: number;
  grossUsd: number;
  oiChangePct: number;
  funding: number;
  newWallets: number;
  clusterStrength: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Weights (sum of magnitudes = 1). Documented in README §Smart-Money Score.
const W = { flow: 0.45, oi: 0.20, cluster: 0.20, wallets: 0.10, funding: 0.05 };

export function smartMoneyScore(i: ScoreInputs): { score: number; label: ScoreLabel } {
  const flow = i.grossUsd > 0 ? clamp(i.netUsd / i.grossUsd, -1, 1) : 0;            // [-1,1]
  const oi = clamp(i.oiChangePct / 20, -1, 1);                                      // ±20% saturates
  const cluster = clamp(i.clusterStrength / 100, 0, 1) * Math.sign(flow || 1);      // follows flow dir
  const wallets = clamp(i.newWallets / 20, 0, 1) * Math.sign(flow || 1);            // 20 wallets saturates
  const funding = clamp(-i.funding / 0.0005, -1, 1);                                // high +funding = crowded long => slight bearish
  const signal =
    W.flow * flow + W.oi * oi + W.cluster * cluster + W.wallets * wallets + W.funding * funding; // [-1,1]
  const score = Math.round(clamp(50 + signal * 50, 0, 100));
  const label: ScoreLabel =
    score >= 80 ? "STRONG_BUY" : score >= 60 ? "BULLISH" :
    score > 40 ? "NEUTRAL" : score > 20 ? "BEARISH" : "HEAVY_SHORTING";
  return { score, label };
}
