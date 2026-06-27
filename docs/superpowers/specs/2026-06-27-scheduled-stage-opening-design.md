# Scheduled stage opening + "opens in…" hover

**Date:** 2026-06-27
**Status:** Approved (pending spec review)

## Problem

Admins open each tournament stage (Grupos, 16avos, Octavos, …) by hand,
cycling per-stage visibility flags in the admin panel. We want to schedule a
stage to open automatically at a future datetime, and let users hover a
still-disabled stage tab to see how long until it opens.

## Current model (context)

- `stages` table has three visibility flags per stage —
  `predictions_open`, `results_open`, `standings_open` — each
  `'closed' | 'admin' | 'open'`. An admin cycles them in the
  "Etapas habilitadas" panel (`updateStageFlagAction`).
- `StageState` (`src/lib/types.ts`) mirrors them as
  `predictionsOpen` / `resultsOpen` / `standingsOpen`.
- `src/lib/tab-visibility.ts` turns `StageState[]` into the `Set<Stage>` of
  enabled stages for predictions / results / standings, given `isAdmin`.
- `StageTabs` (`src/components/badges.tsx`) renders every stage; stages not in
  the enabled set are `disabled`.
- The existing `stages.opened_at` / `opened_by` columns are an **audit** record
  (when an admin opened predictions). They are NOT a schedule and are left
  untouched.

## Decisions (from brainstorming)

1. **What opens:** when the scheduled time passes, **all three** flags
   (predictions, results, standings) are treated as `open`.
2. **Mechanism:** computed at read-time. The schedule only ever *promotes* a
   stage to open; it never closes one, and needs no background job. A manual
   `open` already wins; admin `preview` still works before the time.
3. **Tooltip on a disabled stage with a schedule:** relative + absolute, e.g.
   `Se abre vie 3 jul 18:00 · en 3 d`.
4. **Tooltip on a disabled stage with no schedule:** generic `Próximamente`.
   Every disabled tab becomes hoverable.

## Design

### 1. Data model

- New nullable column `stages.opens_at timestamptz`. Scheduled instant after
  which the stage auto-opens. `opened_at` / `opened_by` unchanged.
- `StageState` gains `opensAt: string | null`.
- `StageRow` (`supabase-data.ts`) gains `opens_at: string | null`; `mapStage`
  maps it to `opensAt`.
- Seed stages (`src/lib/seed.ts`) get `opensAt: null`.
- Migration `docs/supabase-migration-stage-opens-at.sql`:
  `alter table public.stages add column opens_at timestamptz;`
  Mirror the column into `docs/supabase-schema.sql`. RLS unchanged — read via
  `stages_select_approved`, write via `stages_admin_all`.

### 2. Effective visibility (pure, read-time)

New helper in `src/lib/tab-visibility.ts`:

```ts
export function effectiveStageState(stage: StageState, now: Date): StageState {
  if (stage.opensAt && new Date(stage.opensAt).getTime() <= now.getTime()) {
    return {
      ...stage,
      predictionsOpen: "open",
      resultsOpen: "open",
      standingsOpen: "open",
    };
  }
  return stage;
}
```

In `app-shell`, derive
`effectiveStages = useMemo(() => stages.map((s) => effectiveStageState(s, now)), [stages, now])`
and pass `effectiveStages` (instead of `stages`) into the existing
`getPredictionsStages` / `getEditablePredictionsStages` / `getResultsStages` /
`getStandingsStages`. Those functions stay byte-for-byte unchanged.

Notes:
- `getResultsStages` still gates on finalized content, so promoting
  `resultsOpen` cannot reveal empty results.
- `getEditablePredictionsStages` keys on `predictionsOpen === "open"`, so a
  scheduled stage also becomes *editable* once open — the desired behaviour
  (users can submit picks once the stage opens).
- The admin "Etapas habilitadas" panel keeps reading the **raw** `stages` so
  admins see/set stored flags, not the computed promotion.

### 3. Live tick

`useHydratedNow()` (`src/lib/use-hydrated-now.ts`) currently sets `now` once on
mount. Add a 60s `setInterval` (cleared on unmount) so:
- a scheduled stage's tabs flip open at the threshold without a manual refresh,
- the hover countdown stays current.

Only `app-shell` consumes the hook; minute-granularity matches the countdown
copy. Existing match-lock countdowns become live as a side benefit.

### 4. Countdown copy

New helper in `src/lib/tournament.ts`, sibling of `getLockCopy`:

```ts
export function getOpenCopy(isoDate: string, now = new Date()): string | null {
  const ms = new Date(isoDate).getTime() - now.getTime();
  if (ms <= 0) return null; // already open
  const hours = Math.floor(ms / 1000 / 60 / 60);
  if (hours >= 24) return `en ${Math.ceil(hours / 24)} d`;
  if (hours > 0) return `en ${hours} h`;
  const minutes = Math.max(1, Math.floor(ms / 1000 / 60));
  return `en ${minutes} min`;
}
```

### 5. Hover on disabled stages

- `StageTabs` gains an optional prop
  `openHints?: Partial<Record<Stage, string>>` (default `{}`). Existing callers
  are unaffected.
- Every **disabled** stage tab is wrapped in the `Tooltip` primitive
  (`src/components/ui/tooltip.tsx`). Because a disabled `<button>` does not emit
  pointer events, the `Tooltip` trigger is a `<span>` wrapper around the
  disabled `TabsTrigger`.
- Tooltip content:
  - if `openHints[stage]` is set → that string
    (e.g. `Se abre vie 3 jul 18:00 · en 3 d`);
  - otherwise → `Próximamente`.
- Enabled tabs render exactly as today (no wrapper, no tooltip).
- Mobile `<Select>`: tooltips don't work on select items, so append the hint to
  the disabled item's label inline (e.g. `Octavos · en 3 d`); unscheduled
  disabled items stay as-is.

`app-shell` builds `openHints` for stages that are still disabled and have a
future `opensAt`:

```ts
const stageOpenHints = useMemo(() => {
  const hints: Partial<Record<Stage, string>> = {};
  for (const s of stages) {
    if (!s.opensAt) continue;
    const rel = getOpenCopy(s.opensAt, now);
    if (rel) hints[s.stage] = `Se abre ${formatKickoff(s.opensAt)} · ${rel}`;
  }
  return hints;
}, [stages, now]);
```

The hint map is passed to whichever `StageTabs` render predictions / results /
standings.

### 6. Admin control

In the "Etapas habilitadas" panel (`src/screens/admin.tsx`), each stage row
gains a scheduled-open control:
- a `datetime-local` input pre-filled from `opensAt` (UTC ISO → local), reusing
  the kickoff local→ISO conversion already used by the manual-match form;
- a save button and a "Quitar" (clear) action.

New server action `updateStageOpensAtAction({ stage, opensAt: string | null })`
in `src/app/actions.ts` (mirrors `updateStageFlagAction`: `requireAdmin`,
update `opens_at`, `revalidatePath("/")`). Threaded through `app-context`
(`updateStageOpensAt`) and `app-shell` like `updateStageFlag`, with optimistic
local state + `refreshSupabaseData()`.

### 7. Tests

- `src/lib/tab-visibility.test.ts`: `effectiveStageState`
  - no-op when `opensAt` is null,
  - no-op when `now < opensAt`,
  - promotes all three flags when `now >= opensAt`.
- New `getOpenCopy` tests (in `tournament` test or a small new file): days,
  hours, minutes, and past → `null`.
- Existing suites (`tab-visibility`, `scoring`, etc.) stay green.

### 8. Novedades

User-facing change, so per `CLAUDE.md` add a Novedades entry
(`src/components/novedades-modal.tsx`) describing scheduled auto-open + the
hover countdown. Final, optional plan step.

## Out of scope

- No persisted flag flip / cron worker.
- No per-flag schedules (single `opens_at` opens all three).
- No auto-close scheduling.
