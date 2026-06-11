-- Stage-based tab gating: per-stage results/standings flags; drop app_settings.

-- Rename predictions flag (guarded so the migration is re-runnable).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'stages' and column_name = 'open'
  ) then
    alter table public.stages rename column open to predictions_open;
  end if;
end $$;

alter table public.stages add column if not exists results_open boolean not null default false;
alter table public.stages add column if not exists standings_open boolean not null default false;

-- Recreate the policies that referenced the old column name.
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
      and s.predictions_open = true
      and m.status = 'open'
      and m.finalized_at is null
      and (
        m.kickoff_utc > now()
        or (m.updated_by is not null and m.updated_at > m.kickoff_utc)
      )
      and m.home_team_id is not null
      and m.away_team_id is not null
      and (
        home_score <> away_score
        or m.stage = 'groups'
        or winner_team_id in (m.home_team_id, m.away_team_id)
      )
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
      and s.predictions_open = true
      and m.status = 'open'
      and m.finalized_at is null
      and (
        m.kickoff_utc > now()
        or (m.updated_by is not null and m.updated_at > m.kickoff_utc)
      )
      and m.home_team_id is not null
      and m.away_team_id is not null
      and (
        home_score <> away_score
        or m.stage = 'groups'
        or winner_team_id in (m.home_team_id, m.away_team_id)
      )
  )
);

drop policy if exists "group_predictions_insert_own_open" on public.group_predictions;
create policy "group_predictions_insert_own_open"
on public.group_predictions
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_approved()
  and exists (
    select 1
    from public.groups g
    join public.stages s on s.stage = 'groups'
    where g.group_label = group_predictions.group_label
      and s.predictions_open = true
      and (g.locks_at is null or g.locks_at > now())
  )
);

drop policy if exists "group_predictions_update_own_open" on public.group_predictions;
create policy "group_predictions_update_own_open"
on public.group_predictions
for update
to authenticated
using (user_id = auth.uid() and public.is_approved())
with check (
  user_id = auth.uid()
  and public.is_approved()
  and exists (
    select 1
    from public.groups g
    join public.stages s on s.stage = 'groups'
    where g.group_label = group_predictions.group_label
      and s.predictions_open = true
      and (g.locks_at is null or g.locks_at > now())
  )
);

drop policy if exists "group_predictions_delete_own_open" on public.group_predictions;
create policy "group_predictions_delete_own_open"
on public.group_predictions
for delete
to authenticated
using (
  user_id = auth.uid()
  and public.is_approved()
  and exists (
    select 1
    from public.groups g
    join public.stages s on s.stage = 'groups'
    where g.group_label = group_predictions.group_label
      and s.predictions_open = true
      and (g.locks_at is null or g.locks_at > now())
  )
);

-- Drop the superseded global settings table (cascades its policies).
drop table if exists public.app_settings cascade;
