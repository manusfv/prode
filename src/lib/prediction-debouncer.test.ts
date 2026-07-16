import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPredictionDebouncer } from "./prediction-debouncer";
import type { Match, Prediction } from "./types";

const match = (id: string) => ({ id }) as Match;
const score = (homeScore: number, awayScore: number): Partial<Prediction> => ({ homeScore, awayScore });

describe("createPredictionDebouncer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("saves both matches when a second match is edited inside the window", () => {
    const save = vi.fn();
    const debouncer = createPredictionDebouncer(save, 500);

    debouncer.schedule(match("a"), score(2, 1));
    vi.advanceTimersByTime(200);
    debouncer.schedule(match("b"), score(0, 3));
    vi.advanceTimersByTime(500);

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenCalledWith(match("a"), score(2, 1));
    expect(save).toHaveBeenCalledWith(match("b"), score(0, 3));
  });

  it("coalesces rapid edits of the same match into the final score", () => {
    const save = vi.fn();
    const debouncer = createPredictionDebouncer(save, 500);

    debouncer.schedule(match("a"), score(1, 0));
    vi.advanceTimersByTime(100);
    debouncer.schedule(match("a"), score(4, 4));
    vi.advanceTimersByTime(500);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(match("a"), score(4, 4));
  });

  it("flushAll saves a score typed immediately before navigating away", () => {
    const save = vi.fn();
    const debouncer = createPredictionDebouncer(save, 500);

    debouncer.schedule(match("a"), score(5, 5));
    debouncer.flushAll();

    expect(save).toHaveBeenCalledWith(match("a"), score(5, 5));
  });

  it("flushAll saves every pending match at once", () => {
    const save = vi.fn();
    const debouncer = createPredictionDebouncer(save, 500);

    debouncer.schedule(match("a"), score(2, 1));
    debouncer.schedule(match("b"), score(0, 3));
    debouncer.schedule(match("c"), score(1, 1));
    debouncer.flushAll();

    expect(save).toHaveBeenCalledTimes(3);
  });

  it("does not save again when nothing is pending", () => {
    const save = vi.fn();
    const debouncer = createPredictionDebouncer(save, 500);

    debouncer.schedule(match("a"), score(2, 1));
    vi.advanceTimersByTime(500);
    expect(save).toHaveBeenCalledTimes(1);

    debouncer.flushAll();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("keeps debouncing a match after an earlier save settled", () => {
    const save = vi.fn();
    const debouncer = createPredictionDebouncer(save, 500);

    debouncer.schedule(match("a"), score(1, 0));
    vi.advanceTimersByTime(500);

    debouncer.schedule(match("a"), score(3, 2));
    vi.advanceTimersByTime(499);
    expect(save).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(match("a"), score(3, 2));
  });
});
