# Pronósticos preview redesign + scroll/blur fix

**Date:** 2026-06-12
**Scope:** `/pronosticos` — the right-side "other people's pronósticos" preview sheet.

## Problems

1. **Cropped names on mobile.** Each person's row in `GroupDrawer` and `PredictionDrawer`
   (`src/screens/predictions.tsx`) is a single-line grid `[name (1fr, truncates) | prediction (auto)]`.
   The prediction (4 flags + short names + points, or `score · clasifica X`) consumes the row, so the
   name truncates hard at narrow widths (e.g. "Juan Martín P…").

2. **Backdrop blur and the right sheet get sliced when scrolling with the preview open.**
   `src/app/globals.css` sets `overflow-x: clip` on `html, body`. Combined with the dialog's
   `fixed inset-0` backdrop (`backdrop-filter`) and the `fixed` right-side sheet, the root-level clip
   coerces the page into a clipping context, so the fixed overlay/sheet are clipped to the first
   viewport and appear "cut in half" once the page scrolls.

## Design

### 1. Row layout — stacked, two lines

Replace the one-line row with a stacked block in both `GroupDrawer` and `PredictionDrawer`:

- **Top line:** `[name (1fr, truncates) | earned-points slot (auto, right-aligned)]`.
  - Name keeps `truncate` but now has the full row width to itself.
  - Earned-points slot shows:
    - `{points} pts` (green) when the match/group is **finalized**.
    - `WIP` (muted) when it is **locked but not finalized** (points not yet calculated).
    - nothing when the person has **no prediction** (the row's second line already says "Sin pronóstico").
- **Second line:** the prediction itself, wrapping as needed.
  - Group rows: `🇦🇷 ARG · 🇧🇷 BRA · 🇲🇽 MEX · 🇫🇷 FRA` (flag + `shortName` abbreviation per team, as today).
  - Match rows: `{home}-{away}` plus ` · clasifica 🇦🇷 ARG` when a winner is set.
  - No prediction: muted `Sin pronóstico`.

Earned points and the predicted result are never shown in the same slot — the predicted score is part
of the prediction line, the top-right slot is strictly points awarded.

### Finalized vs locked detection

- Match: finalized when `match.finalizedAt` is set (equivalently `getMatchStatus(match, now) === "finalized"`).
  `PredictionDrawer` will receive `now` so it can use `getMatchStatus` for consistency with the rest of the screen.
- Group: finalized when `group.resultFinalizedAt` is set.

The drawers are only ever opened for locked/finalized states (the trigger button is hidden while `status === "open"`),
so the two cases above are exhaustive in practice.

### 2. Scroll/blur fix

Remove `overflow-x: clip` from the `html, body` rule in `src/app/globals.css`. Horizontal overflow is
already contained by the content `<section>` (`overflow-x-clip`, `src/components/app-shell.tsx`), so the
root-level clip is redundant. Removing it lets the `fixed` backdrop and sheet position against the
viewport correctly. Verify after the change that no horizontal scrollbar appears on the main routes.

## Out of scope

- The on-card footer summary ("Pronósticos: N cargados · M sin pronóstico") is unchanged.
- Leaderboard preview / summary panel rows are unchanged.
- No data-model or scoring changes; `points` fields already exist on `Prediction` and `GroupPrediction`.

## Verification

- `next build` / typecheck passes.
- Manual: long display name no longer truncates prematurely in either drawer; flags + abbreviations show
  on the prediction line; points show as `pts`/`WIP`/none per state.
- Manual: open the preview, scroll the page — backdrop blur covers the full viewport and the sheet is not
  sliced; no horizontal scrollbar on `/pronosticos`, `/tabla`, `/resultados`.
