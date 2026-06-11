# Resultados Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Resultados screen so results are browsed one stage at a time, and each finalized match/group shows a collapsible comparison of every family member's prediction against the official outcome.

**Architecture:** Extract three pure, unit-tested helpers into a new `src/lib/results.ts` (stage-content detection, default-stage selection, comparison sorting). Then rewrite the presentational `src/screens/results.tsx` to use `StageTabs` for stage selection and render `ResultMatchCard` / `ResultGroupCard`, each with a collapsed-by-default comparison list. All data comes from the existing `useApp()` context — no backend, schema, scoring, or context changes.

**Tech Stack:** Next.js (App Router) + React client components, TypeScript, Tailwind, Vitest, base-ui, lucide-react.

Design spec: `docs/superpowers/specs/2026-06-09-resultados-redesign-design.md`.

---

## File Structure

- **Create** `src/lib/results.ts` — pure helpers: `getStagesWithContent`, `getDefaultResultStage`, `sortComparison`.
- **Create** `src/lib/results.test.ts` — unit tests for the three helpers.
- **Rewrite** `src/screens/results.tsx` — `ResultsScreen` (stage state + tabs + header) plus presentational components `ResultMatchCard`, `ResultGroupCard`, `Collapsible`, `PredictionComparisonRow`, `GroupComparisonRow`, `PointsPill`, and the retained `TeamResult` helper.
- **Unchanged** `src/app/resultados/page.tsx` — keeps rendering `<ResultsScreen />`.

Conventions to follow (already used in the codebase): `"use client"` at top of screen/component files; `cn(...)` for class merging; `ui` tokens from `@/lib/ui-tokens`; helpers from `@/lib/tournament`; tests use `vitest` (`describe/it/expect`).

---

## Task 1: `getStagesWithContent` helper

**Files:**
- Create: `src/lib/results.ts`
- Test: `src/lib/results.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/results.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Group, Match } from "./types";
import { getStagesWithContent } from "./results";

const baseMatch: Match = {
  id: "m1",
  matchNo: 1,
  stage: "round16",
  homeTeamId: "arg",
  awayTeamId: "mex",
  kickoffUtc: "2026-07-01T18:00:00.000Z",
  homeScore: null,
  awayScore: null,
  winnerTeamId: null,
  finalizedAt: null,
  finalizedBy: null,
  updatedAt: null,
  updatedBy: null,
};

const baseGroup: Group = {
  groupLabel: "A",
  locksAt: null,
  firstTeamId: null,
  secondTeamId: null,
  thirdTeamId: null,
  fourthTeamId: null,
  resultFinalizedAt: null,
  resultFinalizedBy: null,
};

describe("getStagesWithContent", () => {
  it("marks a stage with at least one match", () => {
    const set = getStagesWithContent([baseMatch], []);
    expect(set.has("round16")).toBe(true);
    expect(set.has("final")).toBe(false);
  });

  it("marks groups when at least one group exists", () => {
    expect(getStagesWithContent([], [baseGroup]).has("groups")).toBe(true);
    expect(getStagesWithContent([], []).has("groups")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- results`
Expected: FAIL — cannot resolve `./results` / `getStagesWithContent` is not defined.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/results.ts`:

```ts
import type { Group, Match, Stage } from "./types";

export function getStagesWithContent(matches: Match[], groups: Group[]): Set<Stage> {
  const set = new Set<Stage>();
  for (const match of matches) {
    set.add(match.stage);
  }
  if (groups.length > 0) {
    set.add("groups");
  }
  return set;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- results`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/results.ts src/lib/results.test.ts
git commit -m "feat(results): detect stages with content"
```

---

## Task 2: `getDefaultResultStage` helper

**Files:**
- Modify: `src/lib/results.ts`
- Test: `src/lib/results.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/results.test.ts` (add `getDefaultResultStage` to the existing import from `./results`):

```ts
describe("getDefaultResultStage", () => {
  const now = new Date("2026-07-05T00:00:00.000Z");

  it("returns the latest stage that has a finalized match", () => {
    const finalizedRound16: Match = {
      ...baseMatch,
      id: "m-r16",
      stage: "round16",
      kickoffUtc: "2026-07-01T18:00:00.000Z",
      homeScore: 2,
      awayScore: 1,
      finalizedAt: "2026-07-01T20:00:00.000Z",
    };
    const openQuarter: Match = {
      ...baseMatch,
      id: "m-qf",
      stage: "quarter",
      kickoffUtc: "2026-07-10T18:00:00.000Z",
    };
    expect(getDefaultResultStage([finalizedRound16, openQuarter], [], now)).toBe("round16");
  });

  it("treats a finalized group as finalized 'groups' content", () => {
    const finalizedGroup: Group = { ...baseGroup, resultFinalizedAt: "2026-06-28T00:00:00.000Z" };
    expect(getDefaultResultStage([], [finalizedGroup], now)).toBe("groups");
  });

  it("falls back to the first stage with content when nothing is finalized", () => {
    const openQuarter: Match = {
      ...baseMatch,
      id: "m-qf",
      stage: "quarter",
      kickoffUtc: "2026-07-10T18:00:00.000Z",
    };
    expect(getDefaultResultStage([openQuarter], [], now)).toBe("quarter");
  });

  it("falls back to 'groups' when there is no content at all", () => {
    expect(getDefaultResultStage([], [], now)).toBe("groups");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- results`
Expected: FAIL — `getDefaultResultStage` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `src/lib/results.ts` (update the type import to include `Stage` already present; add the tournament import):

```ts
import { getMatchStatus, stageOrder } from "./tournament";

export function getDefaultResultStage(matches: Match[], groups: Group[], now: Date): Stage {
  const finalizedStages = new Set<Stage>();
  for (const match of matches) {
    if (getMatchStatus(match, now) === "finalized") {
      finalizedStages.add(match.stage);
    }
  }
  if (groups.some((group) => group.resultFinalizedAt)) {
    finalizedStages.add("groups");
  }

  for (let i = stageOrder.length - 1; i >= 0; i -= 1) {
    if (finalizedStages.has(stageOrder[i])) {
      return stageOrder[i];
    }
  }

  const content = getStagesWithContent(matches, groups);
  for (const stage of stageOrder) {
    if (content.has(stage)) {
      return stage;
    }
  }

  return "groups";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- results`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/results.ts src/lib/results.test.ts
git commit -m "feat(results): pick default stage by latest finalized content"
```

---

## Task 3: `sortComparison` helper

**Files:**
- Modify: `src/lib/results.ts`
- Test: `src/lib/results.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/results.test.ts` (add `sortComparison` to the `./results` import, and import `Profile`/`Prediction` types):

```ts
import type { Prediction, Profile } from "./types";

const profile = (id: string, displayName: string): Profile => ({
  id,
  displayName,
  email: `${id}@example.com`,
  approved: true,
  role: "user",
});

const matchPrediction = (
  userId: string,
  points: number,
  exactHit: boolean,
): Prediction => ({
  id: `p-${userId}`,
  userId,
  matchId: "m1",
  homeScore: 1,
  awayScore: 0,
  winnerTeamId: null,
  points,
  exactHit,
  outcomeHit: points > 0,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
});

const matchOptions = {
  userIdOf: (p: Prediction) => p.userId,
  pointsOf: (p: Prediction) => p.points ?? 0,
  exactOf: (p: Prediction) => (p.exactHit ? 1 : 0),
};

describe("sortComparison", () => {
  const ana = profile("u-ana", "Ana");
  const beto = profile("u-beto", "Beto");
  const caro = profile("u-caro", "Caro");

  it("sorts finalized entries by points desc, then name, with missing last", () => {
    const entries = sortComparison(
      [ana, beto, caro],
      [matchPrediction("u-ana", 1, false), matchPrediction("u-beto", 3, true)],
      { ...matchOptions, finalized: true },
    );
    expect(entries.map((entry) => entry.profile.id)).toEqual(["u-beto", "u-ana", "u-caro"]);
    expect(entries[2].prediction).toBeUndefined();
  });

  it("sorts locked entries alphabetically with missing last", () => {
    const entries = sortComparison(
      [caro, ana, beto],
      [matchPrediction("u-caro", 0, false), matchPrediction("u-ana", 0, false)],
      { ...matchOptions, finalized: false },
    );
    expect(entries.map((entry) => entry.profile.id)).toEqual(["u-ana", "u-caro", "u-beto"]);
  });

  it("breaks finalized point ties by exact count, then name", () => {
    const entries = sortComparison(
      [ana, beto],
      [matchPrediction("u-beto", 3, false), matchPrediction("u-ana", 3, true)],
      { ...matchOptions, finalized: true },
    );
    expect(entries.map((entry) => entry.profile.id)).toEqual(["u-ana", "u-beto"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- results`
Expected: FAIL — `sortComparison` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `src/lib/results.ts` (add `Profile` to the existing type import):

```ts
export type ComparisonEntry<P> = { profile: Profile; prediction: P | undefined };

export function sortComparison<P>(
  profiles: Profile[],
  predictions: P[],
  options: {
    userIdOf: (prediction: P) => string;
    pointsOf: (prediction: P) => number;
    exactOf: (prediction: P) => number;
    finalized: boolean;
  },
): ComparisonEntry<P>[] {
  const byUser = new Map(predictions.map((prediction) => [options.userIdOf(prediction), prediction]));
  const entries: ComparisonEntry<P>[] = profiles.map((profile) => ({
    profile,
    prediction: byUser.get(profile.id),
  }));

  return entries.sort((a, b) => {
    const aHas = a.prediction !== undefined;
    const bHas = b.prediction !== undefined;
    if (aHas !== bHas) {
      return aHas ? -1 : 1;
    }
    if (aHas && bHas && options.finalized) {
      const pointsDiff = options.pointsOf(b.prediction as P) - options.pointsOf(a.prediction as P);
      if (pointsDiff !== 0) {
        return pointsDiff;
      }
      const exactDiff = options.exactOf(b.prediction as P) - options.exactOf(a.prediction as P);
      if (exactDiff !== 0) {
        return exactDiff;
      }
    }
    return a.profile.displayName.localeCompare(b.profile.displayName, "es");
  });
}
```

Also update the type import line at the top of `src/lib/results.ts` to:

```ts
import type { Group, Match, Profile, Stage } from "./types";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- results`
Expected: PASS (all Task 1–3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/results.ts src/lib/results.test.ts
git commit -m "feat(results): sort prediction comparisons"
```

---

## Task 4: Rewrite the Resultados screen

**Files:**
- Modify (full rewrite): `src/screens/results.tsx`

This task replaces the entire file. It uses the helpers from Tasks 1–3 and existing components/tokens. There is no unit test (presentational component); verification is Task 5.

- [ ] **Step 1: Replace `src/screens/results.tsx` with the full implementation**

```tsx
"use client";

import { CalendarClock, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  formatKickoff,
  getGroupStatus,
  getMatchStatus,
  getTeamFlag,
  getTeamLabel,
  stageLabels,
  stageOrder,
} from "@/lib/tournament";
import {
  getDefaultResultStage,
  getStagesWithContent,
  sortComparison,
} from "@/lib/results";
import type {
  Group,
  GroupPrediction,
  Match,
  Prediction,
  Profile,
  Stage,
  StageState,
  Team,
} from "@/lib/types";
import { compareGroups, ui } from "@/lib/ui-tokens";
import { cn } from "@/lib/utils";

import { useApp } from "@/components/app-context";
import { StageBadge, StageTabs, StatusChip } from "@/components/badges";

export function ResultsScreen() {
  const { matches, predictions, groups, groupPredictions, profiles, teams, now, currentUser } = useApp();

  const stageContent = useMemo(() => getStagesWithContent(matches, groups), [matches, groups]);
  const [activeStage, setActiveStage] = useState<Stage>(() => getDefaultResultStage(matches, groups, now));

  const stageTabsState: StageState[] = useMemo(
    () =>
      stageOrder.map((stage) => ({
        stage,
        label: stageLabels[stage],
        open: stageContent.has(stage),
      })),
    [stageContent],
  );

  const approvedProfiles = useMemo(
    () => profiles.filter((profile) => profile.approved),
    [profiles],
  );

  const stageMatches = useMemo(
    () =>
      matches
        .filter((match) => match.stage === activeStage)
        .sort((a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime()),
    [matches, activeStage],
  );

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => compareGroups(a.groupLabel, b.groupLabel)),
    [groups],
  );

  const isGroups = activeStage === "groups";
  const count = isGroups ? sortedGroups.length : stageMatches.length;

  return (
    <section className="grid gap-3.5">
      <StageTabs activeStage={activeStage} stages={stageTabsState} onChange={setActiveStage} />

      <div className={cn(ui.panel, "flex items-end justify-between gap-3 p-4 max-lg:flex-col max-lg:items-start")}>
        <div>
          <p className={ui.label}>Fixture y marcadores</p>
          <h2 className="mt-1 text-3xl font-black leading-none">Resultados</h2>
        </div>
        <span className="text-sm font-black text-app-muted">
          {count} {isGroups ? "grupos" : "partidos"}
        </span>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {isGroups
          ? sortedGroups.map((group) => (
              <ResultGroupCard
                key={group.groupLabel}
                group={group}
                teams={teams}
                now={now}
                approvedProfiles={approvedProfiles}
                groupPredictions={groupPredictions.filter((prediction) => prediction.groupLabel === group.groupLabel)}
                currentUserId={currentUser.id}
              />
            ))
          : stageMatches.map((match) => (
              <ResultMatchCard
                key={match.id}
                match={match}
                teams={teams}
                now={now}
                approvedProfiles={approvedProfiles}
                predictions={predictions.filter((prediction) => prediction.matchId === match.id)}
                currentUserId={currentUser.id}
              />
            ))}
      </div>

      {count === 0 && (
        <p className="rounded-lg border border-app-line bg-app-surface-2 px-4 py-6 text-center text-sm font-bold text-app-muted">
          No hay {isGroups ? "grupos" : "partidos"} en esta etapa.
        </p>
      )}
    </section>
  );
}

function ResultMatchCard({
  match,
  teams,
  now,
  approvedProfiles,
  predictions,
  currentUserId,
}: {
  match: Match;
  teams: Team[];
  now: Date;
  approvedProfiles: Profile[];
  predictions: Prediction[];
  currentUserId: string;
}) {
  const status = getMatchStatus(match, now);
  const finalized = status === "finalized" && match.homeScore !== null && match.awayScore !== null;
  const homeLabel = getTeamLabel(match.homeTeamId, teams, match.homeSeed);
  const awayLabel = getTeamLabel(match.awayTeamId, teams, match.awaySeed);

  const entries = useMemo(
    () =>
      sortComparison(approvedProfiles, predictions, {
        userIdOf: (prediction) => prediction.userId,
        pointsOf: (prediction) => prediction.points ?? 0,
        exactOf: (prediction) => (prediction.exactHit ? 1 : 0),
        finalized,
      }),
    [approvedProfiles, predictions, finalized],
  );

  const submitted = entries.filter((entry) => entry.prediction).length;
  const exactCount = entries.filter((entry) => entry.prediction?.exactHit).length;

  return (
    <Card className={cn(
      ui.panel,
      "grid gap-3.5 p-3.5",
      status === "locked" && "border-app-amber/45",
      status === "finalized" && "border-app-green/45",
    )}>
      <header className="flex items-center justify-between gap-3">
        <StageBadge stage={match.stage} group={match.group} />
        <StatusChip
          status={status}
          label={finalized ? "Finalizado" : status === "locked" ? "Cerrado" : "Abierto"}
        />
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 max-md:grid-cols-1">
        <TeamResult teamId={match.homeTeamId} seed={match.homeSeed} label={homeLabel} teams={teams} />
        {finalized ? (
          <strong className="min-w-24 rounded-lg border border-app-green/25 bg-app-green/10 px-3 py-2.5 text-center text-2xl font-black leading-none text-app-green">
            {match.homeScore}-{match.awayScore}
          </strong>
        ) : (
          <span className={cn(
            "inline-flex min-h-10 min-w-24 items-center justify-center rounded-lg border border-app-line bg-app-surface-2 px-3 text-center text-xs font-black uppercase text-app-muted",
            status === "open" && "min-w-11 border-transparent bg-transparent text-sm",
            status === "locked" && "border-app-amber/30 bg-app-amber/10 text-app-amber",
          )}>
            {status === "locked" ? "Resultado pendiente" : "vs"}
          </span>
        )}
        <TeamResult teamId={match.awayTeamId} seed={match.awaySeed} label={awayLabel} teams={teams} align="right" />
      </div>

      {status === "open" ? (
        <footer className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 border-t border-app-line pt-3 text-xs font-extrabold text-app-muted max-md:grid-cols-1">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <CalendarClock size={14} />
            <span className="truncate">{formatKickoff(match.kickoffUtc)}</span>
          </span>
          <span className="min-w-0 truncate">{match.city ?? "Sede por definir"}</span>
        </footer>
      ) : (
        <Collapsible
          summary={
            finalized
              ? `${submitted} de ${approvedProfiles.length} · ${exactCount} exactos`
              : `${submitted} de ${approvedProfiles.length} cargados`
          }
        >
          {entries.map((entry) => (
            <PredictionComparisonRow
              key={entry.profile.id}
              profile={entry.profile}
              prediction={entry.prediction}
              teams={teams}
              showPoints={finalized}
              isCurrentUser={entry.profile.id === currentUserId}
            />
          ))}
        </Collapsible>
      )}
    </Card>
  );
}

function ResultGroupCard({
  group,
  teams,
  now,
  approvedProfiles,
  groupPredictions,
  currentUserId,
}: {
  group: Group;
  teams: Team[];
  now: Date;
  approvedProfiles: Profile[];
  groupPredictions: GroupPrediction[];
  currentUserId: string;
}) {
  const status = getGroupStatus(group, now);
  const finalized = status === "finalized";
  const order = [group.firstTeamId, group.secondTeamId, group.thirdTeamId, group.fourthTeamId];

  const entries = useMemo(
    () =>
      sortComparison(approvedProfiles, groupPredictions, {
        userIdOf: (prediction) => prediction.userId,
        pointsOf: (prediction) => prediction.points ?? 0,
        exactOf: (prediction) => prediction.exactPositions,
        finalized,
      }),
    [approvedProfiles, groupPredictions, finalized],
  );

  const submitted = entries.filter((entry) => entry.prediction).length;

  return (
    <Card className={cn(
      ui.panel,
      "grid gap-3 p-3.5",
      status === "locked" && "border-app-amber/45",
      finalized && "border-app-green/45",
    )}>
      <header className="flex items-center justify-between gap-3">
        <StageBadge stage="groups" group={group.groupLabel} />
        <StatusChip
          status={status}
          label={finalized ? "Finalizado" : status === "locked" ? "Cerrado" : "Abierto"}
        />
      </header>

      {finalized ? (
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
      ) : (
        <p className="rounded-md bg-app-surface-2 px-2.5 py-3 text-center text-sm font-bold text-app-muted">
          Resultado pendiente
        </p>
      )}

      {status !== "open" && (
        <Collapsible summary={`${submitted} de ${approvedProfiles.length} cargados`}>
          {entries.map((entry) => (
            <GroupComparisonRow
              key={entry.profile.id}
              profile={entry.profile}
              prediction={entry.prediction}
              teams={teams}
              showPoints={finalized}
              isCurrentUser={entry.profile.id === currentUserId}
            />
          ))}
        </Collapsible>
      )}
    </Card>
  );
}

function Collapsible({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-app-line pt-3">
      <Button
        variant="ghost"
        size="sm"
        className="flex h-auto w-full items-center justify-between gap-3 p-0 text-xs font-extrabold text-app-blue hover:bg-transparent"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="inline-flex items-center gap-1.5">
          <ChevronDown size={15} className={cn("transition-transform", !open && "-rotate-90")} />
          {open ? "Ocultar pronósticos" : "Ver pronósticos"}
        </span>
        <span className="font-extrabold text-app-muted">{summary}</span>
      </Button>
      {open && <div className="mt-2 grid gap-1.5">{children}</div>}
    </div>
  );
}

function PredictionComparisonRow({
  profile,
  prediction,
  teams,
  showPoints,
  isCurrentUser,
}: {
  profile: Profile;
  prediction?: Prediction;
  teams: Team[];
  showPoints: boolean;
  isCurrentUser: boolean;
}) {
  return (
    <div className={cn(
      "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 rounded-md bg-app-surface-2 px-2.5 py-2",
      isCurrentUser && "outline outline-1 outline-app-brand",
    )}>
      <strong className="truncate text-sm font-black">
        {profile.displayName}{isCurrentUser ? " (vos)" : ""}
      </strong>
      {prediction ? (
        <span className="inline-flex items-center gap-2">
          <span className="text-sm font-bold tabular-nums">
            {prediction.homeScore}-{prediction.awayScore}
            {prediction.winnerTeamId ? ` · ${getTeamLabel(prediction.winnerTeamId, teams)}` : ""}
          </span>
          {showPoints && <PointsPill points={prediction.points ?? 0} />}
        </span>
      ) : (
        <span className="text-sm font-bold text-app-muted">Sin pronóstico</span>
      )}
    </div>
  );
}

function GroupComparisonRow({
  profile,
  prediction,
  teams,
  showPoints,
  isCurrentUser,
}: {
  profile: Profile;
  prediction?: GroupPrediction;
  teams: Team[];
  showPoints: boolean;
  isCurrentUser: boolean;
}) {
  const shortName = (teamId: string) =>
    teams.find((team) => team.id === teamId)?.shortName ?? getTeamLabel(teamId, teams);

  return (
    <div className={cn(
      "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 rounded-md bg-app-surface-2 px-2.5 py-2",
      isCurrentUser && "outline outline-1 outline-app-brand",
    )}>
      <strong className="truncate text-sm font-black">
        {profile.displayName}{isCurrentUser ? " (vos)" : ""}
      </strong>
      {prediction ? (
        <span className="inline-flex items-center gap-2">
          <span className="truncate text-xs font-bold text-app-muted">
            {[prediction.firstTeamId, prediction.secondTeamId, prediction.thirdTeamId, prediction.fourthTeamId]
              .map(shortName)
              .join(" · ")}
          </span>
          {showPoints && (
            <span className="inline-flex items-center gap-1">
              <PointsPill points={prediction.points ?? 0} />
              <span className="text-xs font-black text-app-muted">{prediction.exactPositions}/4</span>
            </span>
          )}
        </span>
      ) : (
        <span className="text-sm font-bold text-app-muted">Sin pronóstico</span>
      )}
    </div>
  );
}

function PointsPill({ points }: { points: number }) {
  return (
    <span className={cn(
      "min-w-10 rounded-full px-2 py-0.5 text-center text-xs font-black",
      points >= 3
        ? "bg-app-green/15 text-app-green"
        : points >= 1
          ? "bg-app-amber/15 text-app-amber"
          : "bg-app-surface text-app-muted",
    )}>
      +{points}
    </span>
  );
}

function TeamResult({
  teamId,
  seed,
  label,
  teams,
  align = "left",
}: {
  teamId: string | null;
  seed?: string;
  label: string;
  teams: Team[];
  align?: "left" | "right";
}) {
  return (
    <div className={cn(
      "grid min-w-0 items-center gap-x-2",
      align === "right"
        ? "grid-cols-[minmax(0,1fr)_36px] text-right max-md:grid-cols-[36px_minmax(0,1fr)] max-md:text-left"
        : "grid-cols-[36px_minmax(0,1fr)]",
    )}>
      <span className={cn(
        "row-span-2 grid size-9 place-items-center rounded-md border border-app-line bg-app-surface-2 text-lg",
        align === "right" && "col-start-2 max-md:col-start-1",
      )}>{getTeamFlag(teamId, teams)}</span>
      <strong className={cn(
        "truncate font-black",
        align === "right" && "col-start-1 max-md:col-start-2",
      )}>{label}</strong>
      <small className={cn(
        "truncate text-xs font-bold text-app-muted",
        align === "right" ? "col-start-1 max-md:col-start-2" : "col-start-2",
      )}>{teamId ? teams.find((team) => team.id === teamId)?.shortName : seed}</small>
    </div>
  );
}
```

- [ ] **Step 2: Type-check / lint the screen**

Run: `npm run lint`
Expected: PASS (no errors). If lint flags unused imports, remove only the genuinely unused ones — every import above is used.

- [ ] **Step 3: Commit**

```bash
git add src/screens/results.tsx
git commit -m "feat(results): stage-scoped results with collapsible comparison"
```

---

## Task 5: Verify the full feature

**Files:** none (verification only).

- [ ] **Step 1: Run the unit suite**

Run: `npm test`
Expected: PASS — all existing tests plus the new `src/lib/results.test.ts` (9 tests across Tasks 1–3).

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS, no warnings on `src/screens/results.tsx` or `src/lib/results.ts`.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: Build succeeds; `/resultados` compiles with no type errors.

- [ ] **Step 4: Manual verification (dev server)**

Run: `npm run dev`, open `/resultados`, and confirm:
- Stage tabs render; only stages with content are enabled; the default tab is the latest stage with a finalized result (or first stage with content / `groups`).
- Switching tabs swaps between match cards and (on `groups`) group cards; the header count updates ("N partidos" / "N grupos").
- **Open** match: shows kickoff + city, no "Ver pronósticos" toggle.
- **Locked** match: shows "Resultado pendiente" and a collapsible list (collapsed by default) revealing picks with NO points pills; summary reads "X de Y cargados".
- **Finalized** match: shows green score; expanded list shows picks with `+3 / +1 / +0` pills; summary reads "X de Y · Z exactos".
- In every list: rows sorted (points desc when finalized, alphabetical when locked), `Sin pronóstico` users at the bottom, current user row labeled "(vos)" and outlined.
- **Groups** tab: finalized group shows the 1°–4° order; collapsible list shows each person's predicted order joined by " · " with points pill + `N/4` when finalized.
- Empty stage (if any) shows the "No hay … en esta etapa." message.

- [ ] **Step 5: Final commit (if any manual fixups were needed)**

```bash
git add -A
git commit -m "test(results): verify resultados redesign"
```

(If no fixups were required, skip this commit.)

---

## Self-Review Notes

- **Spec coverage:** stage selection (Task 4 `StageTabs` + Tasks 1–2 helpers); compare-everyone-vs-outcome (Task 4 `Collapsible` + comparison rows + Task 3 sort); all-matches-in-stage with open/locked/finalized behavior (Task 4 `ResultMatchCard` status branches); locked reveals picks without points (Task 4, `showPoints={finalized}`); groups same collapsible treatment (Task 4 `ResultGroupCard`); collapsed-by-default (Task 4 `Collapsible` `useState(false)`); sort + current-user highlight (Task 3 + row `isCurrentUser`); no backend/scoring changes (only `src/lib/results.ts` + `src/screens/results.tsx` touched).
- **Type consistency:** `sortComparison` options (`userIdOf`/`pointsOf`/`exactOf`/`finalized`) and `ComparisonEntry<P>` are used identically in Tasks 3 and 4; `getStagesWithContent`/`getDefaultResultStage` signatures match between definition (Tasks 1–2) and call sites (Task 4).
- **No placeholders:** every code step contains complete code; no TBD/TODO.
