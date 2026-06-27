import type { DbResult, MatchResult, SyncDb } from "./types";

type IngestResult =
  | { ok: true; filled: number; finalized: number }
  | { ok: false; message: string };

export async function ingestMatches(db: SyncDb, results: MatchResult[]): Promise<IngestResult> {
  const now = new Date().toISOString();
  let filled = 0;
  let finalized = 0;

  for (const r of results) {
    const values: Record<string, unknown> = {
      feed_match_id: String(r.feedId),
      kickoff_utc: r.kickoffUtc,
      updated_at: now,
    };
    // Never blank an existing team id with a still-undetermined feed slot.
    if (r.homeTeamId !== null) values.home_team_id = r.homeTeamId;
    if (r.awayTeamId !== null) values.away_team_id = r.awayTeamId;

    if (r.finalize) {
      values.home_score = r.homeScore;
      values.away_score = r.awayScore;
      values.winner_team_id = r.winnerTeamId;
      values.status = "finalized";
      values.finalized_at = now;
      values.finalized_source = "auto";
      values.finalized_by = null;
    }

    const write = (await db.from("matches").update(values).eq("id", r.matchId)) as DbResult;
    if (write.error) return { ok: false, message: write.error.message };
    if (r.finalize) finalized += 1;
    else filled += 1;
  }

  return { ok: true, filled, finalized };
}
