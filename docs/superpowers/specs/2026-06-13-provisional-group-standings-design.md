# Provisional group standings — design

**Date:** 2026-06-13
**Status:** Approved (pending spec review)

## Problem

Only the first round of group-stage matches has been played. Participants want to
see their standings reflecting the results so far. The admin will update each
group's current 1°→4° table manually. Today, group-position predictions
(`group_predictions`) score **only** once a group is fully finalized
(`result_finalized_at` set), so nothing shows mid-stage.

We want the admin to enter a group's **current** standings and have
group-position predictions scored against them **provisionally** — re-scorable as
the table moves, clearly distinct from a final result — feeding both the
leaderboard total and a per-group breakdown.

## Scope

In scope:
- Provisional scoring of group-position predictions against a manually-entered
  current order.
- Admin UI to save a provisional order (and, separately, to finalize).
- Leaderboard reflects provisional group points, clearly labelled.
- Per-group breakdown (results screen) shows the provisional order and provisional
  points.

Out of scope:
- Computing group tables from match scores (admin enters the order by hand).
- Per-match prediction scoring (already accrues independently when a match is
  finalized — unchanged).
- Any change to knockout stages (the tournament currently only has groups).
- DB schema migration (none required).

## Core model

The four position slots (`first_team_id..fourth_team_id`) on a group hold the
**current known order**. The `result_finalized_at` timestamp stops meaning
"scored" and means only "locked as final":

```
provisional  =  all four slots set  AND  result_finalized_at IS NULL
final        =  result_finalized_at IS set
empty        =  any slot NULL
```

`scoreGroupPrediction` already returns `{ points: 0, exactPositions: 0 }` when any
actual slot is null, so it is safe to call for any group; only the recalc gate
needs to change.

## Components / changes

### 1. Scoring recalc — `recalculateGroupPredictionsForGroups` (`src/app/actions.ts`)

Today:

```ts
const score = group.resultFinalizedAt
  ? scoreGroupPrediction(group, prediction)
  : { points: null, exactPositions: 0 };
```

Change so it scores whenever the group has a complete order (provisional or
final), and leaves points null only when the order is incomplete:

```ts
const hasOrder = [group.firstTeamId, group.secondTeamId, group.thirdTeamId, group.fourthTeamId]
  .every(Boolean);
const score = hasOrder
  ? scoreGroupPrediction(group, prediction)
  : { points: null, exactPositions: 0 };
```

Provisional points become non-null and flow into the leaderboard through the
existing path (`getLeaderboard` already sums group points when `"groups"` is in
`standingsStages`, and `standings_open` is on for groups).

### 2. Admin action — `saveGroupStandingsAction` (`src/app/actions.ts`)

Generalize the current `finalizeGroupResultAction` into one action that takes a
`finalize` flag:

```ts
type SaveGroupStandingsInput = {
  groupLabel: string;
  firstTeamId: string;
  secondTeamId: string;
  thirdTeamId: string;
  fourthTeamId: string;
  finalize: boolean;
};
```

Behavior:
- Same validation as today: all four present, no duplicates.
- Always writes `first..fourth`, `updated_at`, `updated_by`.
- Sets `result_finalized_at`/`result_finalized_by` **only** when `finalize: true`;
  leaves them null (provisional) otherwise. Re-runnable: an admin can re-save a
  provisional order as the real table changes.
- Always calls `recalculateGroupPredictionsForGroups` for that group.

Keep `finalizeGroupResultAction` as a thin wrapper (`finalize: true`) if other
callers exist, or replace its single call site.

### 3. Helper — `isGroupProvisional` (`src/lib/tournament.ts`)

```ts
export function isGroupProvisional(group: Group): boolean {
  const filled = [group.firstTeamId, group.secondTeamId, group.thirdTeamId, group.fourthTeamId]
    .every(Boolean);
  return filled && !group.resultFinalizedAt;
}
```

Used only for labelling. `getGroupStatus` is **unchanged** — it still returns
`finalized` only on `result_finalized_at`, so `finalizedGroupLabels` and the
stats/results "reveal everyone's picks when finalized" logic keep treating
provisional groups as not-final. No accidental reveals.

### 4. Admin UI — group card (`src/screens/admin.tsx`)

The single "Guardar resultado" button (calls `onFinalize`) splits into two:
- **"Guardar provisional"** — enabled when the order is complete; calls the action
  with `finalize: false`. Stays editable after saving.
- **"Finalizar grupo"** — calls with `finalize: true` (today's behavior).

Status line shows `Provisional` when `isGroupProvisional(group)` (between "Abierto/
Cerrado" and "Finalizado").

### 5. Leaderboard — `src/screens/leaderboard.tsx`

The leaderboard already includes group points. Add a **"Provisional"** badge / a
one-line note (e.g. "Incluye posiciones provisionales de grupos") shown when any
contributing group is provisional, so totals are not mistaken for final. Compute
from the `groups` already in `useApp()`.

### 6. Per-group breakdown — `GroupResultCard` (`src/screens/results.tsx`)

Today this card renders the order and points **only** when `finalized`, else shows
"Resultado pendiente". Extend to a `provisional` state:

- `const provisional = isGroupProvisional(group)`; `const revealOrder = finalized || provisional`.
- When `revealOrder`, render the ordered list (as today) with a `Provisional` chip
  in the header when `provisional` (vs "Finalizado" when final).
- `showPoints = finalized || provisional` so `GroupComparisonRow` shows provisional
  points + `exactPositions/4`.
- `sortComparison` `finalized` arg becomes `finalized || provisional` so rows sort
  by points while provisional.
- For the current user's row, additionally mark each predicted slot ✓/✗ against the
  current order (nice-to-have within this card; the points pill is the primary
  signal).

## Data flow

```
Admin enters current 1-4 → saveGroupStandingsAction(finalize:false)
  → writes first..fourth (result_finalized_at stays null)
  → recalc scores group_predictions against the order (points non-null)
  → revalidatePath("/")

Participant /tabla   → getLeaderboard sums provisional group points → total + "Provisional" badge
Participant /resultados → GroupResultCard shows provisional order + provisional points per person

Later, group ends → "Finalizar grupo" → saveGroupStandingsAction(finalize:true)
  → result_finalized_at set → group now "finalized" everywhere (reveals, stats), points unchanged
```

## Error handling / edge cases

- **Incomplete order:** provisional requires all four slots (admin breaks current
  ties by judgment). Validation rejects partial/duplicate orders, same as finalize.
- **Clearing an order:** if an admin empties slots, `hasOrder` is false → those
  predictions return to `points: null` (0 in leaderboard). (Requires the action/UI
  to permit writing empties; optional — can be deferred.)
- **standings_open:** must be true for "groups" (true in seed; verify in prod).
- **Re-provisionalizing a finalized group:** not supported — finalize is one-way in
  the UI (re-saving provisional on a finalized group is not offered). Acceptable.
- **Stats:** provisional groups are excluded from `finalizedGroupLabels`, so
  finalized-only stats stay gated. No change needed.

## Testing

Unit:
- `recalculateGroupPredictionsForGroups`-equivalent logic: a complete but
  non-finalized group scores predictions (points non-null); an incomplete group
  yields null.
- `isGroupProvisional` truth table (empty / provisional / final).
- `getLeaderboard` includes provisional group points in the total.
- `saveGroupStandingsAction` sets `result_finalized_at` iff `finalize: true`
  (test the input→update mapping).

Component (light):
- `GroupResultCard` renders the order + provisional points + `Provisional` chip
  when provisional; "Finalizado" + final points when finalized; "Resultado
  pendiente" when empty.
- Leaderboard shows the "Provisional" note when a contributing group is provisional.
</content>
