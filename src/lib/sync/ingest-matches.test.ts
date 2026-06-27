import { describe, expect, it } from "vitest";
import { ingestMatches } from "./ingest-matches";
import type { MatchResult } from "./types";

type Write = { table: string; values: Record<string, unknown>; id: string };

function fakeDb(writes: Write[], error: string | null = null) {
  return {
    from(table: string) {
      return {
        update(values: Record<string, unknown>) {
          return {
            eq(_col: string, id: string) {
              writes.push({ table, values, id });
              return Promise.resolve({ error: error ? { message: error } : null });
            },
          };
        },
        select() { return { in() { return Promise.resolve({ data: [], error: null }); } }; },
      };
    },
  };
}

function result(over: Partial<MatchResult>): MatchResult {
  return {
    matchId: "m1", feedId: 7, homeTeamId: "rsa", awayTeamId: "can",
    kickoffUtc: "2026-06-28T19:00:00Z", homeScore: null, awayScore: null,
    winnerTeamId: null, finalize: false, ...over,
  };
}

describe("ingestMatches", () => {
  it("fills teams + feed id + kickoff without finalizing for a scheduled match", async () => {
    const writes: Write[] = [];
    const res = await ingestMatches(fakeDb(writes) as never, [result({})]);
    expect(res).toEqual({ ok: true, filled: 1, finalized: 0 });
    expect(writes[0].values).toMatchObject({
      feed_match_id: "7", home_team_id: "rsa", away_team_id: "can",
      kickoff_utc: "2026-06-28T19:00:00Z",
    });
    expect(writes[0].values).not.toHaveProperty("status");
  });

  it("writes scores, winner, and finalize stamps for a finished match", async () => {
    const writes: Write[] = [];
    const res = await ingestMatches(fakeDb(writes) as never, [
      result({ finalize: true, homeScore: 2, awayScore: 1, winnerTeamId: "rsa" }),
    ]);
    expect(res).toEqual({ ok: true, filled: 0, finalized: 1 });
    expect(writes[0].values).toMatchObject({
      home_score: 2, away_score: 1, winner_team_id: "rsa",
      status: "finalized", finalized_source: "auto", finalized_by: null,
    });
  });

  it("does not blank a slot when the feed team is still null", async () => {
    const writes: Write[] = [];
    await ingestMatches(fakeDb(writes) as never, [result({ awayTeamId: null })]);
    expect(writes[0].values).toHaveProperty("home_team_id", "rsa");
    expect(writes[0].values).not.toHaveProperty("away_team_id");
  });

  it("returns the error message when a write fails", async () => {
    const writes: Write[] = [];
    const res = await ingestMatches(fakeDb(writes, "boom") as never, [result({})]);
    expect(res).toEqual({ ok: false, message: "boom" });
  });
});
