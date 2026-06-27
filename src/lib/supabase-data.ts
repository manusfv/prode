import type {
  Group,
  GroupPrediction,
  Match,
  MatchLifecycleStatus,
  Prediction,
  Profile,
  Stage,
  StageState,
  StageVisibility,
  Team,
} from "./types";

type ProfileRow = {
  id: string;
  email: string;
  display_name: string;
  approved: boolean;
  role: "user" | "admin";
};

type TeamRow = {
  id: string;
  name: string;
  short_name: string;
  flag: string | null;
  group_label: string | null;
};

type StageRow = {
  stage: Stage;
  label: string;
  predictions_open: StageVisibility;
  results_open: StageVisibility;
  standings_open: StageVisibility;
};

type MatchRow = {
  id: string;
  match_no: number;
  stage: Stage;
  group_label: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_seed: string | null;
  away_seed: string | null;
  kickoff_utc: string;
  venue: string | null;
  city: string | null;
  status?: MatchLifecycleStatus | null;
  home_score: number | null;
  away_score: number | null;
  winner_team_id: string | null;
  finalized_at: string | null;
  finalized_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
  finalized_source: "admin" | "auto" | null;
  feed_match_id: string | null;
};

type PredictionRow = {
  id: string;
  user_id: string;
  match_id: string;
  home_score: number;
  away_score: number;
  points: number | null;
  exact_hit: boolean;
  outcome_hit: boolean;
  created_at: string;
  updated_at: string;
};

type GroupRow = {
  group_label: string;
  locks_at: string | null;
  first_team_id: string | null;
  second_team_id: string | null;
  third_team_id: string | null;
  fourth_team_id: string | null;
  result_finalized_at: string | null;
  result_finalized_by: string | null;
  result_source: "admin" | "auto" | null;
};

type GroupPredictionRow = {
  id: string;
  user_id: string;
  group_label: string;
  first_team_id: string | null;
  second_team_id: string | null;
  third_team_id: string | null;
  fourth_team_id: string | null;
  points: number | null;
  exact_positions: number;
  created_at: string;
  updated_at: string;
};

export type SupabaseAppData = {
  profile: Profile | null;
  profiles: Profile[];
  teams: Team[];
  stages: StageState[];
  matches: Match[];
  predictions: Prediction[];
  groups: Group[];
  groupPredictions: GroupPrediction[];
};

type SupabaseDataClient = {
  auth: {
    getUser: () => Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
  };
  from: (table: string) => unknown;
};

type QueryResult = { data: unknown; error: { message: string } | null };
type QueryBuilder = PromiseLike<QueryResult> & {
  order: (column: string, options?: { ascending?: boolean }) => PromiseLike<QueryResult>;
  eq: (column: string, value: string) => PromiseLike<QueryResult>;
};
type QueryTable = {
  select: (columns?: string) => QueryBuilder;
};

export async function loadSupabaseAppData(client: SupabaseDataClient): Promise<SupabaseAppData> {
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw new Error(userError.message);

  const userId = userData.user?.id;

  const [
    profilesResult,
    teamsResult,
    stagesResult,
    matchesResult,
    predictionsResult,
    groupsResult,
    groupPredictionsResult,
  ] = await Promise.all([
    table(client, "profiles").select("*").order("display_name", { ascending: true }),
    table(client, "teams").select("*").order("name", { ascending: true }),
    table(client, "stages").select("*").order("stage", { ascending: true }),
    table(client, "matches").select("*").order("kickoff_utc", { ascending: true }),
    table(client, "predictions").select("*").order("updated_at", { ascending: true }),
    table(client, "groups").select("*").order("group_label", { ascending: true }),
    table(client, "group_predictions").select("*").order("updated_at", { ascending: true }),
  ]);

  const results = [
    profilesResult,
    teamsResult,
    stagesResult,
    matchesResult,
    predictionsResult,
    groupsResult,
    groupPredictionsResult,
  ];
  const error = results.find((result) => result.error)?.error;
  if (error) throw new Error(error.message);

  const profiles = (profilesResult.data as ProfileRow[]).map(mapProfile);

  return {
    profile: userId ? profiles.find((profile) => profile.id === userId) ?? null : null,
    profiles,
    teams: (teamsResult.data as TeamRow[]).map(mapTeam),
    stages: (stagesResult.data as StageRow[]).map(mapStage),
    matches: (matchesResult.data as MatchRow[]).map(mapMatch),
    predictions: (predictionsResult.data as PredictionRow[]).map(mapPrediction),
    groups: (groupsResult.data as GroupRow[]).map(mapGroup),
    groupPredictions: (groupPredictionsResult.data as GroupPredictionRow[]).map(mapGroupPrediction),
  };
}

function table(client: SupabaseDataClient, name: string) {
  return client.from(name) as QueryTable;
}

export function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    approved: row.approved,
    role: row.role,
  };
}

function mapTeam(row: TeamRow): Team {
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    flag: row.flag ?? "TBD",
    group: row.group_label ?? undefined,
  };
}

function mapStage(row: StageRow): StageState {
  return {
    stage: row.stage,
    label: row.label,
    predictionsOpen: row.predictions_open,
    resultsOpen: row.results_open,
    standingsOpen: row.standings_open,
  };
}

export function mapMatch(row: MatchRow): Match {
  return {
    id: row.id,
    matchNo: row.match_no,
    stage: row.stage,
    group: row.group_label ?? undefined,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    homeSeed: row.home_seed ?? undefined,
    awaySeed: row.away_seed ?? undefined,
    kickoffUtc: row.kickoff_utc,
    venue: row.venue ?? undefined,
    city: row.city ?? undefined,
    status: row.status ?? undefined,
    homeScore: row.home_score,
    awayScore: row.away_score,
    winnerTeamId: row.winner_team_id,
    finalizedAt: row.finalized_at,
    finalizedBy: row.finalized_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    finalizedSource: row.finalized_source ?? null,
    feedMatchId: row.feed_match_id ?? null,
  };
}

export function mapPrediction(row: PredictionRow): Prediction {
  return {
    id: row.id,
    userId: row.user_id,
    matchId: row.match_id,
    homeScore: row.home_score,
    awayScore: row.away_score,
    points: row.points,
    exactHit: row.exact_hit,
    outcomeHit: row.outcome_hit,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapGroup(row: GroupRow): Group {
  return {
    groupLabel: row.group_label,
    locksAt: row.locks_at,
    firstTeamId: row.first_team_id,
    secondTeamId: row.second_team_id,
    thirdTeamId: row.third_team_id,
    fourthTeamId: row.fourth_team_id,
    resultFinalizedAt: row.result_finalized_at,
    resultFinalizedBy: row.result_finalized_by,
    resultSource: row.result_source ?? null,
  };
}

export function mapGroupPrediction(row: GroupPredictionRow): GroupPrediction {
  return {
    id: row.id,
    userId: row.user_id,
    groupLabel: row.group_label,
    firstTeamId: row.first_team_id,
    secondTeamId: row.second_team_id,
    thirdTeamId: row.third_team_id,
    fourthTeamId: row.fourth_team_id,
    points: row.points,
    exactPositions: row.exact_positions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
