-- Fix knockout predictions being rejected by RLS (error 42501,
-- "new row violates row-level security policy for table predictions").
--
-- Root cause: the advancer-validation clause in the predictions insert/update
-- policies was written with unqualified column names (home_score, away_score,
-- winner_team_id). Those columns exist on BOTH `predictions` and `matches`, and
-- inside the EXISTS subquery they bind to `matches m` (the inner scope), not to
-- the prediction row being checked. So the clause actually inspects the MATCH's
-- result columns. For an unplayed knockout match those are NULL, making the
-- whole clause NULL/false and rejecting every knockout prediction. Group
-- predictions slipped through only via the `m.stage = 'groups'` branch.
--
-- Fix: qualify the predicted-score columns with `predictions.` so the clause
-- validates the prediction's own values: a knockout tie must name a winner among
-- the two teams (mirrors tournament.ts `needsAdvancer`).
--
-- NOTE: when the tie-winner requirement is later removed from the product, drop
-- this advancer clause from both policies entirely.

drop policy if exists "predictions_insert_own_open" on public.predictions;
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
      and (
        predictions.home_score <> predictions.away_score
        or predictions.winner_team_id in (m.home_team_id, m.away_team_id)
      )
  )
);

drop policy if exists "predictions_update_own_open" on public.predictions;
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
      and (
        predictions.home_score <> predictions.away_score
        or predictions.winner_team_id in (m.home_team_id, m.away_team_id)
      )
  )
);
