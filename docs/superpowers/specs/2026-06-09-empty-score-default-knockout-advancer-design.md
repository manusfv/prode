# Empty score default + knockout advancer fix

Date: 2026-06-09

## Problem

On knockout matches, the "Clasifica" (who-advances) picker is supposed to appear
only when a user predicts a tie. In practice it appears on **every** knockout
match before the user touches anything.

Root cause: the prediction card seeds its draft with `0` for untouched scores
(`prediction?.homeScore ?? 0` in `src/screens/predictions.tsx`). A knockout
`0-0` is a tie, so `needsAdvancer()` is `true` by default for every knockout
match. The default `0` also makes "no prediction yet" indistinguishable from a
deliberate `0-0`.

`needsAdvancer()` and `scorePrediction()` already guard on `null` scores, and
`PredictionDraft` already allows `null`. The only gap is the UI substituting `0`
for "untouched" and persisting partials.

## Goal

- Untouched scores render as `"-"` (an empty / null state), not `0`.
- `"-"` counts as **no result entered** → the match stays *Sin pronóstico* and is
  counted in "Faltan".
- "Clasifica" shows only when both scores are real, entered numbers **and** equal.
- A prediction is saved only when it is complete (both scores entered, and for a
  knockout tie, an advancer chosen).

## Design

### 1. Nullable draft, local to the card
`MatchCard` owns the editable draft in local state — `homeScore`, `awayScore`
(`number | null`), `winnerTeamId` (`string | null`) — seeded from the saved
prediction, or `null/null/null` when none exists. It reconciles when the saved
prediction prop changes (e.g. after a data refresh).

The global `predictions` array continues to hold only **complete, saved** rows,
so missing-count, scoring, and the reveal drawer are unaffected.

### 2. `ScoreControl` supports `number | null`
- Renders `"-"` when the value is `null`.
- Stepper behavior:
  - `+` from `null` → `0`; from `n` → `n + 1`.
  - `-` from `n > 0` → `n - 1`; from `0` → `null` (clears); from `null` → disabled.
  - Clearing the text input → `null`; typing a digit sets the number.

### 3. Save only when complete
The card calls the saving `onChange` (→ `savePredictionAction`) only when both
scores are non-null and, if `needsAdvancer` is true, `winnerTeamId` is set. While
incomplete, edits live in local state only — nothing is persisted and the match
remains *Sin pronóstico*. This also avoids the premature "Elegí quién clasifica"
error flash.

### 4. "Clasifica" gating
Falls out of (1)–(2): `needsAdvancer()` returns `false` for `null` scores, so the
picker only appears on a real, entered tie. When the user clears a tie or breaks
it, any stale `winnerTeamId` is dropped.

## Rejected alternatives

- **Relax `Prediction.homeScore` to `number | null` globally** — ripples through
  types/scoring and blurs the "saved vs draft" distinction.
- **Presentational "show `-` when value is 0"** — can't distinguish a real `0-0`
  from untouched.

## Testing

- `needsAdvancer`: `false` for `null/null`, `false` for an entered non-tie,
  `true` for an entered knockout tie, `false` for a group-stage tie (existing).
- Card-level: untouched knockout shows no "Clasifica"; entering an equal score
  reveals it; clearing a side hides it again.
