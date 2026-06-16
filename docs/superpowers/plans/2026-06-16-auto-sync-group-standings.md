# Auto-sync Group Standings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically pull World Cup group standings from football-data.org on a schedule and write provisional positions (auto-finalizing once a group is complete) into the `groups` table, with an admin-overridable "Auto" marker.

**Architecture:** A `CRON_SECRET`-protected Next.js route (`/api/sync-results`) fetches the standings feed, maps team TLAs to our team ids, computes per-group positions + completeness with a pure matcher, writes them via a Supabase service-role client honoring an ownership rule (auto never overwrites admin-edited rows), and recalculates group predictions. A free GitHub Action curls the route every 30 minutes.

**Tech Stack:** Next.js 15 (App Router route handler), TypeScript, Supabase (`@supabase/supabase-js` service client), Vitest, GitHub Actions.

**Scope note:** This plan covers the **group-standings** path only. The elimination-phase **match-results** path is a separate follow-up plan; the DB migration and admin-action stamping here are written to support both, so no rework is needed later.

---

## File Structure

**Created:**
- `docs/supabase-migration-result-source.sql` — adds `groups.result_source` + `matches.finalized_source`.
- `src/lib/sync/types.ts` — shared types (`FeedStanding`, `GroupStandingResult`, `SyncDb`).
- `src/lib/sync/tla.ts` — `resolveTeamId(tla, knownIds)` pure resolver + override map.
- `src/lib/sync/tla.test.ts`
- `src/lib/sync/football-data.ts` — `parseStandings(json)` + `fetchStandings(token)` feed adapter.
- `src/lib/sync/football-data.test.ts`
- `src/lib/sync/match-standings.ts` — `matchStandings(feed, groups, knownIds)` pure matcher (ownership + completeness + mapping).
- `src/lib/sync/match-standings.test.ts`
- `src/lib/sync/recalc.ts` — `recalcGroupPredictions(db, groups)` reusing `scoreGroupPredictionOrNull`.
- `src/lib/sync/recalc.test.ts`
- `src/lib/sync/ingest.ts` — `ingestStandings(db, results)` DB writer honoring auto-stamp.
- `src/lib/sync/ingest.test.ts`
- `src/app/api/sync-results/route.ts` — the protected route handler.
- `.github/workflows/sync-results.yml` — the scheduler.

**Modified:**
- `src/lib/types.ts` — add `Group.resultSource`, `Match.finalizedSource`.
- `src/lib/supabase-data.ts` — map the two new columns; export `mapGroupPrediction`.
- `src/lib/supabase-server.ts` — add `createSupabaseServiceClient()`.
- `src/app/actions.ts` — stamp `result_source:'admin'` / `finalized_source:'admin'`; map new columns in local mappers.
- `src/components/badges.tsx` — add `AutoBadge`.
- `src/screens/admin.tsx` — render `AutoBadge` in `GroupAdminCard`.
- `.env.example` — document new env vars.

---

## Task 1: Database migration

**Files:**
- Create: `docs/supabase-migration-result-source.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Adds a "who set this result" marker so the auto-sync job and the admin can
-- coexist: 'auto' = set by the sync route, 'admin' = set/overridden by a human.
-- null = legacy / not finalized. Auto-sync never overwrites an 'admin' row.

alter table public.matches
  add column if not exists finalized_source text
  check (finalized_source in ('admin', 'auto'));

alter table public.groups
  add column if not exists result_source text
  check (result_source in ('admin', 'auto'));
```

- [ ] **Step 2: Apply it to the database**

Run this SQL in the Supabase SQL editor (or `psql`). Expected: "Success. No rows returned." Verify with:

```sql
select column_name from information_schema.columns
where table_name = 'groups' and column_name = 'result_source';
```
Expected: one row, `result_source`.

- [ ] **Step 3: Commit**

```bash
git add docs/supabase-migration-result-source.sql
git commit -m "feat(db): add result_source/finalized_source markers for auto-sync"
```

---

## Task 2: Extend domain types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add `finalizedSource` to `Match`**

In `src/lib/types.ts`, inside the `Match` type, after the `updatedBy: string | null;` line add:

```typescript
  finalizedSource: "admin" | "auto" | null;
```

- [ ] **Step 2: Add `resultSource` to `Group`**

In the `Group` type, after `resultFinalizedBy: string | null;` add:

```typescript
  resultSource: "admin" | "auto" | null;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `src/lib/supabase-data.ts` and `src/app/actions.ts` (mappers don't yet set the new fields). These are fixed in Task 3. Do not fix anything else.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add result/finalized source to Group and Match"
```

---

## Task 3: Map the new columns

**Files:**
- Modify: `src/lib/supabase-data.ts`
- Modify: `src/app/actions.ts`

- [ ] **Step 1: Extend row types in `supabase-data.ts`**

In `src/lib/supabase-data.ts`, add to `type MatchRow` (after `updated_by: string | null;`):

```typescript
  finalized_source: "admin" | "auto" | null;
```

Add to `type GroupRow` (after `result_finalized_by: string | null;`):

```typescript
  result_source: "admin" | "auto" | null;
```

- [ ] **Step 2: Set the fields in the mappers (`supabase-data.ts`)**

In `mapMatch`, before the closing `};`, add:

```typescript
    finalizedSource: row.finalized_source ?? null,
```

In `mapGroup`, before the closing `};`, add:

```typescript
    resultSource: row.result_source ?? null,
```

- [ ] **Step 3: Export `mapGroup` and `mapGroupPrediction`**

In `src/lib/supabase-data.ts`, change `function mapGroup(` to `export function mapGroup(` (the route reuses it) and `function mapGroupPrediction(` to `export function mapGroupPrediction(` (the sync recalc reuses it).

- [ ] **Step 4: Set the fields in the duplicate mappers in `actions.ts`**

`src/app/actions.ts` has its own local `mapMatch` and `mapGroup`. Add the same two row fields to their inline row param types, and in each mapper's returned object add `finalizedSource: row.finalized_source ?? null,` (in `mapMatch`) and `resultSource: row.result_source ?? null,` (in `mapGroup`). Match the exact field names from Steps 1–2.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase-data.ts src/app/actions.ts
git commit -m "feat(data): map result_source/finalized_source columns"
```

---

## Task 4: Stamp admin actions as source='admin'

**Files:**
- Modify: `src/app/actions.ts`

- [ ] **Step 1: Stamp `saveGroupStandingsAction`**

In `saveGroupStandingsAction`, inside the `.update({ ... })` on the `groups` table, add after the `result_finalized_by:` line:

```typescript
      result_source: "admin",
```

- [ ] **Step 2: Stamp `finalizeMatchAction`**

In `finalizeMatchAction`, inside the `.update({ ... })` on the `matches` table, add after the `finalized_by: finalizedBy,` line:

```typescript
      finalized_source: input.status === "finalized" ? "admin" : null,
```

- [ ] **Step 3: Typecheck + existing tests**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/actions.ts
git commit -m "feat(actions): stamp admin-set results as source=admin"
```

---

## Task 5: Shared sync types

**Files:**
- Create: `src/lib/sync/types.ts`

- [ ] **Step 1: Write the types**

```typescript
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/sync/types.ts
git commit -m "feat(sync): shared types for results-sync subsystem"
```

---

## Task 6: TLA → team id resolver

**Files:**
- Create: `src/lib/sync/tla.ts`
- Test: `src/lib/sync/tla.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { resolveTeamId } from "./tla";

const known = new Set(["arg", "mex", "rsa"]);

describe("resolveTeamId", () => {
  it("lowercases a TLA into our team id", () => {
    expect(resolveTeamId("MEX", known)).toBe("mex");
  });

  it("returns null when the resolved id is not a known team", () => {
    expect(resolveTeamId("ZZZ", known)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sync/tla.test.ts`
Expected: FAIL — cannot find module `./tla`.

- [ ] **Step 3: Write the implementation**

```typescript
// Map a football-data.org team TLA to our team id. Our team ids are the FIFA
// TLAs lowercased (verified: all 32 played teams matched with zero exceptions).
// Add an entry here only if a real mismatch shows up in the unmatched log.
const TLA_OVERRIDES: Record<string, string> = {};

export function resolveTeamId(tla: string, knownIds: Set<string>): string | null {
  const id = TLA_OVERRIDES[tla] ?? tla.toLowerCase();
  return knownIds.has(id) ? id : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/sync/tla.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/tla.ts src/lib/sync/tla.test.ts
git commit -m "feat(sync): TLA to team id resolver"
```

---

## Task 7: Standings feed parser + fetcher

**Files:**
- Create: `src/lib/sync/football-data.ts`
- Test: `src/lib/sync/football-data.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { parseStandings } from "./football-data";

const sample = {
  standings: [
    {
      stage: "GROUP_STAGE",
      type: "TOTAL",
      group: "Group A",
      table: [
        { position: 1, team: { tla: "MEX" }, playedGames: 3 },
        { position: 2, team: { tla: "KOR" }, playedGames: 3 },
        { position: 3, team: { tla: "CZE" }, playedGames: 3 },
        { position: 4, team: { tla: "RSA" }, playedGames: 3 },
      ],
    },
  ],
};

describe("parseStandings", () => {
  it("extracts group label, ordered TLAs, and played counts", () => {
    const [group] = parseStandings(sample);
    expect(group.groupLabel).toBe("A");
    expect(group.positions).toEqual(["MEX", "KOR", "CZE", "RSA"]);
    expect(group.playedByPosition).toEqual([3, 3, 3, 3]);
  });

  it("ignores non-TOTAL standing blocks", () => {
    const withHome = { standings: [{ type: "HOME", group: "Group A", table: [] }, ...sample.standings] };
    expect(parseStandings(withHome)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sync/football-data.test.ts`
Expected: FAIL — cannot find module `./football-data`.

- [ ] **Step 3: Write the implementation**

```typescript
import type { FeedStanding } from "./types";

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/sync/football-data.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/football-data.ts src/lib/sync/football-data.test.ts
git commit -m "feat(sync): football-data standings parser and fetcher"
```

---

## Task 8: Standings matcher (ownership + completeness + mapping)

**Files:**
- Create: `src/lib/sync/match-standings.ts`
- Test: `src/lib/sync/match-standings.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import type { Group } from "../types";
import type { FeedStanding } from "./types";
import { matchStandings } from "./match-standings";

const known = new Set(["mex", "kor", "cze", "rsa", "arg", "bra", "ger", "esp"]);

function group(label: string, overrides: Partial<Group> = {}): Group {
  return {
    groupLabel: label, locksAt: null,
    firstTeamId: null, secondTeamId: null, thirdTeamId: null, fourthTeamId: null,
    resultFinalizedAt: null, resultFinalizedBy: null, resultSource: null, ...overrides,
  };
}

const feedA: FeedStanding = {
  groupLabel: "A", positions: ["MEX", "KOR", "CZE", "RSA"], playedByPosition: [3, 3, 3, 3],
};

describe("matchStandings", () => {
  it("maps positions to team ids and marks a fully-played group complete", () => {
    const { results, unmatched } = matchStandings([feedA], [group("A")], known);
    expect(unmatched).toEqual([]);
    expect(results).toEqual([
      { groupLabel: "A", firstTeamId: "mex", secondTeamId: "kor", thirdTeamId: "cze", fourthTeamId: "rsa", complete: true },
    ]);
  });

  it("marks a partially-played group as not complete", () => {
    const partial = { ...feedA, playedByPosition: [1, 1, 1, 1] };
    const { results } = matchStandings([partial], [group("A")], known);
    expect(results[0].complete).toBe(false);
  });

  it("skips a group already owned by admin", () => {
    const { results } = matchStandings([feedA], [group("A", { resultSource: "admin" })], known);
    expect(results).toEqual([]);
  });

  it("reports an unresolved TLA and skips that group", () => {
    const bad = { ...feedA, positions: ["MEX", "KOR", "CZE", "ZZZ"] };
    const { results, unmatched } = matchStandings([bad], [group("A")], known);
    expect(results).toEqual([]);
    expect(unmatched).toEqual(["A:ZZZ"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sync/match-standings.test.ts`
Expected: FAIL — cannot find module `./match-standings`.

- [ ] **Step 3: Write the implementation**

```typescript
import type { Group } from "../types";
import { resolveTeamId } from "./tla";
import type { FeedStanding, GroupStandingResult } from "./types";

export function matchStandings(
  feed: FeedStanding[],
  groups: Group[],
  knownIds: Set<string>,
): { results: GroupStandingResult[]; unmatched: string[] } {
  const groupByLabel = new Map(groups.map((g) => [g.groupLabel, g]));
  const results: GroupStandingResult[] = [];
  const unmatched: string[] = [];

  for (const standing of feed) {
    const group = groupByLabel.get(standing.groupLabel);
    if (!group) continue;
    if (group.resultSource === "admin") continue; // ownership: never overwrite a human

    const ids = standing.positions.map((tla) => resolveTeamId(tla, knownIds));
    const badIndex = ids.findIndex((id) => id === null);
    if (badIndex !== -1 || ids.length !== 4) {
      if (badIndex !== -1) unmatched.push(`${standing.groupLabel}:${standing.positions[badIndex]}`);
      continue;
    }

    results.push({
      groupLabel: standing.groupLabel,
      firstTeamId: ids[0] as string,
      secondTeamId: ids[1] as string,
      thirdTeamId: ids[2] as string,
      fourthTeamId: ids[3] as string,
      complete: standing.playedByPosition.length === 4 && standing.playedByPosition.every((p) => p === 3),
    });
  }

  return { results, unmatched };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/sync/match-standings.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/match-standings.ts src/lib/sync/match-standings.test.ts
git commit -m "feat(sync): standings matcher with ownership and completeness"
```

---

## Task 9: Group-prediction recalculation

**Files:**
- Create: `src/lib/sync/recalc.ts`
- Test: `src/lib/sync/recalc.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import type { Group } from "../types";
import type { SyncDb } from "./types";
import { recalcGroupPredictions } from "./recalc";

function finalizedGroup(): Group {
  return {
    groupLabel: "A", locksAt: null,
    firstTeamId: "mex", secondTeamId: "kor", thirdTeamId: "cze", fourthTeamId: "rsa",
    resultFinalizedAt: "2026-06-20T00:00:00.000Z", resultFinalizedBy: null, resultSource: "auto",
  };
}

// Fake SyncDb that returns one perfect group prediction and records updates.
function fakeDb(updates: Record<string, unknown>[]): SyncDb {
  return {
    from(table: string) {
      return {
        select() {
          return {
            in: async () => ({
              data: table === "group_predictions"
                ? [{
                    id: "gp1", user_id: "u1", group_label: "A",
                    first_team_id: "mex", second_team_id: "kor", third_team_id: "cze", fourth_team_id: "rsa",
                    points: null, exact_positions: 0, created_at: "", updated_at: "",
                  }]
                : [],
              error: null,
            }),
          };
        },
        update(values: Record<string, unknown>) {
          updates.push(values);
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };
}

describe("recalcGroupPredictions", () => {
  it("scores predictions against finalized standings", async () => {
    const updates: Record<string, unknown>[] = [];
    const result = await recalcGroupPredictions(fakeDb(updates), [finalizedGroup()]);
    expect(result.ok).toBe(true);
    expect(updates[0].points).toBe(28); // perfect: 10+8+6+4
    expect(updates[0].exact_positions).toBe(4);
  });

  it("is a no-op when there are no groups", async () => {
    const updates: Record<string, unknown>[] = [];
    const result = await recalcGroupPredictions(fakeDb(updates), []);
    expect(result.ok).toBe(true);
    expect(updates).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sync/recalc.test.ts`
Expected: FAIL — cannot find module `./recalc`.

- [ ] **Step 3: Write the implementation**

```typescript
import { scoreGroupPredictionOrNull } from "../scoring";
import { mapGroupPrediction } from "../supabase-data";
import type { Group } from "../types";
import type { DbResult, SyncDb } from "./types";

type RecalcResult = { ok: true; updated: number } | { ok: false; message: string };

export async function recalcGroupPredictions(db: SyncDb, groups: Group[]): Promise<RecalcResult> {
  if (groups.length === 0) return { ok: true, updated: 0 };

  const read = (await db
    .from("group_predictions")
    .select("*")
    .in("group_label", groups.map((g) => g.groupLabel))) as DbResult;
  if (read.error) return { ok: false, message: read.error.message };

  const groupByLabel = new Map(groups.map((g) => [g.groupLabel, g]));
  const updatedAt = new Date().toISOString();
  const rows = (read.data as Parameters<typeof mapGroupPrediction>[0][]) ?? [];

  const writes = rows.map(async (row) => {
    const prediction = mapGroupPrediction(row);
    const group = groupByLabel.get(prediction.groupLabel);
    if (!group) return null;
    const score = scoreGroupPredictionOrNull(group, prediction);
    return db
      .from("group_predictions")
      .update({ points: score.points, exact_positions: score.exactPositions, updated_at: updatedAt })
      .eq("id", prediction.id);
  });

  const results = await Promise.all(writes);
  const failed = results.find((r): r is DbResult => r !== null && r.error !== null);
  if (failed) return { ok: false, message: failed.error!.message };
  return { ok: true, updated: results.filter((r) => r !== null).length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/sync/recalc.test.ts`
Expected: PASS (2 tests). If `points` differs from 28, open `src/lib/scoring.ts` and use the actual `GROUP_POSITION_POINTS` sum in the assertion.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/recalc.ts src/lib/sync/recalc.test.ts
git commit -m "feat(sync): recalc group predictions against synced standings"
```

---

## Task 10: Standings ingest (DB writer)

**Files:**
- Create: `src/lib/sync/ingest.ts`
- Test: `src/lib/sync/ingest.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import type { GroupStandingResult } from "./types";
import { ingestStandings } from "./ingest";

type Call = { values: Record<string, unknown>; eqColumn: string; eqValue: string };

function fakeDb(calls: Call[]) {
  return {
    from() {
      return {
        select() { return { in: async () => ({ data: [], error: null }) }; },
        update(values: Record<string, unknown>) {
          return { eq: async (eqColumn: string, eqValue: string) => { calls.push({ values, eqColumn, eqValue }); return { error: null }; } };
        },
      };
    },
  };
}

const complete: GroupStandingResult = {
  groupLabel: "A", firstTeamId: "mex", secondTeamId: "kor", thirdTeamId: "cze", fourthTeamId: "rsa", complete: true,
};

describe("ingestStandings", () => {
  it("writes positions, stamps source=auto, and finalizes a complete group", async () => {
    const calls: Call[] = [];
    const result = await ingestStandings(fakeDb(calls), [complete]);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].eqColumn).toBe("group_label");
    expect(calls[0].eqValue).toBe("A");
    expect(calls[0].values.first_team_id).toBe("mex");
    expect(calls[0].values.result_source).toBe("auto");
    expect(calls[0].values.result_finalized_at).not.toBeNull();
  });

  it("leaves result_finalized_at null for an incomplete group", async () => {
    const calls: Call[] = [];
    await ingestStandings(fakeDb(calls), [{ ...complete, complete: false }]);
    expect(calls[0].values.result_finalized_at).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sync/ingest.test.ts`
Expected: FAIL — cannot find module `./ingest`.

- [ ] **Step 3: Write the implementation**

```typescript
import type { DbResult, SyncDb } from "./types";
import type { GroupStandingResult } from "./types";

type IngestResult =
  | { ok: true; provisional: number; finalized: number }
  | { ok: false; message: string };

export async function ingestStandings(db: SyncDb, results: GroupStandingResult[]): Promise<IngestResult> {
  const now = new Date().toISOString();
  let provisional = 0;
  let finalized = 0;

  for (const r of results) {
    const write = (await db
      .from("groups")
      .update({
        first_team_id: r.firstTeamId,
        second_team_id: r.secondTeamId,
        third_team_id: r.thirdTeamId,
        fourth_team_id: r.fourthTeamId,
        result_source: "auto",
        result_finalized_at: r.complete ? now : null,
        result_finalized_by: null,
        updated_at: now,
      })
      .eq("group_label", r.groupLabel)) as DbResult;
    if (write.error) return { ok: false, message: write.error.message };
    if (r.complete) finalized += 1; else provisional += 1;
  }

  return { ok: true, provisional, finalized };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/sync/ingest.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/ingest.ts src/lib/sync/ingest.test.ts
git commit -m "feat(sync): standings ingest writer with auto stamping"
```

---

## Task 11: Service-role Supabase client

**Files:**
- Modify: `src/lib/supabase-server.ts`

- [ ] **Step 1: Add the service-client factory**

Append to `src/lib/supabase-server.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client for system jobs (the sync route). Bypasses RLS, so it must
 * only ever be constructed inside server-only code gated by CRON_SECRET.
 */
export function createSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

(`@supabase/supabase-js` is already a dependency — see `package.json`.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase-server.ts
git commit -m "feat(sync): service-role supabase client factory"
```

---

## Task 12: The sync route handler

**Files:**
- Create: `src/app/api/sync-results/route.ts`

- [ ] **Step 1: Write the route**

```typescript
import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { mapGroup } from "@/lib/supabase-data";
import { fetchStandings } from "@/lib/sync/football-data";
import { ingestStandings } from "@/lib/sync/ingest";
import { matchStandings } from "@/lib/sync/match-standings";
import { recalcGroupPredictions } from "@/lib/sync/recalc";
import type { SyncDb } from "@/lib/sync/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) return NextResponse.json({ error: "missing FOOTBALL_DATA_TOKEN" }, { status: 500 });

  const supabase = createSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });
  const db = supabase as unknown as SyncDb;

  let feed;
  try {
    feed = await fetchStandings(token);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 502 });
  }

  const [groupsResult, teamsResult] = await Promise.all([
    supabase.from("groups").select("*"),
    supabase.from("teams").select("id"),
  ]);
  if (groupsResult.error) return NextResponse.json({ error: groupsResult.error.message }, { status: 500 });
  if (teamsResult.error) return NextResponse.json({ error: teamsResult.error.message }, { status: 500 });

  const groups = (groupsResult.data ?? []).map(mapGroup);
  const knownIds = new Set((teamsResult.data ?? []).map((t: { id: string }) => t.id));

  const { results, unmatched } = matchStandings(feed, groups, knownIds);

  const ingest = await ingestStandings(db, results);
  if (!ingest.ok) return NextResponse.json({ error: ingest.message }, { status: 500 });

  const writtenGroups = groups
    .filter((g) => results.some((r) => r.groupLabel === g.groupLabel))
    .map((g) => {
      const r = results.find((res) => res.groupLabel === g.groupLabel)!;
      return { ...g, firstTeamId: r.firstTeamId, secondTeamId: r.secondTeamId, thirdTeamId: r.thirdTeamId, fourthTeamId: r.fourthTeamId };
    });
  const recalc = await recalcGroupPredictions(db, writtenGroups);
  if (!recalc.ok) return NextResponse.json({ error: recalc.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    groups: { provisional: ingest.provisional, finalized: ingest.finalized },
    predictionsUpdated: recalc.updated,
    unmatched,
  });
}
```

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS; build output lists the `/api/sync-results` route.

- [ ] **Step 3: Manual smoke test (real DB + token)**

Set `CRON_SECRET`, `FOOTBALL_DATA_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, and the existing `NEXT_PUBLIC_SUPABASE_*` in `.env.local`. Run `npm run dev`, then:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/sync-results | python3 -m json.tool
```
Expected: JSON like `{ "ok": true, "groups": { "provisional": N, "finalized": M }, "predictionsUpdated": K, "unmatched": [] }`. Verify in Supabase that group rows now have positions + `result_source = 'auto'`. Re-run: a finalized group is skipped by ownership only if it became `admin`; an auto group stays auto and re-writes identically (idempotent).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/sync-results/route.ts
git commit -m "feat(sync): protected /api/sync-results route for group standings"
```

---

## Task 13: "Auto" badge in the admin screen

**Files:**
- Modify: `src/components/badges.tsx`
- Modify: `src/screens/admin.tsx`

- [ ] **Step 1: Add the `AutoBadge` component**

In `src/components/badges.tsx`, add (the file already imports `Badge` and `cn`):

```tsx
export function AutoBadge() {
  return (
    <Badge
      variant="outline"
      className="rounded-full bg-app-blue/10 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-app-blue"
      aria-label="Resultado cargado automáticamente"
    >
      Auto
    </Badge>
  );
}
```

- [ ] **Step 2: Render it in `GroupAdminCard`**

In `src/screens/admin.tsx`, import `AutoBadge` from `@/components/badges` (extend the existing badges import). In `GroupAdminCard`, in the header row (`<div className="flex items-center justify-between gap-2">`), wrap the `<strong>` and badge in a flex span so the badge sits next to the title:

```tsx
        <span className="flex items-center gap-2">
          <strong className="text-sm font-black">Grupo {group.groupLabel}</strong>
          {group.resultSource === "auto" && <AutoBadge />}
        </span>
```

(Replace the existing `<strong className="text-sm font-black">Grupo {group.groupLabel}</strong>` line with the span above; leave the `<small>` status element unchanged.)

- [ ] **Step 3: Typecheck + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/badges.tsx src/screens/admin.tsx
git commit -m "feat(admin): Auto badge on group cards set by the sync job"
```

---

## Task 14: GitHub Action scheduler + env docs

**Files:**
- Create: `.github/workflows/sync-results.yml`
- Modify: `.env.example`

- [ ] **Step 1: Write the workflow**

```yaml
name: Sync results

on:
  schedule:
    - cron: "*/30 * * * *"
  workflow_dispatch: {}

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger sync-results
        run: |
          code=$(curl -s -o /tmp/body.json -w "%{http_code}" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            "${{ secrets.SYNC_RESULTS_URL }}")
          echo "HTTP $code"; cat /tmp/body.json
          test "$code" = "200"
```

- [ ] **Step 2: Document env vars**

Append to `.env.example`:

```
# Auto-sync job (server-only; do not prefix with NEXT_PUBLIC)
FOOTBALL_DATA_TOKEN=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
```

- [ ] **Step 3: Configure secrets (manual, documented here)**

In the GitHub repo: Settings → Secrets and variables → Actions, add `CRON_SECRET` (same value as Vercel) and `SYNC_RESULTS_URL` (e.g. `https://<your-app>.vercel.app/api/sync-results`). In Vercel project env, add `FOOTBALL_DATA_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`. Redeploy.

- [ ] **Step 4: Validate the workflow runs**

Push the branch, then trigger the workflow manually (Actions tab → "Sync results" → "Run workflow"). Expected: green run, log shows `HTTP 200` and the JSON summary.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/sync-results.yml .env.example
git commit -m "feat(sync): GitHub Action scheduler and env docs"
```

---

## Task 15: Full verification + rollout

- [ ] **Step 1: Run the whole test suite + build**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all PASS.

- [ ] **Step 2: First-light backfill**

With the route deployed, trigger the workflow manually once. Confirm in the app's admin screen that live groups show provisional positions with the "Auto" badge, and any fully-played group shows finalized + recalculated points. Spot-check one group against the real standings.

- [ ] **Step 3: Enable the schedule**

The `*/30` cron is already active once the workflow file is on the default branch. Confirm a scheduled run appears in the Actions tab within ~30–45 min and returns `HTTP 200`.

- [ ] **Step 4: Ask about the Novedades modal**

Per project convention (CLAUDE.md), ask the user whether to add a Novedades entry. This is admin-facing automation, so it may not warrant a user-facing changelog note.

---

## Follow-up (separate plan): elimination match results

Not in scope here. A later plan adds the matches path reusing this scaffolding:
`parseFinishedMatches` + `fetchFinishedMatches` in `football-data.ts`, a `match-fixtures.ts` matcher (join by kickoff day + unordered team-id pair), a `recalcMatchPredictions` in `recalc.ts` (reusing `scorePrediction`), an `ingestMatches` writer (stamp `finalized_source='auto'`, status `'finalized'`), wiring both into the route, and the `AutoBadge` in the match admin card. The migration and admin-action stamping done in this plan already cover it.
```
