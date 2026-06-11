import type { Match, MatchLifecycleStatus } from "./types";
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
