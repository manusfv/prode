// Normalized shapes for the results-sync subsystem. Provider JSON is converted
// to these in football-data.ts and never leaks further.

import type { Stage } from "../types";

export type FeedStanding = {
  /** Single-letter group label, e.g. "A". */
  groupLabel: string;
  /** Team TLAs ordered by table position (1st..4th), as the feed gives them. */
  positions: string[];
  /** playedGames for each position, same order as `positions`. */
  playedByPosition: number[];
};

export type GroupStandingResult = {
  groupLabel: string;
  firstTeamId: string;
  secondTeamId: string;
  thirdTeamId: string;
  fourthTeamId: string;
  /** True when every team in the group has played all 3 matches. */
  complete: boolean;
};

/** Minimal structural Supabase client used by ingest/recalc (easy to fake in tests). */
export type DbResult = { data?: unknown; error: { message: string } | null };
export type SyncDb = {
  from(table: string): {
    select(columns?: string): {
      in(column: string, values: string[]): PromiseLike<DbResult>;
    };
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): PromiseLike<DbResult>;
    };
  };
};

/** A knockout match from the feed, normalized. `*Tla` is null until the team is determined. */
export type FeedMatch = {
  feedId: number;
  stage: Stage;
  utcDate: string;
  homeTla: string | null;
  awayTla: string | null;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
};

/** Desired DB state for one knockout fixture after a sync run. */
export type MatchResult = {
  matchId: string;
  feedId: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  kickoffUtc: string;
  homeScore: number | null;
  awayScore: number | null;
  winnerTeamId: string | null;
  /** True only when the feed reports the match FINISHED with both scores present. */
  finalize: boolean;
};
