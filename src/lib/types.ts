export type Stage =
  | "groups"
  | "round32"
  | "round16"
  | "quarter"
  | "semi"
  | "third"
  | "final";

export type MatchStatus = "open" | "locked" | "finalized";
export type MatchLifecycleStatus = "open" | "live" | "finalized";
export type GroupStatus = "open" | "locked" | "finalized";

export type Role = "user" | "admin";

export type Profile = {
  id: string;
  displayName: string;
  email: string;
  approved: boolean;
  role: Role;
};

export type Team = {
  id: string;
  name: string;
  shortName: string;
  flag: string;
  group?: string;
};

export type Match = {
  id: string;
  matchNo: number;
  stage: Stage;
  group?: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeSeed?: string;
  awaySeed?: string;
  kickoffUtc: string;
  venue?: string;
  city?: string;
  status?: MatchLifecycleStatus;
  homeScore: number | null;
  awayScore: number | null;
  winnerTeamId: string | null;
  finalizedAt: string | null;
  finalizedBy: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  finalizedSource: "admin" | "auto" | null;
};

export type Prediction = {
  id: string;
  userId: string;
  matchId: string;
  homeScore: number;
  awayScore: number;
  winnerTeamId: string | null;
  points: number | null;
  exactHit: boolean;
  outcomeHit: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StageVisibility = "closed" | "admin" | "open";

export type StageState = {
  stage: Stage;
  label: string;
  predictionsOpen: StageVisibility;
  resultsOpen: StageVisibility;
  standingsOpen: StageVisibility;
};

export type StageFlag = "predictions" | "results" | "standings";

export type PredictionDraft = {
  homeScore: number | null;
  awayScore: number | null;
  winnerTeamId: string | null;
};

export type Group = {
  groupLabel: string;
  locksAt: string | null;
  firstTeamId: string | null;
  secondTeamId: string | null;
  thirdTeamId: string | null;
  fourthTeamId: string | null;
  resultFinalizedAt: string | null;
  resultFinalizedBy: string | null;
  resultSource: "admin" | "auto" | null;
};

export type GroupPrediction = {
  id: string;
  userId: string;
  groupLabel: string;
  firstTeamId: string | null;
  secondTeamId: string | null;
  thirdTeamId: string | null;
  fourthTeamId: string | null;
  points: number | null;
  exactPositions: number;
  createdAt: string;
  updatedAt: string;
};

// Ordered slots for positions 1°-4°; null until the user picks a team.
export type GroupPredictionDraft = {
  order: [string | null, string | null, string | null, string | null];
};
