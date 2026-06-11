import type { GroupPrediction, Match, Prediction, Profile, Stage } from "./types";

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

  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

export type LeaderboardRow = ReturnType<typeof buildLeaderboard>[number];

function stageByMatchId(matches: Match[]): Map<string, Stage> {
  return new Map(matches.map((match) => [match.id, match.stage]));
}

/** Accumulated leaderboard over the revealed (standings_open) stages only. */
export function getLeaderboard({
  predictions,
  profiles,
  groupPredictions,
  matches,
  standingsStages,
}: {
  predictions: Prediction[];
  profiles: Profile[];
  groupPredictions: GroupPrediction[];
  matches: Match[];
  standingsStages: Set<Stage>;
}): LeaderboardRow[] {
  const byMatch = stageByMatchId(matches);
  const predSubset = predictions.filter((prediction) => {
    const stage = byMatch.get(prediction.matchId);
    return stage ? standingsStages.has(stage) : false;
  });
  const groupSubset = standingsStages.has("groups") ? groupPredictions : [];
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
  }: {
    predictions: Prediction[];
    profiles: Profile[];
    groupPredictions: GroupPrediction[];
    matches: Match[];
  },
): LeaderboardRow[] {
  if (stage === "groups") {
    return buildLeaderboard({ profiles, predictions: [], groupPredictions });
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
