import type { WhaleEvent, Snapshot } from "./types";

/**
 * Connects to the API websocket gateway and dispatches live events/snapshots.
 * Auto-reconnects with exponential backoff. Returns a disposer.
 */
export function connectWS(
  onEvent: (e: WhaleEvent) => void,
  onSnapshot: (s: Snapshot) => void,
): () => void {
  const url = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000/ws";
  let ws: WebSocket | undefined;
  let closed = false;
  let backoff = 1000;

  const open = () => {
    ws = new WebSocket(url);
    ws.onopen = () => {
      backoff = 1000;
    };
    ws.onmessage = (m) => {
      try {
        const msg = JSON.parse(m.data as string) as { type: string; data: unknown };
        if (msg.type === "event") onEvent(msg.data as WhaleEvent);
        else if (msg.type === "snapshot") onSnapshot(msg.data as Snapshot);
      } catch {
        /* ignore malformed frame */
      }
    };
    ws.onclose = () => {
      if (!closed) {
        setTimeout(open, backoff);
        backoff = Math.min(backoff * 2, 15000);
      }
    };
    ws.onerror = () => ws?.close();
  };
  open();

  return () => {
    closed = true;
    ws?.close();
  };
}
