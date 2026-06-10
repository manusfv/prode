# Standings table refresh + always-visible mobile stats

**Date:** 2026-06-09
**Status:** Approved (design)

## Problem

Two related pain points around how a participant sees their own standing:

1. **Mobile users must scroll the whole page to see their stats.** On the Pronósticos
   screen the right-hand `<aside>` (`SummaryPanel` with Puntos / Puesto / Pendientes +
   the `LeaderboardPreview` "Tabla familiar" shortcut) is `sticky` on desktop but becomes
   `static` below `lg`, so it falls to the very bottom — after every match card.
2. **The standings table itself is plain** — a bare 5-column shadcn table
   (`Puesto / Participante / Puntos / Exactos / Aciertos`) with no visual hierarchy, and
   it's cramped on a phone.

## Goals

- A participant can see their **rank + points without scrolling** on mobile.
- The standings table looks polished and reads well on both desktop and phone.
- Remove the redundant Pronósticos shortcut/aside on mobile (it's the thing causing the scroll).

## Non-goals (out of scope)

- Making the stage filter (Grupos / Octavos / …) actually filter points by stage. It is
  currently decorative (no state wiring, `getLeaderboard` sums all stages). We keep its
  current appearance and behavior; wiring per-stage scoring is a separate future task.
- Avatar image uploads. We render **initials** from `displayName`.
- Any change to scoring, data model, or Supabase actions.

## Design

### 1. Mobile stats in the header (the "no-scroll" fix)

**Hide the aside on mobile.** In `predictions.tsx`, the right `<aside>` (lines ~182–185)
becomes `max-lg:hidden`. The `SummaryPanel` + `LeaderboardPreview` render only at `lg`+
(desktop sidebar, where they're already sticky and useful).

**Add a stats pill to the sticky mobile header.** The mobile top bar lives in
`app-shell.tsx` (lines ~436–444: hamburger + logo + "Prode Carbia"). Add a right-aligned
pill showing the current user's **rank + points**, e.g. `#3 · 42 pts`. Tapping it navigates
to `/tabla`.

- Layout: `<strong>Prode Carbia</strong>` keeps its spot; a `flex-1` spacer pushes the pill
  to the right edge.
- The pill is a `Link`/button to `tabRoutes.leaderboard`. Rank uses muted styling; points
  use the green accent (`text-app-green`), mirroring the existing `Stat` treatment.
- It only appears when there's a leaderboard entry for the current user (always true for an
  approved participant).

**Data.** `AppShell` already holds `predictions` + `profiles`. Compute
`me = getLeaderboard(predictions, profiles).find(r => r.user.id === currentUser.id)` (memoized)
and pass `rank`/`points` into the mobile header. The same `getLeaderboard` helper already powers
the Pronósticos summary, so this is consistent and adds no new logic.

### 2. Standings table refresh (`leaderboard.tsx`)

Podium for the top 3, refined table for everyone else.

**Podium (top 3).** A row of three cards, center = 1st (raised + gold tint), left = 2nd,
right = 3rd. Each card: medal (🥇🥈🥉), an initials avatar, `displayName`, points (large,
green), and a small `N ex · N ac` subtitle.

- Avatar = first letter(s) of `displayName`. Gold / silver / bronze background for 1/2/3.
- **If the current user is in the top 3,** their podium card gets the highlight (ring) instead
  of a table row.
- Podium stacks cleanly on phone (three narrow cards side by side; subtitle may drop to keep
  them readable).

**Table (rank 4+).** Refined version of the current table:

- Columns: `# · Participante · Puntos · Exactos · Aciertos`. Numeric columns right-aligned.
- **Points emphasized** — bold, green, larger than other cells.
- Rank shown as a muted number.
- **Current user's row highlighted** — subtle background + a blue inset edge on the first cell.
- Zebra/hover polish via existing `app-*` tokens.

**Mobile behavior.**
- Podium stacks as above.
- The table **drops the Exactos / Aciertos columns into a subtitle** under the participant
  name (`4 ex · 15 ac`), leaving just `# · Participante · Pts` — so it never overflows or
  needs horizontal scroll. (Implemented with responsive column visibility, not a separate
  table.)
- The stage filter row keeps its current responsive behavior (Tabs at `sm`+, Select below).

**Edge cases.**
- **Fewer than 3 participants:** the podium renders only the spots that exist (1 or 2 cards,
  centered); the table renders whatever remains (possibly empty).
- **Empty leaderboard:** show the existing empty state / nothing in the table body; no podium.

### Component decomposition

`leaderboard.tsx` grows, so split it for clarity (each unit independently understandable):

- `LeaderboardScreen` — fetches rows, owns the stage-filter header, composes `Podium` + `StandingsTable`.
- `Podium` — takes top-3 rows + `currentUserId`; renders `PodiumSpot`s.
- `StandingsTable` — takes rows (rank 4+) + `currentUserId`; renders the refined table with
  responsive subtitle.

Shared helpers (initials from `displayName`, medal-by-rank) live alongside in the same file or
a small local util.

The mobile header pill is a small presentational piece inside `app-shell.tsx` (or a
co-located `MobileStatsPill` component) fed `rank`/`points`.

## Data flow

```
AppShell (has predictions, profiles, currentUser)
  └─ me = getLeaderboard(predictions, profiles).find(currentUser)   // memoized
       ├─ mobile header pill: #rank · points  → links to /tabla
       └─ (desktop) Pronósticos aside unchanged

LeaderboardScreen (/tabla)
  └─ rows = getLeaderboard(predictions, profiles)
       ├─ Podium       ← rows[0..2], currentUser.id
       └─ StandingsTable ← rows[3..],  currentUser.id
```

No new server actions, types, or scoring changes.

## Testing / verification

- Manual responsive check at desktop (`lg`+) and phone widths:
  - Mobile: aside gone, header pill visible with correct `#rank · pts`, tap → `/tabla`.
  - `/tabla`: podium for top 3, table for the rest, your row/spot highlighted.
  - Phone `/tabla`: no horizontal scroll; ex/ac appear as subtitle.
- Edge cases: 1, 2, and 3 participants; current user in top 3 vs. lower; empty leaderboard.
- `npm run lint`, `npm run build`, and `npm run test` (vitest) all clean.
```
