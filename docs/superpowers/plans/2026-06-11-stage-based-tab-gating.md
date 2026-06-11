# Stage-based Tab Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `stages` the single source of truth for tab gating — each stage carries `predictions_open`, `results_open`, `standings_open` — deriving Resultados/Tabla visibility and a revealed-scoped accumulated leaderboard from those flags, and removing the `app_settings` feature.

**Architecture:** Rename `stages.open`→`predictions_open` and add two sibling flags. Move leaderboard logic into `src/lib/standings.ts` with a revealed-scoped accumulated `getLeaderboard` plus a new `getStageLeaderboard`. Derive tab visibility via helpers in `src/lib/tab-visibility.ts`. Tabla and Resultados become stage-tabbed via a generalized `StageTabs`. The admin panel gets three per-stage toggles.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Supabase (Postgres + RLS), Vitest, Tailwind.

---

## ⚠️ Compile-coupling note

Tasks 1 and 3 are pure logic verified with **targeted `vitest run`** (Vitest transpiles per-file and does not typecheck the whole project, so their tests pass even mid-refactor).

**Tasks 2 and 4–12 are compile-coupled:** `npx tsc --noEmit` is expected to be **RED** from Task 2 until **Task 13** closes the loop. Do not treat intermediate `tsc` failures as regressions during that stretch; each such task only commits and moves on. Task 13 is the green gate (tsc + build + full test suite). Implement Tasks 2–13 as one chunk if using subagent-driven execution.

---

## File Structure

- `src/lib/standings.ts` — leaderboard logic: `buildLeaderboard` core, revealed-scoped `getLeaderboard`, `getStageLeaderboard`, `LeaderboardRow`, plus existing `getInitials`/`podiumOrder`.
- `src/lib/standings.test.ts` — add leaderboard tests (keeps existing initials/podium tests).
- `src/lib/tab-visibility.ts` — `getPredictionsStages`, `getStandingsStages`, `getResultsStages`.
- `src/lib/tab-visibility.test.ts` — rewritten for the new helpers.
- `src/lib/types.ts` — `StageState` fields; `StageFlag`; remove `AppSetting*`.
- `src/lib/supabase-data.ts` — `StageRow`/`mapStage`; remove `app_settings`.
- `src/lib/seed.ts` — stage flags; remove `appSettings`.
- `src/app/actions.ts` — `updateStageFlagAction`; remove `updateTabVisibilityAction`; rename predictions selects.
- `src/components/app-context.tsx` — context shape.
- `src/components/app-shell.tsx` — derived sets/visibility, guards, pill, `updateStageFlag`.
- `src/components/badges.tsx` — `StageTabs` takes `enabledStages`.
- `src/screens/results.tsx` — results_open ∩ content.
- `src/screens/predictions.tsx` — `StageTabs` + `getLeaderboard` migration.
- `src/screens/admin.tsx` — three per-stage toggles; remove Pestañas card.
- `src/screens/leaderboard.tsx` — Acumulado + per-stage standings; ui-tokens cleanup.
- `src/lib/ui-tokens.ts` — remove `getLeaderboard`/`LeaderboardRow` (moved).
- `docs/supabase-schema.sql` + `docs/supabase-migration-stage-results-standings.sql`.

---

### Task 1: Standings module (TDD)

Move/expand leaderboard logic into `standings.ts`. Additive — `ui-tokens.ts` keeps its old `getLeaderboard` until Task 13, so `tsc` stays green here.

**Files:**
- Modify: `src/lib/standings.ts`
- Test: `src/lib/standings.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/standings.test.ts` (keep the existing tests). Merge `getLeaderboard`, `getStageLeaderboard` into the **existing** `./standings` import line (avoid a duplicate import statement — eslint `import/no-duplicates`), so it reads `import { getInitials, getLeaderboard, getStageLeaderboard, podiumOrder } from "./standings";`. Add the new `./types` import and the fixtures/tests below:

```ts
import type { GroupPrediction, Match, Prediction, Profile } from "./types";

const profiles: Profile[] = [
  { id: "u1", displayName: "Ana", email: "a@x.com", approved: true, role: "user" },
  { id: "u2", displayName: "Beto", email: "b@x.com", approved: true, role: "user" },
  { id: "u3", displayName: "Cata", email: "c@x.com", approved: false, role: "user" },
];

const matches: Match[] = [
  { id: "m1", matchNo: 1, stage: "round32", homeTeamId: "a", awayTeamId: "b", kickoffUtc: "2026-06-01T00:00:00.000Z", homeScore: 1, awayScore: 0, winnerTeamId: "a", finalizedAt: null, finalizedBy: null, updatedAt: null, updatedBy: null },
  { id: "m2", matchNo: 2, stage: "round16", homeTeamId: "a", awayTeamId: "b", kickoffUtc: "2026-06-02T00:00:00.000Z", homeScore: 2, awayScore: 1, winnerTeamId: "a", finalizedAt: null, finalizedBy: null, updatedAt: null, updatedBy: null },
];

function pred(id: string, userId: string, matchId: string, points: number, exact = false): Prediction {
  return { id, userId, matchId, homeScore: 0, awayScore: 0, winnerTeamId: null, points, exactHit: exact, outcomeHit: !exact, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z" };
}

const predictions: Prediction[] = [
  pred("p1", "u1", "m1", 10, true), // round32
  pred("p2", "u1", "m2", 5), // round16
  pred("p3", "u2", "m1", 3), // round32
];

const groupPredictions: GroupPrediction[] = [
  { id: "g1", userId: "u1", groupLabel: "A", firstTeamId: "a", secondTeamId: "b", thirdTeamId: "c", fourthTeamId: "d", points: 8, exactPositions: 2, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-05-01T00:00:00.000Z" },
];

describe("getLeaderboard (revealed-scoped)", () => {
  it("sums only revealed stages and excludes groups when not revealed", () => {
    const rows = getLeaderboard({ predictions, profiles, groupPredictions, matches, standingsStages: new Set(["round32"]) });
    const u1 = rows.find((r) => r.user.id === "u1")!;
    const u2 = rows.find((r) => r.user.id === "u2")!;
    expect(u1.points).toBe(10); // round32 only, no round16, no groups
    expect(u2.points).toBe(3);
    expect(rows.some((r) => r.user.id === "u3")).toBe(false); // unapproved excluded
  });

  it("includes groups points only when groups is revealed", () => {
    const rows = getLeaderboard({ predictions, profiles, groupPredictions, matches, standingsStages: new Set(["round32", "groups"]) });
    expect(rows.find((r) => r.user.id === "u1")!.points).toBe(18); // 10 + 8 groups
  });

  it("ranks by points then exact hits", () => {
    const rows = getLeaderboard({ predictions, profiles, groupPredictions, matches, standingsStages: new Set(["round32", "round16"]) });
    expect(rows[0].user.id).toBe("u1"); // 15 > 3
    expect(rows[0].rank).toBe(1);
  });
});

describe("getStageLeaderboard", () => {
  it("returns only that stage's match points", () => {
    const rows = getStageLeaderboard("round16", { predictions, profiles, groupPredictions, matches });
    expect(rows.find((r) => r.user.id === "u1")!.points).toBe(5);
    expect(rows.find((r) => r.user.id === "u2")!.points).toBe(0);
  });

  it("uses group predictions for the groups stage", () => {
    const rows = getStageLeaderboard("groups", { predictions, profiles, groupPredictions, matches });
    expect(rows.find((r) => r.user.id === "u1")!.points).toBe(8);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/standings.test.ts`
Expected: FAIL — `getLeaderboard`/`getStageLeaderboard` not exported from `./standings`.

- [ ] **Step 3: Implement the functions**

Add to the top of `src/lib/standings.ts` (above `getInitials`), keeping the existing functions:

```ts
import type { GroupPrediction, Match, Prediction, Profile, Stage } from "./types";

type LeaderboardInput = {
  profiles: Profile[];
  predictions: Prediction[];
  groupPredictions: GroupPrediction[];
};

function buildLeaderboard({ profiles, predictions, groupPredictions }: LeaderboardInput) {
  const rows = profiles
    .filter((profile) => profile.approved)
    .map((user) => {
      const userPredictions = predictions.filter((prediction) => prediction.userId === user.id);
      const userGroupPredictions = groupPredictions.filter((prediction) => prediction.userId === user.id);
      const matchPoints = userPredictions.reduce((total, prediction) => total + (prediction.points ?? 0), 0);
      const groupPoints = userGroupPredictions.reduce((total, prediction) => total + (prediction.points ?? 0), 0);
      const groupExactPositions = userGroupPredictions.reduce((total, prediction) => total + prediction.exactPositions, 0);
      const updatedAts = [
        ...userPredictions.map((prediction) => prediction.updatedAt),
        ...userGroupPredictions.map((prediction) => prediction.updatedAt),
      ].sort();
      return {
        user,
        points: matchPoints + groupPoints,
        exactHits: userPredictions.filter((prediction) => prediction.exactHit).length + groupExactPositions,
        outcomeHits: userPredictions.filter((prediction) => prediction.outcomeHit).length,
        firstUpdatedAt: updatedAts[0] ?? "9999",
        rank: 0,
      };
    })
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.exactHits !== a.exactHits) return b.exactHits - a.exactHits;
      if (b.outcomeHits !== a.outcomeHits) return b.outcomeHits - a.outcomeHits;
      if (a.firstUpdatedAt !== b.firstUpdatedAt) return a.firstUpdatedAt.localeCompare(b.firstUpdatedAt);
      return a.user.displayName.localeCompare(b.user.displayName);
    });

  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

export type LeaderboardRow = ReturnType<typeof buildLeaderboard>[number];

function stageByMatchId(matches: Match[]): Map<string, Stage> {
  return new Map(matches.map((match) => [match.id, match.stage]));
}

/** Accumulated leaderboard over the revealed (standings_open) stages only. */
export function getLeaderboard({
  predictions,
  profiles,
  groupPredictions,
  matches,
  standingsStages,
}: {
  predictions: Prediction[];
  profiles: Profile[];
  groupPredictions: GroupPrediction[];
  matches: Match[];
  standingsStages: Set<Stage>;
}): LeaderboardRow[] {
  const byMatch = stageByMatchId(matches);
  const predSubset = predictions.filter((prediction) => {
    const stage = byMatch.get(prediction.matchId);
    return stage ? standingsStages.has(stage) : false;
  });
  const groupSubset = standingsStages.has("groups") ? groupPredictions : [];
  return buildLeaderboard({ profiles, predictions: predSubset, groupPredictions: groupSubset });
}

/** Leaderboard of points earned in a single stage. */
export function getStageLeaderboard(
  stage: Stage,
  {
    predictions,
    profiles,
    groupPredictions,
    matches,
  }: {
    predictions: Prediction[];
    profiles: Profile[];
    groupPredictions: GroupPrediction[];
    matches: Match[];
  },
): LeaderboardRow[] {
  if (stage === "groups") {
    return buildLeaderboard({ profiles, predictions: [], groupPredictions });
  }
  const byMatch = stageByMatchId(matches);
  const predSubset = predictions.filter((prediction) => byMatch.get(prediction.matchId) === stage);
  return buildLeaderboard({ profiles, predictions: predSubset, groupPredictions: [] });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/standings.test.ts`
Expected: PASS (existing initials/podium tests + the new leaderboard tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/standings.ts src/lib/standings.test.ts
git commit -m "feat(standings): revealed-scoped leaderboard and per-stage standings"
```

---

### Task 2: Types

`tsc` goes RED after this task (consumers updated in later tasks).

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Update `StageState` and add `StageFlag`; remove AppSetting types**

In `src/lib/types.ts`, replace the `StageState` type:

```ts
export type StageState = {
  stage: Stage;
  label: string;
  predictionsOpen: boolean;
  resultsOpen: boolean;
  standingsOpen: boolean;
};

export type StageFlag = "predictions" | "results" | "standings";
```

Remove the `AppSettingKey` and `AppSetting` types entirely (added by the previous feature).

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): per-stage results/standings flags; drop AppSetting"
```

---

### Task 3: tab-visibility helpers (TDD)

Verified via targeted `vitest run` (whole-project `tsc` stays red).

**Files:**
- Modify: `src/lib/tab-visibility.ts` (full rewrite)
- Test: `src/lib/tab-visibility.test.ts` (full rewrite)

- [ ] **Step 1: Rewrite the test**

Replace the entire contents of `src/lib/tab-visibility.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { getPredictionsStages, getResultsStages, getStandingsStages } from "./tab-visibility";
import type { Match, StageState } from "./types";

function stage(partial: Partial<StageState> & { stage: StageState["stage"] }): StageState {
  return {
    label: partial.stage,
    predictionsOpen: false,
    resultsOpen: false,
    standingsOpen: false,
    ...partial,
  };
}

const finalizedMatch: Match = {
  id: "m1", matchNo: 1, stage: "round32", homeTeamId: "a", awayTeamId: "b",
  kickoffUtc: "2026-06-01T00:00:00.000Z", status: "finalized", homeScore: 1, awayScore: 0,
  winnerTeamId: "a", finalizedAt: "2026-06-01T02:00:00.000Z", finalizedBy: "u1", updatedAt: null, updatedBy: null,
};

const stages: StageState[] = [
  stage({ stage: "round32", predictionsOpen: true, resultsOpen: true, standingsOpen: true }),
  stage({ stage: "round16", resultsOpen: true }), // results_open but no content
];

describe("stage gating helpers", () => {
  it("getPredictionsStages returns predictionsOpen stages", () => {
    expect(getPredictionsStages(stages)).toEqual(new Set(["round32"]));
  });

  it("getStandingsStages returns standingsOpen stages", () => {
    expect(getStandingsStages(stages)).toEqual(new Set(["round32"]));
  });

  it("getResultsStages requires both results_open AND content", () => {
    const result = getResultsStages(stages, [finalizedMatch], []);
    expect(result.has("round32")).toBe(true); // open + content
    expect(result.has("round16")).toBe(false); // open but no content
  });

  it("getResultsStages excludes a stage with content but results_open off", () => {
    const closed: StageState[] = [stage({ stage: "round32", resultsOpen: false })];
    expect(getResultsStages(closed, [finalizedMatch], [])).toEqual(new Set());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/tab-visibility.test.ts`
Expected: FAIL — `getPredictionsStages`/`getResultsStages`/`getStandingsStages` not exported.

- [ ] **Step 3: Rewrite the helper**

Replace the entire contents of `src/lib/tab-visibility.ts`:

```ts
import type { Group, Match, Stage, StageState } from "./types";
import { getStagesWithContent } from "./results";

export function getPredictionsStages(stages: StageState[]): Set<Stage> {
  return new Set(stages.filter((stage) => stage.predictionsOpen).map((stage) => stage.stage));
}

export function getStandingsStages(stages: StageState[]): Set<Stage> {
  return new Set(stages.filter((stage) => stage.standingsOpen).map((stage) => stage.stage));
}

/** Stages whose results are revealed: admin flag AND finalized content present. */
export function getResultsStages(stages: StageState[], matches: Match[], groups: Group[]): Set<Stage> {
  const content = getStagesWithContent(matches, groups);
  return new Set(
    stages.filter((stage) => stage.resultsOpen && content.has(stage.stage)).map((stage) => stage.stage),
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/tab-visibility.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tab-visibility.ts src/lib/tab-visibility.test.ts
git commit -m "feat(tabs): derive stage gating sets from stage flags"
```

---

### Task 4: Data layer

**Files:**
- Modify: `src/lib/supabase-data.ts`

- [ ] **Step 1: Update `StageRow`**

Replace the `StageRow` type:

```ts
type StageRow = {
  stage: Stage;
  label: string;
  predictions_open: boolean;
  results_open: boolean;
  standings_open: boolean;
};
```

- [ ] **Step 2: Update `mapStage`**

Replace `mapStage`:

```ts
function mapStage(row: StageRow): StageState {
  return {
    stage: row.stage,
    label: row.label,
    predictionsOpen: row.predictions_open,
    resultsOpen: row.results_open,
    standingsOpen: row.standings_open,
  };
}
```

- [ ] **Step 3: Remove all `app_settings` plumbing**

Delete: the `AppSettingRow` type; the `appSettings: AppSetting[]` field from `SupabaseAppData`; the `app_settings` entry in the `Promise.all` and its `appSettingsResult` destructuring; `appSettingsResult` from the `results` error-check array; the `appSettings: (...).map(mapAppSetting)` line in the return; and the `mapAppSetting` function. Remove `AppSetting` and `AppSettingKey` from the type import block (keep `StageState`, `Stage`, etc.).

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase-data.ts
git commit -m "feat(data): map stage flags; remove app_settings load"
```

---

### Task 5: Seed

**Files:**
- Modify: `src/lib/seed.ts`

- [ ] **Step 1: Update the stages seed and import**

Change the import on line 1 to drop `AppSetting`:

```ts
import type { Group, GroupPrediction, Match, Prediction, Profile, StageState, Team } from "./types";
```

Replace the `stages` array:

```ts
export const stages: StageState[] = [
  { stage: "groups", label: "Grupos", predictionsOpen: true, resultsOpen: true, standingsOpen: true },
  { stage: "round32", label: "16avos", predictionsOpen: false, resultsOpen: false, standingsOpen: false },
  { stage: "round16", label: "Octavos", predictionsOpen: false, resultsOpen: false, standingsOpen: false },
  { stage: "quarter", label: "Cuartos", predictionsOpen: false, resultsOpen: false, standingsOpen: false },
  { stage: "semi", label: "Semis", predictionsOpen: false, resultsOpen: false, standingsOpen: false },
  { stage: "third", label: "3er puesto", predictionsOpen: false, resultsOpen: false, standingsOpen: false },
  { stage: "final", label: "Final", predictionsOpen: false, resultsOpen: false, standingsOpen: false },
];
```

- [ ] **Step 2: Remove the `appSettings` seed export**

Delete the `export const appSettings: AppSetting[] = [...]` block.

- [ ] **Step 3: Commit**

```bash
git add src/lib/seed.ts
git commit -m "feat(seed): stage flags; drop appSettings seed"
```

---

### Task 6: Actions

**Files:**
- Modify: `src/app/actions.ts`

- [ ] **Step 1: Update the type import**

In the `@/lib/types` import block, remove `AppSettingKey` and add `StageFlag`:

```ts
import type {
  Group,
  GroupPrediction,
  Match,
  MatchLifecycleStatus,
  Prediction,
  Profile,
  Stage,
  StageFlag,
} from "@/lib/types";
```

- [ ] **Step 2: Replace the stage-toggle input type and action**

Remove `UpdateStageInput` and `UpdateTabVisibilityInput` and their actions (`updateStageOpenAction`, `updateTabVisibilityAction`). Add:

```ts
type UpdateStageFlagInput = {
  stage: Stage;
  flag: StageFlag;
  value: boolean;
};

const STAGE_FLAG_COLUMN: Record<StageFlag, "predictions_open" | "results_open" | "standings_open"> = {
  predictions: "predictions_open",
  results: "results_open",
  standings: "standings_open",
};

export async function updateStageFlagAction(input: UpdateStageFlagInput) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Supabase no está configurado." };

  const admin = await requireAdmin(supabase);
  if (!admin.ok) return admin;

  const column = STAGE_FLAG_COLUMN[input.flag];
  const update: Record<string, unknown> = { [column]: input.value };
  if (input.flag === "predictions") {
    update.opened_at = input.value ? new Date().toISOString() : null;
    update.opened_by = input.value ? admin.userId : null;
  }

  const { error } = await supabase.from("stages").update(update).eq("stage", input.stage);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/");
  return { ok: true, message: input.value ? "Etapa habilitada." : "Etapa deshabilitada." };
}
```

- [ ] **Step 3: Rename the predictions selects in the save actions**

In `savePredictionAction` and `saveGroupPredictionAction`, the stages query is:

```ts
supabase.from("stages").select("stage, open").eq("open", true),
```

Change both to:

```ts
supabase.from("stages").select("stage, predictions_open").eq("predictions_open", true),
```

(The `openStages` set built from `stagesResult.data` still reads `stage.stage` — leave that unchanged.)

- [ ] **Step 4: Commit**

```bash
git add src/app/actions.ts
git commit -m "feat(actions): updateStageFlagAction; drop app_settings action"
```

---

### Task 7: Context

**Files:**
- Modify: `src/components/app-context.tsx`

- [ ] **Step 1: Update imports**

In the `@/lib/types` import, remove `AppSettingKey`, add `StageFlag`:

```ts
import type {
  Group,
  GroupPrediction,
  Match,
  Prediction,
  Profile,
  Stage,
  StageFlag,
  StageState,
  Team,
} from "@/lib/types";
```

- [ ] **Step 2: Update `AppContextValue`**

Remove `standingsVisible`, `resultsVisible`, `updateTabVisibility`, and `updateStageOpen`. Keep `openStages`. Add after `openStages: Set<Stage>;`:

```ts
  openStages: Set<Stage>;
  resultsStages: Set<Stage>;
  standingsStages: Set<Stage>;
```

And in the methods section (where `updateStageOpen` was) add:

```ts
  updateStageFlag: (stage: Stage, flag: StageFlag, value: boolean) => Promise<void> | void;
```

- [ ] **Step 3: Commit**

```bash
git add src/components/app-context.tsx
git commit -m "feat(context): expose stage gating sets and updateStageFlag"
```

---

### Task 8: StageTabs generalization

**Files:**
- Modify: `src/components/badges.tsx`

- [ ] **Step 1: Replace the `StageTabs` signature and derivation**

Replace the `StageTabs` function header and the `openStageSet` line. New signature/body start:

```ts
export function StageTabs({
  activeStage,
  enabledStages,
  onChange,
  showDisabled = true,
}: {
  activeStage: Stage;
  enabledStages: Set<Stage>;
  onChange?: (stage: Stage) => void;
  showDisabled?: boolean;
}) {
```

Delete the line:

```ts
  const openStageSet = new Set(stages.filter((stage) => stage.open).map((stage) => stage.stage));
```

Replace the two `disabled={showDisabled ? !openStageSet.has(stage) : false}` occurrences with:

```ts
              disabled={showDisabled ? !enabledStages.has(stage) : false}
```

(`SelectItem` and `TabsTrigger` each have one.) Remove the now-unused `StageState` import from `@/lib/types` if nothing else in the file uses it (check; `MatchStatus`/`Stage` stay).

- [ ] **Step 2: Commit**

```bash
git add src/components/badges.tsx
git commit -m "refactor(tabs): StageTabs takes explicit enabledStages set"
```

---

### Task 9: App shell

**Files:**
- Modify: `src/components/app-shell.tsx`

- [ ] **Step 1: Update imports**

- Remove `updateTabVisibilityAction` and `updateStageOpenAction` from the `@/app/actions` import; add `updateStageFlagAction`.
- Remove `appSettings as seedAppSettings` from the seed import.
- In `@/lib/types`, remove `AppSetting`/`AppSettingKey`; add `StageFlag` (keep `StageState`, `Stage`, etc.).
- Change the `@/lib/ui-tokens` import to drop `getLeaderboard` (keep `pageTitles, tabRoutes, ui, AppRoute`).
- Replace the `@/lib/tab-visibility` import (`getTabVisibility`) with: `import { getPredictionsStages, getResultsStages, getStandingsStages } from "@/lib/tab-visibility";`
- Add: `import { getLeaderboard } from "@/lib/standings";`

- [ ] **Step 2: Remove app_settings state, add derived sets/booleans**

Remove the `appSettings` state line and the `getTabVisibility` usage. Replace the `openStages` memo with:

```ts
  const openStages = useMemo(() => getPredictionsStages(stages), [stages]);
  const resultsStages = useMemo(() => getResultsStages(stages, matches, groups), [stages, matches, groups]);
  const standingsStages = useMemo(() => getStandingsStages(stages), [stages]);
  const standingsTabVisible = standingsStages.size > 0;
  const resultsTabVisible = resultsStages.size > 0;
```

- [ ] **Step 3: Update the `me` leaderboard call**

Replace the `me` memo body:

```ts
  const me = useMemo(
    () =>
      getLeaderboard({ predictions, profiles, groupPredictions, matches, standingsStages }).find(
        (row) => row.user.id === currentUser?.id,
      ),
    [predictions, profiles, groupPredictions, matches, standingsStages, currentUser],
  );
```

- [ ] **Step 4: Remove appSettings load/clear**

In `refreshSupabaseData`, delete the `setAppSettings(appData.appSettings);` line. In `signOut`, delete the `setAppSettings([]);` line.

- [ ] **Step 5: Update the redirect guard**

Replace the redirect `useEffect` body conditions so they use the derived booleans:

```ts
  useEffect(() => {
    if (!currentUser) return;
    if (activeTab === "admin" && !isAdmin) {
      router.replace(tabRoutes.predictions);
      return;
    }
    if (activeTab === "leaderboard" && !standingsTabVisible) {
      router.replace(tabRoutes.predictions);
      return;
    }
    if (activeTab === "results" && !resultsTabVisible) {
      router.replace(tabRoutes.predictions);
    }
  }, [activeTab, currentUser, isAdmin, standingsTabVisible, resultsTabVisible, router]);
```

- [ ] **Step 6: Replace `updateStageOpen` with `updateStageFlag`**

Replace the `updateStageOpen` function:

```ts
  async function updateStageFlag(stage: Stage, flag: StageFlag, value: boolean) {
    const column = flag === "predictions" ? "predictionsOpen" : flag === "results" ? "resultsOpen" : "standingsOpen";
    setStages((current) => current.map((item) => (item.stage === stage ? { ...item, [column]: value } : item)));
    const result = await updateStageFlagAction({ stage, flag, value });
    setDataMessage(result.message);
    if (result.ok) await refreshSupabaseData();
  }
```

- [ ] **Step 7: Update the mobile stats pill condition**

The pill currently branches on `standingsVisible`; change it to `standingsTabVisible` (the pill IIFE built in the previous feature — replace the `!standingsVisible` and `standingsVisible ?` references with `!standingsTabVisible` / `standingsTabVisible ?`).

- [ ] **Step 8: Update the context value and Sidebar props**

In `contextValue`, remove `standingsVisible`, `resultsVisible`, `updateTabVisibility`, `updateStageOpen`; add `resultsStages`, `standingsStages` (next to `openStages`) and `updateStageFlag`.

The `Sidebar`/`SidebarContent` props that were `standingsVisible`/`resultsVisible` become `standingsTabVisible`/`resultsTabVisible`. Update `SidebarContentProps`, the destructuring, and both call sites accordingly, and the two `NavLink`s:

```tsx
        <NavLink href={tabRoutes.leaderboard} icon={<Trophy />} label="Tabla" active={activeTab === "leaderboard"} disabled={!standingsTabVisible} onNavigate={onNavigate} />
        <NavLink href={tabRoutes.results} icon={<CalendarClock />} label="Resultados" active={activeTab === "results"} disabled={!resultsTabVisible} onNavigate={onNavigate} />
```

- [ ] **Step 9: Commit**

```bash
git add src/components/app-shell.tsx
git commit -m "feat(shell): derive tab gating from stage flags"
```

---

### Task 10: Results screen

**Files:**
- Modify: `src/screens/results.tsx`

- [ ] **Step 1: Use `resultsStages` from context as enabled set**

Pull `resultsStages` from `useApp()` (add to the destructure on line 40). Remove the `stageTabsState` memo entirely. Change the default active stage so it falls inside the revealed set, and pass `enabledStages`:

Replace the `activeStage` initializer:

```ts
  const [activeStage, setActiveStage] = useState<Stage>(() => {
    const preferred = getDefaultResultStage(matches, groups, now);
    if (resultsStages.has(preferred)) return preferred;
    return stageOrder.find((stage) => resultsStages.has(stage)) ?? preferred;
  });
```

Replace the `StageTabs` usage:

```tsx
      <StageTabs activeStage={activeStage} enabledStages={resultsStages} onChange={setActiveStage} />
```

Remove the now-unused `StageState` and `stageLabels` imports if nothing else uses them (verify; `stageOrder` is still used).

- [ ] **Step 2: Commit**

```bash
git add src/screens/results.tsx
git commit -m "feat(results): gate stages by results_open + content"
```

---

### Task 11: Predictions screen

**Files:**
- Modify: `src/screens/predictions.tsx`

- [ ] **Step 1: Migrate the leaderboard import + call**

Change the `@/lib/ui-tokens` import to drop `getLeaderboard`/`LeaderboardRow` (keep `compareGroups`, `ui`):

```ts
import { compareGroups, ui } from "@/lib/ui-tokens";
import { getLeaderboard, type LeaderboardRow } from "@/lib/standings";
```

Add `standingsStages` to the `useApp()` destructure. Replace the leaderboard memo:

```ts
  const leaderboard = useMemo(
    () => getLeaderboard({ predictions, profiles, groupPredictions, matches, standingsStages }),
    [predictions, profiles, groupPredictions, matches, standingsStages],
  );
```

(Adjust the variable name to match the existing one at line ~128 — keep whatever it is assigned to; only the call changes.)

- [ ] **Step 2: Update the `StageTabs` usage**

The predictions `StageTabs` currently passes `stages={stages}`. Change to:

```tsx
        <StageTabs activeStage={activeStage} enabledStages={openStages} onChange={setActiveStage} />
```

(`openStages` is already destructured from `useApp()` in this screen. If `stages` is no longer used elsewhere in the file, remove it from the destructure.)

- [ ] **Step 3: Commit**

```bash
git add src/screens/predictions.tsx
git commit -m "feat(predictions): enabledStages tabs + revealed leaderboard"
```

---

### Task 12: Admin screen

**Files:**
- Modify: `src/screens/admin.tsx`

- [ ] **Step 1: Update the context destructure**

In `AdminScreen`'s `useApp()`: remove `updateStageOpen`, `standingsVisible`, `resultsVisible`, `updateTabVisibility`; add `updateStageFlag`. Keep `stages`.

- [ ] **Step 2: Replace the "Etapas habilitadas" stage rows with three toggles**

Replace the `stageOrder.map(...)` block inside the "Etapas habilitadas" card body with:

```tsx
              {stageOrder.map((stage) => {
                const stageState = stages.find((item) => item.stage === stage);
                const flags = [
                  { flag: "predictions" as const, label: "Predicciones", value: Boolean(stageState?.predictionsOpen) },
                  { flag: "results" as const, label: "Resultados", value: Boolean(stageState?.resultsOpen) },
                  { flag: "standings" as const, label: "Standings", value: Boolean(stageState?.standingsOpen) },
                ];

                return (
                  <div className="stage-admin-row" key={stage}>
                    <div>
                      <strong>{stageLabels[stage]}</strong>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {flags.map(({ flag, label, value }) => {
                        const key = `stage-${stage}-${flag}`;
                        return (
                          <Button
                            key={flag}
                            variant={value ? "default" : "outline"}
                            size="sm"
                            disabled={Boolean(pendingAdminAction)}
                            onClick={() => runAdminAction(key, () => updateStageFlag(stage, flag, !value))}
                          >
                            <LoadingLabel loading={pendingAdminAction === key} label={label} />
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
```

- [ ] **Step 3: Remove the "Pestañas visibles" card**

Delete the entire `Card` titled "Pestañas visibles" (added by the previous feature).

- [ ] **Step 4: Commit**

```bash
git add src/screens/admin.tsx
git commit -m "feat(admin): per-stage predictions/results/standings toggles"
```

---

### Task 13: Tabla screen + ui-tokens cleanup (GREEN GATE)

**Files:**
- Modify: `src/screens/leaderboard.tsx`
- Modify: `src/lib/ui-tokens.ts`

- [ ] **Step 1: Remove the moved functions from `ui-tokens.ts`**

Delete the `getLeaderboard` function and the `export type LeaderboardRow = ...` line from `src/lib/ui-tokens.ts`. Remove the now-unused imports it required (`GroupPrediction`, `Prediction`, `Profile` from `./types` if they're only used by `getLeaderboard` — verify the remaining `getAdminLifecycleStatus`/`compareGroups` usages; keep `Match`, `MatchLifecycleStatus`, and the `getMatchStatus` import).

- [ ] **Step 2: Rewrite the Tabla screen**

Replace the contents of `src/screens/leaderboard.tsx` above the `medalByRank` constant (i.e. the imports + `LeaderboardScreen`) with:

```tsx
"use client";

import { useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { stageLabels, stageOrder } from "@/lib/tournament";
import type { Stage } from "@/lib/types";
import { ui } from "@/lib/ui-tokens";
import { getInitials, getLeaderboard, getStageLeaderboard, podiumOrder, type LeaderboardRow } from "@/lib/standings";
import { cn } from "@/lib/utils";

import { useApp } from "@/components/app-context";

type StandingsView = "overall" | Stage;

export function LeaderboardScreen() {
  const { predictions, profiles, groupPredictions, matches, standingsStages, currentUser } = useApp();
  const [view, setView] = useState<StandingsView>("overall");

  const stageTabs = useMemo(
    () => stageOrder.filter((stage) => standingsStages.has(stage)),
    [standingsStages],
  );

  const rows = useMemo(() => {
    if (view === "overall") {
      return getLeaderboard({ predictions, profiles, groupPredictions, matches, standingsStages });
    }
    return getStageLeaderboard(view, { predictions, profiles, groupPredictions, matches });
  }, [view, predictions, profiles, groupPredictions, matches, standingsStages]);

  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);

  const viewLabel = view === "overall" ? "Acumulado" : stageLabels[view];

  return (
    <Card className={cn(ui.panel, "p-4")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-lg font-black">Tabla general</h2>
        <Select value={view} onValueChange={(value) => setView(value as StandingsView)}>
          <SelectTrigger className={cn(ui.control, "w-full sm:hidden")} aria-label="Vista">
            <span className={ui.label}>Vista</span>
            <SelectValue className={ui.controlValue}>{viewLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="overall">Acumulado</SelectItem>
            {stageTabs.map((stage) => (
              <SelectItem key={stage} value={stage}>
                {stageLabels[stage]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Tabs value={view} onValueChange={(value) => setView(value as StandingsView)} className="hidden min-w-0 sm:block">
          <TabsList className="flex !h-auto w-full min-w-0 max-w-full flex-wrap gap-1.5 rounded-xl border border-app-line bg-app-panel p-1.5">
            <TabsTrigger
              value="overall"
              className="!h-9 shrink-0 rounded-md px-2 text-xs font-extrabold text-app-muted hover:text-app-text data-active:bg-app-brand data-active:text-app-brand-fg data-active:shadow-sm sm:px-4 sm:text-sm"
            >
              Acumulado
            </TabsTrigger>
            {stageTabs.map((stage) => (
              <TabsTrigger
                key={stage}
                value={stage}
                className="!h-9 shrink-0 rounded-md px-2 text-xs font-extrabold text-app-muted hover:text-app-text data-active:bg-app-brand data-active:text-app-brand-fg data-active:shadow-sm sm:px-4 sm:text-sm"
              >
                {stageLabels[stage]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {podium.length > 0 && <Podium rows={podium} currentUserId={currentUser.id} />}
      {rest.length > 0 && <StandingsTable rows={rest} currentUserId={currentUser.id} />}
      {rows.length === 0 && (
        <p className="mt-4 rounded-lg border border-app-line bg-app-surface px-3 py-6 text-center text-sm font-bold text-app-muted">
          Todavía no hay participantes en la tabla.
        </p>
      )}
    </Card>
  );
}
```

(Leave the `medalByRank` constant and the `Podium`/`PodiumSpot`/`StandingsTable` helper components below unchanged — they already import `LeaderboardRow` via the top import, now sourced from `@/lib/standings`.)

- [ ] **Step 3: Typecheck (the green gate)**

Run: `npx tsc --noEmit`
Expected: PASS — no errors across the project. If anything still references `open`, `standingsVisible`, `resultsVisible`, `updateStageOpen`, `updateTabVisibility`, `getTabVisibility`, or `ui-tokens` `getLeaderboard`, fix it now.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/screens/leaderboard.tsx src/lib/ui-tokens.ts
git commit -m "feat(tabla): Acumulado + per-stage standings views"
```

---

### Task 14: Schema & migration

**Files:**
- Modify: `docs/supabase-schema.sql`
- Create: `docs/supabase-migration-stage-results-standings.sql`
- Delete: `docs/supabase-migration-tab-visibility.sql` (the app_settings migration — never applied to the live DB, so it is removed outright rather than reverted)

- [ ] **Step 1: Update the `stages` table in the canonical schema**

In `docs/supabase-schema.sql`, replace the `stages` table definition:

```sql
create table public.stages (
  stage public.stage_key primary key,
  label text not null,
  predictions_open boolean not null default false,
  results_open boolean not null default false,
  standings_open boolean not null default false,
  opened_at timestamptz,
  opened_by uuid references public.profiles(id)
);
```

- [ ] **Step 2: Update the five RLS policies referencing `s.open`**

In `docs/supabase-schema.sql`, change every `s.open = true` to `s.predictions_open = true`. These appear in `predictions_insert_own_open`, `predictions_update_own_open`, `group_predictions_insert_own_open`, `group_predictions_update_own_open`, and `group_predictions_delete_own_open`.

- [ ] **Step 3: Remove the `app_settings` block from the canonical schema**

Delete the `app_settings` `create table`, its `alter table ... enable row level security`, its two policies (`app_settings_select_approved`, `app_settings_admin_all`), and its seed `insert` (all added by the previous feature).

Also delete the now-superseded incremental migration `docs/supabase-migration-tab-visibility.sql` (`git rm docs/supabase-migration-tab-visibility.sql`). It was never applied to the live DB, so there is nothing to revert. The `drop table if exists public.app_settings cascade;` in the new migration (Step 4) is therefore purely defensive — it cleans up any local/dev DB that happened to apply the old migration; on the live DB it is a no-op.

- [ ] **Step 4: Create the migration file**

Create `docs/supabase-migration-stage-results-standings.sql`:

```sql
-- Stage-based tab gating: per-stage results/standings flags; drop app_settings.

-- Rename predictions flag (guarded so the migration is re-runnable).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'stages' and column_name = 'open'
  ) then
    alter table public.stages rename column open to predictions_open;
  end if;
end $$;

alter table public.stages add column if not exists results_open boolean not null default false;
alter table public.stages add column if not exists standings_open boolean not null default false;

-- Recreate the policies that referenced the old column name.
drop policy if exists "predictions_insert_own_open" on public.predictions;
create policy "predictions_insert_own_open"
on public.predictions
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_approved()
  and exists (
    select 1
    from public.matches m
    join public.stages s on s.stage = m.stage
    where m.id = match_id
      and s.predictions_open = true
      and m.status = 'open'
      and m.finalized_at is null
      and (
        m.kickoff_utc > now()
        or (m.updated_by is not null and m.updated_at > m.kickoff_utc)
      )
      and m.home_team_id is not null
      and m.away_team_id is not null
      and (
        home_score <> away_score
        or m.stage = 'groups'
        or winner_team_id in (m.home_team_id, m.away_team_id)
      )
  )
);

drop policy if exists "predictions_update_own_open" on public.predictions;
create policy "predictions_update_own_open"
on public.predictions
for update
to authenticated
using (user_id = auth.uid() and public.is_approved())
with check (
  user_id = auth.uid()
  and public.is_approved()
  and exists (
    select 1
    from public.matches m
    join public.stages s on s.stage = m.stage
    where m.id = match_id
      and s.predictions_open = true
      and m.status = 'open'
      and m.finalized_at is null
      and (
        m.kickoff_utc > now()
        or (m.updated_by is not null and m.updated_at > m.kickoff_utc)
      )
      and m.home_team_id is not null
      and m.away_team_id is not null
      and (
        home_score <> away_score
        or m.stage = 'groups'
        or winner_team_id in (m.home_team_id, m.away_team_id)
      )
  )
);

drop policy if exists "group_predictions_insert_own_open" on public.group_predictions;
create policy "group_predictions_insert_own_open"
on public.group_predictions
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_approved()
  and exists (
    select 1
    from public.groups g
    join public.stages s on s.stage = 'groups'
    where g.group_label = group_predictions.group_label
      and s.predictions_open = true
      and (g.locks_at is null or g.locks_at > now())
  )
);

drop policy if exists "group_predictions_update_own_open" on public.group_predictions;
create policy "group_predictions_update_own_open"
on public.group_predictions
for update
to authenticated
using (user_id = auth.uid() and public.is_approved())
with check (
  user_id = auth.uid()
  and public.is_approved()
  and exists (
    select 1
    from public.groups g
    join public.stages s on s.stage = 'groups'
    where g.group_label = group_predictions.group_label
      and s.predictions_open = true
      and (g.locks_at is null or g.locks_at > now())
  )
);

drop policy if exists "group_predictions_delete_own_open" on public.group_predictions;
create policy "group_predictions_delete_own_open"
on public.group_predictions
for delete
to authenticated
using (
  user_id = auth.uid()
  and public.is_approved()
  and exists (
    select 1
    from public.groups g
    join public.stages s on s.stage = 'groups'
    where g.group_label = group_predictions.group_label
      and s.predictions_open = true
      and (g.locks_at is null or g.locks_at > now())
  )
);

-- Drop the superseded global settings table (cascades its policies).
drop table if exists public.app_settings cascade;
```

- [ ] **Step 5: Commit**

```bash
git rm docs/supabase-migration-tab-visibility.sql
git add docs/supabase-schema.sql docs/supabase-migration-stage-results-standings.sql
git commit -m "feat(db): per-stage results/standings flags; drop app_settings"
```

---

### Task 15: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all suites pass (standings + tab-visibility included).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual smoke check (requires Supabase + migration applied)**

`npm run dev`, sign in as admin:
- "Etapas habilitadas" shows three toggles (Predicciones / Resultados / Standings) per stage.
- Tabla nav is disabled + `/tabla` redirects when no stage has Standings on; enabling a stage's Standings makes Tabla reachable and adds its tab next to "Acumulado".
- Acumulado totals only include stages with Standings on; the mobile pill matches.
- Resultados nav is disabled + `/resultados` redirects when no stage has Resultados on (with content); enabling shows that stage.
- Predictions still gated by the renamed predictions flag.

Note: apply `docs/supabase-migration-stage-results-standings.sql` first.
