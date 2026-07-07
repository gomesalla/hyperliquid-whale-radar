import { parseNum, type CoinCtx } from "@whale/core";

async function backoff<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let err: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      err = e;
      await new Promise((r) => setTimeout(r, 250 * 2 ** i));
    }
  }
  throw err;
}

interface AssetPosition {
  position: {
    coin: string;
    szi: string;
    entryPx: string | null;
    leverage: { value: number };
    liquidationPx: string | null;
    unrealizedPnl: string;
  };
}

export interface WalletPosition {
  coin: string;
  szi: number;
  entryPx: number;
  leverage: number;
  liqPx: number | null;
  uPnl: number;
}

export class HLRest {
  constructor(private url: string, private f: typeof fetch = fetch) {}

  private async post<T>(body: unknown): Promise<T> {
    return backoff(async () => {
      const r = await this.f(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`HL ${r.status}`);
      return (await r.json()) as T;
    });
  }

  async metaAndAssetCtxs(): Promise<CoinCtx[]> {
    const [meta, ctxs] = await this.post<[
      { universe: Array<{ name: string; szDecimals: number; maxLeverage: number }> },
      Array<Record<string, string>>,
    ]>({ type: "metaAndAssetCtxs" });
    return meta.universe.map((u, i) => {
      const c = ctxs[i] ?? {};
      return {
        coin: u.name,
        szDecimals: u.szDecimals,
        markPx: parseNum(c.markPx ?? "0"),
        funding: parseNum(c.funding ?? "0"),
        openInterest: parseNum(c.openInterest ?? "0"),
        dayNtlVlm: parseNum(c.dayNtlVlm ?? "0"),
      };
    });
  }

  async clearinghouseState(user: string): Promise<{ positions: WalletPosition[] }> {
    const d = await this.post<{ assetPositions: AssetPosition[] }>({
      type: "clearinghouseState",
      user,
    });
    return {
      positions: (d.assetPositions ?? []).map((p) => ({
        coin: p.position.coin,
        szi: parseNum(p.position.szi),
        entryPx: p.position.entryPx ? parseNum(p.position.entryPx) : 0,
        leverage: p.position.leverage?.value ?? 0,
        liqPx: p.position.liquidationPx ? parseNum(p.position.liquidationPx) : null,
        uPnl: parseNum(p.position.unrealizedPnl ?? "0"),
      })),
    };
  }
}
