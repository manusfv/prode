# Prode Mundial 2026 Product Spec

## V1 Scope

- Spanish-only family prediction pool.
- Single private pool with lightweight Supabase email/password auth.
- Admin approval required before users can participate.
- Admin can participate under the same prediction lock rules.
- Per-match predictions, not stage submissions.
- Group-stage predictions can be filled upfront or match by match.
- Knockout stages, including 16avos, open only after actual contenders are known.
- Admin can enable or disable prediction tabs per stage.
- Predictions lock at each match kickoff.
- Locked/finalized matches reveal predictions through a drawer or bottom sheet, not inline by default.
- Revealed prediction detail lists all approved users and marks missing users as `Sin pronóstico`.
- Admin manages teams, fixture slots, stages, CSV import/export affordances, results, finalization, and score recalculation.

## Scoring

- `3 puntos`: exact score.
- `1 punto`: correct outcome in group stage, or correct advancing team in knockout.
- `0 puntos`: otherwise.
- Knockout tied-score predictions require a `Clasifica` choice between the two teams.
- If a knockout prediction score is not tied, the advancing team is inferred from the score.

## Backlog

- Extra prediction markets such as champion, top scorer, and group winners.
- Automated notifications/reminders.
- Dark mode.
- External fixture/result API sync.
- Dedicated match detail page with richer history or comments.

## Supabase Setup

1. Create a Supabase project.
2. Run `docs/supabase-schema.sql` in the SQL editor.
3. Run `docs/supabase-seed.sql` for the initial fixture rows.
4. Copy `.env.example` to `.env.local` and fill `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. In Supabase Auth settings, use email/password auth. Disable email confirmation if you do not want account confirmation emails.
6. Create the future admin account in the app.
7. Promote that profile manually:

```sql
update public.profiles
set approved = true, role = 'admin'
where email = 'tu-email@example.com';
```

The app shows a login screen when logged out. Users create an account once, then log in with email and password.

## Visual Direction

- Tournament command center, not a marketing landing page.
- Mobile-first prediction cards with simple score steppers.
- Desktop enhancement with denser fixture rows, leaderboard preview, and admin tables.
- Tournament-inspired visual identity without FIFA branding.
- Use pitch-line geometry, flag chips, status colors, and broadcast-score rhythm.
