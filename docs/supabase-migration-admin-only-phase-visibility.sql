-- Admin-only phase visibility: convert stage flags from boolean to tri-state text.
-- States: 'closed' (nobody), 'admin' (admins preview), 'open' (everyone).
-- Re-runnable / guarded.

do $$
declare
  col text;
begin
  foreach col in array array['predictions_open', 'results_open', 'standings_open']
  loop
    -- Only convert if the column is still boolean.
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'stages'
        and column_name = col and data_type = 'boolean'
    ) then
      execute format('alter table public.stages alter column %I drop default', col);
      execute format(
        'alter table public.stages alter column %I type text using (case when %I then ''open'' else ''closed'' end)',
        col, col
      );
      execute format('alter table public.stages alter column %I set default ''closed''', col);
      execute format('alter table public.stages alter column %I set not null', col);
      execute format(
        'alter table public.stages add constraint %I check (%I in (''closed'', ''admin'', ''open''))',
        col || '_check', col
      );
    end if;
  end loop;
end $$;

-- RLS: saving predictions requires the phase to be fully open (admin-only does not permit writes).
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
      and s.predictions_open = 'open'
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
      and s.predictions_open = 'open'
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
      and s.predictions_open = 'open'
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
      and s.predictions_open = 'open'
      and (g.locks_at is null or g.locks_at > now())
  )
);
