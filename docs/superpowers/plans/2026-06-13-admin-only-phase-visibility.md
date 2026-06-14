# Admin-only Phase Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each tournament phase flag a third "admin-only" state so admins can preview a phase (predictions read-only, results/standings revealed) before opening it to everyone.

**Architecture:** Each phase flag (`predictionsOpen` / `resultsOpen` / `standingsOpen`) changes from `boolean` to a tri-state `StageVisibility = "closed" | "admin" | "open"`. The `tab-visibility` selectors take the viewer's `isAdmin` and resolve `admin`-state phases as visible only to admins. Saving predictions still requires `open` (no role logic in RLS). The admin UI becomes a per-flag cycle button.

**Tech Stack:** TypeScript, Next.js (App Router, server actions), React, Supabase (Postgres + RLS), Vitest.

---

## File Structure

- `src/lib/types.ts` — add `StageVisibility`; `StageState` flags become tri-state.
- `src/lib/tab-visibility.ts` — selectors take `isAdmin`; add `getEditablePredictionsStages`.
- `src/lib/tab-visibility.test.ts` — tri-state × admin/non-admin coverage.
- `src/lib/seed.ts` — in-memory seed uses string states.
- `src/lib/supabase-data.ts` — `StageRow` flags become `StageVisibility`.
- `src/app/actions.ts` — `updateStageFlagAction` takes `StageVisibility`; save queries use `"open"`.
- `src/components/app-context.tsx` — context exposes `editableStages`; `updateStageFlag` takes `StageVisibility`.
- `src/components/app-shell.tsx` — pass `isAdmin` into selectors; provide `editableStages`.
- `src/screens/predictions.tsx` — editability uses `editableStages`; admin-only phases render read-only.
- `src/screens/admin.tsx` — per-flag cycle button.
- `docs/supabase-migration-admin-only-phase-visibility.sql` — new migration (boolean→text + RLS).
- `docs/supabase-schema.sql` — reflect new column type/constraint.

---

## Task 1: Add `StageVisibility` type and migrate `StageState`

**Files:**
- Modify: `src/lib/types.ts:68-76`

- [ ] **Step 1: Add the type and change `StageState`**

In `src/lib/types.ts`, replace the existing `StageState` / `StageFlag` block (lines 68-76):

```ts
export type StageVisibility = "closed" | "admin" | "open";

export type StageState = {
  stage: Stage;
  label: string;
  predictionsOpen: StageVisibility;
  resultsOpen: StageVisibility;
  standingsOpen: StageVisibility;
};

export type StageFlag = "predictions" | "results" | "standings";
```

- [ ] **Step 2: Typecheck (expected to surface downstream errors)**

Run: `npx tsc --noEmit`
Expected: FAIL — errors in `seed.ts`, `supabase-data.ts`, `tab-visibility.ts`, `actions.ts`, `app-context.tsx`, `admin.tsx` referencing boolean flags. This confirms the type change took effect; later tasks fix each.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): tri-state StageVisibility for phase flags"
```

---

## Task 2: Tri-state visibility selectors + editable set (TDD)

**Files:**
- Modify: `src/lib/tab-visibility.ts`
- Test: `src/lib/tab-visibility.test.ts`

- [ ] **Step 1: Rewrite the test file for tri-state**

Replace the entire contents of `src/lib/tab-visibility.test.ts` with:

```ts
import { describe, expect, it } from "vitest";

import {
  getEditablePredictionsStages,
  getPredictionsStages,
  getResultsStages,
  getStandingsStages,
} from "./tab-visibility";
import type { Match, StageState } from "./types";

function stage(partial: Partial<StageState> & { stage: StageState["stage"] }): StageState {
  return {
    label: partial.stage,
    predictionsOpen: "closed",
    resultsOpen: "closed",
    standingsOpen: "closed",
    ...partial,
  };
}

const finalizedMatch: Match = {
  id: "m1", matchNo: 1, stage: "round32", homeTeamId: "a", awayTeamId: "b",
  kickoffUtc: "2026-06-01T00:00:00.000Z", status: "finalized", homeScore: 1, awayScore: 0,
  winnerTeamId: "a", finalizedAt: "2026-06-01T02:00:00.000Z", finalizedBy: "u1", updatedAt: null, updatedBy: null,
};

const stages: StageState[] = [
  stage({ stage: "round32", predictionsOpen: "open", resultsOpen: "open", standingsOpen: "open" }),
  stage({ stage: "round16", predictionsOpen: "admin", resultsOpen: "admin", standingsOpen: "admin" }),
  stage({ stage: "quarter", predictionsOpen: "closed", resultsOpen: "closed", standingsOpen: "closed" }),
];

describe("stage gating helpers", () => {
  it("getPredictionsStages: open visible to everyone, admin-only only to admins", () => {
    expect(getPredictionsStages(stages, false)).toEqual(new Set(["round32"]));
    expect(getPredictionsStages(stages, true)).toEqual(new Set(["round32", "round16"]));
  });

  it("getStandingsStages: respects admin-only per viewer", () => {
    expect(getStandingsStages(stages, false)).toEqual(new Set(["round32"]));
    expect(getStandingsStages(stages, true)).toEqual(new Set(["round32", "round16"]));
  });

  it("getEditablePredictionsStages: only fully-open stages, never admin-only", () => {
    expect(getEditablePredictionsStages(stages)).toEqual(new Set(["round32"]));
  });

  it("getResultsStages: admin-only stage requires content AND admin viewer", () => {
    const admin32 = getResultsStages(stages, [finalizedMatch], [], true);
    expect(admin32.has("round32")).toBe(true); // open + content
    // round16 is admin-only with no content -> excluded even for admin
    expect(admin32.has("round16")).toBe(false);
    // open stage hidden from non-admins only if admin-only; round32 is open -> visible
    expect(getResultsStages(stages, [finalizedMatch], [], false).has("round32")).toBe(true);
  });

  it("getResultsStages: admin-only stage WITH content visible to admin, not user", () => {
    const r16Match: Match = { ...finalizedMatch, id: "m2", stage: "round16" };
    const withContent: StageState[] = [stage({ stage: "round16", resultsOpen: "admin" })];
    expect(getResultsStages(withContent, [r16Match], [], true)).toEqual(new Set(["round16"]));
    expect(getResultsStages(withContent, [r16Match], [], false)).toEqual(new Set());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/tab-visibility.test.ts`
Expected: FAIL — `getEditablePredictionsStages` is not exported and the existing selectors take the wrong number of args.

- [ ] **Step 3: Rewrite `tab-visibility.ts`**

Replace the entire contents of `src/lib/tab-visibility.ts` with:

```ts
import type { Group, Match, Stage, StageState, StageVisibility } from "./types";
import { getStagesWithContent } from "./results";

/** A phase is visible when open to all, or admin-only and the viewer is an admin. */
function isVisible(visibility: StageVisibility, isAdmin: boolean): boolean {
  return visibility === "open" || (visibility === "admin" && isAdmin);
}

export function getPredictionsStages(stages: StageState[], isAdmin: boolean): Set<Stage> {
  return new Set(
    stages.filter((stage) => isVisible(stage.predictionsOpen, isAdmin)).map((stage) => stage.stage),
  );
}

/** Stages whose predictions are editable: only fully open, never admin-only preview. */
export function getEditablePredictionsStages(stages: StageState[]): Set<Stage> {
  return new Set(stages.filter((stage) => stage.predictionsOpen === "open").map((stage) => stage.stage));
}

export function getStandingsStages(stages: StageState[], isAdmin: boolean): Set<Stage> {
  return new Set(
    stages.filter((stage) => isVisible(stage.standingsOpen, isAdmin)).map((stage) => stage.stage),
  );
}

/** Stages whose results are revealed: visible to viewer AND finalized content present. */
export function getResultsStages(
  stages: StageState[],
  matches: Match[],
  groups: Group[],
  isAdmin: boolean,
): Set<Stage> {
  const content = getStagesWithContent(matches, groups);
  return new Set(
    stages
      .filter((stage) => isVisible(stage.resultsOpen, isAdmin) && content.has(stage.stage))
      .map((stage) => stage.stage),
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/tab-visibility.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tab-visibility.ts src/lib/tab-visibility.test.ts
git commit -m "feat(tab-visibility): resolve admin-only phases per viewer"
```

---

## Task 3: Update seed and Supabase row mapping

**Files:**
- Modify: `src/lib/seed.ts:22-30`
- Modify: `src/lib/supabase-data.ts:29-35`

- [ ] **Step 1: Update the in-memory seed**

In `src/lib/seed.ts`, replace the `stages` array (lines 22-30):

```ts
export const stages: StageState[] = [
  { stage: "groups", label: "Grupos", predictionsOpen: "open", resultsOpen: "open", standingsOpen: "open" },
  { stage: "round32", label: "16avos", predictionsOpen: "closed", resultsOpen: "closed", standingsOpen: "closed" },
  { stage: "round16", label: "Octavos", predictionsOpen: "closed", resultsOpen: "closed", standingsOpen: "closed" },
  { stage: "quarter", label: "Cuartos", predictionsOpen: "closed", resultsOpen: "closed", standingsOpen: "closed" },
  { stage: "semi", label: "Semis", predictionsOpen: "closed", resultsOpen: "closed", standingsOpen: "closed" },
  { stage: "third", label: "3er puesto", predictionsOpen: "closed", resultsOpen: "closed", standingsOpen: "closed" },
  { stage: "final", label: "Final", predictionsOpen: "closed", resultsOpen: "closed", standingsOpen: "closed" },
];
```

- [ ] **Step 2: Update `StageRow` and import**

In `src/lib/supabase-data.ts`, change the `StageRow` flag types (lines 32-34) from `boolean` to `StageVisibility`:

```ts
type StageRow = {
  stage: Stage;
  label: string;
  predictions_open: StageVisibility;
  results_open: StageVisibility;
  standings_open: StageVisibility;
};
```

Add `StageVisibility` to the existing type import from `./types` near the top of the file (the block that already imports `StageState`). `mapStage` (lines ~199-206) needs no change — it already passes the columns straight through.

- [ ] **Step 3: Typecheck these files**

Run: `npx tsc --noEmit`
Expected: Remaining errors only in `actions.ts`, `app-context.tsx`, `app-shell.tsx`, `admin.tsx` (fixed in later tasks); `seed.ts` and `supabase-data.ts` errors gone.

- [ ] **Step 4: Commit**

```bash
git add src/lib/seed.ts src/lib/supabase-data.ts
git commit -m "feat(data): map phase flags as tri-state visibility"
```

---

## Task 4: Server action — tri-state flag write + save gate

**Files:**
- Modify: `src/app/actions.ts:81-146` (two `.eq` queries), `:319-350` (`updateStageFlagAction`)

- [ ] **Step 1: Update the prediction save queries**

In `src/app/actions.ts`, both `savePredictionAction` (line ~91) and `saveGroupPredictionAction` (line ~145) select open stages with:

```ts
supabase.from("stages").select("stage, predictions_open").eq("predictions_open", true),
```

Change BOTH `.eq("predictions_open", true)` to `.eq("predictions_open", "open")`. (Admin-only does not permit saving — consistent with RLS.)

- [ ] **Step 2: Update `updateStageFlagAction` to take a visibility value**

Replace the `UpdateStageFlagInput` type and `updateStageFlagAction` body (lines ~319-350) with:

```ts
type UpdateStageFlagInput = {
  stage: Stage;
  flag: StageFlag;
  value: StageVisibility;
};

const STAGE_FLAG_COLUMN: Record<StageFlag, "predictions_open" | "results_open" | "standings_open"> = {
  predictions: "predictions_open",
  results: "results_open",
  standings: "standings_open",
};

const STAGE_FLAG_MESSAGE: Record<StageVisibility, string> = {
  open: "Etapa abierta.",
  admin: "Etapa en vista previa (solo admin).",
  closed: "Etapa cerrada.",
};

export async function updateStageFlagAction(input: UpdateStageFlagInput) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Supabase no está configurado." };

  const admin = await requireAdmin(supabase);
  if (!admin.ok) return admin;

  const column = STAGE_FLAG_COLUMN[input.flag];
  const update: Record<string, unknown> = { [column]: input.value };
  if (input.flag === "predictions") {
    const opened = input.value === "open";
    update.opened_at = opened ? new Date().toISOString() : null;
    update.opened_by = opened ? admin.userId : null;
  }

  const { error } = await supabase.from("stages").update(update).eq("stage", input.stage);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/");
  return { ok: true, message: STAGE_FLAG_MESSAGE[input.value] };
}
```

Add `StageVisibility` to the `@/lib/types` import at the top of `actions.ts` (alongside the existing `Stage`, `StageFlag` imports).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: Remaining errors only in `app-context.tsx`, `app-shell.tsx`, `admin.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/app/actions.ts
git commit -m "feat(actions): write tri-state phase visibility; saves require open"
```

---

## Task 5: Context + shell — thread `isAdmin` and `editableStages`

**Files:**
- Modify: `src/components/app-context.tsx:34-47`
- Modify: `src/components/app-shell.tsx:140-142`, context value (`:550-552`), `updateStageFlag` (`:291-297`)

- [ ] **Step 1: Extend the context type**

In `src/components/app-context.tsx`, add `StageVisibility` to the `@/lib/types` import block. Add an `editableStages` field after `openStages` (line 34) and change `updateStageFlag`'s value type (line 47):

```ts
  openStages: Set<Stage>;
  editableStages: Set<Stage>;
  resultsStages: Set<Stage>;
  standingsStages: Set<Stage>;
```

```ts
  updateStageFlag: (stage: Stage, flag: StageFlag, value: StageVisibility) => Promise<void> | void;
```

- [ ] **Step 2: Update the selectors in the shell**

In `src/components/app-shell.tsx`, replace the three selector `useMemo`s (lines ~140-142):

```ts
  const openStages = useMemo(() => getPredictionsStages(stages, isAdmin), [stages, isAdmin]);
  const editableStages = useMemo(() => getEditablePredictionsStages(stages), [stages]);
  const resultsStages = useMemo(() => getResultsStages(stages, matches, groups, isAdmin), [stages, matches, groups, isAdmin]);
  const standingsStages = useMemo(() => getStandingsStages(stages, isAdmin), [stages, isAdmin]);
```

Update the import on line 66 to include the new helper:

```ts
import { getEditablePredictionsStages, getPredictionsStages, getResultsStages, getStandingsStages } from "@/lib/tab-visibility";
```

Note: `isAdmin` is declared at line ~138, before these selectors — no reordering needed.

- [ ] **Step 3: Provide `editableStages` in the context value**

In the `contextValue` object (around line 550, next to `openStages`), add:

```ts
    openStages,
    editableStages,
    resultsStages,
    standingsStages,
```

- [ ] **Step 4: Update the `updateStageFlag` wrapper**

Replace the `updateStageFlag` function (lines ~291-297) with:

```ts
  async function updateStageFlag(stage: Stage, flag: StageFlag, value: StageVisibility) {
    const column = flag === "predictions" ? "predictionsOpen" : flag === "results" ? "resultsOpen" : "standingsOpen";
    setStages((current) => current.map((item) => (item.stage === stage ? { ...item, [column]: value } : item)));
    const result = await updateStageFlagAction({ stage, flag, value });
    setDataMessage(result.message);
    if (result.ok) await refreshSupabaseData();
  }
```

Add `StageVisibility` to the `@/lib/types` import in `app-shell.tsx` (the block importing `StageState` at line ~63).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: Remaining errors only in `admin.tsx` (Task 7) and possibly `predictions.tsx` once it consumes `editableStages` (Task 6). The shell/context themselves typecheck.

- [ ] **Step 6: Commit**

```bash
git add src/components/app-context.tsx src/components/app-shell.tsx
git commit -m "feat(shell): provide per-viewer stage sets and editable stages"
```

---

## Task 6: Predictions screen — read-only preview for admin-only phases

**Files:**
- Modify: `src/screens/predictions.tsx` (destructure `editableStages` `:86`; `MatchCard` prop+`isOpen` `:522,:537`; `GroupStandingsCard` `stageOpen` `:217`; missing counts `:163,:171`)

- [ ] **Step 1: Destructure `editableStages` from context**

In `src/screens/predictions.tsx`, add `editableStages` to the `useApp()` destructure (next to `openStages`, line ~86):

```ts
    openStages,
    editableStages,
    standingsStages,
```

- [ ] **Step 2: Use `editableStages` for editability, keep `openStages` for visibility**

`openStages` continues to drive which stage tabs and matches are *visible* (`StageTabs enabledStages={openStages}`, the default `activeStage`, and `visibleMatches`). Change only the editability checks:

- Missing-matches count (line ~163): `openStages.has(match.stage)` → `editableStages.has(match.stage)`
- Missing-groups count (line ~171): `openStages.has("groups")` → `editableStages.has("groups")`
- `GroupStandingsCard` (line ~217): `stageOpen={openStages.has("groups")}` → `stageOpen={editableStages.has("groups")}`

- [ ] **Step 3: Thread `editableStages` into `MatchCard`**

`MatchCard` (defined ~line 522) currently takes `openStages` and computes (line ~537):

```ts
  const isOpen = status === "open" && openStages.has(match.stage) && match.homeTeamId && match.awayTeamId;
```

Change the prop it receives to `editableStages` and update the call site (line ~231) from `openStages={openStages}` to `editableStages={editableStages}`. Update `MatchCard`'s prop name and the `isOpen` line:

```ts
  const isOpen = status === "open" && editableStages.has(match.stage) && match.homeTeamId && match.awayTeamId;
```

(With this, an admin-only phase is visible but every match is non-editable — it renders in the existing `status === "locked"` read-only style.)

- [ ] **Step 4: Add an admin-only preview hint on the stage**

In the stage header area (just after `<StageTabs ... />`, line ~180), add a banner shown when the active stage is visible-but-not-editable:

```tsx
          {!editableStages.has(activeStage) && openStages.has(activeStage) && (
            <p className={cn(ui.label, "text-app-amber")}>Vista previa · solo admin</p>
          )}
```

Confirm `ui` is already imported in this file (it is — used at line ~188). For the `groups` stage, "visible but not editable" likewise means preview; this banner covers it because `activeStage` can be `"groups"`.

- [ ] **Step 5: Typecheck and run the full unit suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean except `admin.tsx` (Task 7); all vitest tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/screens/predictions.tsx
git commit -m "feat(predictions): render admin-only phases as read-only preview"
```

---

## Task 7: Admin UI — per-flag cycle button

**Files:**
- Modify: `src/screens/admin.tsx:412-445`

- [ ] **Step 1: Add a cycle helper and visibility-aware flags near the stage list**

In `src/screens/admin.tsx`, just above the `stageOrder.map(...)` (line ~413), the existing code reads each flag as a boolean. Replace the `flags` construction and button rendering inside the map (lines ~414-444) with a tri-state version. First add this pure helper at module scope (top of the file, after imports):

```ts
const VISIBILITY_CYCLE = { closed: "admin", admin: "open", open: "closed" } as const;

const VISIBILITY_META: Record<
  import("@/lib/types").StageVisibility,
  { variant: "default" | "outline"; tint: string; title: string }
> = {
  closed: { variant: "outline", tint: "", title: "cerrado" },
  admin: { variant: "outline", tint: "border-app-amber text-app-amber", title: "solo admin" },
  open: { variant: "default", tint: "", title: "abierto" },
};
```

- [ ] **Step 2: Replace the flag rows to cycle through states**

Inside the `stageOrder.map`, replace the `flags` array and the `flags.map` button block (lines ~415-440) with:

```tsx
                const flags = [
                  { flag: "predictions" as const, label: "Predicciones", value: stageState?.predictionsOpen ?? "closed" },
                  { flag: "results" as const, label: "Resultados", value: stageState?.resultsOpen ?? "closed" },
                  { flag: "standings" as const, label: "Standings", value: stageState?.standingsOpen ?? "closed" },
                ];

                return (
                  <div className="stage-admin-row" key={stage}>
                    <div>
                      <strong>{stageLabels[stage]}</strong>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {flags.map(({ flag, label, value }) => {
                        const key = `stage-${stage}-${flag}`;
                        const meta = VISIBILITY_META[value];
                        return (
                          <Button
                            key={flag}
                            variant={meta.variant}
                            size="sm"
                            className={meta.tint}
                            title={`${label}: ${meta.title}`}
                            disabled={Boolean(pendingAdminAction)}
                            onClick={() => runAdminAction(key, () => updateStageFlag(stage, flag, VISIBILITY_CYCLE[value]))}
                          >
                            <LoadingLabel loading={pendingAdminAction === key} label={label} />
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                );
```

(`StageVisibility` is referenced inline via `import(...)` in the helper, so no new top-level import is strictly required; if the file already imports from `@/lib/types`, prefer adding `StageVisibility` there and using it directly instead of the inline import.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (clean — no remaining errors).

- [ ] **Step 4: Lint**

Run: `npx eslint src/screens/admin.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/screens/admin.tsx
git commit -m "feat(admin): cycle phase flags through closed/admin/open"
```

---

## Task 8: Database migration + schema

**Files:**
- Create: `docs/supabase-migration-admin-only-phase-visibility.sql`
- Modify: `docs/supabase-schema.sql:25-27` (stages columns) and the two `predictions_open = true` RLS clauses (lines ~241, ~274)

- [ ] **Step 1: Write the migration**

Create `docs/supabase-migration-admin-only-phase-visibility.sql`:

```sql
-- Admin-only phase visibility: convert stage flags from boolean to tri-state text.
-- States: 'closed' (nobody), 'admin' (admins preview), 'open' (everyone).
-- Re-runnable / guarded.

do $$
declare
  col text;
begin
  foreach col in array array['predictions_open', 'results_open', 'standings_open']
  loop
    -- Only convert if the column is still boolean.
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'stages'
        and column_name = col and data_type = 'boolean'
    ) then
      execute format('alter table public.stages alter column %I drop default', col);
      execute format(
        'alter table public.stages alter column %I type text using (case when %I then ''open'' else ''closed'' end)',
        col, col
      );
      execute format('alter table public.stages alter column %I set default ''closed''', col);
      execute format('alter table public.stages alter column %I set not null', col);
      execute format(
        'alter table public.stages add constraint %I check (%I in (''closed'', ''admin'', ''open''))',
        col || '_check', col
      );
    end if;
  end loop;
end $$;

-- RLS: saving predictions requires the phase to be fully open (admin-only does not permit writes).
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
      and s.predictions_open = 'open'
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
      and s.predictions_open = 'open'
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
      and s.predictions_open = 'open'
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
      and s.predictions_open = 'open'
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
      and s.predictions_open = 'open'
      and (g.locks_at is null or g.locks_at > now())
  )
);
```

- [ ] **Step 2: Update the canonical schema**

In `docs/supabase-schema.sql`, change the three stage columns (lines 25-27) from boolean to text:

```sql
  predictions_open text not null default 'closed' check (predictions_open in ('closed', 'admin', 'open')),
  results_open text not null default 'closed' check (results_open in ('closed', 'admin', 'open')),
  standings_open text not null default 'closed' check (standings_open in ('closed', 'admin', 'open')),
```

Then update the two `predictions_open = true` occurrences in the predictions RLS policies (around lines 241 and 274) to `predictions_open = 'open'`, and the three `group_predictions` policies' `predictions_open = true` to `predictions_open = 'open'` to match the migration.

- [ ] **Step 3: Verify no stray boolean references remain in docs**

Run: `grep -rn "predictions_open = true\|results_open boolean\|standings_open boolean\|predictions_open boolean" docs/supabase-schema.sql`
Expected: no output (all converted).

- [ ] **Step 4: Commit**

```bash
git add docs/supabase-migration-admin-only-phase-visibility.sql docs/supabase-schema.sql
git commit -m "feat(db): migrate phase flags to tri-state visibility"
```

---

## Task 9: Full verification

- [ ] **Step 1: Typecheck, lint, test, build**

Run: `npx tsc --noEmit && npx eslint src && npx vitest run && npm run build`
Expected: all PASS — no type errors, no lint errors, all tests green, production build succeeds.

- [ ] **Step 2: Manual smoke (requires Supabase env + applied migration)**

Apply `docs/supabase-migration-admin-only-phase-visibility.sql` in the Supabase SQL editor, then run `npm run dev` and verify:
- Admin → Etapas habilitadas: each flag button cycles closed → admin-only (amber outline) → open (solid) → closed; toast message matches.
- Set a future phase's `predictions` to admin-only. As admin: the phase tab appears in Pronósticos with a "Vista previa · solo admin" banner and matches are read-only (no inputs). As a non-admin user: the phase tab does not appear.
- Set that phase's `predictions` to open: non-admin now sees it and can save.
- `results`/`standings` admin-only: admin sees the phase in Resultados (if finalized content exists) and Tabla; non-admin does not.

- [ ] **Step 3: Commit any fixes, then report**

If steps surfaced fixes, commit them. Otherwise the feature is complete.

---

## Notes for the implementer

- **Visibility vs editability:** `openStages` = what the viewer can *see* in Pronósticos (includes admin-only for admins). `editableStages` = what can be *saved* (only fully open, never admin-only). Never gate saving on `openStages`.
- **No role logic in RLS:** admins cannot save in an admin-only phase by design. Do not add a role branch to the Postgres policies.
- **`getStagesWithContent`** is imported by `tab-visibility.ts` from `./results` — unchanged; the results gate (content must exist) still applies on top of visibility.
