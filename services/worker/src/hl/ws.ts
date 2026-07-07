import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { RawTradeSchema, type RawTrade } from "@whale/core";

/**
 * Sharded Hyperliquid trade-stream subscriber.
 * Splits coins across multiple WS connections, heartbeats every 30s,
 * and reconnects with a fixed backoff, re-subscribing its coin shard.
 */
export class HLTradeStream extends EventEmitter {
  private conns: WebSocket[] = [];
  private stopped = false;

  constructor(private wsUrl: string, private coinsPerConn = 50) {
    super();
  }

  start(coins: string[]): void {
    this.stopped = false;
    for (let i = 0; i < coins.length; i += this.coinsPerConn) {
      this.openConn(coins.slice(i, i + this.coinsPerConn));
    }
  }

  private openConn(coins: string[]): void {
    const ws = new WebSocket(this.wsUrl);
    this.conns.push(ws);
    let hb: NodeJS.Timeout | undefined;

    ws.on("open", () => {
      for (const coin of coins) {
        ws.send(JSON.stringify({ method: "subscribe", subscription: { type: "trades", coin } }));
      }
      hb = setInterval(() => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ method: "ping" }));
      }, 30_000);
    });

    ws.on("message", (buf) => {
      let msg: unknown;
      try {
        msg = JSON.parse(buf.toString());
      } catch {
        return;
      }
      const m = msg as { channel?: string; data?: unknown[] };
      if (m.channel !== "trades" || !Array.isArray(m.data)) return;
      for (const raw of m.data) {
        const parsed = RawTradeSchema.safeParse(raw);
        if (parsed.success) this.emit("trade", parsed.data as RawTrade);
      }
    });

    ws.on("close", () => {
      if (hb) clearInterval(hb);
      if (!this.stopped) setTimeout(() => this.openConn(coins), 2000);
    });
    ws.on("error", () => ws.close());
  }

  stop(): void {
    this.stopped = true;
    for (const c of this.conns) c.close();
    this.conns = [];
  }
}
