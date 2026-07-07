"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Providers } from "@/components/Providers";
import { KpiBar } from "@/components/KpiBar";
import { Controls } from "@/components/Controls";
import { WhaleFeed } from "@/components/WhaleFeed";
import { Heatmap } from "@/components/Heatmap";
import { Leaderboard } from "@/components/Leaderboard";
import { SentimentPanel } from "@/components/SentimentPanel";
import { InsightsPanel } from "@/components/InsightsPanel";
import { ClusterStrip } from "@/components/ClusterStrip";
import { WalletDrawer } from "@/components/WalletDrawer";
import { ExportBar } from "@/components/ExportBar";
import { useStore } from "@/lib/store";
import { connectWS } from "@/lib/ws";
import { fetchSnapshot, fetchFeed, fetchKpis } from "@/lib/api";

function Dashboard() {
  const { setSnapshot, pushEvent, setFeed, snapshot } = useStore();
  const [wallet, setWallet] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const kpis = useQuery({ queryKey: ["kpis", snapshot?.ts], queryFn: fetchKpis, retry: false });

  useEffect(() => {
    fetchSnapshot().then(setSnapshot).catch(() => {});
    fetchFeed(200).then(setFeed).catch(() => {});
    const dispose = connectWS(
      (e) => { setLive(true); pushEvent(e); },
      (s) => { setLive(true); setSnapshot(s); },
    );
    return dispose;
  }, [setSnapshot, pushEvent, setFeed]);

  const coins = (snapshot?.coins ?? []).map((c) => c.coin);

  return (
    <main className="p-4 space-y-4 max-w-[1680px] mx-auto">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">🐋 Hyperliquid Whale Radar</h1>
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${live ? "bg-long/20 text-long" : "bg-white/10 text-zinc-400"}`}>
            {live ? "● LIVE" : "○ connecting"}
          </span>
        </div>
        <ExportBar />
      </header>

      <KpiBar k={kpis.data} />
      <Controls coins={coins} />
      <ClusterStrip />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-4">
          <WhaleFeed onWallet={setWallet} />
          <Heatmap />
        </div>
        <div className="space-y-4">
          <SentimentPanel />
          <Leaderboard />
          <InsightsPanel />
        </div>
      </div>

      <footer className="text-center text-[11px] text-zinc-600 py-4">
        Data sourced live from Hyperliquid. Positions flagged “·est” have an inferred baseline. Not financial advice.
      </footer>

      {wallet && <WalletDrawer addr={wallet} onClose={() => setWallet(null)} />}
    </main>
  );
}

export default function Page() {
  return (
    <Providers>
      <Dashboard />
    </Providers>
  );
}
