create type public.app_role as enum ('user', 'admin');
create type public.stage_key as enum ('groups', 'round32', 'round16', 'quarter', 'semi', 'third', 'final');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  approved boolean not null default false,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.teams (
  id text primary key,
  name text not null,
  short_name text not null,
  flag text,
  group_label text
);

create table public.stages (
  stage public.stage_key primary key,
  label text not null,
  predictions_open text not null default 'closed' check (predictions_open in ('closed', 'admin', 'open')),
  results_open text not null default 'closed' check (results_open in ('closed', 'admin', 'open')),
  standings_open text not null default 'closed' check (standings_open in ('closed', 'admin', 'open')),
  opened_at timestamptz,
  opened_by uuid references public.profiles(id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  match_no integer not null unique,
  stage public.stage_key not null references public.stages(stage),
  group_label text,
  home_team_id text references public.teams(id),
  away_team_id text references public.teams(id),
  home_seed text,
  away_seed text,
  kickoff_utc timestamptz not null,
  venue text,
  city text,
  status text not null default 'open' check (status in ('open', 'live', 'finalized')),
  home_score integer,
  away_score integer,
  winner_team_id text references public.teams(id),
  finalized_at timestamptz,
  finalized_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  constraint scores_non_negative check (
    (home_score is null or home_score >= 0) and
    (away_score is null or away_score >= 0)
  )
);

create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  home_score integer not null check (home_score >= 0),
  away_score integer not null check (away_score >= 0),
  points integer,
  exact_hit boolean not null default false,
  outcome_hit boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, match_id)
);

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.stages enable row level security;
alter table public.matches enable row level security;
alter table public.predictions enable row level security;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create trigger predictions_touch_updated_at
before update on public.predictions
for each row execute function public.touch_updated_at();

create or replace function public.is_approved(user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = user_id and approved = true
  );
$$;

create or replace function public.is_admin(user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = user_id and approved = true and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1), 'Nuevo usuario')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create policy "profiles_select_visible"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_admin()
  or (approved = true and public.is_approved())
);

create policy "profiles_admin_update"
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "teams_select_approved"
on public.teams
for select
to authenticated
using (public.is_approved());

create policy "teams_admin_all"
on public.teams
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "stages_select_approved"
on public.stages
for select
to authenticated
using (public.is_approved());

create policy "stages_admin_all"
on public.stages
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "matches_select_approved"
on public.matches
for select
to authenticated
using (public.is_approved());

create policy "matches_admin_all"
on public.matches
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

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

create policy "predictions_admin_score_update"
on public.predictions
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create index predictions_user_match_idx on public.predictions (user_id, match_id);
create index predictions_match_idx on public.predictions (match_id);
create index matches_stage_kickoff_idx on public.matches (stage, kickoff_utc);

-- Group stage: standings predictions instead of per-match scores.
create table public.groups (
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

create table public.group_predictions (
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
      and s.predictions_open = 'open'
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
      and s.predictions_open = 'open'
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
      and s.predictions_open = 'open'
      and (g.locks_at is null or g.locks_at > now())
  )
);

create policy "group_predictions_admin_all"
on public.group_predictions
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create index group_predictions_user_idx on public.group_predictions (user_id);
create index group_predictions_group_idx on public.group_predictions (group_label);

-- After applying this schema, promote the first admin manually:
-- update public.profiles set approved = true, role = 'admin' where email = 'tu-email@example.com';
