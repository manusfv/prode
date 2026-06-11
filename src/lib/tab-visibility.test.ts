import { describe, expect, it } from "vitest";

import { getPredictionsStages, getResultsStages, getStandingsStages } from "./tab-visibility";
import type { Match, StageState } from "./types";

function stage(partial: Partial<StageState> & { stage: StageState["stage"] }): StageState {
  return {
    label: partial.stage,
    predictionsOpen: false,
    resultsOpen: false,
    standingsOpen: false,
    ...partial,
  };
}

const finalizedMatch: Match = {
  id: "m1", matchNo: 1, stage: "round32", homeTeamId: "a", awayTeamId: "b",
  kickoffUtc: "2026-06-01T00:00:00.000Z", status: "finalized", homeScore: 1, awayScore: 0,
  winnerTeamId: "a", finalizedAt: "2026-06-01T02:00:00.000Z", finalizedBy: "u1", updatedAt: null, updatedBy: null,
};

const stages: StageState[] = [
  stage({ stage: "round32", predictionsOpen: true, resultsOpen: true, standingsOpen: true }),
  stage({ stage: "round16", resultsOpen: true }), // results_open but no content
];

describe("stage gating helpers", () => {
  it("getPredictionsStages returns predictionsOpen stages", () => {
    expect(getPredictionsStages(stages)).toEqual(new Set(["round32"]));
  });

  it("getStandingsStages returns standingsOpen stages", () => {
    expect(getStandingsStages(stages)).toEqual(new Set(["round32"]));
  });

  it("getResultsStages requires both results_open AND content", () => {
    const result = getResultsStages(stages, [finalizedMatch], []);
    expect(result.has("round32")).toBe(true); // open + content
    expect(result.has("round16")).toBe(false); // open but no content
  });

  it("getResultsStages excludes a stage with content but results_open off", () => {
    const closed: StageState[] = [stage({ stage: "round32", resultsOpen: false })];
    expect(getResultsStages(closed, [finalizedMatch], [])).toEqual(new Set());
  });
});
