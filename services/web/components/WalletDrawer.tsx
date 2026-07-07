"use client";
import { useQuery } from "@tanstack/react-query";
import { fetchWallet } from "@/lib/api";
import { fmtCompact, shortAddr, changeLabel } from "@/lib/format";

export function WalletDrawer({ addr, onClose }: { addr: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ["wallet", addr], queryFn: () => fetchWallet(addr) });

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative glass w-full max-w-md h-full overflow-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Wallet Profile</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-xl leading-none">×</button>
        </div>

        <a
          href={`https://hypurrscan.io/address/${addr}`}
          target="_blank"
          rel="noreferrer"
          className="text-sky-300 text-sm hover:underline break-all"
        >
          {addr}
        </a>

        {isLoading ? (
          <div className="text-zinc-500 text-sm mt-4">Loading…</div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mt-4 text-center">
              <Stat label="Trades" value={String(data?.totalTrades ?? 0)} />
              <Stat label="Volume" value={fmtCompact(data?.totalVolume ?? 0)} />
              <Stat label="Open" value={String(data?.openPositions?.length ?? 0)} />
            </div>

            <h3 className="text-xs uppercase tracking-wider text-zinc-400 mt-5 mb-1">Open Positions</h3>
            <div className="space-y-1">
              {(data?.openPositions ?? []).map((p) => (
                <div key={p.coin} className="flex justify-between text-sm bg-white/5 rounded px-2 py-1">
                  <span>{p.coin}</span>
                  <span className={p.netSize >= 0 ? "text-long" : "text-short"}>{p.netSize >= 0 ? "LONG" : "SHORT"} {Math.abs(p.netSize)}</span>
                </div>
              ))}
              {(data?.openPositions?.length ?? 0) === 0 && <div className="text-zinc-500 text-sm">None tracked yet.</div>}
            </div>

            <h3 className="text-xs uppercase tracking-wider text-zinc-400 mt-5 mb-1">Recent Whale Trades</h3>
            <div className="space-y-1">
              {(data?.recent ?? []).slice(0, 20).map((e) => (
                <div key={e.id} className="flex justify-between text-sm bg-white/5 rounded px-2 py-1">
                  <span>{e.coin} · <span className={e.direction === "long" ? "text-long" : "text-short"}>{changeLabel(e.change)}</span></span>
                  <span>{fmtCompact(e.usd)}</span>
                </div>
              ))}
              {(data?.recent?.length ?? 0) === 0 && <div className="text-zinc-500 text-sm">No recorded trades yet.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/5 rounded px-2 py-2">
      <div className="text-[10px] text-zinc-400">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
