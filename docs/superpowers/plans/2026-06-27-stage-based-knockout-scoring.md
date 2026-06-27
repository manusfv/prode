# Stage-based knockout scoring + drop the tie-advancer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make knockout match predictions score per-stage (rising points by round) and remove the "pick who advances on a tie" requirement entirely.

**Architecture:** All scoring is computed in TypeScript (`src/lib/scoring.ts`) and stored on rows; there is no DB-side scoring. We (1) replace the flat 3/1 knockout points with a per-stage table, (2) simplify outcome comparison to score-only home/away/draw, and (3) drop the prediction-side `winner_team_id` from the type system, UI, server actions, mappers, RLS policies, and the column itself. `matches.winner_team_id` (bracket advancement) is untouched throughout.

**Tech Stack:** Next.js (App Router) + React + TypeScript, Supabase (Postgres + RLS), Vitest, Tailwind.

## Global Constraints

- Per-stage knockout points (outcome / exact), copied verbatim from the spec:
  - `round32` = 10 / 25
  - `round16` = 30 / 50
  - `quarter` = 60 / 80
  - `semi` = 90 / 110
  - `third` = 120 / 150 (mirrors `final` for now)
  - `final` = 120 / 150
- Group ordering scoring is **unchanged** (10/8/6/4, max 28 per group).
- `matches.winner_team_id` and bracket advancement are **out of scope** — never remove or alter them. Only the **prediction-side** advancer (`predictions.winner_team_id`, `Prediction.winnerTeamId`, `PredictionDraft.winnerTeamId`) is removed.
- UI copy is Spanish (rioplatense), matching existing screens.
- Styling: Tailwind utility classes + `ui` tokens from `src/lib/ui-tokens.ts`; `app-*` color tokens only (see `CLAUDE.md` / `docs/design-system.md`).
- Run the full suite with `npm test` and type-check with `npx tsc --noEmit`. Lint with `npm run lint`.

---

### Task 1: Per-stage knockout points in `scorePrediction`

Introduce the per-stage points table and use it in `scorePrediction`. Outcome logic (`getOutcome` with `winnerTeamId`) is left **unchanged** in this task — only the point values change. The advancer is removed in Task 2.

**Files:**
- Modify: `src/lib/scoring.ts` (add `STAGE_POINTS`, update `scorePrediction` body ~74-101)
- Test: `src/lib/scoring.test.ts` (update point expectations ~68-105)
- Test: `src/lib/sync/recalc-matches.test.ts` (update expected points ~43-44)

**Interfaces:**
- Produces: `export const STAGE_POINTS: Record<Stage, { outcome: number; exact: number }>`
- Produces (unchanged signature): `scorePrediction(match: Match, prediction: Prediction): { points: number; exactHit: boolean; outcomeHit: boolean }`

- [ ] **Step 1: Update the scoring tests to per-stage values**

In `src/lib/scoring.test.ts`, the `groupMatch` fixture has `stage: "groups"` but is used to exercise per-match scoring. Per-match group predictions don't exist in the product, but the test uses it as a generic match. Change its stage to a knockout stage so the points table applies. Edit the fixture (around line 22):

```ts
const groupMatch: Match = {
  id: "m1",
  matchNo: 1,
  stage: "round32",
  group: undefined,
  homeTeamId: "arg",
  awayTeamId: "mex",
  kickoffUtc: "2026-06-12T22:00:00.000Z",
  city: "Ciudad de México",
  venue: "Estadio Azteca",
  homeScore: 2,
  awayScore: 1,
  winnerTeamId: null,
  finalizedAt: "2026-06-12T23:55:00.000Z",
  finalizedBy: "admin",
  updatedAt: null,
  updatedBy: null,
  finalizedSource: null,
  feedMatchId: null,
};
```

Then update the `describe("scorePrediction")` expectations (around lines 68-105) to round32 (10/25) for `groupMatch` and round16 (30/50) for `knockoutMatch`:

```ts
describe("scorePrediction", () => {
  it("gives exact-result points for the stage", () => {
    expect(scorePrediction(groupMatch, prediction({ homeScore: 2, awayScore: 1 }))).toEqual({
      points: 25,
      exactHit: true,
      outcomeHit: true,
    });
  });

  it("gives outcome points for a correct result", () => {
    expect(scorePrediction(groupMatch, prediction({ homeScore: 3, awayScore: 0 }))).toEqual({
      points: 10,
      exactHit: false,
      outcomeHit: true,
    });
  });

  it("gives 0 points for a wrong prediction", () => {
    expect(scorePrediction(groupMatch, prediction({ homeScore: 0, awayScore: 1 }))).toEqual({
      points: 0,
      exactHit: false,
      outcomeHit: false,
    });
  });

  it("scores knockout advancer when tied", () => {
    expect(
      scorePrediction(
        knockoutMatch,
        prediction({ matchId: "m2", homeScore: 2, awayScore: 2, winnerTeamId: "arg" }),
      ),
    ).toEqual({
      points: 30,
      exactHit: false,
      outcomeHit: true,
    });
  });
});
```

(Note: `groupMatch` is now `round32` and no longer in group "A". The `canSavePrediction` tests below it use `openStages: new Set(["groups"])` / `["round16"]`; update the two `groupMatch`-based `canSavePrediction` tests' `openStages` to `new Set(["round32"])` so they still target the match's stage. Lines ~120-142.)

- [ ] **Step 2: Run the scoring tests to verify they fail**

Run: `npx vitest run src/lib/scoring.test.ts`
Expected: FAIL — e.g. `expected { points: 3 } to deeply equal { points: 25 }`.

- [ ] **Step 3: Add `STAGE_POINTS` and use it in `scorePrediction`**

In `src/lib/scoring.ts`, add the table just below the imports (after line 11):

```ts
// Per-stage knockout points: [outcome, exact]. Groups use position scoring
// (GROUP_POSITION_POINTS) and have no per-match predictions, so their entry is 0/0.
export const STAGE_POINTS: Record<Stage, { outcome: number; exact: number }> = {
  groups: { outcome: 0, exact: 0 },
  round32: { outcome: 10, exact: 25 },
  round16: { outcome: 30, exact: 50 },
  quarter: { outcome: 60, exact: 80 },
  semi: { outcome: 90, exact: 110 },
  third: { outcome: 120, exact: 150 },
  final: { outcome: 120, exact: 150 },
};
```

Then update `scorePrediction` (lines 74-101) to use it — keep `getOutcome` and its `winnerTeamId` args unchanged in this task:

```ts
export function scorePrediction(match: Match, prediction: Prediction): ScoreResult {
  if (
    match.homeScore === null ||
    match.awayScore === null ||
    prediction.homeScore === null ||
    prediction.awayScore === null
  ) {
    return { points: 0, exactHit: false, outcomeHit: false };
  }

  const { outcome, exact } = STAGE_POINTS[match.stage];

  const exactHit =
    prediction.homeScore === match.homeScore &&
    prediction.awayScore === match.awayScore;

  if (exactHit) {
    return { points: exact, exactHit: true, outcomeHit: true };
  }

  const predictedOutcome = getOutcome(
    prediction.homeScore,
    prediction.awayScore,
    prediction.winnerTeamId,
  );
  const officialOutcome = getOutcome(match.homeScore, match.awayScore, match.winnerTeamId);
  const outcomeHit = predictedOutcome !== null && predictedOutcome === officialOutcome;

  return { points: outcomeHit ? outcome : 0, exactHit: false, outcomeHit };
}
```

- [ ] **Step 4: Update the recalc-matches test expectation**

In `src/lib/sync/recalc-matches.test.ts`, `baseMatch` is `stage: "round32"` and the prediction is an exact 2-1 hit. Update the expectation (line 44) from 3 to 25:

```ts
    // Exact 2-1 hit on round32 = 25 points (per scorePrediction / STAGE_POINTS).
    expect(updates[0].values).toMatchObject({ points: 25, exact_hit: true, outcome_hit: true });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/scoring.test.ts src/lib/sync/recalc-matches.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/scoring.ts src/lib/scoring.test.ts src/lib/sync/recalc-matches.test.ts
git commit -m "feat(scoring): per-stage knockout points

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Remove the tie-advancer from the prediction flow

Atomic change: removing `winnerTeamId` from the `Prediction` / `PredictionDraft` types forces every prediction-side consumer to be updated in the same commit (the compiler enforces completeness). `matches.winner_team_id` / `Match.winnerTeamId` stay.

**Files:**
- Modify: `src/lib/types.ts` (remove `winnerTeamId` from `Prediction` line 62 and `PredictionDraft` line 85)
- Modify: `src/lib/scoring.ts` (simplify `getOutcome`; drop advancer check in `canSavePrediction`; delete `getPredictionWinner`; fix imports)
- Modify: `src/lib/tournament.ts` (delete `needsAdvancer` and `inferWinner`)
- Modify: `src/app/actions.ts` (drop `winnerTeamId` from `SavePredictionInput`, `savePredictionAction`, prediction `mapPrediction`; drop `inferWinner` import)
- Modify: `src/lib/supabase-data.ts` (drop `winner_team_id` from `PredictionRow` and `mapPrediction`)
- Modify: `src/components/app-shell.tsx` (drop `winnerTeamId` from `updatePrediction` / `savePredictionAction` call)
- Modify: `src/screens/predictions.tsx` (remove advancer selector + all clasifica strings + `needsAdvancer` import)
- Modify: `src/screens/results.tsx` (remove clasifica suffix line 362)
- Modify: `src/lib/seed.ts` (remove `winnerTeamId` from prediction `p6` line 112)
- Test: `src/lib/scoring.test.ts`, `src/lib/tournament.test.ts`, `src/lib/stats.test.ts`, `src/lib/standings.test.ts`, `src/lib/results.test.ts`, `src/lib/sync/recalc-matches.test.ts`

**Interfaces:**
- `Prediction` and `PredictionDraft` no longer have `winnerTeamId`.
- `getOutcome(homeScore: number, awayScore: number): "home" | "away" | "draw"` (no longer nullable, no `winnerTeamId`).
- `needsAdvancer`, `inferWinner`, `getPredictionWinner` no longer exist.
- `SavePredictionInput = { matchId: string; homeScore: number; awayScore: number }`.

- [ ] **Step 1: Update the unit tests first (TDD)**

`src/lib/scoring.test.ts`:
- In the `prediction(...)` factory (lines 51-66), remove the `winnerTeamId: null,` line.
- Replace the `"scores knockout advancer when tied"` test (lines 93-104) with a draw-outcome test that sets no advancer:

```ts
  it("scores a level knockout result as a draw outcome", () => {
    expect(
      scorePrediction(
        knockoutMatch,
        prediction({ matchId: "m2", homeScore: 2, awayScore: 2 }),
      ),
    ).toEqual({
      points: 30,
      exactHit: false,
      outcomeHit: true,
    });
  });
```

  (`knockoutMatch` is `round16` with `homeScore: 1, awayScore: 1` — a level result — so its official outcome is now `draw`; a predicted 2-2 is also `draw` → 30 outcome points.)
- Remove the `canSavePrediction` test `"requires an advancer for tied knockout predictions"` (lines 108-118) entirely.
- In the remaining `canSavePrediction` tests, remove `winnerTeamId: null,` from each `draft` object (lines ~112, 124, 136 — the advancer test is already deleted).

`src/lib/tournament.test.ts`:
- Remove `needsAdvancer` from the import on line 3.
- Remove the entire `describe("needsAdvancer", ...)` block (lines ~51-71).
- In the `draft(...)` factory (line 25), remove `winnerTeamId: null,` so it returns `{ homeScore: null, awayScore: null, ...overrides }`. (Verify no remaining test references `winnerTeamId`; if the `draft` factory becomes unused after deleting the block, remove the factory too.)

`src/lib/stats.test.ts`: in the `pred(...)` factory (line 64), remove `winnerTeamId: null,`.

`src/lib/standings.test.ts`: in the prediction factory (line 18), remove `winnerTeamId: null,`.

`src/lib/results.test.ts`: in the prediction factory (line 121), remove `winnerTeamId: null,`. (Line 14 is a `Match` fixture — leave it.)

`src/lib/sync/recalc-matches.test.ts`: in `predictionRows` (line 19), remove `winner_team_id: "rsa",` from the row object.

- [ ] **Step 2: Run the tests to verify they fail (compile errors)**

Run: `npx vitest run`
Expected: FAIL — type errors / failures because the source still defines `winnerTeamId` and `needsAdvancer`. This confirms the tests now describe the target state.

- [ ] **Step 3: Remove `winnerTeamId` from the prediction types**

In `src/lib/types.ts`, delete `winnerTeamId: string | null;` from `Prediction` (line 62) and from `PredictionDraft` (line 85). **Leave** `Match.winnerTeamId` (line 47).

- [ ] **Step 4: Simplify `scoring.ts`**

In `src/lib/scoring.ts`:

Update the import on line 11 — drop `inferWinner` and `needsAdvancer`:

```ts
import { getGroupStatus, getMatchStatus, hasGroupOrder } from "./tournament";
```

In `scorePrediction`, change the two `getOutcome` calls to drop the third argument:

```ts
  const predictedOutcome = getOutcome(prediction.homeScore, prediction.awayScore);
  const officialOutcome = getOutcome(match.homeScore, match.awayScore);
  const outcomeHit = predictedOutcome === officialOutcome;
```

In `canSavePrediction`, delete the advancer block (lines 140-142):

```ts
  if (needsAdvancer(match, draft) && !draft.winnerTeamId) {
    return { ok: false, reason: "Elegí quién clasifica." };
  }
```

Delete `getPredictionWinner` entirely (lines 189-191).

Replace `getOutcome` (lines 193-197) with the score-only version:

```ts
function getOutcome(homeScore: number, awayScore: number) {
  if (homeScore > awayScore) return "home";
  if (awayScore > homeScore) return "away";
  return "draw";
}
```

- [ ] **Step 5: Delete `needsAdvancer` and `inferWinner` from `tournament.ts`**

In `src/lib/tournament.ts`, delete both functions (lines 111-126). Remove `PredictionDraft` from the import on line 1 if it is now unused (check: it is only used by these two functions).

- [ ] **Step 6: Update `actions.ts`**

In `src/app/actions.ts`:
- Remove `winnerTeamId: string | null;` from `SavePredictionInput` (line 32). **Leave** `FinalizeMatchInput.winnerTeamId` (line 40 — match side).
- Remove the `inferWinner` import (line 13: `import { inferWinner } from "@/lib/tournament";`).
- In `savePredictionAction`, change the `draft` object (lines 109-113) to drop `winnerTeamId`:

```ts
  const draft = {
    homeScore: input.homeScore,
    awayScore: input.awayScore,
  };
```

- Delete the `const winnerTeamId = inferWinner(match, draft);` line (124) and remove `winner_team_id: winnerTeamId,` from the upsert (line 132). The upsert becomes:

```ts
  const { error } = await supabase.from("predictions").upsert(
    {
      user_id: user.userId,
      match_id: input.matchId,
      home_score: input.homeScore,
      away_score: input.awayScore,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,match_id" },
  );
```

- In the **prediction** `mapPrediction` (lines 820-845), remove `winner_team_id: string | null;` from the row type (line 826) and `winnerTeamId: row.winner_team_id,` from the return (line 839). **Do not** touch the `mapMatch` row type/return above it (lines 787, 810).

- [ ] **Step 7: Update `supabase-data.ts`**

In `src/lib/supabase-data.ts`:
- In `PredictionRow` (lines 62-?), remove `winner_team_id: string | null;` (line 68).
- In the exported `mapPrediction` (lines 239-253), remove `winnerTeamId: row.winner_team_id,` (line 246).
- **Leave** the `MatchRow.winner_team_id` (line 53) and `mapMatch` `winnerTeamId` (line 229).

- [ ] **Step 8: Update `app-shell.tsx`**

In `src/components/app-shell.tsx`, `updatePrediction` (lines 351-398):
- Remove the `winnerTeamId` property from `nextPrediction` (lines 365-366).
- Remove `winnerTeamId: nextPrediction.winnerTeamId,` from the `savePredictionAction(...)` call (line 386).

The call becomes:

```ts
      void savePredictionAction({
        matchId: match.id,
        homeScore: nextPrediction.homeScore,
        awayScore: nextPrediction.awayScore,
      }).then((result) => {
```

**Leave** `finalizeMatch`'s `winnerTeamId: match.winnerTeamId` (lines 324, 338 — match side).

- [ ] **Step 9: Update `predictions.tsx` (remove advancer UI)**

In `src/screens/predictions.tsx`:
- Remove `needsAdvancer,` from the import block (line 42).
- `savedKey` (lines 544-546): drop the advancer segment:

```ts
  const savedKey = prediction ? `${prediction.homeScore}-${prediction.awayScore}` : "";
```

- `applyDraft` (lines 553-569): remove normalization and the advancer completeness check:

```ts
  const applyDraft = (next: PredictionDraft) => {
    setDraft(next);

    const complete = next.homeScore !== null && next.awayScore !== null;

    if (complete) {
      onChange(match, {
        homeScore: next.homeScore as number,
        awayScore: next.awayScore as number,
      });
    }
  };
```

- Delete `const showAdvancer = needsAdvancer(match, draft);` (line 571).
- Delete the entire advancer selector block (lines 609-625, the `{showAdvancer && ( ... )}` JSX).
- `toDraft` (lines 678-684): drop `winnerTeamId`:

```ts
function toDraft(prediction?: Prediction): PredictionDraft {
  return {
    homeScore: prediction?.homeScore ?? null,
    awayScore: prediction?.awayScore ?? null,
  };
}
```

- `buildMatchCopyText` CSV branch (lines 801-810): remove the "Clasifica" column. Header becomes `[["Jugador", homeLabel, awayLabel]]` and each row drops the advancer cell:

```ts
    const rows: string[][] = [["Jugador", homeLabel, awayLabel]];
    for (const profile of approved) {
      const prediction = predictionFor(profile);
      rows.push([
        profile.displayName,
        prediction ? String(prediction.homeScore) : "",
        prediction ? String(prediction.awayScore) : "",
      ]);
    }
```

- `buildMatchCopyText` text branch (lines 817-822): drop the `winner` suffix:

```ts
  const lines = approved.map((profile) => {
    const prediction = predictionFor(profile);
    if (!prediction) return `${profile.displayName}: Sin pronóstico`;
    return `${profile.displayName}: ${prediction.homeScore}-${prediction.awayScore}`;
  });
```

  (The local `const team = ...` on line 814 may now be unused in this function. Remove it if so; it is still used by `buildGroupCopyText` which has its own local `team`.)
- `PredictionDrawer` per-player display (lines 915-921): drop the clasifica span:

```ts
                    {prediction ? (
                      <span className="text-sm font-bold text-app-muted">
                        <span className="text-app-text">{prediction.homeScore}-{prediction.awayScore}</span>
                      </span>
                    ) : (
```

  After this, `shortName` in `PredictionDrawer` (line 886) may be unused — remove it if the compiler flags it.

- [ ] **Step 10: Update `results.tsx`**

In `src/screens/results.tsx`, remove the clasifica suffix (line 362) so the pick is score-only:

```ts
          <span className="text-sm font-bold tabular-nums">
            {prediction.homeScore}-{prediction.awayScore}
          </span>
```

- [ ] **Step 11: Update `seed.ts`**

In `src/lib/seed.ts`, remove `winnerTeamId: "arg",` from the `predictions` array entry `p6` (line 112). **Leave** the `winnerTeamId` fields in the `matches` array (lines 73, 95).

- [ ] **Step 12: Type-check, lint, and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors. (If the compiler flags any remaining `winnerTeamId` / `needsAdvancer` / `inferWinner` / `getPredictionWinner` reference, fix that file the same way — match side stays, prediction side goes.)

Run: `npm run lint`
Expected: no errors (fix any now-unused imports/vars it reports, e.g. `getTeamLabel`/`getTeamFlag` if they became unused — verify before removing).

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat(scoring): drop the knockout tie-advancer from predictions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Database migration + schema update

Drop the advancer RLS clause and the `predictions.winner_team_id` column, and mirror both into the canonical schema file.

**Files:**
- Create: `docs/supabase-migration-stage-scoring.sql`
- Modify: `docs/supabase-schema.sql` (remove `predictions.winner_team_id` column line 64; remove the advancer clause from both prediction policies lines 253-256 and 285-288)

- [ ] **Step 1: Write the migration file**

Create `docs/supabase-migration-stage-scoring.sql`:

```sql
-- Stage-based knockout scoring + drop the tie-advancer.
--
-- Points are computed in the app (src/lib/scoring.ts) and stored on rows, so
-- this migration carries no scoring logic. It only removes the now-defunct
-- prediction-side advancer:
--   1. drop the advancer clause from the predictions insert/update policies
--      (the cleanup anticipated by supabase-migration-knockout-prediction-rls-fix.sql)
--   2. drop predictions.winner_team_id
--
-- matches.winner_team_id (bracket advancement) is intentionally untouched.

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
  )
);

alter table public.predictions drop column winner_team_id;
```

- [ ] **Step 2: Mirror the changes into the canonical schema**

In `docs/supabase-schema.sql`:
- Remove `winner_team_id text references public.teams(id),` from the `predictions` table definition (line 64). **Leave** the identical line in `matches` (line 47).
- In `predictions_insert_own_open` (lines 229-258), remove the trailing advancer clause:

```sql
      and (
        predictions.home_score <> predictions.away_score
        or predictions.winner_team_id in (m.home_team_id, m.away_team_id)
      )
```

  so the policy ends after `and m.away_team_id is not null`.
- Do the same in `predictions_update_own_open` (lines 260-290).

- [ ] **Step 3: Sanity-check the SQL**

Run: `rtk proxy rg -n "winner_team_id" docs/supabase-schema.sql`
Expected: only the two `matches`-side references remain (the table column at line ~47 and none in the predictions policies). There should be **no** `predictions.winner_team_id` references.

- [ ] **Step 4: Commit**

```bash
git add docs/supabase-migration-stage-scoring.sql docs/supabase-schema.sql
git commit -m "feat(db): drop predictions.winner_team_id + advancer RLS clause

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> **Deploy note (not a code step):** run `docs/supabase-migration-stage-scoring.sql` against the Supabase project. After deploying, an admin should trigger a recalc/sync for any finalized knockout stage so stored points reflect the new per-stage values. The tournament has not reached the knockout rounds, so impact is expected to be nil.

---

### Task 4: Update the rules screen + Novedades modal

**Files:**
- Modify: `src/screens/rules.tsx` (rewrite the "Cruces" section, lines 56-70)
- Modify: `src/components/novedades-modal.tsx` (bump version, add entry)

- [ ] **Step 1: Rewrite the "Cruces" section in `rules.tsx`**

Replace the `<Section title="Cruces" ...>` block (lines 56-70) with:

```tsx
        <Section
          title="Cruces"
          subtitle="Eliminación directa: 16avos, octavos, cuartos, semis, 3er puesto y final."
        >
          <li>
            El puntaje sube por ronda. Cada partido suma por acertar el{" "}
            <strong>resultado exacto</strong> o, en su defecto, el{" "}
            <strong>ganador o empate</strong>:
          </li>
          <li>16avos: <strong>25</strong> exacto · <strong>10</strong> ganador/empate</li>
          <li>Octavos: <strong>50</strong> exacto · <strong>30</strong> ganador/empate</li>
          <li>Cuartos: <strong>80</strong> exacto · <strong>60</strong> ganador/empate</li>
          <li>Semis: <strong>110</strong> exacto · <strong>90</strong> ganador/empate</li>
          <li>3er puesto y final: <strong>150</strong> exacto · <strong>120</strong> ganador/empate</li>
          <li>Los pronósticos se pueden editar hasta el inicio de cada partido.</li>
        </Section>
```

This removes the old flat "3 puntos / 1 punto" line and the "Si pronosticás empate, tenés que elegir quién clasifica." line.

- [ ] **Step 2: Add the Novedades entry**

In `src/components/novedades-modal.tsx`:
- Add `Medal` to the lucide import (line 5):

```ts
import { BarChart3, Medal, Sparkles, TimerReset, type LucideIcon } from "lucide-react";
```

- Bump the version (line 20):

```ts
const NOVEDADES_VERSION = "2026-06-stage-scoring";
```

- Prepend a new entry to the `novedades` array (line 31), so it shows first:

```ts
const novedades: Novedad[] = [
  {
    icon: Medal,
    title: "Puntajes por etapa",
    body: "Los cruces ahora valen más a medida que avanza el torneo: desde 16avos hasta la final, acertar suma cada vez más puntos. Y si pronosticás un empate, ya no hace falta elegir quién clasifica.",
  },
  // ...existing entries below
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/screens/rules.tsx src/components/novedades-modal.tsx
git commit -m "feat(ui): document per-stage scoring in rules + novedades

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] Run `npx tsc --noEmit` — no errors.
- [ ] Run `npm run lint` — no errors.
- [ ] Run `npx vitest run` — all green.
- [ ] `rtk proxy rg -n "winnerTeamId|winner_team_id" src` shows **only** match-side references (`Match`, `mapMatch`, `MatchRow`, `finalizeMatch`, sync fixtures, CSV import) — none on `Prediction`, `PredictionDraft`, `savePrediction`, or the predictions mappers.
- [ ] `rtk proxy rg -n "needsAdvancer|inferWinner|getPredictionWinner" src` returns nothing.

## Self-review notes (coverage vs spec)

- Scoring model (per-stage table) → Task 1.
- Outcome without advancer (`getOutcome` score-only) → Task 2 Step 4.
- Drop advancer across types/tournament/scoring/actions/supabase-data/app-shell/predictions/results/seed → Task 2.
- Migration + schema mirror → Task 3.
- Recalc/backfill → Task 3 deploy note.
- Rules + Novedades → Task 4.
- Tests → Tasks 1 & 2.
- Out of scope (group scoring, `matches.winner_team_id`) preserved → enforced by Global Constraints + final verification grep.
