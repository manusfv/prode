# Standings Refresh + Mobile Stats Pill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the standings table prettier (podium for top 3 + refined responsive table) and surface a participant's rank + points without scrolling on mobile.

**Architecture:** Two pure helpers (`getInitials`, `podiumOrder`) go in a new `src/lib/standings.ts` with vitest tests. `leaderboard.tsx` is rebuilt into `LeaderboardScreen` → `Podium`/`PodiumSpot` + `StandingsTable`. `app-shell.tsx` gains a rank+points pill in the sticky mobile header (links to `/tabla`), and `predictions.tsx` hides its right aside on mobile.

**Tech Stack:** Next.js (App Router) + React, Tailwind v4 with `app-*` design tokens, shadcn-style `ui/*` components, vitest (node env, `src/**/*.test.ts` only — pure logic is TDD'd; components are verified via lint/build + manual responsive check).

---

## File Structure

- **Create** `src/lib/standings.ts` — pure helpers: `getInitials(name)`, `podiumOrder(rows)`.
- **Create** `src/lib/standings.test.ts` — vitest tests for the helpers.
- **Modify** `src/screens/leaderboard.tsx` — rebuild into `LeaderboardScreen` + `Podium` + `PodiumSpot` + `StandingsTable`.
- **Modify** `src/components/app-shell.tsx` — compute `me` from leaderboard; render mobile header stats pill.
- **Modify** `src/screens/predictions.tsx` — hide the right `<aside>` below `lg`.

No new types, server actions, or scoring changes. `getLeaderboard` / `LeaderboardRow` from `@/lib/ui-tokens` are reused as-is.

---

## Task 1: Pure standings helpers (TDD)

**Files:**
- Create: `src/lib/standings.ts`
- Test: `src/lib/standings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/standings.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { getInitials, podiumOrder } from "./standings";

describe("getInitials", () => {
  it("uppercases the first letter of a single-word name", () => {
    expect(getInitials("marcos")).toBe("M");
  });

  it("uses the first letters of the first two words", () => {
    expect(getInitials("Lucía Pérez")).toBe("LP");
  });

  it("ignores words beyond the first two", () => {
    expect(getInitials("Ana María López")).toBe("AM");
  });

  it("collapses and trims surrounding whitespace", () => {
    expect(getInitials("  diego   gómez  ")).toBe("DG");
  });

  it("falls back to '?' for an empty or blank name", () => {
    expect(getInitials("")).toBe("?");
    expect(getInitials("   ")).toBe("?");
  });
});

describe("podiumOrder", () => {
  it("reorders three rows to second, first, third (raised center)", () => {
    expect(podiumOrder(["first", "second", "third"])).toEqual(["second", "first", "third"]);
  });

  it("returns two rows unchanged", () => {
    expect(podiumOrder(["first", "second"])).toEqual(["first", "second"]);
  });

  it("returns one row unchanged", () => {
    expect(podiumOrder(["first"])).toEqual(["first"]);
  });

  it("returns an empty array unchanged", () => {
    expect(podiumOrder([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- standings`
Expected: FAIL — `Failed to resolve import "./standings"` / module not found.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/standings.ts`:

```ts
/** Up to two initials from a display name, uppercased. Falls back to "?" when blank. */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

/**
 * Visual left-to-right order for a podium: second, first, third (so first place
 * sits in the raised center). Arrays with fewer than three entries are unchanged.
 */
export function podiumOrder<T>(rows: T[]): T[] {
  if (rows.length === 3) return [rows[1]!, rows[0]!, rows[2]!];
  return rows;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- standings`
Expected: PASS — 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/standings.ts src/lib/standings.test.ts
git commit -m "feat(standings): add initials and podium-order helpers"
```

---

## Task 2: Rebuild the standings screen (podium + refined table)

**Files:**
- Modify: `src/screens/leaderboard.tsx` (full rewrite of the component body)

UI verification only (no `.tsx` tests run in this project). The stage filter block (Tabs at `sm`+, Select below) is kept **exactly as today** — it stays decorative per the spec.

- [ ] **Step 1: Replace the file contents**

Overwrite `src/screens/leaderboard.tsx` with:

```tsx
"use client";

import { useMemo } from "react";

import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { stageLabels, stageOrder } from "@/lib/tournament";
import { getLeaderboard, type LeaderboardRow, ui } from "@/lib/ui-tokens";
import { getInitials, podiumOrder } from "@/lib/standings";
import { cn } from "@/lib/utils";

import { useApp } from "@/components/app-context";

export function LeaderboardScreen() {
  const { predictions, profiles, currentUser } = useApp();
  const rows = useMemo(() => getLeaderboard(predictions, profiles), [predictions, profiles]);
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <Card className={cn(ui.panel, "p-4")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-lg font-black">Tabla general</h2>
        <Select defaultValue={stageOrder[0]}>
          <SelectTrigger className={cn(ui.control, "w-full sm:hidden")} aria-label="Etapa">
            <span className={ui.label}>Etapa</span>
            <SelectValue className={ui.controlValue}>{stageLabels[stageOrder[0]]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {stageOrder.map((stage) => (
              <SelectItem key={stage} value={stage}>
                {stageLabels[stage]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Tabs className="hidden min-w-0 sm:block">
          <TabsList className="flex !h-auto w-full min-w-0 max-w-full flex-wrap gap-1.5 rounded-xl border border-app-line bg-app-panel p-1.5">
            {stageOrder.map((stage) => (
              <TabsTrigger
                key={stage}
                value={stage}
                className="!h-9 shrink-0 rounded-md px-2 text-xs font-extrabold text-app-muted hover:text-app-text data-active:bg-app-brand data-active:text-app-brand-fg data-active:shadow-sm sm:px-4 sm:text-sm"
              >
                {stageLabels[stage]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {podium.length > 0 && <Podium rows={podium} currentUserId={currentUser.id} />}
      {rest.length > 0 && <StandingsTable rows={rest} currentUserId={currentUser.id} />}
      {rows.length === 0 && (
        <p className="mt-4 rounded-lg border border-app-line bg-app-surface px-3 py-6 text-center text-sm font-bold text-app-muted">
          Todavía no hay participantes en la tabla.
        </p>
      )}
    </Card>
  );
}

const medalByRank: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
const avatarToneByRank: Record<number, string> = {
  1: "bg-app-amber text-app-bg",
  2: "bg-app-muted text-app-bg",
  3: "bg-app-amber/60 text-app-bg",
};

function Podium({ rows, currentUserId }: { rows: LeaderboardRow[]; currentUserId: string }) {
  const ordered = podiumOrder(rows);
  return (
    <div className="mt-4 grid grid-cols-3 items-end gap-2 sm:gap-3">
      {ordered.map((row) => (
        <PodiumSpot key={row.user.id} row={row} isMe={row.user.id === currentUserId} />
      ))}
    </div>
  );
}

function PodiumSpot({ row, isMe }: { row: LeaderboardRow; isMe: boolean }) {
  return (
    <div
      className={cn(
        "grid justify-items-center gap-1 rounded-xl border border-app-line bg-app-surface px-2 py-3 text-center",
        row.rank === 1 && "border-app-amber/50 bg-app-amber/5 pt-5",
        row.rank === 2 && "pt-4",
        isMe && "ring-2 ring-app-brand",
      )}
    >
      <span className="text-xl leading-none">{medalByRank[row.rank]}</span>
      <span className={cn("grid size-9 place-items-center rounded-full text-sm font-black", avatarToneByRank[row.rank])}>
        {getInitials(row.user.displayName)}
      </span>
      <strong className="mt-1 max-w-full truncate text-sm font-black">{row.user.displayName}</strong>
      <em className="text-lg font-black not-italic text-app-green">{row.points}</em>
      <small className="text-xs font-bold text-app-muted">
        {row.exactHits} ex · {row.outcomeHits} ac
      </small>
    </div>
  );
}

function StandingsTable({ rows, currentUserId }: { rows: LeaderboardRow[]; currentUserId: string }) {
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-app-line bg-app-surface">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Participante</TableHead>
            <TableHead className="text-right">Puntos</TableHead>
            <TableHead className="text-right max-sm:hidden">Exactos</TableHead>
            <TableHead className="text-right max-sm:hidden">Aciertos</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const isMe = row.user.id === currentUserId;
            return (
              <TableRow key={row.user.id} className={cn(isMe && "bg-app-surface-2")}>
                <TableCell
                  className={cn(
                    "font-black text-app-muted",
                    isMe && "shadow-[inset_3px_0_0_var(--color-app-brand)]",
                  )}
                >
                  {row.rank}
                </TableCell>
                <TableCell>
                  <strong className="font-black">{row.user.displayName}</strong>
                  <span className="block text-xs font-bold text-app-muted sm:hidden">
                    {row.exactHits} ex · {row.outcomeHits} ac
                  </span>
                </TableCell>
                <TableCell className="text-right text-base font-black text-app-green">{row.points}</TableCell>
                <TableCell className="text-right max-sm:hidden">{row.exactHits}</TableCell>
                <TableCell className="text-right max-sm:hidden">{row.outcomeHits}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Lint and build**

Run: `npm run lint && npm run build`
Expected: PASS — no type or lint errors (notably `currentUser` exists on `useApp()` and `--app-brand` is a defined CSS variable).

- [ ] **Step 3: Manual responsive check**

Run: `npm run dev`, open `/tabla`. Verify:
- Desktop (≥ `lg`): podium shows 2nd · 1st · 3rd with 1st raised/gold; table below for rank 4+; your row tinted with a blue left edge.
- Phone width: podium stays 3-up; table shows only `# · Participante · Puntos`, with `ex · ac` as a subtitle under each name; no horizontal scroll.
- If you are in the top 3, your **podium card** has the ring (no separate row).

- [ ] **Step 4: Commit**

```bash
git add src/screens/leaderboard.tsx
git commit -m "feat(standings): podium top 3 + refined responsive table"
```

---

## Task 3: Mobile header stats pill + hide aside on mobile

**Files:**
- Modify: `src/components/app-shell.tsx`
- Modify: `src/screens/predictions.tsx`

- [ ] **Step 1: Import `getLeaderboard` in app-shell**

In `src/components/app-shell.tsx`, update the `ui-tokens` import (currently `import { pageTitles, tabRoutes, ui, type AppRoute } from "@/lib/ui-tokens";`) to:

```tsx
import { getLeaderboard, pageTitles, tabRoutes, ui, type AppRoute } from "@/lib/ui-tokens";
```

- [ ] **Step 2: Compute the current user's standing**

In `AppShell`, just after the `openStages` `useMemo` (around line 95), add:

```tsx
  const me = useMemo(
    () => getLeaderboard(predictions, profiles).find((row) => row.user.id === currentUser?.id),
    [predictions, profiles, currentUser],
  );
```

(This `useMemo` sits with the other hooks, before any early `return`, so hook order stays stable. `currentUser` may be null here; `find` simply returns `undefined`.)

- [ ] **Step 3: Render the pill in the sticky mobile header**

In the mobile header `<div>` (the `sticky top-0 … lg:hidden` block, ~line 436), the current children are the menu Button, the `brand-mark` span, and `<strong>Prode Carbia</strong>`. Add the pill as the last child:

```tsx
            <strong className="text-base leading-none">Prode Carbia</strong>
            {me && (
              <button
                type="button"
                onClick={() => router.push(tabRoutes.leaderboard)}
                aria-label={`Tu posición: puesto ${me.rank}, ${me.points} puntos`}
                className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-app-line bg-app-surface px-3 py-1.5 text-xs font-black"
              >
                <span className="text-app-muted">#{me.rank}</span>
                <span className="text-app-green">{me.points} pts</span>
              </button>
            )}
```

(`router` is already in scope from `useRouter()` at the top of `AppShell`. `ml-auto` pushes the pill to the right edge.)

- [ ] **Step 4: Hide the Pronósticos aside on mobile**

In `src/screens/predictions.tsx`, the right column is `<aside className="sticky top-5 grid gap-2.5 max-lg:static">`. Change `max-lg:static` to `max-lg:hidden`:

```tsx
      <aside className="sticky top-5 grid gap-2.5 max-lg:hidden">
```

(The `SummaryPanel` + `LeaderboardPreview` now render on desktop only. Pending count stays visible on mobile via the existing "Faltan (N)" button in the main column.)

- [ ] **Step 5: Lint and build**

Run: `npm run lint && npm run build`
Expected: PASS — no type or lint errors.

- [ ] **Step 6: Manual responsive check**

Run: `npm run dev`. Verify:
- Phone width on `/pronosticos`: the right aside (Puntos/Puesto/Pendientes + "Tabla familiar") is gone; the header shows `#rank · N pts`; tapping it navigates to `/tabla`.
- Desktop (≥ `lg`): aside unchanged; mobile header (and pill) not shown.

- [ ] **Step 7: Commit**

```bash
git add src/components/app-shell.tsx src/screens/predictions.tsx
git commit -m "feat(nav): mobile header stats pill; hide pronosticos aside on mobile"
```

---

## Final verification

- [ ] Run `npm run test` — all vitest suites pass (including new `standings` tests).
- [ ] Run `npm run lint && npm run build` — clean.
- [ ] Manual pass of edge cases at desktop + phone widths:
  - 1, 2, and 3 approved participants (podium renders only existing spots; table empty when ≤ 3).
  - Current user in top 3 (ring on podium) vs. rank 4+ (tinted table row).
  - Empty leaderboard shows the "Todavía no hay participantes" message and no pill.
```
