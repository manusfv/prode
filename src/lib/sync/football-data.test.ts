import { describe, expect, it } from "vitest";
import { parseStandings } from "./football-data";

const sample = {
  standings: [
    {
      stage: "GROUP_STAGE",
      type: "TOTAL",
      group: "Group A",
      table: [
        { position: 1, team: { tla: "MEX" }, playedGames: 3 },
        { position: 2, team: { tla: "KOR" }, playedGames: 3 },
        { position: 3, team: { tla: "CZE" }, playedGames: 3 },
        { position: 4, team: { tla: "RSA" }, playedGames: 3 },
      ],
    },
  ],
};

describe("parseStandings", () => {
  it("extracts group label, ordered TLAs, and played counts", () => {
    const [group] = parseStandings(sample);
    expect(group.groupLabel).toBe("A");
    expect(group.positions).toEqual(["MEX", "KOR", "CZE", "RSA"]);
    expect(group.playedByPosition).toEqual([3, 3, 3, 3]);
  });

  it("ignores non-TOTAL standing blocks", () => {
    const withHome = { standings: [{ type: "HOME", group: "Group A", table: [] }, ...sample.standings] };
    expect(parseStandings(withHome)).toHaveLength(1);
  });

  it("orders positions by the table's position field, not array order", () => {
    const shuffled = {
      standings: [
        {
          type: "TOTAL",
          group: "Group A",
          table: [
            { position: 3, team: { tla: "CZE" }, playedGames: 2 },
            { position: 1, team: { tla: "MEX" }, playedGames: 3 },
            { position: 4, team: { tla: "RSA" }, playedGames: 1 },
            { position: 2, team: { tla: "KOR" }, playedGames: 3 },
          ],
        },
      ],
    };
    const [group] = parseStandings(shuffled);
    expect(group.positions).toEqual(["MEX", "KOR", "CZE", "RSA"]);
    expect(group.playedByPosition).toEqual([3, 3, 2, 1]);
  });
});

import { mapFeedStage, parseKnockoutMatches } from "./football-data";

const matchesSample = {
  matches: [
    {
      id: 537001,
      utcDate: "2026-06-28T19:00:00Z",
      status: "FINISHED",
      stage: "LAST_32",
      homeTeam: { tla: "RSA" },
      awayTeam: { tla: "CAN" },
      score: { winner: "HOME_TEAM", fullTime: { home: 2, away: 1 } },
    },
    {
      id: 537002,
      utcDate: "2026-07-01T01:00:00Z",
      status: "SCHEDULED",
      stage: "LAST_32",
      homeTeam: { tla: "MEX" },
      awayTeam: { tla: null },
      score: { winner: null, fullTime: { home: null, away: null } },
    },
    {
      id: 537003,
      utcDate: "2026-06-20T18:00:00Z",
      status: "FINISHED",
      stage: "GROUP_STAGE",
      homeTeam: { tla: "BRA" },
      awayTeam: { tla: "JPN" },
      score: { winner: "AWAY_TEAM", fullTime: { home: 0, away: 1 } },
    },
  ],
};

describe("mapFeedStage", () => {
  it("maps every knockout enum to our Stage", () => {
    expect(mapFeedStage("LAST_32")).toBe("round32");
    expect(mapFeedStage("LAST_16")).toBe("round16");
    expect(mapFeedStage("QUARTER_FINALS")).toBe("quarter");
    expect(mapFeedStage("SEMI_FINALS")).toBe("semi");
    expect(mapFeedStage("THIRD_PLACE")).toBe("third");
    expect(mapFeedStage("FINAL")).toBe("final");
  });

  it("returns null for unknown / non-knockout stages", () => {
    expect(mapFeedStage("GROUP_STAGE")).toBeNull();
    expect(mapFeedStage("NONSENSE")).toBeNull();
  });
});

describe("parseKnockoutMatches", () => {
  it("normalizes knockout matches and drops non-knockout stages", () => {
    const result = parseKnockoutMatches(matchesSample);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      feedId: 537001,
      stage: "round32",
      utcDate: "2026-06-28T19:00:00Z",
      homeTla: "RSA",
      awayTla: "CAN",
      status: "FINISHED",
      homeScore: 2,
      awayScore: 1,
      winner: "HOME_TEAM",
    });
  });

  it("keeps a TBD opponent as null without dropping the match", () => {
    const result = parseKnockoutMatches(matchesSample);
    const scheduled = result.find((m) => m.feedId === 537002)!;
    expect(scheduled.homeTla).toBe("MEX");
    expect(scheduled.awayTla).toBeNull();
    expect(scheduled.status).toBe("SCHEDULED"); // parser carries status; finalize is computed later in the matcher
  });
});
