import { describe, expect, it } from "vitest";
import type { Group } from "../types";
import type { FeedStanding } from "./types";
import { matchStandings } from "./match-standings";

const known = new Set(["mex", "kor", "cze", "rsa", "arg", "bra", "ger", "esp"]);

function group(label: string, overrides: Partial<Group> = {}): Group {
  return {
    groupLabel: label, locksAt: null,
    firstTeamId: null, secondTeamId: null, thirdTeamId: null, fourthTeamId: null,
    resultFinalizedAt: null, resultFinalizedBy: null, resultSource: null, ...overrides,
  };
}

const feedA: FeedStanding = {
  groupLabel: "A", positions: ["MEX", "KOR", "CZE", "RSA"], playedByPosition: [3, 3, 3, 3],
};

describe("matchStandings", () => {
  it("maps positions to team ids and marks a fully-played group complete", () => {
    const { results, unmatched } = matchStandings([feedA], [group("A")], known);
    expect(unmatched).toEqual([]);
    expect(results).toEqual([
      { groupLabel: "A", firstTeamId: "mex", secondTeamId: "kor", thirdTeamId: "cze", fourthTeamId: "rsa", complete: true },
    ]);
  });

  it("marks a partially-played group as not complete", () => {
    const partial = { ...feedA, playedByPosition: [1, 1, 1, 1] };
    const { results } = matchStandings([partial], [group("A")], known);
    expect(results[0].complete).toBe(false);
  });

  it("skips a group already owned by admin", () => {
    const { results } = matchStandings([feedA], [group("A", { resultSource: "admin" })], known);
    expect(results).toEqual([]);
  });

  it("reports an unresolved TLA and skips that group", () => {
    const bad = { ...feedA, positions: ["MEX", "KOR", "CZE", "ZZZ"] };
    const { results, unmatched } = matchStandings([bad], [group("A")], known);
    expect(results).toEqual([]);
    expect(unmatched).toEqual(["A:ZZZ"]);
  });
});
