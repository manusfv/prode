"use client";

import { createContext, useContext } from "react";
import type { createMatchAction, saveGroupStandingsAction, updateMatchTeamsAction } from "@/app/actions";
import type {
  Group,
  GroupPrediction,
  Match,
  Prediction,
  Profile,
  Stage,
  StageFlag,
  StageState,
  StageVisibility,
  Team,
} from "@/lib/types";

export type CreateMatchActionInput = Parameters<typeof createMatchAction>[0];
export type UpdateMatchTeamsInput = Parameters<typeof updateMatchTeamsAction>[0];
export type SaveGroupStandingsInput = Parameters<typeof saveGroupStandingsAction>[0];
export type SaveState = "saving" | "saved" | "error";

export type AppContextValue = {
  currentUser: Profile;
  teams: Team[];
  profiles: Profile[];
  stages: StageState[];
  matches: Match[];
  predictions: Prediction[];
  groups: Group[];
  groupPredictions: GroupPrediction[];
  now: Date;
  isAdmin: boolean;
  saveState: SaveState;
  dataMessage: string;
  openStages: Set<Stage>;
  editableStages: Set<Stage>;
  resultsStages: Set<Stage>;
  standingsStages: Set<Stage>;
  updatePrediction: (match: Match, patch: Partial<Prediction>) => void;
  updateGroupPrediction: (groupLabel: string, order: (string | null)[]) => void;
  openPredictionDrawer: (match: Match) => void;
  refreshSupabaseData: () => Promise<void> | void;
  signOut: () => Promise<void> | void;
  finalizeMatch: (match: Match) => Promise<void> | void;
  saveGroupStandings: (input: SaveGroupStandingsInput) => Promise<void> | void;
  updateGroupLocksAt: (groupLabel: string, locksAt: string | null) => Promise<void> | void;
  createMatch: (input: CreateMatchActionInput) => Promise<void> | void;
  updateMatchTeams: (input: UpdateMatchTeamsInput) => Promise<void> | void;
  deleteMatch: (matchId: string) => Promise<void> | void;
  updateStageFlag: (stage: Stage, flag: StageFlag, value: StageVisibility) => Promise<void> | void;
  approveProfile: (profileId: string) => Promise<void> | void;
  importMatchesCsv: (file: File | null) => Promise<void> | void;
  exportMatchesCsv: () => void;
  recalculatePoints: () => Promise<void> | void;
};

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside <AppShell>");
  return value;
}
