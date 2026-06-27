import { scorePrediction } from "../scoring";
import { mapPrediction } from "../supabase-data";
import type { Match } from "../types";
import type { DbResult, SyncDb } from "./types";

type RecalcResult = { ok: true; updated: number } | { ok: false; message: string };

export async function recalcMatchPredictions(db: SyncDb, matches: Match[]): Promise<RecalcResult> {
  if (matches.length === 0) return { ok: true, updated: 0 };

  const read = (await db
    .from("predictions")
    .select("*")
    .in("match_id", matches.map((m) => m.id))) as DbResult;
  if (read.error) return { ok: false, message: read.error.message };

  const matchById = new Map(matches.map((m) => [m.id, m]));
  const updatedAt = new Date().toISOString();
  const rows = (read.data as Parameters<typeof mapPrediction>[0][]) ?? [];

  const writes = rows.map(async (row) => {
    const prediction = mapPrediction(row);
    const match = matchById.get(prediction.matchId);
    if (!match) return null;
    const score =
      match.status === "finalized"
        ? scorePrediction(match, prediction)
        : { points: null, exactHit: false, outcomeHit: false };
    return await db
      .from("predictions")
      .update({
        points: score.points,
        exact_hit: score.exactHit,
        outcome_hit: score.outcomeHit,
        updated_at: updatedAt,
      })
      .eq("id", prediction.id);
  });

  const settled = await Promise.all(writes);
  const failed = settled.find((r): r is DbResult => r !== null && r.error !== null);
  if (failed) return { ok: false, message: failed.error!.message };
  return { ok: true, updated: settled.filter((r) => r !== null).length };
}
