import type { Match } from "../types";
import { resolveTeamId } from "./tla";
import type { FeedMatch, MatchResult } from "./types";

const instant = (iso: string) => new Date(iso).getTime();

function findFeed(
  match: Match,
  feed: FeedMatch[],
  unmatched: string[],
): FeedMatch | null {
  if (match.feedMatchId) {
    return feed.find((f) => String(f.feedId) === match.feedMatchId) ?? null;
  }
  // Bootstrap: same stage + same kickoff instant must be unique.
  const candidates = feed.filter(
    (f) => f.stage === match.stage && instant(f.utcDate) === instant(match.kickoffUtc),
  );
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) unmatched.push(`${match.stage}:${match.id}:ambiguous`);
  return null;
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

export function matchFixtures(
  feed: FeedMatch[],
  matches: Match[],
  knownIds: Set<string>,
): { results: MatchResult[]; unmatched: string[] } {
  const results: MatchResult[] = [];
  const unmatched: string[] = [];

  for (const match of matches) {
    if (match.finalizedSource === "admin") continue; // ownership: never overwrite a human
    const f = findFeed(match, feed, unmatched);
    if (!f) continue;

    const homeTeamId = resolveSlot(f.homeTla, f.stage, knownIds, unmatched);
    const awayTeamId = resolveSlot(f.awayTla, f.stage, knownIds, unmatched);
    const finalize = f.status === "FINISHED" && f.homeScore !== null && f.awayScore !== null;
    const winnerTeamId =
      f.winner === "HOME_TEAM" ? homeTeamId : f.winner === "AWAY_TEAM" ? awayTeamId : null;

    results.push({
      matchId: match.id,
      feedId: f.feedId,
      homeTeamId,
      awayTeamId,
      kickoffUtc: f.utcDate,
      homeScore: finalize ? f.homeScore : null,
      awayScore: finalize ? f.awayScore : null,
      winnerTeamId: finalize ? winnerTeamId : null,
      finalize,
    });
  }

  return { results, unmatched };
}
