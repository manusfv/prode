# Auto-sync results from football-data.org — design

**Date:** 2026-06-16
**Status:** Approved for planning

## Goal

Eliminate the daily manual chore of entering World Cup outcomes. A scheduled job
pulls data from a free football feed and writes it into our DB automatically,
with a visible "set by the bot" marker so the admin can spot-check and override.

Two outcome types, sharing one architecture:

1. **Group standings (primary, group stage is live now).** The app scores the
   group phase on *final positions 1–4 per group* (the `groups` table), not on
   individual match scores — group matches aren't even stored as fixtures. So we
   sync the **standings table**, write provisional positions continuously, and
   auto-finalize a group once all its matches are played.
2. **Elimination match results (expected next, as the bracket fills).** The
   knockout phase *is* stored as fixtures in `matches`. We sync **finished match
   scores + winner** for those.

## Non-goals

- No live ticker / minute-by-minute updates. We sync periodically.
- No lineups, cards, xG, odds — only positions, scores, and winners.
- No changes to scoring logic. We reuse the existing recalculation functions.

## Data source (locked)

**football-data.org v4**, free tier. `X-Auth-Token: <FOOTBALL_DATA_TOKEN>`,
10 req/min, no daily cap, WC in the free competition set, scores slightly delayed
(fine for periodic sync). Two endpoints:

- Standings: `GET /v4/competitions/WC/standings`
- Knockout matches: `GET /v4/competitions/WC/matches?status=FINISHED`

### Live validation (2026-06-16)

Verified against a real call with a valid token (tournament is live; 16 of 104
matches already played):

- Token authenticates; `x-api-version: v4`; both endpoints readable on free tier.
- **Standings** returns 12 group blocks, each `{ group: "Group A", type: "TOTAL",
  table: [ { position, team: { tla }, playedGames, points }, … ] }`, already
  ordered by the competition's tiebreak rules.
- **Matches** expose every field we need: `utcDate`, `status` (`FINISHED`),
  `homeTeam.tla`/`awayTeam.tla`, `score.winner`, `score.fullTime.home/away`,
  `score.duration`.
- **All 32 TLAs from played matches map to our team ids by `tla.toLowerCase()`
  with zero mismatches.** The TLA→id join is effectively identity; the override
  map starts empty.

## Architecture

A protected Next.js route does all the work; an external scheduler triggers it.
No separate infrastructure.

```
GitHub Action (*/30 cron)
        │  curl, Authorization: Bearer <CRON_SECRET>
        ▼
/api/sync-results  (Next.js route handler, server-only)
        │
        ├─ feed adapter ─► football-data.org  (standings + finished matches)
        │
        ├─ STANDINGS path ─► map group positions → groups table
        │                     (provisional; finalize when group complete)
        │
        ├─ MATCHES path   ─► map finished knockout games → matches table
        │                     (finalize scores + winner)
        │
        └─ recalc ─► reuse recalculateGroupPredictionsForGroups
                     and recalculatePredictionsForMatches
        ▼
Supabase (service-role client; bypasses RLS for system writes)
```

The two paths are orthogonal: standings only touch `groups`, match results only
touch `matches` (which holds knockouts only). One run does both; the group path is
what we light up and test first.

### Components

Each is a small, independently testable unit.

**1. Feed adapter — `src/lib/results-feed/football-data.ts`**
- `fetchStandings(token): Promise<FeedStanding[]>` →
  `{ groupLabel, positions: TLA[], playedByPosition: number[] }` per group.
- `fetchFinishedMatches(token): Promise<FeedMatch[]>` →
  `{ utcDate, homeTla, awayTla, homeScore, awayScore, winner }`.
- Provider JSON never leaks past this file — both return our normalized shapes.
  This is the swap point for a future provider.

**2a. Standings matcher — `src/lib/results-feed/match-standings.ts`** (pure)
- Input: `FeedStanding[]` + our `Group[]` + a `tlaToTeamId` resolver.
- `groupLabel`: strip the `"Group "` prefix → our single-letter label (`A`…`L`).
- Positions 1–4 → `firstTeamId`…`fourthTeamId`.
- **Completeness:** a group is complete when every position's `playedGames === 3`
  (4-team round robin = 3 games each). Complete ⇒ finalize; otherwise provisional.
- Output: `{ group, firstTeamId..fourthTeamId, finalize: boolean }[]`, plus an
  `unmatched` list (e.g. a TLA with no team id) for logging.

**2b. Match matcher — `src/lib/results-feed/match-fixtures.ts`** (pure)
- Input: `FeedMatch[]` + our `Match[]` + `tlaToTeamId`.
- Join key: same calendar day (`utcDate` vs `kickoffUtc`) **and** the unordered
  team-id pair (id = `tla.toLowerCase()`, with the override map for exceptions).
- Winner: `HOME_TEAM`→home id, `AWAY_TEAM`→away id, `DRAW`→`null`. Knockout
  penalties: feed gives 90'/ET score + advancing team in `winner`; we store that
  score and set `winnerTeamId` to the advancer — our existing model.
- Output: `{ match, homeScore, awayScore, winnerTeamId }[]` + `unmatched`.

**3. Ingest + route — `src/app/api/sync-results/route.ts`** (server-only)
- Auth gate: reject unless `Authorization: Bearer <CRON_SECRET>`.
- Uses a **service-role Supabase client** (new `createSupabaseServiceClient()` in
  `src/lib/supabase-server.ts`, reads `SUPABASE_SERVICE_ROLE_KEY`) — there is no
  admin session and RLS would block the writes.
- **Ownership rule (reversibility):** auto writes/overwrites only records whose
  source is `null` or `'auto'`. A record with source `'admin'` is **never touched
  by auto**. Admin edits stamp `'admin'`, so any manual fix is permanent. While a
  result is still auto-owned, the feed remains the source of truth — so a bad
  early result self-heals when the feed corrects it on a later run.
- **Standings ingest:** for each group not owned by admin, write
  `first..fourth_team_id`, `result_source='auto'`, and `result_finalized_at`
  (set only when the group is `complete`). Provisional groups keep updating each
  run; once complete, auto finalizes them.
- **Match ingest:** for each matched fixture not owned by admin, write scores,
  `winner_team_id`, `status='finalized'`, `finalized_at`, `finalized_source='auto'`.
  Idempotent: re-running with identical feed data is a no-op write.
- Recalculate points for changed groups / matches via the existing functions.
- Return JSON summary: `{ groups: {provisional, finalized}, matches: {finalized,
  skipped}, unmatched: [...] }`.

**4. Scheduler — `.github/workflows/sync-results.yml`**
- `schedule: cron('*/30 * * * *')` + `workflow_dispatch` for manual runs.
- One `curl` to the production route with the `CRON_SECRET` repo secret. Free,
  version-controlled, runs even when the app is idle. Vercel Cron is the paid
  alternative (Hobby caps cron at once/day).

### Schema changes

One migration, `docs/supabase-migration-result-source.sql`, mirroring the same
"who set this" marker on both tables:

```sql
alter table public.matches
  add column if not exists finalized_source text
  check (finalized_source in ('admin', 'auto'));

alter table public.groups
  add column if not exists result_source text
  check (result_source in ('admin', 'auto'));
```

- `null` = legacy / not finalized. `'admin'` = set via the admin actions.
  `'auto'` = set by the sync route.
- `finalizeMatchAction` and `saveGroupStandingsAction` are updated to stamp
  `'admin'`, so any admin override clears the auto marker.
- Types: `Match` gains `finalizedSource`; `Group` gains `resultSource`; the
  `mapMatch` / `mapGroup` mappers map them.

### Admin UI marker

- In `src/screens/admin.tsx`, groups/matches whose source is `'auto'` show an
  "Auto" badge (from `src/components/badges.tsx`, `app-*` tokens per the design
  system) next to the result.
- The admin edits/finalizes exactly as today; doing so flips the badge to manual.
  This is the reversible safety net — auto results are visually distinct and one
  action from correction.

## Data flow (happy path)

1. GitHub Action fires every 30 min, curls `/api/sync-results` with the secret.
2. Route validates the secret, fetches standings + finished matches.
3. Standings matcher → per-group positions + complete flag.
   Match matcher → finished knockout fixtures by day + team pair.
4. Ingest writes provisional/finalized group positions and finalizes knockout
   scores, stamping `source='auto'`, skipping anything already finalized.
5. Points recalculated for changed groups and matches.
6. Route returns a summary; the Action logs it.

## Error handling

- **Bad/missing token or feed 4xx/5xx:** abort, return 502 with the reason, change
  nothing. Next run retries.
- **Unmatched TLA / no fixture found:** skip it, include it in the `unmatched`
  summary so it surfaces in Action logs. Never guess.
- **Admin-owned group/match** (`source='admin'`): skip — a manual fix is never
  overwritten by auto.
- **Partial DB failure:** each write is independent; a failure is reported but
  does not roll back the rest. Re-running reconciles.
- **Auth failure on the route:** 401, no work done.

## Security

- Route inaccessible without `CRON_SECRET` (random; Vercel env + GH secret).
- Service-role key lives only server-side in the route; never shipped to client.
- Only external data is the feed; bad data fails closed (unmatched → skipped).

## Testing

- **Standings matcher (unit, pure):** group-label mapping, position→teamId,
  completeness (`playedGames === 3` ⇒ finalize), unmatched TLA. Highest value.
- **Match matcher (unit, pure):** day+TLA join, unordered pairing, winner mapping,
  penalty/knockout case, override case, unmatched case.
- **Adapter (unit):** parse captured football-data standings + matches samples
  into the normalized shapes. No network in tests.
- **Ingest (unit):** with a fake supabase client, assert it writes provisional vs
  finalized correctly, only stamps `source='auto'`, self-heals an auto-owned
  record when the feed changes, and never overwrites an admin-owned group/match.
- Follows the existing `*.test.ts` + vitest conventions in `src/lib`.

## Environment / config summary

| Name | Where | Purpose |
|---|---|---|
| `FOOTBALL_DATA_TOKEN` | Vercel env | feed auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel env | system writes (bypass RLS) |
| `CRON_SECRET` | Vercel env + GH secret | protect the route |

## Rollout

1. Migration adds `finalized_source` / `result_source`.
2. Ship route + adapter + both matchers behind the secret; trigger manually
   (`workflow_dispatch`) and inspect the summary.
3. **Group-phase backfill/first light:** a manual run writes provisional
   standings for all live groups and finalizes any already-complete group.
   Verify against the live group tables before enabling the schedule.
4. Enable the 30-min schedule. The match path then handles knockouts as the
   bracket fills, with no further work.

## Novedades modal

Per project convention, ask whether to add a Novedades entry. This is admin-facing
automation, so it may not warrant a user-facing changelog note.

## Open decisions (defaults chosen, easy to change)

- Sync cadence: **30 min** (well within rate limits).
- Provisional standings: **written continuously + auto-finalized** at group
  completion (per the group-phase decision).
- TLA overrides: start empty; add only if a real mismatch appears in the
  `unmatched` log.
