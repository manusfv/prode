-- Group predictions: allow partial orders + let users clear their own pick.
--
-- Run once, only if you already applied supabase-migration-group-standings.sql
-- with the original NOT NULL columns. Fresh installs (schema.sql) and the
-- updated standings migration already include these changes.

-- 1. Make the position columns nullable so predictions can be saved slot by slot.
alter table public.group_predictions
  alter column first_team_id drop not null,
  alter column second_team_id drop not null,
  alter column third_team_id drop not null,
  alter column fourth_team_id drop not null;

-- 2. Allow a user to delete their own prediction while the group is still open
--    (used when the last remaining pick is cleared).
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
      and s.open = true
      and (g.locks_at is null or g.locks_at > now())
  )
);
