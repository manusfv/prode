import { describe, expect, it } from "vitest";

import {
  getEditablePredictionsStages,
  getPredictionsStages,
  getResultsStages,
  getStandingsStages,
} from "./tab-visibility";
import type { Match, StageState } from "./types";

function stage(partial: Partial<StageState> & { stage: StageState["stage"] }): StageState {
  return {
    label: partial.stage,
    predictionsOpen: "closed",
    resultsOpen: "closed",
    standingsOpen: "closed",
    ...partial,
  };
}

const finalizedMatch: Match = {
  id: "m1", matchNo: 1, stage: "round32", homeTeamId: "a", awayTeamId: "b",
  kickoffUtc: "2026-06-01T00:00:00.000Z", status: "finalized", homeScore: 1, awayScore: 0,
  winnerTeamId: "a", finalizedAt: "2026-06-01T02:00:00.000Z", finalizedBy: "u1", updatedAt: null, updatedBy: null, finalizedSource: null, feedMatchId: null,
};

const stages: StageState[] = [
  stage({ stage: "round32", predictionsOpen: "open", resultsOpen: "open", standingsOpen: "open" }),
  stage({ stage: "round16", predictionsOpen: "admin", resultsOpen: "admin", standingsOpen: "admin" }),
  stage({ stage: "quarter", predictionsOpen: "closed", resultsOpen: "closed", standingsOpen: "closed" }),
];

describe("stage gating helpers", () => {
  it("getPredictionsStages: open visible to everyone, admin-only only to admins", () => {
    expect(getPredictionsStages(stages, false)).toEqual(new Set(["round32"]));
    expect(getPredictionsStages(stages, true)).toEqual(new Set(["round32", "round16"]));
  });

  it("getStandingsStages: respects admin-only per viewer", () => {
    expect(getStandingsStages(stages, false)).toEqual(new Set(["round32"]));
    expect(getStandingsStages(stages, true)).toEqual(new Set(["round32", "round16"]));
  });

  it("getEditablePredictionsStages: only fully-open stages, never admin-only", () => {
    expect(getEditablePredictionsStages(stages)).toEqual(new Set(["round32"]));
  });

  it("getResultsStages: admin-only stage requires content AND admin viewer", () => {
    const admin32 = getResultsStages(stages, [finalizedMatch], [], true);
    expect(admin32.has("round32")).toBe(true); // open + content
    // round16 is admin-only with no content -> excluded even for admin
    expect(admin32.has("round16")).toBe(false);
    // open stage hidden from non-admins only if admin-only; round32 is open -> visible
    expect(getResultsStages(stages, [finalizedMatch], [], false).has("round32")).toBe(true);
  });

  it("getResultsStages: admin-only stage WITH content visible to admin, not user", () => {
    const r16Match: Match = { ...finalizedMatch, id: "m2", stage: "round16" };
    const withContent: StageState[] = [stage({ stage: "round16", resultsOpen: "admin" })];
    expect(getResultsStages(withContent, [r16Match], [], true)).toEqual(new Set(["round16"]));
    expect(getResultsStages(withContent, [r16Match], [], false)).toEqual(new Set());
  });
});
