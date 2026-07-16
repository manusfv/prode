# Winner Celebration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the tournament finishes, auto-play a one-time full-screen winner reveal (podium countdown → confetti → your rank) and give the tabla a lasting champion crown + replay button.

**Architecture:** A pure `isTournamentComplete` helper gates everything. A `WinnerCelebrationOverlay` component (mounted in `app-shell.tsx`) renders the staged reveal from the existing overall leaderboard rows; app-shell auto-opens it once per device via `localStorage` and exposes `openWinnerCelebration()` on the app context so the tabla can replay it. Confetti comes from a lazy-loaded `canvas-confetti` wrapper.

**Tech Stack:** Next.js 15 / React 19, TypeScript, Tailwind v4 (app-* tokens), vitest, canvas-confetti.

## Global Constraints

- Design system: **app-* color tokens only**, no raw `white`/`black`/`gray`/hex in UI classes. Use `ui.*` recipes from `src/lib/ui-tokens.ts`. Eyebrow labels = `ui.label`. (See `docs/design-system.md`.)
- Confetti canvas colors are JS values (not UI classes) and read from the token CSS vars `--amber`/`--green`/`--brand` at runtime, with hex fallbacks.
- Spanish (rioplatense) user-facing copy. No em-dashes in copy.
- All `localStorage`, `window`, and confetti access must be SSR-guarded (`typeof window === "undefined"` / try-catch), matching the existing `NovedadesModal` pattern.
- Champion = `rows[0]` of the existing overall `getLeaderboard(...)`. Do not add scoring logic.

---

### Task 1: `isTournamentComplete` helper

**Files:**
- Modify: `src/lib/tournament.ts` (add export near `getGroupStatus`)
- Test: `src/lib/tournament.test.ts`

**Interfaces:**
- Consumes: existing `getMatchStatus(match, now)` from `src/lib/tournament.ts`; `Match`, `Stage` from `src/lib/types.ts`.
- Produces: `isTournamentComplete(matches: Match[], standingsStages: Set<Stage>, now?: Date): boolean`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/tournament.test.ts`. Import `isTournamentComplete` in the existing top import block, and add `Match` to the `./types` type import:

```ts
import type { Group, Match, Stage } from "./types";
// ...add isTournamentComplete to the existing "./tournament" import list...

describe("isTournamentComplete", () => {
  const baseMatch: Match = {
    id: "m", matchNo: 1, stage: "final",
    homeTeamId: null, awayTeamId: null,
    kickoffUtc: "2026-07-19T19:00:00.000Z",
    status: undefined,
    homeScore: null, awayScore: null, winnerTeamId: null,
    finalizedAt: null, finalizedBy: null,
    updatedAt: null, updatedBy: null,
    finalizedSource: null, feedMatchId: null,
  };
  const finalized = (over: Partial<Match>): Match => ({
    ...baseMatch, status: "finalized", finalizedAt: "2026-07-19T21:00:00.000Z", ...over,
  });
  const revealed: Set<Stage> = new Set(["final"]);

  it("is complete when all final + third matches are finalized and standings are revealed", () => {
    const matches = [finalized({ id: "f", stage: "final" }), finalized({ id: "t", stage: "third" })];
    expect(isTournamentComplete(matches, revealed)).toBe(true);
  });

  it("is not complete when a final match is unfinalized", () => {
    const matches = [{ ...baseMatch, id: "f", stage: "final" as Stage }, finalized({ id: "t", stage: "third" })];
    expect(isTournamentComplete(matches, revealed)).toBe(false);
  });

  it("is not complete when the third-place match is unfinalized", () => {
    const matches = [finalized({ id: "f", stage: "final" }), { ...baseMatch, id: "t", stage: "third" as Stage }];
    expect(isTournamentComplete(matches, revealed)).toBe(false);
  });

  it("is not complete when finals standings are not revealed", () => {
    const matches = [finalized({ id: "f", stage: "final" }), finalized({ id: "t", stage: "third" })];
    expect(isTournamentComplete(matches, new Set(["groups"]))).toBe(false);
  });

  it("is not complete when there are no final/third matches", () => {
    expect(isTournamentComplete([finalized({ id: "s", stage: "semi" })], revealed)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/tournament.test.ts`
Expected: FAIL — `isTournamentComplete is not a function` / not exported.

- [ ] **Step 3: Implement the helper**

Add to `src/lib/tournament.ts` (after `getGroupStatus`):

```ts
/**
 * The tournament is over: every final + 3er-puesto match is finalized AND the
 * admin has revealed the finals standings (so the champion the celebration shows
 * matches what the tabla shows).
 */
export function isTournamentComplete(
  matches: Match[],
  standingsStages: Set<Stage>,
  now = new Date(),
): boolean {
  if (!standingsStages.has("final")) return false;
  const finalMatches = matches.filter((m) => m.stage === "final" || m.stage === "third");
  if (finalMatches.length === 0) return false;
  return finalMatches.every((m) => getMatchStatus(m, now) === "finalized");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/tournament.test.ts`
Expected: PASS (all `isTournamentComplete` cases green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament.ts src/lib/tournament.test.ts
git commit -m "feat(tournament): add isTournamentComplete helper"
```

---

### Task 2: Confetti wrapper + dependency

**Files:**
- Create: `src/lib/confetti.ts`
- Modify: `package.json` (via install commands)

**Interfaces:**
- Produces: `fireConfetti(): Promise<void>` — lazy-imports canvas-confetti, no-ops under SSR / reduced-motion.

- [ ] **Step 1: Install the dependency**

Run:
```bash
npm install canvas-confetti && npm install -D @types/canvas-confetti
```
Expected: both packages added to `package.json`, no peer-dep errors.

- [ ] **Step 2: Write the wrapper**

Create `src/lib/confetti.ts`:

```ts
// Festive fallbacks matching the amber/green/brand tokens (used if the CSS
// custom properties can't be read).
const FALLBACK_COLORS = ["#fbbf24", "#22c55e", "#818cf8"];

function tokenColors(): string[] {
  if (typeof window === "undefined") return FALLBACK_COLORS;
  const styles = getComputedStyle(document.documentElement);
  const colors = ["--amber", "--green", "--brand"]
    .map((name) => styles.getPropertyValue(name).trim())
    .filter(Boolean);
  return colors.length ? colors : FALLBACK_COLORS;
}

/** Fire a celebratory confetti burst. No-ops on the server or under reduced motion. */
export async function fireConfetti(): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const { default: confetti } = await import("canvas-confetti");
  const colors = tokenColors();
  for (const x of [0.25, 0.5, 0.75]) {
    confetti({ particleCount: 60, spread: 70, startVelocity: 45, origin: { x, y: 0.6 }, colors });
  }
}
```

- [ ] **Step 3: Verify it typechecks and no-ops safely**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors; `@types/canvas-confetti` resolves the dynamic import).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/lib/confetti.ts
git commit -m "feat(confetti): lazy canvas-confetti wrapper with token colors"
```

---

### Task 3: `WinnerCelebrationOverlay` component

**Files:**
- Create: `src/components/winner-celebration-overlay.tsx`

**Interfaces:**
- Consumes: `fireConfetti` (Task 2); `getInitials`, `podiumOrder`, `LeaderboardRow` from `src/lib/standings.ts`; `ui` from `src/lib/ui-tokens.ts`; `Button` from `src/components/ui/button`.
- Produces:
  ```ts
  function WinnerCelebrationOverlay(props: {
    open: boolean;
    onClose: () => void;
    rows: LeaderboardRow[];      // overall leaderboard, already ranked
    currentUserId: string;
  }): JSX.Element | null
  ```

- [ ] **Step 1: Write the component**

Create `src/components/winner-celebration-overlay.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { fireConfetti } from "@/lib/confetti";
import { getInitials, podiumOrder, type LeaderboardRow } from "@/lib/standings";
import { ui } from "@/lib/ui-tokens";
import { cn } from "@/lib/utils";

const STEP_MS = 1100;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  );
}

// Reveal steps: 0 eyebrow · 1 third · 2 second · 3 champion+confetti · 4 your rank + button.
export function WinnerCelebrationOverlay({
  open,
  onClose,
  rows,
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  rows: LeaderboardRow[];
  currentUserId: string;
}) {
  const [step, setStep] = useState(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const podium = rows.slice(0, 3);
  const champion = rows[0];
  const me = rows.find((row) => row.user.id === currentUserId);

  // Drive the staged reveal while open. Reduced motion / short podium jumps to the end.
  useEffect(() => {
    if (!open) {
      setStep(0);
      return;
    }
    if (prefersReducedMotion() || podium.length < 3) {
      setStep(4);
      return;
    }
    setStep(0);
    const timers = [1, 2, 3, 4].map((n) => window.setTimeout(() => setStep(n), STEP_MS * n));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [open, podium.length]);

  // Fire confetti when the champion lands.
  useEffect(() => {
    if (open && step >= 3) void fireConfetti();
  }, [open, step]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open || !champion) return null;

  const ordered = podiumOrder(podium);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Campeón del Prode"
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-app-bg/80 p-6 backdrop-blur-md"
    >
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <p className={cn(ui.label, "text-sm text-app-amber")}>Campeón del Prode 2026</p>

        <div className="grid w-full grid-cols-3 items-end gap-3">
          {ordered.map((row) => (
            <CelebrationPodiumSpot
              key={row.user.id}
              row={row}
              isChampion={row.rank === 1}
              revealed={
                (row.rank === 3 && step >= 1) ||
                (row.rank === 2 && step >= 2) ||
                (row.rank === 1 && step >= 3)
              }
            />
          ))}
        </div>

        {step >= 4 && me && (
          <div className={cn(ui.panel, "w-full p-4")}>
            <p className="text-sm font-bold text-app-muted">
              {me.rank === 1 ? (
                "¡Sos el campeón! 🏆"
              ) : (
                <>
                  Terminaste <strong className="font-black text-app-text">#{me.rank}</strong> de {rows.length}
                </>
              )}
            </p>
          </div>
        )}

        {step >= 4 && <Button onClick={onClose}>Ver tabla</Button>}
      </div>
    </div>
  );
}

function CelebrationPodiumSpot({
  row,
  isChampion,
  revealed,
}: {
  row: LeaderboardRow;
  isChampion: boolean;
  revealed: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl border border-app-line bg-app-surface px-2 py-3 transition-all duration-500",
        isChampion && "border-app-amber/60 bg-app-amber/10 py-5 shadow-app-card",
        revealed ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
      )}
    >
      {isChampion && <Trophy className="size-6 text-app-amber" aria-hidden="true" />}
      <span
        className={cn(
          "grid place-items-center rounded-full font-black",
          isChampion ? "size-12 bg-app-amber text-app-bg" : "size-10 bg-app-muted text-app-bg",
        )}
      >
        {getInitials(row.user.displayName)}
      </span>
      <strong className="max-w-full truncate text-sm font-black">{row.user.displayName}</strong>
      <CountUp
        value={row.points}
        run={revealed && isChampion}
        className="text-lg font-black text-app-green"
      />
    </div>
  );
}

function CountUp({ value, run, className }: { value: number; run: boolean; className?: string }) {
  const [display, setDisplay] = useState(run ? 0 : value);
  useEffect(() => {
    if (!run || prefersReducedMotion()) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const duration = 800;
    const tick = (t: number) => {
      const progress = Math.min(1, (t - start) / duration);
      setDisplay(Math.round(value * progress));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, value]);
  return <em className={cn("not-italic", className)}>{display}</em>;
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/winner-celebration-overlay.tsx
git commit -m "feat(celebration): winner reveal overlay component"
```

---

### Task 4: Wire the overlay into app-shell + context

**Files:**
- Modify: `src/components/app-context.tsx` (add `openWinnerCelebration` to `AppContextValue`)
- Modify: `src/components/app-shell.tsx`

**Interfaces:**
- Consumes: `isTournamentComplete` (Task 1), `WinnerCelebrationOverlay` (Task 3), existing `getLeaderboard` and `standingsStages`/`matches`.
- Produces: `openWinnerCelebration: () => void` on the app context (consumed by Task 5).

- [ ] **Step 1: Add the context method to the type**

In `src/components/app-context.tsx`, add to the `AppContextValue` type (next to `openPredictionDrawer`):

```ts
  openWinnerCelebration: () => void;
```

- [ ] **Step 2: Compute completion + wire the overlay in app-shell**

In `src/components/app-shell.tsx`:

Add imports near the other `@/lib` and component imports:

```ts
import { isTournamentComplete } from "@/lib/tournament";
import { WinnerCelebrationOverlay } from "@/components/winner-celebration-overlay";
```

Add a module-level constant near `PUBLIC_AUTH_ROUTES`:

```ts
const CELEBRATION_KEY = "prode:winner-celebrated:v1";
```

The overall leaderboard is already computed for `me` (line ~150-156). Refactor so both `me` and the overlay reuse one array. Replace the `me` useMemo with:

```ts
  const overallLeaderboard = useMemo(
    () => getLeaderboard({ predictions, profiles, groupPredictions, matches, groups, standingsStages }),
    [predictions, profiles, groupPredictions, matches, groups, standingsStages],
  );
  const me = useMemo(
    () => overallLeaderboard.find((row) => row.user.id === currentUser?.id),
    [overallLeaderboard, currentUser],
  );

  const tournamentComplete = useMemo(
    () => isTournamentComplete(matches, standingsStages, now),
    [matches, standingsStages, now],
  );
  const [celebrationOpen, setCelebrationOpen] = useState(false);

  // Auto-play the celebration once per device once the tournament is complete.
  useEffect(() => {
    if (!tournamentComplete) return;
    try {
      if (window.localStorage.getItem(CELEBRATION_KEY) !== "1") setCelebrationOpen(true);
    } catch {
      // localStorage unavailable — skip the auto-play.
    }
  }, [tournamentComplete]);

  const openWinnerCelebration = useCallback(() => setCelebrationOpen(true), []);
  const closeCelebration = useCallback(() => {
    setCelebrationOpen(false);
    try {
      window.localStorage.setItem(CELEBRATION_KEY, "1");
    } catch {
      // ignore write failures
    }
    router.push(tabRoutes.leaderboard);
  }, [router]);
```

- [ ] **Step 3: Add `openWinnerCelebration` to the context value**

In the `contextValue` object (next to `openPredictionDrawer: setDrawerMatch,`):

```ts
    openWinnerCelebration,
```

- [ ] **Step 4: Mount the overlay**

In the returned JSX, next to `<NovedadesModal />`:

```tsx
        <WinnerCelebrationOverlay
          open={celebrationOpen}
          onClose={closeCelebration}
          rows={overallLeaderboard}
          currentUserId={currentUser.id}
        />
```

- [ ] **Step 5: Verify typecheck + existing tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS — no type errors, existing suites still green.

- [ ] **Step 6: Commit**

```bash
git add src/components/app-context.tsx src/components/app-shell.tsx
git commit -m "feat(celebration): auto-play winner reveal once per device"
```

---

### Task 5: Tabla champion crown + replay button

**Files:**
- Modify: `src/screens/leaderboard.tsx`

**Interfaces:**
- Consumes: `isTournamentComplete` (Task 1), `openWinnerCelebration` + `matches` + `standingsStages` + `now` from `useApp()`.

- [ ] **Step 1: Compute completion and pass champion state into the podium**

In `src/screens/leaderboard.tsx`:

Add imports:
```ts
import { Crown } from "lucide-react";
import { isTournamentComplete } from "@/lib/tournament";
```

Pull the extra context values in the existing `useApp()` destructure:
```ts
  const { predictions, profiles, groupPredictions, matches, groups, standingsStages, currentUser, now, openWinnerCelebration } = useApp();
```

After `rows` is computed, add:
```ts
  const tournamentComplete = isTournamentComplete(matches, standingsStages, now);
  const showChampion = tournamentComplete && view === "overall";
```

Pass it to the podium: change `<Podium rows={podium} currentUserId={currentUser.id} />` to include `showChampion={showChampion}`, and thread the prop through `Podium` → `PodiumSpot`:

```tsx
function Podium({ rows, currentUserId, showChampion }: { rows: LeaderboardRow[]; currentUserId: string; showChampion: boolean }) {
  const ordered = podiumOrder(rows);
  return (
    <div className="mt-4 grid grid-cols-3 items-end gap-2 sm:gap-3">
      {ordered.map((row) => (
        <PodiumSpot key={row.user.id} row={row} isMe={row.user.id === currentUserId} isChampion={showChampion && row.rank === 1} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add the crown treatment to `PodiumSpot`**

Update `PodiumSpot` to accept `isChampion` and layer on the crown + `Campeón` pill (keeps the existing medal/styling untouched otherwise):

```tsx
function PodiumSpot({ row, isMe, isChampion }: { row: LeaderboardRow; isMe: boolean; isChampion?: boolean }) {
  return (
    <div
      className={cn(
        "grid justify-items-center gap-1 rounded-xl border border-app-line bg-app-surface px-2 py-3 text-center",
        row.rank === 1 && "border-app-amber/50 bg-app-amber/5 pt-5",
        row.rank === 2 && "pt-4",
        isChampion && "border-app-amber shadow-app-card ring-2 ring-app-amber/40",
        isMe && "ring-2 ring-app-brand",
      )}
    >
      {isChampion && <Crown className="size-5 text-app-amber" aria-hidden="true" />}
      <span className="text-xl leading-none">{medalByRank[row.rank] ?? "•"}</span>
      <span className={cn("grid size-9 place-items-center rounded-full text-sm font-black", avatarToneByRank[row.rank] ?? "bg-app-muted text-app-bg")}>
        {getInitials(row.user.displayName)}
      </span>
      <strong className="mt-1 max-w-full truncate text-sm font-black">{row.user.displayName}</strong>
      {isChampion && (
        <span className="rounded-full bg-app-amber px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-app-bg">
          Campeón
        </span>
      )}
      <em className="text-lg font-black not-italic text-app-green">{row.points}</em>
      <small className="text-xs font-bold text-app-muted">
        {row.exactHits} ex · {row.outcomeHits} ac
      </small>
    </div>
  );
}
```

- [ ] **Step 3: Add the replay button**

In the top control row (the `div` with `StageTabs` + legend + preview toggle, around line 71-107), add a replay button that only shows when the tournament is complete. Place it just before `<StandingsLegend />`:

```tsx
        {tournamentComplete && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={openWinnerCelebration}
          >
            Ver celebración
          </Button>
        )}
```

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/leaderboard.tsx
git commit -m "feat(tabla): champion crown and replay button when complete"
```

---

### Task 6: Novedades entry

**Files:**
- Modify: `src/components/novedades-modal.tsx`

- [ ] **Step 1: Add the entry and bump the version**

In `src/components/novedades-modal.tsx`:

Bump the version so it re-shows:
```ts
const NOVEDADES_VERSION = "2026-07-winner-celebration";
```

Add `Trophy` to the lucide import, then prepend to the `novedades` array:
```ts
  {
    icon: Trophy,
    title: "Festejo del campeón",
    body: "Cuando termine la final, el prode te muestra un festejo con el podio y corona al campeón. Después lo podés volver a ver desde la Tabla con el botón «Ver celebración».",
  },
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/novedades-modal.tsx
git commit -m "feat(novedades): announce winner celebration"
```

---

## Verification (end-to-end)

Automated:
- `npx vitest run` — all suites green, including the new `isTournamentComplete` cases.
- `npx tsc --noEmit` — clean.

Manual (run the app with `npm run dev`, using seed data so no Supabase is needed):
1. **Not complete yet:** with the final unfinalized, the tabla shows the normal podium — no crown, no "Ver celebración" button, and no auto overlay on load. (Seed data may already be complete; if so, temporarily flip the final match's `status`/`finalizedAt` in `src/lib/seed.ts` to confirm the gate, then revert.)
2. **Completion:** with all final + third matches finalized and finals standings revealed, reload the app on any page → the full-screen overlay auto-plays: eyebrow → 🥉 → 🥈 → 🏆 champion with count-up + confetti → "Terminaste #N de M" (or "¡Sos el campeón!") → "Ver tabla" button. Clicking it closes the overlay and lands on `/tabla`.
3. **Once per device:** reload again → overlay does NOT auto-play (localStorage `prode:winner-celebrated:v1` is set).
4. **Replay:** on `/tabla` (Acumulado view), the #1 spot shows a 👑 crown + "Campeón" pill; click "Ver celebración" → overlay replays.
5. **Reduced motion:** enable OS "reduce motion" → overlay shows the full podium + rank immediately with no confetti and no stagger.
6. **Stage views:** switch the tabla to a stage tab (e.g. Grupos) → no crown (champion styling is overall-view only).

## Self-review notes

- Spec coverage: completion detection (Task 1), confetti (Task 2), overlay reveal incl. reduced-motion/Esc/dialog (Task 3), app-load auto-trigger + localStorage + context method (Task 4), champion crown + replay (Task 5), Novedades (Task 6). All spec sections mapped.
- `openWinnerCelebration` name is consistent across app-context.tsx, app-shell.tsx, and leaderboard.tsx.
- Overlay prop shape (`open`, `onClose`, `rows`, `currentUserId`) is identical where produced (Task 3) and consumed (Task 4).
