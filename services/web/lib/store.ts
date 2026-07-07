import { create } from "zustand";
import type { WhaleEvent, Snapshot } from "./types";

export interface Filters {
  coin?: string;
  direction?: "long" | "short";
  change?: string;
  search?: string;
}

interface S {
  window: string;
  threshold: number;
  filters: Filters;
  feed: WhaleEvent[];
  snapshot: Snapshot | null;
  setWindow: (w: string) => void;
  setThreshold: (t: number) => void;
  setFilters: (f: Filters) => void;
  pushEvent: (e: WhaleEvent) => void;
  setSnapshot: (s: Snapshot) => void;
  setFeed: (f: WhaleEvent[]) => void;
}

export const useStore = create<S>((set) => ({
  window: "15m",
  threshold: 25_000,
  filters: {},
  feed: [],
  snapshot: null,
  setWindow: (window) => set({ window }),
  setThreshold: (threshold) => set({ threshold }),
  setFilters: (filters) => set({ filters }),
  pushEvent: (e) => set((s) => ({ feed: [e, ...s.feed].slice(0, 500) })),
  setSnapshot: (snapshot) => set({ snapshot }),
  setFeed: (feed) => set({ feed }),
}));
