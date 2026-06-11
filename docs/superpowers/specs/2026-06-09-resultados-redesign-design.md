# Resultados page redesign — design

**Date:** 2026-06-09
**Status:** Approved (pending spec review)

## Problem

The current Resultados screen (`src/screens/results.tsx`) renders a flat list of
**every** match across all stages, plus all group standings at the top. It shows
only the official score and a bare "N pronósticos" count — there is no way to
select a stage, and no way to compare each family member's predictions against
the actual outcome.

## Goal

Redesign Resultados so that it:

1. Uses stage selection (like Pronósticos) — pick a stage to see its results.
2. Lets you compare everybody's predictions against the official outcome, inline
   and per match/group, via a collapsible list.

No backend, schema, scoring, or `app-context` changes. This is a presentation
rewrite of `src/screens/results.tsx` using data already available from `useApp()`.

## Non-goals

- No changes to scoring (`src/lib/scoring.ts`) or data layer.
- No new prediction-entry affordances (Resultados is read-only).
- No right-hand summary/leaderboard sidebar (kept on Pronósticos only).
- No champion/top-scorer or other backlog markets.

## Design

### 1. Page structure & stage selection

Reuse the existing `StageTabs` component (`src/components/badges.tsx`) — mobile
renders a `Select`, desktop renders `Tabs`. State is a single `activeStage:
Stage` held in `ResultsScreen`.

- **Enabled tabs:** a stage tab is enabled when it has content to show, i.e.
  the stage has ≥1 match (and the `groups` tab is enabled when ≥1 group exists).
  This differs from Pronósticos, where enablement tracks `openStages` (prediction
  availability). Results must remain viewable after a stage closes for editing.
  - Implementation: build a synthetic `StageState[]` where `open` = "stage has
    content", and pass it to `StageTabs`. The component already disables tabs via
    its `stages[].open` flag, so no change to `StageTabs` is required.
- **Default active stage:** the latest stage in `stageOrder` that has any
  *finalized* content (a finalized match, or a group with `resultFinalizedAt`);
  otherwise the first stage in `stageOrder` that has content; otherwise `groups`.
  Computed once with `useState(initializer)`.
- **Header:** slim panel with the label "Fixture y marcadores" / title
  "Resultados" and the count of matches in the selected stage (groups tab shows
  the group count). Reuse the existing `ui.panel` header style.

### 2. Match cards — `ResultMatchCard`

Rendered for the selected stage's matches, sorted by `kickoffUtc`. Each card
shows `StageBadge` + `StatusChip`, then a scoreline, then a collapsible
comparison. Behavior depends on `getMatchStatus(match, now)`:

| Status      | Score slot                 | Collapsible list                                   |
| ----------- | -------------------------- | -------------------------------------------------- |
| `open`      | "vs"                       | None (predictions stay hidden until kickoff)       |
| `locked`    | "Resultado pendiente"      | Revealed picks, **no points/colors**               |
| `finalized` | `H-A` in green             | Picks **with points pills**                        |

The scoreline reuses the current `TeamResult` layout (flag chip, label, short
name; mirrored on the right). Footer keeps kickoff + city for `open`/`locked`.

**Collapsible list** (shared `Collapsible`, see §4):

- **Collapsed by default.** Toggle row shows a chevron + "Ver pronósticos" and a
  right-aligned summary.
  - Finalized summary: `{submitted} de {approvedCount} · {exactCount} exactos`
    where `exactCount` = predictions with `exactHit`.
  - Locked summary: `{submitted} de {approvedCount} cargados`.
  - The list is only rendered for `locked`/`finalized` (per §1 table); `open`
    cards render no toggle.
- **Expanded:** one `PredictionComparisonRow` per approved profile:
  - Name, with the current user's row highlighted (outline/ring).
  - Their pick: `H-A`, plus `· clasifica {team}` when `winnerTeamId` is set.
  - Points pill: `+3` (green) / `+1` (amber) / `+0` (muted) when finalized;
    omitted when locked.
  - Missing users render `Sin pronóstico` muted with no pill.
- **Sort order:**
  - Finalized: points desc, then `exactHit` first, then `displayName`; users with
    no prediction sink to the bottom.
  - Locked: users with a prediction first (alphabetical by `displayName`), then
    `Sin pronóstico`.
  - The current user is highlighted in place — not reordered.

### 3. Groups tab — `ResultGroupCard`

When `activeStage === "groups"`, render one card per group (sorted via
`compareGroups`). Status from `getGroupStatus(group, now)`:

- **Actual standings:** when `finalized`, show the 1°–4° order
  (`firstTeamId…fourthTeamId`) as flag + label rows (reuse current
  `GroupStandingsResult` ordered-list styling). Otherwise show "Resultado
  pendiente".
- **Collapsible comparison** (collapsed by default), same toggle pattern:
  - `finalized`: each person's predicted order joined as short names
    (`groupOrderTeams(prediction).map(shortName).join(" · ")`) + points pill
    (`prediction.points`) + `{exactPositions}/4`.
  - `locked`: reveal predicted orders without points.
  - `open`: no toggle.
  - Sorting mirrors §2 (points desc / alphabetical; missing last; me highlighted).

### 4. Shared pieces & reuse

- **`Collapsible`** — a small local component (or `useState(false)` + a toggle
  button + conditional body) owning per-card open/closed state. Default closed.
- **`PredictionComparisonRow`** and **`GroupComparisonRow`** — presentational row
  components. They take a profile, its (optional) prediction, and a
  `showPoints` flag.
- A helper that, given the approved profiles and the relevant predictions,
  returns the sorted `{ profile, prediction }[]` per the §2 rules. Shared between
  match and group cards where practical.
- All data via `useApp()`: `matches, predictions, groups, groupPredictions,
  profiles, teams, now, currentUser`. Points/`exactHit`/`exactPositions` are
  precomputed; the screen only reads them.
- "Approved users" = `profiles.filter((p) => p.approved)`, matching the
  Pronósticos drawers.

### File impact

- Rewrite `src/screens/results.tsx` into: `ResultsScreen` (stage state + tabs +
  header), `ResultMatchCard`, `ResultGroupCard`, `Collapsible`,
  `PredictionComparisonRow`, `GroupComparisonRow`, plus the retained
  `TeamResult`/standings helpers and a sort helper.
- No other files change. `src/app/resultados/page.tsx` keeps rendering
  `<ResultsScreen />`.

## Testing

- Manual verification across the three match statuses (open/locked/finalized) and
  group statuses, confirming: collapsed-by-default, correct summary counts,
  points pills only when finalized, `Sin pronóstico` sorted last, current user
  highlighted, stage tabs enabled only for stages with content, and the default
  stage landing on the latest finalized stage.
- If pure helpers are extracted (sort/summary), add focused unit tests alongside
  the existing `src/lib/*.test.ts` suite.
