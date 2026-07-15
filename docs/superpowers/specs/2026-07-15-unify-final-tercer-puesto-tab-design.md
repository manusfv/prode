# Unify the "3er puesto" and "Final" pronóstico tabs

**Date:** 2026-07-15
**Status:** Approved, ready for implementation plan

## Problem

The tournament has two single-match knockout stages that currently each get their
own stage tab: `third` ("3er puesto") and `final` ("Final"). Because each holds
exactly one match, these tabs each render a single card. We want to merge them
into one tab labeled **"Final y 3er puesto"** so the last two matches of the
tournament live together, consistently across every screen that shows stage tabs.

`third` and `final` must remain **distinct stages** under the hood — scoring,
sync, admin, the database, and the per-match `StageBadge` are unchanged. Only the
tab layer merges.

## Scope

`StageTabs` (`src/components/badges.tsx`) has exactly three consumers:

- **Pronósticos** — `src/screens/predictions.tsx`
- **Resultados** — `src/screens/results.tsx`
- **Tabla** — `src/screens/leaderboard.tsx`

Estadísticas does **not** use `StageTabs` and is out of scope. All three consumers
above are in scope.

Out of scope (must not change): `Stage` type, `stageOrder`, `stageLabels`,
`StageBadge`, scoring (`src/lib/scoring.ts`), sync (`src/lib/sync/*`), admin
(`src/screens/admin.tsx`), and the database schema.

## Design

### Approach

Introduce a **stage-tab layer** over `Stage`: a single ordered list of tabs, each
mapping to one or more `Stage`s. Every `StageTabs` consumer reads this list, so the
merge is defined once and behaves identically everywhere. `Stage` itself is
untouched.

Rejected alternatives:

- **B — drop the `third` tab, make `final` secretly mean both.** Less code but
  scatters a fragile "`final` really means two stages" special-case across every
  match filter and `getStageLeaderboard`. Easy to miss a spot.
- **C — merge only visually, sum two stage-leaderboards in tabla.** Pushes
  special-casing into the leaderboard instead of defining the merge once.

### 1. `src/lib/tournament.ts` — tab model

```ts
export type StageTabId = "groups" | "round32" | "round16" | "quarter" | "semi" | "finals";

export const stageTabs: { id: StageTabId; label: string; stages: Stage[] }[] = [
  { id: "groups",  label: "Grupos",  stages: ["groups"] },
  { id: "round32", label: "32avos",  stages: ["round32"] },
  { id: "round16", label: "16avos",  stages: ["round16"] },
  { id: "quarter", label: "Cuartos", stages: ["quarter"] },
  { id: "semi",    label: "Semis",   stages: ["semi"] },
  { id: "finals",  label: "Final y 3er puesto", stages: ["third", "final"] },
];
```

Labels are copied from the current `stageLabels` values so wording stays identical
for the unchanged tabs.

Helpers:

- `stageToTab(stage: Stage): StageTabId` — reverse lookup (`third`/`final` → `finals`).
- `tabStages(id: StageTabId): Stage[]` — the stages a tab covers.
- `isStageTab(value: string): value is StageTabId`.
- `resolveStageTab(param: string | null): StageTabId | null` — accepts a tab id
  **or** a legacy `Stage` value, returning the owning tab. This preserves
  back-compat for old `?stage=third` / `?stage=final` links (both resolve to
  `finals`). Returns `null` for unrecognized input.

`stageOrder`, `stageLabels`, and `isStage` stay as-is — still used by `StageBadge`
and all non-tab code.

### 2. `StageTabs` (`src/components/badges.tsx`)

- Iterate `stageTabs` instead of `stageOrder`. The tab value is now a `StageTabId`.
- A tab is **enabled** when *any* of its stages is in `enabledStages`
  (`tab.stages.some((s) => enabledStages.has(s))`).
- `activeLabel` is resolved from the tab list (or `leadingOption`), not
  `stageLabels[activeStage]`.
- `enabledStages: Set<Stage>` prop stays (callers keep passing stage sets); only
  the internal enable check changes.
- `leadingOption` ("Acumulado") is unaffected — it renders before the tabs as today.

### 3. Screens

Common pattern in all three:

- `activeStage: Stage` → `activeTab: StageTabId`.
- The `?stage=` URL param now carries a tab id; parse with `resolveStageTab(param)`
  (falls back to the computed default when `null`).
- Match filters `match.stage === activeStage` → `tabStages(activeTab).includes(match.stage)`.
- `activeStage === "groups"` checks → `activeTab === "groups"`.
- Default-stage computation (last open / last stage-with-content) keeps its existing
  logic but its result is mapped through `stageToTab` to pick the default tab.

Screen specifics:

- **predictions.tsx** — `defaultStage`, `activeStage`, `visibleMatches` filter,
  `lastModifiedAt` stage-match-id set, and the `groups` branches all move to the tab.
- **results.tsx** — `getPreferredStage`, the `resultsStages.has(activeStage)`
  fallback effect, the visible-matches filter, and `isGroups` move to the tab.
- **leaderboard.tsx** — `view` becomes `StageTabId | "overall"`;
  `getStageLeaderboard(view, …)` is called with the tab (see §4).

### 4. `getStageLeaderboard` (`src/lib/standings.ts`)

Change the signature to accept a `StageTabId` (resolve to its stage set internally
via `tabStages`) and filter predictions with `.includes()` instead of `=== stage`.
The `groups` special-case (build from group predictions) is keyed on the tab
including `groups`.

`getDefaultResultStage` and any results helper that returns a `Stage` gain a
tab-returning path (either return `StageTabId`, or callers wrap with `stageToTab`).
Chosen at implementation time to minimize churn; behavior must be: the default tab
is the tab owning the stage the old logic would have selected.

### 5. Tests

- Update `src/lib/standings.test.ts` for the new `getStageLeaderboard` signature.
- Update `src/lib/results.test.ts` for any changed helper return type.
- Add unit tests for `stageToTab`, `tabStages`, `resolveStageTab` (including legacy
  `third`/`final` → `finals` and unknown → `null`), and `isStageTab`.
- Add coverage that the `finals` tab filter includes both a `third` and a `final`
  match, and that `getStageLeaderboard("finals", …)` aggregates both stages'
  predictions.

## Behavior

The "Final y 3er puesto" tab shows both matches, sorted by kickoff (3rd-place
playoff, then the Final). Each card keeps its own `StageBadge` ("3er puesto" /
"Final"), so the two are visually distinguishable without extra labels. Enablement,
"solo admin" preview, and the "Faltan (n)" counters behave exactly as before,
now aggregated across the two merged stages. No DB, scoring, sync, or admin changes.

## Novedades

Per project convention, after implementing ask whether to add an entry to the
Novedades modal (`src/components/novedades-modal.tsx`) for the merged tab.
