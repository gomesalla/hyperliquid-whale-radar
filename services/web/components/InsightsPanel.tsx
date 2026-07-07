"use client";
import { useStore } from "@/lib/store";
import type { CoinRow } from "@/lib/types";

export function InsightsPanel() {
  const snapshot = useStore((s) => s.snapshot);
  const coins: CoinRow[] = [...(snapshot?.coins ?? [])]
    .sort((a, b) => (b.longUsd + b.shortUsd) - (a.longUsd + a.shortUsd))
    .slice(0, 4);

  return (
    <div className="glass p-4">
      <h2 className="text-sm font-semibold text-zinc-200 mb-2">🧠 AI Insights <span className="text-xs text-zinc-500">(generated from live aggregates)</span></h2>
      {coins.length === 0 ? (
        <div className="text-zinc-500 text-sm">No activity to summarize yet.</div>
      ) : (
        <ul className="space-y-2">
          {coins.map((c) => (
            <li key={c.coin} className="text-sm text-zinc-300 leading-relaxed border-l-2 border-sky-500/40 pl-3">
              {c.insight}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
