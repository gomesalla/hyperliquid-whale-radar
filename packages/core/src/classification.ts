import type { PositionChange, Direction } from "./types.js";

const EPS = 1e-9;
const dir = (net: number): Direction => (net >= 0 ? "long" : "short");

export function classify(prevNet: number, delta: number):
  { change: PositionChange; newNet: number; direction: Direction } {
  const newNet = prevNet + delta;
  const wasFlat = Math.abs(prevNet) < EPS;
  const isFlat = Math.abs(newNet) < EPS;

  if (wasFlat && !isFlat) return { change: "NEW", newNet, direction: dir(newNet) };
  if (!wasFlat && isFlat) return { change: "CLOSE", newNet: 0, direction: dir(prevNet) };

  const sameSign = prevNet * newNet > 0;
  if (!sameSign) {
    return {
      change: prevNet > 0 ? "FLIP_L2S" : "FLIP_S2L",
      newNet,
      direction: dir(newNet),
    };
  }
  const grew = Math.abs(newNet) > Math.abs(prevNet);
  return { change: grew ? "INCREASE" : "REDUCE", newNet, direction: dir(newNet) };
}
