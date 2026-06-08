import type { Match, MatchStatus, PredictionDraft, Stage, Team } from "./types";

export const stageLabels: Record<Stage, string> = {
  groups: "Grupos",
  round32: "16avos",
  round16: "Octavos",
  quarter: "Cuartos",
  semi: "Semis",
  third: "3er puesto",
  final: "Final",
};

export const stageOrder: Stage[] = [
  "groups",
  "round32",
  "round16",
  "quarter",
  "semi",
  "third",
  "final",
];

export const appTimeZone = "America/Argentina/Buenos_Aires";

export function getMatchStatus(match: Match, now = new Date()): MatchStatus {
  if (match.status === "finalized") return "finalized";
  if (match.status === "live") return "locked";
  if (match.finalizedAt) return "finalized";

  const kickoffTime = new Date(match.kickoffUtc).getTime();
  const isPastKickoff = kickoffTime <= now.getTime();
  const wasManuallyReopened =
    match.status === "open" &&
    Boolean(match.updatedBy) &&
    Boolean(match.updatedAt) &&
    new Date(match.updatedAt as string).getTime() > kickoffTime;

  if (match.status === "open" && (!isPastKickoff || wasManuallyReopened)) return "open";
  return isPastKickoff ? "locked" : "open";
}

export function getTeamLabel(teamId: string | null, teams: Team[], seed?: string) {
  if (!teamId) return seed ?? "Por definir";
  return teams.find((team) => team.id === teamId)?.name ?? "Por definir";
}

export function getTeamFlag(teamId: string | null, teams: Team[]) {
  if (!teamId) return "TBD";
  return teams.find((team) => team.id === teamId)?.flag ?? "TBD";
}

export function formatKickoff(isoDate: string, locale = "es-AR") {
  return new Intl.DateTimeFormat(locale, {
    timeZone: appTimeZone,
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoDate)).replace(/\s+/g, " ");
}

export function getLockCopy(isoDate: string, now = new Date()) {
  const ms = new Date(isoDate).getTime() - now.getTime();
  if (ms <= 0) return "cerrado";

  const hours = Math.floor(ms / 1000 / 60 / 60);
  if (hours >= 24) return `cierra en ${Math.ceil(hours / 24)} d`;

  const minutes = Math.max(1, Math.floor(ms / 1000 / 60));
  if (hours > 0) return `cierra en ${hours} h`;
  return `cierra en ${minutes} min`;
}

export function needsAdvancer(match: Match, draft: PredictionDraft) {
  return (
    match.stage !== "groups" &&
    draft.homeScore !== null &&
    draft.awayScore !== null &&
    draft.homeScore === draft.awayScore &&
    Boolean(match.homeTeamId && match.awayTeamId)
  );
}

export function inferWinner(match: Match, draft: PredictionDraft) {
  if (draft.homeScore === null || draft.awayScore === null) return null;
  if (draft.homeScore > draft.awayScore) return match.homeTeamId;
  if (draft.awayScore > draft.homeScore) return match.awayTeamId;
  return draft.winnerTeamId;
}
