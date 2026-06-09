import { describe, expect, it } from "vitest";
import type { Match, PredictionDraft } from "./types";
import { needsAdvancer, stepScore } from "./tournament";

const knockoutMatch: Match = {
  id: "m2",
  matchNo: 2,
  stage: "round16",
  group: undefined,
  homeTeamId: "arg",
  awayTeamId: "mex",
  kickoffUtc: "2026-06-12T22:00:00.000Z",
  homeScore: null,
  awayScore: null,
  winnerTeamId: null,
  finalizedAt: null,
  finalizedBy: null,
  updatedAt: null,
  updatedBy: null,
};

function draft(overrides: Partial<PredictionDraft>): PredictionDraft {
  return { homeScore: null, awayScore: null, winnerTeamId: null, ...overrides };
}

describe("stepScore", () => {
  it("starts at 0 when incrementing from empty", () => {
    expect(stepScore(null, 1)).toBe(0);
  });

  it("increments an existing score", () => {
    expect(stepScore(0, 1)).toBe(1);
    expect(stepScore(2, 1)).toBe(3);
  });

  it("decrements an existing score", () => {
    expect(stepScore(3, -1)).toBe(2);
  });

  it("clears to empty when decrementing from 0", () => {
    expect(stepScore(0, -1)).toBeNull();
  });

  it("stays empty when decrementing from empty", () => {
    expect(stepScore(null, -1)).toBeNull();
  });
});

describe("needsAdvancer", () => {
  it("is false when scores are untouched", () => {
    expect(needsAdvancer(knockoutMatch, draft({}))).toBe(false);
  });

  it("is false for an entered non-tie", () => {
    expect(needsAdvancer(knockoutMatch, draft({ homeScore: 2, awayScore: 1 }))).toBe(false);
  });

  it("is true for an entered knockout tie", () => {
    expect(needsAdvancer(knockoutMatch, draft({ homeScore: 0, awayScore: 0 }))).toBe(true);
    expect(needsAdvancer(knockoutMatch, draft({ homeScore: 1, awayScore: 1 }))).toBe(true);
  });

  it("is false for a group-stage tie", () => {
    const groupMatch: Match = { ...knockoutMatch, stage: "groups", group: "A" };
    expect(needsAdvancer(groupMatch, draft({ homeScore: 1, awayScore: 1 }))).toBe(false);
  });

  it("is false when one side is still empty", () => {
    expect(needsAdvancer(knockoutMatch, draft({ homeScore: 1, awayScore: null }))).toBe(false);
  });
});
