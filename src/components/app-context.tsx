"use client";

import { createContext, useContext } from "react";
import type { createMatchAction } from "@/app/actions";
import type { Match, Prediction, Profile, Stage, StageState, Team } from "@/lib/types";

export type CreateMatchActionInput = Parameters<typeof createMatchAction>[0];
export type SaveState = "saving" | "saved" | "error";

export type AppContextValue = {
  currentUser: Profile;
  teams: Team[];
  profiles: Profile[];
  stages: StageState[];
  matches: Match[];
  predictions: Prediction[];
  now: Date;
  isAdmin: boolean;
  saveState: SaveState;
  dataMessage: string;
  openStages: Set<Stage>;
  updatePrediction: (match: Match, patch: Partial<Prediction>) => void;
  openPredictionDrawer: (match: Match) => void;
  refreshSupabaseData: () => Promise<void> | void;
  signOut: () => Promise<void> | void;
  finalizeMatch: (match: Match) => Promise<void> | void;
  createMatch: (input: CreateMatchActionInput) => Promise<void> | void;
  deleteMatch: (matchId: string) => Promise<void> | void;
  updateStageOpen: (stage: Stage, open: boolean) => Promise<void> | void;
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
