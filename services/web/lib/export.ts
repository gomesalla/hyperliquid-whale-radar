import type { WhaleEvent } from "./types";

function download(name: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportJson(rows: WhaleEvent[]): void {
  download("whale-feed.json", JSON.stringify(rows, null, 2), "application/json");
}

export function exportCsv(rows: WhaleEvent[]): void {
  const cols: (keyof WhaleEvent)[] = ["ts", "coin", "direction", "usd", "sz", "px", "leverage", "change", "liqPx", "uPnl", "taker"];
  const head = cols.join(",");
  const body = rows.map((r) => cols.map((c) => r[c] ?? "").join(",")).join("\n");
  download("whale-feed.csv", `${head}\n${body}`, "text/csv");
}
