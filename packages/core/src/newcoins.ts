export function diffUniverse(prev: string[], next: string[]): string[] {
  const p = new Set(prev);
  return next.filter((c) => !p.has(c));
}
