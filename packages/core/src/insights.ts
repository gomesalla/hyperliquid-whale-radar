function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function buildInsight(coin: string, a: {
  longUsd: number;
  shortUsd: number;
  oiChangePct: number;
  funding: number;
  newWallets: number;
  windowLabel: string;
}): string {
  const lean = a.longUsd >= a.shortUsd ? "accumulation" : "distribution";
  const fundingWord = a.funding > 0.0002 ? "elevated positive" : a.funding < -0.0002 ? "negative" : "neutral";
  const oiWord = a.oiChangePct >= 0 ? "increased" : "decreased";
  return `Over the last ${a.windowLabel}, whales opened approximately ${compact(a.longUsd)} in new ${coin} long positions ` +
    `while ${compact(a.shortUsd)} in shorts were opened. Open interest ${oiWord} by ${Math.abs(a.oiChangePct).toFixed(1)}%, ` +
    `funding is ${fundingWord}, and ${a.newWallets} distinct wallets entered. This suggests ${lean}.`;
}
