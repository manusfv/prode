import { describe, expect, it } from "vitest";
import type { Group, Match, Prediction, Profile } from "./types";
import { getDefaultResultStage, getStagesWithContent, sortComparison } from "./results";

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

describe("getDefaultResultStage", () => {
  const now = new Date("2026-07-05T00:00:00.000Z");

  it("returns the latest stage that has a finalized match", () => {
    const finalizedRound16: Match = {
      ...baseMatch,
      id: "m-r16",
      stage: "round16",
      kickoffUtc: "2026-07-01T18:00:00.000Z",
      homeScore: 2,
      awayScore: 1,
      finalizedAt: "2026-07-01T20:00:00.000Z",
    };
    const openQuarter: Match = {
      ...baseMatch,
      id: "m-qf",
      stage: "quarter",
      kickoffUtc: "2026-07-10T18:00:00.000Z",
    };
    expect(getDefaultResultStage([finalizedRound16, openQuarter], [], now)).toBe("round16");
  });

  it("treats a finalized group as finalized 'groups' content", () => {
    const finalizedGroup: Group = { ...baseGroup, resultFinalizedAt: "2026-06-28T00:00:00.000Z" };
    expect(getDefaultResultStage([], [finalizedGroup], now)).toBe("groups");
  });

  it("falls back to the first stage with content when nothing is finalized", () => {
    const openQuarter: Match = {
      ...baseMatch,
      id: "m-qf",
      stage: "quarter",
      kickoffUtc: "2026-07-10T18:00:00.000Z",
    };
    expect(getDefaultResultStage([openQuarter], [], now)).toBe("quarter");
  });

  it("falls back to 'groups' when there is no content at all", () => {
    expect(getDefaultResultStage([], [], now)).toBe("groups");
  });
});

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

const profile = (id: string, displayName: string): Profile => ({
  id,
  displayName,
  email: `${id}@example.com`,
  approved: true,
  role: "user",
});

const matchPrediction = (
  userId: string,
  points: number,
  exactHit: boolean,
): Prediction => ({
  id: `p-${userId}`,
  userId,
  matchId: "m1",
  homeScore: 1,
  awayScore: 0,
  winnerTeamId: null,
  points,
  exactHit,
  outcomeHit: points > 0,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
});

const matchOptions = {
  userIdOf: (p: Prediction) => p.userId,
  pointsOf: (p: Prediction) => p.points ?? 0,
  exactOf: (p: Prediction) => (p.exactHit ? 1 : 0),
};

describe("sortComparison", () => {
  const ana = profile("u-ana", "Ana");
  const beto = profile("u-beto", "Beto");
  const caro = profile("u-caro", "Caro");

  it("sorts finalized entries by points desc, then name, with missing last", () => {
    const entries = sortComparison(
      [ana, beto, caro],
      [matchPrediction("u-ana", 1, false), matchPrediction("u-beto", 3, true)],
      { ...matchOptions, finalized: true },
    );
    expect(entries.map((entry) => entry.profile.id)).toEqual(["u-beto", "u-ana", "u-caro"]);
    expect(entries[2].prediction).toBeUndefined();
  });

  it("sorts locked entries alphabetically with missing last", () => {
    const entries = sortComparison(
      [caro, ana, beto],
      [matchPrediction("u-caro", 0, false), matchPrediction("u-ana", 0, false)],
      { ...matchOptions, finalized: false },
    );
    expect(entries.map((entry) => entry.profile.id)).toEqual(["u-ana", "u-caro", "u-beto"]);
  });

  it("breaks finalized point ties by exact count, then name", () => {
    const entries = sortComparison(
      [ana, beto],
      [matchPrediction("u-beto", 3, false), matchPrediction("u-ana", 3, true)],
      { ...matchOptions, finalized: true },
    );
    expect(entries.map((entry) => entry.profile.id)).toEqual(["u-ana", "u-beto"]);
  });
});
