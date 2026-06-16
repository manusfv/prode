import type { DbResult, SyncDb } from "./types";
import type { GroupStandingResult } from "./types";

type IngestResult =
  | { ok: true; provisional: number; finalized: number }
  | { ok: false; message: string };

export async function ingestStandings(db: SyncDb, results: GroupStandingResult[]): Promise<IngestResult> {
  const now = new Date().toISOString();
  let provisional = 0;
  let finalized = 0;

  for (const r of results) {
    const write = (await db
      .from("groups")
      .update({
        first_team_id: r.firstTeamId,
        second_team_id: r.secondTeamId,
        third_team_id: r.thirdTeamId,
        fourth_team_id: r.fourthTeamId,
        result_source: "auto",
        result_finalized_at: r.complete ? now : null,
        result_finalized_by: null,
        updated_at: now,
      })
      .eq("group_label", r.groupLabel)) as DbResult;
    if (write.error) return { ok: false, message: write.error.message };
    if (r.complete) finalized += 1; else provisional += 1;
  }

  return { ok: true, provisional, finalized };
}
