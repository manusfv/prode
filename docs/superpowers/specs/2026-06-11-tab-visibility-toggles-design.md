# Admin toggles for Tabla & Resultados visibility

**Date:** 2026-06-11
**Status:** Approved

## Problem

The app already lets admins enable/disable per-stage prediction visibility via the
`stages.open` flag ("Etapas habilitadas" in the admin panel). The **Tabla**
(standings/leaderboard) and **Resultados** tabs, however, are always shown to
everyone. Admins need a way to hide these two tabs until they are ready to reveal
them (e.g. before the tournament produces meaningful standings/results).

## Goal

Add two admin-controlled toggles — one for **Tabla**, one for **Resultados** — that
control whether each tab is reachable. The toggles affect **all** users, admins
included (no special admin preview access).

## Decisions

- **Enforcement**: when a tab is disabled, block the URL (redirect) **and** render
  the sidebar nav button in a disabled state. The tab stays visible-but-locked.
- **Admin access**: the toggle applies to admins too. Admins re-enable a tab from
  the admin panel to view it; there is no separate preview path.
- **Default state**: both tabs default to visible, matching current behavior.

## Storage

New key/value table `public.app_settings`, mirroring the `stages.open` pattern so
it loads into a `Set` the same way `openStages` does.

```sql
create table public.app_settings (
  key text primary key,            -- 'standings' | 'results'
  enabled boolean not null default true,
  updated_at timestamptz,
  updated_by uuid references public.profiles(id)
);

alter table public.app_settings enable row level security;

create policy "app_settings_select_approved"
on public.app_settings for select to authenticated
using (public.is_approved());

create policy "app_settings_admin_all"
on public.app_settings for all to authenticated
using (public.is_admin()) with check (public.is_admin());

insert into public.app_settings (key, enabled) values
  ('standings', true),
  ('results', true);
```

This goes into:
- `docs/supabase-schema.sql` (the canonical full schema), and
- a new `docs/supabase-migration-tab-visibility.sql` (incremental migration for the
  live database).

A key/value table is chosen over dedicated boolean columns because the existing
data layer maps such rows into a `Set` of enabled keys exactly like
`openStages = new Set(stages.filter((s) => s.open).map((s) => s.stage))`.

## Components & data flow

### Types (`src/lib/types.ts`)
```ts
export type AppSettingKey = "standings" | "results";
export type AppSetting = { key: AppSettingKey; enabled: boolean };
```

### Data layer (`src/lib/supabase-data.ts`)
- Add an `AppSettingRow = { key: AppSettingKey; enabled: boolean }` row type.
- Add `app_settings` to the parallel `Promise.all` load (`select("*").order("key")`).
- Add `mapAppSetting` and include `appSettings: AppSetting[]` in `SupabaseAppData`.

### Seed (`src/lib/seed.ts`)
```ts
export const appSettings: AppSetting[] = [
  { key: "standings", enabled: true },
  { key: "results", enabled: true },
];
```

### Server action (`src/app/actions.ts`)
`updateTabVisibilityAction({ key, enabled })`, mirroring `updateStageOpenAction`:
- `requireAdmin`.
- Upsert the row with `enabled`, `updated_at = now()`, `updated_by = admin.userId`.
- `revalidatePath("/")` and return an ok/message result.

### Context (`src/components/app-context.tsx`)
Add to `AppContextValue`:
```ts
standingsVisible: boolean;
resultsVisible: boolean;
updateTabVisibility: (key: AppSettingKey, enabled: boolean) => Promise<void> | void;
```

### App shell (`src/components/app-shell.tsx`)
- New state `appSettings`, fed from `loadSupabaseAppData` (and from seed otherwise).
- Derive `standingsVisible` / `resultsVisible` from `appSettings`
  (default `true` when a row is missing, so a fresh DB behaves like current).
- `updateTabVisibility(key, enabled)`: optimistic local state update, then call
  `updateTabVisibilityAction` and refresh on success — same shape as
  `updateStageOpen`.
- **URL guard**: extend the existing redirect `useEffect` (which already bounces
  non-admins off `/admin`). Add: if `activeTab === "leaderboard"` and not
  `standingsVisible`, or `activeTab === "results"` and not `resultsVisible`,
  `router.replace(tabRoutes.predictions)`. Applies to everyone, admins included.
- **Disabled nav button**: pass a `disabled` prop to the Tabla and Resultados
  `NavLink`s. When disabled the button is greyed and does not navigate.
- The mobile header "stats pill" links to `/tabla`; when standings is hidden it
  should not act as a shortcut into a blocked tab. Render it inert (plain
  span / no link) when `!standingsVisible`.

### NavLink (`src/components/app-shell.tsx`)
Accept an optional `disabled?: boolean`. When `true`, render with the muted/disabled
styling and skip the `router.push` / `onNavigate` on click (or use a disabled
`Button`).

### Admin panel (`src/screens/admin.tsx`)
Add a new aside `Card` titled **"Pestañas visibles"**, placed near the existing
"Etapas habilitadas" card. Two rows — Tabla and Resultados — each with a
Habilitar/Deshabilitar `Button` driven by `updateTabVisibility`, reusing the
`runAdminAction` + `LoadingLabel` pattern and the `stage-admin-row` styling.

## Error handling

- Reuses the existing `dataMessage` channel for action results (success/failure).
- Optimistic local toggle, reverted implicitly by `refreshSupabaseData` if the
  action fails (consistent with `updateStageOpen`).
- The URL guard guarantees that even if a stale client shows an enabled button, a
  direct visit to a disabled tab redirects.

## Testing

- Extract the visibility derivation into a small pure helper
  (e.g. `getTabVisibility(appSettings)` returning
  `{ standingsVisible, resultsVisible }` with `true` defaults) and unit-test it,
  including the missing-row default case. This is the only branch worth covering;
  the rest is thin wiring matching the established `stages` pattern.

## Out of scope

- No changes to predictions, scoring, or the Reglas tab.
- No per-user overrides; the toggles are global.
- No scheduling/auto-reveal; visibility is a manual admin action.
