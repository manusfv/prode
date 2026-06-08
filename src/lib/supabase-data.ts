import type { Match, MatchLifecycleStatus, Prediction, Profile, Stage, StageState, Team } from "./types";

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
  open: boolean;
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
};

type PredictionRow = {
  id: string;
  user_id: string;
  match_id: string;
  home_score: number;
  away_score: number;
  winner_team_id: string | null;
  points: number | null;
  exact_hit: boolean;
  outcome_hit: boolean;
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

  const [profilesResult, teamsResult, stagesResult, matchesResult, predictionsResult] = await Promise.all([
    table(client, "profiles").select("*").order("display_name", { ascending: true }),
    table(client, "teams").select("*").order("name", { ascending: true }),
    table(client, "stages").select("*").order("stage", { ascending: true }),
    table(client, "matches").select("*").order("kickoff_utc", { ascending: true }),
    table(client, "predictions").select("*").order("updated_at", { ascending: true }),
  ]);

  const results = [profilesResult, teamsResult, stagesResult, matchesResult, predictionsResult];
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
    open: row.open,
  };
}

function mapMatch(row: MatchRow): Match {
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
  };
}

function mapPrediction(row: PredictionRow): Prediction {
  return {
    id: row.id,
    userId: row.user_id,
    matchId: row.match_id,
    homeScore: row.home_score,
    awayScore: row.away_score,
    winnerTeamId: row.winner_team_id,
    points: row.points,
    exactHit: row.exact_hit,
    outcomeHit: row.outcome_hit,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
