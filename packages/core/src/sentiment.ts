export function coinSentiment(a: { longUsd: number; shortUsd: number }):
  { bullishPct: number; bearishPct: number; netLongPct: number } {
  const gross = a.longUsd + a.shortUsd;
  if (gross <= 0) return { bullishPct: 50, bearishPct: 50, netLongPct: 0 };
  const bullishPct = Math.round((a.longUsd / gross) * 100);
  const bearishPct = 100 - bullishPct;
  const netLongPct = Math.round(((a.longUsd - a.shortUsd) / gross) * 100);
  return { bullishPct, bearishPct, netLongPct };
}
