"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { fmtCompact } from "@/lib/format";
import type { CoinRow } from "@/lib/types";

const METRICS: { key: string; label: string; get: (c: CoinRow) => number; fmt: (n: number) => string }[] = [
  { key: "longVol", label: "Long Vol", get: (c) => c.longUsd, fmt: fmtCompact },
  { key: "shortVol", label: "Short Vol", get: (c) => c.shortUsd, fmt: fmtCompact },
  { key: "netLong", label: "Net Long", get: (c) => c.netUsd, fmt: fmtCompact },
  { key: "newWallets", label: "New Wallets", get: (c) => c.newWallets, fmt: (n) => String(n) },
  { key: "oiGrowth", label: "OI Growth", get: (c) => c.oiChangePct, fmt: (n) => `${n.toFixed(1)}%` },
];

export function Leaderboard() {
  const snapshot = useStore((s) => s.snapshot);
  const [metric, setMetric] = useState(METRICS[0]!);
  const rows = [...(snapshot?.coins ?? [])].sort((a, b) => metric.get(b) - metric.get(a)).slice(0, 12);

  return (
    <div className="glass p-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-zinc-200">Leaderboard</h2>
      </div>
      <div className="flex flex-wrap gap-1 mb-2">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m)}
            className={`px-2 py-0.5 rounded text-[11px] ${metric.key === m.key ? "bg-sky-500/30 text-sky-200" : "text-zinc-400 hover:text-zinc-200"}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <ol className="space-y-1">
        {rows.map((c, i) => (
          <li key={c.coin} className="flex items-center justify-between text-sm px-2 py-1 rounded hover:bg-white/5">
            <span className="flex items-center gap-2">
              <span className="text-zinc-500 w-4 text-right">{i + 1}</span>
              <span className="font-medium">{c.coin}</span>
            </span>
            <span className={metric.get(c) >= 0 ? "text-long" : "text-short"}>{metric.fmt(metric.get(c))}</span>
          </li>
        ))}
        {rows.length === 0 && <li className="text-zinc-500 text-sm p-2">No data yet.</li>}
      </ol>
    </div>
  );
}
