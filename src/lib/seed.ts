import type { AppSetting, Group, GroupPrediction, Match, Prediction, Profile, StageState, Team } from "./types";

export const teams: Team[] = [
  { id: "arg", name: "Argentina", shortName: "ARG", flag: "🇦🇷", group: "A" },
  { id: "mex", name: "México", shortName: "MEX", flag: "🇲🇽", group: "A" },
  { id: "bra", name: "Brasil", shortName: "BRA", flag: "🇧🇷", group: "A" },
  { id: "esp", name: "España", shortName: "ESP", flag: "🇪🇸", group: "A" },
  { id: "usa", name: "Estados Unidos", shortName: "USA", flag: "🇺🇸", group: "B" },
  { id: "can", name: "Canadá", shortName: "CAN", flag: "🇨🇦", group: "B" },
  { id: "fra", name: "Francia", shortName: "FRA", flag: "🇫🇷", group: "B" },
  { id: "uru", name: "Uruguay", shortName: "URU", flag: "🇺🇾", group: "B" },
];

export const profiles: Profile[] = [
  { id: "u1", displayName: "Manu", email: "manu@example.com", approved: true, role: "admin" },
  { id: "u2", displayName: "Sofía", email: "sofia@example.com", approved: true, role: "user" },
  { id: "u3", displayName: "Diego", email: "diego@example.com", approved: true, role: "user" },
  { id: "u4", displayName: "Vero", email: "vero@example.com", approved: true, role: "user" },
  { id: "u5", displayName: "Luli", email: "luli@example.com", approved: false, role: "user" },
];

export const stages: StageState[] = [
  { stage: "groups", label: "Grupos", open: true },
  { stage: "round32", label: "16avos", open: false },
  { stage: "round16", label: "Octavos", open: false },
  { stage: "quarter", label: "Cuartos", open: false },
  { stage: "semi", label: "Semis", open: false },
  { stage: "third", label: "3er puesto", open: false },
  { stage: "final", label: "Final", open: false },
];

export const appSettings: AppSetting[] = [
  { key: "standings", enabled: true },
  { key: "results", enabled: true },
];

// Group A is still open; Group B has already locked and been finalized.
export const groups: Group[] = [
  {
    groupLabel: "A",
    locksAt: "2026-12-01T22:00:00.000Z",
    firstTeamId: null,
    secondTeamId: null,
    thirdTeamId: null,
    fourthTeamId: null,
    resultFinalizedAt: null,
    resultFinalizedBy: null,
  },
  {
    groupLabel: "B",
    locksAt: "2026-06-07T10:00:00.000Z",
    firstTeamId: "usa",
    secondTeamId: "can",
    thirdTeamId: "fra",
    fourthTeamId: "uru",
    resultFinalizedAt: "2026-06-08T00:00:00.000Z",
    resultFinalizedBy: "u1",
  },
];

export const matches: Match[] = [
  {
    id: "m4",
    matchNo: 49,
    stage: "round16",
    homeTeamId: "arg",
    awayTeamId: "fra",
    homeSeed: "1A",
    awaySeed: "2B",
    kickoffUtc: "2026-06-12T01:00:00.000Z",
    venue: "MetLife Stadium",
    city: "New York/New Jersey",
    status: "open",
    homeScore: null,
    awayScore: null,
    winnerTeamId: null,
    finalizedAt: null,
    finalizedBy: null,
    updatedAt: null,
    updatedBy: null,
  },
  {
    id: "m5",
    matchNo: 57,
    stage: "quarter",
    homeTeamId: null,
    awayTeamId: null,
    homeSeed: "Ganador Octavos 1",
    awaySeed: "Ganador Octavos 2",
    kickoffUtc: "2026-07-10T01:00:00.000Z",
    venue: "AT&T Stadium",
    city: "Dallas",
    status: "open",
    homeScore: null,
    awayScore: null,
    winnerTeamId: null,
    finalizedAt: null,
    finalizedBy: null,
    updatedAt: null,
    updatedBy: null,
  },
];

export const predictions: Prediction[] = [
  {
    id: "p6",
    userId: "u1",
    matchId: "m4",
    homeScore: 1,
    awayScore: 1,
    winnerTeamId: "arg",
    points: null,
    exactHit: false,
    outcomeHit: false,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-07T20:00:00.000Z",
  },
];

export const groupPredictions: GroupPrediction[] = [
  {
    id: "gp1",
    userId: "u1",
    groupLabel: "A",
    firstTeamId: "arg",
    secondTeamId: "bra",
    thirdTeamId: "esp",
    fourthTeamId: "mex",
    points: null,
    exactPositions: 0,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-05T20:00:00.000Z",
  },
  {
    id: "gp2",
    userId: "u1",
    groupLabel: "B",
    firstTeamId: "usa",
    secondTeamId: "can",
    thirdTeamId: "fra",
    fourthTeamId: "uru",
    points: 28,
    exactPositions: 4,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-05T20:00:00.000Z",
  },
  {
    id: "gp3",
    userId: "u2",
    groupLabel: "B",
    firstTeamId: "usa",
    secondTeamId: "fra",
    thirdTeamId: "can",
    fourthTeamId: "uru",
    points: 14,
    exactPositions: 2,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-05T19:00:00.000Z",
  },
];
