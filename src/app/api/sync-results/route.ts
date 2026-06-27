import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { mapGroup, mapMatch } from "@/lib/supabase-data";
import { fetchStandings, fetchKnockoutMatches } from "@/lib/sync/football-data";
import { ingestStandings } from "@/lib/sync/ingest";
import { ingestMatches } from "@/lib/sync/ingest-matches";
import { matchStandings } from "@/lib/sync/match-standings";
import { matchFixtures } from "@/lib/sync/match-fixtures";
import { recalcGroupPredictions } from "@/lib/sync/recalc";
import { recalcMatchPredictions } from "@/lib/sync/recalc-matches";
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

  // ---- Knockout matches path (orthogonal to standings; touches only `matches`) ----
  let knockoutFeed;
  try {
    knockoutFeed = await fetchKnockoutMatches(token);
  } catch (error) {
    console.error(`${LOG} matches feed fetch failed:`, error);
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }

  const matchesResult = await supabase.from("matches").select("*");
  if (matchesResult.error) {
    console.error(`${LOG} reading matches failed:`, matchesResult.error.message);
    return NextResponse.json({ error: matchesResult.error.message }, { status: 500 });
  }
  const knockoutMatches = (matchesResult.data ?? [])
    .map(mapMatch)
    .filter((m) => m.stage !== "groups");

  const matchMatch = matchFixtures(knockoutFeed, knockoutMatches, knownIds);
  if (matchMatch.unmatched.length > 0) {
    console.warn(`${LOG} unmatched knockout entries:`, matchMatch.unmatched);
  }

  const matchIngest = await ingestMatches(db, { updates: matchMatch.updates, inserts: matchMatch.inserts });
  if (!matchIngest.ok) {
    console.error(`${LOG} match ingest failed:`, matchIngest.message);
    return NextResponse.json({ error: matchIngest.message }, { status: 500 });
  }

  // Apply the freshly-written state onto the read matches so recalc scores
  // against current scores/status (mirrors writtenGroups above). Only existing
  // fixtures (updates) can carry predictions; inserts are brand-new, no recalc.
  const writtenMatches = knockoutMatches
    .filter((m) => matchMatch.updates.some((r) => r.matchId === m.id))
    .map((m) => {
      const r = matchMatch.updates.find((res) => res.matchId === m.id)!;
      return {
        ...m,
        homeTeamId: r.homeTeamId ?? m.homeTeamId,
        awayTeamId: r.awayTeamId ?? m.awayTeamId,
        homeScore: r.finalize ? r.homeScore : m.homeScore,
        awayScore: r.finalize ? r.awayScore : m.awayScore,
        winnerTeamId: r.finalize ? r.winnerTeamId : m.winnerTeamId,
        status: r.finalize ? ("finalized" as const) : m.status,
      };
    });
  const matchRecalc = await recalcMatchPredictions(db, writtenMatches);
  if (!matchRecalc.ok) {
    console.error(`${LOG} match recalc failed:`, matchRecalc.message);
    return NextResponse.json({ error: matchRecalc.message }, { status: 500 });
  }

  console.log(
    `${LOG} ok — provisional=${ingest.provisional} finalized=${ingest.finalized} ` +
      `predictionsUpdated=${recalc.updated} unmatched=${unmatched.length} ` +
      `matchesInserted=${matchIngest.inserted} matchesFilled=${matchIngest.filled} matchesFinalized=${matchIngest.finalized} ` +
      `matchPredictionsUpdated=${matchRecalc.updated} matchUnmatched=${matchMatch.unmatched.length}`,
  );
  return NextResponse.json({
    ok: true,
    groups: { provisional: ingest.provisional, finalized: ingest.finalized },
    predictionsUpdated: recalc.updated,
    unmatched,
    matches: { inserted: matchIngest.inserted, filled: matchIngest.filled, finalized: matchIngest.finalized },
    matchPredictionsUpdated: matchRecalc.updated,
    matchUnmatched: matchMatch.unmatched,
  });
}
