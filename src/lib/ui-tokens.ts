import type { Match, MatchLifecycleStatus, Prediction, Profile } from "./types";
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

export function getLeaderboard(predictions: Prediction[], profiles: Profile[]) {
  const rows = profiles
    .filter((profile) => profile.approved)
    .map((user) => {
      const userPredictions = predictions.filter((prediction) => prediction.userId === user.id);
      return {
        user,
        points: userPredictions.reduce((total, prediction) => total + (prediction.points ?? 0), 0),
        exactHits: userPredictions.filter((prediction) => prediction.exactHit).length,
        outcomeHits: userPredictions.filter((prediction) => prediction.outcomeHit).length,
        firstUpdatedAt: userPredictions[0]?.updatedAt ?? "9999",
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
