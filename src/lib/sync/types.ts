// Normalized shapes for the results-sync subsystem. Provider JSON is converted
// to these in football-data.ts and never leaks further.

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
