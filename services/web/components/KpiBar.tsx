"use client";
import { fmtCompact } from "@/lib/format";
import type { Kpis } from "@/lib/types";

function Cell({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="glass px-4 py-3 min-w-[140px] shrink-0">
      <div className="text-[10px] uppercase tracking-wider text-zinc-400">{label}</div>
      <div className={`text-lg font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

export function KpiBar({ k }: { k?: Kpis }) {
  if (!k) {
    return <div className="glass px-4 py-6 text-sm text-zinc-500">Loading market snapshot…</div>;
  }
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      <Cell label="Whale Longs" value={fmtCompact(k.totalLongUsd)} tone="text-long" />
      <Cell label="Whale Shorts" value={fmtCompact(k.totalShortUsd)} tone="text-short" />
      <Cell label="L/S Ratio" value={(k.longShortRatio ?? 0).toFixed(2)} />
      <Cell label="Largest Long" value={`${k.largestLong?.coin ?? "-"} ${fmtCompact(k.largestLong?.longUsd ?? 0)}`} tone="text-long" />
      <Cell label="Largest Short" value={`${k.largestShort?.coin ?? "-"} ${fmtCompact(k.largestShort?.shortUsd ?? 0)}`} tone="text-short" />
      <Cell label="Most Active" value={k.mostActive ?? "-"} />
      <Cell label="Most Bullish" value={k.mostBullish ?? "-"} tone="text-long" />
      <Cell label="Most Bearish" value={k.mostBearish ?? "-"} tone="text-short" />
      <Cell label="Top OI ↑" value={k.highestOiIncrease ?? "-"} />
      <Cell label="Top Volume" value={k.highestVolume ?? "-"} />
    </div>
  );
}
