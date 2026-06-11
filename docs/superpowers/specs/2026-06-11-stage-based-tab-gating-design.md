# Stage-based tab gating (results & standings per stage)

**Date:** 2026-06-11
**Status:** Approved
**Supersedes:** `2026-06-11-tab-visibility-toggles-design.md` (the `app_settings` global toggles are removed by this work)

## Problem

The app gates predictions per stage via `stages.open`. Results and standings
visibility, however, are controlled by a separate global mechanism — the
`app_settings` table (`standings`, `results`) shipped in the previous feature —
which is a parallel source of truth. We want a single, coherent model: each stage
controls its own predictions, results, and standings visibility, and tab-level
visibility is *derived* from those per-stage flags rather than stored separately.

## Goal

Make `stages` the single source of truth for all tab gating. Each stage carries
three independent admin-controlled flags:

- `predictions_open` — may users predict this stage (rename of today's `open`).
- `results_open` — are this stage's results revealed.
- `standings_open` — is this stage's standings revealed.

Tab reachability and the accumulated leaderboard derive from these. The
`app_settings` table and everything built on it are removed.

## Decisions (from brainstorming)

- **Single source of truth:** drop `app_settings` entirely; derive tab visibility
  from per-stage flags.
- **Resultados:** a stage's results show iff `results_open` **AND** it has
  finalized content (`getStagesWithContent`). The Resultados tab is reachable iff
  at least one stage passes that test.
- **Tabla:** reachable iff at least one stage has `standings_open`. Inside, a
  stage selector mirroring Resultados: an **"Acumulado"** view plus one tab per
  revealed (`standings_open`) stage.
- **Accumulated = sum over revealed stages only.** Points from stages that are not
  `standings_open` are excluded from the accumulated leaderboard (no leaking of
  hidden-stage performance). Groups points count only if the `groups` stage is
  revealed.
- **Predictions flag renamed** `open` → `predictions_open` for symmetry.
- **Tabla layout:** stage tabs (Acumulado + per-stage), reusing a generalized
  `StageTabs`.
- The mobile stats pill / "your rank" (which uses the accumulated leaderboard) now
  reflects the revealed total — an accepted, intended consequence of revealed-only
  accumulation.

## Architecture

All gating state lives on `public.stages`. No separate settings table. Screens and
the app shell read the three per-stage flags (plus content detection for results)
and derive everything else. This reverts the `app_settings` feature and folds its
intent into the stage model.

## Schema & migration

### `stages` table changes
- Rename column `open` → `predictions_open`.
- Add `results_open boolean not null default false`.
- Add `standings_open boolean not null default false`.
- `opened_at` / `opened_by` remain, tracking the predictions flag only.

### Drop `app_settings`
- `drop table if exists public.app_settings cascade;` (drops its RLS policies).

### RLS policies referencing `s.open`
Five policies join `stages` and check `s.open = true`. They must be dropped and
recreated to reference `s.predictions_open`:
- `predictions_insert_own_open`
- `predictions_update_own_open`
- `group_predictions_insert_own_open`
- `group_predictions_update_own_open`
- `group_predictions_delete_own_open`

### Files
- New incremental migration `docs/supabase-migration-stage-results-standings.sql`:
  rename column, add the two columns, recreate the five policies, drop
  `app_settings`. Must be idempotent where practical (`add column if not exists`,
  `drop policy if exists`, `drop table if exists`). Note: `alter table ... rename
  column` is not idempotent; guard with a `do $$ ... $$` block that checks
  `information_schema.columns` for `open` before renaming.
- `docs/supabase-schema.sql` (canonical): rename `open`→`predictions_open`, add the
  two columns, update the five policy bodies, and remove the `app_settings` table,
  its `enable row level security`, its two policies, and its seed insert.

## Types & data layer

### `src/lib/types.ts`
- `StageState`: `open: boolean` → `predictionsOpen: boolean`; add
  `resultsOpen: boolean`, `standingsOpen: boolean`.
- Remove `AppSettingKey` and `AppSetting` types.

### `src/lib/supabase-data.ts`
- `StageRow`: `open` → `predictions_open`; add `results_open`, `standings_open`.
- `mapStage`: map the three columns to `predictionsOpen` / `resultsOpen` /
  `standingsOpen`.
- Remove `AppSettingRow`, `mapAppSetting`, the `app_settings` parallel query, its
  entry in the error-check array, the `appSettings` field on `SupabaseAppData`, and
  the `AppSetting`/`AppSettingKey` imports.

### `src/lib/seed.ts`
- `stages`: add `resultsOpen`/`standingsOpen` to each entry (e.g. `groups`:
  predictionsOpen true, and for a realistic demo `resultsOpen`/`standingsOpen`
  true; other stages false). Rename `open`→`predictionsOpen`.
- Remove the `appSettings` seed export and its import.

## Standings computation (`src/lib/standings.ts`)

Today `getLeaderboard` lives in `src/lib/ui-tokens.ts` and sums *all* prediction
and group-prediction points. This work moves leaderboard logic into
`src/lib/standings.ts` (the standings-domain module) and splits it:

- A shared ranking core `rankLeaderboard(rows)` that applies the existing
  sort/tiebreak rules and assigns `rank`.
- `getLeaderboard({ predictions, profiles, groupPredictions, matches, standingsStages })`
  → **accumulated over revealed stages**: include a match prediction's points only
  if its match's stage is in `standingsStages`; include group-prediction points
  only if `"groups"` ∈ `standingsStages`.
- `getStageLeaderboard(stage, { predictions, profiles, groupPredictions, matches })`
  → a single stage: for `groups`, use group predictions; for any other stage, use
  match predictions whose match is in that stage. Returns the same row shape as
  `getLeaderboard`.

Both need a `matchId → stage` lookup built from `matches`. `LeaderboardRow` type
moves with them (re-export from `ui-tokens.ts` if needed to limit import churn, or
update imports — implementer's discretion in the plan).

Unit tests in `src/lib/standings.test.ts`: accumulated respects `standingsStages`
(excludes hidden stages, includes/excludes groups correctly); `getStageLeaderboard`
sums only the target stage; tiebreak ordering preserved.

## Derived visibility helpers (`src/lib/tab-visibility.ts`)

Repurpose this module (currently `app_settings`-based) to derive from stages:

- `getResultsStages(stages, matches, groups)` → `Set<Stage>` of stages where
  `resultsOpen` AND `getStagesWithContent` includes the stage.
- `getStandingsStages(stages)` → `Set<Stage>` where `standingsOpen`.
- `getPredictionsStages(stages)` → `Set<Stage>` where `predictionsOpen` (replaces
  the inline `openStages` derivation).
- Tab reachability: `resultsTabVisible = getResultsStages(...).size > 0`;
  `standingsTabVisible = getStandingsStages(...).size > 0`.

Replace the existing `getTabVisibility` tests with tests for these derivations,
including: results stage requires both flag and content; tab-visible booleans
reflect emptiness.

## Context (`src/components/app-context.tsx`)

- Remove `standingsVisible`, `resultsVisible`, `updateTabVisibility`, and the
  `AppSettingKey` import.
- Keep `openStages` as the predictions set (now sourced from `predictionsOpen`).
- Add `resultsStages: Set<Stage>`, `standingsStages: Set<Stage>`,
  `resultsTabVisible: boolean`, `standingsTabVisible: boolean`.
- Add `updateStageFlag: (stage: Stage, flag: StageFlag, value: boolean) => Promise<void> | void`
  where `StageFlag = "predictions" | "results" | "standings"`.

## App shell (`src/components/app-shell.tsx`)

- Remove `appSettings` state, `seedAppSettings` import, `updateTabVisibilityAction`
  import/usage, and the `getTabVisibility` usage.
- Derive `resultsStages`/`standingsStages`/`resultsTabVisible`/`standingsTabVisible`
  via the new helpers (memoized over `stages`, `matches`, `groups`).
- Redirect guard + disabled nav buttons: same UX, now driven by
  `standingsTabVisible` (Tabla) and `resultsTabVisible` (Resultados).
- Mobile stats pill: inert when `!standingsTabVisible`; `me` computed via the
  revealed-scoped `getLeaderboard` (passing `matches` + `standingsStages`).
- `updateStageFlag(stage, flag, value)`: optimistic state update on `stages`, then
  call `updateStageFlagAction`, then refresh — mirroring today's `updateStageOpen`.

## Actions (`src/app/actions.ts`)

- Remove `updateTabVisibilityAction` and `UpdateTabVisibilityInput`; remove the
  `AppSettingKey` import.
- Replace `updateStageOpenAction`/`UpdateStageInput` with
  `updateStageFlagAction({ stage, flag, value })`, `flag: "predictions" |
  "results" | "standings"`. Admin-gated. Maps `flag` to the column
  (`predictions_open` / `results_open` / `standings_open`); when `flag ===
  "predictions"` also set `opened_at`/`opened_by` as today. Returns a localized
  ok/message.
- `canSavePrediction` / `canSaveGroupPrediction` and `savePredictionAction` /
  `saveGroupPredictionAction` select `stage, open` from `stages`; update those
  selects/usages to `predictions_open` (the `openStages` set they build stays the
  predictions set).

## UI

### `StageTabs` (`src/components/badges.tsx`)
Generalize: replace the internal `stages.filter(s => s.open)` derivation with an
explicit prop `enabledStages: Set<Stage>` (stages not in the set render disabled).
Update the predictions and results call sites to pass their respective sets
(`openStages` for predictions; `resultsStages` for results).

### Tabla (`src/screens/leaderboard.tsx`)
- Stage selector mirroring Resultados: a leading **"Acumulado"** option plus one
  tab per stage in `standingsStages`. (Implementation of the "Acumulado + stages"
  selector — whether via a small extension to `StageTabs` or a thin local control —
  is decided in the plan; it must visually match the Resultados tab strip.)
- "Acumulado" renders `getLeaderboard` (revealed-scoped). Each stage tab renders
  `getStageLeaderboard(stage, ...)`.
- Default selection: "Acumulado".

### Resultados (`src/screens/results.tsx`)
- Compute the visible stage set as `resultsOpen` AND `getStagesWithContent`
  (intersection). Pass it as `enabledStages` to `StageTabs`. Default active stage
  stays the latest finalized among the visible set.

### Admin (`src/screens/admin.tsx`)
- "Etapas habilitadas" card: each stage row gets three labeled toggles —
  Predicciones / Resultados / Standings — each calling `updateStageFlag(stage,
  flag, !current)` with the existing `runAdminAction` + `LoadingLabel` pattern and a
  distinct `pendingAdminAction` key per (stage, flag).
- Remove the "Pestañas visibles" card (it was `app_settings`-based).

## Error handling

- Reuses the `dataMessage` channel for action results.
- Optimistic stage-flag updates, reverted implicitly by `refreshSupabaseData` on
  failure (consistent with today's `updateStageOpen`).
- The redirect guard still guarantees a disabled tab is not viewable even if a
  stale client renders an enabled-looking button.

## Testing

- `src/lib/standings.test.ts`: revealed-scoped `getLeaderboard` and
  `getStageLeaderboard` (per-stage totals, groups handling, tiebreaks).
- `src/lib/tab-visibility.test.ts`: `getResultsStages` (needs flag AND content),
  `getStandingsStages`, `getPredictionsStages`, and the tab-visible booleans.
- Existing `standings.test.ts` (getInitials/podiumOrder) and other suites must stay
  green.

## Out of scope

- No change to scoring or how `points` are stored; per-stage standings re-slice
  existing point values.
- No per-user overrides; flags are global per stage.
- No scheduling/auto-reveal; flags are manual admin actions.
- No rename of the predictions screen behavior beyond sourcing from
  `predictions_open`.

## Migration / rollout note

The live Supabase database must run
`docs/supabase-migration-stage-results-standings.sql`. Because it renames a column
and drops `app_settings`, it is not reversible without a follow-up migration; apply
during a deploy window. Existing `app_settings` data is discarded (the global
toggles no longer exist).
