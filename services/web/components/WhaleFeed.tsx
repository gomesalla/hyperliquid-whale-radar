"use client";
import { useStore } from "@/lib/store";
import { fmtCompact, shortAddr, changeColor, changeLabel } from "@/lib/format";
import type { WhaleEvent } from "@/lib/types";

const HEADERS = ["Time", "Coin", "Dir", "Size", "Contracts", "Entry", "Lev", "Status", "Liq Price", "PnL", "Wallet"];

export function WhaleFeed({ onWallet }: { onWallet: (a: string) => void }) {
  const { feed, threshold, filters } = useStore();
  const search = (filters.search ?? "").toLowerCase();

  const rows: WhaleEvent[] = feed.filter((e) =>
    e.usd >= threshold &&
    (!filters.coin || e.coin === filters.coin) &&
    (!filters.direction || e.direction === filters.direction) &&
    (!filters.change || e.change === filters.change) &&
    (!search || e.coin.toLowerCase().includes(search) || e.taker.toLowerCase().includes(search)),
  );

  return (
    <div className="glass p-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-zinc-200">🐋 Live Whale Feed</h2>
        <span className="text-xs text-zinc-500">{rows.length} shown</span>
      </div>
      <div className="overflow-auto max-h-[68vh]">
        <table className="w-full text-sm">
          <thead className="text-zinc-400 text-[11px] sticky top-0 bg-ink/80 backdrop-blur">
            <tr>
              {HEADERS.map((h) => (
                <th key={h} className="text-left px-2 py-1 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const newLong = e.change === "NEW" && e.direction === "long";
              const newShort = e.change === "NEW" && e.direction === "short";
              return (
                <tr
                  key={e.id}
                  className={`border-t border-white/5 ${newLong ? "bg-long/10" : newShort ? "bg-short/10" : ""}`}
                >
                  <td className="px-2 py-1 text-zinc-400 whitespace-nowrap">{new Date(e.ts).toLocaleTimeString()}</td>
                  <td className="px-2 py-1 font-semibold">{e.coin}</td>
                  <td className={`px-2 py-1 font-medium ${e.direction === "long" ? "text-long" : "text-short"}`}>
                    {e.direction.toUpperCase()}
                  </td>
                  <td className="px-2 py-1">{fmtCompact(e.usd)}</td>
                  <td className="px-2 py-1 text-zinc-300">{e.sz}</td>
                  <td className="px-2 py-1 text-zinc-300">{e.px}</td>
                  <td className="px-2 py-1 text-zinc-300">{e.leverage ? `${e.leverage}x` : "—"}</td>
                  <td className={`px-2 py-1 ${changeColor(e.change)} whitespace-nowrap`}>
                    {changeLabel(e.change)}{e.estimated ? " ·est" : ""}
                  </td>
                  <td className="px-2 py-1 text-zinc-300">{e.liqPx != null ? e.liqPx : "—"}</td>
                  <td className={`px-2 py-1 ${(e.uPnl ?? 0) >= 0 ? "text-long" : "text-short"}`}>
                    {e.uPnl != null ? fmtCompact(e.uPnl) : "—"}
                  </td>
                  <td
                    className="px-2 py-1 text-sky-300 cursor-pointer hover:underline"
                    onClick={() => onWallet(e.taker)}
                  >
                    {shortAddr(e.taker)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="text-zinc-500 text-sm p-8 text-center">
            No whale trades in this window at the current threshold.<br />
            <span className="text-zinc-600 text-xs">This reflects the live tape — not an error. Lower the threshold or wait for flow.</span>
          </div>
        )}
      </div>
    </div>
  );
}
