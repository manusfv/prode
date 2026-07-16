# Winner celebration — tournament-complete reveal

**Date:** 2026-07-15
**Status:** Approved design, ready for implementation plan

## Goal

When the tournament finishes (the final is finalized and the finals standings are
revealed), give users a memorable moment: a one-time full-screen celebration that
reveals the pool podium and champion, plus a lasting champion flourish on the tabla.

## Scope

- Detection of "tournament complete".
- A one-time, full-screen winner-reveal overlay that auto-plays once per device.
- A persistent champion crown + a "replay celebration" button on the tabla.
- One new dependency (`canvas-confetti`) and its lazy-loaded wrapper.

Out of scope: server-side "seen" tracking, per-user email/notification, animating
any screen other than the tabla, changing scoring or standings logic.

## Completion detection

New pure helper in `src/lib/tournament.ts`:

```ts
isTournamentComplete(matches: Match[], standingsStages: Set<Stage>): boolean
```

Returns `true` when **both** hold:

1. Every `final` and `third` stage match is finalized (via the existing
   `getMatchStatus(match)` === `"finalized"`).
2. `standingsStages.has("final")` — the admin has revealed the finals standings.

Tying the celebration to the standings reveal guarantees we never show a champion
that the tabla itself is still hiding.

Edge case: if there are **no** `final`/`third` matches at all (empty/seed state),
the helper returns `false` (an empty tournament is not "complete").

Champion and podium come straight from the existing overall `getLeaderboard(...)`
view — no new scoring logic:

- `rows[0]` → champion
- `rows.slice(0, 3)` → podium (uses existing `podiumOrder` for visual ordering)
- `rows.find(r => r.user.id === currentUser.id)` → viewer's own row / rank

## The one-time full-screen celebration

New component `src/components/winner-celebration-overlay.tsx`, **mounted in
`app-shell.tsx`** so it can fire on any page at app load.

### Trigger logic

- On mount, compute `isTournamentComplete`. If `false` → render nothing.
- If `true`, check `localStorage` key `prode:winner-celebrated:v1` (versioned so a
  future re-run is possible by bumping the version).
  - Already set → do **not** auto-play. The reveal remains reachable via the tabla
    replay button.
  - Not set → auto-play the overlay; write the flag when the user dismisses it.
- The overlay's open state is shared: auto-triggered from `app-shell`, and manually
  triggerable from the tabla via a new context method `openWinnerCelebration()`
  (mirrors the existing `openPredictionDrawer` pattern in `AppContextValue`). The
  manual open bypasses the localStorage check.

### Reveal sequence

Full-screen `fixed inset-0` overlay, dimmed + blurred backdrop, built on app tokens
(`app-amber`, `app-brand`, `app-green`, `ui.label`, `ui.panel`). No raw colors.

1. **Eyebrow** fades in: `CAMPEÓN DEL PRODE 2026` (`ui.label` style, larger).
2. **Podium countdown** — spots reveal one at a time (~1s each), building bottom-up:
   - 🥉 3rd place slides/fades in
   - 🥈 2nd place slides/fades in
   - 🏆 **Champion** rises last, larger, with a glow + points **count-up** animation
3. **Confetti burst** fires the instant the champion lands, in brand/amber/green
   token colors.
4. **Your rank** card fades in below: e.g. *"Terminaste #4 de 20"*, or
   *"¡Sos el campeón! 🏆"* when the viewer is `rows[0]`.
5. A `Ver tabla` / `Cerrar` button. On dismiss: write the localStorage flag,
   navigate to `/tabla` (or just close if already there).

### Accessibility

- Respects `prefers-reduced-motion`: skips confetti and staggered timing, showing
  the full podium + rank immediately.
- Focus trapped within the overlay; `Esc` closes it.
- `role="dialog"`, `aria-label`.
- SSR-safe: `localStorage` and confetti access are guarded to client-only.

## Persistent tabla flourish

Changes to `src/screens/leaderboard.tsx`, active only when `isTournamentComplete`
**and** the `overall` (Acumulado) view is selected:

- **Champion crown**: the `#1` `PodiumSpot` gets an elevated "campeón" treatment —
  a 👑 crown above the medal, a stronger amber glow/ring, and a small `Campeón`
  pill. Layered **onto** the existing rank-1 styling (does not replace the medal, so
  stage views are untouched).
- **Replay button**: a `Ver celebración` button near the `StageTabs`/legend row that
  calls `openWinnerCelebration()` to re-open the overlay on demand (bypasses the
  localStorage check). This keeps the reveal reachable after auto-dismiss.

## Confetti

- New dependency: `canvas-confetti` (+ `@types/canvas-confetti` as dev dep).
- New wrapper `src/lib/confetti.ts` that:
  - lazy-imports `canvas-confetti` via `await import(...)` (kept out of the initial
    bundle, never runs on the server),
  - fires a token-colored burst (colors read from resolved app token values),
  - no-ops under `prefers-reduced-motion` and under SSR.

## File summary

**New files**

- `src/components/winner-celebration-overlay.tsx` — overlay + reveal sequence.
- `src/lib/confetti.ts` — lazy confetti wrapper.

**Edited files**

- `src/lib/tournament.ts` — add `isTournamentComplete(...)` (pure).
- `src/components/app-context.tsx` — add `openWinnerCelebration` to
  `AppContextValue`.
- `src/components/app-shell.tsx` — mount overlay, wire auto-trigger +
  localStorage flag + `openWinnerCelebration`.
- `src/screens/leaderboard.tsx` — champion crown on `#1`, `Ver celebración` replay
  button.
- `src/components/novedades-modal.tsx` — add a Novedades entry for the feature.

## Testing

- Unit tests for `isTournamentComplete` in `src/lib/tournament.test.ts`:
  - not complete when a `final` match is unfinalized,
  - not complete when the `third` match is unfinalized,
  - not complete when finals standings are not revealed
    (`!standingsStages.has("final")`),
  - not complete when there are no final/third matches,
  - complete when all final/third matches are finalized **and** standings revealed.
- Overlay timing, confetti, and crown styling are visual — verified by running the
  app, not unit-tested.

## Design-system compliance

- Tokens only (`app-amber`, `app-brand`, `app-green`, `ui.label`, `ui.panel`,
  `ui.control`); no raw `white`/`black`/`gray`/hex.
- Crown / glow / pill implemented with Tailwind utilities, not new `globals.css`.
- Confetti colors pulled from resolved token values.
