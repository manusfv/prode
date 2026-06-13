# Group-stage stats — design

**Date:** 2026-06-13
**Branch:** feat/estadisticas
**Status:** Approved, ready for implementation plan

## Goal

Add six new stats to `/estadisticas`, mining the group-stage prediction data
we currently under-use. Today only `firstTeamId` is touched (termómetro,
apuesta-audaz); the full `GroupPrediction` ordering (`firstTeamId`→
`fourthTeamId`, `exactPositions`) is untapped. The new stats mix playful
awards with analytical reads, and each respects the existing reveal model
and privacy rule.

### Reveal model (unchanged, for reference)
- **Match kickoff** (`getMatchStatus !== "open"`): unlocks match-prediction stats.
- **Result finalized** (`getMatchStatus === "finalized"`): unlocks accuracy/points stats.
- **Group lock** (`getGroupStatus !== "open"`, i.e. `now ≥ locksAt`): unlocks group-pick stats.
- **Group result finalized** (`getGroupStatus === "finalized"`): unlocks group-accuracy stats.
- Privacy: personal stats use all of the current user's data; group-wide stats use locked/finalized data only.

### Non-redundancy verification (done before design)
Each new stat was checked against the live inventory:
- **Grupo de la muerte** vs `partido-dividido`: different data (group orderings vs match outcomes) and unit. Novel.
- **Colista cantado** vs Termómetro (1º) / `más-odiado` (match losses): uses 4º-place group picks, untouched. Theme-adjacent to más-odiado; differentiated by copy.
- **El profeta** vs `francotirador` (exact match scores): measures exact group *order* (`exactPositions`). Novel.
- **El visionario** vs `apuesta-audaz` (boldest 1º) / `rebelde` (match contrarian): adjacent. Decision: keep both, differentiate copy.
- **Tu gemelo/opuesto** vs similarity grid: same data, different lens. Decision: personal-card line, not a new graph.
- **La tabla soñada** vs Termómetro: per-group resolved winners (a board) vs one global tally. Novel.

## Shared scaffolding

- **New fact category** `grupos` ("Fase de grupos"), added to `FactCategory`,
  `CATEGORY_ORDER`, and `CATEGORY_LABELS` (screen). Cards 1–4 live here.
- **New helper** `finalizedGroupLabels(groups, now): Set<string>` in `stats.ts`,
  mirroring `revealedGroupLabels` but keyed on `getGroupStatus === "finalized"`.
- **New builder** `buildGroupRankingFacts(profiles, groupPredictions, teams, revealedGroups, finalizedGroups)`
  returning `{ grupoMuerte, colista, visionario, profeta, dreamTable }`.
- **New FactIds**: `"grupo-muerte" | "colista" | "visionario" | "profeta-grupos"`.
- Wire into `computeStats`, `StatsBundle`, and the screen.

## Stats

### 1 · Grupo de la muerte 🪦
- **Category/gate:** grupos · group lock.
- **Compute:** over locked groups with ≥2 pickers, for each group compute
  contention = average over the 4 slots of `1 − (modal-team votes at slot / pickers)`.
  Pick the max-contention group; expose all groups' contention for the chart.
- **Output:** Fact with `headline = "Grupo X"`, `chartKind: "histogram"`; drawer
  renders `Histogram` (bins: group letter → `Math.round(contention*100)`).
- **Copy:** blurb "El grupo donde la familia menos se pone de acuerdo."
- **Hint:** "Se revela cuando cierra el grupo".

### 2 · Colista cantado ⚰️
- **Category/gate:** grupos · group lock.
- **Compute:** tally `fourthTeamId` across locked groups (mirror of termómetro's
  `toTally`). Top = most-buried team.
- **Output:** Fact with `headline` = top team, `chartKind: "thermometer"`,
  `teamSeries` = the tally; drawer renders `TeamThermometer` with new optional
  `leaderIcon="⚰️"` (so the most-buried team isn't crowned).
- **Copy:** "El equipo que la familia más entierra en el fondo del grupo."
- **Hint:** "Se revela cuando cierra el grupo".

### 3 · El profeta de los grupos 🔮
- **Category/gate:** grupos · group result finalized · `requires: "results"`.
- **Compute:** per approved person, sum `exactPositions` across finalized groups
  → `PersonValue` (value = total, displayValue = `${n} aciertos de orden`).
- **Output:** `chartKind: "bar"`, `BarStat`.
- **Copy:** "Quien más veces clavó el orden de un grupo."
- **Hint:** "Se revela cuando se cargan los resultados de los grupos".

### 4 · El visionario 👁️
- **Category/gate:** grupos · group lock.
- **Compute:** per approved person, divergence = count of slots across all locked
  groups where their team at that slot ≠ the family's modal team at that slot
  → `PersonValue`. Higher = more divergent. Only count groups the person ranked.
- **Output:** `chartKind: "bar"`, `BarStat`.
- **Copy:** "Quien arma los grupos más distinto a todos." (apuesta-audaz keeps
  "El pronóstico de 1º de grupo que menos gente comparte" — clearly distinct.)
- **Hint:** "Se revela cuando cierra el grupo".

### 9 · La tabla soñada 🏆
- **Placement/gate:** graph card in the Gráficos strip · group lock.
- **Compute:** `dreamTable: Array<{ groupLabel, teamId, name, flag, votes, total }>`
  — per locked group, the modal `firstTeamId` with its vote count and total pickers,
  sorted by `groupLabel`.
- **Output:** new `ConsensusBoard` component — responsive grid of tiles
  (`Grupo A · 🇲🇽 México · 7/9`). Empty state "Se muestra a medida que cierran los grupos."
- **Copy:** subtitle "El 1º de cada grupo según la familia".

### 7 · Tu gemelo y tu opuesto 👯
- **Placement/gate:** line inside the personal "Tus stats" card · kickoff (uses similarity).
- **Compute:** helper `pickTwinAndOpposite(similarity, currentUserId, profiles)` reading
  the current user's row: highest cell (>0) = gemelo, lowest cell among shared-pick
  pairs = opuesto. Adds `twin?: { name: string; pct: number }` and
  `opposite?: { name: string; pct: number }` to `PersonalCard`.
- **Edge cases:** 2-user pool or gemelo === opuesto → show only twin; no shared
  picks / empty row → omit the line entirely.
- **Output:** rendered as a small strip in `PersonalCardView`
  (e.g. "👯 Tu gemelo: Beto (82%) · 🃏 Tu opuesto: Caro (40%)").

## Charts / components
- Reuse `Histogram` (Grupo de la muerte), `BarStat` (profeta, visionario),
  `TeamThermometer` (colista — add optional `leaderIcon` prop, default "👑").
- New `ConsensusBoard` component in `charts.tsx` for La tabla soñada.
- Twin/opposite is plain text in `PersonalCardView`.

## Testing (`src/lib/stats.test.ts`)
New `describe` blocks:
- **grupo de la muerte:** contention ranking picks the right group; single-picker groups ignored.
- **colista:** 4th-place tally ranks the right team; respects locked groups only.
- **profeta:** sums `exactPositions` across finalized groups; ignores non-finalized.
- **visionario:** divergence count ranks the most-contrarian full ranking.
- **tabla soñada:** modal winner + vote share per locked group.
- **twin/opposite:** extracts max/min from a user's similarity row; 2-user and no-shared-picks edges.

## Tie-breaks
- "Modal team at a slot" = most-voted team for that position; ties broken by team
  name (`localeCompare`) so the metric is deterministic.
- Grupo de la muerte / La tabla soñada: when groups or teams tie, order by
  `groupLabel` / team name respectively for stable output.

## Out of scope
- Dark-horse / qualifier stats (need FIFA-rank data we don't have).
- "Rey del empate" (redundant with `sin-empates`).
- Any change to the reveal gates or privacy rule.

## Verification
`npx tsc --noEmit`, `npm run lint`, `npx vitest run src/lib/stats.test.ts`,
`npm run build` — all green before commit.
