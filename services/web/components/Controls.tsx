"use client";
import { useStore } from "@/lib/store";
import { fmtCompact } from "@/lib/format";

const WINDOWS = ["5m", "15m", "30m", "1h", "4h", "12h", "24h", "7d"];
const THRESHOLDS = [25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_000_000, 5_000_000];

export function Controls({ coins }: { coins: string[] }) {
  const { window, threshold, filters, setWindow, setThreshold, setFilters } = useStore();

  return (
    <div className="glass p-3 flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-1">
        <span className="text-[10px] uppercase tracking-wider text-zinc-400 mr-1">Window</span>
        {WINDOWS.map((w) => (
          <button
            key={w}
            onClick={() => setWindow(w)}
            className={`px-2 py-1 rounded text-xs ${window === w ? "bg-sky-500/30 text-sky-200" : "text-zinc-400 hover:text-zinc-200"}`}
          >
            {w}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-zinc-400 mr-1">Whale ≥</span>
        {THRESHOLDS.map((t) => (
          <button
            key={t}
            onClick={() => setThreshold(t)}
            className={`px-2 py-1 rounded text-xs ${threshold === t ? "bg-emerald-500/25 text-emerald-200" : "text-zinc-400 hover:text-zinc-200"}`}
          >
            {fmtCompact(t)}
          </button>
        ))}
        <input
          type="number"
          placeholder="custom"
          className="w-24 bg-white/5 rounded px-2 py-1 text-xs outline-none"
          onChange={(e) => e.target.value && setThreshold(Number(e.target.value))}
        />
      </div>

      <div className="flex items-center gap-2">
        <select
          className="bg-white/5 rounded px-2 py-1 text-xs outline-none"
          value={filters.direction ?? ""}
          onChange={(e) => setFilters({ ...filters, direction: (e.target.value || undefined) as "long" | "short" | undefined })}
        >
          <option value="">All sides</option>
          <option value="long">Long only</option>
          <option value="short">Short only</option>
        </select>
        <select
          className="bg-white/5 rounded px-2 py-1 text-xs outline-none"
          value={filters.change ?? ""}
          onChange={(e) => setFilters({ ...filters, change: e.target.value || undefined })}
        >
          <option value="">All types</option>
          <option value="NEW">New only</option>
          <option value="INCREASE">Increase only</option>
          <option value="REDUCE">Reduce only</option>
          <option value="CLOSE">Close only</option>
        </select>
        <select
          className="bg-white/5 rounded px-2 py-1 text-xs outline-none max-w-[120px]"
          value={filters.coin ?? ""}
          onChange={(e) => setFilters({ ...filters, coin: e.target.value || undefined })}
        >
          <option value="">All coins</option>
          {coins.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          id="whale-search"
          placeholder="Search wallet / coin…"
          className="bg-white/5 rounded px-2 py-1 text-xs outline-none w-44"
          value={filters.search ?? ""}
          onChange={(e) => setFilters({ ...filters, search: e.target.value || undefined })}
        />
      </div>
    </div>
  );
}
