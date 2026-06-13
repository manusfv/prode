# Provisional Standings Preview Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make provisional group points stop counting in the official leaderboard and instead surface only behind per-viewer "preview" toggles on the Tabla and Resultados screens.

**Architecture:** The leaderboard aggregation in `src/lib/standings.ts` learns to exclude points from provisional groups unless an `includeProvisional` flag is set. Each screen owns an independent, default-off, client-side preview switch that passes that flag (Tabla) or gates the per-group reveal (Resultados). Scoring/recalc is unchanged — only aggregation and display change.

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-13-provisional-standings-preview-toggle-design.md`

---

## File structure

- `src/lib/standings.ts` — `getLeaderboard` + `getStageLeaderboard` gain `groups` + `includeProvisional`; new private `filterGroupPredictions` helper. Single responsibility: leaderboard aggregation.
- `src/lib/standings.test.ts` — updated fixtures (now pass `groups`) + new provisional-gating tests.
- `src/components/app-shell.tsx`, `src/lib/stats.ts`, `src/screens/predictions.tsx` — caller updates (pass `groups`; keep official semantics, no preview).
- `src/screens/leaderboard.tsx` — Tabla preview toggle + active indicator (replaces the always-on note).
- `src/screens/results.tsx` — Resultados preview toggle gating the provisional per-group reveal.

---

## Task 1: Gate provisional group points in the leaderboard

**Files:**
- Modify: `src/lib/standings.ts`
- Test: `src/lib/standings.test.ts`
- Modify (callers): `src/components/app-shell.tsx:145`, `src/lib/stats.ts:950`, `src/screens/predictions.tsx:92,157`, `src/screens/leaderboard.tsx:40-42`

- [ ] **Step 1: Update existing tests to pass `groups`, and add gating tests**

In `src/lib/standings.test.ts`, change the import on line 4 to add `Group`:

```ts
import type { Group, GroupPrediction, Match, Prediction, Profile } from "./types";
```

Add a finalized-group fixture after the `groupPredictions` fixture (after line 29):

```ts
const finalizedGroups: Group[] = [
  { groupLabel: "A", locksAt: null, firstTeamId: "a", secondTeamId: "b", thirdTeamId: "c", fourthTeamId: "d", resultFinalizedAt: "2026-06-10T00:00:00.000Z", resultFinalizedBy: "admin" },
];
const provisionalGroups: Group[] = [
  { groupLabel: "A", locksAt: null, firstTeamId: "a", secondTeamId: "b", thirdTeamId: "c", fourthTeamId: "d", resultFinalizedAt: null, resultFinalizedBy: null },
];
```

In the existing `describe("getLeaderboard (revealed-scoped)")`, add `groups: finalizedGroups` to all three `getLeaderboard(...)` calls (lines 33, 42, 47) so the default-counts test still sees group A's 8 points. Each call becomes e.g.:

```ts
const rows = getLeaderboard({ predictions, profiles, groupPredictions, matches, groups: finalizedGroups, standingsStages: new Set(["round32"]) });
```

In the existing `describe("getStageLeaderboard")`, add `groups: finalizedGroups` to both calls (lines 55, 61), e.g.:

```ts
const rows = getStageLeaderboard("groups", { predictions, profiles, groupPredictions, matches, groups: finalizedGroups });
```

Then append two new describe blocks at the end of the file (after the `getStageLeaderboard` block, before `getInitials`):

```ts
describe("getLeaderboard provisional gating", () => {
  it("excludes provisional group points by default", () => {
    const rows = getLeaderboard({ predictions, profiles, groupPredictions, matches, groups: provisionalGroups, standingsStages: new Set(["round32", "groups"]) });
    expect(rows.find((r) => r.user.id === "u1")!.points).toBe(10); // 10 match; provisional 8 excluded
  });

  it("includes provisional group points when includeProvisional is true", () => {
    const rows = getLeaderboard({ predictions, profiles, groupPredictions, matches, groups: provisionalGroups, standingsStages: new Set(["round32", "groups"]), includeProvisional: true });
    expect(rows.find((r) => r.user.id === "u1")!.points).toBe(18); // 10 + 8 provisional
  });

  it("counts finalized group points in both modes", () => {
    const off = getLeaderboard({ predictions, profiles, groupPredictions, matches, groups: finalizedGroups, standingsStages: new Set(["round32", "groups"]) });
    const on = getLeaderboard({ predictions, profiles, groupPredictions, matches, groups: finalizedGroups, standingsStages: new Set(["round32", "groups"]), includeProvisional: true });
    expect(off.find((r) => r.user.id === "u1")!.points).toBe(18);
    expect(on.find((r) => r.user.id === "u1")!.points).toBe(18);
  });
});

describe("getStageLeaderboard provisional gating", () => {
  it("excludes provisional groups by default and includes them when previewing", () => {
    const off = getStageLeaderboard("groups", { predictions, profiles, groupPredictions, matches, groups: provisionalGroups });
    const on = getStageLeaderboard("groups", { predictions, profiles, groupPredictions, matches, groups: provisionalGroups, includeProvisional: true });
    expect(off.find((r) => r.user.id === "u1")!.points).toBe(0);
    expect(on.find((r) => r.user.id === "u1")!.points).toBe(8);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/standings.test.ts`
Expected: FAIL — TypeScript/argument errors (`groups` not accepted) and the new gating assertions fail.

- [ ] **Step 3: Implement the gating in `src/lib/standings.ts`**

Change the import on line 1 to add `Group`, and import the helper:

```ts
import type { Group, GroupPrediction, Match, Prediction, Profile, Stage } from "./types";
import { isGroupProvisional } from "./tournament";
```

Add this private helper just above `getLeaderboard` (after the `stageByMatchId` function, before the `getLeaderboard` doc comment):

```ts
/** Keep group predictions whose group counts toward the total: finalized groups
 *  always; provisional groups only when previewing ("if the groups ended today"). */
function filterGroupPredictions(
  groupPredictions: GroupPrediction[],
  groups: Group[],
  includeProvisional: boolean,
): GroupPrediction[] {
  if (includeProvisional) return groupPredictions;
  const provisionalLabels = new Set(
    groups.filter(isGroupProvisional).map((group) => group.groupLabel),
  );
  return groupPredictions.filter((prediction) => !provisionalLabels.has(prediction.groupLabel));
}
```

Replace the `getLeaderboard` signature + group subset line. The new version:

```ts
/** Accumulated leaderboard over the revealed (standings_open) stages only.
 *  Provisional group points count only when includeProvisional is set. */
export function getLeaderboard({
  predictions,
  profiles,
  groupPredictions,
  matches,
  groups,
  standingsStages,
  includeProvisional = false,
}: {
  predictions: Prediction[];
  profiles: Profile[];
  groupPredictions: GroupPrediction[];
  matches: Match[];
  groups: Group[];
  standingsStages: Set<Stage>;
  includeProvisional?: boolean;
}): LeaderboardRow[] {
  const byMatch = stageByMatchId(matches);
  const predSubset = predictions.filter((prediction) => {
    const stage = byMatch.get(prediction.matchId);
    return stage ? standingsStages.has(stage) : false;
  });
  const groupSubset = standingsStages.has("groups")
    ? filterGroupPredictions(groupPredictions, groups, includeProvisional)
    : [];
  return buildLeaderboard({ profiles, predictions: predSubset, groupPredictions: groupSubset });
}
```

Replace `getStageLeaderboard` to thread the same gating into the `"groups"` branch:

```ts
/** Leaderboard of points earned in a single stage. */
export function getStageLeaderboard(
  stage: Stage,
  {
    predictions,
    profiles,
    groupPredictions,
    matches,
    groups,
    includeProvisional = false,
  }: {
    predictions: Prediction[];
    profiles: Profile[];
    groupPredictions: GroupPrediction[];
    matches: Match[];
    groups: Group[];
    includeProvisional?: boolean;
  },
): LeaderboardRow[] {
  if (stage === "groups") {
    const groupSubset = filterGroupPredictions(groupPredictions, groups, includeProvisional);
    return buildLeaderboard({ profiles, predictions: [], groupPredictions: groupSubset });
  }
  const byMatch = stageByMatchId(matches);
  const predSubset = predictions.filter((prediction) => byMatch.get(prediction.matchId) === stage);
  return buildLeaderboard({ profiles, predictions: predSubset, groupPredictions: [] });
}
```

- [ ] **Step 4: Update the four callers to pass `groups`**

These keep official semantics (no preview), so they pass `groups` and leave `includeProvisional` defaulted (false).

`src/components/app-shell.tsx:145` — add `groups,` to the call (the `groups` state is in scope):

```ts
getLeaderboard({ predictions, profiles, groupPredictions, matches, groups, standingsStages }).find(
```

`src/lib/stats.ts:950` — add `groups,` (the enclosing function already has a `groups` param):

```ts
const pointsTotals: PersonValue[] = getLeaderboard({ profiles, predictions, groupPredictions, matches, groups, standingsStages })
```

`src/screens/predictions.tsx` — ensure `groups` is destructured from `useApp()` at line 92 (add `groups,` if missing), then add it to the call at line 157:

```ts
() => getLeaderboard({ predictions, profiles, groupPredictions, matches, groups, standingsStages }),
```

and add `groups` to that `useMemo` dependency array.

`src/screens/leaderboard.tsx:40-42` — `groups` is already destructured (line 27). Add `groups` to both calls (preview flag comes in Task 2):

```ts
if (view === "overall") {
  return getLeaderboard({ predictions, profiles, groupPredictions, matches, groups, standingsStages });
}
return getStageLeaderboard(view, { predictions, profiles, groupPredictions, matches, groups });
```

and add `groups` to that `useMemo` dependency array (line 43).

- [ ] **Step 5: Run tests + typecheck to verify green**

Run: `npx vitest run src/lib/standings.test.ts && npx tsc --noEmit`
Expected: PASS (all standings tests) and `TypeScript: No errors found`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/standings.ts src/lib/standings.test.ts src/components/app-shell.tsx src/lib/stats.ts src/screens/predictions.tsx src/screens/leaderboard.tsx
git commit -m "feat(tabla): exclude provisional group points from official total

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Tabla preview toggle

**Files:**
- Modify: `src/screens/leaderboard.tsx`

Note: Task 1 (ace1ccb, earlier work) left an always-on amber note driven by `anyGroupProvisional`/`showProvisionalNote`. This task replaces that note with a toggle + active indicator.

- [ ] **Step 1: Add `Button` import and preview state**

Ensure `Button` is imported at the top of `src/screens/leaderboard.tsx`:

```ts
import { Button } from "@/components/ui/button";
```

Add preview state inside `LeaderboardScreen`, next to the existing `view` state (after line 28):

```ts
const [preview, setPreview] = useState(false);
```

- [ ] **Step 2: Thread `includeProvisional: preview` into the rows computation**

Replace the `rows` `useMemo` (lines 38-43) with:

```ts
const rows = useMemo(() => {
  if (view === "overall") {
    return getLeaderboard({ predictions, profiles, groupPredictions, matches, groups, standingsStages, includeProvisional: preview });
  }
  return getStageLeaderboard(view, { predictions, profiles, groupPredictions, matches, groups, includeProvisional: preview });
}, [view, predictions, profiles, groupPredictions, matches, groups, standingsStages, preview]);
```

- [ ] **Step 3: Replace the note computation with toggle visibility**

Replace the two lines added by earlier work:

```ts
const anyGroupProvisional = useMemo(() => groups.some(isGroupProvisional), [groups]);
const showProvisionalNote = anyGroupProvisional && (view === "overall" || view === "groups");
```

with:

```ts
const anyGroupProvisional = useMemo(() => groups.some(isGroupProvisional), [groups]);
const canPreview = anyGroupProvisional && standingsStages.has("groups");
const showPreviewToggle = canPreview && (view === "overall" || view === "groups");
```

- [ ] **Step 4: Render the toggle in the header and the active indicator**

Add the toggle button inside the header flex container, immediately after the closing `</Tabs>` and before the closing `</div>` of the `flex flex-wrap` header (around line 89):

```tsx
{showPreviewToggle && (
  <Button
    type="button"
    variant={preview ? "default" : "outline"}
    size="sm"
    aria-pressed={preview}
    onClick={() => setPreview((value) => !value)}
    className="w-full shrink-0 sm:w-auto"
  >
    {preview ? "Vista previa activa" : "Si los grupos terminaran hoy"}
  </Button>
)}
```

Replace the existing note block (the `{showProvisionalNote && ( ... )}` paragraph added by earlier work, just before `{podium.length > 0 && ...}`) with an active-preview indicator:

```tsx
{preview && canPreview && (
  <p className="mt-3 rounded-lg border border-app-amber/40 bg-app-amber/10 px-3 py-2 text-xs font-bold text-app-amber">
    Mostrando cómo quedaría la tabla <strong className="font-black">si los grupos terminaran hoy</strong>. No es el resultado final.
  </p>
)}
```

- [ ] **Step 5: Typecheck, lint, and manually verify**

Run: `npx tsc --noEmit && npx next lint`
Expected: `TypeScript: No errors found` and `Errors: 0 | Warnings: 0`.

Manual check (describe in the commit, no automated UI test): with at least one provisional group and groups standings open, the Tabla shows the toggle; flipping it on changes the podium/table/Grupos-view points and shows the amber indicator; flipping off returns to official totals; the toggle is absent when no group is provisional.

- [ ] **Step 6: Commit**

```bash
git add src/screens/leaderboard.tsx
git commit -m "feat(tabla): per-viewer preview toggle for provisional standings

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Resultados preview toggle

**Files:**
- Modify: `src/screens/results.tsx`

Earlier work (ce084ad) made `ResultGroupCard` reveal provisional groups unconditionally via `revealOrder = finalized || provisional`. This task gates that reveal behind a per-viewer toggle and defaults it off.

- [ ] **Step 1: Add preview state and toggle visibility in `ResultsScreen`**

Ensure `Button` is imported (it already is — used by `Collapsible`). In `ResultsScreen`, after `sortedGroups` (around line 70), add:

```ts
const anyGroupProvisional = useMemo(() => groups.some(isGroupProvisional), [groups]);
const [previewGroups, setPreviewGroups] = useState(false);
```

- [ ] **Step 2: Render the Resultados toggle (groups stage only)**

In the `isGroups` header area, add the toggle. Inside the panel `div` that holds the "Resultados" heading and the count (the `flex items-end justify-between` block, around lines 79-87), the count `<span>` is the last child. Replace that count `<span>` with a wrapper that adds the toggle when on the groups stage and a provisional group exists:

```tsx
<div className="flex items-center gap-3 max-lg:w-full max-lg:justify-between">
  {isGroups && anyGroupProvisional && (
    <Button
      type="button"
      variant={previewGroups ? "default" : "outline"}
      size="sm"
      aria-pressed={previewGroups}
      onClick={() => setPreviewGroups((value) => !value)}
    >
      {previewGroups ? "Ocultar provisionales" : "Ver posiciones provisionales"}
    </Button>
  )}
  <span className="text-sm font-black text-app-muted">
    {count} {isGroups ? "grupos" : "partidos"}
  </span>
</div>
```

- [ ] **Step 3: Pass `preview` into each `ResultGroupCard`**

In the `sortedGroups.map(...)` that renders `<ResultGroupCard ... />` (around lines 91-100), add the prop:

```tsx
<ResultGroupCard
  key={group.groupLabel}
  group={group}
  teams={teams}
  now={now}
  approvedProfiles={approvedProfiles}
  groupPredictions={groupPredictions.filter((prediction) => prediction.groupLabel === group.groupLabel)}
  currentUserId={currentUser.id}
  preview={previewGroups}
/>
```

- [ ] **Step 4: Gate the reveal in `ResultGroupCard`**

Add `preview: boolean;` to the `ResultGroupCard` prop type (in the destructured params and the type block, around lines 223-237). The new signature:

```tsx
function ResultGroupCard({
  group,
  teams,
  now,
  approvedProfiles,
  groupPredictions,
  currentUserId,
  preview,
}: {
  group: Group;
  teams: Team[];
  now: Date;
  approvedProfiles: Profile[];
  groupPredictions: GroupPrediction[];
  currentUserId: string;
  preview: boolean;
}) {
```

Change the `revealOrder` line (added by earlier work) from:

```ts
const revealOrder = finalized || provisional;
```

to:

```ts
const revealOrder = finalized || (provisional && preview);
```

Leave everything else (the `provisional` chip label, `showPoints={revealOrder}`, `actualOrder={order}`, the `sortComparison` `finalized: revealOrder`, the per-slot ✓/✗) unchanged — they already follow `revealOrder`. Result: when `preview` is off, provisional groups show "Resultado pendiente"; finalized groups always reveal.

- [ ] **Step 5: Typecheck, lint, and manually verify**

Run: `npx tsc --noEmit && npx next lint`
Expected: `TypeScript: No errors found` and `Errors: 0 | Warnings: 0`.

Manual check: on the Resultados groups stage with a provisional group, the toggle appears and defaults off (cards show "Resultado pendiente"); turning it on reveals the provisional order, points, and per-slot ✓/✗; finalized groups reveal regardless; the toggle is absent when no group is provisional.

- [ ] **Step 6: Commit**

```bash
git add src/screens/results.tsx
git commit -m "feat(resultados): per-viewer preview toggle for provisional groups

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Full regression and manual end-to-end

**Files:** none (verification only)

- [ ] **Step 1: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit && npx next lint`
Expected: all tests pass, `TypeScript: No errors found`, `Errors: 0 | Warnings: 0`.

- [ ] **Step 2: Manual end-to-end**

As admin, save a provisional order for a group ("Guardar provisional"). As a participant:
- Tabla default shows official totals (no provisional points); the preview toggle flips them in/out and shows the indicator.
- Resultados default hides the provisional order ("Resultado pendiente"); the toggle reveals order + points + per-slot ✓/✗.
- Predicciones is unchanged.
Then finalize the group ("Finalizar grupo") and confirm its points now count officially everywhere and both toggles disappear (nothing left provisional).

- [ ] **Step 3: Final review**

Use the code-review skill (or finishing-a-development-branch) for the whole branch before opening a PR.
