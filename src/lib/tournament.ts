import type { Group, GroupStatus, Match, MatchStatus, Stage, Team } from "./types";

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

export const isStage = (value: string): value is Stage => stageOrder.includes(value as Stage);

export type StageTabId = "groups" | "round32" | "round16" | "quarter" | "semi" | "finals";

/** Tab layer over `Stage`: the finals tab merges the 3er-puesto and final matches. */
export const stageTabs: { id: StageTabId; label: string; stages: Stage[] }[] = [
  { id: "groups", label: stageLabels.groups, stages: ["groups"] },
  { id: "round32", label: stageLabels.round32, stages: ["round32"] },
  { id: "round16", label: stageLabels.round16, stages: ["round16"] },
  { id: "quarter", label: stageLabels.quarter, stages: ["quarter"] },
  { id: "semi", label: stageLabels.semi, stages: ["semi"] },
  { id: "finals", label: "Final y 3er puesto", stages: ["third", "final"] },
];

const stageToTabMap: Record<Stage, StageTabId> = stageTabs.reduce((acc, tab) => {
  for (const stage of tab.stages) acc[stage] = tab.id;
  return acc;
}, {} as Record<Stage, StageTabId>);

export function stageToTab(stage: Stage): StageTabId {
  return stageToTabMap[stage];
}

export function tabStages(id: StageTabId): Stage[] {
  return stageTabs.find((tab) => tab.id === id)?.stages ?? [];
}

export function isStageTab(value: string): value is StageTabId {
  return stageTabs.some((tab) => tab.id === value);
}

/** Accepts a tab id or a legacy `Stage` value, returning the owning tab (or null). */
export function resolveStageTab(param: string | null): StageTabId | null {
  if (param === null) return null;
  if (isStageTab(param)) return param;
  if (isStage(param)) return stageToTab(param);
  return null;
}

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

export function getGroupStatus(group: Group, now = new Date()): GroupStatus {
  if (group.resultFinalizedAt) return "finalized";
  if (!group.locksAt) return "open";
  return new Date(group.locksAt).getTime() <= now.getTime() ? "locked" : "open";
}

export function hasGroupOrder(group: Group): boolean {
  return [group.firstTeamId, group.secondTeamId, group.thirdTeamId, group.fourthTeamId].every(Boolean);
}

export function isGroupProvisional(group: Group): boolean {
  return hasGroupOrder(group) && !group.resultFinalizedAt;
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
    hour12: false,
  }).format(new Date(isoDate)).replace(/\s+/g, " ");
}

export function formatRelativeTime(isoDate: string, now = new Date()) {
  const ms = now.getTime() - new Date(isoDate).getTime();
  // Future timestamps (clock skew) or stale data fall back to the absolute date.
  if (ms < 0) return formatKickoff(isoDate);

  const minutes = Math.floor(ms / 1000 / 60);
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;

  return formatKickoff(isoDate);
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

export function stepScore(value: number | null, delta: 1 | -1): number | null {
  if (delta === 1) return value === null ? 0 : value + 1;
  if (value === null || value === 0) return null;
  return value - 1;
}

