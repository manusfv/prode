import type { Match, Stage } from "../types";
import { resolveTeamId } from "./tla";
import type { FeedMatch, MatchInsert, MatchResult } from "./types";

const instant = (iso: string) => new Date(iso).getTime();

// Base match number for the first fixture of each knockout stage, mirroring the
// canonical World Cup 2026 numbering (groups are 1..72). Used only when the feed
// knows a fixture we don't have yet, so a created row gets a stable display #.
const STAGE_BASE: Partial<Record<Stage, number>> = {
  round32: 73,
  round16: 89,
  quarter: 97,
  semi: 101,
  third: 103,
  final: 104,
};
const KNOCKOUT_STAGES: Stage[] = ["round32", "round16", "quarter", "semi", "third", "final"];

/** Positional match number per feed id: base of its stage + its kickoff rank within the stage. */
function assignMatchNos(feed: FeedMatch[]): Map<number, number> {
  const byFeedId = new Map<number, number>();
  for (const stage of KNOCKOUT_STAGES) {
    const base = STAGE_BASE[stage];
    if (base === undefined) continue;
    feed
      .filter((f) => f.stage === stage)
      .sort((a, b) => instant(a.utcDate) - instant(b.utcDate) || a.feedId - b.feedId)
      .forEach((f, i) => byFeedId.set(f.feedId, base + i));
  }
  return byFeedId;
}

function resolveSlot(
  tla: string | null,
  stage: string,
  knownIds: Set<string>,
  unmatched: string[],
): string | null {
  if (tla === null) return null;
  const id = resolveTeamId(tla, knownIds);
  if (id === null) unmatched.push(`${stage}:${tla}`);
  return id;
}

/**
 * Joins the feed's knockout matches to our fixtures, driven by the feed (the
 * source of truth for the bracket). Each feed match either updates the fixture it
 * maps to — by stored feed id, else a unique stage + kickoff-instant bootstrap —
 * or, when we have no such fixture, becomes an insert so the bracket fills itself.
 */
export function matchFixtures(
  feed: FeedMatch[],
  matches: Match[],
  knownIds: Set<string>,
): { updates: MatchResult[]; inserts: MatchInsert[]; unmatched: string[] } {
  const updates: MatchResult[] = [];
  const inserts: MatchInsert[] = [];
  const unmatched: string[] = [];
  const matchNoByFeedId = assignMatchNos(feed);
  const claimed = new Set<string>();

  for (const f of feed) {
    let existing = matches.find((m) => m.feedMatchId !== null && m.feedMatchId === String(f.feedId));
    if (!existing) {
      // Bootstrap: a fixture without a feed id, same stage + same kickoff instant.
      const candidates = matches.filter(
        (m) =>
          !claimed.has(m.id) &&
          m.feedMatchId === null &&
          m.stage === f.stage &&
          instant(m.kickoffUtc) === instant(f.utcDate),
      );
      if (candidates.length === 1) existing = candidates[0];
      else if (candidates.length > 1) {
        unmatched.push(`${f.stage}:${f.feedId}:ambiguous`);
        continue;
      }
    }

    if (existing) {
      claimed.add(existing.id);
      if (existing.finalizedSource === "admin") continue; // ownership: never overwrite a human
    }

    const homeTeamId = resolveSlot(f.homeTla, f.stage, knownIds, unmatched);
    const awayTeamId = resolveSlot(f.awayTla, f.stage, knownIds, unmatched);
    const finalize = f.status === "FINISHED" && f.homeScore !== null && f.awayScore !== null;
    const winnerTeamId =
      f.winner === "HOME_TEAM" ? homeTeamId : f.winner === "AWAY_TEAM" ? awayTeamId : null;
    const scored = {
      homeTeamId,
      awayTeamId,
      kickoffUtc: f.utcDate,
      homeScore: finalize ? f.homeScore : null,
      awayScore: finalize ? f.awayScore : null,
      winnerTeamId: finalize ? winnerTeamId : null,
      finalize,
    };

    if (existing) {
      updates.push({ matchId: existing.id, feedId: f.feedId, ...scored });
    } else {
      const matchNo = matchNoByFeedId.get(f.feedId);
      if (matchNo === undefined) continue; // unknown stage has no base; skip rather than guess
      inserts.push({ matchNo, stage: f.stage, feedId: f.feedId, ...scored });
    }
  }

  return { updates, inserts, unmatched };
}
