alter table public.matches
add column if not exists status text not null default 'open'
check (status in ('open', 'live', 'finalized'));

update public.matches
set status = case
  when finalized_at is not null then 'finalized'
  when kickoff_utc <= now() then 'live'
  else 'open'
end
where status is null or status = 'open';

drop policy if exists "predictions_insert_own_open" on public.predictions;
drop policy if exists "predictions_update_own_open" on public.predictions;
drop policy if exists "predictions_select_visible" on public.predictions;

create policy "predictions_select_visible"
on public.predictions
for select
to authenticated
using (
  public.is_approved()
  and (
    user_id = auth.uid()
    or exists (
      select 1
      from public.matches m
      where m.id = match_id
        and (
          m.status <> 'open'
          or (
            m.kickoff_utc <= now()
            and not (
              m.status = 'open'
              and m.updated_by is not null
              and m.updated_at > m.kickoff_utc
            )
          )
        )
    )
  )
);

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
      and s.open = true
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
      and (
        home_score <> away_score
        or m.stage = 'groups'
        or winner_team_id in (m.home_team_id, m.away_team_id)
      )
  )
);

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
      and s.open = true
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
      and (
        home_score <> away_score
        or m.stage = 'groups'
        or winner_team_id in (m.home_team_id, m.away_team_id)
      )
  )
);
