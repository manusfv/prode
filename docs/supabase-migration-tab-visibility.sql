-- Tab visibility toggles: admins can hide the Tabla (standings) and Resultados tabs.
create table if not exists public.app_settings (
  key text primary key,
  enabled boolean not null default true,
  updated_at timestamptz,
  updated_by uuid references public.profiles(id)
);

alter table public.app_settings enable row level security;

drop policy if exists "app_settings_select_approved" on public.app_settings;
create policy "app_settings_select_approved"
on public.app_settings
for select
to authenticated
using (public.is_approved());

drop policy if exists "app_settings_admin_all" on public.app_settings;
create policy "app_settings_admin_all"
on public.app_settings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into public.app_settings (key, enabled) values
  ('standings', true),
  ('results', true)
on conflict (key) do nothing;
