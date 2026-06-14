# Provisional standings as a preview toggle — design

**Date:** 2026-06-13
**Status:** Approved (pending spec review)
**Amends:** `2026-06-13-provisional-group-standings-design.md`

## Problem

The provisional-group-standings feature (already implemented) folds provisional
group-position points straight into the **official** leaderboard total whenever
group standings are open. Participants want provisional results to instead behave
like a **preview** — something each viewer toggles on and off to see "what the
standings would look like if the groups ended today" — without those points
silently counting as final.

## Scope

In scope:
- Provisional group points stop counting in the official leaderboard total; they
  contribute **only** when the viewer turns preview on.
- A per-viewer **preview toggle on Tabla** (standings) that recomputes the whole
  Tabla as if every provisional group were finalized.
- A separate per-viewer **preview toggle on Resultados** that reveals the
  provisional per-group breakdown.

Out of scope:
- Predicciones / pronósticos screen — untouched.
- Admin-global preview flag — the toggle is per-viewer, client-side UI state only
  (not persisted server-side, no DB change).
- Provisional scoring itself — `group_predictions.points` are still computed and
  stored by the existing recalc; only the leaderboard **aggregation** changes.
- Knockout stages (tournament currently only has groups).

## Core model

`isGroupProvisional(group)` (all four slots set AND `result_finalized_at` null)
already exists. The leaderboard total splits into:

```
official total  = match points  +  FINALIZED group points
preview total   = official total  +  PROVISIONAL group points
```

Provisional points are never "official." Each screen owns an independent,
default-off preview switch. The switches do not share state and are not persisted.

## Components / changes

### 1. Leaderboard aggregation — `src/lib/standings.ts`

`getLeaderboard` gains `groups: Group[]` and `includeProvisional: boolean`. It
computes the set of provisional group labels and filters group predictions:

```ts
const provisionalLabels = new Set(
  groups.filter(isGroupProvisional).map((group) => group.groupLabel),
);
const groupSubset = standingsStages.has("groups")
  ? groupPredictions.filter((prediction) => {
      const isProvisional = provisionalLabels.has(prediction.groupLabel);
      return includeProvisional ? true : !isProvisional;
    })
  : [];
```

So a group prediction's points count when the group is **finalized**, or
(`includeProvisional` AND it is provisional). Empty groups score null → contribute
nothing either way. `getStageLeaderboard("groups", …)` gains the same
`groups` + `includeProvisional` gating so the "Grupos" stage view matches.

`buildLeaderboard` itself is unchanged — the caller passes a pre-filtered
`groupPredictions` subset.

### 2. Tabla UI — `src/screens/leaderboard.tsx`

- `groups` already pulled from `useApp()`; add `const anyGroupProvisional =
  groups.some(isGroupProvisional)`.
- New local state `const [preview, setPreview] = useState(false)`.
- A **switch/toggle** in the header, rendered **only** when `anyGroupProvisional &&
  standingsStages.has("groups")`. Label e.g. "Si los grupos terminaran hoy".
  Default off.
- Pass `includeProvisional: preview` and `groups` into both `getLeaderboard` and
  `getStageLeaderboard`, so podium + accumulated table + the "Grupos" stage view
  all recompute together (no split ranks on one screen).
- When `preview` is on, show an active indicator (amber), e.g. "Mostrando cómo
  quedaría si los grupos terminaran hoy." This **replaces** the always-on
  provisional note added earlier.
- If the toggle is on and the last provisional group finalizes (so
  `anyGroupProvisional` becomes false), the control disappears; `preview` state is
  harmless because `includeProvisional` then changes nothing.

### 3. Resultados UI — `src/screens/results.tsx`

- In `ResultsScreen`, add `const anyGroupProvisional = groups.some(isGroupProvisional)`
  and local state `const [previewGroups, setPreviewGroups] = useState(false)`.
- A **separate switch**, shown only on the groups stage when `anyGroupProvisional`,
  default off. Passed down to each `ResultGroupCard` as a `preview` prop.
- `ResultGroupCard`: `revealOrder = finalized || (provisional && preview)`.
  - Off + provisional → "Resultado pendiente" (pre-feature behavior).
  - On + provisional → reveal order + "Posiciones provisionales" caption +
    "Provisional" chip + provisional points + per-slot ✓/✗ (existing Task 9 render,
    now gated on `preview`).
  - Finalized groups always reveal, independent of the toggle.
- `showPoints` and the `sortComparison` `finalized` arg both follow `revealOrder`.

### 4. Helpers

`isGroupProvisional` (exists) is the single source of truth on both screens and in
standings. No new helper needed. `getGroupStatus` stays unchanged, so
`finalizedGroupLabels`, stats gating, and "reveal everyone's picks when finalized"
keep treating provisional groups as not-final.

## Data flow

```
Admin saves provisional order (existing) → group_predictions.points computed (existing)

Tabla, preview OFF  → getLeaderboard(includeProvisional:false) → official total (no provisional)
Tabla, preview ON   → getLeaderboard(includeProvisional:true)  → podium+table+groups view recomputed + indicator

Resultados, preview OFF → provisional groups show "Resultado pendiente"
Resultados, preview ON  → provisional groups reveal order + points + per-slot hits

Group finalized later → counts officially everywhere; toggles no longer affect it.
```

## Error handling / edge cases

- **No provisional groups:** neither toggle renders → no dead control.
- **standings_open(groups) off:** Tabla toggle hidden; group points (final or
  provisional) excluded from the total regardless, as today.
- **results_open(groups) off:** Resultados groups stage already hidden upstream; the
  Resultados toggle is moot.
- **Toggle is local + ephemeral:** resets on reload; no persistence, no DB. Two
  screens, two independent switches by design.
- **Mid-session finalize:** provisional → finalized makes the group count
  officially; the now-irrelevant toggle hides itself.

## Testing

Unit (`src/lib/standings.test.ts`):
- `getLeaderboard` excludes provisional-group points by default (only finalized +
  match points in the total).
- `getLeaderboard` with `includeProvisional: true` adds provisional-group points.
- A finalized group's points are counted in both modes.
- `getStageLeaderboard("groups", …)` applies the same gating.

Component (light):
- Tabla renders the preview toggle only when a provisional group exists; flipping it
  changes ranks/points and shows the active indicator.
- `ResultGroupCard` shows "Resultado pendiente" for a provisional group when preview
  is off and reveals order + points when on; a finalized group reveals regardless.
