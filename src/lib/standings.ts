import type { Group, GroupPrediction, Match, Prediction, Profile, Stage } from "./types";
import { isGroupProvisional } from "./tournament";

type LeaderboardInput = {
  profiles: Profile[];
  predictions: Prediction[];
  groupPredictions: GroupPrediction[];
};

function buildLeaderboard({ profiles, predictions, groupPredictions }: LeaderboardInput) {
  const rows = profiles
    .filter((profile) => profile.approved)
    .map((user) => {
      const userPredictions = predictions.filter((prediction) => prediction.userId === user.id);
      const userGroupPredictions = groupPredictions.filter((prediction) => prediction.userId === user.id);
      const matchPoints = userPredictions.reduce((total, prediction) => total + (prediction.points ?? 0), 0);
      const groupPoints = userGroupPredictions.reduce((total, prediction) => total + (prediction.points ?? 0), 0);
      const groupExactPositions = userGroupPredictions.reduce((total, prediction) => total + prediction.exactPositions, 0);
      const updatedAts = [
        ...userPredictions.map((prediction) => prediction.updatedAt),
        ...userGroupPredictions.map((prediction) => prediction.updatedAt),
      ].sort();
      return {
        user,
        points: matchPoints + groupPoints,
        exactHits: userPredictions.filter((prediction) => prediction.exactHit).length + groupExactPositions,
        outcomeHits: userPredictions.filter((prediction) => prediction.outcomeHit).length,
        firstUpdatedAt: updatedAts[0] ?? "9999",
        rank: 0,
      };
    })
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.exactHits !== a.exactHits) return b.exactHits - a.exactHits;
      if (b.outcomeHits !== a.outcomeHits) return b.outcomeHits - a.outcomeHits;
      if (a.firstUpdatedAt !== b.firstUpdatedAt) return a.firstUpdatedAt.localeCompare(b.firstUpdatedAt);
      return a.user.displayName.localeCompare(b.user.displayName);
    });

  // Standard competition ranking ("1, 1, 3"): rows tied on the visible merit
  // columns (points, exact hits, outcome hits) share a position; the next
  // distinct row jumps past the tie. The remaining sort keys (firstUpdatedAt,
  // name) only stabilise ordering and don't break a tie.
  let lastRank = 0;
  return rows.map((row, index) => {
    const prev = index > 0 ? rows[index - 1]! : null;
    const tiedWithPrev =
      prev !== null &&
      prev.points === row.points &&
      prev.exactHits === row.exactHits &&
      prev.outcomeHits === row.outcomeHits;
    lastRank = tiedWithPrev ? lastRank : index + 1;
    return { ...row, rank: lastRank };
  });
}

export type LeaderboardRow = ReturnType<typeof buildLeaderboard>[number];

function stageByMatchId(matches: Match[]): Map<string, Stage> {
  return new Map(matches.map((match) => [match.id, match.stage]));
}

/** Keep group predictions whose group counts toward the total: finalized groups
 *  always; provisional groups only when previewing ("if the groups ended today"). */
function filterGroupPredictions(
  groupPredictions: GroupPrediction[],
  groups: Group[],
  includeProvisional: boolean,
): GroupPrediction[] {
  if (includeProvisional) return groupPredictions;
  const provisionalLabels = new Set(
    groups.filter(isGroupProvisional).map((group) => group.groupLabel),
  );
  return groupPredictions.filter((prediction) => !provisionalLabels.has(prediction.groupLabel));
}

/** Accumulated leaderboard over the revealed (standings_open) stages only.
 *  Provisional group points count only when includeProvisional is set. */
export function getLeaderboard({
  predictions,
  profiles,
  groupPredictions,
  matches,
  groups,
  standingsStages,
  includeProvisional = false,
}: {
  predictions: Prediction[];
  profiles: Profile[];
  groupPredictions: GroupPrediction[];
  matches: Match[];
  groups: Group[];
  standingsStages: Set<Stage>;
  includeProvisional?: boolean;
}): LeaderboardRow[] {
  const byMatch = stageByMatchId(matches);
  const predSubset = predictions.filter((prediction) => {
    const stage = byMatch.get(prediction.matchId);
    return stage ? standingsStages.has(stage) : false;
  });
  const groupSubset = standingsStages.has("groups")
    ? filterGroupPredictions(groupPredictions, groups, includeProvisional)
    : [];
  return buildLeaderboard({ profiles, predictions: predSubset, groupPredictions: groupSubset });
}

/** Leaderboard of points earned in a single stage. */
export function getStageLeaderboard(
  stage: Stage,
  {
    predictions,
    profiles,
    groupPredictions,
    matches,
    groups,
    includeProvisional = false,
  }: {
    predictions: Prediction[];
    profiles: Profile[];
    groupPredictions: GroupPrediction[];
    matches: Match[];
    groups: Group[];
    includeProvisional?: boolean;
  },
): LeaderboardRow[] {
  if (stage === "groups") {
    const groupSubset = filterGroupPredictions(groupPredictions, groups, includeProvisional);
    return buildLeaderboard({ profiles, predictions: [], groupPredictions: groupSubset });
  }
  const byMatch = stageByMatchId(matches);
  const predSubset = predictions.filter((prediction) => byMatch.get(prediction.matchId) === stage);
  return buildLeaderboard({ profiles, predictions: predSubset, groupPredictions: [] });
}

/** Up to two initials from a display name, uppercased. Falls back to "?" when blank. */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

/**
 * Visual left-to-right order for a podium: second, first, third (so first place
 * sits in the raised center). Arrays with fewer than three entries are unchanged.
 */
export function podiumOrder<T>(rows: T[]): T[] {
  if (rows.length === 3) return [rows[1]!, rows[0]!, rows[2]!];
  return rows;
}
