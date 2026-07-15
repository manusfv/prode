# Unify "Final" and "3er puesto" pronóstico tabs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the single-match `third` ("3er puesto") and `final` ("Final") stage tabs into one tab labeled "Final y 3er puesto" across every screen that shows stage tabs, without changing the `Stage` model.

**Architecture:** Introduce a *stage-tab layer* in `src/lib/tournament.ts` — an ordered list of tabs, each mapping to one or more `Stage`s — as the single source of truth. `StageTabs` and its three consumers (pronósticos, resultados, tabla) render/filter through this layer. `Stage`, scoring, sync, admin, DB, and the per-match `StageBadge` are untouched.

**Tech Stack:** TypeScript, React, Next.js (App Router), Tailwind, Vitest.

## Global Constraints

- Merged tab label is exactly `"Final y 3er puesto"`.
- `Stage` type, `stageOrder`, `stageLabels`, `isStage`, and `StageBadge` must NOT change.
- No changes to scoring (`src/lib/scoring.ts`), sync (`src/lib/sync/*`), admin (`src/screens/admin.tsx`), or the DB schema.
- Single-stage tab labels are derived from `stageLabels` (do not hardcode — the real values are `round32: "16avos"`, `round16: "Octavos"`).
- Legacy URLs (`?stage=third`, `?stage=final`, `?view=third`, `?view=final`) must resolve to the merged tab.
- Follow the design system in `docs/design-system.md` (no UI/styling changes are required by this plan, but do not introduce raw CSS or color literals).
- Test runner: `npx vitest run`. Lint: `npm run lint`. Typecheck: `npx tsc --noEmit`.

---

## File Structure

- `src/lib/tournament.ts` — **modify**: add `StageTabId`, `stageTabs`, `stageToTab`, `tabStages`, `isStageTab`, `resolveStageTab`. (Task 1)
- `src/lib/tournament.test.ts` — **modify**: unit tests for the new helpers. (Task 1)
- `src/components/badges.tsx` — **modify**: `StageTabs` renders from `stageTabs`. (Task 2)
- `src/lib/standings.ts` — **modify**: `getStageLeaderboard` accepts a `StageTabId`. (Task 3)
- `src/lib/standings.test.ts` — **modify**: add `finals`-tab coverage. (Task 3)
- `src/screens/predictions.tsx` — **modify**: use the tab layer. (Task 4)
- `src/screens/results.tsx` — **modify**: use the tab layer. (Task 5)
- `src/screens/leaderboard.tsx` — **modify**: use the tab layer. (Task 6)
- Whole-app verification + Novedades decision. (Task 7)

`src/lib/results.ts` keeps returning `Stage` (callers wrap with `stageToTab`), so `src/lib/results.test.ts` is unchanged.

---

### Task 1: Stage-tab model and helpers

**Files:**
- Modify: `src/lib/tournament.ts` (after the `isStage` export, ~line 23)
- Test: `src/lib/tournament.test.ts`

**Interfaces:**
- Consumes: existing `stageLabels`, `isStage`, and `Stage` type from this file.
- Produces:
  - `type StageTabId = "groups" | "round32" | "round16" | "quarter" | "semi" | "finals"`
  - `stageTabs: { id: StageTabId; label: string; stages: Stage[] }[]`
  - `stageToTab(stage: Stage): StageTabId`
  - `tabStages(id: StageTabId): Stage[]`
  - `isStageTab(value: string): value is StageTabId`
  - `resolveStageTab(param: string | null): StageTabId | null`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/tournament.test.ts` (add the imports to the existing top-of-file import from `./tournament`):

```ts
import {
  getGroupStatus,
  hasGroupOrder,
  isGroupProvisional,
  isStageTab,
  resolveStageTab,
  stageTabs,
  stageToTab,
  stepScore,
  tabStages,
} from "./tournament";

// ...existing describe blocks stay unchanged...

describe("stage tabs", () => {
  it("maps third and final into the finals tab", () => {
    expect(stageToTab("third")).toBe("finals");
    expect(stageToTab("final")).toBe("finals");
  });

  it("maps every other stage to its own tab", () => {
    expect(stageToTab("groups")).toBe("groups");
    expect(stageToTab("round32")).toBe("round32");
    expect(stageToTab("round16")).toBe("round16");
    expect(stageToTab("quarter")).toBe("quarter");
    expect(stageToTab("semi")).toBe("semi");
  });

  it("labels the finals tab 'Final y 3er puesto'", () => {
    expect(stageTabs.find((tab) => tab.id === "finals")!.label).toBe("Final y 3er puesto");
  });

  it("returns the stages a tab covers", () => {
    expect(tabStages("finals")).toEqual(["third", "final"]);
    expect(tabStages("semi")).toEqual(["semi"]);
  });

  it("recognizes valid tab ids", () => {
    expect(isStageTab("finals")).toBe(true);
    expect(isStageTab("groups")).toBe(true);
    expect(isStageTab("third")).toBe(false);
    expect(isStageTab("nope")).toBe(false);
  });

  it("resolves tab ids, legacy stage values, and unknowns", () => {
    expect(resolveStageTab("finals")).toBe("finals");
    expect(resolveStageTab("third")).toBe("finals");
    expect(resolveStageTab("final")).toBe("finals");
    expect(resolveStageTab("round16")).toBe("round16");
    expect(resolveStageTab(null)).toBeNull();
    expect(resolveStageTab("bogus")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/tournament.test.ts`
Expected: FAIL — `stageTabs`, `stageToTab`, `tabStages`, `isStageTab`, `resolveStageTab` are not exported.

- [ ] **Step 3: Implement the model and helpers**

In `src/lib/tournament.ts`, insert immediately after the `isStage` export (line 23):

```ts
export type StageTabId = "groups" | "round32" | "round16" | "quarter" | "semi" | "finals";

/** Tab layer over `Stage`: the finals tab merges the 3er-puesto and final matches. */
export const stageTabs: { id: StageTabId; label: string; stages: Stage[] }[] = [
  { id: "groups", label: stageLabels.groups, stages: ["groups"] },
  { id: "round32", label: stageLabels.round32, stages: ["round32"] },
  { id: "round16", label: stageLabels.round16, stages: ["round16"] },
  { id: "quarter", label: stageLabels.quarter, stages: ["quarter"] },
  { id: "semi", label: stageLabels.semi, stages: ["semi"] },
  { id: "finals", label: "Final y 3er puesto", stages: ["third", "final"] },
];

const stageToTabMap: Record<Stage, StageTabId> = stageTabs.reduce((acc, tab) => {
  for (const stage of tab.stages) acc[stage] = tab.id;
  return acc;
}, {} as Record<Stage, StageTabId>);

export function stageToTab(stage: Stage): StageTabId {
  return stageToTabMap[stage];
}

export function tabStages(id: StageTabId): Stage[] {
  return stageTabs.find((tab) => tab.id === id)?.stages ?? [];
}

export function isStageTab(value: string): value is StageTabId {
  return stageTabs.some((tab) => tab.id === value);
}

/** Accepts a tab id or a legacy `Stage` value, returning the owning tab (or null). */
export function resolveStageTab(param: string | null): StageTabId | null {
  if (param === null) return null;
  if (isStageTab(param)) return param;
  if (isStage(param)) return stageToTab(param);
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/tournament.test.ts`
Expected: PASS (all `stage tabs` tests green, existing tests still green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament.ts src/lib/tournament.test.ts
git commit -m "feat(tournament): add stage-tab layer merging third and final"
```

---

### Task 2: Render StageTabs from the tab layer

**Files:**
- Modify: `src/components/badges.tsx:10` (import) and `src/components/badges.tsx:69-146` (`StageTabs`)

**Interfaces:**
- Consumes: `stageTabs`, `StageTabId` from Task 1.
- Produces: `StageTabs<T extends string = StageTabId>` — `activeStage: T`, `enabledStages: Set<Stage>` (unchanged prop shape), `onChange?: (stage: T) => void`, plus existing `showDisabled`, `leadingOption`, `label`. A tab is enabled when any of its stages is in `enabledStages`.

- [ ] **Step 1: Update the import**

Change `src/components/badges.tsx:10` from:

```ts
import { stageLabels, stageOrder } from "@/lib/tournament";
```
to:
```ts
import { stageLabels, stageTabs } from "@/lib/tournament";
import type { StageTabId } from "@/lib/tournament";
```
(`stageLabels` stays — `StageBadge` at line 18 still uses it.)

- [ ] **Step 2: Update the generic default and active-label lookup**

Change the signature line `src/components/badges.tsx:69`:
```ts
export function StageTabs<T extends string = Stage>({
```
to:
```ts
export function StageTabs<T extends string = StageTabId>({
```

Change the `activeLabel` block (`src/components/badges.tsx:86-89`):
```ts
  const activeLabel =
    leadingOption && activeStage === leadingOption.value
      ? leadingOption.label
      : stageLabels[activeStage as Stage];
```
to:
```ts
  const activeLabel =
    leadingOption && activeStage === leadingOption.value
      ? leadingOption.label
      : (stageTabs.find((tab) => tab.id === activeStage)?.label ?? "");
```

- [ ] **Step 3: Update the Select options loop**

Replace the `stageOrder.map(...)` block inside `<SelectContent>` (`src/components/badges.tsx:107-115`):
```tsx
          {stageOrder.map((stage) => (
            <SelectItem
              key={stage}
              value={stage}
              disabled={showDisabled ? !enabledStages.has(stage) : false}
            >
              {stageLabels[stage]}
            </SelectItem>
          ))}
```
with:
```tsx
          {stageTabs.map((tab) => (
            <SelectItem
              key={tab.id}
              value={tab.id}
              disabled={showDisabled ? !tab.stages.some((stage) => enabledStages.has(stage)) : false}
            >
              {tab.label}
            </SelectItem>
          ))}
```

- [ ] **Step 4: Update the Tabs triggers loop**

Replace the `stageOrder.map(...)` block inside `<TabsList>` (`src/components/badges.tsx:132-141`):
```tsx
          {stageOrder.map((stage) => (
            <TabsTrigger
              key={stage}
              value={stage}
              disabled={showDisabled ? !enabledStages.has(stage) : false}
              className={triggerClass}
            >
              {stageLabels[stage]}
            </TabsTrigger>
          ))}
```
with:
```tsx
          {stageTabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              disabled={showDisabled ? !tab.stages.some((stage) => enabledStages.has(stage)) : false}
              className={triggerClass}
            >
              {tab.label}
            </TabsTrigger>
          ))}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: Errors ONLY in the three consumer screens (`predictions.tsx`, `results.tsx`, `leaderboard.tsx`) where `activeStage`/`onChange` are still typed as `Stage` — those are fixed in Tasks 4–6. `badges.tsx` itself must be error-free. (If you prefer a clean typecheck at every task boundary, run this after Task 6 instead.)

- [ ] **Step 6: Commit**

```bash
git add src/components/badges.tsx
git commit -m "feat(badges): render StageTabs from the stage-tab layer"
```

---

### Task 3: getStageLeaderboard accepts a StageTabId

**Files:**
- Modify: `src/lib/standings.ts:108-133`
- Test: `src/lib/standings.test.ts`

**Interfaces:**
- Consumes: `tabStages`, `StageTabId` from Task 1.
- Produces: `getStageLeaderboard(tab: StageTabId, opts): LeaderboardRow[]` — filters predictions to matches whose stage is in `tabStages(tab)`; if the tab covers `groups`, builds from group predictions.

- [ ] **Step 1: Write the failing test**

Add to the `describe("getStageLeaderboard", ...)` block in `src/lib/standings.test.ts` (after the existing `it` at line 85). First add two finals-stage matches and predictions near the existing fixtures — insert after the `matches` array (line 15):

```ts
const finalsMatches: Match[] = [
  ...matches,
  { id: "m3", matchNo: 3, stage: "third", homeTeamId: "a", awayTeamId: "b", kickoffUtc: "2026-06-03T00:00:00.000Z", homeScore: 0, awayScore: 0, winnerTeamId: null, finalizedAt: null, finalizedBy: null, updatedAt: null, updatedBy: null, finalizedSource: null, feedMatchId: null },
  { id: "m4", matchNo: 4, stage: "final", homeTeamId: "a", awayTeamId: "b", kickoffUtc: "2026-06-04T00:00:00.000Z", homeScore: 1, awayScore: 0, winnerTeamId: "a", finalizedAt: null, finalizedBy: null, updatedAt: null, updatedBy: null, finalizedSource: null, feedMatchId: null },
];
```

Then add these tests inside the `describe("getStageLeaderboard", ...)` block:

```ts
  it("aggregates both stages for the finals tab", () => {
    const finalsPreds: Prediction[] = [
      pred("pf1", "u1", "m3", 4), // third
      pred("pf2", "u1", "m4", 7), // final
      pred("pf3", "u2", "m4", 2), // final
    ];
    const rows = getStageLeaderboard("finals", { predictions: finalsPreds, profiles, groupPredictions, matches: finalsMatches, groups: finalizedGroups });
    expect(rows.find((r) => r.user.id === "u1")!.points).toBe(11); // 4 + 7
    expect(rows.find((r) => r.user.id === "u2")!.points).toBe(2);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/standings.test.ts`
Expected: FAIL — `getStageLeaderboard("finals", …)` returns 0 points because the current filter compares `=== "finals"` against real stage values (`"third"`, `"final"`), matching nothing. (TypeScript would also reject `"finals"` as a `Stage` argument once the signature exists.)

- [ ] **Step 3: Update the implementation**

In `src/lib/standings.ts`, add to the import from `./tournament` (there is currently no such import; add one near the top imports):

```ts
import { tabStages, type StageTabId } from "./tournament";
```

Change the function signature and body (`src/lib/standings.ts:108-133`):
```ts
export function getStageLeaderboard(
  stage: Stage,
  {
    predictions,
    ...
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
to:
```ts
export function getStageLeaderboard(
  tab: StageTabId,
  {
    predictions,
    ...
  },
): LeaderboardRow[] {
  const stages = tabStages(tab);
  if (stages.includes("groups")) {
    const groupSubset = filterGroupPredictions(groupPredictions, groups, includeProvisional);
    return buildLeaderboard({ profiles, predictions: [], groupPredictions: groupSubset });
  }
  const byMatch = stageByMatchId(matches);
  const predSubset = predictions.filter((prediction) => {
    const stage = byMatch.get(prediction.matchId);
    return stage !== undefined && stages.includes(stage);
  });
  return buildLeaderboard({ profiles, predictions: predSubset, groupPredictions: [] });
}
```
(Keep the destructured options block — `profiles, groupPredictions, matches, groups, includeProvisional = false` — exactly as it is; only the first parameter, the `groups` guard, and the `predSubset` filter change. Update the JSDoc comment on line 107 to "Leaderboard of points earned in a single tab (one or more stages).")

The existing tests call `getStageLeaderboard("round16", …)` and `getStageLeaderboard("groups", …)`; both `"round16"` and `"groups"` are valid `StageTabId`s, so they keep passing unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/standings.test.ts`
Expected: PASS (new finals test plus all existing `getStageLeaderboard` / `getLeaderboard` tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/standings.ts src/lib/standings.test.ts
git commit -m "feat(standings): score stage leaderboard by tab (merged finals)"
```

---

### Task 4: Pronósticos screen uses the tab layer

**Files:**
- Modify: `src/screens/predictions.tsx` (imports ~44-45; `defaultStage`/`activeStage` 99-101; `visibleMatches` 122-127; `lastModifiedAt` 148-159; `handleStageChange` 188-192; `StageTabs` + preview line 198-201; `activeStage === "groups"` at 204 and 226)

**Interfaces:**
- Consumes: `resolveStageTab`, `stageToTab`, `tabStages`, `StageTabId` from Task 1; `StageTabs` from Task 2.
- Produces: no new exports (screen component).

- [ ] **Step 1: Update the tournament import**

In the import block at `src/screens/predictions.tsx:35-47`, replace `isStage,` and `stageOrder,` with the tab helpers (keep `stageLabels` — used by match headers at lines 813/890 — and keep `stepScore`, `getMatchStatus`, etc.):

Remove `isStage,` and `stageOrder,`; add:
```ts
  resolveStageTab,
  stageOrder,
  stageToTab,
  tabStages,
```
Wait — `stageOrder` is still needed for the default-tab computation below, so keep `stageOrder`, remove only `isStage`. Final added/kept names in that import: `resolveStageTab, stageToTab, tabStages` added; `stageOrder` kept; `isStage` removed. Also add the type import for `StageTabId`:
```ts
import type { StageTabId } from "@/lib/tournament";
```

- [ ] **Step 2: Compute the active tab**

Replace `src/screens/predictions.tsx:99-101`:
```ts
  const stageParam = searchParams.get("stage");
  const defaultStage = stageOrder.findLast((stage) => openStages.has(stage)) ?? "groups";
  const activeStage: Stage = stageParam !== null && isStage(stageParam) ? stageParam : defaultStage;
```
with:
```ts
  const stageParam = searchParams.get("stage");
  const defaultTab = stageToTab(stageOrder.findLast((stage) => openStages.has(stage)) ?? "groups");
  const activeTab: StageTabId = resolveStageTab(stageParam) ?? defaultTab;
```

- [ ] **Step 3: Update the match filter**

Replace `src/screens/predictions.tsx:122-127`:
```ts
  const visibleMatches = useMemo(() => {
    return matches
      .filter((match) => match.stage === activeStage)
      .filter((match) => !missingOnly || !currentPredictionMap.has(match.id))
      .sort((a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime());
  }, [activeStage, currentPredictionMap, matches, missingOnly]);
```
with:
```ts
  const visibleMatches = useMemo(() => {
    const stages = tabStages(activeTab);
    return matches
      .filter((match) => stages.includes(match.stage))
      .filter((match) => !missingOnly || !currentPredictionMap.has(match.id))
      .sort((a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime());
  }, [activeTab, currentPredictionMap, matches, missingOnly]);
```

- [ ] **Step 4: Update lastModifiedAt**

Replace `src/screens/predictions.tsx:148-159` — change the `groups` check and the stage-match-id set:
```ts
    if (activeStage === "groups") {
      for (const prediction of currentGroupPredictionMap.values()) consider(prediction.updatedAt);
    } else {
      const stageMatchIds = new Set(
        matches.filter((match) => match.stage === activeStage).map((match) => match.id),
      );
      for (const prediction of currentPredictionMap.values()) {
        if (stageMatchIds.has(prediction.matchId)) consider(prediction.updatedAt);
      }
    }
    return latest;
  }, [activeStage, currentGroupPredictionMap, currentPredictionMap, matches]);
```
with:
```ts
    if (activeTab === "groups") {
      for (const prediction of currentGroupPredictionMap.values()) consider(prediction.updatedAt);
    } else {
      const stages = tabStages(activeTab);
      const stageMatchIds = new Set(
        matches.filter((match) => stages.includes(match.stage)).map((match) => match.id),
      );
      for (const prediction of currentPredictionMap.values()) {
        if (stageMatchIds.has(prediction.matchId)) consider(prediction.updatedAt);
      }
    }
    return latest;
  }, [activeTab, currentGroupPredictionMap, currentPredictionMap, matches]);
```

- [ ] **Step 5: Update handleStageChange**

Replace `src/screens/predictions.tsx:188-192`:
```ts
  const handleStageChange = (newStage: Stage) => {
    const params = new URLSearchParams(searchParams);
    params.set("stage", newStage);
    router.replace(`${pathname}?${params.toString()}`);
  }
```
with:
```ts
  const handleStageChange = (newTab: StageTabId) => {
    const params = new URLSearchParams(searchParams);
    params.set("stage", newTab);
    router.replace(`${pathname}?${params.toString()}`);
  }
```

- [ ] **Step 6: Update the StageTabs usage, preview line, and groups branches**

Replace `src/screens/predictions.tsx:198-201`:
```tsx
          <StageTabs activeStage={activeStage} enabledStages={openStages} onChange={handleStageChange} />
          {!editableStages.has(activeStage) && openStages.has(activeStage) && (
            <p className={cn(ui.label, "text-app-amber")}>Vista previa · solo admin</p>
          )}
```
with:
```tsx
          <StageTabs activeStage={activeTab} enabledStages={openStages} onChange={handleStageChange} />
          {!tabStages(activeTab).some((stage) => editableStages.has(stage)) &&
            tabStages(activeTab).some((stage) => openStages.has(stage)) && (
            <p className={cn(ui.label, "text-app-amber")}>Vista previa · solo admin</p>
          )}
```

Replace the two remaining `activeStage === "groups"` occurrences at `src/screens/predictions.tsx:204` and `:226` with `activeTab === "groups"`:
```tsx
              {activeStage === "groups" && (
```
→
```tsx
              {activeTab === "groups" && (
```
and
```tsx
          {activeStage === "groups"
```
→
```tsx
          {activeTab === "groups"
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors in `predictions.tsx` (remaining errors, if any, are only in `results.tsx` / `leaderboard.tsx`, fixed in Tasks 5–6). Confirm `Stage` is still imported/used elsewhere in the file (it is — `match.stage` typing, drawer props); do not remove the `Stage` type import.

- [ ] **Step 8: Commit**

```bash
git add src/screens/predictions.tsx
git commit -m "feat(pronosticos): merge final and third into one stage tab"
```

---

### Task 5: Resultados screen uses the tab layer

**Files:**
- Modify: `src/screens/results.tsx` (imports 17-18; `getPreferredStage` 47-54; `handleStageChange` 56-60; fallback effect 64-69; `stageMatches` 76-82; `isGroups` 89; `StageTabs` 94)

**Interfaces:**
- Consumes: `resolveStageTab`, `stageToTab`, `tabStages`, `StageTabId`, existing `stageOrder`; `getDefaultResultStage` (returns `Stage`, unchanged); `StageTabs` from Task 2.
- Produces: no new exports.

- [ ] **Step 1: Update imports**

In `src/screens/results.tsx:10-19`, remove `isStage,` from the `@/lib/tournament` import and add the tab helpers + type; keep `stageOrder` (still used):
```ts
import {
  formatKickoff,
  getGroupStatus,
  getMatchStatus,
  getTeamFlag,
  getTeamLabel,
  isGroupProvisional,
  resolveStageTab,
  stageOrder,
  stageToTab,
  tabStages,
} from "@/lib/tournament";
import type { StageTabId } from "@/lib/tournament";
```

- [ ] **Step 2: Convert the preferred-stage helper to return a tab**

Replace `src/screens/results.tsx:47-54`:
```ts
  const getPreferredStage = () => {
    const preferred = getDefaultResultStage(matches, groups, now);
    if (resultsStages.has(preferred)) return preferred;
    return stageOrder.find((stage) => resultsStages.has(stage)) ?? preferred;
  }

  const stageParam = searchParams.get("stage");
  const activeStage: Stage = stageParam !== null && isStage(stageParam) ? stageParam : getPreferredStage();
```
with:
```ts
  const getPreferredTab = (): StageTabId => {
    const preferred = getDefaultResultStage(matches, groups, now);
    if (resultsStages.has(preferred)) return stageToTab(preferred);
    return stageToTab(stageOrder.find((stage) => resultsStages.has(stage)) ?? preferred);
  }

  const stageParam = searchParams.get("stage");
  const activeTab: StageTabId = resolveStageTab(stageParam) ?? getPreferredTab();
```

- [ ] **Step 3: Update handleStageChange**

Replace `src/screens/results.tsx:56-60`:
```ts
  const handleStageChange = (newStage: Stage) => {
    const params = new URLSearchParams(searchParams);
    params.set("stage", newStage);
    router.replace(`${pathname}?${params.toString()}`);
  }
```
with:
```ts
  const handleStageChange = (newTab: StageTabId) => {
    const params = new URLSearchParams(searchParams);
    params.set("stage", newTab);
    router.replace(`${pathname}?${params.toString()}`);
  }
```

- [ ] **Step 4: Update the revealed-stage fallback effect**

Replace `src/screens/results.tsx:64-69`:
```ts
  useEffect(() => {
    if (resultsStages.size > 0 && !resultsStages.has(activeStage)) {
      const fallback = stageOrder.find((stage) => resultsStages.has(stage));
      if (fallback) handleStageChange(fallback);
    }
  }, [resultsStages, activeStage]);
```
with:
```ts
  useEffect(() => {
    if (resultsStages.size > 0 && !tabStages(activeTab).some((stage) => resultsStages.has(stage))) {
      const fallback = stageOrder.find((stage) => resultsStages.has(stage));
      if (fallback) handleStageChange(stageToTab(fallback));
    }
  }, [resultsStages, activeTab]);
```

- [ ] **Step 5: Update the match filter and isGroups**

Replace `src/screens/results.tsx:76-82`:
```ts
  const stageMatches = useMemo(
    () =>
      matches
        .filter((match) => match.stage === activeStage)
        .sort((a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime()),
    [matches, activeStage],
  );
```
with:
```ts
  const stageMatches = useMemo(
    () => {
      const stages = tabStages(activeTab);
      return matches
        .filter((match) => stages.includes(match.stage))
        .sort((a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime());
    },
    [matches, activeTab],
  );
```

Replace `src/screens/results.tsx:89`:
```ts
  const isGroups = activeStage === "groups";
```
with:
```ts
  const isGroups = activeTab === "groups";
```

- [ ] **Step 6: Update the StageTabs usage**

Replace `src/screens/results.tsx:94`:
```tsx
      <StageTabs activeStage={activeStage} enabledStages={resultsStages} onChange={handleStageChange} />
```
with:
```tsx
      <StageTabs activeStage={activeTab} enabledStages={resultsStages} onChange={handleStageChange} />
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors in `results.tsx`. If `Stage` is now an unused import in this file, remove it from the `@/lib/types` import to satisfy lint; if still used, leave it. (Verify with `grep -n "Stage\b" src/screens/results.tsx`.)

- [ ] **Step 8: Commit**

```bash
git add src/screens/results.tsx
git commit -m "feat(resultados): merge final and third into one stage tab"
```

---

### Task 6: Tabla (leaderboard) screen uses the tab layer

**Files:**
- Modify: `src/screens/leaderboard.tsx` (imports 21, 27; `StandingsView` 29; `view` 36-37; `handleViewChange` 39-43; fallback effect 50-54; `getStageLeaderboard` call 60)

**Interfaces:**
- Consumes: `resolveStageTab`, `tabStages`, `StageTabId`, `isStageTab` from Task 1; `getStageLeaderboard(tab, …)` from Task 3; `StageTabs` from Task 2.
- Produces: no new exports.

- [ ] **Step 1: Update imports and the view type**

Change `src/screens/leaderboard.tsx:27`:
```ts
import { isStage } from "@/lib/tournament";
```
to:
```ts
import { resolveStageTab, tabStages } from "@/lib/tournament";
import type { StageTabId } from "@/lib/tournament";
```

Change `src/screens/leaderboard.tsx:29`:
```ts
type StandingsView = "overall" | Stage;
```
to:
```ts
type StandingsView = "overall" | StageTabId;
```
(The `Stage` type import at line 21 may now be unused — remove it from the `@/lib/types` import if `grep -n "Stage\b" src/screens/leaderboard.tsx` shows no other use.)

- [ ] **Step 2: Resolve the view from the URL param**

Replace `src/screens/leaderboard.tsx:36-37`:
```ts
  const stageParam = searchParams.get("view");
  const view: StandingsView = stageParam !== null && isStage(stageParam) ? stageParam : "overall";
```
with:
```ts
  const stageParam = searchParams.get("view");
  const view: StandingsView = resolveStageTab(stageParam) ?? "overall";
```

- [ ] **Step 3: Update handleViewChange type**

Change `src/screens/leaderboard.tsx:39`:
```ts
  const handleViewChange = (newView: StandingsView) => {
```
This already accepts `StandingsView`, which now includes `StageTabId` — no body change needed. Confirm the parameter type reads `StandingsView`.

- [ ] **Step 4: Update the revealed-stage fallback effect**

Replace `src/screens/leaderboard.tsx:50-54`:
```ts
  useEffect(() => {
    if (view !== "overall" && !standingsStages.has(view)) {
      handleViewChange("overall");
    }
  }, [view, standingsStages]);
```
with:
```ts
  useEffect(() => {
    if (view !== "overall" && !tabStages(view).some((stage) => standingsStages.has(stage))) {
      handleViewChange("overall");
    }
  }, [view, standingsStages]);
```

- [ ] **Step 5: Confirm the getStageLeaderboard call**

`src/screens/leaderboard.tsx:60` already reads:
```ts
    return getStageLeaderboard(view, { predictions, profiles, groupPredictions, matches, groups, includeProvisional: preview });
```
Inside this branch `view !== "overall"`, so `view` is a `StageTabId` — matching Task 3's signature. No change required; just verify it typechecks.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: Clean — no errors anywhere.

- [ ] **Step 7: Commit**

```bash
git add src/screens/leaderboard.tsx
git commit -m "feat(tabla): merge final and third into one standings tab"
```

---

### Task 7: Whole-app verification and Novedades decision

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: PASS — all suites green.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: No type errors; lint clean (no unused `Stage`/`isStage`/`stageOrder` imports left behind — remove any the linter flags).

- [ ] **Step 3: Manual verification with the run/verify skill**

Use the `verify` skill (or `run` skill) to launch the app and confirm, on all three screens (pronósticos, resultados, tabla):
- The stage-tab bar shows a single **"Final y 3er puesto"** tab in place of the former "3er puesto" and "Final" tabs (both desktop `Tabs` and mobile `Select`).
- Selecting that tab shows both the 3rd-place and final matches, each with its own `StageBadge`, sorted 3er-puesto then Final.
- Visiting a legacy URL `?stage=final` (pronósticos/resultados) and `?view=third` (tabla) lands on the merged tab.
- In tabla, the merged tab's standings sum points from both matches.

Report the observed results (do not claim success without running it).

- [ ] **Step 4: Novedades decision**

Per `CLAUDE.md`, ask the user whether to add a Novedades entry (`src/components/novedades-modal.tsx`) for the unified tab. If yes, follow that file's existing entry pattern and commit separately.

---

## Self-Review

**Spec coverage:**
- Tab model + label + helpers + legacy resolution → Task 1. ✓
- `StageTabs` renders merged tabs everywhere → Task 2. ✓
- Pronósticos / Resultados / Tabla consume the layer → Tasks 4, 5, 6. ✓
- `getStageLeaderboard` aggregates merged stages → Task 3. ✓
- Tests for helpers + merged filtering/aggregation → Tasks 1, 3. ✓
- `Stage`/scoring/sync/admin/DB/`StageBadge` untouched → enforced by Global Constraints; no task modifies them. ✓
- `results.ts` keeps returning `Stage`; `results.test.ts` unchanged → noted in File Structure. ✓
- Behavior (both cards, own badges, kickoff order) → Task 7 Step 3. ✓
- Novedades prompt → Task 7 Step 4. ✓

**Placeholder scan:** No TBD/TODO; every code step shows exact before/after. ✓

**Type consistency:** `StageTabId`, `stageTabs`, `stageToTab`, `tabStages`, `isStageTab`, `resolveStageTab` are named identically across Tasks 1–6. `getStageLeaderboard(tab: StageTabId, …)` matches its Task 6 call site. `handleStageChange`/`handleViewChange` params are `StageTabId`/`StandingsView`, matching `StageTabs<T>`'s `onChange: (stage: T) => void`. ✓
