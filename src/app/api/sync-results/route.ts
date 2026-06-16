import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { mapGroup } from "@/lib/supabase-data";
import { fetchStandings } from "@/lib/sync/football-data";
import { ingestStandings } from "@/lib/sync/ingest";
import { matchStandings } from "@/lib/sync/match-standings";
import { recalcGroupPredictions } from "@/lib/sync/recalc";
import type { SyncDb } from "@/lib/sync/types";

export const dynamic = "force-dynamic";

// Greppable prefix for this job's lines in the Vercel function logs.
const LOG = "[sync-results]";

export async function GET(request: Request) {
  // Low-stakes cron gate, not a user-facing auth boundary; a plain compare is
  // fine here. A missing secret fails closed so an unconfigured deploy can't be
  // hit anonymously.
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    console.warn(`${LOG} unauthorized request (missing or incorrect bearer token)`);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    console.error(`${LOG} missing FOOTBALL_DATA_TOKEN`);
    return NextResponse.json({ error: "missing FOOTBALL_DATA_TOKEN" }, { status: 500 });
  }

  const supabase = createSupabaseServiceClient();
  if (!supabase) {
    console.error(`${LOG} supabase service client not configured`);
    return NextResponse.json({ error: "supabase not configured" }, { status: 500 });
  }
  // SyncDb is a structural subset of the real client; the cast avoids importing
  // the full generated DB types into the pure sync modules.
  const db = supabase as unknown as SyncDb;

  let feed;
  try {
    feed = await fetchStandings(token);
  } catch (error) {
    console.error(`${LOG} feed fetch failed:`, error);
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }

  const [groupsResult, teamsResult] = await Promise.all([
    supabase.from("groups").select("*"),
    supabase.from("teams").select("id"),
  ]);
  if (groupsResult.error) {
    console.error(`${LOG} reading groups failed:`, groupsResult.error.message);
    return NextResponse.json({ error: groupsResult.error.message }, { status: 500 });
  }
  if (teamsResult.error) {
    console.error(`${LOG} reading teams failed:`, teamsResult.error.message);
    return NextResponse.json({ error: teamsResult.error.message }, { status: 500 });
  }

  const groups = (groupsResult.data ?? []).map(mapGroup);
  const knownIds = new Set((teamsResult.data ?? []).map((t: { id: string }) => t.id));

  const { results, unmatched } = matchStandings(feed, groups, knownIds);
  if (unmatched.length > 0) {
    // A non-empty list means a feed TLA didn't map to any team — worth attention
    // (likely a new team id or a TLA needing a TLA_OVERRIDES entry).
    console.warn(`${LOG} unmatched standings entries:`, unmatched);
  }

  // ingest is idempotent: if recalc below fails after this succeeds, the next
  // cron run re-writes the same standings and recalcs again, self-healing.
  const ingest = await ingestStandings(db, results);
  if (!ingest.ok) {
    console.error(`${LOG} ingest failed:`, ingest.message);
    return NextResponse.json({ error: ingest.message }, { status: 500 });
  }

  // Override only the team positions with the freshly-written values so recalc
  // scores against the new standings. resultFinalizedAt/resultSource stay at
  // their pre-write values here, which is fine because recalc reads only the
  // team order — don't rely on those flags being current in writtenGroups.
  const writtenGroups = groups
    .filter((g) => results.some((r) => r.groupLabel === g.groupLabel))
    .map((g) => {
      // Safe: g was kept only if a result with its label exists (filter above).
      const r = results.find((res) => res.groupLabel === g.groupLabel)!;
      return { ...g, firstTeamId: r.firstTeamId, secondTeamId: r.secondTeamId, thirdTeamId: r.thirdTeamId, fourthTeamId: r.fourthTeamId };
    });
  const recalc = await recalcGroupPredictions(db, writtenGroups);
  if (!recalc.ok) {
    console.error(`${LOG} recalc failed:`, recalc.message);
    return NextResponse.json({ error: recalc.message }, { status: 500 });
  }

  console.log(
    `${LOG} ok — provisional=${ingest.provisional} finalized=${ingest.finalized} ` +
      `predictionsUpdated=${recalc.updated} unmatched=${unmatched.length}`,
  );
  return NextResponse.json({
    ok: true,
    groups: { provisional: ingest.provisional, finalized: ingest.finalized },
    predictionsUpdated: recalc.updated,
    unmatched,
  });
}
