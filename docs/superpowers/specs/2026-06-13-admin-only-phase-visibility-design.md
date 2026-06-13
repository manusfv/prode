# Admin-only phase visibility

**Date:** 2026-06-13
**Status:** Draft — pending review

## Problem

Each tournament phase (Grupos, 16avos, … Final) is gated per-tab by three boolean
flags on the `stages` row: `predictions_open`, `results_open`, `standings_open`.
A flag is either off (nobody sees the phase in that tab) or on (everyone does).

There is no way for an admin to **preview** a phase before exposing it to all users —
to verify that the matches, teams, results, or standings of a phase render correctly
before flipping it live for everyone.

## Goal

Add a third, intermediate visibility state to each phase flag so an admin can reveal a
phase **to admins only** as a preview step, then open it to everyone when ready.

Out of scope: hiding whole tabs from non-admins (only the Admin tab is gated today, and
that stays as-is); changing which phases exist or their order.

## Model

Each phase flag becomes a **tri-state** instead of a boolean:

```
closed  →  admin-only  →  open
```

| State        | Regular user sees phase in tab | Admin sees phase in tab |
|--------------|--------------------------------|--------------------------|
| `closed`     | no                             | no                       |
| `admin-only` | no                             | yes (preview)            |
| `open`       | yes                            | yes                      |

`closed` is today's `false`; `open` is today's `true`. `admin-only` is new.

### Write semantics (predictions only)

Results and standings flags are reveal-only — no user writes are involved, so `admin-only`
there is pure visibility.

For **predictions**, saving a pick is enforced by Postgres RLS policies that require
`predictions_open = true`. We deliberately **do not** grant admins write access in an
`admin-only` phase, to avoid putting role-based exceptions inside security policies.

Therefore: in an `admin-only` predictions phase, the admin sees the phase's matches
rendered **read-only** (same treatment as a locked match). Saving requires `open`. This
keeps the RLS migration a clean `true → 'open'` mapping.

## Design

### 1. Types (`src/lib/types.ts`)

Introduce:

```ts
export type StageVisibility = "closed" | "admin" | "open";
```

Change `StageState` flags from `boolean` to `StageVisibility`:

```ts
export type StageState = {
  stage: Stage;
  label: string;
  predictionsOpen: StageVisibility;
  resultsOpen: StageVisibility;
  standingsOpen: StageVisibility;
};
```

(Field names kept as-is to minimize churn; their type changes.)

### 2. Database (`docs/supabase-migration-admin-only-phase-visibility.sql`)

Migrate the three boolean columns on `public.stages` to text with a check constraint,
preserving existing data (`true → 'open'`, `false → 'closed'`). Re-runnable / guarded
like the existing migrations.

For each of `predictions_open`, `results_open`, `standings_open`:

- Add a temp text column, backfill from the boolean (`'open'` / `'closed'`), drop the
  boolean, rename temp into place, add `check (col in ('closed','admin','open'))` and
  `not null default 'closed'`.

Update the RLS policies that reference `s.predictions_open = true` to
`s.predictions_open = 'open'` (both the `predictions` and `group_predictions` insert/update/
delete policies in `supabase-migration-stage-results-standings.sql`). Behaviour for
regular users is unchanged — only `open` permits writes.

Also update `docs/supabase-schema.sql` to reflect the new column type/constraint.

### 3. Data mapping (`src/lib/supabase-data.ts`)

`StageRow` flags become the text type; `mapStage` passes them through as `StageVisibility`
(values already constrained by the DB check).

### 4. Seed (`src/lib/seed.ts`)

Update the in-memory `stages` seed to the new shape: `groups` flags `"open"`, the rest
`"closed"`.

### 5. Visibility functions (`src/lib/tab-visibility.ts`)

Each function takes the viewer's admin status and includes a stage when the flag is `open`,
or `admin` **and** the viewer is an admin:

```ts
function isVisible(v: StageVisibility, isAdmin: boolean): boolean {
  return v === "open" || (v === "admin" && isAdmin);
}

export function getPredictionsStages(stages: StageState[], isAdmin: boolean): Set<Stage>;
export function getStandingsStages(stages: StageState[], isAdmin: boolean): Set<Stage>;
export function getResultsStages(stages, matches, groups, isAdmin): Set<Stage>;
```

`getResultsStages` keeps its existing extra gate (finalized content must be present) — so an
admin previewing an `admin-only` results phase still only sees it once content exists.

Additionally expose the set of phases that are **editable** for predictions (i.e. truly
`open`, regardless of viewer) so the predictions screen can render admin-only phases
read-only:

```ts
export function getEditablePredictionsStages(stages: StageState[]): Set<Stage>;
```

### 6. App shell (`src/components/app-shell.tsx`)

`isAdmin` is already computed (line ~138). Pass it into the three visibility selectors:

```ts
const openStages = useMemo(() => getPredictionsStages(stages, isAdmin), [stages, isAdmin]);
const editablePredictionStages = useMemo(() => getEditablePredictionsStages(stages), [stages]);
const resultsStages = useMemo(() => getResultsStages(stages, matches, groups, isAdmin), [...]);
const standingsStages = useMemo(() => getStandingsStages(stages, isAdmin), [stages, isAdmin]);
```

Thread `editablePredictionStages` into the predictions screen so it can distinguish
"visible to me as preview" (render read-only) from "open for editing".

### 7. Predictions screen (`src/screens/predictions.tsx`)

A phase that is visible but **not** in `editablePredictionStages` renders its matches in the
existing locked/read-only style (no editable inputs, no save). Reuse the current
locked-match presentation; add a small "Vista previa (solo admin)" hint on such phases.

### 8. Admin UI (`src/screens/admin.tsx`)

Replace the on/off button per flag with a **cycle button**: clicking advances
`closed → admin-only → open → closed`. Visual cue per state:

- `closed` — `variant="outline"`, muted
- `admin-only` — outline + accent tint and an eye icon (preview)
- `open` — `variant="default"` (solid)

The button label stays the flag name (Predicciones / Resultados / Standings); the state is
conveyed by style + icon + accessible title (e.g. `title="Predicciones: solo admin"`).

### 9. Server action (`src/app/actions.ts`)

- `updateStageFlagAction` input `value: boolean` → `value: StageVisibility`. The update
  writes the text value. The `opened_at` / `opened_by` bookkeeping (predictions flag) sets
  on transition to `open` and clears otherwise (treat `admin`/`closed` as "not opened").
  Message reflects the target state (e.g. "Etapa abierta" / "Etapa en vista previa" /
  "Etapa cerrada").
- `savePredictionAction` / `saveGroupPredictionAction`: the stage query
  `.eq("predictions_open", true)` becomes `.eq("predictions_open", "open")`. No role
  exception — consistent with RLS.

## Testing

- `tab-visibility.test.ts`: extend for tri-state × admin/non-admin — `admin` visible only to
  admins; `open` visible to all; `closed` to none. Cover `getEditablePredictionsStages`
  (only `open`, never `admin`). Cover `getResultsStages` admin-only still gated by content.
- `scoring`/standings tests: unaffected logic, but verify the standings set helper still
  feeds the leaderboard correctly with the new shape.
- Admin action: `updateStageFlagAction` writes the right text value and `opened_at`
  transitions only on `open`.

## Open questions / notes

- **Admin write in admin-only predictions = no** (read-only preview). Revisit only if a
  real need arises to test the full save flow as admin; that would require a role-aware RLS
  policy.
- An admin previewing an `admin-only` **standings** phase sees the Tabla (and its leaderboard
  accumulation) reflect that phase. This is per-viewer and intentional: the admin's preview
  shows what users will see once it's opened. Non-admins are unaffected.
