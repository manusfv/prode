import { describe, expect, it } from "vitest";
import { matchFixtures } from "./match-fixtures";
import type { FeedMatch } from "./types";
import type { Match } from "../types";

const known = new Set(["rsa", "can", "mex", "bra", "jpn"]);

function fixture(over: Partial<Match>): Match {
  return {
    id: "m1", matchNo: 73, stage: "round32", homeTeamId: null, awayTeamId: null,
    kickoffUtc: "2026-06-28T19:00:00Z", homeScore: null, awayScore: null,
    winnerTeamId: null, finalizedAt: null, finalizedBy: null, updatedAt: null,
    updatedBy: null, finalizedSource: null, feedMatchId: null, ...over,
  };
}

function feed(over: Partial<FeedMatch>): FeedMatch {
  return {
    feedId: 1, stage: "round32", utcDate: "2026-06-28T19:00:00Z",
    homeTla: "RSA", awayTla: "CAN", status: "SCHEDULED",
    homeScore: null, awayScore: null, winner: null, ...over,
  };
}

describe("matchFixtures — updates against existing fixtures", () => {
  it("bootstraps by stage + kickoff instant and adopts the feed id, filling teams", () => {
    const { updates, inserts } = matchFixtures([feed({ feedId: 99 })], [fixture({})], known);
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      matchId: "m1", feedId: 99, homeTeamId: "rsa", awayTeamId: "can", finalize: false,
    });
  });

  it("matches by stored feed id once bootstrapped (ignoring instant)", () => {
    const f = feed({ feedId: 42, utcDate: "2026-06-28T21:30:00Z" }); // time shifted
    const m = fixture({ feedMatchId: "42", kickoffUtc: "2026-06-28T19:00:00Z" });
    const { updates } = matchFixtures([f], [m], known);
    expect(updates[0].feedId).toBe(42);
    expect(updates[0].kickoffUtc).toBe("2026-06-28T21:30:00Z"); // refreshed from feed
  });

  it("leaves a TBD opponent slot null", () => {
    const { updates } = matchFixtures([feed({ awayTla: null })], [fixture({})], known);
    expect(updates[0].homeTeamId).toBe("rsa");
    expect(updates[0].awayTeamId).toBeNull();
  });

  it("finalizes a finished match with winner mapped to a team id", () => {
    const f = feed({ status: "FINISHED", homeScore: 2, awayScore: 1, winner: "HOME_TEAM" });
    const { updates } = matchFixtures([f], [fixture({})], known);
    expect(updates[0]).toMatchObject({
      finalize: true, homeScore: 2, awayScore: 1, winnerTeamId: "rsa",
    });
  });

  it("maps a penalty/draw winner (90' draw, advancer in winner)", () => {
    const f = feed({ status: "FINISHED", homeScore: 1, awayScore: 1, winner: "AWAY_TEAM" });
    const { updates } = matchFixtures([f], [fixture({})], known);
    expect(updates[0].winnerTeamId).toBe("can");
  });

  it("skips an admin-owned match entirely (no update, no duplicate insert)", () => {
    const m = fixture({ finalizedSource: "admin" });
    const { updates, inserts } = matchFixtures([feed({})], [m], known);
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it("reports an unresolvable tla as unmatched and does not fill that slot", () => {
    const { updates, unmatched } = matchFixtures([feed({ homeTla: "ZZZ" })], [fixture({})], known);
    expect(unmatched).toContain("round32:ZZZ");
    expect(updates[0].homeTeamId).toBeNull();
    expect(updates[0].awayTeamId).toBe("can");
  });

  it("reports an ambiguous bootstrap (two fixtures, same stage+instant) as unmatched", () => {
    const a = fixture({ id: "m1" });
    const b = fixture({ id: "m2" });
    const { updates, unmatched } = matchFixtures([feed({})], [a, b], known);
    expect(updates).toHaveLength(0);
    expect(unmatched.some((u) => u.includes("ambiguous"))).toBe(true);
  });
});

describe("matchFixtures — inserts for fixtures we don't have", () => {
  it("inserts a feed knockout match with no existing fixture, with teams filled", () => {
    const { updates, inserts } = matchFixtures([feed({ feedId: 537417 })], [], known);
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      matchNo: 73, stage: "round32", feedId: 537417,
      homeTeamId: "rsa", awayTeamId: "can", kickoffUtc: "2026-06-28T19:00:00Z", finalize: false,
    });
  });

  it("assigns canonical match numbers per stage, ordered by kickoff", () => {
    const r32a = feed({ feedId: 1, stage: "round32", utcDate: "2026-06-28T19:00:00Z" });
    const r32b = feed({ feedId: 2, stage: "round32", utcDate: "2026-06-29T17:00:00Z", homeTla: "BRA", awayTla: "JPN" });
    const r16 = feed({ feedId: 3, stage: "round16", utcDate: "2026-07-04T17:00:00Z", homeTla: null, awayTla: null });
    const fin = feed({ feedId: 4, stage: "final", utcDate: "2026-07-19T19:00:00Z", homeTla: null, awayTla: null });
    // intentionally out of order to prove sorting
    const { inserts } = matchFixtures([fin, r32b, r16, r32a], [], known);
    const byFeed = Object.fromEntries(inserts.map((i) => [i.feedId, i.matchNo]));
    expect(byFeed).toEqual({ 1: 73, 2: 74, 3: 89, 4: 104 });
  });

  it("inserts a TBD match with null teams without dropping it", () => {
    const f = feed({ feedId: 9, homeTla: null, awayTla: null });
    const { inserts } = matchFixtures([f], [], known);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ matchNo: 73, homeTeamId: null, awayTeamId: null });
  });

  it("updates the existing fixture and inserts only the rest", () => {
    const existing = fixture({ id: "m1", feedMatchId: "1", stage: "round32", kickoffUtc: "2026-06-28T19:00:00Z" });
    const matched = feed({ feedId: 1, stage: "round32", utcDate: "2026-06-28T19:00:00Z" });
    const fresh = feed({ feedId: 2, stage: "round32", utcDate: "2026-06-29T17:00:00Z", homeTla: "BRA", awayTla: "JPN" });
    const { updates, inserts } = matchFixtures([matched, fresh], [existing], known);
    expect(updates.map((u) => u.matchId)).toEqual(["m1"]);
    expect(inserts.map((i) => i.feedId)).toEqual([2]);
    expect(inserts[0].matchNo).toBe(74); // positional within round32, second by kickoff
  });
});
