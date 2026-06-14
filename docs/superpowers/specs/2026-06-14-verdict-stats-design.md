# El veredicto — results cross-check stats — design

**Date:** 2026-06-14
**Branch:** feat/verdict-stats
**Status:** Approved, ready for implementation plan

## Goal

Add a new `/estadisticas` section, **"El veredicto"**, that cross-checks the
family's *predictions* against what **actually happened**. Today every
prediction-time stat (who's boldest, who diverges from the herd, which team the
family backs) is computed at lock time and never validated once results land.
This section closes that loop: it scores boldness, contrarianism, team
expectations and forecasting habits against reality, surfacing who was a
visionary and who just got lucky/burned.

It is one new `FactCategory` (`veredicto`) rendered last, with 10 standard
`FactCard`s — same card + drawer interaction as every other category. No new
chart components.

### Reveal model (unchanged, for reference)
- **Match kickoff** (`getMatchStatus !== "open"`): unlocks match-prediction stats.
- **Result finalized** (`getMatchStatus === "finalized"`): unlocks match accuracy stats.
- **Group lock** (`getGroupStatus !== "open"`): unlocks group-pick stats.
- **Group result finalized** (`getGroupStatus === "finalized"`): unlocks group-accuracy stats.
- Privacy: group-wide stats use locked/finalized data only.

All 10 verdict cards are `requires: "results"` and gated on the relevant
match/group being **finalized**. Before the first relevant result lands they
render the existing greyed `!available` state with hint copy.

### Coverage map (which existing stats each card validates)
- **Apuesta audaz premiada** → validates `apuesta-audaz`.
- **El rebelde tenía razón** → validates `rebelde`.
- **El visionario confirmado** → validates `visionario` ("El supuesto visionario").
- **El profeta solitario** → new match-level analog of `apuesta-audaz`.
- **La sorpresa / La decepción** → validate `colista`, `mas-odiado`, `favorito-familia`, `mas-querido` (team expectation vs reality, both directions).
- **El ojo clínico** → validates `optimista` + `candado` (goal-volume realism).
- **¿El método paga?** → validates `madrugador` / `ultimo-minuto` / `indeciso`.
- **¿La manada sabía?** → validates `del-monton`.
- **El grupo cantado ¿se cumplió?** → validates `grupo-unanime`.

## Shared scaffolding

- **New fact category** `veredicto` ("El veredicto"), added to `FactCategory`
  (`stats.ts`) and to `CATEGORY_ORDER` (last) + `CATEGORY_LABELS` (`estadisticas.tsx`).
- **New builder** `buildVerdictFacts(profiles, predictions, groupPredictions, matches, groups, teams, revealedMatches, finalizedMatches, revealedGroups, finalizedGroups)`
  returning all 10 facts. Plumbed from `computeStats` — note it needs the actual
  `groups: Group[]` (real finishing order), which current builders don't receive.
- **New FactIds**: `"audaz-premiada" | "rebelde-razon" | "profeta-solitario" |
  "visionario-confirmado" | "sorpresa" | "decepcion" | "ojo-clinico" |
  "metodo-paga" | "manada-sabia" | "grupo-cantado"`.
- **Shared helpers** (extract/export to avoid duplication):
  - `export crowdOutcomeByMatch(...)` — already exists, currently un-exported.
  - `modalGroupPositions(revealedGroupPreds, slots): Map<"label:slotIdx", teamId>`
    — extracted from `buildGroupRankingFacts` (the modal/consensus team per slot).
  - `lone1stPicks(...)` — extracted from `buildTeamLoyaltyFacts`: per person, which
    of their 1º picks no other approved person shares in that group.
  - `actualGroupOrder(group): (string|null)[]` — `[first,second,third,fourth]TeamId`.
- Group result lookup uses the `Group` object's `firstTeamId…fourthTeamId` (the
  real result), gated by `finalizedGroups`.
- Wire facts into `computeStats`'s `facts[]` array and `StatsBundle` as needed.

### Card-shape note
Person-ranked cards set `winner`/`series` and use `BarStat` exactly like
`francotirador`. Team/group/family cards follow the existing
`grupo-muerte`/`colista` pattern: a placeholder `winner` (`approved[0]`) with the
real label carried in `headline`, and `teamSeries`/`bins` for the chart.

## Stats

### 1 · Apuesta audaz premiada 🎯
- **Gate:** group result finalized.
- **Compute:** per person, take their *lone* 1º picks (`lone1stPicks`, no other
  approved person picked that team 1º in that group, over revealed groups) that
  fall in **finalized** groups; count how many of those teams actually finished
  1º (`group.firstTeamId === pick`). `value` = vindicated count.
- **displayValue:** one team → `${flag} ${name} · salió 1º ✅`; misses-only →
  `${flag} ${name} · quedó ${pos}º`; multiple → `${n} picks solitarios clavados`.
- **Output:** `chartKind: "bar"`, `BarStat`. Winner = max. When max = 0 (lone
  picks exist but none landed yet), `headline = "Nadie clavó su pick solitario… todavía"`.
- **Available:** ≥1 finalized group containing a resolved lone pick.
- **Copy:** "El que se la jugó solo a un 1º de grupo… y la clavó."

### 2 · El rebelde tenía razón ✊
- **Gate:** match result finalized.
- **Compute:** crowd majority outcome per match from `crowdOutcomeByMatch`
  (over revealed predictions). Per person, over **finalized** matches where their
  predicted outcome ≠ crowd majority, count `outcomeHit`. `value` = correct
  contrarian calls.
- **displayValue:** `${n} de ${contrarianTotal} a contramano`.
- **Output:** `chartKind: "bar"`, `BarStat`. Winner = max.
- **Available:** ≥1 finalized match with a determinable crowd majority.
- **Copy:** "Fue contra la familia… y los partidos le dieron la razón."

### 3 · El profeta solitario 🦅
- **Gate:** match result finalized.
- **Compute:** per **finalized** match, group approved predictions by exact
  scoreline (`home-away`). A scoreline predicted by exactly one person is "lone";
  if that lone prediction is `exactHit`, credit the person. `value` = lone exact
  hits.
- **displayValue:** one → `${home}-${away} en ${matchLabel}`; multiple →
  `${n} exactos en soledad`.
- **Output:** `chartKind: "bar"`, `BarStat`. Winner = max. Max = 0 →
  `headline = "Nadie clavó un exacto en soledad… todavía"`.
- **Available:** ≥1 finalized match.
- **Copy:** "El único que cantó ese resultado exacto… y entró."

### 4 · El visionario confirmado 🔮
- **Gate:** group result finalized.
- **Compute:** consensus per slot via `modalGroupPositions` (needs ≥2 pickers in
  the group). Per person, over **finalized** groups, count slots where their team
  ≠ the family's modal team **and** == the actual team in that slot. `value` =
  "correct divergent slots".
- **displayValue:** `${n} casilleros que clavaste contra la corriente`.
- **Output:** `chartKind: "bar"`, `BarStat`. Winner = max. Pairs with the
  prediction-time `visionario` ("El supuesto visionario"): this proves whether
  the divergence paid off.
- **Available:** ≥1 finalized group with ≥2 pickers.
- **Copy:** "Armó los grupos distinto a todos… y le salió bien."

### 5 · La sorpresa de la familia 🚀
- **Gate:** group result finalized.
- **Compute:** for each team appearing in **finalized** groups, expectedPos =
  rounded average of the positions (1–4) the family assigned it across revealed
  group predictions; actualPos = its real finishing slot. `placesGained =
  expectedPos − actualPos`. Keep teams with `placesGained > 0`, sort desc.
- **Output:** `chartKind: "thermometer"`, `teamSeries` = overachievers
  (`count = placesGained`), `unitSuffix = "puestos"`, `valueDetail = "mejor de lo esperado"`,
  `headline = topTeamHeadline(...)`. Empty (nobody overachieved) →
  `headline = "La familia la vio venir: sin sorpresas"`.
- **Available:** ≥1 finalized group.
- **Copy:** "El equipo que la familia subestimó y terminó más arriba."

### 6 · La decepción de la familia 🥀
- **Gate:** group result finalized.
- **Compute:** mirror of #5: `placesDropped = actualPos − expectedPos`, keep
  `> 0`, sort desc.
- **Output:** `chartKind: "thermometer"`, `count = placesDropped`,
  `unitSuffix = "puestos"`, `valueDetail = "peor de lo esperado"`,
  `leaderIcon = "🥀"` (don't crown the flop), `headline = topTeamHeadline(...)`.
  Empty → `headline = "Ningún fiasco: todos cumplieron"`.
- **Available:** ≥1 finalized group.
- **Copy:** "El equipo que la familia bancó y quedó más abajo de lo cantado."

### 7 · El ojo clínico 🎯
- **Gate:** match result finalized.
- **Compute:** per person, over **finalized** matches they predicted, mean of
  `|(pHome+pAway) − (aHome+aAway)|` (goal-total error). `value` = avg error
  (1 decimal). Lower is better → sort ascending, winner = min (`pickWinner a<b`,
  same as `candado`).
- **displayValue:** `${err} goles de error promedio`.
- **Output:** `chartKind: "bar"`, `BarStat`, `unitSuffix = "goles"`.
- **Available:** ≥1 finalized match predicted.
- **Copy:** "Quien mejor le calcula el ritmo goleador a los partidos."
- *Scope:* goal-volume realism only (validates optimista/candado). Draw-rate
  realism (sin-empates) is a possible later tweak, deliberately out of scope.

### 8 · ¿El método paga? ⏱️
- **Gate:** match result finalized.
- **Compute:** family-level bucket comparison. Compute each approved person's
  avg lead time (kickoff − updatedAt, hours) over revealed predictions and their
  exact-hit % over finalized predictions. Split people at the **median** lead
  time into "Madrugadores" (≥ median) and "Último minuto" (< median); each
  bucket's value = average exact-hit % of its members.
- **Output:** `chartKind: "histogram"`, `bins = [{label:"Madrugadores"}, {label:"Último minuto"}]`,
  `unitSuffix = "%"`. `headline` names the winning habit
  (e.g. "Madrugar paga" / "Mejor sobre la hora"). Placeholder `winner`.
- **Available:** ≥2 people with finalized predictions.
- **Copy:** "¿Cargar temprano o sobre la hora rinde más puntería?"

### 9 · ¿La manada sabía? 🐑
- **Gate:** match result finalized.
- **Compute:** family-level. Over **finalized** matches with a determinable crowd
  majority outcome, count matches where the majority outcome matched the actual
  outcome. `headline` = `"La mayoría acertó ${pct}% de los partidos"`.
- **Output:** `chartKind: "histogram"`, `bins = [{label:"La manada acertó", count: hits},
  {label:"La manada falló", count: misses}]`. Placeholder `winner`.
- **Available:** ≥1 finalized match with a crowd majority.
- **Copy:** "Cuando la familia votó en masa, ¿tenía razón?"

### 10 · El grupo cantado ¿se cumplió? 🎵
- **Gate:** group result finalized.
- **Compute:** over **finalized** groups with ≥2 pickers, per group count how many
  of the 4 slots the family's modal (consensus) order matched the actual order
  (`modalGroupPositions` vs `actualGroupOrder`). `bins` = group letter →
  matched-slot count (0–4), sorted desc. `headline` names the group the family
  most agreed on (lowest contention among finalized groups) and how it resolved,
  e.g. `"Grupo C: la familia cantó 4/4"` / `"Grupo C: la familia falló (1/4)"`.
- **Output:** `chartKind: "histogram"`, `unitSuffix = ""`, `valueDetail = "de 4 aciertos"`.
  Placeholder `winner`.
- **Available:** ≥1 finalized group with ≥2 pickers.
- **Copy:** "El grupo más cantado por la familia, ¿salió como dijeron?"

## Charts / components
- Reuse `BarStat` (#1, 2, 3, 4, 7), `TeamThermometer` (#5, 6 — `leaderIcon`
  already optional), `Histogram` (#8, 9, 10). No new components.
- The screen's `renderChart` already maps `bar`/`thermometer`/`histogram`; verify
  thermometer/histogram facts in this category route correctly (they carry their
  own `teamSeries`/`bins`, like `grupo-muerte`/`colista`).

## Testing (`src/lib/stats.test.ts`)
New `describe("verdict facts")` block, reusing the existing `gp()`/profiles/teams
fixtures plus match fixtures with scores:
- **audaz-premiada:** lone pick that finishes 1º counts; lone pick that misses
  doesn't; non-finalized group ignored; all-miss → "todavía" headline.
- **rebelde-razon:** contrarian-correct counted, contrarian-wrong and with-crowd ignored.
- **profeta-solitario:** scoreline predicted by exactly one person + exactHit counts;
  shared scoreline ignored.
- **visionario-confirmado:** divergent-and-correct slot counted; divergent-and-wrong
  and matches-consensus ignored.
- **sorpresa/decepcion:** overachiever vs underachiever ranked correctly; team that
  met expectation excluded from both.
- **ojo-clinico:** lowest goal-total error wins (ascending).
- **metodo-paga:** median split buckets people; bucket with higher avg exact% wins headline.
- **manada-sabia:** majority-correct percentage; matches without a majority ignored.
- **grupo-cantado:** consensus-vs-actual slot count per finalized group; <2-picker group ignored.

## Tie-breaks
- "Modal team at a slot" ties broken by team name (`localeCompare`) — reuse the
  existing `modalGroupPositions` rule.
- Person ranks: `topTies`/`coWinners` as elsewhere.
- Team thermometers (#5, 6): equal `count` ordered by team name.
- Bucket/group histograms: stable order by label.

## Out of scope
- Draw-rate realism for `ojo-clinico` (goal-volume only).
- `partido-dividido` / `grupo-muerte` result annotations (covered indirectly / weak).
- `apuesta-segura` "did safe pay off" comparison (deferred; not in approved set).
- Any change to reveal gates, privacy rule, or existing prediction-time stats.

## Verification
`npx tsc --noEmit`, `npm run lint`, `npx vitest run src/lib/stats.test.ts`,
`npm run build` — all green before commit.
