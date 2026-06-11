import { describe, expect, it } from "vitest";
import type { Group, Match } from "./types";
import { getStagesWithContent } from "./results";

const baseMatch: Match = {
  id: "m1",
  matchNo: 1,
  stage: "round16",
  homeTeamId: "arg",
  awayTeamId: "mex",
  kickoffUtc: "2026-07-01T18:00:00.000Z",
  homeScore: null,
  awayScore: null,
  winnerTeamId: null,
  finalizedAt: null,
  finalizedBy: null,
  updatedAt: null,
  updatedBy: null,
};

const baseGroup: Group = {
  groupLabel: "A",
  locksAt: null,
  firstTeamId: null,
  secondTeamId: null,
  thirdTeamId: null,
  fourthTeamId: null,
  resultFinalizedAt: null,
  resultFinalizedBy: null,
};

describe("getStagesWithContent", () => {
  it("marks a stage with at least one match", () => {
    const set = getStagesWithContent([baseMatch], []);
    expect(set.has("round16")).toBe(true);
    expect(set.has("final")).toBe(false);
  });

  it("marks groups when at least one group exists", () => {
    expect(getStagesWithContent([], [baseGroup]).has("groups")).toBe(true);
    expect(getStagesWithContent([], []).has("groups")).toBe(false);
  });
});
