# Scheduled Stage Opening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin schedule a future datetime at which a tournament stage auto-opens (all visibility flags), and let users hover a disabled stage tab to see how long until it opens.

**Architecture:** A new nullable `stages.opens_at` column is read at render time. A pure `effectiveStageState(stage, now)` promotes all three visibility flags to `"open"` once `now ≥ opensAt` — it only ever promotes, never closes, so no background job is needed. `app-shell` runs every stage through that helper before the existing gating functions, and a 60s clock tick makes the promotion (and the hover countdown) live. Disabled tabs gain a hover tooltip via the existing `Tooltip` primitive.

**Tech Stack:** Next.js (App Router), React client components, Supabase (Postgres + RLS), TypeScript, Vitest, Tailwind v4, base-ui.

## Global Constraints

- Style with Tailwind utility classes on elements; use `app-*` color tokens only (no raw white/black/gray/hex). Prefer `ui.*` recipes from `src/lib/ui-tokens.ts`.
- Eyebrow micro-label is always `ui.label`.
- Spanish (rioplatense) user-facing copy.
- The schedule **only promotes to open** — never closes a stage and never overrides a manual `open`/`admin` toward more-restricted. A single `opens_at` opens predictions + results + standings together.
- Existing `stages.opened_at`/`opened_by` audit columns are NOT touched.
- Stages are fetched with `select("*")`, so a new column flows through automatically once added to `StageRow`/`mapStage`.
- Run `npm test` (vitest) and `npx tsc --noEmit` to verify; `npm run lint` for lint.

---

### Task 1: `effectiveStageState` helper + `opensAt` on StageState

**Files:**
- Modify: `src/lib/types.ts` (StageState)
- Modify: `src/lib/tab-visibility.ts` (new export)
- Test: `src/lib/tab-visibility.test.ts`

**Interfaces:**
- Produces: `StageState.opensAt: string | null`; `effectiveStageState(stage: StageState, now: Date): StageState`.

- [ ] **Step 1: Add `opensAt` to the test helper default and write failing tests**

In `src/lib/tab-visibility.test.ts`, update the `stage()` helper default block to include `opensAt`:

```ts
function stage(partial: Partial<StageState> & { stage: StageState["stage"] }): StageState {
  return {
    label: partial.stage,
    predictionsOpen: "closed",
    resultsOpen: "closed",
    standingsOpen: "closed",
    opensAt: null,
    ...partial,
  };
}
```

Add `effectiveStageState` to the import on line 3-8, and append this `describe` block at the end of the file:

```ts
describe("effectiveStageState", () => {
  const now = new Date("2026-06-27T12:00:00.000Z");

  it("no-ops when opensAt is null", () => {
    const s = stage({ stage: "round16", opensAt: null });
    expect(effectiveStageState(s, now)).toBe(s);
  });

  it("no-ops when now is before opensAt", () => {
    const s = stage({ stage: "round16", opensAt: "2026-06-27T18:00:00.000Z" });
    expect(effectiveStageState(s, now)).toEqual(s);
    expect(effectiveStageState(s, now).predictionsOpen).toBe("closed");
  });

  it("promotes all three flags to open once now reaches opensAt", () => {
    const s = stage({ stage: "round16", opensAt: "2026-06-27T06:00:00.000Z" });
    const eff = effectiveStageState(s, now);
    expect(eff.predictionsOpen).toBe("open");
    expect(eff.resultsOpen).toBe("open");
    expect(eff.standingsOpen).toBe("open");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tab-visibility`
Expected: FAIL — `effectiveStageState is not a function` / not exported.

- [ ] **Step 3: Add `opensAt` to StageState**

In `src/lib/types.ts`, extend `StageState` (currently lines 71-77):

```ts
export type StageState = {
  stage: Stage;
  label: string;
  predictionsOpen: StageVisibility;
  resultsOpen: StageVisibility;
  standingsOpen: StageVisibility;
  /** Scheduled instant after which the stage auto-opens (all flags). Null = manual only. */
  opensAt: string | null;
};
```

- [ ] **Step 4: Implement `effectiveStageState`**

In `src/lib/tab-visibility.ts`, add after the `isVisible` helper (after line 7):

```ts
/**
 * Promote a stage to fully open once its scheduled `opensAt` has passed.
 * Read-time only: never closes a stage, never overrides a manual open.
 */
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

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tab-visibility`
Expected: PASS (all stage-gating + effectiveStageState tests).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (Other `StageState` literals are updated in Task 3; if tsc flags missing `opensAt` in `seed.ts`, that is expected and fixed in Task 3 — but `npm test` for this task passes. If you prefer a clean tsc here, you may apply the `seed.ts` edit from Task 3 Step 1 now.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/tab-visibility.ts src/lib/tab-visibility.test.ts
git commit -m "feat(stages): effectiveStageState promotes flags after opensAt"
```

---

### Task 2: `getOpenCopy` countdown helper

**Files:**
- Modify: `src/lib/tournament.ts` (new export)
- Test: `src/lib/tournament.test.ts` (create if absent)

**Interfaces:**
- Produces: `getOpenCopy(isoDate: string, now?: Date): string | null` — `"en 3 d"` / `"en 5 h"` / `"en 12 min"`, or `null` once the time has passed.

- [ ] **Step 1: Write the failing test**

Create `src/lib/tournament.test.ts` (or append the `describe` if the file already exists):

```ts
import { describe, expect, it } from "vitest";

import { getOpenCopy } from "./tournament";

describe("getOpenCopy", () => {
  const now = new Date("2026-06-27T12:00:00.000Z");

  it("returns null once the time has passed", () => {
    expect(getOpenCopy("2026-06-27T11:59:00.000Z", now)).toBeNull();
    expect(getOpenCopy("2026-06-27T12:00:00.000Z", now)).toBeNull();
  });

  it("formats minutes under an hour", () => {
    expect(getOpenCopy("2026-06-27T12:12:00.000Z", now)).toBe("en 12 min");
  });

  it("formats hours under a day", () => {
    expect(getOpenCopy("2026-06-27T17:00:00.000Z", now)).toBe("en 5 h");
  });

  it("formats days, rounding up", () => {
    expect(getOpenCopy("2026-06-30T13:00:00.000Z", now)).toBe("en 3 d");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tournament`
Expected: FAIL — `getOpenCopy is not a function`.

- [ ] **Step 3: Implement `getOpenCopy`**

In `src/lib/tournament.ts`, add after `getLockCopy` (after line 103):

```ts
/** Countdown until a scheduled stage open, mirroring getLockCopy. Null once passed. */
export function getOpenCopy(isoDate: string, now = new Date()): string | null {
  const ms = new Date(isoDate).getTime() - now.getTime();
  if (ms <= 0) return null;

  const hours = Math.floor(ms / 1000 / 60 / 60);
  if (hours >= 24) return `en ${Math.ceil(hours / 24)} d`;
  if (hours > 0) return `en ${hours} h`;

  const minutes = Math.max(1, Math.floor(ms / 1000 / 60));
  return `en ${minutes} min`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tournament`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament.ts src/lib/tournament.test.ts
git commit -m "feat(stages): getOpenCopy countdown helper"
```

---

### Task 3: Persist `opens_at` (row mapping, seed, migration, schema)

**Files:**
- Modify: `src/lib/supabase-data.ts` (StageRow + mapStage)
- Modify: `src/lib/seed.ts` (stage literals)
- Create: `docs/supabase-migration-stage-opens-at.sql`
- Modify: `docs/supabase-schema.sql`

**Interfaces:**
- Consumes: `StageState.opensAt` (Task 1).
- Produces: `opensAt` populated from the DB on every load; `opens_at` column exists in schema.

- [ ] **Step 1: Default `opensAt` on every seed stage**

In `src/lib/seed.ts`, add `opensAt: null` to each of the 7 stage literals (lines 23-29). Example for the first row:

```ts
{ stage: "groups", label: "Grupos", predictionsOpen: "open", resultsOpen: "open", standingsOpen: "open", opensAt: null },
```

Apply the same `, opensAt: null` to `round32`, `round16`, `quarter`, `semi`, `third`, `final`.

- [ ] **Step 2: Add `opens_at` to StageRow and mapStage**

In `src/lib/supabase-data.ts`, extend `StageRow` (lines 30-36):

```ts
type StageRow = {
  stage: Stage;
  label: string;
  predictions_open: StageVisibility;
  results_open: StageVisibility;
  standings_open: StageVisibility;
  opens_at: string | null;
};
```

And `mapStage` (lines 202-210):

```ts
function mapStage(row: StageRow): StageState {
  return {
    stage: row.stage,
    label: row.label,
    predictionsOpen: row.predictions_open,
    resultsOpen: row.results_open,
    standingsOpen: row.standings_open,
    opensAt: row.opens_at,
  };
}
```

- [ ] **Step 3: Create the migration**

Create `docs/supabase-migration-stage-opens-at.sql`:

```sql
-- Scheduled stage opening: a future instant after which the stage auto-opens
-- (predictions + results + standings). Promotion is computed at read-time in the
-- app; this column only stores the schedule. Distinct from the opened_at audit column.
alter table public.stages
  add column if not exists opens_at timestamptz;
```

- [ ] **Step 4: Mirror the column into the schema doc**

In `docs/supabase-schema.sql`, add `opens_at` to the `stages` table (after line 27, before `opened_at`):

```sql
  standings_open text not null default 'closed' check (standings_open in ('closed', 'admin', 'open')),
  opens_at timestamptz,
  opened_at timestamptz,
```

- [ ] **Step 5: Typecheck and run full tests**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase-data.ts src/lib/seed.ts docs/supabase-migration-stage-opens-at.sql docs/supabase-schema.sql
git commit -m "feat(db): add stages.opens_at column + mapping"
```

---

### Task 4: Live minute tick in `useHydratedNow`

**Files:**
- Modify: `src/lib/use-hydrated-now.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `useHydratedNow()` now advances `now` every 60s (unchanged signature).

- [ ] **Step 1: Add a 60s interval**

Replace the body of `src/lib/use-hydrated-now.ts` with:

```ts
"use client";

import { useEffect, useState } from "react";

const initialRenderNowIso = "2026-06-07T23:00:00.000Z";

export function useHydratedNow() {
  const [now, setNow] = useState(() => new Date(initialRenderNowIso));

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  return now;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/use-hydrated-now.ts
git commit -m "feat(clock): tick useHydratedNow every minute"
```

---

### Task 5: Disabled-tab hover tooltip in `StageTabs`

**Files:**
- Modify: `src/components/badges.tsx` (StageTabs)

**Interfaces:**
- Consumes: `Tooltip` from `@/components/ui/tooltip`; `Stage` type.
- Produces: `StageTabs` accepts `openHints?: Partial<Record<Stage, string>>` (default `{}`). Every disabled desktop tab is wrapped in a hover tooltip: `openHints[stage]` if present, else `"Próximamente"`. Disabled mobile select items append the hint inline. Enabled tabs are unchanged.

- [ ] **Step 1: Import Tooltip and add the prop**

In `src/components/badges.tsx`, add to the imports near the top (match existing import style):

```ts
import { Tooltip } from "@/components/ui/tooltip";
```

Extend the `StageTabs` props type (after `label?: string;`, around line 84):

```ts
  /** Per-stage hover copy for disabled tabs. Missing entry → "Próximamente". */
  openHints?: Partial<Record<Stage, string>>;
```

Add `openHints = {}` to the destructured params (alongside `label = "Etapa"`, around line 75).

- [ ] **Step 2: Tooltip-wrap disabled desktop tabs**

Replace the desktop `stageOrder.map((stage) => ( ... ))` block (lines 132-141) with a version that wraps disabled triggers in a `Tooltip` whose trigger is a focusable `<span>` (a disabled `<button>` emits no pointer events):

```tsx
          {stageOrder.map((stage) => {
            const disabled = showDisabled ? !enabledStages.has(stage) : false;
            const trigger = (
              <TabsTrigger
                key={stage}
                value={stage}
                disabled={disabled}
                className={triggerClass}
              >
                {stageLabels[stage]}
              </TabsTrigger>
            );
            if (!disabled) return trigger;
            return (
              <Tooltip key={stage} content={openHints[stage] ?? "Próximamente"}>
                <span tabIndex={0} className="inline-flex">
                  {trigger}
                </span>
              </Tooltip>
            );
          })}
```

- [ ] **Step 3: Append the hint inline on the mobile select**

Replace the mobile `stageOrder.map` `SelectItem` block (lines 107-115) so disabled items show the hint inline:

```tsx
          {stageOrder.map((stage) => {
            const disabled = showDisabled ? !enabledStages.has(stage) : false;
            const hint = disabled ? openHints[stage] : undefined;
            return (
              <SelectItem key={stage} value={stage} disabled={disabled}>
                {hint ? `${stageLabels[stage]} · ${hint}` : stageLabels[stage]}
              </SelectItem>
            );
          })}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. (No existing callers pass `openHints`, so they default to `{}` and render `"Próximamente"` on disabled tabs — acceptable and intended.)

- [ ] **Step 5: Commit**

```bash
git add src/components/badges.tsx
git commit -m "feat(ui): hover tooltip on disabled stage tabs"
```

---

### Task 6: Wire effective stages + open hints through app-shell, context, and screens

**Files:**
- Modify: `src/components/app-shell.tsx`
- Modify: `src/components/app-context.tsx` (context type)
- Modify: `src/screens/predictions.tsx`
- Modify: `src/screens/results.tsx`
- Modify: `src/screens/leaderboard.tsx`

**Interfaces:**
- Consumes: `effectiveStageState` (Task 1), `getOpenCopy` (Task 2), `StageTabs.openHints` (Task 5).
- Produces: `AppContextValue.stageOpenHints: Partial<Record<Stage, string>>`. The four stage `Set`s are computed from **effective** stages; admin panel keeps raw `stages`.

- [ ] **Step 1: Compute effective stages and hints in app-shell**

In `src/components/app-shell.tsx`, add to imports — extend the existing tab-visibility import (line 69) with `effectiveStageState`, and add `getOpenCopy` + `formatKickoff` from tournament (find the existing `@/lib/tournament` import and add them; if none, add `import { formatKickoff, getOpenCopy } from "@/lib/tournament";`).

Replace the four `use*Stages` memos (lines 144-147) with effective-stage versions, and add the hints memo:

```ts
  const effectiveStages = useMemo(
    () => stages.map((stage) => effectiveStageState(stage, now)),
    [stages, now],
  );
  const openStages = useMemo(() => getPredictionsStages(effectiveStages, isAdmin), [effectiveStages, isAdmin]);
  const editableStages = useMemo(() => getEditablePredictionsStages(effectiveStages), [effectiveStages]);
  const resultsStages = useMemo(() => getResultsStages(effectiveStages, matches, groups, isAdmin), [effectiveStages, matches, groups, isAdmin]);
  const standingsStages = useMemo(() => getStandingsStages(effectiveStages, isAdmin), [effectiveStages, isAdmin]);

  const stageOpenHints = useMemo(() => {
    const hints: Partial<Record<Stage, string>> = {};
    for (const stage of stages) {
      if (!stage.opensAt) continue;
      const rel = getOpenCopy(stage.opensAt, now);
      if (rel) hints[stage.stage] = `Se abre ${formatKickoff(stage.opensAt)} · ${rel}`;
    }
    return hints;
  }, [stages, now]);
```

- [ ] **Step 2: Expose `stageOpenHints` on the context type**

In `src/components/app-context.tsx`, add to `AppContextValue` (after `standingsStages: Set<Stage>;`, line 39):

```ts
  stageOpenHints: Partial<Record<Stage, string>>;
```

(`Stage` is already imported in this file.)

- [ ] **Step 3: Add `stageOpenHints` to the context value**

In `src/components/app-shell.tsx`, add to the `contextValue` object (after `standingsStages,`, line 562):

```ts
    stageOpenHints,
```

- [ ] **Step 4: Pass hints into each StageTabs**

In `src/screens/predictions.tsx` (line 180), pull `stageOpenHints` from `useApp()` (add it to the existing destructure that already includes `openStages`) and pass it:

```tsx
          <StageTabs activeStage={activeStage} enabledStages={openStages} onChange={setActiveStage} openHints={stageOpenHints} />
```

In `src/screens/results.tsx` (line 78), add `stageOpenHints` to the `useApp()` destructure and pass `openHints={stageOpenHints}`:

```tsx
      <StageTabs activeStage={activeStage} enabledStages={resultsStages} onChange={setActiveStage} openHints={stageOpenHints} />
```

In `src/screens/leaderboard.tsx` (line 59-65), add `stageOpenHints` to the `useApp()` destructure and add `openHints={stageOpenHints}` to the `<StageTabs>` props.

- [ ] **Step 5: Typecheck, lint, and run tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no errors; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/app-shell.tsx src/components/app-context.tsx src/screens/predictions.tsx src/screens/results.tsx src/screens/leaderboard.tsx
git commit -m "feat(stages): apply scheduled open to tabs + hover hints"
```

---

### Task 7: Admin control to set/clear `opens_at`

**Files:**
- Modify: `src/app/actions.ts` (new action)
- Modify: `src/components/app-context.tsx` (method type)
- Modify: `src/components/app-shell.tsx` (method impl + context value)
- Modify: `src/screens/admin.tsx` (UI control)

**Interfaces:**
- Consumes: `requireAdmin`, `createSupabaseServerClient`, `revalidatePath` (existing in actions.ts); `toDatetimeLocal` (existing in admin.tsx, line 58); `updateStageOpensAtAction`.
- Produces: `updateStageOpensAtAction(input: { stage: Stage; opensAt: string | null }): Promise<{ ok: boolean; message: string }>`; context method `updateStageOpensAt: (stage: Stage, opensAt: string | null) => Promise<void> | void`.

- [ ] **Step 1: Add the server action**

In `src/app/actions.ts`, add after `updateStageFlagAction` (after line 364), mirroring `updateGroupLocksAtAction`:

```ts
type UpdateStageOpensAtInput = {
  stage: Stage;
  opensAt: string | null;
};

export async function updateStageOpensAtAction(input: UpdateStageOpensAtInput) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Supabase no está configurado." };

  const admin = await requireAdmin(supabase);
  if (!admin.ok) return admin;

  let opensAt: string | null = null;
  if (input.opensAt) {
    const parsed = new Date(input.opensAt);
    if (Number.isNaN(parsed.getTime())) return { ok: false, message: "La fecha de apertura no es válida." };
    opensAt = parsed.toISOString();
  }

  const { error } = await supabase.from("stages").update({ opens_at: opensAt }).eq("stage", input.stage);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/");
  return { ok: true, message: opensAt ? "Apertura programada." : "Apertura programada quitada." };
}
```

(`Stage` is already imported in actions.ts via the existing `@/lib/types` import that includes `StageVisibility`. If tsc reports `Stage` missing, add it to that import.)

- [ ] **Step 2: Add the context method type**

In `src/components/app-context.tsx`, add after `updateStageFlag: ...` (line 51):

```ts
  updateStageOpensAt: (stage: Stage, opensAt: string | null) => Promise<void> | void;
```

- [ ] **Step 3: Implement the method in app-shell**

In `src/components/app-shell.tsx`, add `updateStageOpensAtAction` to the actions import block (alongside `updateStageFlagAction`, line 38). Add this function next to `updateStageFlag` (after line 309):

```ts
  async function updateStageOpensAt(stage: Stage, opensAt: string | null) {
    setStages((current) => current.map((item) => (item.stage === stage ? { ...item, opensAt } : item)));
    const result = await updateStageOpensAtAction({ stage, opensAt });
    setDataMessage(result.message);
    if (result.ok) await refreshSupabaseData();
  }
```

Add `updateStageOpensAt,` to the `contextValue` object (after `updateStageFlag,`, line 574).

- [ ] **Step 4: Add the admin UI control**

In `src/screens/admin.tsx`, add `updateStageOpensAt` to the `useApp()` destructure (after `updateStageFlag,`, line 123).

Inside the stage row (`src/screens/admin.tsx`, in the `stageOrder.map` body, after the flags `<div className="flex flex-wrap gap-1.5">…</div>` that ends at line 537), add a scheduled-open control. Use the local-datetime → ISO conversion `new Date(value).toISOString()` on save and `toDatetimeLocal(stageState?.opensAt ?? null)` to prefill:

```tsx
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={ui.label}>Apertura programada</span>
                      <Input
                        type="datetime-local"
                        className="h-9 w-auto"
                        defaultValue={toDatetimeLocal(stageState?.opensAt ?? null)}
                        key={stageState?.opensAt ?? "none"}
                        disabled={Boolean(pendingAdminAction)}
                        onChange={(event: ChangeEvent<HTMLInputElement>) => {
                          const value = event.target.value;
                          runAdminAction(`stage-${stage}-opensAt`, () =>
                            updateStageOpensAt(stage, value ? new Date(value).toISOString() : null),
                          );
                        }}
                      />
                      {stageState?.opensAt && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={Boolean(pendingAdminAction)}
                          onClick={() => runAdminAction(`stage-${stage}-opensAtClear`, () => updateStageOpensAt(stage, null))}
                        >
                          Quitar
                        </Button>
                      )}
                    </div>
```

(`Input` and `ChangeEvent` are already imported in admin.tsx; `ui` is imported from `@/lib/ui-tokens`.)

- [ ] **Step 5: Typecheck, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: no errors; build succeeds.

- [ ] **Step 6: Manual verification (Supabase-backed env)**

If a Supabase env is configured, run `npm run dev`, sign in as admin, set a stage's "Apertura programada" a couple of minutes out, confirm: (a) the stage tab in Predicciones is disabled and hovering shows `Se abre … · en N min`; (b) after the time passes (or with a past datetime) the tab enables without manual flag changes. Note in the commit/PR if no Supabase env was available to test live.

- [ ] **Step 7: Commit**

```bash
git add src/app/actions.ts src/components/app-context.tsx src/components/app-shell.tsx src/screens/admin.tsx
git commit -m "feat(admin): schedule stage opening datetime"
```

---

### Task 8: Novedades entry

**Files:**
- Modify: `src/components/novedades-modal.tsx`

**Interfaces:**
- Consumes: nothing new — follows the existing `Novedad` shape (`{ icon, title, body, href?, cta? }`) and `TimerReset` icon already imported in the file.

- [ ] **Step 1: Bump the version and prepend the entry**

In `src/components/novedades-modal.tsx`, bump `NOVEDADES_VERSION` (line 20) so the modal re-shows for everyone:

```ts
const NOVEDADES_VERSION = "2026-06-stage-opening";
```

Prepend a new entry to the front of the `novedades` array (line 31-37), using the already-imported `TimerReset` icon:

```ts
const novedades: Novedad[] = [
  {
    icon: TimerReset,
    title: "Apertura automática de etapas",
    body: "Ahora cada etapa puede programarse para abrirse sola en una fecha y hora. ¿Una etapa todavía está deshabilitada? Pasá el mouse por encima y vas a ver cuánto falta para que se abra.",
  },
  {
    icon: Medal,
    title: "Puntajes por etapa",
    body: "Los cruces ahora valen más a medida que avanza el torneo: desde 16avos hasta la final, acertar suma cada vez más puntos. Y si pronosticás un empate, ya no hace falta elegir quién clasifica. Recorda que el 28 de junio se habilitan los pronósticos de los 16avos!",
  },
];
```

(`TimerReset` is already imported on line 5; no import change needed.)

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/novedades-modal.tsx
git commit -m "feat(ui): novedades entry for scheduled stage opening"
```

---

## Final verification

- [ ] Run `npm test && npx tsc --noEmit && npm run lint && npm run build` — all green.
- [ ] Confirm the migration `docs/supabase-migration-stage-opens-at.sql` has been applied to any live Supabase instance before deploy (the app reads `opens_at` via `select("*")`; a missing column would error the data load).
