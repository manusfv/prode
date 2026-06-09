-- Group stage refactor: standings predictions + per-group auto-close.
--
-- The group stage stops being per-match. Instead each user predicts the final
-- order (1st-4th) of every group, scored against an admin-entered final table.
-- Individual group-stage match rows are removed; a per-group `locks_at`
-- (seeded from the earliest group-match kickoff) becomes the close time.
--
-- Run once, after the base schema + auto-close migration are live.

-- 1. groups: per-group config + admin-entered final result
create table if not exists public.groups (
  group_label text primary key,
  locks_at timestamptz,
  first_team_id text references public.teams(id),
  second_team_id text references public.teams(id),
  third_team_id text references public.teams(id),
  fourth_team_id text references public.teams(id),
  result_finalized_at timestamptz,
  result_finalized_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. group_predictions: one ordered prediction per (user, group)
create table if not exists public.group_predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  group_label text not null references public.groups(group_label) on delete cascade,
  -- Nullable so partial predictions can be saved slot by slot.
  first_team_id text references public.teams(id),
  second_team_id text references public.teams(id),
  third_team_id text references public.teams(id),
  fourth_team_id text references public.teams(id),
  points integer,
  exact_positions integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, group_label),
  constraint group_predictions_distinct check (
    first_team_id <> second_team_id and first_team_id <> third_team_id
    and first_team_id <> fourth_team_id and second_team_id <> third_team_id
    and second_team_id <> fourth_team_id and third_team_id <> fourth_team_id
  )
);

alter table public.groups enable row level security;
alter table public.group_predictions enable row level security;

create trigger groups_touch_updated_at
before update on public.groups
for each row execute function public.touch_updated_at();

create trigger group_predictions_touch_updated_at
before update on public.group_predictions
for each row execute function public.touch_updated_at();

-- 3. Seed group rows + lock times from the existing group matches BEFORE deleting them.
insert into public.groups (group_label, locks_at)
select m.group_label, min(m.kickoff_utc)
from public.matches m
where m.stage = 'groups' and m.group_label is not null
group by m.group_label
on conflict (group_label) do update set locks_at = excluded.locks_at;

-- 4. Drop group-stage match rows. Their predictions cascade via predictions.match_id.
delete from public.matches where stage = 'groups';

create index if not exists group_predictions_user_idx on public.group_predictions (user_id);
create index if not exists group_predictions_group_idx on public.group_predictions (group_label);

-- 5. RLS policies (modeled on the per-match predictions policies, gated on locks_at).
create policy "groups_select_approved"
on public.groups
for select
to authenticated
using (public.is_approved());

create policy "groups_admin_all"
on public.groups
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Own prediction always visible; others only once the group has locked.
create policy "group_predictions_select_visible"
on public.group_predictions
for select
to authenticated
using (
  public.is_approved()
  and (
    user_id = auth.uid()
    or exists (
      select 1
      from public.groups g
      where g.group_label = group_predictions.group_label
        and g.locks_at is not null
        and g.locks_at <= now()
    )
  )
);

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
      and s.open = true
      and (g.locks_at is null or g.locks_at > now())
  )
);

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
      and s.open = true
      and (g.locks_at is null or g.locks_at > now())
  )
);

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
      and s.open = true
      and (g.locks_at is null or g.locks_at > now())
  )
);

-- Admin scoring, result entry, lock-time edits, and corrections.
create policy "group_predictions_admin_all"
on public.group_predictions
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
