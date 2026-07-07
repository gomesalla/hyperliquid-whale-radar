"use client";
import { useStore } from "@/lib/store";
import { fmtCompact } from "@/lib/format";
import type { CoinRow } from "@/lib/types";

// Maps net USD flow to a green(long)/red(short) intensity background.
function cellColor(netUsd: number, maxAbs: number): string {
  if (maxAbs <= 0) return "rgba(255,255,255,0.03)";
  const t = Math.min(1, Math.abs(netUsd) / maxAbs);
  if (netUsd >= 0) return `rgba(22,199,132,${0.12 + t * 0.6})`;
  return `rgba(234,57,67,${0.12 + t * 0.6})`;
}

export function Heatmap() {
  const snapshot = useStore((s) => s.snapshot);
  const coins: CoinRow[] = (snapshot?.coins ?? []).slice(0, 40);
  const maxAbs = coins.reduce((m, c) => Math.max(m, Math.abs(c.netUsd)), 0);

  return (
    <div className="glass p-3">
      <h2 className="text-sm font-semibold text-zinc-200 mb-2">Whale Flow Heatmap <span className="text-xs text-zinc-500">(net long/short, current window)</span></h2>
      {coins.length === 0 ? (
        <div className="text-zinc-500 text-sm p-6 text-center">Awaiting first snapshot…</div>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-1.5">
          {coins.map((c) => (
            <div
              key={c.coin}
              className="rounded-lg px-2 py-2 text-center"
              style={{ background: cellColor(c.netUsd, maxAbs) }}
              title={`${c.coin}: net ${fmtCompact(c.netUsd)} | long ${fmtCompact(c.longUsd)} | short ${fmtCompact(c.shortUsd)}`}
            >
              <div className="text-xs font-semibold">{c.coin}</div>
              <div className="text-[10px] text-white/80">{fmtCompact(c.netUsd)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
