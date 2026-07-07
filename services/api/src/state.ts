import type Redis from "ioredis";

export interface CoinRow {
  coin: string;
  longUsd: number;
  shortUsd: number;
  netUsd: number;
  count: number;
  newWallets?: number;
  oiChangePct?: number;
  mark?: number;
  funding?: number;
  oi?: number;
  vol?: number;
}

export interface Snapshot {
  ts?: number;
  window?: string;
  coins: CoinRow[];
  clusters: unknown[];
}

export class State {
  constructor(private redis: Redis) {}

  async feed(limit = 100): Promise<unknown[]> {
    const raw = await this.redis.lrange("whale:feed", 0, limit - 1);
    return raw.map((r) => JSON.parse(r));
  }

  async snapshot(): Promise<Snapshot> {
    return JSON.parse((await this.redis.get("whale:snapshot")) ?? '{"coins":[],"clusters":[]}');
  }

  async kpis() {
    const s = await this.snapshot();
    const coins = s.coins ?? [];
    const totalLongUsd = coins.reduce((a, c) => a + c.longUsd, 0);
    const totalShortUsd = coins.reduce((a, c) => a + c.shortUsd, 0);
    const byLong = [...coins].sort((a, b) => b.longUsd - a.longUsd)[0] ?? { coin: "-", longUsd: 0 };
    const byShort = [...coins].sort((a, b) => b.shortUsd - a.shortUsd)[0] ?? { coin: "-", shortUsd: 0 };
    const byActive = [...coins].sort((a, b) => b.count - a.count)[0] ?? { coin: "-" };
    const byBull = [...coins].sort((a, b) => b.netUsd - a.netUsd)[0] ?? { coin: "-" };
    const byBear = [...coins].sort((a, b) => a.netUsd - b.netUsd)[0] ?? { coin: "-" };
    const byOi = [...coins].sort((a, b) => (b.oiChangePct ?? 0) - (a.oiChangePct ?? 0))[0] ?? { coin: "-" };
    const byVol = [...coins].sort((a, b) => (b.vol ?? 0) - (a.vol ?? 0))[0] ?? { coin: "-" };
    return {
      totalLongUsd,
      totalShortUsd,
      longShortRatio: totalShortUsd > 0 ? totalLongUsd / totalShortUsd : 0,
      largestLong: byLong,
      largestShort: byShort,
      mostActive: byActive.coin,
      mostBullish: byBull.coin,
      mostBearish: byBear.coin,
      highestOiIncrease: byOi.coin,
      highestVolume: byVol.coin,
    };
  }

  async leaderboard(metric: string) {
    const s = await this.snapshot();
    const coins = [...(s.coins ?? [])];
    const key: Record<string, (c: CoinRow) => number> = {
      longVol: (c) => c.longUsd,
      shortVol: (c) => c.shortUsd,
      netLong: (c) => c.netUsd,
      netShort: (c) => -c.netUsd,
      active: (c) => c.count,
      newWallets: (c) => c.newWallets ?? 0,
      oiGrowth: (c) => c.oiChangePct ?? 0,
    };
    const f = key[metric] ?? key.longVol!;
    return coins.sort((a, b) => f(b) - f(a)).slice(0, 20);
  }
}
