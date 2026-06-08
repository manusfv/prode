insert into public.teams (id, name, short_name, flag, group_label) values
  ('arg', 'Argentina', 'ARG', '🇦🇷', 'A'),
  ('mex', 'México', 'MEX', '🇲🇽', 'A'),
  ('usa', 'Estados Unidos', 'USA', '🇺🇸', 'B'),
  ('can', 'Canadá', 'CAN', '🇨🇦', 'B'),
  ('bra', 'Brasil', 'BRA', '🇧🇷', 'C'),
  ('esp', 'España', 'ESP', '🇪🇸', 'C'),
  ('fra', 'Francia', 'FRA', '🇫🇷', 'D'),
  ('uru', 'Uruguay', 'URU', '🇺🇾', 'D')
on conflict (id) do update set
  name = excluded.name,
  short_name = excluded.short_name,
  flag = excluded.flag,
  group_label = excluded.group_label;

insert into public.stages (stage, label, open) values
  ('groups', 'Grupos', true),
  ('round32', '16avos', false),
  ('round16', 'Octavos', false),
  ('quarter', 'Cuartos', false),
  ('semi', 'Semis', false),
  ('third', '3er puesto', false),
  ('final', 'Final', false)
on conflict (stage) do update set
  label = excluded.label,
  open = excluded.open;

insert into public.matches (
  id,
  match_no,
  stage,
  group_label,
  home_team_id,
  away_team_id,
  home_seed,
  away_seed,
  kickoff_utc,
  venue,
  city,
  status
) values
  ('00000000-0000-0000-0000-000000000001', 1, 'groups', 'A', 'arg', 'mex', null, null, '2026-06-11T22:00:00.000Z', 'Estadio Azteca', 'Ciudad de México', 'open'),
  ('00000000-0000-0000-0000-000000000002', 2, 'groups', 'B', 'usa', 'can', null, null, '2026-06-12T02:00:00.000Z', 'Lumen Field', 'Seattle', 'open'),
  ('00000000-0000-0000-0000-000000000003', 3, 'groups', 'C', 'bra', 'esp', null, null, '2026-06-13T22:00:00.000Z', 'Hard Rock Stadium', 'Miami', 'open'),
  ('00000000-0000-0000-0000-000000000049', 49, 'round16', null, 'arg', 'fra', '1A', '2B', '2026-07-04T01:00:00.000Z', 'MetLife Stadium', 'New York/New Jersey', 'open'),
  ('00000000-0000-0000-0000-000000000057', 57, 'quarter', null, null, null, 'Ganador Octavos 1', 'Ganador Octavos 2', '2026-07-10T01:00:00.000Z', 'AT&T Stadium', 'Dallas', 'open')
on conflict (id) do update set
  match_no = excluded.match_no,
  stage = excluded.stage,
  group_label = excluded.group_label,
  home_team_id = excluded.home_team_id,
  away_team_id = excluded.away_team_id,
  home_seed = excluded.home_seed,
  away_seed = excluded.away_seed,
  kickoff_utc = excluded.kickoff_utc,
  venue = excluded.venue,
  city = excluded.city,
  status = excluded.status;
