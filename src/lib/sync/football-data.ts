import type { FeedMatch, FeedStanding } from "./types";
import type { Stage } from "../types";

type StandingRow = { position: number; team: { tla: string }; playedGames: number };
type StandingBlock = { type: string; group: string | null; table: StandingRow[] };
type StandingsResponse = { standings: StandingBlock[] };

export function parseStandings(json: unknown): FeedStanding[] {
  const blocks = (json as StandingsResponse).standings ?? [];
  return blocks
    .filter((block) => block.type === "TOTAL" && block.group)
    .map((block) => {
      const sorted = [...block.table].sort((a, b) => a.position - b.position);
      return {
        groupLabel: (block.group as string).replace(/^Group\s+/, ""),
        positions: sorted.map((row) => row.team.tla),
        playedByPosition: sorted.map((row) => row.playedGames),
      };
    });
}

const STANDINGS_URL = "https://api.football-data.org/v4/competitions/WC/standings";

export async function fetchStandings(token: string): Promise<FeedStanding[]> {
  const response = await fetch(STANDINGS_URL, { headers: { "X-Auth-Token": token } });
  if (!response.ok) {
    throw new Error(`football-data standings ${response.status}: ${await response.text()}`);
  }
  return parseStandings(await response.json());
}

const FEED_STAGE_MAP: Record<string, Stage> = {
  LAST_32: "round32",
  LAST_16: "round16",
  QUARTER_FINALS: "quarter",
  SEMI_FINALS: "semi",
  THIRD_PLACE: "third",
  FINAL: "final",
};

export function mapFeedStage(stage: string): Stage | null {
  return FEED_STAGE_MAP[stage] ?? null;
}

type FeedMatchRow = {
  id: number;
  utcDate: string;
  status: string;
  stage: string;
  homeTeam: { tla: string | null } | null;
  awayTeam: { tla: string | null } | null;
  score: { winner: string | null; fullTime: { home: number | null; away: number | null } };
};
type MatchesResponse = { matches: FeedMatchRow[] };

export function parseKnockoutMatches(json: unknown): FeedMatch[] {
  const rows = (json as MatchesResponse).matches ?? [];
  return rows
    .map((row): FeedMatch | null => {
      const stage = mapFeedStage(row.stage);
      if (!stage) return null;
      return {
        feedId: row.id,
        stage,
        utcDate: row.utcDate,
        homeTla: row.homeTeam?.tla ?? null,
        awayTla: row.awayTeam?.tla ?? null,
        status: row.status,
        homeScore: row.score?.fullTime?.home ?? null,
        awayScore: row.score?.fullTime?.away ?? null,
        winner: (row.score?.winner as FeedMatch["winner"]) ?? null,
      };
    })
    .filter((m): m is FeedMatch => m !== null);
}

const MATCHES_URL = "https://api.football-data.org/v4/competitions/WC/matches";

export async function fetchKnockoutMatches(token: string): Promise<FeedMatch[]> {
  const response = await fetch(MATCHES_URL, { headers: { "X-Auth-Token": token } });
  if (!response.ok) {
    throw new Error(`football-data matches ${response.status}: ${await response.text()}`);
  }
  return parseKnockoutMatches(await response.json());
}
