-- Adds a "who set this result" marker so the auto-sync job and the admin can
-- coexist: 'auto' = set by the sync route, 'admin' = set/overridden by a human.
-- null = legacy / not finalized. Auto-sync never overwrites an 'admin' row.

alter table public.matches
  add column if not exists finalized_source text
  check (finalized_source in ('admin', 'auto'));

alter table public.groups
  add column if not exists result_source text
  check (result_source in ('admin', 'auto'));
