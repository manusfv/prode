# El veredicto — Results Cross-Check Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "El veredicto" section to `/estadisticas` with 10 cards that score the family's predictions against actual results (who was bold and right, who flopped, which teams beat/missed expectations).

**Architecture:** One new builder `buildVerdictFacts` in `src/lib/stats.ts` produces all 10 `Fact`s; a new `FactCategory: "veredicto"` renders them as a card section (last) in `src/screens/estadisticas.tsx`. All cards reuse existing chart kinds (`bar`, `thermometer`, `histogram`) and the existing `FactCard`/`StatDrawer` UI. The builder receives the real `groups: Group[]` (finishing order) plus the already-computed revealed/finalized match & group sets.

**Tech Stack:** TypeScript, React, Vitest, recharts. Spanish (rioplatense) UI copy.

**Spec:** `docs/superpowers/specs/2026-06-14-verdict-stats-design.md`

**Conventions used across tasks:**
- All verdict facts: `category: "veredicto"`, `requires: "results"`.
- Group-result hint: `"Se revela cuando se cargan los resultados de los grupos"`.
- Match-result hint: `"Se revela a medida que se cargan los resultados"`.
- Run tests with: `npx vitest run src/lib/stats.test.ts`
- Each task ends by running `npx vitest run src/lib/stats.test.ts` (all green) before commit.

---

## Task 1: Shared helpers + types

**Files:**
- Modify: `src/lib/stats.ts` (export `crowdOutcomeByMatch`; add `FactCategory` + `FactId` members; add `modalGroupPositions` helper)
- Test: `src/lib/stats.test.ts`

- [ ] **Step 1: Add the new category and fact ids to the type unions**

In `src/lib/stats.ts`, extend `FactCategory` and `FactId`:

```ts
export type FactCategory = "optimismo" | "manada" | "punteria" | "fidelidad" | "comportamiento" | "veredicto";

export type FactId =
  | "optimista" | "candado" | "sin-empates"
  | "rebelde" | "del-monton" | "partido-dividido" | "palpito-solitario"
  | "francotirador" | "racha" | "trampa"
  | "mas-querido" | "mas-odiado" | "apuesta-audaz" | "apuesta-segura" | "favorito-familia"
  | "grupo-muerte" | "grupo-unanime" | "colista" | "visionario" | "profeta-grupos"
  | "madrugador" | "ultimo-minuto" | "indeciso"
  | "audaz-premiada" | "rebelde-razon" | "profeta-solitario" | "visionario-confirmado"
  | "sorpresa" | "decepcion" | "ojo-clinico" | "metodo-paga" | "manada-sabia" | "grupo-cantado";
```

- [ ] **Step 2: Export `crowdOutcomeByMatch`**

Find `function crowdOutcomeByMatch(` (around line 180) and add the `export` keyword:

```ts
export function crowdOutcomeByMatch(predictions: Prediction[], revealed: Set<string>) {
```

- [ ] **Step 3: Write the failing test for `modalGroupPositions`**

Add to `src/lib/stats.test.ts` — first add `modalGroupPositions` to the import on line 3 (append to the existing `from "./stats"` list), then add this block after the `"group ranking facts"` describe:

```ts
describe("modalGroupPositions helper", () => {
  function grp(userId: string, label: string, order: [string, string, string, string]): GroupPrediction {
    return {
      id: `${userId}-${label}`, userId, groupLabel: label,
      firstTeamId: order[0], secondTeamId: order[1], thirdTeamId: order[2], fourthTeamId: order[3],
      points: null, exactPositions: 0,
      createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z",
    };
  }
  it("returns the most-voted team per group:slot, ignoring <2-picker groups", () => {
    const gps = [
      grp("u1", "A", ["arg", "bra", "uru", "chi"]),
      grp("u2", "A", ["arg", "uru", "bra", "chi"]),
      grp("u3", "B", ["bra", "arg", "uru", "chi"]), // single picker -> ignored
    ];
    const modal = modalGroupPositions(gps, (id) => id);
    expect(modal.get("A:0")).toBe("arg"); // arg 1st twice
    expect(modal.get("A:3")).toBe("chi"); // chi 4th twice
    expect(modal.has("B:0")).toBe(false); // only one picker in B
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run src/lib/stats.test.ts -t "modalGroupPositions"`
Expected: FAIL — `modalGroupPositions is not a function` / import error.

- [ ] **Step 5: Implement `modalGroupPositions`**

In `src/lib/stats.ts`, add near the other module-level helpers (after `topTeamHeadline`, before `buildOptimismFacts`):

```ts
const GROUP_SLOTS: Array<keyof GroupPrediction> = ["firstTeamId", "secondTeamId", "thirdTeamId", "fourthTeamId"];

// Family consensus team per `${groupLabel}:${slotIndex}`. Needs ≥2 pickers in the
// group (a lone picker has no "consensus"). Ties broken by team name.
export function modalGroupPositions(
  revealed: GroupPrediction[],
  teamName: (id: string) => string,
): Map<string, string> {
  const byGroup = new Map<string, GroupPrediction[]>();
  for (const g of revealed) {
    const list = byGroup.get(g.groupLabel) ?? [];
    list.push(g);
    byGroup.set(g.groupLabel, list);
  }
  const modal = new Map<string, string>();
  for (const [label, picks] of byGroup) {
    if (picks.length < 2) continue;
    GROUP_SLOTS.forEach((slot, i) => {
      const tally = new Map<string, number>();
      for (const p of picks) {
        const teamId = p[slot] as string | null;
        if (teamId) tally.set(teamId, (tally.get(teamId) ?? 0) + 1);
      }
      const top = [...tally.entries()].sort((a, b) => b[1] - a[1] || teamName(a[0]).localeCompare(teamName(b[0])))[0];
      if (top) modal.set(`${label}:${i}`, top[0]);
    });
  }
  return modal;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/lib/stats.test.ts -t "modalGroupPositions"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/stats.ts src/lib/stats.test.ts
git commit -m "feat(stats): verdict category, fact ids, modalGroupPositions helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `buildVerdictFacts` skeleton + first card (Apuesta audaz premiada) + full wiring

This task creates the builder with its first fact and wires it end-to-end (computeStats + screen), so the section renders.

**Files:**
- Modify: `src/lib/stats.ts` (add `buildVerdictFacts`; call it in `computeStats`; append facts)
- Modify: `src/screens/estadisticas.tsx` (`CATEGORY_LABELS`, `CATEGORY_ORDER`, thermometer `leaderIcon`)
- Test: `src/lib/stats.test.ts`

- [ ] **Step 1: Write the failing test**

Add a new describe block at the end of `src/lib/stats.test.ts`. It defines fixtures reused by later tasks:

```ts
describe("verdict facts", () => {
  const vTeams = [
    { id: "arg", name: "Argentina", shortName: "ARG", flag: "🇦🇷" },
    { id: "bra", name: "Brasil", shortName: "BRA", flag: "🇧🇷" },
    { id: "uru", name: "Uruguay", shortName: "URU", flag: "🇺🇾" },
    { id: "chi", name: "Chile", shortName: "CHI", flag: "🇨🇱" },
  ];
  const vProfiles: Profile[] = [
    { id: "u1", displayName: "Ana", email: "a@x.com", approved: true, role: "user" },
    { id: "u2", displayName: "Beto", email: "b@x.com", approved: true, role: "user" },
    { id: "u3", displayName: "Caro", email: "c@x.com", approved: true, role: "user" },
  ];
  function vgrp(userId: string, label: string, order: [string, string, string, string], exactPositions = 0): GroupPrediction {
    return {
      id: `${userId}-${label}`, userId, groupLabel: label,
      firstTeamId: order[0], secondTeamId: order[1], thirdTeamId: order[2], fourthTeamId: order[3],
      points: null, exactPositions,
      createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z",
    };
  }
  // group A finished arg,bra,uru,chi (real result on the Group object)
  function vgroup(label: string, order: [string, string, string, string], finalized: boolean): Group {
    return {
      groupLabel: label, locksAt: "2026-06-01T00:00:00.000Z",
      firstTeamId: order[0], secondTeamId: order[1], thirdTeamId: order[2], fourthTeamId: order[3],
      resultFinalizedAt: finalized ? "2026-06-10T00:00:00.000Z" : null, resultFinalizedBy: finalized ? "u1" : null,
    };
  }

  it("audaz-premiada credits lone 1st picks that actually finished 1st", () => {
    // Ana alone picks uru 1st in A; group A actually finished uru 1st -> vindicated.
    // Beto/Caro both pick arg 1st (shared, not lone). Ana's pick is bold AND right.
    const gps = [
      vgrp("u1", "A", ["uru", "arg", "bra", "chi"]),
      vgrp("u2", "A", ["arg", "uru", "bra", "chi"]),
      vgrp("u3", "A", ["arg", "uru", "bra", "chi"]),
    ];
    const groups = [vgroup("A", ["uru", "arg", "bra", "chi"], true)];
    const { audazPremiada } = buildVerdictFacts(
      vProfiles, [], gps, [], groups, vTeams,
      new Set(), new Set(), new Set(["A"]), new Set(["A"]),
    );
    expect(audazPremiada.available).toBe(true);
    expect(audazPremiada.winner?.user.displayName).toBe("Ana");
    expect(audazPremiada.winner?.value).toBe(1);
    expect(audazPremiada.winner?.displayValue).toContain("Uruguay");
  });

  it("audaz-premiada shows a 'todavía' headline when no lone pick landed", () => {
    // Ana alone on chi 1st, but chi actually finished last -> nobody vindicated.
    const gps = [
      vgrp("u1", "A", ["chi", "arg", "bra", "uru"]),
      vgrp("u2", "A", ["arg", "uru", "bra", "chi"]),
      vgrp("u3", "A", ["arg", "uru", "bra", "chi"]),
    ];
    const groups = [vgroup("A", ["arg", "uru", "bra", "chi"], true)];
    const { audazPremiada } = buildVerdictFacts(
      vProfiles, [], gps, [], groups, vTeams,
      new Set(), new Set(), new Set(["A"]), new Set(["A"]),
    );
    expect(audazPremiada.available).toBe(true);
    expect(audazPremiada.winner).toBeUndefined();
    expect(audazPremiada.headline).toContain("todavía");
  });
});
```

Also add `buildVerdictFacts` to the import on line 3.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/stats.test.ts -t "audaz-premiada"`
Expected: FAIL — `buildVerdictFacts is not a function`.

- [ ] **Step 3: Implement `buildVerdictFacts` with the audaz-premiada card**

In `src/lib/stats.ts`, add after `buildGroupRankingFacts` (and before `buildBehaviorFacts`):

```ts
const VERDICT_GROUP_HINT = "Se revela cuando se cargan los resultados de los grupos";
const VERDICT_MATCH_HINT = "Se revela a medida que se cargan los resultados";

export function buildVerdictFacts(
  profiles: Profile[],
  predictions: Prediction[],
  groupPredictions: GroupPrediction[],
  matches: Match[],
  groups: Group[],
  teams: Team[],
  revealedMatches: Set<string>,
  finalizedMatches: Set<string>,
  revealedGroups: Set<string>,
  finalizedGroups: Set<string>,
) {
  const approved = approvedProfiles(profiles);
  const approvedIds = new Set(approved.map((p) => p.id));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const teamName = (id: string) => teamById.get(id)?.name ?? id;
  const teamLabel = (id: string) => `${teamById.get(id)?.flag ?? "🏳️"} ${teamName(id)}`;
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const groupByLabel = new Map(groups.map((g) => [g.groupLabel, g]));
  const actualOrder = (g: Group) => [g.firstTeamId, g.secondTeamId, g.thirdTeamId, g.fourthTeamId];

  const revealedGp = groupPredictions.filter(
    (g) => revealedGroups.has(g.groupLabel) && approvedIds.has(g.userId) && g.firstTeamId,
  );

  // ---- 1 · Apuesta audaz premiada ----
  // Per person, count their lone 1st picks (no other approved person picked that
  // team 1st in that group) that fall in a finalized group AND actually finished 1st.
  const premiada: PersonValue[] = [];
  for (const user of approved) {
    const mine = revealedGp.filter((g) => g.userId === user.id && finalizedGroups.has(g.groupLabel));
    if (mine.length === 0) continue;
    let hits = 0;
    let firstHitTeam: string | null = null;
    let lastTeam: string | null = null;
    let lastPos: number | null = null;
    for (const g of mine) {
      const others = revealedGp.filter(
        (o) => o.groupLabel === g.groupLabel && o.userId !== user.id && o.firstTeamId === g.firstTeamId,
      ).length;
      if (others > 0) continue; // not a lone pick
      lastTeam = g.firstTeamId!;
      const order = actualOrder(groupByLabel.get(g.groupLabel)!);
      lastPos = order.indexOf(g.firstTeamId!) + 1;
      if (order[0] === g.firstTeamId) { hits += 1; if (!firstHitTeam) firstHitTeam = g.firstTeamId!; }
    }
    if (lastTeam === null) continue; // had no lone picks in finalized groups
    const displayValue =
      hits === 0 ? `${teamLabel(lastTeam)} · quedó ${lastPos}º`
      : hits === 1 ? `${teamLabel(firstHitTeam!)} · salió 1º ✅`
      : `${hits} picks solitarios clavados`;
    premiada.push({ user, value: hits, displayValue });
  }
  premiada.sort((a, b) => b.value - a.value);
  const premiadaMax = premiada[0]?.value ?? 0;
  const audazPremiada: Fact = {
    id: "audaz-premiada", category: "veredicto", title: "La apuesta audaz premiada", emoji: "🎯",
    blurb: "El que se la jugó solo a un 1º de grupo… y la clavó.", requires: "results",
    available: premiada.length > 0, unavailableHint: VERDICT_GROUP_HINT, chartKind: "bar", unitSuffix: "",
    winner: premiadaMax > 0 ? premiada[0] : undefined,
    coWinners: premiadaMax > 0 ? topTies(premiada) : [],
    series: premiada,
    headline: premiadaMax > 0 ? undefined : "Nadie clavó su pick solitario… todavía",
  };

  return { audazPremiada };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/stats.test.ts -t "audaz-premiada"`
Expected: PASS (both cases).

- [ ] **Step 5: Wire `buildVerdictFacts` into `computeStats`**

In `src/lib/stats.ts` `computeStats`, after the `groupRanking` line, add:

```ts
  const verdict = buildVerdictFacts(
    profiles, predictions, groupPredictions, matches, groups, teams,
    revealed, finalized, revealedGroups, finalizedGroups,
  );
```

Then append to the `facts` array (after the behavior facts line):

```ts
    verdict.audazPremiada,
```

- [ ] **Step 6: Wire the new category into the screen**

In `src/screens/estadisticas.tsx`:

`CATEGORY_LABELS` — add:
```ts
  veredicto: "El veredicto",
```
`CATEGORY_ORDER` — append `"veredicto"`:
```ts
const CATEGORY_ORDER: FactCategory[] = ["optimismo", "manada", "punteria", "fidelidad", "comportamiento", "veredicto"];
```

In `renderChart`, update the thermometer line so the "decepción" card isn't crowned (used by Task 7):
```ts
    if (fact.chartKind === "thermometer") return <TeamThermometer teams={fact.teamSeries ?? bundle.termometro} leaderIcon={fact.id === "colista" ? "⚰️" : fact.id === "decepcion" ? "🥀" : undefined} unit={fact.unitSuffix} />;
```

- [ ] **Step 7: Verify the build and full test suite**

Run: `npx tsc --noEmit && npx vitest run src/lib/stats.test.ts`
Expected: no type errors; all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/stats.ts src/lib/stats.test.ts src/screens/estadisticas.tsx
git commit -m "feat(stats): El veredicto section + apuesta audaz premiada card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: El rebelde tenía razón

**Files:**
- Modify: `src/lib/stats.ts` (`buildVerdictFacts`, `computeStats`)
- Test: `src/lib/stats.test.ts`

- [ ] **Step 1: Write the failing test**

Add inside the `"verdict facts"` describe:

```ts
  it("rebelde-razon counts against-the-crowd calls that were correct", () => {
    // Crowd majority m1 -> home (2 of 3). Caro went away (contrarian) and was right.
    const preds: Prediction[] = [
      { ...pred("u1", "m1", 2, 0), outcomeHit: true },
      { ...pred("u2", "m1", 1, 0), outcomeHit: true },
      { ...pred("u3", "m1", 0, 2), outcomeHit: true }, // contrarian + correct
    ];
    const { rebeldeRazon } = buildVerdictFacts(
      vProfiles, preds, [], [], [], vTeams,
      new Set(["m1"]), new Set(["m1"]), new Set(), new Set(),
    );
    expect(rebeldeRazon.available).toBe(true);
    expect(rebeldeRazon.winner?.user.displayName).toBe("Caro");
    expect(rebeldeRazon.winner?.value).toBe(1);
  });
```

`pred` is the module-level helper already defined in the test file (line 60).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/stats.test.ts -t "rebelde-razon"`
Expected: FAIL — `rebeldeRazon` is undefined.

- [ ] **Step 3: Implement the card**

In `buildVerdictFacts`, add before the `return`:

```ts
  // ---- 2 · El rebelde tenía razón ----
  const { crowd } = crowdOutcomeByMatch(predictions, revealedMatches);
  const rebelHits: PersonValue[] = [];
  for (const user of approved) {
    const mine = predictions.filter(
      (p) => p.userId === user.id && finalizedMatches.has(p.matchId),
    );
    let contrarian = 0;
    let correct = 0;
    for (const p of mine) {
      if (predictedOutcome(p.homeScore, p.awayScore) === crowd.get(p.matchId)) continue;
      contrarian += 1;
      if (p.outcomeHit) correct += 1;
    }
    if (contrarian === 0) continue;
    rebelHits.push({ user, value: correct, displayValue: `${correct} de ${contrarian} a contramano` });
  }
  rebelHits.sort((a, b) => b.value - a.value);
  const rebeldeRazon: Fact = {
    id: "rebelde-razon", category: "veredicto", title: "El rebelde tenía razón", emoji: "✊",
    blurb: "Fue contra la familia… y los partidos le dieron la razón.", requires: "results",
    available: rebelHits.length > 0, unavailableHint: VERDICT_MATCH_HINT, chartKind: "bar", unitSuffix: "",
    winner: rebelHits[0], coWinners: topTies(rebelHits), series: rebelHits,
  };
```

Add `rebeldeRazon` to the `return` object. Add `verdict.rebeldeRazon,` to the `facts` array in `computeStats`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/stats.test.ts -t "rebelde-razon"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.ts src/lib/stats.test.ts
git commit -m "feat(stats): el rebelde tenía razón card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: El profeta solitario

**Files:**
- Modify: `src/lib/stats.ts` (`buildVerdictFacts`, `computeStats`)
- Test: `src/lib/stats.test.ts`

- [ ] **Step 1: Write the failing test**

Add inside `"verdict facts"`:

```ts
  it("profeta-solitario credits lone exact scorelines that hit", () => {
    // m1: Ana predicts 3-1 (nobody else), and it was an exact hit. Beto/Caro share 1-0.
    const preds: Prediction[] = [
      { ...pred("u1", "m1", 3, 1), exactHit: true },
      { ...pred("u2", "m1", 1, 0), exactHit: false },
      { ...pred("u3", "m1", 1, 0), exactHit: false },
    ];
    const m1 = match("m1", { homeTeamId: "arg", awayTeamId: "bra" });
    const { profetaSolitario } = buildVerdictFacts(
      vProfiles, preds, [], [m1], [], vTeams,
      new Set(["m1"]), new Set(["m1"]), new Set(), new Set(),
    );
    expect(profetaSolitario.available).toBe(true);
    expect(profetaSolitario.winner?.user.displayName).toBe("Ana");
    expect(profetaSolitario.winner?.value).toBe(1);
  });

  it("profeta-solitario ignores shared scorelines even if exact", () => {
    // Both predict 1-0 exact -> not lone -> nobody credited.
    const preds: Prediction[] = [
      { ...pred("u1", "m1", 1, 0), exactHit: true },
      { ...pred("u2", "m1", 1, 0), exactHit: true },
    ];
    const m1 = match("m1");
    const { profetaSolitario } = buildVerdictFacts(
      vProfiles, preds, [], [m1], [], vTeams,
      new Set(["m1"]), new Set(["m1"]), new Set(), new Set(),
    );
    expect(profetaSolitario.winner).toBeUndefined();
  });
```

`match` is the module-level helper (line 9).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/stats.test.ts -t "profeta-solitario"`
Expected: FAIL — `profetaSolitario` is undefined.

- [ ] **Step 3: Implement the card**

In `buildVerdictFacts`, add before the `return`:

```ts
  // ---- 3 · El profeta solitario ----
  // Per finalized match, scorelines predicted by exactly one approved person; if
  // that lone prediction was an exact hit, credit the person.
  const loneExact = new Map<string, { count: number; firstLabel: string | null }>();
  for (const matchId of finalizedMatches) {
    const forMatch = predictions.filter((p) => approvedIds.has(p.userId) && p.matchId === matchId);
    const byScore = new Map<string, Prediction[]>();
    for (const p of forMatch) {
      const key = `${p.homeScore}-${p.awayScore}`;
      const list = byScore.get(key) ?? [];
      list.push(p);
      byScore.set(key, list);
    }
    for (const [key, list] of byScore) {
      if (list.length !== 1) continue;
      const p = list[0]!;
      if (!p.exactHit) continue;
      const m = matchById.get(matchId);
      const label = m ? `${key} en ${teamName(m.homeTeamId ?? "")}–${teamName(m.awayTeamId ?? "")}` : key;
      const cur = loneExact.get(p.userId) ?? { count: 0, firstLabel: null };
      cur.count += 1;
      if (!cur.firstLabel) cur.firstLabel = label;
      loneExact.set(p.userId, cur);
    }
  }
  const profeta: PersonValue[] = approved
    .filter((u) => predictions.some((p) => p.userId === u.id && finalizedMatches.has(p.matchId)))
    .map((user) => {
      const e = loneExact.get(user.id);
      const count = e?.count ?? 0;
      const displayValue = count === 0 ? "Sin exactos en soledad"
        : count === 1 ? e!.firstLabel!
        : `${count} exactos en soledad`;
      return { user, value: count, displayValue };
    })
    .sort((a, b) => b.value - a.value);
  const profetaMax = profeta[0]?.value ?? 0;
  const profetaSolitario: Fact = {
    id: "profeta-solitario", category: "veredicto", title: "El profeta solitario", emoji: "🦅",
    blurb: "El único que cantó ese resultado exacto… y entró.", requires: "results",
    available: profeta.length > 0, unavailableHint: VERDICT_MATCH_HINT, chartKind: "bar", unitSuffix: "",
    winner: profetaMax > 0 ? profeta[0] : undefined,
    coWinners: profetaMax > 0 ? topTies(profeta) : [],
    series: profeta,
    headline: profetaMax > 0 ? undefined : "Nadie clavó un exacto en soledad… todavía",
  };
```

Add `profetaSolitario` to the `return` object and `verdict.profetaSolitario,` to the `facts` array.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/stats.test.ts -t "profeta-solitario"`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.ts src/lib/stats.test.ts
git commit -m "feat(stats): el profeta solitario card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: El visionario confirmado

**Files:**
- Modify: `src/lib/stats.ts` (`buildVerdictFacts`, `computeStats`)
- Test: `src/lib/stats.test.ts`

- [ ] **Step 1: Write the failing test**

Add inside `"verdict facts"`:

```ts
  it("visionario-confirmado counts divergent slots the person got right", () => {
    // Consensus 1st in A = arg (Beto+Caro). Ana diverges with uru 1st AND uru
    // actually finished 1st -> 1 correct divergent slot.
    const gps = [
      vgrp("u1", "A", ["uru", "arg", "bra", "chi"]),
      vgrp("u2", "A", ["arg", "uru", "bra", "chi"]),
      vgrp("u3", "A", ["arg", "uru", "bra", "chi"]),
    ];
    const groups = [vgroup("A", ["uru", "arg", "bra", "chi"], true)];
    const { visionarioConfirmado } = buildVerdictFacts(
      vProfiles, [], gps, [], groups, vTeams,
      new Set(), new Set(), new Set(["A"]), new Set(["A"]),
    );
    expect(visionarioConfirmado.available).toBe(true);
    expect(visionarioConfirmado.winner?.user.displayName).toBe("Ana");
    expect(visionarioConfirmado.winner?.value).toBe(1);
    expect(visionarioConfirmado.series.find((s) => s.user.id === "u2")?.value).toBe(0);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/stats.test.ts -t "visionario-confirmado"`
Expected: FAIL — `visionarioConfirmado` is undefined.

- [ ] **Step 3: Implement the card**

In `buildVerdictFacts`, add before the `return`:

```ts
  // ---- 4 · El visionario confirmado ----
  const modal = modalGroupPositions(revealedGp, teamName);
  const visionDiv: PersonValue[] = [];
  for (const user of approved) {
    const mine = revealedGp.filter((g) => g.userId === user.id && finalizedGroups.has(g.groupLabel));
    if (mine.length === 0) continue;
    let correctDivergent = 0;
    for (const g of mine) {
      const order = actualOrder(groupByLabel.get(g.groupLabel)!);
      GROUP_SLOTS.forEach((slot, i) => {
        const mineTeam = g[slot] as string | null;
        const consensus = modal.get(`${g.groupLabel}:${i}`);
        if (mineTeam && consensus && mineTeam !== consensus && mineTeam === order[i]) correctDivergent += 1;
      });
    }
    visionDiv.push({
      user, value: correctDivergent,
      displayValue: `${correctDivergent} ${correctDivergent === 1 ? "casillero" : "casilleros"} que clavaste contra la corriente`,
    });
  }
  visionDiv.sort((a, b) => b.value - a.value);
  const visionarioConfirmado: Fact = {
    id: "visionario-confirmado", category: "veredicto", title: "El visionario confirmado", emoji: "🔮",
    blurb: "Armó los grupos distinto a todos… y le salió bien.", requires: "results",
    available: visionDiv.length > 0, unavailableHint: VERDICT_GROUP_HINT, chartKind: "bar", unitSuffix: "",
    winner: visionDiv[0], coWinners: topTies(visionDiv), series: visionDiv,
  };
```

Add `visionarioConfirmado` to the `return` object and `verdict.visionarioConfirmado,` to the `facts` array.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/stats.test.ts -t "visionario-confirmado"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.ts src/lib/stats.test.ts
git commit -m "feat(stats): el visionario confirmado card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: La sorpresa de la familia

**Files:**
- Modify: `src/lib/stats.ts` (`buildVerdictFacts`, `computeStats`)
- Test: `src/lib/stats.test.ts`

- [ ] **Step 1: Write the failing test**

Add inside `"verdict facts"`:

```ts
  it("sorpresa ranks teams that finished higher than the family expected", () => {
    // Family puts uru ~3rd on average (positions 3,3,4) but uru finished 1st -> overachiever.
    const gps = [
      vgrp("u1", "A", ["arg", "bra", "uru", "chi"]),
      vgrp("u2", "A", ["arg", "bra", "uru", "chi"]),
      vgrp("u3", "A", ["arg", "bra", "chi", "uru"]),
    ];
    const groups = [vgroup("A", ["uru", "arg", "bra", "chi"], true)]; // uru actually 1st
    const { sorpresa } = buildVerdictFacts(
      vProfiles, [], gps, [], groups, vTeams,
      new Set(), new Set(), new Set(["A"]), new Set(["A"]),
    );
    expect(sorpresa.available).toBe(true);
    expect(sorpresa.headline).toContain("Uruguay");
    expect(sorpresa.teamSeries?.[0]).toMatchObject({ teamId: "uru" });
    expect(sorpresa.teamSeries?.[0]?.count).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/stats.test.ts -t "sorpresa"`
Expected: FAIL — `sorpresa` is undefined.

- [ ] **Step 3: Implement the card (and the shared expectation helper)**

In `buildVerdictFacts`, add before the `return`. This block also computes `expectationByTeam`, reused by Task 7:

```ts
  // ---- 5 · La sorpresa / 6 · La decepción (shared expectation vs reality) ----
  // For each team in a finalized group: expectedPos = rounded avg of positions the
  // family assigned it across revealed picks; actualPos = real finishing slot.
  type TeamGap = { teamId: string; name: string; flag: string; gained: number };
  const overachievers: TeamGap[] = [];
  const underachievers: TeamGap[] = [];
  for (const label of finalizedGroups) {
    const group = groupByLabel.get(label);
    if (!group) continue;
    const order = actualOrder(group);
    const picks = revealedGp.filter((g) => g.groupLabel === label);
    for (let actualIdx = 0; actualIdx < order.length; actualIdx += 1) {
      const teamId = order[actualIdx];
      if (!teamId) continue;
      const positions: number[] = [];
      for (const p of picks) {
        const slot = [p.firstTeamId, p.secondTeamId, p.thirdTeamId, p.fourthTeamId].indexOf(teamId);
        if (slot >= 0) positions.push(slot + 1);
      }
      if (positions.length === 0) continue;
      const expectedPos = Math.round(positions.reduce((t, n) => t + n, 0) / positions.length);
      const actualPos = actualIdx + 1;
      const gap = expectedPos - actualPos; // positive = finished higher than expected
      const t = teamById.get(teamId);
      const entry = { teamId, name: teamName(teamId), flag: t?.flag ?? "🏳️", gained: Math.abs(gap) };
      if (gap > 0) overachievers.push(entry);
      else if (gap < 0) underachievers.push(entry);
    }
  }
  const sortGap = (rows: TeamGap[]) =>
    [...rows].sort((a, b) => b.gained - a.gained || a.name.localeCompare(b.name))
      .map((r) => ({ teamId: r.teamId, name: r.name, flag: r.flag, count: r.gained } as TeamTally));
  const sorpresaSeries = sortGap(overachievers);
  const sorpresa: Fact = {
    id: "sorpresa", category: "veredicto", title: "La sorpresa de la familia", emoji: "🚀",
    blurb: "El equipo que la familia subestimó y terminó más arriba.", requires: "results",
    available: finalizedGroups.size > 0, unavailableHint: VERDICT_GROUP_HINT, chartKind: "thermometer", unitSuffix: "puestos",
    headline: sorpresaSeries.length > 0 ? topTeamHeadline(sorpresaSeries) : "La familia la vio venir: sin sorpresas",
    winner: sorpresaSeries[0]
      ? { user: approved[0]!, value: sorpresaSeries[0].count, displayValue: `subió ${sorpresaSeries[0].count} ${sorpresaSeries[0].count === 1 ? "puesto" : "puestos"}` }
      : undefined,
    coWinners: [], series: [], teamSeries: sorpresaSeries, valueDetail: "mejor de lo esperado",
  };
```

Add `sorpresa` to the `return` object and `verdict.sorpresa,` to the `facts` array.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/stats.test.ts -t "sorpresa"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.ts src/lib/stats.test.ts
git commit -m "feat(stats): la sorpresa de la familia card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: La decepción de la familia

**Files:**
- Modify: `src/lib/stats.ts` (`buildVerdictFacts`, `computeStats`)
- Test: `src/lib/stats.test.ts`

- [ ] **Step 1: Write the failing test**

Add inside `"verdict facts"`:

```ts
  it("decepcion ranks teams that finished lower than the family expected", () => {
    // Family puts arg 1st (positions 1,1,1) but arg finished 4th -> big disappointment.
    const gps = [
      vgrp("u1", "A", ["arg", "bra", "uru", "chi"]),
      vgrp("u2", "A", ["arg", "bra", "uru", "chi"]),
      vgrp("u3", "A", ["arg", "bra", "uru", "chi"]),
    ];
    const groups = [vgroup("A", ["uru", "bra", "chi", "arg"], true)]; // arg actually last
    const { decepcion } = buildVerdictFacts(
      vProfiles, [], gps, [], groups, vTeams,
      new Set(), new Set(), new Set(["A"]), new Set(["A"]),
    );
    expect(decepcion.available).toBe(true);
    expect(decepcion.headline).toContain("Argentina");
    expect(decepcion.teamSeries?.[0]).toMatchObject({ teamId: "arg", count: 3 });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/stats.test.ts -t "decepcion"`
Expected: FAIL — `decepcion` is undefined.

- [ ] **Step 3: Implement the card**

In `buildVerdictFacts`, immediately after the `sorpresa` fact (reuses `underachievers`/`sortGap` from Task 6), add:

```ts
  const decepcionSeries = sortGap(underachievers);
  const decepcion: Fact = {
    id: "decepcion", category: "veredicto", title: "La decepción de la familia", emoji: "🥀",
    blurb: "El equipo que la familia bancó y quedó más abajo de lo cantado.", requires: "results",
    available: finalizedGroups.size > 0, unavailableHint: VERDICT_GROUP_HINT, chartKind: "thermometer", unitSuffix: "puestos",
    headline: decepcionSeries.length > 0 ? topTeamHeadline(decepcionSeries) : "Ningún fiasco: todos cumplieron",
    winner: decepcionSeries[0]
      ? { user: approved[0]!, value: decepcionSeries[0].count, displayValue: `cayó ${decepcionSeries[0].count} ${decepcionSeries[0].count === 1 ? "puesto" : "puestos"}` }
      : undefined,
    coWinners: [], series: [], teamSeries: decepcionSeries, valueDetail: "peor de lo esperado",
  };
```

Add `decepcion` to the `return` object and `verdict.decepcion,` to the `facts` array.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/stats.test.ts -t "decepcion"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.ts src/lib/stats.test.ts
git commit -m "feat(stats): la decepción de la familia card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: El ojo clínico

**Files:**
- Modify: `src/lib/stats.ts` (`buildVerdictFacts`, `computeStats`)
- Test: `src/lib/stats.test.ts`

- [ ] **Step 1: Write the failing test**

Add inside `"verdict facts"`:

```ts
  it("ojo-clinico ranks the lowest average goal-total error (ascending)", () => {
    // m1 finished 2-1 (3 goals). Ana predicts 2-1 (0 error); Beto predicts 0-0 (3 error).
    const m1 = match("m1", { status: "finalized", homeScore: 2, awayScore: 1 });
    const preds = [pred("u1", "m1", 2, 1), pred("u2", "m1", 0, 0)];
    const { ojoClinico } = buildVerdictFacts(
      vProfiles, preds, [], [m1], [], vTeams,
      new Set(["m1"]), new Set(["m1"]), new Set(), new Set(),
    );
    expect(ojoClinico.available).toBe(true);
    expect(ojoClinico.winner?.user.displayName).toBe("Ana");
    expect(ojoClinico.winner?.value).toBe(0);
    expect(ojoClinico.series[0]?.user.id).toBe("u1"); // sorted ascending
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/stats.test.ts -t "ojo-clinico"`
Expected: FAIL — `ojoClinico` is undefined.

- [ ] **Step 3: Implement the card**

In `buildVerdictFacts`, add before the `return`:

```ts
  // ---- 7 · El ojo clínico (goal-volume realism) ----
  const goalError: PersonValue[] = [];
  for (const user of approved) {
    const mine = predictions.filter((p) => p.userId === user.id && finalizedMatches.has(p.matchId));
    const scored = mine.filter((p) => {
      const m = matchById.get(p.matchId);
      return m && m.homeScore !== null && m.awayScore !== null;
    });
    if (scored.length === 0) continue;
    let totalErr = 0;
    for (const p of scored) {
      const m = matchById.get(p.matchId)!;
      totalErr += Math.abs((p.homeScore + p.awayScore) - (m.homeScore! + m.awayScore!));
    }
    const avg = round1(totalErr / scored.length);
    goalError.push({ user, value: avg, displayValue: `${avg} goles de error promedio` });
  }
  const ojoWin = pickWinner(goalError, (a, b) => a < b);
  const ojoClinico: Fact = {
    id: "ojo-clinico", category: "veredicto", title: "El ojo clínico", emoji: "🔬",
    blurb: "Quien mejor le calcula el ritmo goleador a los partidos.", requires: "results",
    available: goalError.length > 0, unavailableHint: VERDICT_MATCH_HINT, chartKind: "bar", unitSuffix: "goles",
    winner: ojoWin.winner, coWinners: ojoWin.coWinners,
    series: [...goalError].sort((a, b) => a.value - b.value),
  };
```

Add `ojoClinico` to the `return` object and `verdict.ojoClinico,` to the `facts` array.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/stats.test.ts -t "ojo-clinico"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.ts src/lib/stats.test.ts
git commit -m "feat(stats): el ojo clínico card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: ¿La manada sabía?

**Files:**
- Modify: `src/lib/stats.ts` (`buildVerdictFacts`, `computeStats`)
- Test: `src/lib/stats.test.ts`

- [ ] **Step 1: Write the failing test**

Add inside `"verdict facts"`:

```ts
  it("manada-sabia reports how often the crowd majority was right", () => {
    // m1: crowd majority home (2 of 3), m1 finished 2-0 (home) -> majority correct.
    const m1 = match("m1", { status: "finalized", homeScore: 2, awayScore: 0 });
    const preds = [pred("u1", "m1", 1, 0), pred("u2", "m1", 2, 0), pred("u3", "m1", 0, 1)];
    const { manadaSabia } = buildVerdictFacts(
      vProfiles, preds, [], [m1], [], vTeams,
      new Set(["m1"]), new Set(["m1"]), new Set(), new Set(),
    );
    expect(manadaSabia.available).toBe(true);
    expect(manadaSabia.headline).toContain("100%");
    expect(manadaSabia.bins?.find((b) => b.label === "La manada acertó")?.count).toBe(1);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/stats.test.ts -t "manada-sabia"`
Expected: FAIL — `manadaSabia` is undefined.

- [ ] **Step 3: Implement the card**

In `buildVerdictFacts`, add before the `return` (reuses `crowd` from Task 3):

```ts
  // ---- 8 · ¿La manada sabía? (family-level: crowd majority correctness) ----
  let manadaHits = 0;
  let manadaTotal = 0;
  for (const matchId of finalizedMatches) {
    const m = matchById.get(matchId);
    if (!m || m.homeScore === null || m.awayScore === null) continue;
    const majority = crowd.get(matchId);
    if (!majority) continue;
    manadaTotal += 1;
    if (majority === predictedOutcome(m.homeScore, m.awayScore)) manadaHits += 1;
  }
  const manadaPct = manadaTotal > 0 ? Math.round((manadaHits / manadaTotal) * 100) : 0;
  const manadaSabia: Fact = {
    id: "manada-sabia", category: "veredicto", title: "¿La manada sabía?", emoji: "🐑",
    blurb: "Cuando la familia votó en masa, ¿tenía razón?", requires: "results",
    available: manadaTotal > 0, unavailableHint: VERDICT_MATCH_HINT, chartKind: "histogram", unitSuffix: "",
    headline: `La mayoría acertó ${manadaPct}% de los partidos`,
    winner: manadaTotal > 0
      ? { user: approved[0]!, value: manadaPct, displayValue: `${manadaHits} de ${manadaTotal} partidos` }
      : undefined,
    coWinners: [], series: [],
    bins: [
      { label: "La manada acertó", count: manadaHits },
      { label: "La manada falló", count: manadaTotal - manadaHits },
    ],
  };
```

Add `manadaSabia` to the `return` object and `verdict.manadaSabia,` to the `facts` array.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/stats.test.ts -t "manada-sabia"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.ts src/lib/stats.test.ts
git commit -m "feat(stats): ¿la manada sabía? card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: El grupo cantado ¿se cumplió?

**Files:**
- Modify: `src/lib/stats.ts` (`buildVerdictFacts`, `computeStats`)
- Test: `src/lib/stats.test.ts`

- [ ] **Step 1: Write the failing test**

Add inside `"verdict facts"`:

```ts
  it("grupo-cantado counts how many slots the consensus order got right", () => {
    // Consensus A = arg,bra,uru,chi (all 3 agree). Group A finished exactly that -> 4/4.
    const gps = [
      vgrp("u1", "A", ["arg", "bra", "uru", "chi"]),
      vgrp("u2", "A", ["arg", "bra", "uru", "chi"]),
      vgrp("u3", "A", ["arg", "bra", "uru", "chi"]),
    ];
    const groups = [vgroup("A", ["arg", "bra", "uru", "chi"], true)];
    const { grupoCantado } = buildVerdictFacts(
      vProfiles, [], gps, [], groups, vTeams,
      new Set(), new Set(), new Set(["A"]), new Set(["A"]),
    );
    expect(grupoCantado.available).toBe(true);
    expect(grupoCantado.bins?.find((b) => b.label === "A")?.count).toBe(4);
    expect(grupoCantado.headline).toContain("4/4");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/stats.test.ts -t "grupo-cantado"`
Expected: FAIL — `grupoCantado` is undefined.

- [ ] **Step 3: Implement the card**

In `buildVerdictFacts`, add before the `return` (reuses `modal` from Task 5):

```ts
  // ---- 9 · El grupo cantado ¿se cumplió? ----
  // Per finalized group with consensus, how many of the 4 slots the family's
  // modal order matched reality. Headline = the most-agreed group + its score.
  const cantadoBins: HistogramBin[] = [];
  let cantadoBest: { label: string; matched: number; agreement: number } | null = null;
  for (const label of finalizedGroups) {
    const group = groupByLabel.get(label);
    const picks = revealedGp.filter((g) => g.groupLabel === label);
    if (!group || picks.length < 2) continue;
    const order = actualOrder(group);
    let matched = 0;
    let agreeSum = 0;
    GROUP_SLOTS.forEach((_, i) => {
      const consensus = modal.get(`${label}:${i}`);
      if (consensus && consensus === order[i]) matched += 1;
      // agreement = share of pickers on the modal team at this slot
      const slot = GROUP_SLOTS[i]!;
      const votes = picks.filter((p) => (p[slot] as string | null) === consensus).length;
      agreeSum += consensus ? votes / picks.length : 0;
    });
    cantadoBins.push({ label, count: matched });
    const agreement = agreeSum / GROUP_SLOTS.length;
    if (!cantadoBest || agreement > cantadoBest.agreement) cantadoBest = { label, matched, agreement };
  }
  cantadoBins.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const grupoCantado: Fact = {
    id: "grupo-cantado", category: "veredicto", title: "El grupo cantado ¿se cumplió?", emoji: "🎵",
    blurb: "El grupo más cantado por la familia, ¿salió como dijeron?", requires: "results",
    available: cantadoBins.length > 0, unavailableHint: VERDICT_GROUP_HINT, chartKind: "histogram", unitSuffix: "",
    headline: cantadoBest ? `Grupo ${cantadoBest.label}: la familia cantó ${cantadoBest.matched}/4` : undefined,
    winner: cantadoBest
      ? { user: approved[0]!, value: cantadoBest.matched, displayValue: `${cantadoBest.matched} de 4 aciertos` }
      : undefined,
    coWinners: [], series: [], bins: cantadoBins, valueDetail: "de 4 aciertos",
  };
```

Add `grupoCantado` to the `return` object and `verdict.grupoCantado,` to the `facts` array.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/stats.test.ts -t "grupo-cantado"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.ts src/lib/stats.test.ts
git commit -m "feat(stats): el grupo cantado ¿se cumplió? card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: ¿El método paga?

**Files:**
- Modify: `src/lib/stats.ts` (`buildVerdictFacts`, `computeStats`)
- Test: `src/lib/stats.test.ts`

- [ ] **Step 1: Write the failing test**

Add inside `"verdict facts"`:

```ts
  it("metodo-paga compares exact-hit % of madrugadores vs último-minuto", () => {
    const m1 = match("m1", { status: "finalized", kickoffUtc: "2026-06-10T00:00:00.000Z", homeScore: 1, awayScore: 0 });
    // Ana updated early (madrugadora) and hit exact; Beto updated late and missed.
    const preds: Prediction[] = [
      { ...pred("u1", "m1", 1, 0), updatedAt: "2026-06-05T00:00:00.000Z", exactHit: true },
      { ...pred("u2", "m1", 3, 3), updatedAt: "2026-06-09T23:00:00.000Z", exactHit: false },
    ];
    const { metodoPaga } = buildVerdictFacts(
      [vProfiles[0]!, vProfiles[1]!], preds, [], [m1], [], vTeams,
      new Set(["m1"]), new Set(["m1"]), new Set(), new Set(),
    );
    expect(metodoPaga.available).toBe(true);
    expect(metodoPaga.bins?.find((b) => b.label === "Madrugadores")?.count).toBe(100);
    expect(metodoPaga.bins?.find((b) => b.label === "Último minuto")?.count).toBe(0);
    expect(metodoPaga.headline).toContain("temprano");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/stats.test.ts -t "metodo-paga"`
Expected: FAIL — `metodoPaga` is undefined.

- [ ] **Step 3: Implement the card**

In `buildVerdictFacts`, add before the `return`:

```ts
  // ---- 10 · ¿El método paga? (lead-time bucket vs exact-hit accuracy) ----
  const kickoffById = new Map(matches.map((m) => [m.id, m.kickoffUtc]));
  type Habit = { lead: number; exactPct: number };
  const habits: Habit[] = [];
  for (const user of approved) {
    const revealedMine = predictions.filter((p) => p.userId === user.id && revealedMatches.has(p.matchId));
    const finalMine = predictions.filter((p) => p.userId === user.id && finalizedMatches.has(p.matchId));
    if (revealedMine.length === 0 || finalMine.length === 0) continue;
    let totalLead = 0;
    for (const p of revealedMine) {
      const kickoff = kickoffById.get(p.matchId);
      if (kickoff) totalLead += (new Date(kickoff).getTime() - new Date(p.updatedAt).getTime()) / 3_600_000;
    }
    const lead = totalLead / revealedMine.length;
    const exactPct = Math.round((finalMine.filter((p) => p.exactHit).length / finalMine.length) * 100);
    habits.push({ lead, exactPct });
  }
  habits.sort((a, b) => a.lead - b.lead);
  let metodoPaga: Fact;
  if (habits.length < 2) {
    metodoPaga = {
      id: "metodo-paga", category: "veredicto", title: "¿El método paga?", emoji: "⏱️",
      blurb: "¿Cargar temprano o sobre la hora rinde más puntería?", requires: "results",
      available: false, unavailableHint: VERDICT_MATCH_HINT, chartKind: "histogram", unitSuffix: "%",
      winner: undefined, coWinners: [], series: [],
    };
  } else {
    const sorted = [...habits].map((h) => h.lead).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
    const early = habits.filter((h) => h.lead >= median);
    const late = habits.filter((h) => h.lead < median);
    const avg = (rows: Habit[]) => rows.length ? Math.round(rows.reduce((t, h) => t + h.exactPct, 0) / rows.length) : 0;
    const earlyPct = avg(early);
    const latePct = avg(late);
    metodoPaga = {
      id: "metodo-paga", category: "veredicto", title: "¿El método paga?", emoji: "⏱️",
      blurb: "¿Cargar temprano o sobre la hora rinde más puntería?", requires: "results",
      available: true, unavailableHint: VERDICT_MATCH_HINT, chartKind: "histogram", unitSuffix: "%",
      headline: earlyPct >= latePct ? "Cargar temprano paga" : "Mejor sobre la hora",
      winner: { user: approved[0]!, value: Math.max(earlyPct, latePct), displayValue: `${Math.max(earlyPct, latePct)}% de exactos` },
      coWinners: [], series: [],
      bins: [
        { label: "Madrugadores", count: earlyPct },
        { label: "Último minuto", count: latePct },
      ],
    };
  }
```

Add `metodoPaga` to the `return` object and `verdict.metodoPaga,` to the `facts` array.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/stats.test.ts -t "metodo-paga"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.ts src/lib/stats.test.ts
git commit -m "feat(stats): ¿el método paga? card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: Integration verification + computeStats coverage test

**Files:**
- Test: `src/lib/stats.test.ts`
- Verify: whole app builds and lints.

- [ ] **Step 1: Write the failing test (all 10 verdict ids surface from computeStats)**

Add to the `"computeStats"` describe block:

```ts
  it("includes all 10 verdict facts in the bundle", () => {
    const now = new Date("2026-06-12T12:00:00.000Z");
    const bundle = computeStats({
      profiles: seedProfiles, predictions: seedPreds, groupPredictions: seedGroupPreds,
      matches: seedMatches, groups: seedGroups, teams: seedTeams,
      currentUserId: "u1", standingsStages: new Set(["groups"]), now,
    });
    const ids = new Set(bundle.facts.map((f) => f.id));
    for (const id of [
      "audaz-premiada", "rebelde-razon", "profeta-solitario", "visionario-confirmado",
      "sorpresa", "decepcion", "ojo-clinico", "metodo-paga", "manada-sabia", "grupo-cantado",
    ]) {
      expect(ids.has(id as never)).toBe(true);
    }
  });
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/lib/stats.test.ts -t "all 10 verdict facts"`
Expected: PASS (facts were wired into `computeStats` across Tasks 2–11). If any id is missing, add the corresponding `verdict.<field>` to the `facts` array.

- [ ] **Step 3: Full verification**

Run each and confirm green:
```bash
npx tsc --noEmit
npm run lint
npx vitest run src/lib/stats.test.ts
npm run build
```
Expected: no type errors, no lint errors, all tests pass, build succeeds.

- [ ] **Step 4: Manual smoke check of the screen**

Start the dev server (`npm run dev`) and open `/estadisticas`. Confirm:
- A new "El veredicto" section renders **after** "Comportamiento".
- Before results exist, its 10 cards show the greyed locked state with the result hint.
- Cards with finalized data open the drawer with the correct chart (bar / thermometer / histogram).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.test.ts
git commit -m "test(stats): assert all verdict facts surface from computeStats

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 13: Streak facts builder (`buildStreakFacts`) + consolidate `racha`

Creates all four streak facts in one builder and moves the existing `racha` out of `buildAccuracyFacts`.

**Files:**
- Modify: `src/lib/stats.ts` (types; add `buildStreakFacts`; trim `buildAccuracyFacts`; wire `computeStats`)
- Test: `src/lib/stats.test.ts`

- [ ] **Step 1: Add the `rachas` category and streak fact ids**

In `src/lib/stats.ts`, extend `FactCategory` and `FactId` (`racha` already exists):

```ts
export type FactCategory = "optimismo" | "manada" | "punteria" | "fidelidad" | "comportamiento" | "veredicto" | "rachas";
```

Append to the `FactId` union (after the `grupo-cantado` member added in Task 1):

```ts
  | "sequia" | "en-llamas" | "en-sequia";
```

- [ ] **Step 2: Write the failing streak tests**

Add `buildStreakFacts` to the import on line 3 of `src/lib/stats.test.ts`, then add this describe block at the end of the file:

```ts
describe("streak facts", () => {
  function fmatch(id: string, kickoff: string): Match {
    return {
      id, matchNo: 1, stage: "round16", homeTeamId: "arg", awayTeamId: "fra",
      kickoffUtc: kickoff, status: "finalized",
      homeScore: 1, awayScore: 0, winnerTeamId: "arg",
      finalizedAt: "2026-06-11T00:00:00.000Z", finalizedBy: "u1", updatedAt: null, updatedBy: null,
    };
  }
  function scored(userId: string, matchId: string, outcome: boolean): Prediction {
    return { ...pred(userId, matchId, 1, 0), outcomeHit: outcome };
  }
  // chronological order m1<m2<m3<m4. Ana: hit,hit,miss,hit. Beto: miss,miss,miss,hit.
  const matches = [
    fmatch("m1", "2026-06-01T00:00:00.000Z"), fmatch("m2", "2026-06-02T00:00:00.000Z"),
    fmatch("m3", "2026-06-03T00:00:00.000Z"), fmatch("m4", "2026-06-04T00:00:00.000Z"),
  ];
  const finalized = new Set(["m1", "m2", "m3", "m4"]);
  const preds = [
    scored("u1", "m1", true), scored("u1", "m2", true), scored("u1", "m3", false), scored("u1", "m4", true),
    scored("u2", "m1", false), scored("u2", "m2", false), scored("u2", "m3", false), scored("u2", "m4", true),
  ];

  it("racha caliente = longest run of correct outcomes (HAD)", () => {
    const { rachaCaliente } = buildStreakFacts(profiles, preds, matches, finalized);
    expect(rachaCaliente.id).toBe("racha");
    expect(rachaCaliente.winner?.user.displayName).toBe("Ana");
    expect(rachaCaliente.winner?.value).toBe(2);
  });

  it("sequia = longest run of misses (HAD)", () => {
    const { sequia } = buildStreakFacts(profiles, preds, matches, finalized);
    expect(sequia.winner?.user.displayName).toBe("Beto");
    expect(sequia.winner?.value).toBe(3);
  });

  it("en llamas = current ongoing hit run, en sequia = current ongoing miss run", () => {
    const { enLlamas, enSequia } = buildStreakFacts(profiles, preds, matches, finalized);
    // both end on a hit (m4) -> current hit run 1 each, current miss run 0
    expect(enLlamas.winner?.value).toBe(1);
    expect(enSequia.winner).toBeUndefined();
    expect(enSequia.headline).toContain("Sin rachas");
  });

  it("is unavailable with no finalized matches", () => {
    expect(buildStreakFacts(profiles, preds, matches, new Set()).rachaCaliente.available).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/stats.test.ts -t "streak facts"`
Expected: FAIL — `buildStreakFacts is not a function`.

- [ ] **Step 4: Implement `buildStreakFacts`**

In `src/lib/stats.ts`, add after `buildAccuracyFacts`:

```ts
export function buildStreakFacts(
  profiles: Profile[],
  predictions: Prediction[],
  matches: Match[],
  finalized: Set<string>,
) {
  const approved = approvedProfiles(profiles);
  const kickoffById = new Map(matches.map((m) => [m.id, m.kickoffUtc]));

  const bestHit: PersonValue[] = [];
  const bestMiss: PersonValue[] = [];
  const curHit: PersonValue[] = [];
  const curMiss: PersonValue[] = [];
  for (const user of approved) {
    const mine = predictions
      .filter((p) => p.userId === user.id && finalized.has(p.matchId))
      .sort((a, b) => (kickoffById.get(a.matchId) ?? "").localeCompare(kickoffById.get(b.matchId) ?? ""));
    if (mine.length === 0) continue;
    let bH = 0, bM = 0, rH = 0, rM = 0;
    for (const p of mine) {
      if (p.outcomeHit) { rH += 1; rM = 0; } else { rM += 1; rH = 0; }
      if (rH > bH) bH = rH;
      if (rM > bM) bM = rM;
    }
    bestHit.push({ user, value: bH, displayValue: `${bH} al hilo` });
    bestMiss.push({ user, value: bM, displayValue: `${bM} errados al hilo` });
    curHit.push({ user, value: rH, displayValue: rH > 0 ? `${rH} al hilo (en curso)` : "sin racha activa" });
    curMiss.push({ user, value: rM, displayValue: rM > 0 ? `${rM} errados (en curso)` : "sin sequía activa" });
  }
  const hint = "Se revela a medida que se cargan los resultados";

  const streakFact = (id: FactId, title: string, emoji: string, blurb: string, series: PersonValue[]): Fact => {
    const sorted = [...series].sort((a, b) => b.value - a.value);
    const max = sorted[0]?.value ?? 0;
    return {
      id, category: "rachas", title, emoji, blurb, requires: "results",
      available: sorted.length > 0, unavailableHint: hint, chartKind: "bar", unitSuffix: "",
      winner: max > 0 ? sorted[0] : undefined,
      coWinners: max > 0 ? topTies(sorted) : [],
      series: sorted,
      headline: max > 0 ? undefined : "Sin rachas todavía",
    };
  };

  return {
    rachaCaliente: streakFact("racha", "La racha caliente", "🔥", "Más aciertos de resultado al hilo", bestHit),
    sequia: streakFact("sequia", "La sequía", "🏜️", "La peor racha de errores al hilo", bestMiss),
    enLlamas: streakFact("en-llamas", "En llamas", "⚡", "La racha de aciertos más larga en curso", curHit),
    enSequia: streakFact("en-sequia", "En sequía", "🥶", "La peor racha de errores en curso", curMiss),
  };
}
```

- [ ] **Step 5: Run the streak tests to verify they pass**

Run: `npx vitest run src/lib/stats.test.ts -t "streak facts"`
Expected: PASS.

- [ ] **Step 6: Remove `racha` from `buildAccuracyFacts`**

In `buildAccuracyFacts`, delete the `streak` array declaration and its inner loop. Change this:

```ts
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
```

to this (keep the kickoff sort so `matches`/`kickoffById` stay used):

```ts
  const exactPct: PersonValue[] = [];
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
  }
```

Then delete the `const ra = pickWinner(streak, (a, b) => a > b);` line and the whole `const racha: Fact = { ... };` block, and change the return:

```ts
  return { francotirador, trampa, trampaMatchId };
```

- [ ] **Step 7: Update the existing racha test + wire `computeStats`**

In `src/lib/stats.test.ts`, the `"accuracy facts"` describe has a test `"racha is the longest consecutive outcome-hit streak"`. Replace its body to use the new builder:

```ts
  it("racha is the longest consecutive outcome-hit streak", () => {
    const { rachaCaliente } = buildStreakFacts(profiles, preds, matches, finalized);
    expect(rachaCaliente.winner?.user.id).toBe("u1");
    expect(rachaCaliente.winner?.value).toBe(2);
  });
```

In `src/lib/stats.ts` `computeStats`, add after the `accuracy` line:

```ts
  const streak = buildStreakFacts(profiles, predictions, matches, finalized);
```

In the `facts` array, replace `accuracy.racha,` with `streak.rachaCaliente,` and append the other three (they carry `category: "rachas"`, skipped by the generic loop but needed in the bundle for `RachasSection`):

```ts
    streak.sequia, streak.enLlamas, streak.enSequia,
```

- [ ] **Step 8: Run the full suite**

Run: `npx tsc --noEmit && npx vitest run src/lib/stats.test.ts`
Expected: no type errors; all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/stats.ts src/lib/stats.test.ts
git commit -m "feat(stats): consolidate streaks into buildStreakFacts (racha + sequía + current)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 14: StreakCard component + Rachas section

**Files:**
- Modify: `src/components/stats/fact-card.tsx` (add `StreakCard`)
- Modify: `src/screens/estadisticas.tsx` (add `factById`, `RachasSection`, render it)

- [ ] **Step 1: Add the `StreakCard` component**

In `src/components/stats/fact-card.tsx` (imports for `Card`, `Lock`, `ui`, `cn`, `Fact` already exist), add:

```tsx
export function StreakCard({ fact, tone, onOpen }: { fact: Fact; tone: "hot" | "cold"; onOpen: (fact: Fact) => void }) {
  const accent = tone === "hot" ? "text-app-green" : "text-app-red";
  const tint = tone === "hot" ? "border-app-green/30 bg-app-green/10" : "border-app-red/30 bg-app-red/10";

  if (!fact.available) {
    return (
      <Card className={cn(ui.panel, "flex flex-col gap-1 p-4 opacity-60")}>
        <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-app-muted">
          <span className="text-base grayscale">{fact.emoji}</span> {fact.title}
        </span>
        <p className="mt-1 flex items-center gap-1 text-xs font-bold text-app-muted">
          <Lock size={12} /> {fact.unavailableHint}
        </p>
      </Card>
    );
  }

  const value = fact.winner?.value ?? 0;
  const name = fact.winner?.user.displayName;
  return (
    <button
      type="button"
      onClick={() => onOpen(fact)}
      className={cn("flex flex-col rounded-lg border p-4 text-left shadow-app-panel hover:bg-app-surface-2", tint)}
    >
      <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-app-muted">
        <span className="text-base">{fact.emoji}</span> {fact.title}
      </span>
      <strong className={cn("mt-2 text-4xl font-black leading-none", accent)}>{value}</strong>
      {name
        ? <strong className="mt-2 block truncate text-sm font-black text-app-text">{name}</strong>
        : <span className="mt-2 block truncate text-sm font-bold text-app-muted">{fact.headline}</span>}
      {fact.winner?.displayValue && <small className="block truncate text-xs font-bold text-app-muted">{fact.winner.displayValue}</small>}
    </button>
  );
}
```

- [ ] **Step 2: Render the Rachas section in the screen**

In `src/screens/estadisticas.tsx`:

Add `StreakCard` to the import from `@/components/stats/fact-card`:
```ts
import { BreakdownTable, FactCard, StatDrawer, StreakCard } from "@/components/stats/fact-card";
```

Inside `EstadisticasScreen`, add a lookup map (near `factsByCategory`):
```ts
  const factById = useMemo(() => new Map(bundle.facts.map((f) => [f.id, f])), [bundle.facts]);
```

Render `<RachasSection ... />` right after the `CATEGORY_ORDER.map(...)` block and before `<StatDrawer ...>`:
```tsx
      <RachasSection factById={factById} onOpen={setActiveFact} />
```

Add the component at module scope (next to `HeroRow`):
```tsx
function RachasSection({ factById, onOpen }: { factById: Map<string, Fact>; onOpen: (fact: Fact) => void }) {
  const racha = factById.get("racha");
  const sequia = factById.get("sequia");
  const enLlamas = factById.get("en-llamas");
  const enSequia = factById.get("en-sequia");
  if (!racha || !sequia || !enLlamas || !enSequia) return null;
  return (
    <section className="grid gap-2.5">
      <h2 className={cn(ui.label, "text-sm")}>Rachas</h2>
      <div className="grid gap-2.5">
        <span className={ui.label}>Récord histórico</span>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <StreakCard fact={racha} tone="hot" onOpen={onOpen} />
          <StreakCard fact={sequia} tone="cold" onOpen={onOpen} />
        </div>
        <span className={cn(ui.label, "mt-1")}>Ahora mismo</span>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <StreakCard fact={enLlamas} tone="hot" onOpen={onOpen} />
          <StreakCard fact={enSequia} tone="cold" onOpen={onOpen} />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Verify build + lint + manual smoke**

Run:
```bash
npx tsc --noEmit
npm run lint
```
Expected: clean.

Then `npm run dev`, open `/estadisticas`, and confirm:
- A distinct "Rachas" section renders with two labelled rows ("Récord histórico", "Ahora mismo").
- Hot cards show a green number/tint, cold cards a red number/tint.
- The four cards no longer appear inside "Puntería y rachas" (only `racha` moved out).
- Tapping a streak card opens the drawer with the ranked `BarStat`.

- [ ] **Step 4: Commit**

```bash
git add src/components/stats/fact-card.tsx src/screens/estadisticas.tsx
git commit -m "feat(stats): Rachas section with hot/cold StreakCard pairs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 15: Final full verification

- [ ] **Step 1: Run the complete gate**

```bash
npx tsc --noEmit
npm run lint
npx vitest run src/lib/stats.test.ts
npm run build
```
Expected: all green.

- [ ] **Step 2: Confirm no orphaned `racha` references**

Run: `grep -rn "accuracy.racha\|\.racha\b" src/lib src/screens src/components`
Expected: only `streak.rachaCaliente` / `rachaCaliente` usages; no `accuracy.racha`.

---

## Self-Review notes (addressed)

- **Spec coverage:** all 10 cards have a task (2–11); category + wiring in Task 2; helpers in Task 1; integration in Task 12. Coverage map in the spec is satisfied.
- **Type consistency:** builder return field names (`audazPremiada`, `rebeldeRazon`, `profetaSolitario`, `visionarioConfirmado`, `sorpresa`, `decepcion`, `ojoClinico`, `metodoPaga`, `manadaSabia`, `grupoCantado`) are used identically in `computeStats` wiring. `FactId` string literals match the `id` fields. `modalGroupPositions`, `crowdOutcomeByMatch`, `GROUP_SLOTS`, `TeamTally`, `HistogramBin`, `round1`, `pickWinner`, `topTies`, `topTeamHeadline` are all defined/exported in `stats.ts` before use.
- **Reused helpers within the builder:** `crowd` (Task 3) is reused by `manada-sabia` (Task 9); `modal` (Task 5) is reused by `grupo-cantado` (Task 10); `overachievers`/`underachievers`/`sortGap` (Task 6) reused by `decepcion` (Task 7). These ordering dependencies are noted in each task. When implementing out of order, ensure the shared variable exists (it lives in the same function scope).
- **No placeholders:** every code step contains complete code.
- **Rachas section (Tasks 13–15):** new `rachas` category + `buildStreakFacts` (4 facts: `racha` moved, `sequia`, `en-llamas`, `en-sequia`), `racha` consolidated out of `buildAccuracyFacts` (return becomes `{ francotirador, trampa, trampaMatchId }`, kickoff sort kept so `matches` stays used), `computeStats` wires `streak.rachaCaliente` into `racha`'s old slot + appends the three new facts. UI: `StreakCard` (hot=`app-green`, cold=`app-red`) + `RachasSection` (two labelled pairs), `rachas` omitted from `CATEGORY_ORDER` so the generic loop skips it and the section is rendered bespoke from `factById`. Builder field names (`rachaCaliente`/`sequia`/`enLlamas`/`enSequia`) and fact ids (`racha`/`sequia`/`en-llamas`/`en-sequia`) are consistent across builder, `computeStats`, and `RachasSection`.
