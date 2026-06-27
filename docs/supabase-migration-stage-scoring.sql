-- Stage-based knockout scoring + drop the tie-advancer.
--
-- Points are computed in the app (src/lib/scoring.ts) and stored on rows, so
-- this migration carries no scoring logic. It only removes the now-defunct
-- prediction-side advancer:
--   1. drop the advancer clause from the predictions insert/update policies
--      (the cleanup anticipated by supabase-migration-knockout-prediction-rls-fix.sql)
--   2. drop predictions.winner_team_id
--
-- matches.winner_team_id (bracket advancement) is intentionally untouched.

drop policy if exists "predictions_insert_own_open" on public.predictions;
create policy "predictions_insert_own_open"
on public.predictions
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_approved()
  and exists (
    select 1
    from public.matches m
    join public.stages s on s.stage = m.stage
    where m.id = match_id
      and s.predictions_open = 'open'
      and m.status = 'open'
      and m.finalized_at is null
      and (
        m.kickoff_utc > now()
        or (
          m.updated_by is not null
          and m.updated_at > m.kickoff_utc
        )
      )
      and m.home_team_id is not null
      and m.away_team_id is not null
  )
);

drop policy if exists "predictions_update_own_open" on public.predictions;
create policy "predictions_update_own_open"
on public.predictions
for update
to authenticated
using (user_id = auth.uid() and public.is_approved())
with check (
  user_id = auth.uid()
  and public.is_approved()
  and exists (
    select 1
    from public.matches m
    join public.stages s on s.stage = m.stage
    where m.id = match_id
      and s.predictions_open = 'open'
      and m.status = 'open'
      and m.finalized_at is null
      and (
        m.kickoff_utc > now()
        or (
          m.updated_by is not null
          and m.updated_at > m.kickoff_utc
        )
      )
      and m.home_team_id is not null
      and m.away_team_id is not null
  )
);

alter table public.predictions drop column if exists winner_team_id;
