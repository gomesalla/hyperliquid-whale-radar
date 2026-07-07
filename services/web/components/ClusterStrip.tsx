"use client";
import { useStore } from "@/lib/store";
import { fmtCompact } from "@/lib/format";

export function ClusterStrip() {
  const snapshot = useStore((s) => s.snapshot);
  const clusters = snapshot?.clusters ?? [];
  if (clusters.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {clusters.map((c, i) => (
        <div
          key={`${c.coin}-${c.direction}-${i}`}
          className={`glass px-3 py-2 shrink-0 border-l-4 ${c.direction === "long" ? "border-l-long" : "border-l-short"}`}
        >
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold">{c.coin}</span>
            <span className={c.direction === "long" ? "text-long" : "text-short"}>{c.direction.toUpperCase()}</span>
            <span className="text-zinc-300">{fmtCompact(c.totalUsd)}</span>
          </div>
          <div className="text-[11px] text-zinc-400">
            🎯 Cluster · {c.walletCount} wallets · {c.strength}% · {c.confidence}
          </div>
        </div>
      ))}
    </div>
  );
}
