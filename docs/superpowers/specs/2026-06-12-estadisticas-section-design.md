# Estadísticas section — design

**Date:** 2026-06-12
**Status:** Approved (design), pending implementation plan
**Route:** `/estadisticas`

## Summary

A big, comprehensive, interactive statistics section for the family World Cup
prediction pool. It combines three flavors of content:

1. **Group superlatives / fun facts** — playful, awards-style facts comparing the
   whole family (el más optimista, el rebelde, etc.).
2. **A personal mini-card** — quirky stats about the current user.
3. **Real stats and graphs** — charts with actual numbers (distributions,
   per-stage points, position-over-time, heatmaps, a similarity matrix).

Every fun fact is **chart-backed**: the card shows the headline winner, and
clicking it opens a drawer with the full distribution chart for everyone plus a
ranked breakdown table. This unifies the "fun facts" and "real graphs" content.

## Goals

- A dedicated, comprehensive page that feels full from day one and visibly fills
  in as stages lock and results finalize.
- Reuse the existing data layer (`useApp()`) and follow established patterns
  (pure compute modules + tested derivations, `Card`/`Sheet` UI, Tailwind tokens,
  Argentine-Spanish copy).
- Mobile-first chart legibility.

## Non-goals

- No new server-side data or schema changes. Everything derives from data already
  loaded into the client via `useApp()`.
- No real-time/streaming updates beyond what the app already does.
- No historical persistence of computed stats (always derived on the fly).

## Architecture

### Route & screen
- `src/app/estadisticas/page.tsx` — route entry, mirrors the other pages.
- `src/screens/estadisticas.tsx` — `EstadisticasScreen`, a client component
  reading from `useApp()` (predictions, groupPredictions, matches, groups,
  profiles, teams, now, currentUser, standingsStages, openStages).
- New nav entry in `src/components/app-shell.tsx`, alongside Tabla / Resultados /
  Reglas.

### Pure compute module
- `src/lib/stats.ts` — the heart of the feature. Exposes `computeStats(input):
  StatsBundle`. All derivation lives here; zero rendering logic. Mirrors the
  existing pattern of `scoring.ts` / `standings.ts` (pure + unit-tested).
- `src/lib/stats.test.ts` — unit tests against small fixtures.

`StatsBundle` shape (illustrative):

```ts
type PersonValue = { user: Profile; value: number; displayValue: string };

type FactId =
  | "optimista" | "candado" | "scoreline-favorito" | "sin-empates"
  | "rebelde" | "del-monton" | "partido-dividido" | "palpito-solitario"
  | "francotirador" | "racha" | "trampa"
  | "favorito-familia" | "oveja-negra" | "equipo-cabecera"
  | "madrugador" | "ultimo-minuto" | "indeciso";

type Fact = {
  id: FactId;
  title: string;
  emoji: string;
  blurb: string;                 // one-line explanation
  available: boolean;            // false → render as locked teaser card
  unavailableHint?: string;      // e.g. "Se revela cuando cierren los partidos"
  requires: "predictions" | "results";
  winner?: PersonValue | { label: string; displayValue: string }; // co-winners allowed
  coWinners?: PersonValue[];
  series: PersonValue[];         // per-person data for the chart
  chart: ChartSpec;              // which chart primitive + axis config
};

type StatsBundle = {
  hero: { goalsDreamed: number; predictionsLoaded: number; groupExactPct: number; mostDividedMatchId?: string };
  personal: PersonalCard;        // uses ALL of current user's predictions
  facts: Fact[];                 // group-wide; locked-only data
  graphs: GraphBundle;           // standalone charts
};
```

### Charts
- Add `recharts` dependency and a shadcn chart wrapper at
  `src/components/ui/chart.tsx` (`ChartContainer`, `ChartTooltip`,
  `ChartTooltipContent`).
- Token-styled chart primitives under `src/components/stats/`:
  - `BarStat` — per-person bars (horizontal on narrow widths).
  - `Histogram` — scoreline / goals / points distributions.
  - `LineStat` — position-over-rounds, points-over-stages.
  - `Heatmap` — people × stages grid.
  - `SimilarityMatrix` — "¿quién piensa igual?".
  - `MatchSplit` — distribution of predicted outcomes/scorelines for one match.

### Interaction
- `EstadisticasScreen` renders a grid of `FactCard`s (headline + winner).
- Clicking a card opens `StatDrawer` (a `Sheet`) with the big chart on top and a
  ranked per-person breakdown table below.
- Locked/unavailable facts render as greyed teaser cards with
  `unavailableHint` and are not clickable.

## Privacy model (mixed)

`computeStats` partitions input by visibility:

- **Group-wide facts** only include predictions whose match has **locked or
  finalized** (`getMatchStatus(match, now) !== "open"`), and group predictions
  only for groups where `getGroupStatus(group, now) !== "open"`. This matches the
  app's existing "hidden until lock" reveal rule, so no one can reverse-engineer
  others' still-open picks.
- **Accuracy facts** (`requires: "results"`) additionally require the match to be
  **finalized** (results exist).
- **Personal mini-card** uses **all** of the current user's own predictions
  (they belong to the user, so no leak).
- Facts that have no eligible data yet are returned with `available: false` and an
  `unavailableHint`, so the page looks comprehensive and teases what's coming.

## Page layout (top → bottom)

1. **Hero números** — a few big group totals: goles soñados, pronósticos
   cargados, % exactos del grupo, partido más dividido.
2. **Tu mini-tarjeta** — favorite scoreline, optimism vs. group average, accuracy
   %, best round, most contrarian correct call.
3. **Fun-fact grid**, grouped by category:
   - Optimismo & goles
   - Manada vs. rebelde
   - Puntería & rachas
   - Fidelidad de equipo
   - Comportamiento / timing
4. **Gráficos** — the bigger standalone charts (la carrera, mapa de calor,
   ¿quién piensa igual?, termómetro de favoritos, distribuciones, reloj de
   pronósticos).

The page is single-column on mobile (stacks like the rest of the app) and
multi-column on larger screens.

## Fact → chart catalog

Availability: 🟢 = works once matches lock (predictions revealed); 🔵 = needs
finalized results.

| Fact | Avail. | Computation | Click-through chart |
|---|---|---|---|
| El más optimista / El candado | 🟢 | highest / lowest avg goals predicted per match | horizontal bar: avg goals per person |
| Scoreline favorito del grupo | 🟢 | most-predicted `home-away` scoreline (mode) | histogram of scorelines |
| Nunca cree en empates | 🟢 | lowest % of draw predictions | bar: % draws per person |
| El rebelde / El del montón | 🟢 | rate of disagreeing / agreeing with the majority pick per match | bar: contrarian rate per person |
| El partido más dividido | 🟢 | match with highest entropy across predicted outcomes | MatchSplit for that match |
| Pálpito solitario | 🟢 | a prediction only one person made | MatchSplit highlighting the lone pick |
| El francotirador | 🔵 | best exact-hit rate | bar: exact-hit % per person |
| Racha caliente / la sequía | 🔵 | longest run of correct / incorrect outcomes (chronological) | per-person streak bars |
| La trampa | 🔵 | match the most people got wrong | per-match: % who missed |
| El favorito de la familia / La oveja negra | 🟢 | team most / least backed across everyone's **group-stage 1st-place picks** (available once groups lock; "grupo" here = the family pool, not a tournament group) | termómetro: horizontal team bars |
| Tu equipo de cabecera | 🟢 | team each person most often backs to advance | bar: top backed team per person |
| El madrugador / del último minuto | 🟢 | avg lead time between `updatedAt` and kickoff/lock | bar: avg lead time per person |
| El indeciso | 🟢 | count of predictions where `updatedAt > createdAt` | bar: edit count per person |

**Standalone graphs:**
- **La carrera** 🔵 — accumulated table position over rounds (line/bump).
- **Mapa de calor** 🔵 — people × stages, colored by points/accuracy.
- **¿Quién piensa igual?** 🟢 — pairwise prediction-similarity matrix.
- **Termómetro de favoritos** 🟢 — per team, how many family members back it as a group-stage 1st-place pick.
- **Goles soñados vs. reales** 🔵 — group's predicted goals vs. actual.
- **Distribución de puntos por partido** 🔵 — how many scored 3 / 1 / 0 each match.
- **Reloj de pronósticos** 🟢 — when before kickoff people submit (timing histogram).

## Mobile / responsive

The concern: a right-side `Sheet` is only `w-3/4` (~280px) on mobile — too tight
for a chart + table.

- **Responsive drawer:** `StatDrawer` uses `side="bottom"` on mobile (full
  viewport width, up to ~90vh tall) and `side="right"` on `sm:`+ (widened panel,
  e.g. `sm:max-w-lg`). One component, `side` switched by breakpoint.
- **Chart adaptations for narrow widths:**
  - Per-person facts use **horizontal bar charts** (names on the Y axis stay
    readable instead of cramped/rotated X labels).
  - Charts use Recharts `ResponsiveContainer` with sensible `min-height`s.
  - Genuinely wide charts (mapa de calor, similarity matrix, la carrera) get
    **horizontal scroll inside the sheet** with a sticky axis, rather than
    squishing.
  - The **ranked breakdown table** always lists exact numbers, so even a dense
    chart stays fully legible as a list.
- The teaser widget never renders a chart — it's a one-liner only.

## Pronósticos teaser widget

A compact `Card` in the right sidebar of the predictions screen, below the
leaderboard preview. Shows **one rotating available group fun fact** (winner +
one-line blurb) and a link to `/estadisticas`. Reuses `computeStats` output; no
chart.

## Error handling & edge cases

- **No participants / nothing locked:** friendly empty state; facts render as
  locked teaser cards with hints.
- **Ties in superlatives:** show co-winners (`coWinners`); the chart shows
  everyone regardless.
- **Single participant:** social/consensus facts (rebelde, del montón, dividido,
  piensa igual) are hidden gracefully (not meaningful with one person).
- **Current user has no predictions:** personal card prompts them to go predict.
- **Missing/partial data:** computations defensively skip null scores and
  incomplete group orders (consistent with `scoring.ts`).

## Testing

- `src/lib/stats.test.ts` — each computation against small fixtures:
  - optimism average and candado (min),
  - scoreline mode,
  - draw percentage,
  - consensus / contrarian rates,
  - similarity pairing,
  - streak detection (chronological),
  - histogram bucketing,
  - **privacy filter**: open matches excluded from group facts but included in
    the personal card; finalized-only gating for accuracy facts.
- **UI verification:** the codebase tests pure logic only (vitest `node`
  environment, `src/**/*.test.ts`); there are no component render tests. The
  React screen and chart components are therefore verified via `npm run build`,
  `npm run lint`, and manual check against seed data — not a render test (which
  the current vitest config would not pick up). All non-trivial derivation lives
  in `stats.ts` so it is covered by `.test.ts` units.

## Open implementation notes

- Reuse `getMatchStatus`, `getGroupStatus`, `stageOrder`, `stageLabels` from
  `tournament.ts`; reuse leaderboard accumulation from `standings.ts` for the
  "carrera" graph.
- Keep `stats.ts` free of React; the screen and chart components consume its
  output.
- Match existing token usage (`ui` tokens, `app-*` colors) so charts theme with
  light/dark.
```
