import { describe, expect, it } from "vitest";
import { matchesToCsv, parseMatchCsv } from "./csv";
import type { Match } from "./types";

describe("parseMatchCsv", () => {
  it("parses exported match rows with quoted commas", () => {
    const rows = parseMatchCsv(
      [
        "match_no,stage,group_label,home_team_id,away_team_id,home_seed,away_seed,kickoff_utc,venue,city,status,home_score,away_score,winner_team_id",
        '1,groups,A,arg,mex,,,2026-06-11T19:00:00.000Z,Estadio Azteca,"Dallas (Arlington, Texas)",finalized,2,1,',
      ].join("\n"),
    );

    expect(rows).toEqual([
      {
        matchNo: 1,
        stage: "groups",
        groupLabel: "A",
        homeTeamId: "arg",
        awayTeamId: "mex",
        homeSeed: null,
        awaySeed: null,
        kickoffUtc: "2026-06-11T19:00:00.000Z",
        venue: "Estadio Azteca",
        city: "Dallas (Arlington, Texas)",
        status: "finalized",
        homeScore: 2,
        awayScore: 1,
        winnerTeamId: null,
      },
    ]);
  });

  it("rejects invalid match stages", () => {
    expect(() => parseMatchCsv("match_no,stage,kickoff_utc\n1,bad,2026-06-11T19:00:00.000Z")).toThrow(
      "La etapa no es válida en la línea 2.",
    );
  });
});

describe("matchesToCsv", () => {
  it("exports match columns in match number order", () => {
    const matches: Match[] = [
      match({ id: "m2", matchNo: 2, city: "Dallas (Arlington, Texas)" }),
      match({ id: "m1", matchNo: 1, homeScore: 2, awayScore: 1, status: "finalized" }),
    ];

    expect(matchesToCsv(matches)).toBe(
      [
        "match_no,stage,group_label,home_team_id,away_team_id,home_seed,away_seed,kickoff_utc,venue,city,status,home_score,away_score,winner_team_id",
        "1,groups,A,arg,mex,,,2026-06-11T19:00:00.000Z,Estadio Azteca,Ciudad de Mexico,finalized,2,1,",
        '2,groups,A,arg,mex,,,2026-06-11T19:00:00.000Z,Estadio Azteca,"Dallas (Arlington, Texas)",open,,,',
        "",
      ].join("\n"),
    );
  });
});

function match(overrides: Partial<Match>): Match {
  return {
    id: "m1",
    matchNo: 1,
    stage: "groups",
    group: "A",
    homeTeamId: "arg",
    awayTeamId: "mex",
    kickoffUtc: "2026-06-11T19:00:00.000Z",
    venue: "Estadio Azteca",
    city: "Ciudad de Mexico",
    status: "open",
    homeScore: null,
    awayScore: null,
    winnerTeamId: null,
    finalizedAt: null,
    finalizedBy: null,
    updatedAt: null,
    updatedBy: null,
    finalizedSource: null,
    ...overrides,
  };
}
