insert into public.stages (stage, label, open)
values
  ('round32', '16avos', false)
on conflict (stage) do update set
  label = excluded.label;

update public.stages
set open = false
where stage in ('round32', 'round16', 'quarter', 'semi', 'third', 'final');
