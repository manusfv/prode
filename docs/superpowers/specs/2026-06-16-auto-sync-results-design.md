# Auto-sync match results from football-data.org — design

**Date:** 2026-06-16
**Status:** Approved for planning

## Goal

Eliminate the daily manual chore of entering World Cup match results. A scheduled
job pulls finished matches from a free football data feed, matches them to our
fixtures, finalizes the scores automatically, and recalculates points — with a
visible "set by the bot" marker so the admin can spot-check and override.

## Non-goals

- No live ticker / minute-by-minute scores. We sync periodically, not in real time.
- No lineups, cards, xG, or any data beyond final score + winner.
- No changes to how predictions are scored. We reuse the existing recalculation.
- No automation of group-standings results (`groups` table). Match fixtures only.
  (Group final standings stay manual for now; revisit later if desired.)

## Data source (locked)

**football-data.org v4**, free tier.

- Endpoint: `GET https://api.football-data.org/v4/competitions/WC/matches?status=FINISHED`
- Auth: `X-Auth-Token: <FOOTBALL_DATA_TOKEN>` (free token, one env var).
- Limits: 10 req/min, no daily cap. We make ~1 call per sync — far under budget.
- WC is explicitly in the free competition set; scores are slightly delayed on
  free, which is fine for periodic auto-sync.

### Live validation (2026-06-16)

Verified against a real call with a valid token (tournament is live; 16 of 104
matches already played):

- Token authenticates; `x-api-version: v4`; WC readable on the free tier.
- Every consumed field is present and exactly named: `utcDate`, `status`
  (`FINISHED`), `homeTeam.tla` / `awayTeam.tla`, `score.winner`,
  `score.fullTime.home/away`, `score.duration`.
- **All 32 TLAs from played matches map to our team ids by `tla.toLowerCase()`
  with zero mismatches** — the join is effectively identity and the TLA-override
  map starts empty.

Response fields we consume per match:

```json
{
  "utcDate": "2026-06-11T20:00:00Z",
  "status": "FINISHED",
  "homeTeam": { "tla": "ARG" },
  "awayTeam": { "tla": "MEX" },
  "score": { "winner": "HOME_TEAM", "fullTime": { "home": 2, "away": 0 } }
}
```

## Architecture

A protected Next.js route handler does all the work; an external scheduler
triggers it. Nothing else runs as separate infrastructure.

```
GitHub Action (*/30 cron)
        │  curl, Authorization: Bearer <CRON_SECRET>
        ▼
/api/sync-results  (Next.js route handler, server-only)
        │
        ├─ feed adapter  ──►  football-data.org  (fetch FINISHED matches)
        ├─ matcher       ──►  map feed match → our matchNo (date + TLA)
        ├─ ingest        ──►  finalize unfinalized matches, stamp source='auto'
        └─ recalc        ──►  reuse recalculatePredictionsForMatches
        ▼
Supabase (service-role client, bypasses RLS for system writes)
```

### Components

Each is a small, independently testable unit.

**1. Feed adapter — `src/lib/results-feed/football-data.ts`**
- One function: `fetchFinishedMatches(token): Promise<FeedMatch[]>`.
- `FeedMatch` is our own normalized shape `{ utcDate, homeTla, awayTla, homeScore,
  awayScore, winner }` — the provider's JSON never leaks past this file.
- This is the swap point: a future API-Football adapter implements the same
  signature and nothing else changes.

**2. Matcher — `src/lib/results-feed/match-fixtures.ts`** (pure, no I/O)
- Input: `FeedMatch[]` + our `Match[]` + a `tlaToTeamId` resolver.
- Join key: same calendar day (`utcDate` vs `kickoffUtc`) **and** the unordered
  pair of team ids. Team id is `tla.toLowerCase()` (our ids already are FIFA
  TLAs: `mex`, `arg`, …), with a small explicit override map for the rare cases
  where football-data's TLA differs from our id.
- Output: `{ match, homeScore, awayScore, winnerTeamId }[]` for matches that have
  a confident match, plus an `unmatched: FeedMatch[]` list for logging.
- Winner mapping: `HOME_TEAM`→home id, `AWAY_TEAM`→away id, `DRAW`→`null`.
- Knockout penalties: feed gives the 90'/ET score + the advancing team in
  `winner`; we store that score and set `winnerTeamId` to the advancer — exactly
  our existing draw-score-plus-winner model.

**3. Ingest + route — `src/app/api/sync-results/route.ts`** (server-only)
- Auth gate: reject unless `Authorization: Bearer <CRON_SECRET>` matches env.
- Uses a **service-role Supabase client** (new `createSupabaseServiceClient()` in
  `src/lib/supabase-server.ts`, reads `SUPABASE_SERVICE_ROLE_KEY`) because there
  is no admin session; RLS would otherwise block the writes.
- For each matched fixture **that is not already finalized**, update
  `home_score`, `away_score`, `winner_team_id`, `status='finalized'`,
  `finalized_at`, `finalized_source='auto'`. Never touch already-finalized
  matches (idempotent; protects manual/admin results).
- Recalculate points for the changed matches via the existing
  `recalculatePredictionsForMatches`.
- Return JSON summary: `{ finalized: n, skipped: n, unmatched: [...] }`.

**4. Scheduler — `.github/workflows/sync-results.yml`**
- `schedule: cron('*/30 * * * *')` + `workflow_dispatch` for manual runs.
- A single `curl` to the production route with the `CRON_SECRET` from repo
  secrets. Free, version-controlled, runs even when the app is idle.
- Vercel Cron noted as a one-line paid alternative (Hobby caps cron at once/day).

### Schema change

One migration, `docs/supabase-migration-finalized-source.sql`:

```sql
alter table public.matches
  add column if not exists finalized_source text
  check (finalized_source in ('admin', 'auto'));
```

- `null` = legacy / not finalized. `'admin'` set by `finalizeMatchAction`.
  `'auto'` set by the sync route.
- `finalizeMatchAction` is updated to stamp `finalized_source='admin'` so an
  admin override clears the auto marker.
- `Match` type gains `finalizedSource: 'admin' | 'auto' | null`; `mapMatch` maps it.

### Admin UI marker

- In `src/screens/admin.tsx`, matches finalized with `finalizedSource==='auto'`
  show an "Auto" badge (from `src/components/badges.tsx`, using `app-*` tokens per
  the design system) next to the result.
- The admin can still edit/finalize as today; doing so flips the badge to manual.
- This is the "reversible" safety net: auto-applied results are visually
  distinct and one click from being corrected.

## Data flow (happy path)

1. GitHub Action fires every 30 min, curls `/api/sync-results` with the secret.
2. Route validates the secret, fetches FINISHED matches from football-data.org.
3. Matcher pairs each feed match to a fixture by day + team pair.
4. Ingest finalizes only the not-yet-finalized ones, stamping `source='auto'`.
5. Points recalculated for those matches.
6. Route returns a summary; the Action logs it.

## Error handling

- **Bad/missing token or feed 4xx/5xx:** abort the run, return 502 with the
  reason, change nothing. Next run retries.
- **Unmatched feed match** (no fixture found, e.g. team-id mismatch): skip it,
  include it in the `unmatched` summary so it surfaces in Action logs. Never
  guess.
- **Already finalized:** skip silently (counts toward `skipped`). Idempotent.
- **Partial DB failure:** each match update is independent; a failure on one is
  reported but does not roll back the others. Re-running reconciles.
- **Auth failure on the route:** 401, no work done.

## Security

- Route is inaccessible without `CRON_SECRET` (random, in Vercel env + GH secret).
- Service-role key lives only server-side in the route; never shipped to client.
- No user input is trusted; the only external data is the feed, and bad data
  fails closed (unmatched → skipped).

## Testing

- **Matcher (unit, pure):** day+TLA join, unordered pairing, winner mapping,
  penalty/knockout case, TLA-override case, unmatched case. Fixtures of feed JSON
  + sample `Match[]`. This is the highest-value test surface.
- **Adapter (unit):** parse a captured football-data sample into `FeedMatch[]`;
  assert provider JSON shape is handled. No network in tests.
- **Ingest (unit):** given matched results + a fake supabase client, assert it
  only updates unfinalized matches and stamps `source='auto'`.
- Follows existing `*.test.ts` + vitest conventions already in `src/lib`.

## Environment / config summary

| Name | Where | Purpose |
|---|---|---|
| `FOOTBALL_DATA_TOKEN` | Vercel env | feed auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel env | system writes (bypass RLS) |
| `CRON_SECRET` | Vercel env + GH secret | protect the route |

## Rollout

1. Migration adds `finalized_source`.
2. Ship route + adapter + matcher behind the secret; trigger manually
   (`workflow_dispatch`) and inspect the summary before enabling the schedule.
3. Backfill: a manual run finalizes any already-finished matches not yet entered.
4. Enable the 30-min schedule.

## Novedades modal

Per project convention, ask whether to add a Novedades entry — though this is an
admin-facing automation, so it may not warrant a user-facing changelog note.

## Open decisions (defaults chosen, easy to change)

- Sync cadence: **30 min** (cheap, well within rate limits).
- TLA overrides: start empty; add entries only if a real mismatch shows up in the
  `unmatched` log during the backfill run.
