export function parseNum(s: string): number {
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`bad number: ${s}`);
  return n;
}

export function roundCents(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function usd(px: number, sz: number): number {
  return roundCents(px * sz);
}
