import { describe, expect, it } from "vitest";
import { recalcMatchPredictions } from "./recalc-matches";
import type { Match } from "../types";

type Update = { id: string; values: Record<string, unknown> };

function baseMatch(over: Partial<Match>): Match {
  return {
    id: "m1", matchNo: 73, stage: "round32", homeTeamId: "rsa", awayTeamId: "can",
    kickoffUtc: "2026-06-28T19:00:00Z", homeScore: 2, awayScore: 1, winnerTeamId: "rsa",
    finalizedAt: null, finalizedBy: null, updatedAt: null, updatedBy: null,
    finalizedSource: "auto", feedMatchId: "7", status: "finalized", ...over,
  };
}

// One stored prediction row (snake_case as Supabase returns it).
const predictionRows = [
  { id: "p1", user_id: "u1", match_id: "m1", home_score: 2, away_score: 1,
    winner_team_id: "rsa", points: null, exact_hit: false, outcome_hit: false,
    created_at: "x", updated_at: "x" },
];

function fakeDb(updates: Update[]) {
  return {
    from() {
      return {
        select() {
          return { in() { return Promise.resolve({ data: predictionRows, error: null }); } };
        },
        update(values: Record<string, unknown>) {
          return { eq(_c: string, id: string) { updates.push({ id, values }); return Promise.resolve({ error: null }); } };
        },
      };
    },
  };
}

describe("recalcMatchPredictions", () => {
  it("scores predictions on a finalized match", async () => {
    const updates: Update[] = [];
    const res = await recalcMatchPredictions(fakeDb(updates) as never, [baseMatch({})]);
    expect(res).toEqual({ ok: true, updated: 1 });
    // Exact 2-1 hit on round32 = 25 points (per scorePrediction / STAGE_POINTS).
    expect(updates[0].values).toMatchObject({ points: 25, exact_hit: true, outcome_hit: true });
  });

  it("nulls points when the match is not finalized", async () => {
    const updates: Update[] = [];
    await recalcMatchPredictions(fakeDb(updates) as never, [baseMatch({ status: "open" })]);
    expect(updates[0].values).toMatchObject({ points: null, exact_hit: false, outcome_hit: false });
  });

  it("no-ops on empty input", async () => {
    const res = await recalcMatchPredictions(fakeDb([]) as never, []);
    expect(res).toEqual({ ok: true, updated: 0 });
  });
});
