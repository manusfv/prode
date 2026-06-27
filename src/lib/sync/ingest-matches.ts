import type { DbResult, MatchInsert, MatchResult, SyncDb } from "./types";

type IngestResult =
  | { ok: true; inserted: number; filled: number; finalized: number }
  | { ok: false; message: string };

/** Finalize-only columns, shared by the update and insert paths. */
function finalizeValues(r: { homeScore: number | null; awayScore: number | null; winnerTeamId: string | null }, now: string) {
  return {
    home_score: r.homeScore,
    away_score: r.awayScore,
    winner_team_id: r.winnerTeamId,
    status: "finalized" as const,
    finalized_at: now,
    finalized_source: "auto" as const,
    finalized_by: null,
  };
}

export async function ingestMatches(
  db: SyncDb,
  ops: { updates: MatchResult[]; inserts: MatchInsert[] },
): Promise<IngestResult> {
  const now = new Date().toISOString();
  let inserted = 0;
  let filled = 0;
  let finalized = 0;

  for (const r of ops.updates) {
    const values: Record<string, unknown> = {
      feed_match_id: String(r.feedId),
      kickoff_utc: r.kickoffUtc,
      updated_at: now,
    };
    // Never blank an existing team id with a still-undetermined feed slot.
    if (r.homeTeamId !== null) values.home_team_id = r.homeTeamId;
    if (r.awayTeamId !== null) values.away_team_id = r.awayTeamId;
    if (r.finalize) Object.assign(values, finalizeValues(r, now));

    const write = (await db.from("matches").update(values).eq("id", r.matchId)) as DbResult;
    if (write.error) return { ok: false, message: write.error.message };
    if (r.finalize) finalized += 1;
    else filled += 1;
  }

  for (const r of ops.inserts) {
    const values: Record<string, unknown> = {
      match_no: r.matchNo,
      stage: r.stage,
      feed_match_id: String(r.feedId),
      kickoff_utc: r.kickoffUtc,
      // A new fixture starts open; teams are set when the feed knows them (null otherwise).
      home_team_id: r.homeTeamId,
      away_team_id: r.awayTeamId,
      status: "open",
      updated_at: now,
    };
    if (r.finalize) Object.assign(values, finalizeValues(r, now));

    const write = (await db.from("matches").insert(values)) as DbResult;
    if (write.error) return { ok: false, message: write.error.message };
    inserted += 1;
    if (r.finalize) finalized += 1;
  }

  return { ok: true, inserted, filled, finalized };
}
