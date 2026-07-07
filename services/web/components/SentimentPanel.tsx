"use client";
import { useStore } from "@/lib/store";
import { scoreLabelText, fmtCompact } from "@/lib/format";
import type { CoinRow } from "@/lib/types";

function scoreColor(score: number): string {
  if (score >= 80) return "#16c784";
  if (score >= 60) return "#3ddc97";
  if (score > 40) return "#eab308";
  if (score > 20) return "#f97316";
  return "#ea3943";
}

export function SentimentPanel() {
  const snapshot = useStore((s) => s.snapshot);
  const coins = snapshot?.coins ?? [];
  const top: CoinRow | undefined = [...coins].sort((a, b) => (b.longUsd + b.shortUsd) - (a.longUsd + a.shortUsd))[0];

  if (!top) {
    return <div className="glass p-3 text-sm text-zinc-500">Awaiting market data…</div>;
  }

  return (
    <div className="glass p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-zinc-200">Market Sentiment · <span className="text-sky-300">{top.coin}</span></h2>
        <span className="text-xs text-zinc-500">most active</span>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold shrink-0"
          style={{ background: `conic-gradient(${scoreColor(top.score)} ${top.score * 3.6}deg, rgba(255,255,255,0.08) 0deg)` }}
        >
          <div className="w-16 h-16 rounded-full bg-ink/90 flex items-center justify-center">{top.score}</div>
        </div>
        <div>
          <div className="text-lg font-semibold">{scoreLabelText(top.label)}</div>
          <div className="text-xs text-zinc-400">Smart-Money Score (0–100)</div>
        </div>
      </div>

      <div className="space-y-2">
        <Bar label="Bullish" pct={top.sentiment.bullishPct} tone="bg-long" />
        <Bar label="Bearish" pct={top.sentiment.bearishPct} tone="bg-short" />
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
        <Stat label="Net Long %" value={`${top.sentiment.netLongPct}%`} />
        <Stat label="Funding" value={`${(top.funding * 100).toFixed(4)}%`} />
        <Stat label="OI Δ" value={`${top.oiChangePct.toFixed(1)}%`} />
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2 text-center">
        <Stat label="Long $" value={fmtCompact(top.longUsd)} />
        <Stat label="Short $" value={fmtCompact(top.shortUsd)} />
      </div>
    </div>
  );
}

function Bar({ label, pct, tone }: { label: string; pct: number; tone: string }) {
  return (
    <div>
      <div className="flex justify-between text-[11px] text-zinc-400 mb-0.5">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 rounded bg-white/5 overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/5 rounded px-2 py-1">
      <div className="text-[10px] text-zinc-400">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
