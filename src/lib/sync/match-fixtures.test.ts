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

describe("matchFixtures", () => {
  it("bootstraps by stage + kickoff instant and adopts the feed id, filling teams", () => {
    const { results } = matchFixtures([feed({ feedId: 99 })], [fixture({})], known);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      matchId: "m1", feedId: 99, homeTeamId: "rsa", awayTeamId: "can", finalize: false,
    });
  });

  it("matches by stored feed id once bootstrapped (ignoring instant)", () => {
    const f = feed({ feedId: 42, utcDate: "2026-06-28T21:30:00Z" }); // time shifted
    const m = fixture({ feedMatchId: "42", kickoffUtc: "2026-06-28T19:00:00Z" });
    const { results } = matchFixtures([f], [m], known);
    expect(results[0].feedId).toBe(42);
    expect(results[0].kickoffUtc).toBe("2026-06-28T21:30:00Z"); // refreshed from feed
  });

  it("leaves a TBD opponent slot null", () => {
    const { results } = matchFixtures([feed({ awayTla: null })], [fixture({})], known);
    expect(results[0].homeTeamId).toBe("rsa");
    expect(results[0].awayTeamId).toBeNull();
  });

  it("finalizes a finished match with winner mapped to a team id", () => {
    const f = feed({ status: "FINISHED", homeScore: 2, awayScore: 1, winner: "HOME_TEAM" });
    const { results } = matchFixtures([f], [fixture({})], known);
    expect(results[0]).toMatchObject({
      finalize: true, homeScore: 2, awayScore: 1, winnerTeamId: "rsa",
    });
  });

  it("maps a penalty/draw winner (90' draw, advancer in winner)", () => {
    const f = feed({ status: "FINISHED", homeScore: 1, awayScore: 1, winner: "AWAY_TEAM" });
    const { results } = matchFixtures([f], [fixture({})], known);
    expect(results[0].winnerTeamId).toBe("can");
  });

  it("skips admin-owned matches entirely", () => {
    const m = fixture({ finalizedSource: "admin" });
    const { results } = matchFixtures([feed({})], [m], known);
    expect(results).toHaveLength(0);
  });

  it("reports an unresolvable tla as unmatched and does not fill that slot", () => {
    const { results, unmatched } = matchFixtures([feed({ homeTla: "ZZZ" })], [fixture({})], known);
    expect(unmatched).toContain("round32:ZZZ");
    expect(results[0].homeTeamId).toBeNull();
    expect(results[0].awayTeamId).toBe("can");
  });

  it("reports an ambiguous bootstrap (two feed matches, same stage+instant) as unmatched", () => {
    const a = feed({ feedId: 1 });
    const b = feed({ feedId: 2 });
    const { results, unmatched } = matchFixtures([a, b], [fixture({})], known);
    expect(results).toHaveLength(0);
    expect(unmatched.some((u) => u.includes("m1"))).toBe(true);
  });
});
