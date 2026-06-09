import type { GroupPrediction, Match, MatchLifecycleStatus, Prediction, Profile } from "./types";
import { getMatchStatus } from "./tournament";

export const ui = {
  panel: "rounded-lg border border-app-line bg-app-panel shadow-app-panel",
  panelPlain: "rounded-lg border border-app-line bg-app-panel",
  label: "text-xs font-black uppercase leading-none text-app-muted",
  controlValue: "text-sm font-black leading-none text-app-text",
  control: "h-9 gap-2 border-app-line bg-app-surface text-sm font-extrabold text-app-text hover:border-app-line-strong hover:bg-app-surface-2",
  row: "rounded-md bg-app-surface-2",
};

export function compareGroups(a?: string, b?: string) {
  return (a ?? "ZZ").localeCompare(b ?? "ZZ", "es", { numeric: true });
}

export function getAdminLifecycleStatus(match: Match, now: Date): MatchLifecycleStatus {
  if (match.status === "finalized" || match.status === "live") return match.status;
  const status = getMatchStatus(match, now);
  if (status === "finalized") return "finalized";
  if (status === "locked") return "live";
  return "open";
}

export function getLeaderboard(
  predictions: Prediction[],
  profiles: Profile[],
  groupPredictions: GroupPrediction[] = [],
) {
  const rows = profiles
    .filter((profile) => profile.approved)
    .map((user) => {
      const userPredictions = predictions.filter((prediction) => prediction.userId === user.id);
      const userGroupPredictions = groupPredictions.filter(
        (prediction) => prediction.userId === user.id,
      );
      const matchPoints = userPredictions.reduce(
        (total, prediction) => total + (prediction.points ?? 0),
        0,
      );
      const groupPoints = userGroupPredictions.reduce(
        (total, prediction) => total + (prediction.points ?? 0),
        0,
      );
      // A correctly placed group team counts as an exact hit for tiebreaks.
      const groupExactPositions = userGroupPredictions.reduce(
        (total, prediction) => total + prediction.exactPositions,
        0,
      );
      const updatedAts = [
        ...userPredictions.map((prediction) => prediction.updatedAt),
        ...userGroupPredictions.map((prediction) => prediction.updatedAt),
      ].sort();
      return {
        user,
        points: matchPoints + groupPoints,
        exactHits:
          userPredictions.filter((prediction) => prediction.exactHit).length + groupExactPositions,
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

export type LeaderboardRow = ReturnType<typeof getLeaderboard>[number];

export const tabRoutes = {
  predictions: "/pronosticos",
  leaderboard: "/tabla",
  results: "/resultados",
  rules: "/reglas",
  admin: "/admin",
} as const;

export type AppRoute = keyof typeof tabRoutes;

export const pageTitles: Record<AppRoute, string> = {
  predictions: "Pronósticos",
  leaderboard: "Tabla familiar",
  results: "Resultados",
  rules: "Reglas",
  admin: "Panel admin",
};
