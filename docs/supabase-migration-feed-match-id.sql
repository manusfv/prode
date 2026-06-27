-- Anchors each knockout fixture to its football-data.org match id so the
-- results-sync can match upcoming matches (teams still TBD) by a stable key.
alter table public.matches
  add column if not exists feed_match_id text;
