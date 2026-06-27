# Knockout Bracket Auto-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the World Cup knockout bracket auto-fill from the football-data.org feed — resolving placeholder seeds to real teams, finalizing scores + winners, and rescoring predictions — mirroring the live group-standings sync.

**Architecture:** Extend the existing protected `/api/sync-results` route with a second, orthogonal path for `matches`. New pure modules under `src/lib/sync/` (adapter extension, matcher, ingest, recalc) follow the same shapes as the group-standings modules already there. A `feed_match_id` column anchors each fixture to its feed match across runs.

**Tech Stack:** Next.js (App Router, server-only route handler), TypeScript, Supabase (service-role client), Vitest, football-data.org v4 REST feed.

## Global Constraints

- Provider JSON must never leave `src/lib/sync/football-data.ts`; every other module consumes the normalized `FeedMatch` shape.
- Auto writes must **never** touch a match with `finalized_source = 'admin'` (reversible safety net).
- A still-undetermined feed team (`tla: null`) must never blank an existing team id — only fill empty/known slots.
- Reuse `scorePrediction` for scoring; no new scoring logic. Score only when `match.status === 'finalized'`, else `{ points: null, exactHit: false, outcomeHit: false }`.
- Tests use Vitest (`npm test`), colocated `*.test.ts` next to the module, matching the existing `src/lib/sync/*.test.ts` style (no network in tests).
- UI follows the design system: `app-*` tokens, reuse `AutoBadge` from `src/components/badges.tsx`.
- Stage map and TBD representation are verified live on first run; unknown values fail closed (logged + skipped), never guessed.

---

### Task 1: Schema, types, and exported mappers

Foundational plumbing every later task consumes: the migration, the `Match.feedMatchId` field, the `FeedMatch`/`MatchResult` sync types, and exporting the two mappers the route + recalc need.

**Files:**
- Create: `docs/supabase-migration-feed-match-id.sql`
- Modify: `src/lib/types.ts` (add `feedMatchId` to `Match`)
- Modify: `src/lib/supabase-data.ts` (add `feed_match_id` to `MatchRow`, map it in `mapMatch`, `export` both `mapMatch` and `mapPrediction`)
- Modify: `src/lib/sync/types.ts` (add `FeedMatch`, `MatchResult`; import `Stage`)
- Modify (test fixtures): `src/lib/scoring.test.ts`, `src/lib/tournament.test.ts`, `src/lib/results.test.ts`, `src/lib/stats.test.ts`, `src/lib/csv.test.ts`, `src/lib/standings.test.ts`, `src/lib/tab-visibility.test.ts` — `feedMatchId` becomes a required field on `Match`, so every base `Match` literal in these files needs it.

**Interfaces:**
- Produces: `Match.feedMatchId: string | null`; `FeedMatch`, `MatchResult` types (see below); `export function mapMatch(row: MatchRow): Match`; `export function mapPrediction(row: PredictionRow): Prediction`.

- [ ] **Step 1: Write the migration file**

Create `docs/supabase-migration-feed-match-id.sql`:

```sql
-- Anchors each knockout fixture to its football-data.org match id so the
-- results-sync can match upcoming matches (teams still TBD) by a stable key.
alter table public.matches
  add column if not exists feed_match_id text;
```

- [ ] **Step 2: Add `feedMatchId` to the `Match` type**

In `src/lib/types.ts`, in the `Match` type, add the field after `finalizedSource`:

```ts
  finalizedSource: "admin" | "auto" | null;
  feedMatchId: string | null;
};
```

- [ ] **Step 3: Add the column to `MatchRow` and map it; export the mappers**

In `src/lib/supabase-data.ts`:

Add to the `MatchRow` type (after `finalized_source`):

```ts
  finalized_source: "admin" | "auto" | null;
  feed_match_id: string | null;
};
```

Change `function mapMatch(row: MatchRow): Match {` to `export function mapMatch(row: MatchRow): Match {` and add the field to its return object (after `finalizedSource`):

```ts
    finalizedSource: row.finalized_source ?? null,
    feedMatchId: row.feed_match_id ?? null,
  };
```

Change `function mapPrediction(row: PredictionRow): Prediction {` to `export function mapPrediction(row: PredictionRow): Prediction {` (no body change).

- [ ] **Step 4: Add the sync types**

In `src/lib/sync/types.ts`, add at the top:

```ts
import type { Stage } from "../types";
```

and append:

```ts
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
```

- [ ] **Step 5: Update existing test `Match` fixtures**

`feedMatchId` is now required on `Match`, so the base `Match` literals in the existing tests no longer type-check. In each of these files, add `feedMatchId: null,` immediately after every `finalizedSource: null,` line that sits inside a `Match` object literal:

- `src/lib/scoring.test.ts` (the `groupMatch` literal, ~line 37)
- `src/lib/tournament.test.ts` (the `knockoutMatch` literal, ~line 20)
- `src/lib/results.test.ts` (the `baseMatch` literal, ~line 19)
- `src/lib/stats.test.ts` (the `match(...)` and `fmatch(...)` factories, ~lines 17 and 150)
- `src/lib/csv.test.ts`, `src/lib/standings.test.ts`, `src/lib/tab-visibility.test.ts` (each base `Match` literal — search for `finalizedSource: null` in each)

Derived objects that spread a base (`...baseMatch`) need no change. This mirrors how `finalizedSource` was originally added across these fixtures.

- [ ] **Step 6: Verify it compiles and existing tests still pass**

Run: `npx tsc --noEmit && npm test`
Expected: PASS (no type errors; the full existing suite green). If `tsc` still flags a `Match` literal missing `feedMatchId`, add `feedMatchId: null` there.

- [ ] **Step 7: Commit**

```bash
git add docs/supabase-migration-feed-match-id.sql src/lib/types.ts src/lib/supabase-data.ts src/lib/sync/types.ts src/lib/*.test.ts
git commit -m "feat(sync): feed_match_id column, FeedMatch/MatchResult types, export mappers"
```

---

### Task 2: Feed adapter — stage map + knockout fetch/parse

Extend the adapter with a pure stage mapper, a pure parser, and the network fetch.

**Files:**
- Modify: `src/lib/sync/football-data.ts`
- Test: `src/lib/sync/football-data.test.ts` (extend existing file)

**Interfaces:**
- Consumes: `FeedMatch` (Task 1).
- Produces: `mapFeedStage(stage: string): Stage | null`; `parseKnockoutMatches(json: unknown): FeedMatch[]`; `fetchKnockoutMatches(token: string): Promise<FeedMatch[]>`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/sync/football-data.test.ts`:

```ts
import { mapFeedStage, parseKnockoutMatches } from "./football-data";

const matchesSample = {
  matches: [
    {
      id: 537001,
      utcDate: "2026-06-28T19:00:00Z",
      status: "FINISHED",
      stage: "LAST_32",
      homeTeam: { tla: "RSA" },
      awayTeam: { tla: "CAN" },
      score: { winner: "HOME_TEAM", fullTime: { home: 2, away: 1 } },
    },
    {
      id: 537002,
      utcDate: "2026-07-01T01:00:00Z",
      status: "SCHEDULED",
      stage: "LAST_32",
      homeTeam: { tla: "MEX" },
      awayTeam: { tla: null },
      score: { winner: null, fullTime: { home: null, away: null } },
    },
    {
      id: 537003,
      utcDate: "2026-06-20T18:00:00Z",
      status: "FINISHED",
      stage: "GROUP_STAGE",
      homeTeam: { tla: "BRA" },
      awayTeam: { tla: "JPN" },
      score: { winner: "AWAY_TEAM", fullTime: { home: 0, away: 1 } },
    },
  ],
};

describe("mapFeedStage", () => {
  it("maps every knockout enum to our Stage", () => {
    expect(mapFeedStage("LAST_32")).toBe("round32");
    expect(mapFeedStage("LAST_16")).toBe("round16");
    expect(mapFeedStage("QUARTER_FINALS")).toBe("quarter");
    expect(mapFeedStage("SEMI_FINALS")).toBe("semi");
    expect(mapFeedStage("THIRD_PLACE")).toBe("third");
    expect(mapFeedStage("FINAL")).toBe("final");
  });

  it("returns null for unknown / non-knockout stages", () => {
    expect(mapFeedStage("GROUP_STAGE")).toBeNull();
    expect(mapFeedStage("NONSENSE")).toBeNull();
  });
});

describe("parseKnockoutMatches", () => {
  it("normalizes knockout matches and drops non-knockout stages", () => {
    const result = parseKnockoutMatches(matchesSample);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      feedId: 537001,
      stage: "round32",
      utcDate: "2026-06-28T19:00:00Z",
      homeTla: "RSA",
      awayTla: "CAN",
      status: "FINISHED",
      homeScore: 2,
      awayScore: 1,
      winner: "HOME_TEAM",
    });
  });

  it("keeps a TBD opponent as null without dropping the match", () => {
    const result = parseKnockoutMatches(matchesSample);
    const scheduled = result.find((m) => m.feedId === 537002)!;
    expect(scheduled.homeTla).toBe("MEX");
    expect(scheduled.awayTla).toBeNull();
    expect(scheduled.status).toBe("SCHEDULED"); // parser carries status; finalize is computed later in the matcher
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/sync/football-data.test.ts`
Expected: FAIL — `mapFeedStage`/`parseKnockoutMatches` are not exported.

- [ ] **Step 3: Implement the adapter additions**

In `src/lib/sync/football-data.ts`, add the `FeedMatch` import and the new code (keep the existing standings code unchanged):

```ts
import type { FeedMatch, FeedStanding } from "./types";
import type { Stage } from "../types";

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
```

Note: the existing top-of-file `import type { FeedStanding } from "./types";` becomes the combined import shown above — replace it, don't duplicate.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/sync/football-data.test.ts`
Expected: PASS (all describe blocks, old and new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/football-data.ts src/lib/sync/football-data.test.ts
git commit -m "feat(sync): knockout match adapter (stage map + fetch/parse)"
```

---

### Task 3: Match matcher (pure)

Join feed matches to our fixtures, resolving teams and results into `MatchResult[]`.

**Files:**
- Create: `src/lib/sync/match-fixtures.ts`
- Test: `src/lib/sync/match-fixtures.test.ts`

**Interfaces:**
- Consumes: `FeedMatch`, `MatchResult` (Task 1); `resolveTeamId(tla, knownIds)` from `./tla`; `Match` from `../types`.
- Produces: `matchFixtures(feed: FeedMatch[], matches: Match[], knownIds: Set<string>): { results: MatchResult[]; unmatched: string[] }`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/sync/match-fixtures.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { matchFixtures } from "./match-fixtures";
import type { FeedMatch } from "./types";
import type { Match } from "../types";

const known = new Set(["rsa", "can", "mex", "bra", "jpn"]);

function fixture(over: Partial<Match>): Match {
  return {
    id: "m1", matchNo: 73, stage: "round32", homeTeamId: null, awayTeamId: null,
    kickoffUtc: "2026-06-28T19:00:00Z", homeScore: null, awayScore: null,
    winnerTeamId: null, finalizedAt: null, finalizedBy: null, updatedAt: null,
    updatedBy: null, finalizedSource: null, feedMatchId: null, ...over,
  };
}

function feed(over: Partial<FeedMatch>): FeedMatch {
  return {
    feedId: 1, stage: "round32", utcDate: "2026-06-28T19:00:00Z",
    homeTla: "RSA", awayTla: "CAN", status: "SCHEDULED",
    homeScore: null, awayScore: null, winner: null, ...over,
  };
}

describe("matchFixtures", () => {
  it("bootstraps by stage + kickoff instant and adopts the feed id, filling teams", () => {
    const { results } = matchFixtures([feed({ feedId: 99 })], [fixture({})], known);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      matchId: "m1", feedId: 99, homeTeamId: "rsa", awayTeamId: "can", finalize: false,
    });
  });

  it("matches by stored feed id once bootstrapped (ignoring instant)", () => {
    const f = feed({ feedId: 42, utcDate: "2026-06-28T21:30:00Z" }); // time shifted
    const m = fixture({ feedMatchId: "42", kickoffUtc: "2026-06-28T19:00:00Z" });
    const { results } = matchFixtures([f], [m], known);
    expect(results[0].feedId).toBe(42);
    expect(results[0].kickoffUtc).toBe("2026-06-28T21:30:00Z"); // refreshed from feed
  });

  it("leaves a TBD opponent slot null", () => {
    const { results } = matchFixtures([feed({ awayTla: null })], [fixture({})], known);
    expect(results[0].homeTeamId).toBe("rsa");
    expect(results[0].awayTeamId).toBeNull();
  });

  it("finalizes a finished match with winner mapped to a team id", () => {
    const f = feed({ status: "FINISHED", homeScore: 2, awayScore: 1, winner: "HOME_TEAM" });
    const { results } = matchFixtures([f], [fixture({})], known);
    expect(results[0]).toMatchObject({
      finalize: true, homeScore: 2, awayScore: 1, winnerTeamId: "rsa",
    });
  });

  it("maps a penalty/draw winner (90' draw, advancer in winner)", () => {
    const f = feed({ status: "FINISHED", homeScore: 1, awayScore: 1, winner: "AWAY_TEAM" });
    const { results } = matchFixtures([f], [fixture({})], known);
    expect(results[0].winnerTeamId).toBe("can");
  });

  it("skips admin-owned matches entirely", () => {
    const m = fixture({ finalizedSource: "admin" });
    const { results } = matchFixtures([feed({})], [m], known);
    expect(results).toHaveLength(0);
  });

  it("reports an unresolvable tla as unmatched and does not fill that slot", () => {
    const { results, unmatched } = matchFixtures([feed({ homeTla: "ZZZ" })], [fixture({})], known);
    expect(unmatched).toContain("round32:ZZZ");
    expect(results[0].homeTeamId).toBeNull();
    expect(results[0].awayTeamId).toBe("can");
  });

  it("reports an ambiguous bootstrap (two feed matches, same stage+instant) as unmatched", () => {
    const a = feed({ feedId: 1 });
    const b = feed({ feedId: 2 });
    const { results, unmatched } = matchFixtures([a, b], [fixture({})], known);
    expect(results).toHaveLength(0);
    expect(unmatched.some((u) => u.includes("m1"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/sync/match-fixtures.test.ts`
Expected: FAIL — module `./match-fixtures` not found.

- [ ] **Step 3: Implement the matcher**

Create `src/lib/sync/match-fixtures.ts`:

```ts
import type { Match } from "../types";
import { resolveTeamId } from "./tla";
import type { FeedMatch, MatchResult } from "./types";

const instant = (iso: string) => new Date(iso).getTime();

function findFeed(
  match: Match,
  feed: FeedMatch[],
  unmatched: string[],
): FeedMatch | null {
  if (match.feedMatchId) {
    return feed.find((f) => String(f.feedId) === match.feedMatchId) ?? null;
  }
  // Bootstrap: same stage + same kickoff instant must be unique.
  const candidates = feed.filter(
    (f) => f.stage === match.stage && instant(f.utcDate) === instant(match.kickoffUtc),
  );
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) unmatched.push(`${match.stage}:${match.id}:ambiguous`);
  return null;
}

function resolveSlot(
  tla: string | null,
  stage: string,
  knownIds: Set<string>,
  unmatched: string[],
): string | null {
  if (tla === null) return null;
  const id = resolveTeamId(tla, knownIds);
  if (id === null) unmatched.push(`${stage}:${tla}`);
  return id;
}

export function matchFixtures(
  feed: FeedMatch[],
  matches: Match[],
  knownIds: Set<string>,
): { results: MatchResult[]; unmatched: string[] } {
  const results: MatchResult[] = [];
  const unmatched: string[] = [];

  for (const match of matches) {
    if (match.finalizedSource === "admin") continue; // ownership: never overwrite a human
    const f = findFeed(match, feed, unmatched);
    if (!f) continue;

    const homeTeamId = resolveSlot(f.homeTla, f.stage, knownIds, unmatched);
    const awayTeamId = resolveSlot(f.awayTla, f.stage, knownIds, unmatched);
    const finalize = f.status === "FINISHED" && f.homeScore !== null && f.awayScore !== null;
    const winnerTeamId =
      f.winner === "HOME_TEAM" ? homeTeamId : f.winner === "AWAY_TEAM" ? awayTeamId : null;

    results.push({
      matchId: match.id,
      feedId: f.feedId,
      homeTeamId,
      awayTeamId,
      kickoffUtc: f.utcDate,
      homeScore: finalize ? f.homeScore : null,
      awayScore: finalize ? f.awayScore : null,
      winnerTeamId: finalize ? winnerTeamId : null,
      finalize,
    });
  }

  return { results, unmatched };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/sync/match-fixtures.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/match-fixtures.ts src/lib/sync/match-fixtures.test.ts
git commit -m "feat(sync): knockout match matcher (bootstrap by id, team + result resolution)"
```

---

### Task 4: Match ingest

Write the resolved fixtures back to the `matches` table, idempotently, respecting the no-blanking rule.

**Files:**
- Create: `src/lib/sync/ingest-matches.ts`
- Test: `src/lib/sync/ingest-matches.test.ts`

**Interfaces:**
- Consumes: `MatchResult` (Task 1); `SyncDb`, `DbResult` from `./types`.
- Produces: `ingestMatches(db: SyncDb, results: MatchResult[]): Promise<{ ok: true; filled: number; finalized: number } | { ok: false; message: string }>`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/sync/ingest-matches.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ingestMatches } from "./ingest-matches";
import type { MatchResult } from "./types";

type Write = { table: string; values: Record<string, unknown>; id: string };

function fakeDb(writes: Write[], error: string | null = null) {
  return {
    from(table: string) {
      return {
        update(values: Record<string, unknown>) {
          return {
            eq(_col: string, id: string) {
              writes.push({ table, values, id });
              return Promise.resolve({ error: error ? { message: error } : null });
            },
          };
        },
        select() { return { in() { return Promise.resolve({ data: [], error: null }); } }; },
      };
    },
  };
}

function result(over: Partial<MatchResult>): MatchResult {
  return {
    matchId: "m1", feedId: 7, homeTeamId: "rsa", awayTeamId: "can",
    kickoffUtc: "2026-06-28T19:00:00Z", homeScore: null, awayScore: null,
    winnerTeamId: null, finalize: false, ...over,
  };
}

describe("ingestMatches", () => {
  it("fills teams + feed id + kickoff without finalizing for a scheduled match", async () => {
    const writes: Write[] = [];
    const res = await ingestMatches(fakeDb(writes) as never, [result({})]);
    expect(res).toEqual({ ok: true, filled: 1, finalized: 0 });
    expect(writes[0].values).toMatchObject({
      feed_match_id: "7", home_team_id: "rsa", away_team_id: "can",
      kickoff_utc: "2026-06-28T19:00:00Z",
    });
    expect(writes[0].values).not.toHaveProperty("status");
  });

  it("writes scores, winner, and finalize stamps for a finished match", async () => {
    const writes: Write[] = [];
    const res = await ingestMatches(fakeDb(writes) as never, [
      result({ finalize: true, homeScore: 2, awayScore: 1, winnerTeamId: "rsa" }),
    ]);
    expect(res).toEqual({ ok: true, filled: 0, finalized: 1 });
    expect(writes[0].values).toMatchObject({
      home_score: 2, away_score: 1, winner_team_id: "rsa",
      status: "finalized", finalized_source: "auto", finalized_by: null,
    });
  });

  it("does not blank a slot when the feed team is still null", async () => {
    const writes: Write[] = [];
    await ingestMatches(fakeDb(writes) as never, [result({ awayTeamId: null })]);
    expect(writes[0].values).toHaveProperty("home_team_id", "rsa");
    expect(writes[0].values).not.toHaveProperty("away_team_id");
  });

  it("returns the error message when a write fails", async () => {
    const writes: Write[] = [];
    const res = await ingestMatches(fakeDb(writes, "boom") as never, [result({})]);
    expect(res).toEqual({ ok: false, message: "boom" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/sync/ingest-matches.test.ts`
Expected: FAIL — module `./ingest-matches` not found.

- [ ] **Step 3: Implement the ingest**

Create `src/lib/sync/ingest-matches.ts`:

```ts
import type { DbResult, MatchResult, SyncDb } from "./types";

type IngestResult =
  | { ok: true; filled: number; finalized: number }
  | { ok: false; message: string };

export async function ingestMatches(db: SyncDb, results: MatchResult[]): Promise<IngestResult> {
  const now = new Date().toISOString();
  let filled = 0;
  let finalized = 0;

  for (const r of results) {
    const values: Record<string, unknown> = {
      feed_match_id: String(r.feedId),
      kickoff_utc: r.kickoffUtc,
      updated_at: now,
    };
    // Never blank an existing team id with a still-undetermined feed slot.
    if (r.homeTeamId !== null) values.home_team_id = r.homeTeamId;
    if (r.awayTeamId !== null) values.away_team_id = r.awayTeamId;

    if (r.finalize) {
      values.home_score = r.homeScore;
      values.away_score = r.awayScore;
      values.winner_team_id = r.winnerTeamId;
      values.status = "finalized";
      values.finalized_at = now;
      values.finalized_source = "auto";
      values.finalized_by = null;
    }

    const write = (await db.from("matches").update(values).eq("id", r.matchId)) as DbResult;
    if (write.error) return { ok: false, message: write.error.message };
    if (r.finalize) finalized += 1;
    else filled += 1;
  }

  return { ok: true, filled, finalized };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/sync/ingest-matches.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/ingest-matches.ts src/lib/sync/ingest-matches.test.ts
git commit -m "feat(sync): knockout match ingest (team fill + finalize, no-blank rule)"
```

---

### Task 5: Match prediction recalc

Rescore predictions on changed matches, mirroring `recalcGroupPredictions`.

**Files:**
- Create: `src/lib/sync/recalc-matches.ts`
- Test: `src/lib/sync/recalc-matches.test.ts`

**Interfaces:**
- Consumes: `scorePrediction` from `../scoring`; `mapPrediction` from `../supabase-data` (exported in Task 1); `Match` from `../types`; `SyncDb`, `DbResult` from `./types`.
- Produces: `recalcMatchPredictions(db: SyncDb, matches: Match[]): Promise<{ ok: true; updated: number } | { ok: false; message: string }>`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/sync/recalc-matches.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { recalcMatchPredictions } from "./recalc-matches";
import type { Match } from "../types";

type Update = { id: string; values: Record<string, unknown> };

function baseMatch(over: Partial<Match>): Match {
  return {
    id: "m1", matchNo: 73, stage: "round32", homeTeamId: "rsa", awayTeamId: "can",
    kickoffUtc: "2026-06-28T19:00:00Z", homeScore: 2, awayScore: 1, winnerTeamId: "rsa",
    finalizedAt: null, finalizedBy: null, updatedAt: null, updatedBy: null,
    finalizedSource: "auto", feedMatchId: "7", status: "finalized", ...over,
  };
}

// One stored prediction row (snake_case as Supabase returns it).
const predictionRows = [
  { id: "p1", user_id: "u1", match_id: "m1", home_score: 2, away_score: 1,
    winner_team_id: "rsa", points: null, exact_hit: false, outcome_hit: false,
    created_at: "x", updated_at: "x" },
];

function fakeDb(updates: Update[]) {
  return {
    from() {
      return {
        select() {
          return { in() { return Promise.resolve({ data: predictionRows, error: null }); } };
        },
        update(values: Record<string, unknown>) {
          return { eq(_c: string, id: string) { updates.push({ id, values }); return Promise.resolve({ error: null }); } };
        },
      };
    },
  };
}

describe("recalcMatchPredictions", () => {
  it("scores predictions on a finalized match", async () => {
    const updates: Update[] = [];
    const res = await recalcMatchPredictions(fakeDb(updates) as never, [baseMatch({})]);
    expect(res).toEqual({ ok: true, updated: 1 });
    // Exact 2-1 hit = 3 points (per scorePrediction).
    expect(updates[0].values).toMatchObject({ points: 3, exact_hit: true, outcome_hit: true });
  });

  it("nulls points when the match is not finalized", async () => {
    const updates: Update[] = [];
    await recalcMatchPredictions(fakeDb(updates) as never, [baseMatch({ status: "open" })]);
    expect(updates[0].values).toMatchObject({ points: null, exact_hit: false, outcome_hit: false });
  });

  it("no-ops on empty input", async () => {
    const res = await recalcMatchPredictions(fakeDb([]) as never, []);
    expect(res).toEqual({ ok: true, updated: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/sync/recalc-matches.test.ts`
Expected: FAIL — module `./recalc-matches` not found.

- [ ] **Step 3: Implement the recalc**

Create `src/lib/sync/recalc-matches.ts`:

```ts
import { scorePrediction } from "../scoring";
import { mapPrediction } from "../supabase-data";
import type { Match } from "../types";
import type { DbResult, SyncDb } from "./types";

type RecalcResult = { ok: true; updated: number } | { ok: false; message: string };

export async function recalcMatchPredictions(db: SyncDb, matches: Match[]): Promise<RecalcResult> {
  if (matches.length === 0) return { ok: true, updated: 0 };

  const read = (await db
    .from("predictions")
    .select("*")
    .in("match_id", matches.map((m) => m.id))) as DbResult;
  if (read.error) return { ok: false, message: read.error.message };

  const matchById = new Map(matches.map((m) => [m.id, m]));
  const updatedAt = new Date().toISOString();
  const rows = (read.data as Parameters<typeof mapPrediction>[0][]) ?? [];

  const writes = rows.map(async (row) => {
    const prediction = mapPrediction(row);
    const match = matchById.get(prediction.matchId);
    if (!match) return null;
    const score =
      match.status === "finalized"
        ? scorePrediction(match, prediction)
        : { points: null, exactHit: false, outcomeHit: false };
    return await db
      .from("predictions")
      .update({
        points: score.points,
        exact_hit: score.exactHit,
        outcome_hit: score.outcomeHit,
        updated_at: updatedAt,
      })
      .eq("id", prediction.id);
  });

  const settled = await Promise.all(writes);
  const failed = settled.find((r): r is DbResult => r !== null && r.error !== null);
  if (failed) return { ok: false, message: failed.error!.message };
  return { ok: true, updated: settled.filter((r) => r !== null).length };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/sync/recalc-matches.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/recalc-matches.ts src/lib/sync/recalc-matches.test.ts
git commit -m "feat(sync): recalc match predictions against synced results"
```

---

### Task 6: Wire the matches path into the route

Add the knockout path to `/api/sync-results` after the existing standings path.

**Files:**
- Modify: `src/app/api/sync-results/route.ts`

**Interfaces:**
- Consumes: `fetchKnockoutMatches` (Task 2), `matchFixtures` (Task 3), `ingestMatches` (Task 4), `recalcMatchPredictions` (Task 5), `mapMatch` (Task 1).

- [ ] **Step 1: Add imports**

In `src/app/api/sync-results/route.ts`, extend the imports:

```ts
import { mapGroup, mapMatch } from "@/lib/supabase-data";
import { fetchStandings, fetchKnockoutMatches } from "@/lib/sync/football-data";
import { matchFixtures } from "@/lib/sync/match-fixtures";
import { ingestMatches } from "@/lib/sync/ingest-matches";
import { recalcMatchPredictions } from "@/lib/sync/recalc-matches";
```

(The existing `mapGroup`, `fetchStandings`, `ingestStandings`, `matchStandings`, `recalcGroupPredictions` imports stay.)

- [ ] **Step 2: Add the matches path before the final summary**

After the group `recalc` block and **before** the closing `console.log(...)` / `return NextResponse.json({...})`, insert:

```ts
  // ---- Knockout matches path (orthogonal to standings; touches only `matches`) ----
  let knockoutFeed;
  try {
    knockoutFeed = await fetchKnockoutMatches(token);
  } catch (error) {
    console.error(`${LOG} matches feed fetch failed:`, error);
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }

  const matchesResult = await supabase.from("matches").select("*");
  if (matchesResult.error) {
    console.error(`${LOG} reading matches failed:`, matchesResult.error.message);
    return NextResponse.json({ error: matchesResult.error.message }, { status: 500 });
  }
  const knockoutMatches = (matchesResult.data ?? [])
    .map(mapMatch)
    .filter((m) => m.stage !== "groups");

  const matchMatch = matchFixtures(knockoutFeed, knockoutMatches, knownIds);
  if (matchMatch.unmatched.length > 0) {
    console.warn(`${LOG} unmatched knockout entries:`, matchMatch.unmatched);
  }

  const matchIngest = await ingestMatches(db, matchMatch.results);
  if (!matchIngest.ok) {
    console.error(`${LOG} match ingest failed:`, matchIngest.message);
    return NextResponse.json({ error: matchIngest.message }, { status: 500 });
  }

  // Apply the freshly-written state onto the read matches so recalc scores
  // against current scores/status (mirrors writtenGroups above).
  const writtenMatches = knockoutMatches
    .filter((m) => matchMatch.results.some((r) => r.matchId === m.id))
    .map((m) => {
      const r = matchMatch.results.find((res) => res.matchId === m.id)!;
      return {
        ...m,
        homeTeamId: r.homeTeamId ?? m.homeTeamId,
        awayTeamId: r.awayTeamId ?? m.awayTeamId,
        homeScore: r.finalize ? r.homeScore : m.homeScore,
        awayScore: r.finalize ? r.awayScore : m.awayScore,
        winnerTeamId: r.finalize ? r.winnerTeamId : m.winnerTeamId,
        status: r.finalize ? ("finalized" as const) : m.status,
      };
    });
  const matchRecalc = await recalcMatchPredictions(db, writtenMatches);
  if (!matchRecalc.ok) {
    console.error(`${LOG} match recalc failed:`, matchRecalc.message);
    return NextResponse.json({ error: matchRecalc.message }, { status: 500 });
  }
```

- [ ] **Step 3: Extend the summary log + response**

Replace the final `console.log(...)` and `return NextResponse.json({...})` with:

```ts
  console.log(
    `${LOG} ok — provisional=${ingest.provisional} finalized=${ingest.finalized} ` +
      `predictionsUpdated=${recalc.updated} unmatched=${unmatched.length} ` +
      `matchesFilled=${matchIngest.filled} matchesFinalized=${matchIngest.finalized} ` +
      `matchPredictionsUpdated=${matchRecalc.updated} matchUnmatched=${matchMatch.unmatched.length}`,
  );
  return NextResponse.json({
    ok: true,
    groups: { provisional: ingest.provisional, finalized: ingest.finalized },
    predictionsUpdated: recalc.updated,
    unmatched,
    matches: { filled: matchIngest.filled, finalized: matchIngest.finalized },
    matchPredictionsUpdated: matchRecalc.updated,
    matchUnmatched: matchMatch.unmatched,
  });
```

- [ ] **Step 4: Verify the whole suite + types + build**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all PASS. (No route unit test exists; the route is validated by typecheck/build here and by the live `workflow_dispatch` run in rollout.)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/sync-results/route.ts
git commit -m "feat(sync): wire knockout matches path into sync-results route"
```

---

### Task 7: Admin ownership stamp + Auto badge

Make a manual team edit durable against auto, and surface the Auto marker on knockout cards.

**Files:**
- Modify: `src/app/actions.ts` (`updateMatchTeamsAction`)
- Modify: `src/screens/admin.tsx` (match card)

**Interfaces:**
- Consumes: `AutoBadge` (already imported in `admin.tsx`); `Match.finalizedSource` (existing).

- [ ] **Step 1: Stamp admin ownership on manual team edits**

In `src/app/actions.ts`, in `updateMatchTeamsAction`'s `.update({...})` object, add `finalized_source: "admin"` so a manual matchup edit freezes the row from auto (the reversible safety net). Insert after `away_seed`:

```ts
      home_seed: input.homeTeamId ? null : input.homeSeed?.trim() || null,
      away_seed: input.awayTeamId ? null : input.awaySeed?.trim() || null,
      finalized_source: "admin",
      updated_at: new Date().toISOString(),
      updated_by: admin.userId,
```

- [ ] **Step 2: Show the Auto badge on knockout match cards**

In `src/screens/admin.tsx`, in the `matches.map((match) => {` card (the `<div key={match.id} className="data-row admin-row">` block), add the badge next to the stage label. Change:

```tsx
                  <span>{stageLabels[match.stage]}</span>
```

to:

```tsx
                  <span>{stageLabels[match.stage]}{match.finalizedSource === "auto" && <AutoBadge />}</span>
```

- [ ] **Step 3: Verify types, lint, and the suite**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all PASS.

- [ ] **Step 4: Manual smoke (optional, recommended)**

Run: `npm run dev`, open the admin screen. Confirm knockout rows render and (after a sync writes `finalized_source='auto'`) show the **Auto** badge, matching the group cards. No console errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions.ts src/screens/admin.tsx
git commit -m "feat(admin): stamp admin source on matchup edits; Auto badge on knockout cards"
```

---

## Rollout (post-implementation, manual)

1. Apply `docs/supabase-migration-feed-match-id.sql` to Supabase.
2. Confirm `FOOTBALL_DATA_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` are set in the deploy env.
3. Trigger one manual sync (`workflow_dispatch` / the external scheduler's manual run). Inspect the JSON summary + logs:
   - Verify `matchUnmatched` is empty (or only expected entries). A non-empty `*:ambiguous` or unknown-stage warning means the **stage enum** or **TBD shape** differs from the assumption — fix the stage map / parser and re-run.
   - Confirm a few knockout fixtures filled teams and any already-finished match finalized with correct winner.
4. Let the existing 30-min schedule take over.

## Novedades modal

Per project convention, ask the user whether to add a Novedades entry (`src/components/novedades-modal.tsx`): the bracket now auto-fills teams + results, which is user-visible (predictions open as teams appear). Confirm before adding.

## Self-review notes (coverage map)

- Spec §1 Feed adapter → Task 2. §2 Matcher → Task 3. §3 Ingest → Task 4. §4 Recalc → Task 5. §5 Route → Task 6. §6 Ownership → Task 3 (skip) + Task 7 (admin stamp). §7 Migration → Task 1. §8 Auto badge → Task 7. §9 Testing → Tasks 2–5 unit tests + Task 6 suite/build + Task 7 typecheck. Auto-close regression is covered by the existing `getMatchStatus`/`canSavePrediction` behavior (no code change); the matcher's kickoff refresh keeps it accurate and is asserted in Task 3's by-id test.
