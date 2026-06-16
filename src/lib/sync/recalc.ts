import { scoreGroupPredictionOrNull } from "../scoring";
import { mapGroupPrediction } from "../supabase-data";
import type { Group } from "../types";
import type { DbResult, SyncDb } from "./types";

type RecalcResult = { ok: true; updated: number } | { ok: false; message: string };

export async function recalcGroupPredictions(db: SyncDb, groups: Group[]): Promise<RecalcResult> {
  if (groups.length === 0) return { ok: true, updated: 0 };

  const read = (await db
    .from("group_predictions")
    .select("*")
    .in("group_label", groups.map((g) => g.groupLabel))) as DbResult;
  if (read.error) return { ok: false, message: read.error.message };

  const groupByLabel = new Map(groups.map((g) => [g.groupLabel, g]));
  const updatedAt = new Date().toISOString();
  const rows = (read.data as Parameters<typeof mapGroupPrediction>[0][]) ?? [];

  const writes = rows.map(async (row) => {
    const prediction = mapGroupPrediction(row);
    const group = groupByLabel.get(prediction.groupLabel);
    if (!group) return null;
    const score = scoreGroupPredictionOrNull(group, prediction);
    return db
      .from("group_predictions")
      .update({ points: score.points, exact_positions: score.exactPositions, updated_at: updatedAt })
      .eq("id", prediction.id);
  });

  const results = await Promise.all(writes);
  const failed = results.find((r): r is DbResult => r !== null && r.error !== null);
  if (failed) return { ok: false, message: failed.error!.message };
  return { ok: true, updated: results.filter((r) => r !== null).length };
}
