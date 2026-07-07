// Records real Hyperliquid trades into fixtures/trades-sample.jsonl (sample data).
// Uses Node's built-in global WebSocket (Node >= 21). No deps required.
// Usage: node scripts/capture-fixture.mjs BTC ETH SOL HYPE
import { writeFileSync, appendFileSync, mkdirSync } from "node:fs";

const coins = process.argv.slice(2);
if (!coins.length) {
  console.error("usage: node scripts/capture-fixture.mjs BTC ETH SOL");
  process.exit(1);
}
mkdirSync("fixtures", { recursive: true });
const out = "fixtures/trades-sample.jsonl";
writeFileSync(out, "");

const ws = new WebSocket("wss://api.hyperliquid.xyz/ws");
let n = 0;
ws.onopen = () => {
  for (const c of coins) {
    ws.send(JSON.stringify({ method: "subscribe", subscription: { type: "trades", coin: c } }));
  }
};
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.channel !== "trades" || !Array.isArray(m.data)) return;
  for (const t of m.data) {
    appendFileSync(out, JSON.stringify(t) + "\n");
    if (++n >= 2000) {
      console.log("captured", n, "trades ->", out);
      process.exit(0);
    }
  }
};
setTimeout(() => {
  console.log("captured", n, "trades ->", out);
  process.exit(0);
}, 120000);
