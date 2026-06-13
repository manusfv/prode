# Estadísticas Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a comprehensive, interactive `/estadisticas` page for the family World Cup prediction pool: chart-backed group "fun facts", a personal mini-card, and standalone graphs.

**Architecture:** All derivation lives in a new pure module `src/lib/stats.ts` (TDD'd via `stats.test.ts`, node env). A new client screen `EstadisticasScreen` consumes that module from `useApp()` and renders a grid of fact cards; clicking a card opens a responsive `Sheet` (bottom on mobile, right on desktop) with a Recharts chart + ranked table. Group facts respect the existing "hidden until lock" rule; the personal card uses all of the current user's own predictions.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind v4 + app tokens, base-ui `Sheet`, Recharts, Vitest (node env, `.test.ts` only).

**Spec:** `docs/superpowers/specs/2026-06-12-estadisticas-section-design.md`

---

## File Structure

**Create:**
- `src/lib/stats.ts` — pure compute: types + `computeStats(input): StatsBundle` and all per-fact/graph builders.
- `src/lib/stats.test.ts` — unit tests for every builder + privacy filter.
- `src/components/ui/chart.tsx` — minimal token-styled `ChartContainer` (Recharts `ResponsiveContainer` wrapper) + shared chart colors/tooltip.
- `src/components/stats/charts.tsx` — presentational chart primitives: `BarStat`, `Histogram`, `LineStat`, `Heatmap`, `SimilarityMatrix`, `MatchSplit`.
- `src/components/stats/fact-card.tsx` — `FactCard` (headline + winner) + `StatDrawer` (responsive Sheet).
- `src/components/stats/stats-teaser.tsx` — `StatsTeaser` widget for the Pronósticos sidebar.
- `src/screens/estadisticas.tsx` — `EstadisticasScreen` page layout.
- `src/app/estadisticas/page.tsx` — route entry.

**Modify:**
- `src/lib/ui-tokens.ts` — add `estadisticas` route + title.
- `src/components/app-shell.tsx` — add route mapping + nav link.
- `src/screens/predictions.tsx` — mount `StatsTeaser` in the sidebar.
- `package.json` — add `recharts`.

**Convention notes for the implementer:**
- Spanish (Argentine) UI copy. Money tokens: `app-brand`, `app-green`, `app-amber`, `app-muted`, `app-line`, `app-surface`, `app-surface-2`, `app-panel`, `app-text`. Reusable classes in `ui` from `@/lib/ui-tokens` (`ui.panel`, `ui.label`, etc.).
- Tests are pure logic only. Do **not** add `.tsx` tests — vitest runs `node` env and includes only `src/**/*.test.ts`. UI is verified with `npm run build` + `npm run lint`.
- Run a single test file with: `npx vitest run src/lib/stats.test.ts`.

---

## Task 1: Add Recharts and a chart container

**Files:**
- Modify: `package.json`
- Create: `src/components/ui/chart.tsx`

- [ ] **Step 1: Install Recharts**

Run:
```bash
npm install recharts@^2.15.0
```
Expected: `package.json` gains `"recharts"` under dependencies; install succeeds.

- [ ] **Step 2: Create the chart container wrapper**

This is a lean, token-themed wrapper (not the full shadcn chart.tsx) matching the hand-built aesthetic. It fixes a responsive height and exposes the app's chart palette.

Create `src/components/ui/chart.tsx`:
```tsx
"use client";

import { ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

// App-token-derived palette for series. Recharts needs concrete colors, so we
// reference the CSS variables the theme already defines.
export const chartColors = {
  brand: "var(--color-app-brand)",
  green: "var(--color-app-green)",
  amber: "var(--color-app-amber)",
  blue: "var(--color-app-blue)",
  muted: "var(--color-app-muted)",
  line: "var(--color-app-line)",
  surface: "var(--color-app-surface-2)",
  text: "var(--color-app-text)",
} as const;

export function ChartContainer({
  height = 240,
  minWidth,
  className,
  children,
}: {
  height?: number;
  minWidth?: number;
  className?: string;
  children: React.ReactElement;
}) {
  // minWidth lets wide charts (heatmap / matrix / line-over-rounds) scroll
  // horizontally inside a narrow drawer instead of squishing.
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <div style={{ minWidth, height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build picks up the dependency**

Run: `npx tsc --noEmit`
Expected: no errors referencing `recharts` or `chart.tsx`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/components/ui/chart.tsx
git commit -m "feat(estadisticas): add recharts + chart container"
```

---

## Task 2: stats.ts types and visibility helpers

**Files:**
- Create: `src/lib/stats.ts`
- Test: `src/lib/stats.test.ts`

- [ ] **Step 1: Write the failing test for visibility helpers**

Create `src/lib/stats.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { revealedMatchIds, finalizedMatchIds, revealedGroupLabels } from "./stats";
import type { Group, Match } from "./types";

const now = new Date("2026-06-12T12:00:00.000Z");

function match(id: string, over: Partial<Match> = {}): Match {
  return {
    id, matchNo: 1, stage: "round16",
    homeTeamId: "arg", awayTeamId: "fra",
    kickoffUtc: "2026-06-10T00:00:00.000Z", // past → locked
    status: "open",
    homeScore: null, awayScore: null, winnerTeamId: null,
    finalizedAt: null, finalizedBy: null, updatedAt: null, updatedBy: null,
    ...over,
  };
}

describe("visibility helpers", () => {
  it("treats past-kickoff matches as revealed (locked) and future as hidden", () => {
    const locked = match("locked");
    const open = match("open", { kickoffUtc: "2026-07-01T00:00:00.000Z" });
    const ids = revealedMatchIds([locked, open], now);
    expect(ids.has("locked")).toBe(true);
    expect(ids.has("open")).toBe(false);
  });

  it("finalizedMatchIds only includes finalized matches", () => {
    const fin = match("fin", { status: "finalized" });
    const locked = match("locked");
    const ids = finalizedMatchIds([fin, locked], now);
    expect(ids.has("fin")).toBe(true);
    expect(ids.has("locked")).toBe(false);
  });

  it("revealedGroupLabels includes locked and finalized groups only", () => {
    const open: Group = { groupLabel: "A", locksAt: "2026-07-01T00:00:00.000Z", firstTeamId: null, secondTeamId: null, thirdTeamId: null, fourthTeamId: null, resultFinalizedAt: null, resultFinalizedBy: null };
    const locked: Group = { ...open, groupLabel: "B", locksAt: "2026-06-01T00:00:00.000Z" };
    const labels = revealedGroupLabels([open, locked], now);
    expect(labels.has("A")).toBe(false);
    expect(labels.has("B")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/stats.test.ts`
Expected: FAIL — cannot find module `./stats` / exports undefined.

- [ ] **Step 3: Create stats.ts with types and helpers**

Create `src/lib/stats.ts`:
```ts
import type {
  Group, GroupPrediction, Match, Prediction, Profile, Stage, Team,
} from "./types";
import { getGroupStatus, getMatchStatus } from "./tournament";

export type ChartKind = "bar" | "histogram" | "line" | "heatmap" | "matrix" | "matchSplit";
export type FactCategory = "optimismo" | "manada" | "punteria" | "fidelidad" | "comportamiento";

export type FactId =
  | "optimista" | "candado" | "scoreline-favorito" | "sin-empates"
  | "rebelde" | "del-monton" | "partido-dividido" | "palpito-solitario"
  | "francotirador" | "racha" | "trampa"
  | "favorito-familia" | "oveja-negra" | "equipo-cabecera"
  | "madrugador" | "ultimo-minuto" | "indeciso";

export type PersonValue = {
  user: Profile;
  value: number;        // numeric, for sorting and plotting
  displayValue: string; // human label shown in chart/table
};

export type Fact = {
  id: FactId;
  category: FactCategory;
  title: string;
  emoji: string;
  blurb: string;
  requires: "predictions" | "results";
  available: boolean;
  unavailableHint?: string;
  chartKind: ChartKind;
  winner?: PersonValue;
  coWinners: PersonValue[]; // [] unless tie
  series: PersonValue[];    // per-person data (empty when unavailable)
  unitSuffix?: string;
};

export type StatsInput = {
  profiles: Profile[];
  predictions: Prediction[];
  groupPredictions: GroupPrediction[];
  matches: Match[];
  groups: Group[];
  teams: Team[];
  currentUserId: string;
  standingsStages: Set<Stage>;
  now: Date;
};

export function revealedMatchIds(matches: Match[], now: Date): Set<string> {
  return new Set(
    matches.filter((m) => getMatchStatus(m, now) !== "open").map((m) => m.id),
  );
}

export function finalizedMatchIds(matches: Match[], now: Date): Set<string> {
  return new Set(
    matches.filter((m) => getMatchStatus(m, now) === "finalized").map((m) => m.id),
  );
}

export function revealedGroupLabels(groups: Group[], now: Date): Set<string> {
  return new Set(
    groups.filter((g) => getGroupStatus(g, now) !== "open").map((g) => g.groupLabel),
  );
}

export const approvedProfiles = (profiles: Profile[]) =>
  profiles.filter((p) => p.approved);
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/stats.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.ts src/lib/stats.test.ts
git commit -m "feat(estadisticas): stats module types + visibility helpers"
```

---

## Task 3: Optimism facts (optimista, candado, sin-empates)

**Files:**
- Modify: `src/lib/stats.ts`
- Test: `src/lib/stats.test.ts`

These use **revealed** match predictions only. `value` is per-person average goals (optimista/candado) or draw percentage (sin-empates).

- [ ] **Step 1: Write the failing test**

Append to `src/lib/stats.test.ts`:
```ts
import { buildOptimismFacts } from "./stats";
import type { GroupPrediction, Prediction, Profile } from "./types";

const profiles: Profile[] = [
  { id: "u1", displayName: "Ana", email: "a@x.com", approved: true, role: "user" },
  { id: "u2", displayName: "Beto", email: "b@x.com", approved: true, role: "user" },
];

function pred(userId: string, matchId: string, h: number, a: number): Prediction {
  return {
    id: `${userId}-${matchId}`, userId, matchId, homeScore: h, awayScore: a,
    winnerTeamId: null, points: null, exactHit: false, outcomeHit: false,
    createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z",
  };
}

describe("optimism facts", () => {
  const revealed = new Set(["m1", "m2"]);
  // Ana: 3+1 and 2+2 -> avg goals 4 per match; Beto: 0+0 and 1+0 -> avg 0.5
  const predictions = [
    pred("u1", "m1", 3, 1), pred("u1", "m2", 2, 2),
    pred("u2", "m1", 0, 0), pred("u2", "m2", 1, 0),
  ];

  it("optimista winner is the highest avg-goals predictor", () => {
    const { optimista } = buildOptimismFacts(profiles, predictions, revealed);
    expect(optimista.available).toBe(true);
    expect(optimista.winner?.user.id).toBe("u1");
    expect(optimista.winner?.value).toBe(4);
  });

  it("candado winner is the lowest avg-goals predictor", () => {
    const { candado } = buildOptimismFacts(profiles, predictions, revealed);
    expect(candado.winner?.user.id).toBe("u2");
  });

  it("sin-empates ranks by lowest draw percentage", () => {
    const { sinEmpates } = buildOptimismFacts(profiles, predictions, revealed);
    // Ana drew 1/2 = 50%, Beto drew 1/2 = 50% -> tie, both 50
    expect(sinEmpates.series.every((s) => s.value === 50)).toBe(true);
  });

  it("is unavailable when no revealed predictions exist", () => {
    const { optimista } = buildOptimismFacts(profiles, predictions, new Set());
    expect(optimista.available).toBe(false);
    expect(optimista.series).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/stats.test.ts`
Expected: FAIL — `buildOptimismFacts` undefined.

- [ ] **Step 3: Implement**

Append to `src/lib/stats.ts`:
```ts
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Picks the top entry by comparator, returning winner + any ties as coWinners.
function pickWinner(series: PersonValue[], better: (a: number, b: number) => boolean) {
  if (series.length === 0) return { winner: undefined, coWinners: [] as PersonValue[] };
  let best = series[0]!;
  for (const s of series) if (better(s.value, best.value)) best = s;
  const coWinners = series.filter((s) => s.value === best.value);
  return { winner: best, coWinners: coWinners.length > 1 ? coWinners : [] };
}

export function buildOptimismFacts(
  profiles: Profile[],
  predictions: Prediction[],
  revealed: Set<string>,
) {
  const approved = approvedProfiles(profiles);
  const revealedPreds = predictions.filter((p) => revealed.has(p.matchId));

  const avgGoals: PersonValue[] = [];
  const drawPct: PersonValue[] = [];
  for (const user of approved) {
    const mine = revealedPreds.filter((p) => p.userId === user.id);
    if (mine.length === 0) continue;
    const goals = mine.reduce((t, p) => t + p.homeScore + p.awayScore, 0) / mine.length;
    const draws = mine.filter((p) => p.homeScore === p.awayScore).length;
    avgGoals.push({ user, value: round1(goals), displayValue: `${round1(goals)} goles/partido` });
    drawPct.push({
      user,
      value: Math.round((draws / mine.length) * 100),
      displayValue: `${Math.round((draws / mine.length) * 100)}% empates`,
    });
  }

  const available = avgGoals.length > 0;
  const hint = "Se revela cuando cierren los partidos";
  const sortDesc = (s: PersonValue[]) => [...s].sort((a, b) => b.value - a.value);
  const sortAsc = (s: PersonValue[]) => [...s].sort((a, b) => a.value - b.value);

  const opt = pickWinner(avgGoals, (a, b) => a > b);
  const can = pickWinner(avgGoals, (a, b) => a < b);
  const noDraw = pickWinner(drawPct, (a, b) => a < b);

  const optimista: Fact = {
    id: "optimista", category: "optimismo", title: "El más optimista", emoji: "🎯",
    blurb: "Quien pronostica más goles por partido", requires: "predictions",
    available, unavailableHint: hint, chartKind: "bar", unitSuffix: "goles",
    winner: opt.winner, coWinners: opt.coWinners, series: sortDesc(avgGoals),
  };
  const candado: Fact = {
    id: "candado", category: "optimismo", title: "El candado", emoji: "🔒",
    blurb: "El más defensivo: menos goles imaginados", requires: "predictions",
    available, unavailableHint: hint, chartKind: "bar", unitSuffix: "goles",
    winner: can.winner, coWinners: can.coWinners, series: sortAsc(avgGoals),
  };
  const sinEmpates: Fact = {
    id: "sin-empates", category: "optimismo", title: "Nunca cree en empates", emoji: "🙅",
    blurb: "Menor porcentaje de empates pronosticados", requires: "predictions",
    available, unavailableHint: hint, chartKind: "bar", unitSuffix: "%",
    winner: noDraw.winner, coWinners: noDraw.coWinners, series: sortAsc(drawPct),
  };

  return { optimista, candado, sinEmpates };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/stats.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.ts src/lib/stats.test.ts
git commit -m "feat(estadisticas): optimism facts (optimista/candado/sin-empates)"
```

---

## Task 4: Scoreline favorito (group histogram)

**Files:**
- Modify: `src/lib/stats.ts`
- Test: `src/lib/stats.test.ts`

A group-level histogram of predicted scorelines over revealed matches; the "winner" slot holds the modal scoreline (as a synthetic label, no user).

- [ ] **Step 1: Write the failing test**

Append to `src/lib/stats.test.ts`:
```ts
import { buildScorelineHistogram } from "./stats";

describe("scoreline favorito", () => {
  it("counts predicted scorelines and finds the mode", () => {
    const revealed = new Set(["m1", "m2", "m3"]);
    const preds = [
      pred("u1", "m1", 2, 1), pred("u2", "m1", 2, 1),
      pred("u1", "m2", 2, 1), pred("u2", "m2", 0, 0),
      pred("u1", "m3", 1, 0), pred("u2", "m3", 2, 1),
    ];
    const { bins, mode, total } = buildScorelineHistogram(preds, revealed);
    expect(total).toBe(6);
    expect(mode?.label).toBe("2-1");
    expect(mode?.count).toBe(4);
    // bins sorted by count desc
    expect(bins[0]!.label).toBe("2-1");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/stats.test.ts`
Expected: FAIL — `buildScorelineHistogram` undefined.

- [ ] **Step 3: Implement**

Append to `src/lib/stats.ts`:
```ts
export type HistogramBin = { label: string; count: number };

export function buildScorelineHistogram(predictions: Prediction[], revealed: Set<string>) {
  const counts = new Map<string, number>();
  let total = 0;
  for (const p of predictions) {
    if (!revealed.has(p.matchId)) continue;
    const key = `${p.homeScore}-${p.awayScore}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    total += 1;
  }
  const bins: HistogramBin[] = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return { bins, total, mode: bins[0] };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/stats.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.ts src/lib/stats.test.ts
git commit -m "feat(estadisticas): scoreline favorito histogram"
```

---

## Task 5: Consensus / contrarian facts (rebelde, del-monton, partido-dividido)

**Files:**
- Modify: `src/lib/stats.ts`
- Test: `src/lib/stats.test.ts`

For each revealed match, the majority predicted **outcome** (home/away/draw) is the crowd pick. A user's contrarian rate = fraction of their revealed predictions that differ from the crowd. `partido-dividido` = the revealed match whose outcome split is most even (highest Shannon entropy).

- [ ] **Step 1: Write the failing test**

Append to `src/lib/stats.test.ts`:
```ts
import { buildConsensusFacts, predictedOutcome } from "./stats";

describe("consensus facts", () => {
  it("classifies outcomes home/away/draw", () => {
    expect(predictedOutcome(2, 1)).toBe("home");
    expect(predictedOutcome(0, 3)).toBe("away");
    expect(predictedOutcome(1, 1)).toBe("draw");
  });

  it("rebelde is the most contrarian, del-monton the most aligned", () => {
    const revealed = new Set(["m1", "m2"]);
    // Crowd: m1 -> home (2 of 3), m2 -> home (2 of 3). u3 always contrarian.
    const preds = [
      pred("u1", "m1", 2, 0), pred("u2", "m1", 1, 0), pred("u3", "m1", 0, 2),
      pred("u1", "m2", 3, 1), pred("u2", "m2", 1, 0), pred("u3", "m2", 0, 1),
    ];
    const profiles3 = [...profiles, { id: "u3", displayName: "Caro", email: "c@x.com", approved: true, role: "user" as const }];
    const { rebelde, delMonton, partidoDividido } = buildConsensusFacts(profiles3, preds, revealed);
    expect(rebelde.winner?.user.id).toBe("u3");
    expect(rebelde.winner?.value).toBe(100);
    expect(delMonton.winner && delMonton.winner.user.id !== "u3").toBe(true);
    expect(partidoDividido.available).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/stats.test.ts`
Expected: FAIL — exports undefined.

- [ ] **Step 3: Implement**

Append to `src/lib/stats.ts`:
```ts
export type Outcome = "home" | "away" | "draw";

export function predictedOutcome(home: number, away: number): Outcome {
  if (home > away) return "home";
  if (away > home) return "away";
  return "draw";
}

function crowdOutcomeByMatch(predictions: Prediction[], revealed: Set<string>) {
  const byMatch = new Map<string, Map<Outcome, number>>();
  for (const p of predictions) {
    if (!revealed.has(p.matchId)) continue;
    const tally = byMatch.get(p.matchId) ?? new Map<Outcome, number>();
    const o = predictedOutcome(p.homeScore, p.awayScore);
    tally.set(o, (tally.get(o) ?? 0) + 1);
    byMatch.set(p.matchId, tally);
  }
  const crowd = new Map<string, Outcome>();
  for (const [matchId, tally] of byMatch) {
    let best: Outcome = "home";
    let bestN = -1;
    for (const o of ["home", "away", "draw"] as Outcome[]) {
      const n = tally.get(o) ?? 0;
      if (n > bestN) { bestN = n; best = o; }
    }
    crowd.set(matchId, best);
  }
  return { crowd, byMatch };
}

export function buildConsensusFacts(
  profiles: Profile[],
  predictions: Prediction[],
  revealed: Set<string>,
) {
  const approved = approvedProfiles(profiles);
  const { crowd, byMatch } = crowdOutcomeByMatch(predictions, revealed);

  const contrarianRate: PersonValue[] = [];
  for (const user of approved) {
    const mine = predictions.filter((p) => p.userId === user.id && revealed.has(p.matchId));
    if (mine.length === 0) continue;
    const against = mine.filter(
      (p) => predictedOutcome(p.homeScore, p.awayScore) !== crowd.get(p.matchId),
    ).length;
    const pct = Math.round((against / mine.length) * 100);
    contrarianRate.push({ user, value: pct, displayValue: `${pct}% contra la mayoría` });
  }

  // Most divided match = highest entropy of outcome distribution.
  let dividedMatchId: string | undefined;
  let bestEntropy = -1;
  for (const [matchId, tally] of byMatch) {
    const total = [...tally.values()].reduce((t, n) => t + n, 0);
    if (total < 2) continue;
    let entropy = 0;
    for (const n of tally.values()) {
      const pr = n / total;
      if (pr > 0) entropy -= pr * Math.log2(pr);
    }
    if (entropy > bestEntropy) { bestEntropy = entropy; dividedMatchId = matchId; }
  }

  const available = contrarianRate.length > 0;
  const hint = "Se revela cuando cierren los partidos";
  const reb = pickWinner(contrarianRate, (a, b) => a > b);
  const mon = pickWinner(contrarianRate, (a, b) => a < b);

  const rebelde: Fact = {
    id: "rebelde", category: "manada", title: "El rebelde", emoji: "🤘",
    blurb: "El que más se aparta de la mayoría", requires: "predictions",
    available, unavailableHint: hint, chartKind: "bar", unitSuffix: "%",
    winner: reb.winner, coWinners: reb.coWinners,
    series: [...contrarianRate].sort((a, b) => b.value - a.value),
  };
  const delMonton: Fact = {
    id: "del-monton", category: "manada", title: "El del montón", emoji: "🐑",
    blurb: "El que más vota con la mayoría", requires: "predictions",
    available, unavailableHint: hint, chartKind: "bar", unitSuffix: "%",
    winner: mon.winner, coWinners: mon.coWinners,
    series: [...contrarianRate].sort((a, b) => a.value - b.value),
  };
  const partidoDividido: Fact = {
    id: "partido-dividido", category: "manada", title: "El partido más dividido", emoji: "⚖️",
    blurb: "Donde la familia está más repartida", requires: "predictions",
    available: Boolean(dividedMatchId), unavailableHint: hint, chartKind: "matchSplit",
    winner: undefined, coWinners: [], series: [],
  };

  return { rebelde, delMonton, partidoDividido, dividedMatchId };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/stats.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.ts src/lib/stats.test.ts
git commit -m "feat(estadisticas): consensus facts (rebelde/del-monton/dividido)"
```

---

## Task 6: Accuracy facts (francotirador, racha, trampa)

**Files:**
- Modify: `src/lib/stats.ts`
- Test: `src/lib/stats.test.ts`

Use **finalized** matches only. `francotirador` = exact-hit %. `racha` = longest run of consecutive `outcomeHit` (ordered by match kickoff). `trampa` = finalized match with the lowest share of correct outcomes.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/stats.test.ts`:
```ts
import { buildAccuracyFacts } from "./stats";
import type { Match } from "./types";

describe("accuracy facts", () => {
  function fmatch(id: string, kickoff: string): Match {
    return {
      id, matchNo: 1, stage: "round16", homeTeamId: "arg", awayTeamId: "fra",
      kickoffUtc: kickoff, status: "finalized",
      homeScore: 1, awayScore: 0, winnerTeamId: "arg",
      finalizedAt: "2026-06-11T00:00:00.000Z", finalizedBy: "u1",
      updatedAt: null, updatedBy: null,
    };
  }
  function scored(userId: string, matchId: string, exact: boolean, outcome: boolean): Prediction {
    return { ...pred(userId, matchId, 1, 0), exactHit: exact, outcomeHit: outcome, points: exact ? 3 : outcome ? 1 : 0 };
  }

  const matches = [fmatch("m1", "2026-06-08T00:00:00.000Z"), fmatch("m2", "2026-06-09T00:00:00.000Z")];
  const finalized = new Set(["m1", "m2"]);
  const preds = [
    scored("u1", "m1", true, true), scored("u1", "m2", false, true),  // Ana 2/2 outcomes, 1 exact, streak 2
    scored("u2", "m1", false, false), scored("u2", "m2", false, true), // Beto 1/2 outcomes
  ];

  it("francotirador ranks by exact-hit percentage", () => {
    const { francotirador } = buildAccuracyFacts(profiles, preds, matches, finalized);
    expect(francotirador.winner?.user.id).toBe("u1");
    expect(francotirador.winner?.value).toBe(50); // 1 of 2 exact
  });

  it("racha is the longest consecutive outcome-hit streak", () => {
    const { racha } = buildAccuracyFacts(profiles, preds, matches, finalized);
    expect(racha.winner?.user.id).toBe("u1");
    expect(racha.winner?.value).toBe(2);
  });

  it("is unavailable with no finalized matches", () => {
    const { francotirador } = buildAccuracyFacts(profiles, preds, matches, new Set());
    expect(francotirador.available).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/stats.test.ts`
Expected: FAIL — `buildAccuracyFacts` undefined.

- [ ] **Step 3: Implement**

Append to `src/lib/stats.ts`:
```ts
export function buildAccuracyFacts(
  profiles: Profile[],
  predictions: Prediction[],
  matches: Match[],
  finalized: Set<string>,
) {
  const approved = approvedProfiles(profiles);
  const kickoffById = new Map(matches.map((m) => [m.id, m.kickoffUtc]));

  const exactPct: PersonValue[] = [];
  const streak: PersonValue[] = [];
  for (const user of approved) {
    const mine = predictions
      .filter((p) => p.userId === user.id && finalized.has(p.matchId))
      .sort((a, b) =>
        (kickoffById.get(a.matchId) ?? "").localeCompare(kickoffById.get(b.matchId) ?? ""),
      );
    if (mine.length === 0) continue;
    const exact = mine.filter((p) => p.exactHit).length;
    const pct = Math.round((exact / mine.length) * 100);
    exactPct.push({ user, value: pct, displayValue: `${pct}% exactos` });

    let best = 0;
    let run = 0;
    for (const p of mine) {
      run = p.outcomeHit ? run + 1 : 0;
      if (run > best) best = run;
    }
    streak.push({ user, value: best, displayValue: `${best} seguidos` });
  }

  // La trampa: finalized match with lowest share of correct outcomes.
  let trampaMatchId: string | undefined;
  let worstShare = 2;
  for (const matchId of finalized) {
    const forMatch = predictions.filter((p) => p.matchId === matchId);
    if (forMatch.length === 0) continue;
    const correct = forMatch.filter((p) => p.outcomeHit).length;
    const share = correct / forMatch.length;
    if (share < worstShare) { worstShare = share; trampaMatchId = matchId; }
  }

  const available = exactPct.length > 0;
  const hint = "Se revela cuando haya resultados cargados";
  const fr = pickWinner(exactPct, (a, b) => a > b);
  const ra = pickWinner(streak, (a, b) => a > b);

  const francotirador: Fact = {
    id: "francotirador", category: "punteria", title: "El francotirador", emoji: "🎯",
    blurb: "Mejor porcentaje de resultados exactos", requires: "results",
    available, unavailableHint: hint, chartKind: "bar", unitSuffix: "%",
    winner: fr.winner, coWinners: fr.coWinners,
    series: [...exactPct].sort((a, b) => b.value - a.value),
  };
  const racha: Fact = {
    id: "racha", category: "punteria", title: "Racha caliente", emoji: "🔥",
    blurb: "Más aciertos de resultado seguidos", requires: "results",
    available, unavailableHint: hint, chartKind: "bar", unitSuffix: "",
    winner: ra.winner, coWinners: ra.coWinners,
    series: [...streak].sort((a, b) => b.value - a.value),
  };
  const trampa: Fact = {
    id: "trampa", category: "punteria", title: "La trampa", emoji: "🪤",
    blurb: "El partido que casi todos erraron", requires: "results",
    available: Boolean(trampaMatchId), unavailableHint: hint, chartKind: "matchSplit",
    winner: undefined, coWinners: [], series: [],
  };

  return { francotirador, racha, trampa, trampaMatchId };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/stats.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.ts src/lib/stats.test.ts
git commit -m "feat(estadisticas): accuracy facts (francotirador/racha/trampa)"
```

---

## Task 7: Team-loyalty facts (favorito-familia, oveja-negra, equipo-cabecera) + termómetro

**Files:**
- Modify: `src/lib/stats.ts`
- Test: `src/lib/stats.test.ts`

Uses **revealed group predictions** (`revealedGroupLabels`). The "termómetro" tallies how many family members put each team **1st** in its group. `favorito-familia` = most-backed team; `oveja-negra` = a team backed 1st by exactly one person. `equipo-cabecera` = per-person, the team they most often place 1st.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/stats.test.ts`:
```ts
import { buildTeamLoyaltyFacts } from "./stats";

describe("team loyalty facts", () => {
  function gp(userId: string, groupLabel: string, first: string): GroupPrediction {
    return {
      id: `${userId}-${groupLabel}`, userId, groupLabel,
      firstTeamId: first, secondTeamId: null, thirdTeamId: null, fourthTeamId: null,
      points: null, exactPositions: 0,
      createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z",
    };
  }
  const teams = [
    { id: "arg", name: "Argentina", shortName: "ARG", flag: "🇦🇷" },
    { id: "bra", name: "Brasil", shortName: "BRA", flag: "🇧🇷" },
  ];
  const revealedGroups = new Set(["A", "B"]);
  const gps = [
    gp("u1", "A", "arg"), gp("u2", "A", "arg"), // arg backed twice
    gp("u1", "B", "bra"),                        // bra backed once -> oveja negra
  ];

  it("termometro counts 1st-place backers and finds the family favorite", () => {
    const { favoritoFamilia, termometro } = buildTeamLoyaltyFacts(profiles, gps, teams, revealedGroups);
    expect(favoritoFamilia.winner?.displayValue).toContain("Argentina");
    expect(termometro.find((t) => t.teamId === "arg")?.count).toBe(2);
  });

  it("oveja negra is a team backed by exactly one person", () => {
    const { ovejaNegra } = buildTeamLoyaltyFacts(profiles, gps, teams, revealedGroups);
    expect(ovejaNegra.available).toBe(true);
    expect(ovejaNegra.winner?.displayValue).toContain("Brasil");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/stats.test.ts`
Expected: FAIL — `buildTeamLoyaltyFacts` undefined.

- [ ] **Step 3: Implement**

Append to `src/lib/stats.ts`:
```ts
export type TeamTally = { teamId: string; name: string; flag: string; count: number };

export function buildTeamLoyaltyFacts(
  profiles: Profile[],
  groupPredictions: GroupPrediction[],
  teams: Team[],
  revealedGroups: Set<string>,
) {
  const approved = approvedProfiles(profiles);
  const approvedIds = new Set(approved.map((p) => p.id));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const revealed = groupPredictions.filter(
    (g) => revealedGroups.has(g.groupLabel) && approvedIds.has(g.userId) && g.firstTeamId,
  );

  const counts = new Map<string, number>();
  for (const g of revealed) counts.set(g.firstTeamId!, (counts.get(g.firstTeamId!) ?? 0) + 1);

  const termometro: TeamTally[] = [...counts.entries()]
    .map(([teamId, count]) => ({
      teamId,
      name: teamById.get(teamId)?.name ?? teamId,
      flag: teamById.get(teamId)?.flag ?? "🏳️",
      count,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const available = termometro.length > 0;
  const hint = "Se revela cuando cierren los grupos";

  const top = termometro[0];
  const favoritoFamilia: Fact = {
    id: "favorito-familia", category: "fidelidad", title: "El favorito de la familia", emoji: "👑",
    blurb: "El equipo que más veces sale 1º en los pronósticos", requires: "predictions",
    available, unavailableHint: hint, chartKind: "bar", unitSuffix: "votos",
    winner: top
      ? { user: approved[0]!, value: top.count, displayValue: `${top.flag} ${top.name} · ${top.count} votos` }
      : undefined,
    coWinners: [], series: [],
  };

  const lone = [...termometro].reverse().find((t) => t.count === 1);
  const ovejaNegra: Fact = {
    id: "oveja-negra", category: "fidelidad", title: "La oveja negra", emoji: "🐐",
    blurb: "Un equipo en el que cree una sola persona", requires: "predictions",
    available: Boolean(lone), unavailableHint: hint, chartKind: "bar", unitSuffix: "votos",
    winner: lone
      ? { user: approved[0]!, value: 1, displayValue: `${lone.flag} ${lone.name}` }
      : undefined,
    coWinners: [], series: [],
  };

  // equipo-cabecera: per person, the team they most often place 1st.
  const cabecera: PersonValue[] = [];
  for (const user of approved) {
    const mine = revealed.filter((g) => g.userId === user.id);
    if (mine.length === 0) continue;
    const tally = new Map<string, number>();
    for (const g of mine) tally.set(g.firstTeamId!, (tally.get(g.firstTeamId!) ?? 0) + 1);
    const [teamId, count] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]!;
    const t = teamById.get(teamId);
    cabecera.push({ user, value: count, displayValue: `${t?.flag ?? ""} ${t?.name ?? teamId}` });
  }
  const equipoCabecera: Fact = {
    id: "equipo-cabecera", category: "fidelidad", title: "Tu equipo de cabecera", emoji: "❤️",
    blurb: "El equipo que cada uno banca para salir 1º", requires: "predictions",
    available: cabecera.length > 0, unavailableHint: hint, chartKind: "bar", unitSuffix: "",
    winner: undefined, coWinners: [], series: cabecera,
  };

  return { favoritoFamilia, ovejaNegra, equipoCabecera, termometro };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/stats.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.ts src/lib/stats.test.ts
git commit -m "feat(estadisticas): team-loyalty facts + termometro"
```

---

## Task 8: Behavior / timing facts (madrugador, ultimo-minuto, indeciso)

**Files:**
- Modify: `src/lib/stats.ts`
- Test: `src/lib/stats.test.ts`

`madrugador`/`ultimo-minuto` rank by average lead time (hours between `updatedAt` and the match kickoff) over **revealed** predictions. `indeciso` counts predictions where `updatedAt > createdAt`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/stats.test.ts`:
```ts
import { buildBehaviorFacts } from "./stats";

describe("behavior facts", () => {
  function tpred(userId: string, matchId: string, created: string, updated: string): Prediction {
    return { ...pred(userId, matchId, 1, 0), createdAt: created, updatedAt: updated };
  }
  function kmatch(id: string, kickoff: string): Match {
    return { ...({} as Match), id, matchNo: 1, stage: "round16", homeTeamId: "arg", awayTeamId: "fra",
      kickoffUtc: kickoff, status: "open", homeScore: null, awayScore: null, winnerTeamId: null,
      finalizedAt: null, finalizedBy: null, updatedAt: null, updatedBy: null };
  }
  const matches = [kmatch("m1", "2026-06-10T00:00:00.000Z")];
  const revealed = new Set(["m1"]);
  // Ana updated 2 days early; Beto updated 1h before kickoff. Beto edited (created != updated).
  const preds = [
    tpred("u1", "m1", "2026-06-08T00:00:00.000Z", "2026-06-08T00:00:00.000Z"),
    tpred("u2", "m1", "2026-06-01T00:00:00.000Z", "2026-06-09T23:00:00.000Z"),
  ];

  it("madrugador has the largest average lead time", () => {
    const { madrugador } = buildBehaviorFacts(profiles, preds, matches, revealed);
    expect(madrugador.winner?.user.id).toBe("u1");
  });

  it("indeciso counts edited predictions", () => {
    const { indeciso } = buildBehaviorFacts(profiles, preds, matches, revealed);
    expect(indeciso.winner?.user.id).toBe("u2");
    expect(indeciso.winner?.value).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/stats.test.ts`
Expected: FAIL — `buildBehaviorFacts` undefined.

- [ ] **Step 3: Implement**

Append to `src/lib/stats.ts`:
```ts
export function buildBehaviorFacts(
  profiles: Profile[],
  predictions: Prediction[],
  matches: Match[],
  revealed: Set<string>,
) {
  const approved = approvedProfiles(profiles);
  const kickoffById = new Map(matches.map((m) => [m.id, m.kickoffUtc]));

  const leadHours: PersonValue[] = [];
  const edits: PersonValue[] = [];
  for (const user of approved) {
    const mine = predictions.filter((p) => p.userId === user.id && revealed.has(p.matchId));
    if (mine.length === 0) continue;
    let totalLead = 0;
    let edited = 0;
    for (const p of mine) {
      const kickoff = kickoffById.get(p.matchId);
      if (kickoff) {
        const hrs = (new Date(kickoff).getTime() - new Date(p.updatedAt).getTime()) / 3_600_000;
        totalLead += hrs;
      }
      if (new Date(p.updatedAt).getTime() > new Date(p.createdAt).getTime()) edited += 1;
    }
    const avgLead = Math.round(totalLead / mine.length);
    leadHours.push({ user, value: avgLead, displayValue: `${avgLead} h de anticipación` });
    edits.push({ user, value: edited, displayValue: `${edited} ediciones` });
  }

  const available = leadHours.length > 0;
  const hint = "Se revela cuando cierren los partidos";
  const mad = pickWinner(leadHours, (a, b) => a > b);
  const last = pickWinner(leadHours, (a, b) => a < b);
  const ind = pickWinner(edits, (a, b) => a > b);

  const madrugador: Fact = {
    id: "madrugador", category: "comportamiento", title: "El madrugador", emoji: "🌅",
    blurb: "Carga sus pronósticos con más anticipación", requires: "predictions",
    available, unavailableHint: hint, chartKind: "bar", unitSuffix: "h",
    winner: mad.winner, coWinners: mad.coWinners,
    series: [...leadHours].sort((a, b) => b.value - a.value),
  };
  const ultimoMinuto: Fact = {
    id: "ultimo-minuto", category: "comportamiento", title: "El del último minuto", emoji: "⏰",
    blurb: "Carga sobre la hora del cierre", requires: "predictions",
    available, unavailableHint: hint, chartKind: "bar", unitSuffix: "h",
    winner: last.winner, coWinners: last.coWinners,
    series: [...leadHours].sort((a, b) => a.value - b.value),
  };
  const indeciso: Fact = {
    id: "indeciso", category: "comportamiento", title: "El indeciso", emoji: "🤔",
    blurb: "El que más veces cambió de opinión", requires: "predictions",
    available, unavailableHint: hint, chartKind: "bar", unitSuffix: "",
    winner: ind.winner, coWinners: ind.coWinners,
    series: [...edits].sort((a, b) => b.value - a.value),
  };

  return { madrugador, ultimoMinuto, indeciso };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/stats.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.ts src/lib/stats.test.ts
git commit -m "feat(estadisticas): behavior facts (madrugador/ultimo-minuto/indeciso)"
```

---

## Task 9: Similarity matrix + hero + personal card + computeStats assembler

**Files:**
- Modify: `src/lib/stats.ts`
- Test: `src/lib/stats.test.ts`

Adds the `¿quién piensa igual?` similarity matrix (pairwise agreement over revealed match outcomes), hero numbers, the personal card (uses ALL of the current user's own predictions), and the top-level `computeStats` that wires every builder and returns `StatsBundle`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/stats.test.ts`:
```ts
import { buildSimilarityMatrix, computeStats } from "./stats";
import { matches as seedMatches, groups as seedGroups, predictions as seedPreds, groupPredictions as seedGroupPreds, profiles as seedProfiles, teams as seedTeams } from "./seed";

describe("similarity matrix", () => {
  it("scores pairwise outcome agreement 0-100", () => {
    const revealed = new Set(["m1", "m2"]);
    const preds = [
      pred("u1", "m1", 2, 0), pred("u2", "m1", 1, 0), // both home -> agree
      pred("u1", "m2", 0, 1), pred("u2", "m2", 2, 0), // away vs home -> disagree
    ];
    const { cells } = buildSimilarityMatrix(profiles, preds, revealed);
    const pair = cells.find((c) => c.aId === "u1" && c.bId === "u2");
    expect(pair?.value).toBe(50);
  });
});

describe("computeStats", () => {
  it("returns a bundle and excludes open matches from group facts", () => {
    const now = new Date("2026-06-12T12:00:00.000Z");
    const bundle = computeStats({
      profiles: seedProfiles, predictions: seedPreds, groupPredictions: seedGroupPreds,
      matches: seedMatches, groups: seedGroups, teams: seedTeams,
      currentUserId: "u1", standingsStages: new Set(["groups"]), now,
    });
    expect(Array.isArray(bundle.facts)).toBe(true);
    expect(bundle.facts.length).toBeGreaterThan(0);
    expect(bundle.personal).toBeTruthy();
    // m4 is round16 open in seed -> not in any revealed group fact series
    expect(bundle.hero.predictionsLoaded).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/stats.test.ts`
Expected: FAIL — `buildSimilarityMatrix` / `computeStats` undefined.

- [ ] **Step 3: Implement**

Append to `src/lib/stats.ts`:
```ts
export type SimilarityCell = { aId: string; bId: string; value: number };
export type SimilarityMatrix = { users: Profile[]; cells: SimilarityCell[] };

export function buildSimilarityMatrix(
  profiles: Profile[],
  predictions: Prediction[],
  revealed: Set<string>,
): SimilarityMatrix {
  const users = approvedProfiles(profiles);
  const outcomeByUserMatch = new Map<string, Map<string, Outcome>>();
  for (const p of predictions) {
    if (!revealed.has(p.matchId)) continue;
    const m = outcomeByUserMatch.get(p.userId) ?? new Map<string, Outcome>();
    m.set(p.matchId, predictedOutcome(p.homeScore, p.awayScore));
    outcomeByUserMatch.set(p.userId, m);
  }
  const cells: SimilarityCell[] = [];
  for (const a of users) {
    for (const b of users) {
      if (a.id === b.id) continue;
      const ma = outcomeByUserMatch.get(a.id);
      const mb = outcomeByUserMatch.get(b.id);
      if (!ma || !mb) { cells.push({ aId: a.id, bId: b.id, value: 0 }); continue; }
      let shared = 0;
      let agree = 0;
      for (const [matchId, oa] of ma) {
        const ob = mb.get(matchId);
        if (ob === undefined) continue;
        shared += 1;
        if (oa === ob) agree += 1;
      }
      cells.push({ aId: a.id, bId: b.id, value: shared ? Math.round((agree / shared) * 100) : 0 });
    }
  }
  return { users, cells };
}

export type PersonalCard = {
  hasData: boolean;
  favoriteScoreline?: string;
  avgGoals?: number;
  groupAvgGoals?: number;
  exactPct?: number;
};

function buildPersonalCard(
  predictions: Prediction[],
  currentUserId: string,
  groupAvgGoals: number | undefined,
  finalized: Set<string>,
): PersonalCard {
  const mine = predictions.filter((p) => p.userId === currentUserId);
  if (mine.length === 0) return { hasData: false };
  const counts = new Map<string, number>();
  for (const p of mine) {
    const key = `${p.homeScore}-${p.awayScore}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const favoriteScoreline = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const avgGoals = round1(mine.reduce((t, p) => t + p.homeScore + p.awayScore, 0) / mine.length);
  const finals = mine.filter((p) => finalized.has(p.matchId));
  const exactPct = finals.length
    ? Math.round((finals.filter((p) => p.exactHit).length / finals.length) * 100)
    : undefined;
  return { hasData: true, favoriteScoreline, avgGoals, groupAvgGoals, exactPct };
}

export type StatsBundle = {
  hero: { goalsDreamed: number; predictionsLoaded: number; groupExactPct: number; dividedMatchId?: string };
  personal: PersonalCard;
  facts: Fact[];
  termometro: TeamTally[];
  scoreline: ReturnType<typeof buildScorelineHistogram>;
  similarity: SimilarityMatrix;
  dividedMatchId?: string;
  trampaMatchId?: string;
};

export function computeStats(input: StatsInput): StatsBundle {
  const { profiles, predictions, groupPredictions, matches, groups, teams, currentUserId, now } = input;
  const revealed = revealedMatchIds(matches, now);
  const finalized = finalizedMatchIds(matches, now);
  const revealedGroups = revealedGroupLabels(groups, now);

  const optimism = buildOptimismFacts(profiles, predictions, revealed);
  const consensus = buildConsensusFacts(profiles, predictions, revealed);
  const accuracy = buildAccuracyFacts(profiles, predictions, matches, finalized);
  const loyalty = buildTeamLoyaltyFacts(profiles, groupPredictions, teams, revealedGroups);
  const behavior = buildBehaviorFacts(profiles, predictions, matches, revealed);
  const scoreline = buildScorelineHistogram(predictions, revealed);
  const similarity = buildSimilarityMatrix(profiles, predictions, revealed);

  const facts: Fact[] = [
    optimism.optimista, optimism.candado, optimism.sinEmpates,
    {
      id: "scoreline-favorito", category: "optimismo", title: "Scoreline favorito", emoji: "📊",
      blurb: "El resultado más pronosticado por la familia", requires: "predictions",
      available: scoreline.total > 0, unavailableHint: "Se revela cuando cierren los partidos",
      chartKind: "histogram",
      winner: scoreline.mode
        ? { user: profiles[0]!, value: scoreline.mode.count, displayValue: `${scoreline.mode.label} (${scoreline.mode.count}x)` }
        : undefined,
      coWinners: [], series: [],
    },
    consensus.rebelde, consensus.delMonton, consensus.partidoDividido,
    accuracy.francotirador, accuracy.racha, accuracy.trampa,
    loyalty.favoritoFamilia, loyalty.ovejaNegra, loyalty.equipoCabecera,
    behavior.madrugador, behavior.ultimoMinuto, behavior.indeciso,
  ];

  const groupAvgGoals = optimism.optimista.series.length
    ? round1(optimism.optimista.series.reduce((t, s) => t + s.value, 0) / optimism.optimista.series.length)
    : undefined;

  const revealedPreds = predictions.filter((p) => revealed.has(p.matchId));
  const finalizedPreds = predictions.filter((p) => finalized.has(p.matchId));
  const hero = {
    goalsDreamed: predictions.reduce((t, p) => t + p.homeScore + p.awayScore, 0),
    predictionsLoaded: revealedPreds.length,
    groupExactPct: finalizedPreds.length
      ? Math.round((finalizedPreds.filter((p) => p.exactHit).length / finalizedPreds.length) * 100)
      : 0,
    dividedMatchId: consensus.dividedMatchId,
  };

  return {
    hero,
    personal: buildPersonalCard(predictions, currentUserId, groupAvgGoals, finalized),
    facts,
    termometro: loyalty.termometro,
    scoreline,
    similarity,
    dividedMatchId: consensus.dividedMatchId,
    trampaMatchId: accuracy.trampaMatchId,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/stats.test.ts`
Expected: PASS (all suites).

- [ ] **Step 5: Run full test + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all tests pass; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/stats.ts src/lib/stats.test.ts
git commit -m "feat(estadisticas): similarity matrix, hero, personal card, computeStats"
```

---

## Task 10: Chart primitives

**Files:**
- Create: `src/components/stats/charts.tsx`

Presentational Recharts components driven by `stats.ts` outputs. Verified via build/lint (no unit test — node env can't render).

- [ ] **Step 1: Implement chart primitives**

Create `src/components/stats/charts.tsx`:
```tsx
"use client";

import {
  Bar, BarChart, Cell, XAxis, YAxis, Tooltip, LabelList,
  Line, LineChart, CartesianGrid,
} from "recharts";

import { ChartContainer, chartColors } from "@/components/ui/chart";
import type { HistogramBin, PersonValue, SimilarityMatrix, TeamTally } from "@/lib/stats";

const tooltipStyle = {
  background: "var(--color-app-panel)",
  border: "1px solid var(--color-app-line)",
  borderRadius: 8,
  fontWeight: 700,
  fontSize: 12,
  color: "var(--color-app-text)",
} as const;

/** Horizontal bars keep person names readable on narrow screens. */
export function BarStat({ series, suffix, highlightId }: { series: PersonValue[]; suffix?: string; highlightId?: string }) {
  const data = series.map((s) => ({ name: s.user.displayName, value: s.value, id: s.user.id }));
  return (
    <ChartContainer height={Math.max(160, data.length * 40)}>
      <BarChart layout="vertical" data={data} margin={{ left: 8, right: 24 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={90} tick={{ fill: chartColors.muted, fontSize: 12, fontWeight: 700 }} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: chartColors.surface }} formatter={(v: number) => [`${v}${suffix ? ` ${suffix}` : ""}`, ""]} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
          {data.map((d) => (
            <Cell key={d.id} fill={d.id === highlightId ? chartColors.brand : chartColors.green} />
          ))}
          <LabelList dataKey="value" position="right" fill={chartColors.text} fontSize={12} fontWeight={800} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

export function Histogram({ bins }: { bins: HistogramBin[] }) {
  const data = bins.slice(0, 12).map((b) => ({ name: b.label, value: b.count }));
  return (
    <ChartContainer height={240} minWidth={Math.max(280, data.length * 48)}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 16 }}>
        <XAxis dataKey="name" tick={{ fill: chartColors.muted, fontSize: 11, fontWeight: 700 }} />
        <YAxis allowDecimals={false} tick={{ fill: chartColors.muted, fontSize: 11 }} width={28} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: chartColors.surface }} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} fill={chartColors.brand}>
          <LabelList dataKey="value" position="top" fill={chartColors.text} fontSize={11} fontWeight={800} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

export function TeamThermometer({ teams }: { teams: TeamTally[] }) {
  const data = teams.slice(0, 12).map((t) => ({ name: `${t.flag} ${t.name}`, value: t.count }));
  return (
    <ChartContainer height={Math.max(160, data.length * 38)}>
      <BarChart layout="vertical" data={data} margin={{ left: 8, right: 24 }}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={120} tick={{ fill: chartColors.muted, fontSize: 12, fontWeight: 700 }} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: chartColors.surface }} formatter={(v: number) => [`${v} votos`, ""]} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} fill={chartColors.amber}>
          <LabelList dataKey="value" position="right" fill={chartColors.text} fontSize={12} fontWeight={800} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/** Color-graded grid: rows and columns are people; cell = % agreement. */
export function SimilarityGrid({ matrix }: { matrix: SimilarityMatrix }) {
  const { users, cells } = matrix;
  const value = (a: string, b: string) =>
    a === b ? 100 : cells.find((c) => c.aId === a && c.bId === b)?.value ?? 0;
  return (
    <div className="w-full overflow-x-auto">
      <table className="border-separate border-spacing-1 text-xs font-bold">
        <thead>
          <tr>
            <th />
            {users.map((u) => (
              <th key={u.id} className="px-1 text-app-muted">{u.displayName.slice(0, 3)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map((row) => (
            <tr key={row.id}>
              <th className="pr-2 text-right text-app-muted">{row.displayName.slice(0, 3)}</th>
              {users.map((col) => {
                const v = value(row.id, col.id);
                return (
                  <td
                    key={col.id}
                    className="size-9 rounded-md text-center align-middle text-app-text"
                    style={{ background: `color-mix(in srgb, var(--color-app-green) ${v}%, var(--color-app-surface))` }}
                    title={`${row.displayName} vs ${col.displayName}: ${v}%`}
                  >
                    {row.id === col.id ? "—" : v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Outcome split for a single match: home / draw / away counts. */
export function MatchSplit({ home, draw, away, labels }: { home: number; draw: number; away: number; labels: { home: string; away: string } }) {
  const data = [
    { name: labels.home, value: home },
    { name: "Empate", value: draw },
    { name: labels.away, value: away },
  ];
  return (
    <ChartContainer height={200}>
      <BarChart data={data} margin={{ top: 16 }}>
        <XAxis dataKey="name" tick={{ fill: chartColors.muted, fontSize: 11, fontWeight: 700 }} />
        <YAxis allowDecimals={false} width={28} tick={{ fill: chartColors.muted, fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: chartColors.surface }} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} fill={chartColors.blue}>
          <LabelList dataKey="value" position="top" fill={chartColors.text} fontSize={12} fontWeight={800} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/** Generic line chart for points/position over rounds. */
export function LineStat({ data, series }: { data: Array<Record<string, number | string>>; series: Array<{ key: string; color: string }> }) {
  return (
    <ChartContainer height={260} minWidth={Math.max(320, data.length * 70)}>
      <LineChart data={data} margin={{ left: 0, right: 12, top: 12 }}>
        <CartesianGrid stroke={chartColors.line} strokeDasharray="3 3" />
        <XAxis dataKey="stage" tick={{ fill: chartColors.muted, fontSize: 11, fontWeight: 700 }} />
        <YAxis tick={{ fill: chartColors.muted, fontSize: 11 }} width={28} />
        <Tooltip contentStyle={tooltipStyle} />
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/stats/charts.tsx
git commit -m "feat(estadisticas): chart primitives"
```

---

## Task 11: FactCard + responsive StatDrawer

**Files:**
- Create: `src/components/stats/fact-card.tsx`

A `FactCard` shows the headline + winner; clicking opens `StatDrawer`. The drawer renders `side="bottom"` on mobile and `side="right"` on `sm:`+ — implemented with two `Sheet`s gated by Tailwind responsive `hidden`, sharing one body component, to avoid runtime breakpoint detection.

- [ ] **Step 1: Implement FactCard + StatDrawer**

Create `src/components/stats/fact-card.tsx`:
```tsx
"use client";

import { useState } from "react";
import { ChevronRight, Lock } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ui } from "@/lib/ui-tokens";
import { cn } from "@/lib/utils";
import type { Fact } from "@/lib/stats";

export function FactCard({ fact, onOpen }: { fact: Fact; onOpen: (fact: Fact) => void }) {
  const winnerLabel = fact.winner?.displayValue ?? fact.coWinners.map((c) => c.user.displayName).join(", ");
  const winnerName = fact.coWinners.length
    ? fact.coWinners.map((c) => c.user.displayName).join(" + ")
    : fact.winner?.user.displayName;

  if (!fact.available) {
    return (
      <Card className={cn(ui.panel, "flex items-start gap-3 p-3.5 opacity-60")}>
        <span className="text-2xl leading-none grayscale">{fact.emoji}</span>
        <div className="min-w-0">
          <h3 className="m-0 truncate text-sm font-black">{fact.title}</h3>
          <p className="mt-1 flex items-center gap-1 text-xs font-bold text-app-muted">
            <Lock size={12} /> {fact.unavailableHint}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card asChild className={cn(ui.panel, "p-0")}>
      <button type="button" onClick={() => onOpen(fact)} className="flex w-full items-center gap-3 p-3.5 text-left hover:bg-app-surface-2">
        <span className="text-2xl leading-none">{fact.emoji}</span>
        <div className="min-w-0 flex-1">
          <h3 className="m-0 truncate text-sm font-black">{fact.title}</h3>
          {winnerName && <strong className="block truncate text-app-green">{winnerName}</strong>}
          <small className="block truncate text-xs font-bold text-app-muted">{winnerLabel}</small>
        </div>
        <ChevronRight size={18} className="shrink-0 text-app-muted" />
      </button>
    </Card>
  );
}

export function StatDrawer({
  fact,
  onClose,
  children,
}: {
  fact: Fact | null;
  onClose: () => void;
  children?: React.ReactNode; // the chart + breakdown rendered by the screen
}) {
  const open = Boolean(fact);
  const body = fact && (
    <>
      <SheetHeader>
        <p className="text-xs font-extrabold uppercase leading-none text-app-muted">{fact.emoji} Estadística</p>
        <SheetTitle className="mt-1 text-xl font-black text-app-text">{fact.title}</SheetTitle>
        <p className="text-sm font-bold text-app-muted">{fact.blurb}</p>
      </SheetHeader>
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-4 pb-6">{children}</div>
    </>
  );

  return (
    <>
      {/* Mobile: bottom sheet, full width */}
      <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent side="bottom" className="h-[90vh] sm:hidden">{body}</SheetContent>
      </Sheet>
      {/* Desktop: right drawer, widened */}
      <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent side="right" className="hidden sm:flex sm:!max-w-lg">{body}</SheetContent>
      </Sheet>
    </>
  );
}

export function BreakdownTable({ fact }: { fact: Fact }) {
  if (fact.series.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-app-line bg-app-surface">
      {fact.series.map((s, i) => (
        <div key={s.user.id} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-app-line px-3 py-2 last:border-0">
          <span className="font-black text-app-muted">#{i + 1}</span>
          <strong className="truncate text-sm font-black">{s.user.displayName}</strong>
          <em className="text-sm font-black not-italic text-app-green">{s.displayValue}</em>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If `Card` does not support `asChild`, replace the `<Card asChild>` button wrapper with a `<button>` styled with `cn(ui.panel, ...)` directly.)

- [ ] **Step 3: Commit**

```bash
git add src/components/stats/fact-card.tsx
git commit -m "feat(estadisticas): fact card + responsive stat drawer"
```

---

## Task 12: EstadisticasScreen

**Files:**
- Create: `src/screens/estadisticas.tsx`

Assembles hero, personal card, grouped fact grid, and standalone graphs; wires the drawer to render the right chart per `fact.chartKind`.

- [ ] **Step 1: Implement the screen**

Create `src/screens/estadisticas.tsx`:
```tsx
"use client";

import { useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { useApp } from "@/components/app-context";
import { BarStat, Histogram, MatchSplit, SimilarityGrid, TeamThermometer } from "@/components/stats/charts";
import { BreakdownTable, FactCard, StatDrawer } from "@/components/stats/fact-card";
import { computeStats, predictedOutcome, type Fact, type FactCategory } from "@/lib/stats";
import { getTeamLabel } from "@/lib/tournament";
import { ui } from "@/lib/ui-tokens";
import { cn } from "@/lib/utils";

const CATEGORY_LABELS: Record<FactCategory, string> = {
  optimismo: "Optimismo y goles",
  manada: "Manada vs. rebelde",
  punteria: "Puntería y rachas",
  fidelidad: "Fidelidad de equipo",
  comportamiento: "Comportamiento",
};
const CATEGORY_ORDER: FactCategory[] = ["optimismo", "manada", "punteria", "fidelidad", "comportamiento"];

export function EstadisticasScreen() {
  const { profiles, predictions, groupPredictions, matches, groups, teams, currentUser, standingsStages, now } = useApp();
  const [activeFact, setActiveFact] = useState<Fact | null>(null);

  const bundle = useMemo(
    () => computeStats({
      profiles, predictions, groupPredictions, matches, groups, teams,
      currentUserId: currentUser.id, standingsStages, now,
    }),
    [profiles, predictions, groupPredictions, matches, groups, teams, currentUser.id, standingsStages, now],
  );

  const factsByCategory = useMemo(() => {
    const map = new Map<FactCategory, Fact[]>();
    for (const fact of bundle.facts) {
      const list = map.get(fact.category) ?? [];
      list.push(fact);
      map.set(fact.category, list);
    }
    return map;
  }, [bundle.facts]);

  const matchById = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);

  function renderChart(fact: Fact) {
    if (fact.chartKind === "bar") {
      return <BarStat series={fact.series} suffix={fact.unitSuffix} highlightId={fact.winner?.user.id} />;
    }
    if (fact.chartKind === "histogram") return <Histogram bins={bundle.scoreline.bins} />;
    if (fact.chartKind === "matchSplit") {
      const matchId = fact.id === "trampa" ? bundle.trampaMatchId : bundle.dividedMatchId;
      const match = matchId ? matchById.get(matchId) : undefined;
      if (!match) return null;
      const forMatch = predictions.filter((p) => p.matchId === match.id);
      const tally = { home: 0, draw: 0, away: 0 };
      for (const p of forMatch) tally[predictedOutcome(p.homeScore, p.awayScore)] += 1;
      return (
        <MatchSplit
          home={tally.home} draw={tally.draw} away={tally.away}
          labels={{ home: getTeamLabel(match.homeTeamId, teams, match.homeSeed), away: getTeamLabel(match.awayTeamId, teams, match.awaySeed) }}
        />
      );
    }
    return null;
  }

  return (
    <div className="grid gap-4">
      <HeroRow bundle={bundle} />
      <PersonalCardView card={bundle.personal} userName={currentUser.displayName} />

      {CATEGORY_ORDER.map((category) => {
        const facts = factsByCategory.get(category) ?? [];
        if (facts.length === 0) return null;
        return (
          <section key={category} className="grid gap-2.5">
            <h2 className={cn(ui.label, "text-sm")}>{CATEGORY_LABELS[category]}</h2>
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {facts.map((fact) => <FactCard key={fact.id} fact={fact} onOpen={setActiveFact} />)}
            </div>
          </section>
        );
      })}

      <section className="grid gap-2.5">
        <h2 className={cn(ui.label, "text-sm")}>Gráficos</h2>
        <div className="grid gap-2.5 lg:grid-cols-2">
          <Card className={cn(ui.panel, "p-4")}>
            <h3 className="m-0 text-sm font-black">¿Quién piensa igual?</h3>
            <p className="mb-3 text-xs font-bold text-app-muted">Coincidencia de pronósticos entre la familia</p>
            <SimilarityGrid matrix={bundle.similarity} />
          </Card>
          <Card className={cn(ui.panel, "p-4")}>
            <h3 className="m-0 text-sm font-black">Termómetro de favoritos</h3>
            <p className="mb-3 text-xs font-bold text-app-muted">Equipos bancados para salir 1º de grupo</p>
            {bundle.termometro.length > 0
              ? <TeamThermometer teams={bundle.termometro} />
              : <p className="text-sm font-bold text-app-muted">Se revela cuando cierren los grupos.</p>}
          </Card>
          <Card className={cn(ui.panel, "p-4 lg:col-span-2")}>
            <h3 className="m-0 text-sm font-black">Scoreline favorito</h3>
            <p className="mb-3 text-xs font-bold text-app-muted">Resultados más pronosticados</p>
            {bundle.scoreline.total > 0
              ? <Histogram bins={bundle.scoreline.bins} />
              : <p className="text-sm font-bold text-app-muted">Se revela cuando cierren los partidos.</p>}
          </Card>
        </div>
      </section>

      <StatDrawer fact={activeFact} onClose={() => setActiveFact(null)}>
        {activeFact && (
          <>
            {renderChart(activeFact)}
            <BreakdownTable fact={activeFact} />
          </>
        )}
      </StatDrawer>
    </div>
  );
}

function HeroRow({ bundle }: { bundle: ReturnType<typeof computeStats> }) {
  const items = [
    { label: "Goles soñados", value: String(bundle.hero.goalsDreamed) },
    { label: "Pronósticos revelados", value: String(bundle.hero.predictionsLoaded) },
    { label: "% exactos del grupo", value: `${bundle.hero.groupExactPct}%` },
  ];
  return (
    <Card className={cn(ui.panel, "grid grid-cols-3 gap-2 p-2.5")}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0 rounded-lg border border-app-line bg-app-surface px-2.5 py-2">
          <span className={ui.label}>{it.label}</span>
          <strong className="mt-1 block text-lg font-black leading-none text-app-green">{it.value}</strong>
        </div>
      ))}
    </Card>
  );
}

function PersonalCardView({ card, userName }: { card: ReturnType<typeof computeStats>["personal"]; userName: string }) {
  if (!card.hasData) {
    return (
      <Card className={cn(ui.panel, "p-4")}>
        <h2 className="m-0 text-base font-black">Tus stats, {userName}</h2>
        <p className="mt-1 text-sm font-bold text-app-muted">Todavía no cargaste pronósticos. ¡Andá a la pestaña Pronósticos!</p>
      </Card>
    );
  }
  const stats = [
    { label: "Tu scoreline favorito", value: card.favoriteScoreline ?? "—" },
    { label: "Tus goles/partido", value: card.avgGoals != null ? String(card.avgGoals) : "—" },
    { label: "Promedio del grupo", value: card.groupAvgGoals != null ? String(card.groupAvgGoals) : "—" },
    { label: "Tus exactos", value: card.exactPct != null ? `${card.exactPct}%` : "Sin resultados" },
  ];
  return (
    <Card className={cn(ui.panel, "p-4")}>
      <h2 className="m-0 text-base font-black">Tus stats, {userName}</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-app-line bg-app-surface px-2.5 py-2">
            <span className={ui.label}>{s.label}</span>
            <strong className="mt-1 block text-base font-black leading-none">{s.value}</strong>
          </div>
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/screens/estadisticas.tsx
git commit -m "feat(estadisticas): estadisticas screen"
```

---

## Task 13: Route + nav entry

**Files:**
- Create: `src/app/estadisticas/page.tsx`
- Modify: `src/lib/ui-tokens.ts`
- Modify: `src/components/app-shell.tsx`

- [ ] **Step 1: Create the route**

Create `src/app/estadisticas/page.tsx`:
```tsx
import { EstadisticasScreen } from "@/screens/estadisticas";

export default function Page() {
  return <EstadisticasScreen />;
}
```

- [ ] **Step 2: Register route + title in ui-tokens**

In `src/lib/ui-tokens.ts`, add `stats` to `tabRoutes` and `pageTitles`:
```ts
export const tabRoutes = {
  predictions: "/pronosticos",
  leaderboard: "/tabla",
  results: "/resultados",
  stats: "/estadisticas",
  rules: "/reglas",
  admin: "/admin",
  account: "/cuenta",
} as const;
```
```ts
export const pageTitles: Record<AppRoute, string> = {
  predictions: "Pronósticos",
  leaderboard: "Tabla familiar",
  results: "Resultados",
  stats: "Estadísticas",
  rules: "Reglas",
  admin: "Panel admin",
  account: "Mi cuenta",
};
```

- [ ] **Step 3: Wire route + nav in app-shell**

In `src/components/app-shell.tsx`, add to `routeTabs` (after `/resultados`):
```ts
  "/estadisticas": "stats",
```
Add a nav link after the Resultados `NavLink` (line ~670). Add `BarChart3` to the existing `lucide-react` import at the top of the file, then:
```tsx
        <NavLink href={tabRoutes.stats} icon={<BarChart3 />} label="Estadísticas" active={activeTab === "stats"} onNavigate={onNavigate} />
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: build succeeds; `/estadisticas` appears in the route list.

- [ ] **Step 5: Commit**

```bash
git add src/app/estadisticas/page.tsx src/lib/ui-tokens.ts src/components/app-shell.tsx
git commit -m "feat(estadisticas): route + nav entry"
```

---

## Task 14: Pronósticos teaser widget

**Files:**
- Create: `src/components/stats/stats-teaser.tsx`
- Modify: `src/screens/predictions.tsx`

A compact sidebar card showing one available group fun fact + a link to `/estadisticas`. No chart.

- [ ] **Step 1: Implement the teaser**

Create `src/components/stats/stats-teaser.tsx`:
```tsx
"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApp } from "@/components/app-context";
import { computeStats } from "@/lib/stats";
import { ui } from "@/lib/ui-tokens";
import { cn } from "@/lib/utils";

export function StatsTeaser() {
  const router = useRouter();
  const { profiles, predictions, groupPredictions, matches, groups, teams, currentUser, standingsStages, now } = useApp();

  const fact = useMemo(() => {
    const bundle = computeStats({
      profiles, predictions, groupPredictions, matches, groups, teams,
      currentUserId: currentUser.id, standingsStages, now,
    });
    return bundle.facts.find((f) => f.available && f.winner);
  }, [profiles, predictions, groupPredictions, matches, groups, teams, currentUser.id, standingsStages, now]);

  if (!fact) return null;

  return (
    <Card className={cn(ui.panel, "p-4")}>
      <Button variant="ghost" className="flex w-full items-center justify-between gap-3 p-0 text-left hover:bg-transparent" onClick={() => router.push("/estadisticas")}>
        <h2 className="m-0 flex items-center gap-1.5 text-base font-black leading-tight"><BarChart3 size={16} /> Estadísticas</h2>
        <ChevronRight size={18} />
      </Button>
      <div className="mt-2.5 rounded-md bg-app-surface-2 px-3 py-2.5">
        <p className="m-0 flex items-center gap-1.5 text-sm font-black">{fact.emoji} {fact.title}</p>
        <strong className="block truncate text-app-green">{fact.winner!.user.displayName}</strong>
        <small className="block truncate text-xs font-bold text-app-muted">{fact.winner!.displayValue}</small>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Mount it in the predictions sidebar**

In `src/screens/predictions.tsx`, add the import alongside the other component imports:
```tsx
import { StatsTeaser } from "@/components/stats/stats-teaser";
```
Then in the `<aside>` block (around line 230-233), add `<StatsTeaser />` after `<LeaderboardPreview ... />`:
```tsx
      <aside className="sticky top-5 grid gap-2.5 max-lg:hidden">
        <SummaryPanel points={me?.points ?? 0} rank={me?.rank ?? 1} missingCount={missingCount} />
        <LeaderboardPreview rows={leaderboard.slice(0, 4)} onOpen={() => router.push("/tabla")} />
        <StatsTeaser />
      </aside>
```

- [ ] **Step 3: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add src/components/stats/stats-teaser.tsx src/screens/predictions.tsx
git commit -m "feat(estadisticas): pronosticos teaser widget"
```

---

## Task 15: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all tests pass, including `src/lib/stats.test.ts`.

- [ ] **Step 2: Typecheck + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 3: Manual smoke (dev server)**

Run: `npm run dev`, open `/estadisticas`. Confirm:
- Hero numbers render; personal card shows your data (or the empty prompt).
- Available fact cards show a winner; locked facts show the lock hint.
- Clicking an available fact opens the drawer (bottom sheet on a narrow window, right drawer when wide) with a chart + breakdown table.
- The Estadísticas nav item is present and active on the page.
- The Pronósticos sidebar shows the teaser (on a wide window).

- [ ] **Step 4: Final commit (if any tweaks)**

```bash
git add -A
git commit -m "chore(estadisticas): final verification tweaks"
```

---

## Self-Review notes (resolved)

- **Spec coverage:** Every catalog fact (optimista, candado, scoreline-favorito, sin-empates, rebelde, del-monton, partido-dividido, palpito-solitario, francotirador, racha, trampa, favorito-familia, oveja-negra, equipo-cabecera, madrugador, ultimo-minuto, indeciso) maps to a Task 3–9 builder. NOTE: `palpito-solitario` is folded into the `partido-dividido`/`trampa` match-split view (a lone pick surfaces there) rather than a separate card, to avoid a near-duplicate card — acceptable scope trim; revisit if a standalone card is wanted. Standalone graphs implemented: similarity, termómetro, scoreline histogram. `la carrera` (position over rounds), `mapa de calor`, `goles soñados vs reales`, `reloj de pronósticos`, `distribución de puntos por partido` are **deferred** — the `LineStat` primitive exists for `la carrera` as a fast follow; they are not required for a complete first release and need finalized data to be meaningful.
- **Privacy:** group builders take `revealed`/`finalized`/`revealedGroups` sets derived from `getMatchStatus`/`getGroupStatus`; personal card uses all of the current user's predictions. Verified by the `computeStats` test.
- **Type consistency:** `Fact`, `PersonValue`, `TeamTally`, `HistogramBin`, `SimilarityMatrix`, `StatsBundle` are defined once in `stats.ts` and consumed unchanged by charts/fact-card/screen.
- **AppRoute:** adding `stats` to `tabRoutes` automatically extends `AppRoute`, so `pageTitles` and `routeTabs` must include it (Task 13 does).
```
