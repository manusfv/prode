# Knockout bracket auto-fill + auto results — design

**Date:** 2026-06-27
**Status:** Approved for planning
**Builds on:** [`2026-06-16-auto-sync-results-design.md`](./2026-06-16-auto-sync-results-design.md)

## Goal

Wire up the football-data.org feed for the **knockout bracket** so it auto-fills
without manual entry, mirroring what the group-standings sync already does:

1. **Team assignments auto-fill.** As the bracket is determined, knockout fixtures
   get their `home_team_id` / `away_team_id` from the feed — placeholder seeds
   like "Winner Group L" / "3rd Group C/E" resolve to real teams. There is **no
   internal bracket advancement** in the app today (knockout teams are only ever
   set manually), so the feed is genuinely what makes the bracket fill.
2. **Results auto-update.** Finished knockout matches get scores + winner +
   finalize, and predictions are rescored — same as the admin finalize path.
3. **Predictions auto-close at kickoff.** Already works server-side
   (`canSavePrediction` → `getMatchStatus` locks at `kickoffUtc`); this design
   keeps `kickoffUtc` accurate by refreshing it from the feed so the lock fires
   at the real kickoff.

This is the deferred second half of the 2026-06-16 design (the "elimination match
results" path). The group-standings path it ships alongside is already live.

## Non-goals

- No live ticker / minute-by-minute updates — periodic sync only.
- No lineups, cards, xG, odds.
- No new scoring logic — reuse `scorePrediction`.
- No internal bracket-progression engine — the feed is the source of team
  assignments, not a computed advancement of our own winners.

## Data source

**football-data.org v4**, free tier (already used for standings).
`X-Auth-Token: <FOOTBALL_DATA_TOKEN>`, 10 req/min.

- Knockout matches: `GET /v4/competitions/WC/matches`, filtered client-side to
  knockout stages. One call per run (well within limits).

Each match exposes (validated for the standings path; the matches shape is the
documented v4 shape): `id`, `utcDate`, `status`, `stage`, `homeTeam`/`awayTeam`
(`tla` is `null` when the team is not yet determined), and `score`
(`winner`, `fullTime.home/away`, `duration`).

**Two unknowns to verify on the first live run** (no token available locally):
the exact `stage` enum strings and how a not-yet-determined team is represented
(assumed `tla: null`). Both are isolated to the adapter and matcher and fail
closed (unknown stage → logged + skipped; null tla → team simply not filled yet).

## Join key (decided)

We **persist the feed's match id** on our fixtures. A new nullable
`matches.feed_match_id` column is bootstrapped once by a `(stage + utcDate)` join,
then every subsequent run matches by the stable feed id. This survives kickoff-time
changes and lets us refresh `kickoff_utc` from the feed. Rejected alternative:
a pure datetime join every run (no migration) — simpler, but a fixture silently
stops syncing if its kickoff shifts in the feed vs our seed data.

## Architecture

The existing protected route gains a second, orthogonal path. Standings touch
`groups`; knockout results touch `matches`. One run does both.

```
external scheduler (every 30 min)
        │  curl, Authorization: Bearer <CRON_SECRET>
        ▼
/api/sync-results  (Next.js route handler, server-only)
        │
        ├─ STANDINGS path (existing) ─► groups table + group_predictions recalc
        │
        └─ MATCHES path (this design)
             ├─ fetchKnockoutMatches ─► football-data.org /matches
             ├─ matchFixtures (pure) ─► desired per-fixture state by feed id
             ├─ ingestMatches ───────► matches table (teams, kickoff, result)
             └─ recalcMatchPredictions ► predictions table (scorePrediction)
        ▼
Supabase (service-role client; bypasses RLS for system writes)
```

## Components

Each is a small, independently testable unit following the existing
`src/lib/sync/*` + `*.test.ts` conventions.

### 1. Feed adapter — extend `src/lib/sync/football-data.ts`

`fetchKnockoutMatches(token): Promise<FeedMatch[]>`
- Hits `GET /v4/competitions/WC/matches`, filters to knockout stages via the
  stage map below, returns normalized `FeedMatch`. Provider JSON never leaves
  this file.

New normalized shape in `src/lib/sync/types.ts`:

```ts
export type FeedMatch = {
  feedId: number;
  stage: Stage;              // our Stage, already mapped
  utcDate: string;           // ISO kickoff from the feed
  homeTla: string | null;    // null when team not yet determined
  awayTla: string | null;
  status: string;            // feed status, e.g. "SCHEDULED" | "FINISHED"
  homeScore: number | null;
  awayScore: number | null;
  winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
};
```

**Stage map** (football-data enum → our `Stage`):

| feed stage        | our stage |
|-------------------|-----------|
| `LAST_32`         | `round32` |
| `LAST_16`         | `round16` |
| `QUARTER_FINALS`  | `quarter` |
| `SEMI_FINALS`     | `semi`    |
| `THIRD_PLACE`     | `third`   |
| `FINAL`           | `final`   |

Unknown stage → logged once and skipped (never guess). The map is a pure,
directly tested function.

### 2. Match matcher — new `src/lib/sync/match-fixtures.ts` (pure)

Input: `FeedMatch[]` + our knockout `Match[]` + `knownIds: Set<string>`.

- **Bootstrap:** a fixture whose `feedMatchId` is null is matched to a feed match
  by `stage` equality **and** equal `utcDate`/`kickoffUtc` (exact ISO instant);
  it adopts that `feedId`. If multiple feed matches share a stage+instant
  (shouldn't happen in knockouts), it is left unmatched and logged.
- **Steady state:** a fixture with a `feedMatchId` is matched directly by id.
- Resolves TLAs via existing `resolveTeamId(tla, knownIds)`. A `null` tla means
  the team isn't determined yet → that slot is simply not filled this run.
- Winner: `HOME_TEAM`→home id, `AWAY_TEAM`→away id, `DRAW`→null. Penalty/ET
  knockouts: feed gives the 90'/ET score in `fullTime` and the advancer in
  `winner` — we store that score and set `winnerTeamId` to the advancer (our
  existing model).
- **Ownership:** a fixture with `finalizedSource === 'admin'` is skipped entirely.
- Output: `{ matchId, feedId, homeTeamId|null, awayTeamId|null, kickoffUtc,
  homeScore|null, awayScore|null, winnerTeamId|null, finalize: boolean }[]`
  (`finalize` true only when feed `status` is `FINISHED` and both scores present),
  plus an `unmatched` list (unknown tla, no fixture found, ambiguous bootstrap).

### 3. Match ingest — new `src/lib/sync/ingest-matches.ts`

For each non-admin matched fixture, write:
- Always: `feed_match_id`, `home_team_id`, `away_team_id` (only overwriting a slot
  when the feed has a team; a still-null feed slot does not blank an existing id),
  `kickoff_utc` (refreshed from feed), `updated_at`.
- When `finalize`: `home_score`, `away_score`, `winner_team_id`,
  `status='finalized'`, `finalized_at`, `finalized_source='auto'`, `finalized_by=null`.

Idempotent: re-running with identical feed data is a no-op-equivalent write.
Returns `{ filled, finalized, skipped }`.

### 4. Match recalc — new `src/lib/sync/recalc-matches.ts`

Mirrors `recalcGroupPredictions`: reads `predictions` for the changed match ids,
rescoring via `scorePrediction`. Same gating as the admin path — score only when
`match.status === 'finalized'`, otherwise `{ points: null, exactHit: false,
outcomeHit: false }`. Returns `{ ok, updated }`.

### 5. Route — extend `src/app/api/sync-results/route.ts`

After the existing standings path, run the matches path against the same
`teams` read (`knownIds`) and a fresh read of knockout `matches`. Errors are
isolated per path and reported; one path failing does not abort the other beyond
its own non-2xx. Summary JSON gains:

```json
"matches": { "filled": n, "finalized": n, "skipped": n }
```

### 6. Ownership / safety net

Single marker, reusing `finalized_source`:

- **Auto never touches a match with `finalized_source='admin'`.**
- To make a manual team correction durable, the admin match-edit action stamps
  `finalized_source='admin'`. Safe because scoring keys off `status`, not source;
  an `open` match carrying `finalized_source='admin'` only means "auto, hands off".
- Otherwise the feed is authoritative and self-heals bad early data on the next
  run — identical to the group path's reversibility model.

### 7. Schema migration

`docs/supabase-migration-feed-match-id.sql`:

```sql
alter table public.matches
  add column if not exists feed_match_id text;
```

`finalized_source` already exists from the group-path migration. `Match` gains
`feedMatchId: string | null`; `mapMatch` maps it; the match upsert/edit and
finalize actions persist it where relevant.

### 8. Admin UI marker

Knockout cards in `src/screens/admin.tsx` whose `finalized_source='auto'` show the
existing **Auto** badge (same component the group cards use, `app-*` tokens per the
design system). An admin edit flips it to manual.

## Data flow (happy path)

1. Scheduler curls `/api/sync-results` with the secret.
2. Standings path runs (existing).
3. `fetchKnockoutMatches` → normalized feed matches.
4. `matchFixtures` joins them to our fixtures (bootstrap by stage+instant, then by
   feed id), producing desired team/kickoff/result state.
5. `ingestMatches` fills teams + refreshes kickoff continuously; finalizes scores +
   winner when the feed reports `FINISHED`, stamping `source='auto'`, skipping
   admin-owned matches.
6. `recalcMatchPredictions` rescoring changed matches.
7. Route returns a combined summary.

## Error handling

- **Bad/missing token or feed non-2xx:** abort the matches path, surface the
  reason, change nothing in `matches`. Next run retries.
- **Unknown stage / unmatched tla / no fixture / ambiguous bootstrap:** skip it,
  include in the `unmatched` summary, log. Never guess.
- **Admin-owned match:** skip — a manual fix is never overwritten.
- **Partial DB failure:** each write independent; reported, not rolled back;
  re-running reconciles.
- **Auth failure on the route:** 401, no work (unchanged).

## Security

- Route still gated by `CRON_SECRET`; service-role key server-only.
- Only external input is the feed; bad data fails closed (skip + log).

## Testing

Pure unit tests (vitest, `src/lib` conventions):

- **Stage map:** every known enum value maps; unknown → skipped.
- **Adapter:** parse a captured `/matches` sample into `FeedMatch[]`, including a
  TBD-team match (`tla: null`) and a finished penalty match. No network.
- **Matcher:** bootstrap join by stage+instant adopts feed id; subsequent match by
  id; TBD team-fill (slot stays null); winner + penalty mapping; admin-owned skip;
  unmatched cases (unknown tla, no fixture, ambiguous bootstrap).
- **Ingest:** team-fill without finalize; finalize writes scores+winner+source;
  null feed slot does not blank an existing team id; idempotency; admin-owned skip.
- **Recalc:** scores finalized matches, leaves non-finalized at null.
- **Auto-close (regression):** `canSavePrediction` / `getMatchStatus` rejects a
  prediction once `now >= kickoffUtc`, confirming kickoff auto-close holds.

## Rollout

1. Migration adds `matches.feed_match_id`.
2. Ship adapter + matcher + ingest + recalc + route extension behind the existing
   secret.
3. **First light:** manual `workflow_dispatch` run. Validate the **stage enum** and
   **TBD representation** against the live feed; inspect the summary; confirm a few
   knockout fixtures filled correctly and any already-finished match finalized.
4. The existing 30-min schedule then handles the bracket as it fills, no further
   work.

## Novedades modal

Per project convention: ask whether to add a Novedades entry. The bracket
auto-filling teams + results is user-visible (predictions open as teams appear),
so a short changelog note is plausibly warranted — confirm with the user.

## Open decisions (defaults chosen)

- **Refresh `kickoff_utc` from the feed** for non-admin matches: **yes** (keeps
  auto-close accurate if times shift).
- **Reuse `finalized_source`** as the whole-row ownership marker rather than a
  separate `teams_source` column: **yes** (YAGNI).
