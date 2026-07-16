import { debounce, type DebouncedFunc } from "lodash";

import type { Match, Prediction } from "./types";

type SavePrediction = (match: Match, patch: Partial<Prediction>) => void;

export type PredictionDebouncer = {
  /** Queue a save for this match, restarting only this match's timer. */
  schedule: SavePrediction;
  /** Run every queued save immediately. No-op for matches with nothing pending. */
  flushAll: () => void;
};

/**
 * Debounces prediction saves per match.
 *
 * A single shared debouncer keeps only one pending call, so editing a second match
 * inside the window would replace the first match's pending args and silently drop
 * its score. Each match gets its own timer instead.
 */
export function createPredictionDebouncer(save: SavePrediction, delayMs: number): PredictionDebouncer {
  const debouncers = new Map<string, DebouncedFunc<SavePrediction>>();

  return {
    schedule(match, patch) {
      let debounced = debouncers.get(match.id);
      if (!debounced) {
        debounced = debounce(save, delayMs);
        debouncers.set(match.id, debounced);
      }
      debounced(match, patch);
    },
    flushAll() {
      debouncers.forEach((debounced) => debounced.flush());
    },
  };
}
