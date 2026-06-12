import type {
  Group, GroupPrediction, Match, Prediction, Profile, Stage, Team,
} from "./types";
import { getGroupStatus, getMatchStatus } from "./tournament";

export type ChartKind = "bar" | "histogram" | "line" | "heatmap" | "matrix" | "matchSplit";
export type FactCategory = "optimismo" | "manada" | "punteria" | "fidelidad" | "comportamiento";

export type FactId =
  | "optimista" | "candado" | "scoreline-favorito" | "sin-empates"
  | "rebelde" | "del-monton" | "partido-dividido" | "palpito-solitario"
  | "francotirador" | "racha" | "trampa"
  | "favorito-familia" | "oveja-negra" | "equipo-cabecera"
  | "madrugador" | "ultimo-minuto" | "indeciso";

export type PersonValue = {
  user: Profile;
  value: number;        // numeric, for sorting and plotting
  displayValue: string; // human label shown in chart/table
};

export type Fact = {
  id: FactId;
  category: FactCategory;
  title: string;
  emoji: string;
  blurb: string;
  requires: "predictions" | "results";
  available: boolean;
  unavailableHint?: string;
  chartKind: ChartKind;
  winner?: PersonValue;
  coWinners: PersonValue[]; // [] unless tie
  series: PersonValue[];    // per-person data (empty when unavailable)
  unitSuffix?: string;
};

export type StatsInput = {
  profiles: Profile[];
  predictions: Prediction[];
  groupPredictions: GroupPrediction[];
  matches: Match[];
  groups: Group[];
  teams: Team[];
  currentUserId: string;
  standingsStages: Set<Stage>;
  now: Date;
};

export function revealedMatchIds(matches: Match[], now: Date): Set<string> {
  return new Set(
    matches.filter((m) => getMatchStatus(m, now) !== "open").map((m) => m.id),
  );
}

export function finalizedMatchIds(matches: Match[], now: Date): Set<string> {
  return new Set(
    matches.filter((m) => getMatchStatus(m, now) === "finalized").map((m) => m.id),
  );
}

export function revealedGroupLabels(groups: Group[], now: Date): Set<string> {
  return new Set(
    groups.filter((g) => getGroupStatus(g, now) !== "open").map((g) => g.groupLabel),
  );
}

export const approvedProfiles = (profiles: Profile[]) =>
  profiles.filter((p) => p.approved);
