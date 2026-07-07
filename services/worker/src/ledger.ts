import type Redis from "ioredis";

type Seeder = (wallet: string, coin: string) => Promise<number>;

/**
 * Redis-backed per-(wallet,coin) signed position ledger.
 * On first encounter of a (wallet,coin) it seeds a baseline from the
 * optional seeder (true on-chain net), then accumulates observed deltas.
 */
export class Ledger {
  constructor(private redis: Redis, private seeder?: Seeder) {}

  private key(w: string) {
    return `ledger:${w}`;
  }
  private seenKey(w: string) {
    return `ledgerseen:${w}`;
  }

  async apply(wallet: string, coin: string, delta: number):
    Promise<{ prevNet: number; newNet: number; seeded: boolean }> {
    const seen = await this.redis.hget(this.seenKey(wallet), coin);
    let prevNet: number;
    let seeded = false;
    if (!seen) {
      prevNet = this.seeder ? await this.seeder(wallet, coin) : 0;
      await this.redis.hset(this.seenKey(wallet), coin, "1");
      seeded = true;
    } else {
      prevNet = Number((await this.redis.hget(this.key(wallet), coin)) ?? "0");
    }
    const newNet = prevNet + delta;
    await this.redis.hset(this.key(wallet), coin, String(newNet));
    return { prevNet, newNet, seeded };
  }
}
