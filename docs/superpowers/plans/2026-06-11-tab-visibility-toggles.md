# Admin Tab Visibility Toggles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins enable/disable the Tabla (standings) and Resultados tabs for all users via the admin panel, with a disabled nav button and a URL redirect guard when a tab is hidden.

**Architecture:** A new `app_settings` key/value table (`standings`, `results`) mirrors the existing `stages.open` pattern. Settings load through the same data pipeline as stages, derive into `standingsVisible`/`resultsVisible` booleans, gate the sidebar nav buttons and route access, and are toggled from a new admin card via a server action that mirrors `updateStageOpenAction`.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Supabase (Postgres + RLS), Vitest, Tailwind.

---

## File Structure

- `src/lib/types.ts` — add `AppSettingKey`, `AppSetting` types.
- `src/lib/tab-visibility.ts` (new) — pure `getTabVisibility(appSettings)` helper with default-true behavior.
- `src/lib/tab-visibility.test.ts` (new) — unit tests for the helper.
- `src/lib/seed.ts` — add `appSettings` seed (both enabled).
- `src/lib/supabase-data.ts` — load + map `app_settings`; add to `SupabaseAppData`.
- `src/app/actions.ts` — `updateTabVisibilityAction`.
- `src/components/app-context.tsx` — add `standingsVisible`, `resultsVisible`, `updateTabVisibility` to the context type.
- `src/components/app-shell.tsx` — settings state, derived booleans, toggle fn, URL guard, disabled nav buttons, inert stats pill.
- `src/screens/admin.tsx` — new "Pestañas visibles" admin card.
- `docs/supabase-schema.sql` — canonical schema gets the new table.
- `docs/supabase-migration-tab-visibility.sql` (new) — incremental migration.

---

### Task 1: Types

**Files:**
- Modify: `src/lib/types.ts` (append after the `StageState` type, around line 72)

- [ ] **Step 1: Add the types**

Append to `src/lib/types.ts`:

```ts
export type AppSettingKey = "standings" | "results";

export type AppSetting = {
  key: AppSettingKey;
  enabled: boolean;
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add app settings types for tab visibility"
```

---

### Task 2: Visibility helper (TDD)

This is the only branch worth unit-testing: deriving booleans from the settings list, defaulting to visible when a row is missing.

**Files:**
- Create: `src/lib/tab-visibility.ts`
- Test: `src/lib/tab-visibility.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/tab-visibility.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { getTabVisibility } from "./tab-visibility";

describe("getTabVisibility", () => {
  it("defaults both tabs to visible when settings are empty", () => {
    expect(getTabVisibility([])).toEqual({
      standingsVisible: true,
      resultsVisible: true,
    });
  });

  it("reflects disabled settings", () => {
    expect(
      getTabVisibility([
        { key: "standings", enabled: false },
        { key: "results", enabled: true },
      ]),
    ).toEqual({ standingsVisible: false, resultsVisible: true });
  });

  it("defaults a missing key to visible", () => {
    expect(getTabVisibility([{ key: "results", enabled: false }])).toEqual({
      standingsVisible: true,
      resultsVisible: false,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tab-visibility.test.ts`
Expected: FAIL — cannot find module `./tab-visibility` / `getTabVisibility is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/tab-visibility.ts`:

```ts
import type { AppSetting, AppSettingKey } from "./types";

export type TabVisibility = {
  standingsVisible: boolean;
  resultsVisible: boolean;
};

function isEnabled(settings: AppSetting[], key: AppSettingKey): boolean {
  const setting = settings.find((item) => item.key === key);
  // Missing rows default to visible so a fresh DB matches current behavior.
  return setting ? setting.enabled : true;
}

export function getTabVisibility(settings: AppSetting[]): TabVisibility {
  return {
    standingsVisible: isEnabled(settings, "standings"),
    resultsVisible: isEnabled(settings, "results"),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tab-visibility.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tab-visibility.ts src/lib/tab-visibility.test.ts
git commit -m "feat(tabs): add tab visibility derivation helper"
```

---

### Task 3: Seed data

**Files:**
- Modify: `src/lib/seed.ts` (import line 1; add export after the `stages` array, around line 30)

- [ ] **Step 1: Add `AppSetting` to the import**

In `src/lib/seed.ts` line 1, change the import to include `AppSetting`:

```ts
import type { AppSetting, Group, GroupPrediction, Match, Prediction, Profile, StageState, Team } from "./types";
```

- [ ] **Step 2: Add the seed export**

After the `stages` array (after line 30) add:

```ts
export const appSettings: AppSetting[] = [
  { key: "standings", enabled: true },
  { key: "results", enabled: true },
];
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/seed.ts
git commit -m "feat(seed): add default tab visibility settings"
```

---

### Task 4: Data layer load + map

**Files:**
- Modify: `src/lib/supabase-data.ts`

- [ ] **Step 1: Import the new types**

In `src/lib/supabase-data.ts`, add `AppSetting` and `AppSettingKey` to the type import block (lines 1-11):

```ts
import type {
  AppSetting,
  AppSettingKey,
  Group,
  GroupPrediction,
  Match,
  MatchLifecycleStatus,
  Prediction,
  Profile,
  Stage,
  StageState,
  Team,
} from "./types";
```

- [ ] **Step 2: Add the row type**

After the `StageRow` type (after line 33) add:

```ts
type AppSettingRow = {
  key: AppSettingKey;
  enabled: boolean;
};
```

- [ ] **Step 3: Add to `SupabaseAppData`**

In the `SupabaseAppData` type (lines 96-105), add the field after `stages`:

```ts
export type SupabaseAppData = {
  profile: Profile | null;
  profiles: Profile[];
  teams: Team[];
  stages: StageState[];
  appSettings: AppSetting[];
  matches: Match[];
  predictions: Prediction[];
  groups: Group[];
  groupPredictions: GroupPrediction[];
};
```

- [ ] **Step 4: Add the parallel query**

In `loadSupabaseAppData`, add `appSettingsResult` to the destructured array and the `Promise.all` (lines 129-145). The destructuring becomes:

```ts
  const [
    profilesResult,
    teamsResult,
    stagesResult,
    appSettingsResult,
    matchesResult,
    predictionsResult,
    groupsResult,
    groupPredictionsResult,
  ] = await Promise.all([
    table(client, "profiles").select("*").order("display_name", { ascending: true }),
    table(client, "teams").select("*").order("name", { ascending: true }),
    table(client, "stages").select("*").order("stage", { ascending: true }),
    table(client, "app_settings").select("*").order("key", { ascending: true }),
    table(client, "matches").select("*").order("kickoff_utc", { ascending: true }),
    table(client, "predictions").select("*").order("updated_at", { ascending: true }),
    table(client, "groups").select("*").order("group_label", { ascending: true }),
    table(client, "group_predictions").select("*").order("updated_at", { ascending: true }),
  ]);
```

- [ ] **Step 5: Add to the error-check array**

In the `results` array (lines 147-155) add `appSettingsResult`:

```ts
  const results = [
    profilesResult,
    teamsResult,
    stagesResult,
    appSettingsResult,
    matchesResult,
    predictionsResult,
    groupsResult,
    groupPredictionsResult,
  ];
```

- [ ] **Step 6: Add to the returned object**

In the `return` (lines 161-170) add the mapped field after `stages`:

```ts
    stages: (stagesResult.data as StageRow[]).map(mapStage),
    appSettings: (appSettingsResult.data as AppSettingRow[]).map(mapAppSetting),
```

- [ ] **Step 7: Add the mapper**

After `mapStage` (after line 203) add:

```ts
function mapAppSetting(row: AppSettingRow): AppSetting {
  return {
    key: row.key,
    enabled: row.enabled,
  };
}
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/supabase-data.ts
git commit -m "feat(data): load app_settings into app data"
```

---

### Task 5: Server action

**Files:**
- Modify: `src/app/actions.ts`

- [ ] **Step 1: Import `AppSettingKey`**

In `src/app/actions.ts`, add `AppSettingKey` to the type import block (lines 13-21):

```ts
import type {
  AppSettingKey,
  Group,
  GroupPrediction,
  Match,
  MatchLifecycleStatus,
  Prediction,
  Profile,
  Stage,
} from "@/lib/types";
```

- [ ] **Step 2: Add the input type**

After the `UpdateStageInput` type (after line 43) add:

```ts
type UpdateTabVisibilityInput = {
  key: AppSettingKey;
  enabled: boolean;
};
```

- [ ] **Step 3: Add the action**

After `updateStageOpenAction` (after line 314) add:

```ts
export async function updateTabVisibilityAction(input: UpdateTabVisibilityInput) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Supabase no está configurado." };

  const admin = await requireAdmin(supabase);
  if (!admin.ok) return admin;

  const { error } = await supabase
    .from("app_settings")
    .upsert(
      {
        key: input.key,
        enabled: input.enabled,
        updated_at: new Date().toISOString(),
        updated_by: admin.userId,
      },
      { onConflict: "key" },
    );

  if (error) return { ok: false, message: error.message };

  revalidatePath("/");
  return { ok: true, message: input.enabled ? "Pestaña habilitada." : "Pestaña deshabilitada." };
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions.ts
git commit -m "feat(actions): add updateTabVisibilityAction"
```

---

### Task 6: Context type

**Files:**
- Modify: `src/components/app-context.tsx`

- [ ] **Step 1: Import the key type**

In `src/components/app-context.tsx`, add `AppSettingKey` to the type import (lines 5-14):

```ts
import type {
  AppSettingKey,
  Group,
  GroupPrediction,
  Match,
  Prediction,
  Profile,
  Stage,
  StageState,
  Team,
} from "@/lib/types";
```

- [ ] **Step 2: Add fields to `AppContextValue`**

In the `AppContextValue` type, add after `openStages: Set<Stage>;` (line 33):

```ts
  openStages: Set<Stage>;
  standingsVisible: boolean;
  resultsVisible: boolean;
```

And add to the methods section, after `updateStageOpen` (line 44):

```ts
  updateStageOpen: (stage: Stage, open: boolean) => Promise<void> | void;
  updateTabVisibility: (key: AppSettingKey, enabled: boolean) => Promise<void> | void;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: FAIL — `app-shell.tsx` does not yet provide the new context fields. (This is expected; Task 7 supplies them.)

- [ ] **Step 4: Commit**

```bash
git add src/components/app-context.tsx
git commit -m "feat(context): add tab visibility to app context type"
```

---

### Task 7: App shell wiring (state, toggle, guard, nav)

**Files:**
- Modify: `src/components/app-shell.tsx`

- [ ] **Step 1: Add imports**

In `src/components/app-shell.tsx`:

Add `updateTabVisibilityAction` to the actions import (lines 17-29), keeping alphabetical-ish grouping — insert after `updateStageOpenAction,`:

```ts
  updateStageOpenAction,
  updateTabVisibilityAction,
} from "@/app/actions";
```

Add the seed import for `appSettings` (lines 35-43) — insert after `stages as seedStages,`:

```ts
  stages as seedStages,
  appSettings as seedAppSettings,
```

Add types to the `@/lib/types` import (lines 46-55) — add `AppSetting` and `AppSettingKey`:

```ts
import type {
  AppSetting,
  AppSettingKey,
  Group,
  GroupPrediction,
  Match,
  Prediction,
  Profile,
  Stage,
  StageState,
  Team,
} from "@/lib/types";
```

Add the helper import (after line 56, the `ui-tokens` import line) — add a new line:

```ts
import { getTabVisibility } from "@/lib/tab-visibility";
```

- [ ] **Step 2: Add settings state**

After the `stages` state declaration (line 92) add:

```ts
  const [appSettings, setAppSettings] = useState<AppSetting[]>(seedAppSettings);
```

- [ ] **Step 3: Derive visibility booleans**

After the `openStages` memo (after line 116) add:

```ts
  const { standingsVisible, resultsVisible } = useMemo(
    () => getTabVisibility(appSettings),
    [appSettings],
  );
```

- [ ] **Step 4: Populate settings from Supabase load**

In `refreshSupabaseData`, after `setStages(appData.stages);` (line 151) add:

```ts
      setStages(appData.stages);
      setAppSettings(appData.appSettings);
```

- [ ] **Step 5: Clear settings on sign-out**

In `signOut`, after `setStages([]);` (line 216) add:

```ts
      setStages([]);
      setAppSettings([]);
```

(Empty list → both default visible, consistent with the helper.)

- [ ] **Step 6: Extend the redirect guard**

Replace the existing redirect `useEffect` (lines 176-180) with:

```ts
  useEffect(() => {
    if (!currentUser) return;
    if (activeTab === "admin" && !isAdmin) {
      router.replace(tabRoutes.predictions);
      return;
    }
    if (activeTab === "leaderboard" && !standingsVisible) {
      router.replace(tabRoutes.predictions);
      return;
    }
    if (activeTab === "results" && !resultsVisible) {
      router.replace(tabRoutes.predictions);
    }
  }, [activeTab, currentUser, isAdmin, standingsVisible, resultsVisible, router]);
```

- [ ] **Step 7: Add the toggle function**

After the `updateStageOpen` function (after line 271) add:

```ts
  async function updateTabVisibility(key: AppSettingKey, enabled: boolean) {
    setAppSettings((current) => {
      const without = current.filter((item) => item.key !== key);
      return [...without, { key, enabled }];
    });
    const result = await updateTabVisibilityAction({ key, enabled });
    setDataMessage(result.message);
    if (result.ok) await refreshSupabaseData();
  }
```

- [ ] **Step 8: Add fields to the context value**

In the `contextValue` object (lines 558-587), add after `openStages,` (line 571):

```ts
    openStages,
    standingsVisible,
    resultsVisible,
```

And after `updateStageOpen,` (line 582):

```ts
    updateStageOpen,
    updateTabVisibility,
```

- [ ] **Step 9: Make the mobile stats pill inert when standings hidden**

Replace the `me && (...)` block (lines 603-612) so that when standings is hidden it renders a non-link span:

```tsx
            {me && (
              standingsVisible ? (
                <Link
                  href={tabRoutes.leaderboard}
                  aria-label={`Tu posición: puesto ${me.rank}, ${me.points} puntos`}
                  className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-app-line bg-app-surface px-3 py-1.5 text-xs font-black"
                >
                  <span className="text-app-muted">#{me.rank}</span>
                  <span className="text-app-green">{me.points} pts</span>
                </Link>
              ) : (
                <span
                  aria-label={`Tu posición: puesto ${me.rank}, ${me.points} puntos`}
                  className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-app-line bg-app-surface px-3 py-1.5 text-xs font-black opacity-60"
                >
                  <span className="text-app-muted">#{me.rank}</span>
                  <span className="text-app-green">{me.points} pts</span>
                </span>
              )
            )}
```

- [ ] **Step 10: Pass visibility to the Sidebar / SidebarContent**

Update `SidebarContentProps` (lines 659-667) to add the two booleans:

```ts
type SidebarContentProps = {
  activeTab: AppRoute;
  isAdmin: boolean;
  standingsVisible: boolean;
  resultsVisible: boolean;
  currentUser: Profile;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onSignOut: () => Promise<void> | void;
  onNavigate?: () => void;
};
```

Update the `SidebarContent` destructuring (lines 669-677) to include `standingsVisible, resultsVisible`.

Pass the props at both call sites — the desktop `<Sidebar ... />` (line 592) and the mobile `<SidebarContent ... />` (lines 628-636). For the desktop sidebar:

```tsx
        <Sidebar activeTab={activeTab} isAdmin={isAdmin} standingsVisible={standingsVisible} resultsVisible={resultsVisible} currentUser={currentUser} theme={theme} onThemeChange={setTheme} onSignOut={signOut} />
```

For the mobile `SidebarContent`:

```tsx
            <SidebarContent
              activeTab={activeTab}
              isAdmin={isAdmin}
              standingsVisible={standingsVisible}
              resultsVisible={resultsVisible}
              currentUser={currentUser}
              theme={theme}
              onThemeChange={setTheme}
              onSignOut={signOut}
              onNavigate={() => setMobileNavOpen(false)}
            />
```

- [ ] **Step 11: Disable the Tabla / Resultados nav buttons**

In `SidebarContent`'s `<nav>` (lines 690-694), pass `disabled` to the two relevant `NavLink`s:

```tsx
        <NavLink href={tabRoutes.predictions} icon={<CircleDot />} label="Pronósticos" active={activeTab === "predictions"} onNavigate={onNavigate} />
        <NavLink href={tabRoutes.leaderboard} icon={<Trophy />} label="Tabla" active={activeTab === "leaderboard"} disabled={!standingsVisible} onNavigate={onNavigate} />
        <NavLink href={tabRoutes.results} icon={<CalendarClock />} label="Resultados" active={activeTab === "results"} disabled={!resultsVisible} onNavigate={onNavigate} />
        <NavLink href={tabRoutes.rules} icon={<Info />} label="Reglas" active={activeTab === "rules"} onNavigate={onNavigate} />
```

- [ ] **Step 12: Add `disabled` support to `NavLink`**

Replace the `NavLink` component (lines 701-719) with:

```tsx
function NavLink({ href, icon, label, active, disabled, onNavigate }: { href: string; icon: React.ReactNode; label: string; active: boolean; disabled?: boolean; onNavigate?: () => void }) {
  const router = useRouter();
  return (
    <Button
      variant={active ? "default" : "ghost"}
      disabled={disabled}
      className={cn(
        "h-10 justify-start gap-2.5 rounded-lg px-3 text-sm font-bold",
        active ? "bg-app-solid text-app-solid-fg" : "text-app-muted hover:bg-app-surface-2 hover:text-app-text",
        disabled && "pointer-events-none opacity-50",
      )}
      onClick={() => {
        if (disabled) return;
        router.push(href);
        onNavigate?.();
      }}
    >
      {icon}
      <span className="max-w-full truncate">{label}</span>
    </Button>
  );
}
```

- [ ] **Step 13: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (Task 6's gap is now closed).

- [ ] **Step 14: Build sanity check**

Run: `npm run build`
Expected: build completes without type or lint errors.

- [ ] **Step 15: Commit**

```bash
git add src/components/app-shell.tsx
git commit -m "feat(nav): gate Tabla and Resultados tabs on admin visibility"
```

---

### Task 8: Admin panel toggle card

**Files:**
- Modify: `src/screens/admin.tsx`

- [ ] **Step 1: Pull the new context fields**

In `AdminScreen`'s `useApp()` destructuring (lines 80-101), add `standingsVisible`, `resultsVisible`, and `updateTabVisibility`:

```ts
    updateStageOpen,
    standingsVisible,
    resultsVisible,
    updateTabVisibility,
    approveProfile,
```

- [ ] **Step 2: Add the admin card**

In the `<aside>` (starting line 400), after the "Etapas habilitadas" `Card` closes (after line 425, before the "Usuarios pendientes" card) insert:

```tsx
        <Card className={cn(ui.panel, "p-4")}>
          <CardHeader>
            <CardTitle>Pestañas visibles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="stage-admin-list">
              {(
                [
                  { key: "standings", label: "Tabla", visible: standingsVisible },
                  { key: "results", label: "Resultados", visible: resultsVisible },
                ] as const
              ).map(({ key, label, visible }) => (
                <div className="stage-admin-row" key={key}>
                  <div>
                    <strong>{label}</strong>
                    <small>{visible ? "Visible para todos" : "Tab deshabilitado"}</small>
                  </div>
                  <Button
                    variant={visible ? "outline" : "default"}
                    size="sm"
                    disabled={Boolean(pendingAdminAction)}
                    onClick={() => runAdminAction(`tab-${key}`, () => updateTabVisibility(key, !visible))}
                  >
                    <LoadingLabel loading={pendingAdminAction === `tab-${key}`} label={visible ? "Deshabilitar" : "Habilitar"} />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Build sanity check**

Run: `npm run build`
Expected: build completes cleanly.

- [ ] **Step 5: Commit**

```bash
git add src/screens/admin.tsx
git commit -m "feat(admin): add tab visibility toggle card"
```

---

### Task 9: Database schema + migration

**Files:**
- Modify: `docs/supabase-schema.sql`
- Create: `docs/supabase-migration-tab-visibility.sql`

- [ ] **Step 1: Add the table to the canonical schema**

In `docs/supabase-schema.sql`, after the `stages` table definition (after line 28) insert:

```sql
create table public.app_settings (
  key text primary key,
  enabled boolean not null default true,
  updated_at timestamptz,
  updated_by uuid references public.profiles(id)
);
```

- [ ] **Step 2: Enable RLS in the canonical schema**

In `docs/supabase-schema.sql`, in the `alter table ... enable row level security` block (lines 71-75), add:

```sql
alter table public.app_settings enable row level security;
```

- [ ] **Step 3: Add policies + seed to the canonical schema**

In `docs/supabase-schema.sql`, after the `stages_admin_all` policy (after line 185) insert:

```sql
create policy "app_settings_select_approved"
on public.app_settings
for select
to authenticated
using (public.is_approved());

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
```

- [ ] **Step 4: Create the incremental migration**

Create `docs/supabase-migration-tab-visibility.sql`:

```sql
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
```

- [ ] **Step 5: Commit**

```bash
git add docs/supabase-schema.sql docs/supabase-migration-tab-visibility.sql
git commit -m "feat(db): add app_settings table for tab visibility"
```

---

### Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the new `tab-visibility.test.ts`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Lint + build**

Run: `npm run build`
Expected: completes without lint/type errors.

- [ ] **Step 4: Manual smoke check (requires Supabase config + migration applied)**

Run: `npm run dev`, sign in as an admin, then verify:
- Admin panel shows the "Pestañas visibles" card with Tabla and Resultados both showing "Deshabilitar" (currently enabled).
- Disabling "Tabla" greys out the Tabla sidebar button and visiting `/tabla` redirects to `/pronosticos`; the mobile stats pill no longer links.
- Disabling "Resultados" greys out the Resultados button and `/resultados` redirects.
- Re-enabling restores the buttons and routes.

Note: the manual step needs `docs/supabase-migration-tab-visibility.sql` applied to the database first.
