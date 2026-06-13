# Group-stage Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six group-stage stats to `/estadisticas` (Grupo de la muerte, Colista cantado, El profeta de los grupos, El visionario, La tabla soñada, Tu gemelo/opuesto), mining the full `GroupPrediction` ordering we currently under-use.

**Architecture:** A new pure builder `buildGroupRankingFacts` in `src/lib/stats.ts` produces four fact cards (category `grupos`) plus a `dreamTable`. A `pickTwinAndOpposite` helper derives personal twin/opposite from the existing similarity matrix. UI adds a `ConsensusBoard` component and a `leaderIcon` prop to `TeamThermometer`. Everything follows the established reveal gates: group-pick stats reveal when a group locks; `profeta` reveals when a group result finalizes; twin/opposite uses kickoff-revealed match similarity.

**Tech Stack:** TypeScript, Next.js 15 App Router, React 19, Recharts, Vitest (node env, `src/**/*.test.ts` only).

---

## File Structure

- **Modify** `src/lib/stats.ts` — add `Fact.bins` field, `grupos` category, `finalizedGroupLabels` helper, `buildGroupRankingFacts` builder + `DreamTableRow` type, `pickTwinAndOpposite` helper, `PersonalCard.twin/opposite` fields, `StatsBundle.dreamTable`, and `computeStats` wiring.
- **Modify** `src/lib/stats.test.ts` — new `describe` blocks for the helper, builder, and twin/opposite.
- **Modify** `src/components/stats/charts.tsx` — `leaderIcon` prop on `TeamThermometer`, new `ConsensusBoard` component.
- **Modify** `src/screens/estadisticas.tsx` — `grupos` category labels/order, `renderChart` histogram + colista-icon branches, La tabla soñada graph card, twin/opposite strip in `PersonalCardView`.

---

## Task 1: Scaffolding — `Fact.bins`, `grupos` category, `finalizedGroupLabels`

**Files:**
- Modify: `src/lib/stats.ts` (lines 7-15 type unions, ~38 Fact type, ~65-69 helper)
- Test: `src/lib/stats.test.ts` (visibility helpers describe, ~line 45)

- [ ] **Step 1: Write the failing test**

In `src/lib/stats.test.ts`, add to the existing `describe("visibility helpers", ...)` block (after the `revealedGroupLabels` test, before its closing `});`). Also add `finalizedGroupLabels` to the import on line 3.

```ts
  it("finalizedGroupLabels includes only groups whose result is finalized", () => {
    const open: Group = { groupLabel: "A", locksAt: "2026-06-01T00:00:00.000Z", firstTeamId: null, secondTeamId: null, thirdTeamId: null, fourthTeamId: null, resultFinalizedAt: null, resultFinalizedBy: null };
    const done: Group = { ...open, groupLabel: "B", resultFinalizedAt: "2026-06-10T00:00:00.000Z" };
    const labels = finalizedGroupLabels([open, done], now);
    expect(labels.has("A")).toBe(false);
    expect(labels.has("B")).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/stats.test.ts -t "finalizedGroupLabels"`
Expected: FAIL — `finalizedGroupLabels is not a function` (import undefined).

- [ ] **Step 3: Add the category, the `Fact.bins` field, and the helper**

In `src/lib/stats.ts`, change the `FactCategory` union (line 8):

```ts
export type FactCategory = "optimismo" | "manada" | "punteria" | "fidelidad" | "grupos" | "comportamiento";
```

Change the `FactId` union (lines 10-15) to add the four new ids:

```ts
export type FactId =
  | "optimista" | "candado" | "sin-empates"
  | "rebelde" | "del-monton" | "partido-dividido" | "palpito-solitario"
  | "francotirador" | "racha" | "trampa"
  | "mas-querido" | "mas-odiado" | "apuesta-audaz"
  | "grupo-muerte" | "colista" | "visionario" | "profeta-grupos"
  | "madrugador" | "ultimo-minuto" | "indeciso";
```

In the `Fact` type, add a `bins` field right after the `teamSeries` line (currently line 38):

```ts
  teamSeries?: TeamTally[]; // team-based chart data (for thermometer-style facts)
  bins?: HistogramBin[];    // histogram data carried on the fact (e.g. per-group contention)
```

Add the helper immediately after `revealedGroupLabels` (after its closing `}` near line 69):

```ts
export function finalizedGroupLabels(groups: Group[], now: Date): Set<string> {
  return new Set(
    groups.filter((g) => getGroupStatus(g, now) === "finalized").map((g) => g.groupLabel),
  );
}
```

> Note: `HistogramBin` is declared later in the file (line ~513). TypeScript hoists type declarations, so referencing it in the `Fact` type above is fine.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/stats.test.ts -t "finalizedGroupLabels"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.ts src/lib/stats.test.ts
git commit -m "feat(stats): add grupos category, Fact.bins, finalizedGroupLabels helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `buildGroupRankingFacts` builder + `DreamTableRow`

**Files:**
- Modify: `src/lib/stats.ts` (add builder after `buildTeamLoyaltyFacts`, ~line 414)
- Test: `src/lib/stats.test.ts` (new describe block)

- [ ] **Step 1: Write the failing tests**

In `src/lib/stats.test.ts`, add `buildGroupRankingFacts` to the import on line 3. Then add this new describe block after the `describe("team loyalty facts", ...)` block:

```ts
describe("group ranking facts", () => {
  const teams = [
    { id: "arg", name: "Argentina", shortName: "ARG", flag: "🇦🇷" },
    { id: "bra", name: "Brasil", shortName: "BRA", flag: "🇧🇷" },
    { id: "uru", name: "Uruguay", shortName: "URU", flag: "🇺🇾" },
    { id: "chi", name: "Chile", shortName: "CHI", flag: "🇨🇱" },
  ];
  const threeProfiles: Profile[] = [
    { id: "u1", displayName: "Ana", email: "a@x.com", approved: true, role: "user" },
    { id: "u2", displayName: "Beto", email: "b@x.com", approved: true, role: "user" },
    { id: "u3", displayName: "Caro", email: "c@x.com", approved: true, role: "user" },
  ];
  function grp(userId: string, label: string, order: [string, string, string, string], exactPositions = 0): GroupPrediction {
    return {
      id: `${userId}-${label}`, userId, groupLabel: label,
      firstTeamId: order[0], secondTeamId: order[1], thirdTeamId: order[2], fourthTeamId: order[3],
      points: null, exactPositions,
      createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z",
    };
  }
  // Group A: divided; Group B: full consensus.
  const gps: GroupPrediction[] = [
    grp("u1", "A", ["arg", "bra", "uru", "chi"], 4),
    grp("u2", "A", ["arg", "bra", "chi", "uru"], 2),
    grp("u3", "A", ["bra", "arg", "uru", "chi"], 0),
    grp("u1", "B", ["uru", "chi", "arg", "bra"]),
    grp("u2", "B", ["uru", "chi", "arg", "bra"]),
    grp("u3", "B", ["uru", "chi", "arg", "bra"]),
  ];
  const revealedGroups = new Set(["A", "B"]);
  const ranking = (finalized = new Set<string>()) =>
    buildGroupRankingFacts(threeProfiles, gps, teams, revealedGroups, finalized);

  it("grupo de la muerte picks the most-divided group", () => {
    const { grupoMuerte } = ranking();
    expect(grupoMuerte.headline).toContain("A");
    expect(grupoMuerte.bins?.[0]).toMatchObject({ label: "A", count: 33 });
    expect(grupoMuerte.bins?.find((b) => b.label === "B")?.count).toBe(0);
  });

  it("colista tallies most-predicted last-place teams", () => {
    const { colista } = ranking();
    expect(colista.headline).toContain("Brasil");
    expect(colista.teamSeries?.[0]).toMatchObject({ teamId: "bra", count: 3 });
  });

  it("visionario ranks people by full-order divergence from consensus", () => {
    const { visionario } = ranking();
    expect(visionario.series).toHaveLength(3);
    expect(visionario.winner?.value).toBe(2);
    expect(visionario.series.find((s) => s.user.id === "u1")?.value).toBe(0);
  });

  it("profeta sums exactPositions across finalized groups only", () => {
    const { profeta } = ranking(new Set(["A"]));
    expect(profeta.requires).toBe("results");
    expect(profeta.winner?.user.displayName).toBe("Ana");
    expect(profeta.winner?.value).toBe(4);
    expect(profeta.series.find((s) => s.user.id === "u3")?.value).toBe(0);
  });

  it("profeta is unavailable when no group result is finalized", () => {
    expect(ranking().profeta.available).toBe(false);
  });

  it("dream table picks each group's consensus winner", () => {
    const { dreamTable } = ranking();
    expect(dreamTable).toHaveLength(2);
    expect(dreamTable[0]).toMatchObject({ groupLabel: "A", teamId: "arg", votes: 2, total: 3 });
    expect(dreamTable[1]).toMatchObject({ groupLabel: "B", teamId: "uru", votes: 3, total: 3 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/stats.test.ts -t "group ranking facts"`
Expected: FAIL — `buildGroupRankingFacts is not a function`.

- [ ] **Step 3: Implement the builder**

In `src/lib/stats.ts`, add immediately after `buildTeamLoyaltyFacts` (after its closing `}` at line 414):

```ts
export type DreamTableRow = { groupLabel: string; teamId: string; name: string; flag: string; votes: number; total: number };

const GROUP_HINT = "Se revela cuando cierra el grupo";
const GROUP_RESULT_HINT = "Se revela cuando se cargan los resultados de los grupos";

/** Stats mined from the full group-stage rankings (1º–4º order + exact positions). */
export function buildGroupRankingFacts(
  profiles: Profile[],
  groupPredictions: GroupPrediction[],
  teams: Team[],
  revealedGroups: Set<string>,
  finalizedGroups: Set<string>,
) {
  const approved = approvedProfiles(profiles);
  const approvedIds = new Set(approved.map((p) => p.id));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const teamName = (id: string | null) => (id ? teamById.get(id)?.name ?? id : "");
  const teamFlag = (id: string | null) => (id ? teamById.get(id)?.flag ?? "🏳️" : "🏳️");
  const toTally = (counts: Map<string, number>): TeamTally[] =>
    [...counts.entries()]
      .map(([teamId, count]) => ({ teamId, name: teamName(teamId), flag: teamFlag(teamId), count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const slots: Array<keyof GroupPrediction> = ["firstTeamId", "secondTeamId", "thirdTeamId", "fourthTeamId"];
  const revealed = groupPredictions.filter(
    (g) => revealedGroups.has(g.groupLabel) && approvedIds.has(g.userId) && g.firstTeamId,
  );

  const byGroup = new Map<string, GroupPrediction[]>();
  for (const g of revealed) {
    const list = byGroup.get(g.groupLabel) ?? [];
    list.push(g);
    byGroup.set(g.groupLabel, list);
  }

  // Modal (most-voted) team per (group, slot) + per-group contention. Needs ≥2 pickers.
  const modalAt = new Map<string, string>(); // `${group}:${slotIndex}` -> teamId
  const contentionByGroup = new Map<string, number>();
  for (const [label, picks] of byGroup) {
    if (picks.length < 2) continue;
    let disagreement = 0;
    slots.forEach((slot, i) => {
      const tally = new Map<string, number>();
      for (const p of picks) {
        const teamId = p[slot] as string | null;
        if (teamId) tally.set(teamId, (tally.get(teamId) ?? 0) + 1);
      }
      const top = [...tally.entries()].sort((a, b) => b[1] - a[1] || teamName(a[0]).localeCompare(teamName(b[0])))[0];
      if (top) modalAt.set(`${label}:${i}`, top[0]);
      disagreement += 1 - (top?.[1] ?? 0) / picks.length;
    });
    contentionByGroup.set(label, disagreement / slots.length);
  }

  // 1 · Grupo de la muerte.
  const contentionBins: HistogramBin[] = [...contentionByGroup.entries()]
    .map(([label, c]) => ({ label, count: Math.round(c * 100) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const worst = contentionBins[0];
  const grupoMuerte: Fact = {
    id: "grupo-muerte", category: "grupos", title: "Grupo de la muerte", emoji: "🪦",
    blurb: "El grupo donde la familia menos se pone de acuerdo", requires: "predictions",
    available: Boolean(worst), unavailableHint: GROUP_HINT, chartKind: "histogram",
    headline: worst ? `Grupo ${worst.label}` : undefined,
    winner: worst ? { user: approved[0]!, value: worst.count, displayValue: `${worst.count}% de desacuerdo` } : undefined,
    coWinners: [], series: [], bins: contentionBins,
  };

  // 2 · Colista cantado — most-predicted 4th place.
  const lastCounts = new Map<string, number>();
  for (const g of revealed) if (g.fourthTeamId) lastCounts.set(g.fourthTeamId, (lastCounts.get(g.fourthTeamId) ?? 0) + 1);
  const colistaTally = toTally(lastCounts);
  const buried = colistaTally[0];
  const colista: Fact = {
    id: "colista", category: "grupos", title: "El colista cantado", emoji: "⚰️",
    blurb: "El equipo que la familia más entierra en el fondo del grupo", requires: "predictions",
    available: Boolean(buried), unavailableHint: GROUP_HINT, chartKind: "thermometer", unitSuffix: "votos",
    headline: buried ? `${buried.flag} ${buried.name}` : undefined,
    winner: buried ? { user: approved[0]!, value: buried.count, displayValue: `${buried.count} ${buried.count === 1 ? "voto" : "votos"} al fondo` } : undefined,
    coWinners: [], series: [], teamSeries: colistaTally,
  };

  // 4 · El visionario — full-order divergence from the family consensus.
  const divergence: PersonValue[] = [];
  for (const user of approved) {
    const mine = revealed.filter((g) => g.userId === user.id);
    if (mine.length === 0) continue;
    let diff = 0;
    for (const g of mine) {
      slots.forEach((slot, i) => {
        const modal = modalAt.get(`${g.groupLabel}:${i}`);
        const teamId = g[slot] as string | null;
        if (modal && teamId && teamId !== modal) diff += 1;
      });
    }
    divergence.push({ user, value: diff, displayValue: `${diff} ${diff === 1 ? "casillero distinto" : "casilleros distintos"}` });
  }
  divergence.sort((a, b) => b.value - a.value);
  const visionario: Fact = {
    id: "visionario", category: "grupos", title: "El visionario", emoji: "👁️",
    blurb: "Quien arma los grupos más distinto a todos", requires: "predictions",
    available: divergence.length > 0, unavailableHint: GROUP_HINT, chartKind: "bar", unitSuffix: "",
    winner: divergence[0], coWinners: [], series: divergence,
  };

  // 3 · El profeta de los grupos — exact positions across finalized groups.
  const profetaScore: PersonValue[] = [];
  for (const user of approved) {
    const mine = groupPredictions.filter((g) => g.userId === user.id && finalizedGroups.has(g.groupLabel));
    if (mine.length === 0) continue;
    const total = mine.reduce((t, g) => t + (g.exactPositions ?? 0), 0);
    profetaScore.push({ user, value: total, displayValue: `${total} ${total === 1 ? "acierto" : "aciertos"} de orden` });
  }
  profetaScore.sort((a, b) => b.value - a.value);
  const profeta: Fact = {
    id: "profeta-grupos", category: "grupos", title: "El profeta de los grupos", emoji: "🔮",
    blurb: "Quien más veces clavó el orden de un grupo", requires: "results",
    available: profetaScore.length > 0, unavailableHint: GROUP_RESULT_HINT, chartKind: "bar", unitSuffix: "",
    winner: profetaScore[0], coWinners: [], series: profetaScore,
  };

  // 9 · La tabla soñada — consensus 1st place per locked group.
  const dreamTable: DreamTableRow[] = [];
  for (const [label, picks] of byGroup) {
    const tally = new Map<string, number>();
    for (const p of picks) if (p.firstTeamId) tally.set(p.firstTeamId, (tally.get(p.firstTeamId) ?? 0) + 1);
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1] || teamName(a[0]).localeCompare(teamName(b[0])))[0];
    if (!top) continue;
    dreamTable.push({ groupLabel: label, teamId: top[0], name: teamName(top[0]), flag: teamFlag(top[0]), votes: top[1], total: picks.length });
  }
  dreamTable.sort((a, b) => a.groupLabel.localeCompare(b.groupLabel));

  return { grupoMuerte, colista, visionario, profeta, dreamTable };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/stats.test.ts -t "group ranking facts"`
Expected: PASS (all 6).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.ts src/lib/stats.test.ts
git commit -m "feat(stats): buildGroupRankingFacts (grupo de la muerte, colista, visionario, profeta, tabla soñada)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `pickTwinAndOpposite` + PersonalCard fields

**Files:**
- Modify: `src/lib/stats.ts` (`PersonalCard` type ~530, add helper after `buildPersonalCard` ~573)
- Test: `src/lib/stats.test.ts` (new describe block)

- [ ] **Step 1: Write the failing tests**

In `src/lib/stats.test.ts`, add `pickTwinAndOpposite` to the import on line 3. Add this describe block after the `describe("similarity matrix", ...)` block (or anywhere among the top-level describes):

```ts
describe("twin and opposite", () => {
  const users: Profile[] = [
    profiles[0]!, profiles[1]!,
    { id: "u3", displayName: "Caro", email: "c@x.com", approved: true, role: "user" },
  ];
  const matrix = {
    users,
    cells: [
      { aId: "u1", bId: "u2", value: 80 }, { aId: "u1", bId: "u3", value: 30 },
      { aId: "u2", bId: "u1", value: 80 }, { aId: "u2", bId: "u3", value: 50 },
      { aId: "u3", bId: "u1", value: 30 }, { aId: "u3", bId: "u2", value: 50 },
    ],
  };

  it("picks the most and least similar family member", () => {
    expect(pickTwinAndOpposite(matrix, "u1")).toEqual({
      twin: { name: "Beto", pct: 80 },
      opposite: { name: "Caro", pct: 30 },
    });
  });

  it("returns nothing when the row shows no agreement", () => {
    const empty = { users, cells: [{ aId: "u1", bId: "u2", value: 0 }, { aId: "u1", bId: "u3", value: 0 }] };
    expect(pickTwinAndOpposite(empty, "u1")).toEqual({});
  });

  it("gives only a twin when there is a single other person", () => {
    const pair = { users: [users[0]!, users[1]!], cells: [{ aId: "u1", bId: "u2", value: 70 }, { aId: "u2", bId: "u1", value: 70 }] };
    expect(pickTwinAndOpposite(pair, "u1")).toEqual({ twin: { name: "Beto", pct: 70 } });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/stats.test.ts -t "twin and opposite"`
Expected: FAIL — `pickTwinAndOpposite is not a function`.

- [ ] **Step 3: Add the type fields and helper**

In `src/lib/stats.ts`, extend the `PersonalCard` type (currently lines 530-538) by adding two fields before the closing `}`:

```ts
  groupsPicked?: number;
  groupChampions?: string;
  twin?: { name: string; pct: number };
  opposite?: { name: string; pct: number };
};
```

Add the helper immediately after `buildPersonalCard` (after its closing `}` at line 573):

```ts
/** From the similarity matrix, the current user's most- and least-similar family member. */
export function pickTwinAndOpposite(
  similarity: SimilarityMatrix,
  currentUserId: string,
): { twin?: { name: string; pct: number }; opposite?: { name: string; pct: number } } {
  const nameById = new Map(similarity.users.map((u) => [u.id, u.displayName]));
  const myCells = similarity.cells
    .filter((c) => c.aId === currentUserId)
    .sort((a, b) => b.value - a.value || (nameById.get(a.bId) ?? "").localeCompare(nameById.get(b.bId) ?? ""));
  if (myCells.length === 0 || myCells[0]!.value === 0) return {};
  const top = myCells[0]!;
  const bottom = myCells[myCells.length - 1]!;
  const twin = { name: nameById.get(top.bId) ?? "", pct: top.value };
  const opposite = myCells.length >= 2 ? { name: nameById.get(bottom.bId) ?? "", pct: bottom.value } : undefined;
  return opposite ? { twin, opposite } : { twin };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/stats.test.ts -t "twin and opposite"`
Expected: PASS (all 3).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.ts src/lib/stats.test.ts
git commit -m "feat(stats): pickTwinAndOpposite + PersonalCard twin/opposite fields

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Charts — `leaderIcon` prop + `ConsensusBoard`

**Files:**
- Modify: `src/components/stats/charts.tsx` (import line 9, `TeamThermometer` ~56-70, append component)

No unit test (the project has no `.tsx` tests); verify with `tsc` + `build`.

- [ ] **Step 1: Add `DreamTableRow` to the charts import**

In `src/components/stats/charts.tsx`, line 9 currently reads:

```ts
import type { AccuracyBreakdownRow, HistogramBin, PersonValue, SimilarityMatrix, TeamTally } from "@/lib/stats";
```

Change it to:

```ts
import type { AccuracyBreakdownRow, DreamTableRow, HistogramBin, PersonValue, SimilarityMatrix, TeamTally } from "@/lib/stats";
```

- [ ] **Step 2: Add the `leaderIcon` prop to `TeamThermometer`**

Replace the `TeamThermometer` function (currently lines 56-70) with:

```tsx
export function TeamThermometer({ teams, leaderIcon = "👑" }: { teams: TeamTally[]; leaderIcon?: string }) {
  const max = Math.max(0, ...teams.map((t) => t.count));
  const data = teams.slice(0, 12).map((t) => {
    const leader = t.count === max && max > 0;
    return { name: `${leader ? `${leaderIcon} ` : ""}${t.flag} ${t.name}`, value: t.count, leader };
  });
  return (
    <ChartContainer height={Math.max(160, data.length * 38)}>
      <BarChart layout="vertical" data={data} margin={{ left: 8, right: 24 }}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={132} tick={{ fill: chartColors.muted, fontSize: 12, fontWeight: 700 }} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: chartColors.surface }} formatter={(v: number) => [`${v} votos`, ""]} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
          {data.map((d) => <Cell key={d.name} fill={d.leader ? chartColors.green : chartColors.amber} />)}
          <LabelList dataKey="value" position="right" fill={chartColors.text} fontSize={12} fontWeight={800} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 3: Append the `ConsensusBoard` component**

At the end of `src/components/stats/charts.tsx`, add:

```tsx
/** Board of each locked group's consensus 1st-place pick (La tabla soñada). */
export function ConsensusBoard({ rows }: { rows: DreamTableRow[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {rows.map((r) => (
        <div key={r.groupLabel} className="rounded-lg border border-app-line bg-app-surface px-2.5 py-2">
          <span className="text-[10px] font-black uppercase tracking-wide text-app-muted">Grupo {r.groupLabel}</span>
          <strong className="mt-1 block truncate text-sm font-black">{r.flag} {r.name}</strong>
          <small className="text-xs font-bold text-app-muted">{r.votes}/{r.total} votos</small>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: `No errors found` (note: `ConsensusBoard` is exported but not yet used — that's fine, it's a public export, not a lint error).

- [ ] **Step 5: Commit**

```bash
git add src/components/stats/charts.tsx
git commit -m "feat(stats): TeamThermometer leaderIcon prop + ConsensusBoard component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Wire builder + twin/opposite + dreamTable into `computeStats`

**Files:**
- Modify: `src/lib/stats.ts` (`StatsBundle` ~689-703, `computeStats` ~705-763)
- Test: `src/lib/stats.test.ts` (`describe("computeStats", ...)` block)

- [ ] **Step 1: Write the failing test**

In `src/lib/stats.test.ts`, add to the existing `describe("computeStats", ...)` block (after the first `it(...)`, before its closing `});`):

```ts
  it("includes the grupos facts and a dream table in the bundle", () => {
    const now = new Date("2026-06-12T12:00:00.000Z");
    const bundle = computeStats({
      profiles: seedProfiles, predictions: seedPreds, groupPredictions: seedGroupPreds,
      matches: seedMatches, groups: seedGroups, teams: seedTeams,
      currentUserId: "u1", standingsStages: new Set(["groups"]), now,
    });
    expect(bundle.facts.some((f) => f.category === "grupos")).toBe(true);
    expect(Array.isArray(bundle.dreamTable)).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/stats.test.ts -t "includes the grupos facts"`
Expected: FAIL — `bundle.dreamTable` is `undefined` / no `grupos` facts present.

- [ ] **Step 3: Add `dreamTable` to `StatsBundle`**

In `src/lib/stats.ts`, in the `StatsBundle` type, add the field after `goalMargin` (line 700):

```ts
  goalMargin: { bins: HistogramBin[]; total: number };
  dreamTable: DreamTableRow[];
```

- [ ] **Step 4: Wire the builder, twin/opposite, and dreamTable in `computeStats`**

In `computeStats`, after the line that computes `revealedGroups` (line 709), add:

```ts
  const finalizedGroups = finalizedGroupLabels(groups, now);
```

After the `goalMargin` computation (line 723), add:

```ts
  const groupRanking = buildGroupRankingFacts(profiles, groupPredictions, teams, revealedGroups, finalizedGroups);
  const twinOpposite = pickTwinAndOpposite(similarity, currentUserId);
```

In the `facts` array (lines 725-731), add the four group facts after the loyalty line:

```ts
    loyalty.masQuerido, loyalty.masOdiado, loyalty.apuestaAudaz,
    groupRanking.grupoMuerte, groupRanking.colista, groupRanking.visionario, groupRanking.profeta,
    behavior.madrugador, behavior.ultimoMinuto, behavior.indeciso,
```

Change the returned `personal` line (line 750) to merge twin/opposite:

```ts
    personal: { ...buildPersonalCard(predictions, currentUserId, groupAvgGoals, finalized, groupPredictions, teams), ...twinOpposite },
```

Add `dreamTable` to the returned object after `goalMargin` (line 759):

```ts
    goalMargin,
    dreamTable: groupRanking.dreamTable,
```

- [ ] **Step 5: Run the full stats test file to verify it passes**

Run: `npx vitest run src/lib/stats.test.ts`
Expected: PASS (all blocks, including the new computeStats assertion).

- [ ] **Step 6: Commit**

```bash
git add src/lib/stats.ts src/lib/stats.test.ts
git commit -m "feat(stats): wire group ranking facts, dream table and twin/opposite into computeStats

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Screen wiring — category, charts, board, twin/opposite strip

**Files:**
- Modify: `src/screens/estadisticas.tsx` (import line 7, category consts 21-28, `renderChart` 54-74, Gráficos section ~135-142, `PersonalCardView` ~203-221)

No unit test; verify with `tsc` + `lint` + `build`.

- [ ] **Step 1: Add `ConsensusBoard` to the charts import**

Line 7 currently:

```ts
import { BarStat, Histogram, LineStat, MatchSplit, SimilarityGrid, StackedAccuracy, TeamThermometer } from "@/components/stats/charts";
```

Change to:

```ts
import { BarStat, ConsensusBoard, Histogram, LineStat, MatchSplit, SimilarityGrid, StackedAccuracy, TeamThermometer } from "@/components/stats/charts";
```

- [ ] **Step 2: Add the `grupos` category label and order**

Replace the category constants (lines 21-28) with:

```ts
const CATEGORY_LABELS: Record<FactCategory, string> = {
  optimismo: "Optimismo y goles",
  manada: "Manada vs. rebelde",
  punteria: "Puntería y rachas",
  fidelidad: "Fidelidad de equipo",
  grupos: "Fase de grupos",
  comportamiento: "Comportamiento",
};
const CATEGORY_ORDER: FactCategory[] = ["optimismo", "manada", "punteria", "fidelidad", "grupos", "comportamiento"];
```

- [ ] **Step 3: Restore a histogram branch and give colista its icon in `renderChart`**

In `renderChart`, the thermometer line (line 58) currently:

```tsx
    if (fact.chartKind === "thermometer") return <TeamThermometer teams={fact.teamSeries ?? bundle.termometro} />;
```

Replace it with these two lines:

```tsx
    if (fact.chartKind === "histogram") return <Histogram bins={fact.bins ?? []} />;
    if (fact.chartKind === "thermometer") return <TeamThermometer teams={fact.teamSeries ?? bundle.termometro} leaderIcon={fact.id === "colista" ? "⚰️" : undefined} />;
```

- [ ] **Step 4: Add the La tabla soñada graph card**

In the Gráficos section, the "Distribución de aciertos" card currently ends at line 141 (`</Card>`) followed by `</div>` on line 142. Insert a new card between that `</Card>` and the `</div>`:

```tsx
          </Card>
          <Card className={cn(ui.panel, "p-4 lg:col-span-2")}>
            <h3 className="m-0 text-sm font-black">La tabla soñada</h3>
            <p className="mb-3 text-xs font-bold text-app-muted">El 1º de cada grupo según la familia</p>
            {bundle.dreamTable.length > 0
              ? <ConsensusBoard rows={bundle.dreamTable} />
              : <p className="text-sm font-bold text-app-muted">Se muestra a medida que cierran los grupos.</p>}
          </Card>
        </div>
      </section>
```

(Replace the existing `</Card>\n        </div>\n      </section>` at lines 141-143 with the block above.)

- [ ] **Step 5: Add the twin/opposite strip to `PersonalCardView`**

In `PersonalCardView`, the `groupChampions` block currently ends at line 219 (`)}`) before `</Card>`. Insert the twin/opposite strip after it:

```tsx
      {card.groupChampions && (
        <div className="mt-2 rounded-lg border border-app-line bg-app-surface px-2.5 py-2">
          <span className={ui.label}>Tus cabezas de grupo ({card.groupsPicked})</span>
          <strong className="mt-1 block text-lg font-black leading-none tracking-wide">{card.groupChampions}</strong>
        </div>
      )}
      {(card.twin || card.opposite) && (
        <div className="mt-2 flex flex-wrap gap-2 text-xs font-black">
          {card.twin && (
            <span className="rounded-full border border-app-line bg-app-surface px-2.5 py-1">👯 Tu gemelo: {card.twin.name} ({card.twin.pct}%)</span>
          )}
          {card.opposite && (
            <span className="rounded-full border border-app-line bg-app-surface px-2.5 py-1">🃏 Tu opuesto: {card.opposite.name} ({card.opposite.pct}%)</span>
          )}
        </div>
      )}
    </Card>
```

(This replaces the existing `groupChampions` block + its trailing `</Card>` at lines 214-220.)

- [ ] **Step 6: Verify types, lint, and build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: `No errors found`, `No issues found`, build completes (the `/estadisticas` route builds).

- [ ] **Step 7: Commit**

```bash
git add src/screens/estadisticas.tsx
git commit -m "feat(estadisticas): surface group-stage stats (grupos category, tabla soñada, twin/opposite)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] Run the whole suite + checks:

```bash
npx vitest run src/lib/stats.test.ts && npx tsc --noEmit && npm run lint && npm run build
```

Expected: tests PASS, `No errors found`, `No issues found`, build completes.

---

## Self-review notes (for the implementer)

- **Spec coverage:** Tasks map 1:1 to the six stats — Grupo de la muerte / Colista / Visionario / Profeta / Tabla soñada (Task 2 + 5 + 6), Tu gemelo/opuesto (Task 3 + 5 + 6). Scaffolding (category, `Fact.bins`, `finalizedGroupLabels`) in Task 1. `apuesta-audaz` is untouched (kept + differentiated per the spec decision).
- **Reveal gates:** group facts use `GROUP_HINT` and the `revealedGroups` filter; `profeta` uses `GROUP_RESULT_HINT` + `finalizedGroups`; twin/opposite rides the kickoff-gated similarity matrix.
- **Tie-breaks:** modal teams and tallies break ties by team name; groups by `groupLabel`; twin/opposite by display name — all deterministic, matching the spec.
- **Type consistency:** `DreamTableRow` defined in Task 2, consumed in Task 4/6; `Fact.bins` added in Task 1, set in Task 2, read in Task 6; `PersonalCard.twin/opposite` added in Task 3, set in Task 5, read in Task 6; `buildGroupRankingFacts` signature is identical across Tasks 2 and 5.
