export const fmtUsd = (n: number): string => `$${Math.round(n).toLocaleString("en-US")}`;

export const fmtCompact = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

export const fmtPct = (n: number): string => `${n.toFixed(1)}%`;

export const shortAddr = (a: string): string =>
  a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;

export const changeColor = (c: string): string =>
  c === "NEW"
    ? "text-long"
    : c === "INCREASE"
      ? "text-long/80"
      : c === "CLOSE"
        ? "text-zinc-400"
        : c.startsWith("FLIP")
          ? "text-amber-400"
          : "text-short/80";

export const changeLabel = (c: string): string =>
  c === "FLIP_L2S" ? "FLIP L→S" : c === "FLIP_S2L" ? "FLIP S→L" : c;

export const scoreLabelText = (label: string): string => {
  switch (label) {
    case "STRONG_BUY": return "🔥 Strong Buy";
    case "BULLISH": return "🟢 Bullish";
    case "NEUTRAL": return "🟡 Neutral";
    case "BEARISH": return "🔴 Bearish";
    case "HEAVY_SHORTING": return "⚠ Heavy Shorting";
    default: return label;
  }
};
