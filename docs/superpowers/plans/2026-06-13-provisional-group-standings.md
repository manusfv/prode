# Provisional Group Standings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin enter a group's current 1°→4° order as a *provisional* result so group-position predictions are scored against it (re-scorable, clearly not-final), feeding both the leaderboard total and the per-group breakdown.

**Architecture:** A group's `first..fourth` slots hold the current order; `result_finalized_at` means only "locked as final." Group predictions score whenever the order is complete (provisional or final). A pure helper `scoreGroupPredictionOrNull` centralizes the "score-or-null" decision used by both the Supabase recalc and the local in-memory path. No DB migration — existing columns are reused.

**Tech Stack:** Next.js 15 / React 19, TypeScript, Supabase, Vitest, Tailwind v4. App language is Spanish (rioplatense).

**Spec:** `docs/superpowers/specs/2026-06-13-provisional-group-standings-design.md`

---

## File Structure

- `src/lib/tournament.ts` — add `hasGroupOrder(group)` and `isGroupProvisional(group)` helpers (pure, label/gate logic).
- `src/lib/scoring.ts` — add `scoreGroupPredictionOrNull(group, prediction)` wrapping `scoreGroupPrediction` with the order-complete gate.
- `src/lib/tournament.test.ts` — tests for the two helpers (create if missing).
- `src/lib/scoring.test.ts` — tests for `scoreGroupPredictionOrNull`.
- `src/app/actions.ts` — rename `finalizeGroupResultAction` → `saveGroupStandingsAction` with a `finalize` flag; use `scoreGroupPredictionOrNull` in `recalculateGroupPredictionsForGroups`.
- `src/components/app-context.tsx` — rename the input-type alias and context method.
- `src/components/app-shell.tsx` — rename/adjust the wiring to honor `finalize` in both Supabase and local paths.
- `src/screens/admin.tsx` — group card: split into "Guardar provisional" / "Finalizar grupo"; show `Provisional` status; pass `finalize`.
- `src/screens/leaderboard.tsx` — provisional note when a contributing group is provisional.
- `src/screens/results.tsx` — `GroupResultCard` reveals provisional order + provisional points + per-slot ✓/✗ for the current user.

---

## Task 1: `hasGroupOrder` + `isGroupProvisional` helpers

**Files:**
- Modify: `src/lib/tournament.ts` (append after `getGroupStatus`, ~line 46)
- Test: `src/lib/tournament.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/tournament.test.ts` (create the file if it does not exist, with the imports shown):

```ts
import { describe, expect, it } from "vitest";

import { hasGroupOrder, isGroupProvisional } from "./tournament";
import type { Group } from "./types";

function group(overrides: Partial<Group> = {}): Group {
  return {
    groupLabel: "A",
    locksAt: null,
    firstTeamId: null,
    secondTeamId: null,
    thirdTeamId: null,
    fourthTeamId: null,
    resultFinalizedAt: null,
    resultFinalizedBy: null,
    ...overrides,
  };
}

describe("hasGroupOrder", () => {
  it("is false when any slot is null", () => {
    expect(hasGroupOrder(group({ firstTeamId: "t1", secondTeamId: "t2", thirdTeamId: "t3" }))).toBe(false);
  });

  it("is true when all four slots are set", () => {
    expect(
      hasGroupOrder(group({ firstTeamId: "t1", secondTeamId: "t2", thirdTeamId: "t3", fourthTeamId: "t4" })),
    ).toBe(true);
  });
});

describe("isGroupProvisional", () => {
  const full = { firstTeamId: "t1", secondTeamId: "t2", thirdTeamId: "t3", fourthTeamId: "t4" };

  it("is false when the order is incomplete", () => {
    expect(isGroupProvisional(group({ firstTeamId: "t1" }))).toBe(false);
  });

  it("is true when complete and not finalized", () => {
    expect(isGroupProvisional(group(full))).toBe(true);
  });

  it("is false when finalized", () => {
    expect(isGroupProvisional(group({ ...full, resultFinalizedAt: "2026-06-13T00:00:00Z" }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tournament.test.ts`
Expected: FAIL — `hasGroupOrder`/`isGroupProvisional` are not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/tournament.ts` (after `getGroupStatus`):

```ts
export function hasGroupOrder(group: Group): boolean {
  return [group.firstTeamId, group.secondTeamId, group.thirdTeamId, group.fourthTeamId].every(Boolean);
}

export function isGroupProvisional(group: Group): boolean {
  return hasGroupOrder(group) && !group.resultFinalizedAt;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tournament.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament.ts src/lib/tournament.test.ts
git commit -m "feat(groups): hasGroupOrder + isGroupProvisional helpers"
```

---

## Task 2: `scoreGroupPredictionOrNull` gate

**Files:**
- Modify: `src/lib/scoring.ts` (after `scoreGroupPrediction`, ~line 59)
- Test: `src/lib/scoring.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/scoring.test.ts` (reuse the file's existing imports; add `scoreGroupPredictionOrNull` to the `./scoring` import and `Group`/`GroupPrediction` to the type import if not present):

```ts
describe("scoreGroupPredictionOrNull", () => {
  const order = { firstTeamId: "t1", secondTeamId: "t2", thirdTeamId: "t3", fourthTeamId: "t4" };
  const baseGroup = {
    groupLabel: "A",
    locksAt: null,
    resultFinalizedAt: null,
    resultFinalizedBy: null,
  } as const;
  const prediction = {
    id: "gp1",
    userId: "u1",
    groupLabel: "A",
    firstTeamId: "t1",
    secondTeamId: "t2",
    thirdTeamId: "t3",
    fourthTeamId: "t4",
    points: null,
    exactPositions: 0,
    createdAt: "2026-06-13T00:00:00Z",
    updatedAt: "2026-06-13T00:00:00Z",
  };

  it("returns null points when the group order is incomplete", () => {
    const result = scoreGroupPredictionOrNull(
      { ...baseGroup, ...order, fourthTeamId: null },
      prediction,
    );
    expect(result).toEqual({ points: null, exactPositions: 0 });
  });

  it("scores against a complete provisional order (no resultFinalizedAt)", () => {
    const result = scoreGroupPredictionOrNull({ ...baseGroup, ...order }, prediction);
    expect(result).toEqual({ points: 28, exactPositions: 4 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/scoring.test.ts`
Expected: FAIL — `scoreGroupPredictionOrNull` not exported.

- [ ] **Step 3: Write the implementation**

In `src/lib/scoring.ts`, add `hasGroupOrder` to the existing import from `./tournament`:

```ts
import { getGroupStatus, getMatchStatus, hasGroupOrder, inferWinner, needsAdvancer } from "./tournament";
```

Then append after `scoreGroupPrediction`:

```ts
/**
 * Scores a group-position prediction against the group's current order, whether
 * that order is provisional or finalized. Returns null points when the order is
 * incomplete (mirrors how the leaderboard treats unscored predictions).
 */
export function scoreGroupPredictionOrNull(
  group: Group,
  prediction: GroupPrediction,
): { points: number | null; exactPositions: number } {
  if (!hasGroupOrder(group)) return { points: null, exactPositions: 0 };
  return scoreGroupPrediction(group, prediction);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/scoring.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scoring.ts src/lib/scoring.test.ts
git commit -m "feat(groups): scoreGroupPredictionOrNull gate for provisional orders"
```

---

## Task 3: Score provisional orders in the Supabase recalc

**Files:**
- Modify: `src/app/actions.ts` — `recalculateGroupPredictionsForGroups` (~lines 605-624) and its import block (~line 6-11).

- [ ] **Step 1: Update the import**

In `src/app/actions.ts`, change the `@/lib/scoring` import to include `scoreGroupPredictionOrNull` and drop `scoreGroupPrediction` if no longer used directly there:

```ts
import {
  canSaveGroupPrediction,
  canSavePrediction,
  scoreGroupPredictionOrNull,
  scorePrediction,
} from "@/lib/scoring";
```

- [ ] **Step 2: Replace the scoring gate**

In `recalculateGroupPredictionsForGroups`, replace:

```ts
      const score = group.resultFinalizedAt
        ? scoreGroupPrediction(group, prediction)
        : { points: null, exactPositions: 0 };
```

with:

```ts
      const score = scoreGroupPredictionOrNull(group, prediction);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no unused-import or missing-symbol errors).

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions.ts
git commit -m "feat(groups): score provisional group orders in recalc"
```

---

## Task 4: `saveGroupStandingsAction` with a `finalize` flag

**Files:**
- Modify: `src/app/actions.ts` — `FinalizeGroupResultInput` type (~lines 67-73) and `finalizeGroupResultAction` (~lines 209-246).

- [ ] **Step 1: Update the input type**

Replace the `FinalizeGroupResultInput` type with:

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

- [ ] **Step 2: Rename the action and honor `finalize`**

Replace the `finalizeGroupResultAction` signature and the groups update block so `result_finalized_at`/`result_finalized_by` are only set when `input.finalize` is true:

```ts
export async function saveGroupStandingsAction(input: SaveGroupStandingsInput) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Supabase no está configurado." };

  const admin = await requireAdmin(supabase);
  if (!admin.ok) return admin;

  const order = [input.firstTeamId, input.secondTeamId, input.thirdTeamId, input.fourthTeamId];
  if (order.some((teamId) => !teamId)) {
    return { ok: false, message: "Ordená los cuatro equipos." };
  }
  if (new Set(order).size !== 4) {
    return { ok: false, message: "No repitas equipos." };
  }

  const now = new Date().toISOString();
  const { data: groupRow, error: updateError } = await supabase
    .from("groups")
    .update({
      first_team_id: input.firstTeamId,
      second_team_id: input.secondTeamId,
      third_team_id: input.thirdTeamId,
      fourth_team_id: input.fourthTeamId,
      result_finalized_at: input.finalize ? now : null,
      result_finalized_by: input.finalize ? admin.userId : null,
      updated_at: now,
    })
    .eq("group_label", input.groupLabel)
    .select("*")
    .single();

  if (updateError) return { ok: false, message: updateError.message };

  const recalculation = await recalculateGroupPredictionsForGroups(supabase, [mapGroup(groupRow)]);
  if (!recalculation.ok) return recalculation;

  revalidatePath("/");
  return {
    ok: true,
    message: input.finalize ? "Resultado del grupo finalizado." : "Posiciones provisionales guardadas.",
  };
}
```

- [ ] **Step 3: Typecheck (expect downstream errors to fix next)**

Run: `npx tsc --noEmit`
Expected: FAIL only in `app-context.tsx` / `app-shell.tsx` / `admin.tsx` referencing the old `finalizeGroupResultAction` / `FinalizeGroupResultInput`. These are fixed in Tasks 5–7. (No errors should remain inside `actions.ts` itself.)

- [ ] **Step 4: Commit**

```bash
git add src/app/actions.ts
git commit -m "feat(groups): saveGroupStandingsAction with finalize flag"
```

---

## Task 5: Update the app context type + method name

**Files:**
- Modify: `src/components/app-context.tsx:4`, `:18`, `:43`

- [ ] **Step 1: Update the import (line 4)**

```ts
import type { createMatchAction, saveGroupStandingsAction } from "@/app/actions";
```

- [ ] **Step 2: Update the type alias (line 18)**

```ts
export type SaveGroupStandingsInput = Parameters<typeof saveGroupStandingsAction>[0];
```

- [ ] **Step 3: Update the context interface field (line 43)**

```ts
  saveGroupStandings: (input: SaveGroupStandingsInput) => Promise<void> | void;
```

- [ ] **Step 4: Commit**

```bash
git add src/components/app-context.tsx
git commit -m "refactor(groups): rename context method to saveGroupStandings"
```

---

## Task 6: Wire `saveGroupStandings` in app-shell (Supabase + local)

**Files:**
- Modify: `src/components/app-shell.tsx:30` (import), `:78` (type import), `:465-496` (function), and the provider value where `finalizeGroupResult` is passed into the context.

- [ ] **Step 1: Update imports**

Line ~30 — import the renamed action:

```ts
  saveGroupStandingsAction,
```

Line ~78 — import the renamed type:

```ts
  type SaveGroupStandingsInput,
```

- [ ] **Step 2: Rewrite the function (lines ~465-496)**

Replace `finalizeGroupResult` with `saveGroupStandings`, honoring `input.finalize` in both paths:

```ts
  async function saveGroupStandings(input: SaveGroupStandingsInput) {
    if (supabaseEnabled) {
      const result = await saveGroupStandingsAction(input);
      setDataMessage(result.message);
      if (result.ok) await refreshSupabaseData();
      return;
    }

    if (!currentUser) return;

    const saved: Group = {
      groupLabel: input.groupLabel,
      locksAt: groups.find((group) => group.groupLabel === input.groupLabel)?.locksAt ?? null,
      firstTeamId: input.firstTeamId,
      secondTeamId: input.secondTeamId,
      thirdTeamId: input.thirdTeamId,
      fourthTeamId: input.fourthTeamId,
      resultFinalizedAt: input.finalize ? new Date().toISOString() : null,
      resultFinalizedBy: input.finalize ? currentUser.id : null,
    };

    setGroups((items) =>
      items.map((group) => (group.groupLabel === input.groupLabel ? saved : group)),
    );
    setGroupPredictions((items) =>
      items.map((prediction) => {
        if (prediction.groupLabel !== input.groupLabel) return prediction;
        const score = scoreGroupPredictionOrNull(saved, prediction);
        return { ...prediction, points: score.points, exactPositions: score.exactPositions };
      }),
    );
  }
```

- [ ] **Step 3: Update the scoring import in app-shell**

Ensure app-shell imports `scoreGroupPredictionOrNull` (replace any `scoreGroupPrediction` import that is now unused):

```ts
import { scoreGroupPredictionOrNull } from "@/lib/scoring";
```

(If `scoreGroupPrediction` is still used elsewhere in the file, keep both.)

- [ ] **Step 4: Update the provider value**

Wherever the context value object lists `finalizeGroupResult,`, rename it to `saveGroupStandings,`.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: FAIL only in `admin.tsx` (next task). No errors in `app-shell.tsx`.

- [ ] **Step 6: Commit**

```bash
git add src/components/app-shell.tsx
git commit -m "feat(groups): wire saveGroupStandings (provisional + final) in app-shell"
```

---

## Task 7: Admin group card — provisional vs finalize buttons

**Files:**
- Modify: `src/screens/admin.tsx` — destructure (~line 92), call site (~lines 287-297), `GroupAdminCard` props (~lines 477-489), status line (~line 510), and the footer button (~lines 577-584).

- [ ] **Step 1: Rename the context destructure (~line 92)**

```ts
  saveGroupStandings,
```

- [ ] **Step 2: Replace the `onFinalize` prop with `onSaveStandings` at the call site (~lines 287-297)**

```tsx
                onSaveStandings={(order, finalize) =>
                  runAdminAction(
                    finalize
                      ? `finalize-group-${group.groupLabel}`
                      : `provisional-group-${group.groupLabel}`,
                    () =>
                      saveGroupStandings({
                        groupLabel: group.groupLabel,
                        firstTeamId: order[0],
                        secondTeamId: order[1],
                        thirdTeamId: order[2],
                        fourthTeamId: order[3],
                        finalize,
                      }),
                  )
                }
```

- [ ] **Step 3: Update `GroupAdminCard` prop type + signature (~lines 477-489)**

Replace the `onFinalize` prop:

```ts
  onSaveStandings: (order: [string, string, string, string], finalize: boolean) => Promise<void> | void;
```

and in the destructured params replace `onFinalize,` with `onSaveStandings,`.

- [ ] **Step 4: Import `isGroupProvisional` and compute it (top of `GroupAdminCard`)**

Add `isGroupProvisional` to the existing `@/lib/tournament` import in `admin.tsx`, then inside `GroupAdminCard` after `const status = getGroupStatus(group, now);`:

```ts
  const provisional = isGroupProvisional(group);
  const provisionalPending = pendingKey === `provisional-group-${group.groupLabel}`;
```

- [ ] **Step 5: Show the provisional status (~line 510)**

Replace the status `<small>` content:

```tsx
          {status === "finalized"
            ? "Finalizado"
            : provisional
              ? "Provisional"
              : status === "locked"
                ? "Cerrado"
                : "Abierto"} · {predictionCount} pron.
```

- [ ] **Step 6: Replace the single footer button (~lines 577-584) with two**

```tsx
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!complete || Boolean(pendingKey)}
          onClick={() => onSaveStandings(order as [string, string, string, string], false)}
        >
          <LoadingLabel loading={provisionalPending} label="Guardar provisional" />
        </Button>
        <Button
          size="sm"
          disabled={!complete || Boolean(pendingKey)}
          onClick={() => onSaveStandings(order as [string, string, string, string], true)}
        >
          <LoadingLabel loading={finalizePending} label="Finalizar grupo" />
        </Button>
      </div>
```

- [ ] **Step 7: Typecheck + lint**

Run: `npx tsc --noEmit && npx next lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/screens/admin.tsx
git commit -m "feat(admin): split group result into provisional + finalize"
```

---

## Task 8: Leaderboard — provisional note

**Files:**
- Modify: `src/screens/leaderboard.tsx` — `useApp()` destructure (~line 27), header area (~lines 50-90).

- [ ] **Step 1: Pull `groups` from context and compute provisional flag**

In the `useApp()` destructure add `groups`. Add `isGroupProvisional` to the `@/lib/tournament` import. After the `rows`/`viewLabel` computation, add:

```tsx
  const anyProvisional = useMemo(() => groups.some(isGroupProvisional), [groups]);
  const showProvisionalNote = anyProvisional && (view === "overall" || view === "groups");
```

- [ ] **Step 2: Render the note**

Immediately after the header `</div>` (the flex row with the title + selector, ~line 90), add:

```tsx
      {showProvisionalNote && (
        <p className="mt-3 rounded-lg border border-app-amber/40 bg-app-amber/5 px-3 py-2 text-xs font-bold text-app-muted">
          Incluye posiciones de grupos <strong className="text-app-text">provisionales</strong>; pueden cambiar.
        </p>
      )}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, sign in as admin, save a provisional order for one group, open `/tabla`. Expected: the amber "provisional" note shows on Acumulado and the totals include the group's provisional points.

- [ ] **Step 5: Commit**

```bash
git add src/screens/leaderboard.tsx
git commit -m "feat(tabla): provisional group-points note"
```

---

## Task 9: Results screen — provisional group reveal + per-slot ✓/✗

**Files:**
- Modify: `src/screens/results.tsx` — `GroupResultCard` (~lines 237-305) and `GroupComparisonRow` (~lines 365-405).

- [ ] **Step 1: Import the helper and compute provisional state (~lines 238-241)**

Add `isGroupProvisional` to the `@/lib/tournament` import. Replace:

```ts
  const status = getGroupStatus(group, now);
  const finalized = status === "finalized";
  const order = [group.firstTeamId, group.secondTeamId, group.thirdTeamId, group.fourthTeamId];
```

with:

```ts
  const status = getGroupStatus(group, now);
  const finalized = status === "finalized";
  const provisional = isGroupProvisional(group);
  const revealOrder = finalized || provisional;
  const order = [group.firstTeamId, group.secondTeamId, group.thirdTeamId, group.fourthTeamId];
```

- [ ] **Step 2: Sort and show points when provisional too**

In the `sortComparison` call, change `finalized,` to `finalized: revealOrder,`.

- [ ] **Step 3: Header status chip**

In the header `<StatusChip>` (~lines 264-267), change the `label` to surface provisional:

```tsx
          label={finalized ? "Finalizado" : provisional ? "Provisional" : status === "locked" ? "Cerrado" : "Abierto"}
```

- [ ] **Step 4: Reveal the order when provisional**

Replace `{finalized ? (` (~line 270) with `{revealOrder ? (`. Inside the rendered `<ol>`, add a provisional caption above it (only when `provisional`):

```tsx
      {revealOrder ? (
        <div className="grid gap-1.5">
          {provisional && (
            <span className="text-xs font-extrabold uppercase tracking-wide text-app-amber">
              Posiciones provisionales
            </span>
          )}
          <ol className="grid gap-1.5">
            {order.map((teamId, index) => (
              <li
                key={index}
                className="grid grid-cols-[28px_36px_minmax(0,1fr)] items-center gap-2.5 rounded-md bg-app-surface-2 px-2.5 py-2"
              >
                <span className="text-sm font-black text-app-muted">{index + 1}°</span>
                <span className="text-lg">{getTeamFlag(teamId, teams)}</span>
                <strong className="truncate text-sm font-black">{getTeamLabel(teamId, teams)}</strong>
              </li>
            ))}
          </ol>
        </div>
      ) : (
```

- [ ] **Step 5: Pass `showPoints` + current order to comparison rows**

In the `Collapsible` map (~lines 291-300), update the `GroupComparisonRow` usage:

```tsx
            <GroupComparisonRow
              key={entry.profile.id}
              profile={entry.profile}
              prediction={entry.prediction}
              teams={teams}
              showPoints={revealOrder}
              actualOrder={order}
              isCurrentUser={entry.profile.id === currentUserId}
            />
```

- [ ] **Step 6: Per-slot ✓/✗ for the current user in `GroupComparisonRow`**

Update the `GroupComparisonRow` signature to accept `actualOrder: (string | null)[]` and, for the current user, mark each predicted slot. Replace the predicted-order `<span>` (~lines 391-395) with:

```tsx
          <span className="truncate text-xs font-bold text-app-muted">
            {[prediction.firstTeamId, prediction.secondTeamId, prediction.thirdTeamId, prediction.fourthTeamId]
              .map((teamId, index) => {
                const hit = isCurrentUser && teamId !== null && teamId === actualOrder[index];
                const mark = isCurrentUser ? (hit ? " ✓" : " ✗") : "";
                return `${shortName(teamId)}${mark}`;
              })
              .join(" · ")}
          </span>
```

Add `actualOrder` to the destructured props and its type:

```ts
function GroupComparisonRow({
  profile,
  prediction,
  teams,
  showPoints,
  actualOrder,
  isCurrentUser,
}: {
  profile: Profile;
  prediction?: GroupPrediction;
  teams: Team[];
  showPoints: boolean;
  actualOrder: (string | null)[];
  isCurrentUser: boolean;
}) {
```

- [ ] **Step 7: Typecheck + lint**

Run: `npx tsc --noEmit && npx next lint`
Expected: PASS.

- [ ] **Step 8: Manual verification**

Run: `npm run dev`. As admin, save a provisional order for a group, then open `/resultados`. Expected: the group card shows "Provisional" + the ordered list under a "Posiciones provisionales" caption; expanding "Ver pronósticos" shows each person's provisional points and `exactPositions/4`, and your own row shows ✓/✗ per slot.

- [ ] **Step 9: Commit**

```bash
git add src/screens/results.tsx
git commit -m "feat(resultados): reveal provisional group order, points, per-slot hits"
```

---

## Task 10: Full regression pass

- [ ] **Step 1: Run everything**

Run: `npx vitest run && npx tsc --noEmit && npx next lint`
Expected: all PASS.

- [ ] **Step 2: Manual end-to-end**

1. Admin saves a provisional order for Group A → `/tabla` totals update with the amber note; `/resultados` Group A shows "Provisional".
2. Admin edits the provisional order and re-saves → scores recompute.
3. Admin clicks "Finalizar grupo" → status becomes "Finalizado", note disappears for that group, points unchanged, others' picks revealed as before.

- [ ] **Step 3: Commit any final touch-ups**

```bash
git add -A
git commit -m "chore(groups): provisional standings regression fixes" || echo "nothing to commit"
```

---

## Self-Review Notes

- **Spec coverage:** scoring gate (Tasks 2–3), admin action + finalize flag (Task 4), helper (Task 1), admin UI split (Task 7), leaderboard note (Task 8), per-group breakdown incl. ✓/✗ (Task 9). All spec sections mapped.
- **Type consistency:** action `saveGroupStandingsAction` ↔ type `SaveGroupStandingsInput` ↔ context method `saveGroupStandings` ↔ admin prop `onSaveStandings` are used consistently across Tasks 4–7. `scoreGroupPredictionOrNull` signature is identical in scoring.ts, actions.ts, and app-shell.tsx.
- **No DB migration:** provisional uses existing `first..fourth` columns with `result_finalized_at` left null.
- **Deferred (per spec):** clearing an order back to empty is not added in v1 (the admin UI requires a complete order to save); revisit if un-scoring a group is needed.
</content>
