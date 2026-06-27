import { describe, expect, it } from "vitest";
import { ingestMatches } from "./ingest-matches";
import type { MatchInsert, MatchResult } from "./types";

type Write = { op: "update" | "insert"; table: string; values: Record<string, unknown>; id?: string };

function fakeDb(writes: Write[], error: string | null = null) {
  const fail = () => Promise.resolve({ error: error ? { message: error } : null });
  return {
    from(table: string) {
      return {
        update(values: Record<string, unknown>) {
          return {
            eq(_col: string, id: string) {
              writes.push({ op: "update", table, values, id });
              return fail();
            },
          };
        },
        insert(values: Record<string, unknown>) {
          writes.push({ op: "insert", table, values });
          return fail();
        },
        select() { return { in() { return Promise.resolve({ data: [], error: null }); } }; },
      };
    },
  };
}

function update(over: Partial<MatchResult>): MatchResult {
  return {
    matchId: "m1", feedId: 7, homeTeamId: "rsa", awayTeamId: "can",
    kickoffUtc: "2026-06-28T19:00:00Z", homeScore: null, awayScore: null,
    winnerTeamId: null, finalize: false, ...over,
  };
}

function insert(over: Partial<MatchInsert>): MatchInsert {
  return {
    matchNo: 89, stage: "round16", feedId: 537376, homeTeamId: null, awayTeamId: null,
    kickoffUtc: "2026-07-04T17:00:00Z", homeScore: null, awayScore: null,
    winnerTeamId: null, finalize: false, ...over,
  };
}

describe("ingestMatches", () => {
  it("fills teams + feed id + kickoff without finalizing for a scheduled match", async () => {
    const writes: Write[] = [];
    const res = await ingestMatches(fakeDb(writes) as never, { updates: [update({})], inserts: [] });
    expect(res).toEqual({ ok: true, inserted: 0, filled: 1, finalized: 0 });
    expect(writes[0]).toMatchObject({ op: "update", id: "m1" });
    expect(writes[0].values).toMatchObject({
      feed_match_id: "7", home_team_id: "rsa", away_team_id: "can",
      kickoff_utc: "2026-06-28T19:00:00Z",
    });
    expect(writes[0].values).not.toHaveProperty("status");
  });

  it("writes scores, winner, and finalize stamps for a finished match", async () => {
    const writes: Write[] = [];
    const res = await ingestMatches(fakeDb(writes) as never, {
      updates: [update({ finalize: true, homeScore: 2, awayScore: 1, winnerTeamId: "rsa" })],
      inserts: [],
    });
    expect(res).toEqual({ ok: true, inserted: 0, filled: 0, finalized: 1 });
    expect(writes[0].values).toMatchObject({
      home_score: 2, away_score: 1, winner_team_id: "rsa",
      status: "finalized", finalized_source: "auto", finalized_by: null,
    });
  });

  it("does not blank a slot when the feed team is still null", async () => {
    const writes: Write[] = [];
    await ingestMatches(fakeDb(writes) as never, { updates: [update({ awayTeamId: null })], inserts: [] });
    expect(writes[0].values).toHaveProperty("home_team_id", "rsa");
    expect(writes[0].values).not.toHaveProperty("away_team_id");
  });

  it("inserts a new fixture with match_no, stage, feed id, status open", async () => {
    const writes: Write[] = [];
    const res = await ingestMatches(fakeDb(writes) as never, { updates: [], inserts: [insert({})] });
    expect(res).toEqual({ ok: true, inserted: 1, filled: 0, finalized: 0 });
    expect(writes[0]).toMatchObject({ op: "insert", table: "matches" });
    expect(writes[0].values).toMatchObject({
      match_no: 89, stage: "round16", feed_match_id: "537376",
      kickoff_utc: "2026-07-04T17:00:00Z", status: "open",
      home_team_id: null, away_team_id: null,
    });
  });

  it("inserts an already-finished fixture finalized", async () => {
    const writes: Write[] = [];
    const res = await ingestMatches(fakeDb(writes) as never, {
      updates: [],
      inserts: [insert({ homeTeamId: "rsa", awayTeamId: "can", finalize: true, homeScore: 3, awayScore: 0, winnerTeamId: "rsa" })],
    });
    expect(res).toEqual({ ok: true, inserted: 1, filled: 0, finalized: 1 });
    expect(writes[0].values).toMatchObject({
      status: "finalized", home_score: 3, away_score: 0, winner_team_id: "rsa",
      finalized_source: "auto", finalized_by: null,
    });
  });

  it("returns the error message when a write fails", async () => {
    const writes: Write[] = [];
    const res = await ingestMatches(fakeDb(writes, "boom") as never, { updates: [update({})], inserts: [] });
    expect(res).toEqual({ ok: false, message: "boom" });
  });
});
