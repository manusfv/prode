-- Allows a logged-in user to update only their own display_name.
-- RLS on public.profiles only permits admin updates, so a security-definer
-- function is used to scope the write to display_name for auth.uid().

create or replace function public.update_my_display_name(new_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  trimmed text := btrim(new_name);
begin
  if trimmed = '' then
    raise exception 'El nombre no puede estar vacío.';
  end if;

  update public.profiles
  set display_name = trimmed,
      updated_at = now()
  where id = auth.uid();
end;
$$;

grant execute on function public.update_my_display_name(text) to authenticated;
