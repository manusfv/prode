# Stage-based knockout scoring + drop the tie-advancer

**Date:** 2026-06-27
**Status:** Approved, ready for implementation plan

## Problem

Knockout ("Cruces") match predictions are scored with a flat **3 points exact /
1 point outcome**, regardless of round. We want points to grow as the tournament
advances, so a correct final prediction is worth far more than a round-of-32 one.

Separately, the product currently makes users pick who advances when they predict
a knockout tie (the "advancer" / `winner_team_id`). That requirement is being
removed: predicting a level score is just a draw outcome.

## Scoring model

Group ordering scoring is **unchanged** (10/8/6/4 per position, max 28 per group).

Knockout per-match scoring becomes per-stage:

| stage (code) | round          | outcome | exact |
| ------------ | -------------- | ------- | ----- |
| `round32`    | round of 32    | 10      | 25    |
| `round16`    | round of 16    | 30      | 50    |
| `quarter`    | round of 8     | 60      | 80    |
| `semi`       | semifinals     | 90      | 110   |
| `third`      | 3rd place      | 120     | 150   |
| `final`      | finals         | 120     | 150   |

`third` (3rd-place playoff) is not in the source table; it mirrors `final` for
now. The `groups` stage has no per-match predictions (the predictions screen swaps
to group-ordering cards when the active stage is `groups`), so it needs no entry
in the knockout table.

A `STAGE_POINTS: Record<Stage, { outcome: number; exact: number }>` (or a
knockout-only map) lives in `src/lib/scoring.ts`. `scorePrediction` looks up the
match's stage:

- **exact** (both scores match) → exact points, `{ exactHit: true, outcomeHit: true }`
- **outcome** (same home/away/draw result) → outcome points, `{ outcomeHit: true }`
- otherwise → 0 points

`scorePrediction` still returns `{ points, exactHit, outcomeHit }`. Points are
computed in JS and stored on the row; there is no DB-side scoring.

## Outcome without the advancer

`getOutcome` becomes **score-only**: `home` / `away` / `draw`, derived purely from
the two scores, on both the predicted and the official side. It no longer takes or
uses a `winnerTeamId`.

Consequence: a knockout match that finishes level (decided on penalties in
reality) has official outcome `draw`. Any X–X prediction earns the outcome points
for that stage. This is the intended behavior of removing the advancer.

## Drop the tie-advancer from the prediction flow

`winner_team_id` exists on **both** `matches` and `predictions`.

- **`matches.winner_team_id` stays** — it drives bracket advancement and knockout
  auto-sync. Nothing in this change touches the match side.
- **`predictions.winner_team_id` is dropped** — the prediction no longer carries an
  advancer.

Code changes (prediction side only):

- **`src/lib/types.ts`** — remove `winnerTeamId` from `Prediction` and
  `PredictionDraft`. Leave `Match.winnerTeamId`.
- **`src/lib/tournament.ts`** — delete `needsAdvancer` and `inferWinner`. Both
  exist only for the advancer flow (`inferWinner` is used by `actions.ts` to stamp
  `predictions.winner_team_id`, and by the now-removed `getPredictionWinner`).
  The knockout match-fixtures sync computes its own winner locally and does not
  use these helpers.
- **`src/lib/scoring.ts`** — `canSavePrediction` drops the
  `needsAdvancer(...) && !draft.winnerTeamId` → "Elegí quién clasifica." branch.
  Delete `getPredictionWinner`. Simplify `getOutcome`.
- **`src/screens/predictions.tsx`** — remove the advancer selector UI, the
  `showAdvancer`/`needsAdvancer` logic, the "· clasifica X" display strings, and
  `winnerTeamId` from the draft seed and the change-detection signature.
- **`src/screens/results.tsx`** — remove the "· {team}" advancer suffix on a
  prediction's pick.
- **`src/app/actions.ts`** — stop writing `predictions.winner_team_id` on
  save/insert/update and stop mapping it on read. Drop the `inferWinner` import.
  Match-side admin writes that set `matches.winner_team_id` are untouched.
- **`src/lib/supabase-data.ts`** — drop `winner_team_id` from the prediction row
  type and `mapPrediction`. The match row type / mapper keep it.
- **`src/components/app-shell.tsx`** — drop `winnerTeamId` from the prediction
  optimistic-update patch logic. Match-side patches are untouched.

## Migration

New file `docs/supabase-migration-stage-scoring.sql`:

1. Recreate `predictions_insert_own_open` and `predictions_update_own_open`
   **without** the trailing advancer clause
   (`predictions.home_score <> predictions.away_score or predictions.winner_team_id
   in (m.home_team_id, m.away_team_id)`). This is the cleanup the
   `supabase-migration-knockout-prediction-rls-fix.sql` note explicitly
   anticipated.
2. `alter table public.predictions drop column winner_team_id;`

Also update `docs/supabase-schema.sql` to match (remove the
`predictions.winner_team_id` column and the advancer clause from both policies) so
a fresh setup is correct.

No DB scoring logic exists, so the migration carries no points table.

## Recalc / backfill

Per-stage points change the value of already-scored knockout predictions. Scoring
is recomputed by `src/lib/sync/recalc-matches.ts`, which calls `scorePrediction`,
so re-running the admin recalc/sync restamps `points/exact_hit/outcome_hit` for
finalized matches.

The tournament has not reached the knockout stage, so there are likely no
finalized knockout predictions to restamp. The spec still calls it out: after
deploying, an admin should trigger a recalc for any finalized knockout stage so
stored points reflect the new values.

## Rules + Novedades

- **`src/screens/rules.tsx`** — rewrite the "Cruces" section to present the
  per-stage points (a compact table or list), and remove the
  "Si pronosticás empate, tenés que elegir quién clasifica." line.
- **Novedades modal** (`src/components/novedades-modal.tsx`) — add an entry
  describing the new per-stage scoring (per project CLAUDE.md).

## Tests

- **`src/lib/scoring.test.ts`** — replace the flat 3/1 expectations with per-stage
  values; convert the "scores knockout advancer when tied" test into a
  "scores a level knockout result as a draw outcome" test that no longer sets
  `winnerTeamId`; remove the `canSavePrediction` "requires an advancer" test.
  Group tests are unchanged.
- **`src/lib/tournament.test.ts`** — remove the `needsAdvancer` describe block.
- **`src/lib/sync/recalc-matches.test.ts`** — update expected points to per-stage.
- Update any remaining fixtures that set `prediction.winnerTeamId` (match fixtures
  keep `winnerTeamId`).

## Out of scope

- Group ordering scoring (unchanged).
- `matches.winner_team_id` and bracket advancement (unchanged).
- Any change to how stages are opened/closed or visible.
