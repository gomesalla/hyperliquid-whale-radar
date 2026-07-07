import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import Redis from "ioredis";

/**
 * Bridges Redis pub/sub (whale:events, whale:snapshot) to all connected
 * browser WebSocket clients at GET /ws. Sends the current snapshot on connect.
 */
export function registerWsGateway(app: FastifyInstance, redisUrl: string): void {
  const sub = new Redis(redisUrl);
  const store = new Redis(redisUrl);
  const clients = new Set<WebSocket>();

  void sub.subscribe("whale:events", "whale:snapshot");
  sub.on("message", (channel, message) => {
    const type = channel === "whale:events" ? "event" : "snapshot";
    let data: unknown;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }
    const payload = JSON.stringify({ type, data });
    for (const c of clients) {
      if (c.readyState === c.OPEN) c.send(payload);
    }
  });

  app.get("/ws", { websocket: true }, async (socket: WebSocket) => {
    clients.add(socket);
    const snap = await store.get("whale:snapshot");
    if (snap) socket.send(JSON.stringify({ type: "snapshot", data: JSON.parse(snap) }));
    socket.on("close", () => clients.delete(socket));
  });
}
