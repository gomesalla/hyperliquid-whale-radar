"use client";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { exportCsv, exportJson } from "@/lib/export";

export function ExportBar() {
  const { feed, threshold } = useStore();
  const rows = feed.filter((e) => e.usd >= threshold);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "SELECT") return;
      const st = useStore.getState();
      if (ev.key === "f") { ev.preventDefault(); document.getElementById("whale-search")?.focus(); }
      else if (ev.key === "l") st.setFilters({ ...st.filters, direction: "long" });
      else if (ev.key === "s") st.setFilters({ ...st.filters, direction: "short" });
      else if (ev.key === "Escape") st.setFilters({});
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleTheme = () => {
    const root = document.documentElement;
    root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
  };

  return (
    <div className="flex gap-2">
      <button className="glass px-3 py-1 text-xs hover:bg-white/10" onClick={() => exportCsv(rows)}>Export CSV</button>
      <button className="glass px-3 py-1 text-xs hover:bg-white/10" onClick={() => exportJson(rows)}>Export JSON</button>
      <button className="glass px-3 py-1 text-xs hover:bg-white/10" onClick={toggleTheme}>◐ Theme</button>
    </div>
  );
}
