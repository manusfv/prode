import { describe, expect, it } from "vitest";

import { getInitials, getLeaderboard, getStageLeaderboard, podiumOrder } from "./standings";
import type { Group, GroupPrediction, Match, Prediction, Profile } from "./types";

const profiles: Profile[] = [
  { id: "u1", displayName: "Ana", email: "a@x.com", approved: true, role: "user" },
  { id: "u2", displayName: "Beto", email: "b@x.com", approved: true, role: "user" },
  { id: "u3", displayName: "Cata", email: "c@x.com", approved: false, role: "user" },
];

const matches: Match[] = [
  { id: "m1", matchNo: 1, stage: "round32", homeTeamId: "a", awayTeamId: "b", kickoffUtc: "2026-06-01T00:00:00.000Z", homeScore: 1, awayScore: 0, winnerTeamId: "a", finalizedAt: null, finalizedBy: null, updatedAt: null, updatedBy: null, finalizedSource: null, feedMatchId: null },
  { id: "m2", matchNo: 2, stage: "round16", homeTeamId: "a", awayTeamId: "b", kickoffUtc: "2026-06-02T00:00:00.000Z", homeScore: 2, awayScore: 1, winnerTeamId: "a", finalizedAt: null, finalizedBy: null, updatedAt: null, updatedBy: null, finalizedSource: null, feedMatchId: null },
];

function pred(id: string, userId: string, matchId: string, points: number, exact = false): Prediction {
  return { id, userId, matchId, homeScore: 0, awayScore: 0, winnerTeamId: null, points, exactHit: exact, outcomeHit: !exact, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z" };
}

const predictions: Prediction[] = [
  pred("p1", "u1", "m1", 10, true), // round32
  pred("p2", "u1", "m2", 5), // round16
  pred("p3", "u2", "m1", 3), // round32
];

const groupPredictions: GroupPrediction[] = [
  { id: "g1", userId: "u1", groupLabel: "A", firstTeamId: "a", secondTeamId: "b", thirdTeamId: "c", fourthTeamId: "d", points: 8, exactPositions: 2, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-05-01T00:00:00.000Z" },
];

const finalizedGroups: Group[] = [
  { groupLabel: "A", locksAt: null, firstTeamId: "a", secondTeamId: "b", thirdTeamId: "c", fourthTeamId: "d", resultFinalizedAt: "2026-06-10T00:00:00.000Z", resultFinalizedBy: "admin", resultSource: null },
];
const provisionalGroups: Group[] = [
  { groupLabel: "A", locksAt: null, firstTeamId: "a", secondTeamId: "b", thirdTeamId: "c", fourthTeamId: "d", resultFinalizedAt: null, resultFinalizedBy: null, resultSource: null },
];

describe("getLeaderboard (revealed-scoped)", () => {
  it("sums only revealed stages and excludes groups when not revealed", () => {
    const rows = getLeaderboard({ predictions, profiles, groupPredictions, matches, groups: finalizedGroups, standingsStages: new Set(["round32"]) });
    const u1 = rows.find((r) => r.user.id === "u1")!;
    const u2 = rows.find((r) => r.user.id === "u2")!;
    expect(u1.points).toBe(10); // round32 only, no round16, no groups
    expect(u2.points).toBe(3);
    expect(rows.some((r) => r.user.id === "u3")).toBe(false); // unapproved excluded
  });

  it("includes groups points only when groups is revealed", () => {
    const rows = getLeaderboard({ predictions, profiles, groupPredictions, matches, groups: finalizedGroups, standingsStages: new Set(["round32", "groups"]) });
    expect(rows.find((r) => r.user.id === "u1")!.points).toBe(18); // 10 + 8 groups
  });

  it("ranks by points then exact hits", () => {
    const rows = getLeaderboard({ predictions, profiles, groupPredictions, matches, groups: finalizedGroups, standingsStages: new Set(["round32", "round16"]) });
    expect(rows[0].user.id).toBe("u1"); // 15 > 3
    expect(rows[0].rank).toBe(1);
  });

  it("gives tied participants the same rank and skips the next (1, 1, 3)", () => {
    const tiedProfiles: Profile[] = [
      { id: "a", displayName: "A", email: "a@x.com", approved: true, role: "user" },
      { id: "b", displayName: "B", email: "b@x.com", approved: true, role: "user" },
      { id: "c", displayName: "C", email: "c@x.com", approved: true, role: "user" },
    ];
    const tiedPredictions: Prediction[] = [
      pred("a1", "a", "m1", 80),
      pred("b1", "b", "m1", 80),
      pred("c1", "c", "m1", 78),
    ];
    const rows = getLeaderboard({ predictions: tiedPredictions, profiles: tiedProfiles, groupPredictions: [], matches, groups: finalizedGroups, standingsStages: new Set(["round32"]) });
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3]);
  });
});

describe("getStageLeaderboard", () => {
  it("returns only that stage's match points", () => {
    const rows = getStageLeaderboard("round16", { predictions, profiles, groupPredictions, matches, groups: finalizedGroups });
    expect(rows.find((r) => r.user.id === "u1")!.points).toBe(5);
    expect(rows.find((r) => r.user.id === "u2")!.points).toBe(0);
  });

  it("uses group predictions for the groups stage", () => {
    const rows = getStageLeaderboard("groups", { predictions, profiles, groupPredictions, matches, groups: finalizedGroups });
    expect(rows.find((r) => r.user.id === "u1")!.points).toBe(8);
  });
});

describe("getLeaderboard provisional gating", () => {
  it("excludes provisional group points by default", () => {
    const rows = getLeaderboard({ predictions, profiles, groupPredictions, matches, groups: provisionalGroups, standingsStages: new Set(["round32", "groups"]) });
    expect(rows.find((r) => r.user.id === "u1")!.points).toBe(10); // 10 match; provisional 8 excluded
  });

  it("includes provisional group points when includeProvisional is true", () => {
    const rows = getLeaderboard({ predictions, profiles, groupPredictions, matches, groups: provisionalGroups, standingsStages: new Set(["round32", "groups"]), includeProvisional: true });
    expect(rows.find((r) => r.user.id === "u1")!.points).toBe(18); // 10 + 8 provisional
  });

  it("counts finalized group points in both modes", () => {
    const off = getLeaderboard({ predictions, profiles, groupPredictions, matches, groups: finalizedGroups, standingsStages: new Set(["round32", "groups"]) });
    const on = getLeaderboard({ predictions, profiles, groupPredictions, matches, groups: finalizedGroups, standingsStages: new Set(["round32", "groups"]), includeProvisional: true });
    expect(off.find((r) => r.user.id === "u1")!.points).toBe(18);
    expect(on.find((r) => r.user.id === "u1")!.points).toBe(18);
  });
});

describe("getStageLeaderboard provisional gating", () => {
  it("excludes provisional groups by default and includes them when previewing", () => {
    const off = getStageLeaderboard("groups", { predictions, profiles, groupPredictions, matches, groups: provisionalGroups });
    const on = getStageLeaderboard("groups", { predictions, profiles, groupPredictions, matches, groups: provisionalGroups, includeProvisional: true });
    expect(off.find((r) => r.user.id === "u1")!.points).toBe(0);
    expect(on.find((r) => r.user.id === "u1")!.points).toBe(8);
  });
});

describe("getInitials", () => {
  it("uppercases the first letter of a single-word name", () => {
    expect(getInitials("marcos")).toBe("M");
  });

  it("uses the first letters of the first two words", () => {
    expect(getInitials("Lucía Pérez")).toBe("LP");
  });

  it("ignores words beyond the first two", () => {
    expect(getInitials("Ana María López")).toBe("AM");
  });

  it("collapses and trims surrounding whitespace", () => {
    expect(getInitials("  diego   gómez  ")).toBe("DG");
  });

  it("falls back to '?' for an empty or blank name", () => {
    expect(getInitials("")).toBe("?");
    expect(getInitials("   ")).toBe("?");
  });
});

describe("podiumOrder", () => {
  it("reorders three rows to second, first, third (raised center)", () => {
    expect(podiumOrder(["first", "second", "third"])).toEqual(["second", "first", "third"]);
  });

  it("returns two rows unchanged", () => {
    expect(podiumOrder(["first", "second"])).toEqual(["first", "second"]);
  });

  it("returns one row unchanged", () => {
    expect(podiumOrder(["first"])).toEqual(["first"]);
  });

  it("returns an empty array unchanged", () => {
    expect(podiumOrder([])).toEqual([]);
  });
});
