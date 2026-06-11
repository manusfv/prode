# Mi cuenta: Profile Editing & Password Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let logged-in users edit their display name and password, and let locked-out users recover their password via an email link.

**Architecture:** A new `/cuenta` screen (gated inside `AppShell`) reachable only from the bottom `AccountPanel`. Name changes go through a security-definer Postgres RPC (`update_my_display_name`) wrapped by a server action, because RLS blocks self-updates of `profiles`. Password change (logged in) and the email-recovery reset both use `supabase.auth.updateUser` client-side. A standalone `/restablecer` page handles the post-email reset and bypasses the `AppShell` auth gate.

**Tech Stack:** Next.js 15 (App Router), React 19, Supabase (`@supabase/ssr`), Tailwind v4, shadcn-style UI components, Vitest.

---

## File Structure

| File | Responsibility | Create/Modify |
|---|---|---|
| `src/lib/account.ts` | Pure validation helpers (name, password change) | Create |
| `src/lib/account.test.ts` | Unit tests for helpers | Create |
| `docs/supabase-migration-account-display-name.sql` | `update_my_display_name` RPC | Create |
| `src/app/actions.ts` | Add `updateDisplayNameAction` | Modify |
| `src/screens/account.tsx` | "Mi cuenta" screen UI | Create |
| `src/app/cuenta/page.tsx` | Route wrapper for the screen | Create |
| `src/lib/ui-tokens.ts` | Add `account` to `AppRoute`/`pageTitles`/`tabRoutes` | Modify |
| `src/components/app-shell.tsx` | Route map, AccountPanel gateway, `/restablecer` gate bypass | Modify |
| `src/components/auth-screen.tsx` | "¿Olvidaste tu contraseña?" recover view | Modify |
| `src/app/restablecer/page.tsx` | Standalone reset-password page | Create |

---

## Task 1: Pure validation helpers

**Files:**
- Create: `src/lib/account.ts`
- Test: `src/lib/account.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/account.test.ts
import { describe, expect, it } from "vitest";

import { isValidDisplayName, validatePasswordChange, MIN_PASSWORD_LENGTH } from "./account";

describe("isValidDisplayName", () => {
  it("rejects empty and whitespace-only names", () => {
    expect(isValidDisplayName("")).toBe(false);
    expect(isValidDisplayName("   ")).toBe(false);
  });

  it("accepts a non-empty name", () => {
    expect(isValidDisplayName("Manu")).toBe(true);
    expect(isValidDisplayName("  Manu  ")).toBe(true);
  });
});

describe("validatePasswordChange", () => {
  it("rejects mismatched passwords", () => {
    const result = validatePasswordChange("abcdef", "abcdeX");
    expect(result.ok).toBe(false);
    expect(result.message).toBe("Las contraseñas no coinciden.");
  });

  it("rejects passwords shorter than the minimum", () => {
    const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    const result = validatePasswordChange(short, short);
    expect(result.ok).toBe(false);
    expect(result.message).toBe(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  });

  it("accepts a valid matching password", () => {
    const good = "a".repeat(MIN_PASSWORD_LENGTH);
    expect(validatePasswordChange(good, good)).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/account.test.ts`
Expected: FAIL — `account.ts` does not export these (module not found / undefined).

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/account.ts
export const MIN_PASSWORD_LENGTH = 6;

export function isValidDisplayName(name: string): boolean {
  return name.trim().length > 0;
}

export type ValidationResult = { ok: true } | { ok: false; message: string };

export function validatePasswordChange(password: string, confirm: string): ValidationResult {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }
  if (password !== confirm) {
    return { ok: false, message: "Las contraseñas no coinciden." };
  }
  return { ok: true };
}
```

Note: length is checked before match so a too-short password reports the length error first; the test uses equal short strings, so order is safe.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/account.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/account.ts src/lib/account.test.ts
git commit -m "feat(account): pure validation helpers for name and password"
```

---

## Task 2: Display-name RPC migration

**Files:**
- Create: `docs/supabase-migration-account-display-name.sql`

- [ ] **Step 1: Write the migration**

```sql
-- docs/supabase-migration-account-display-name.sql
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
```

- [ ] **Step 2: Apply it to Supabase**

Run the SQL in the Supabase SQL editor (or `psql`) for the project. This is a manual infra step — the function must exist before Task 3's action works at runtime, but the action code can be written/committed regardless.

- [ ] **Step 3: Commit**

```bash
git add docs/supabase-migration-account-display-name.sql
git commit -m "feat(db): add update_my_display_name RPC for self profile edits"
```

---

## Task 3: `updateDisplayNameAction` server action

**Files:**
- Modify: `src/app/actions.ts`

- [ ] **Step 1: Add the action**

Add this near the other profile-related actions (e.g. after `approveProfileAction`). It reuses the existing `createSupabaseServerClient`, `getCurrentUserId`, and `revalidatePath` already imported in the file. Add the `isValidDisplayName` import at the top.

At the top of `src/app/actions.ts`, add to the imports:

```typescript
import { isValidDisplayName } from "@/lib/account";
```

Then add the action:

```typescript
export async function updateDisplayNameAction(displayName: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Supabase no está configurado." };

  const user = await getCurrentUserId(supabase);
  if (!user.ok) return user;

  if (!isValidDisplayName(displayName)) {
    return { ok: false, message: "El nombre no puede estar vacío." };
  }

  const trimmed = displayName.trim();

  const { error: rpcError } = await supabase.rpc("update_my_display_name", { new_name: trimmed });
  if (rpcError) return { ok: false, message: rpcError.message };

  const { error: metaError } = await supabase.auth.updateUser({ data: { display_name: trimmed } });
  if (metaError) return { ok: false, message: metaError.message };

  revalidatePath("/");
  return { ok: true, message: "Nombre actualizado." };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/app/actions.ts
git commit -m "feat(account): updateDisplayNameAction via RPC + auth metadata sync"
```

---

## Task 4: Route plumbing for `/cuenta`

**Files:**
- Modify: `src/lib/ui-tokens.ts`
- Modify: `src/components/app-shell.tsx`

- [ ] **Step 1: Add `account` to route tokens**

In `src/lib/ui-tokens.ts`, extend `tabRoutes` and `pageTitles`:

```typescript
export const tabRoutes = {
  predictions: "/pronosticos",
  leaderboard: "/tabla",
  results: "/resultados",
  rules: "/reglas",
  admin: "/admin",
  account: "/cuenta",
} as const;
```

```typescript
export const pageTitles: Record<AppRoute, string> = {
  predictions: "Pronósticos",
  leaderboard: "Tabla familiar",
  results: "Resultados",
  rules: "Reglas",
  admin: "Panel admin",
  account: "Mi cuenta",
};
```

(`AppRoute` is `keyof typeof tabRoutes`, so it now includes `"account"` automatically.)

- [ ] **Step 2: Map the path in app-shell**

In `src/components/app-shell.tsx`, add `/cuenta` to the `routeTabs` map (around line 75):

```typescript
const routeTabs: Record<string, AppRoute> = {
  "/": "predictions",
  "/pronosticos": "predictions",
  "/tabla": "leaderboard",
  "/resultados": "results",
  "/reglas": "rules",
  "/admin": "admin",
  "/cuenta": "account",
};
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS. (No exhaustive switch over `AppRoute` exists elsewhere besides `pageTitles`, which we updated.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/ui-tokens.ts src/components/app-shell.tsx
git commit -m "feat(account): register /cuenta route and title"
```

---

## Task 5: "Mi cuenta" screen UI

**Files:**
- Create: `src/screens/account.tsx`
- Create: `src/app/cuenta/page.tsx`

- [ ] **Step 1: Create the screen component**

```tsx
// src/screens/account.tsx
"use client";

import { useState } from "react";

import { updateDisplayNameAction } from "@/app/actions";
import { LoadingLabel } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useApp } from "@/components/app-context";
import { validatePasswordChange } from "@/lib/account";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { ui } from "@/lib/ui-tokens";
import { cn } from "@/lib/utils";

export function AccountScreen() {
  const { currentUser, refreshSupabaseData } = useApp();

  const [name, setName] = useState(currentUser.displayName);
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState("");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");

  async function saveName() {
    if (savingName) return;
    setNameMessage("");
    setSavingName(true);
    try {
      const result = await updateDisplayNameAction(name);
      setNameMessage(result.message);
      if (result.ok) await refreshSupabaseData();
    } finally {
      setSavingName(false);
    }
  }

  async function savePassword() {
    if (savingPassword) return;
    setPasswordMessage("");

    const validation = validatePasswordChange(password, confirm);
    if (!validation.ok) {
      setPasswordMessage(validation.message);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setPasswordMessage("Supabase no está configurado.");
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setPasswordMessage(error.message);
        return;
      }
      setPassword("");
      setConfirm("");
      setPasswordMessage("Contraseña actualizada.");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="grid max-w-xl gap-5">
      <Card className={cn(ui.panel, "grid gap-4 p-4")}>
        <div>
          <h2 className="m-0 text-lg font-black">Datos del perfil</h2>
          <p className="mt-1 text-sm text-app-muted">Cambiá cómo te ven en el prode.</p>
        </div>
        <label className="grid gap-2">
          <span className={ui.label}>Nombre</span>
          <Input
            type="text"
            className="min-h-11 rounded-lg border-app-line bg-app-surface px-3 text-base font-bold text-app-text"
            value={name}
            disabled={savingName}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="grid gap-2">
          <span className={ui.label}>Email</span>
          <Input
            type="email"
            className="min-h-11 rounded-lg border-app-line bg-app-surface-2 px-3 text-base font-bold text-app-muted"
            value={currentUser.email}
            readOnly
            disabled
          />
        </label>
        <Button className="justify-self-start" disabled={savingName} onClick={saveName}>
          <LoadingLabel loading={savingName} label="Guardar" />
        </Button>
        {nameMessage && <small className="text-sm font-bold text-app-muted">{nameMessage}</small>}
      </Card>

      <Card className={cn(ui.panel, "grid gap-4 p-4")}>
        <div>
          <h2 className="m-0 text-lg font-black">Contraseña</h2>
          <p className="mt-1 text-sm text-app-muted">Elegí una contraseña nueva.</p>
        </div>
        <label className="grid gap-2">
          <span className={ui.label}>Nueva contraseña</span>
          <Input
            type="password"
            className="min-h-11 rounded-lg border-app-line bg-app-surface px-3 text-base font-bold text-app-text"
            value={password}
            disabled={savingPassword}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label className="grid gap-2">
          <span className={ui.label}>Confirmar contraseña</span>
          <Input
            type="password"
            className="min-h-11 rounded-lg border-app-line bg-app-surface px-3 text-base font-bold text-app-text"
            value={confirm}
            disabled={savingPassword}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </label>
        <Button className="justify-self-start" disabled={savingPassword} onClick={savePassword}>
          <LoadingLabel loading={savingPassword} label="Cambiar contraseña" />
        </Button>
        {passwordMessage && <small className="text-sm font-bold text-app-muted">{passwordMessage}</small>}
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Sanity-check the context hook**

The hook is `useApp` (from `src/components/app-context.tsx`), and `AppContextValue` includes `currentUser: Profile` and `refreshSupabaseData: () => Promise<void> | void`. No change needed — just confirm the import matches.

- [ ] **Step 3: Create the route wrapper**

```tsx
// src/app/cuenta/page.tsx
import { AccountScreen } from "@/screens/account";

export default function Page() {
  return <AccountScreen />;
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/account.tsx src/app/cuenta/page.tsx
git commit -m "feat(account): Mi cuenta screen with name and password editing"
```

---

## Task 6: AccountPanel gateway link

**Files:**
- Modify: `src/components/app-shell.tsx`

- [ ] **Step 1: Make the AccountPanel name/email block navigate to `/cuenta`**

In `AccountPanel` (near the bottom of `app-shell.tsx`), the component currently renders a static name/email block. Add `useRouter` usage and an `onNavigate` passthrough, then turn the block into a button. `useRouter` is already imported at the top of the file.

Replace the name/email `<div>`:

```tsx
      <div>
        <strong className="block truncate text-sm font-black leading-tight">{currentUser.displayName}</strong>
        <small className="mt-0.5 block truncate text-xs font-bold text-app-muted">{currentUser.email}</small>
      </div>
```

with a button that navigates:

```tsx
      <button
        type="button"
        className="grid gap-0.5 rounded-md p-1 text-left transition-colors hover:bg-app-surface-2"
        onClick={() => {
          router.push(tabRoutes.account);
          onNavigate?.();
        }}
        aria-label="Editar mi cuenta"
      >
        <strong className="block truncate text-sm font-black leading-tight">{currentUser.displayName}</strong>
        <small className="mt-0.5 block truncate text-xs font-bold text-app-muted">{currentUser.email}</small>
        <span className="mt-0.5 text-xs font-bold text-app-brand">Editar perfil</span>
      </button>
```

- [ ] **Step 2: Thread `router` and `onNavigate` into `AccountPanel`**

Update the `AccountPanel` function signature and body. Add `onNavigate` to its props and call `useRouter` inside:

```tsx
function AccountPanel({
  currentUser,
  theme,
  onThemeChange,
  onSignOut,
  onNavigate,
}: {
  currentUser: Profile;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onSignOut: () => Promise<void> | void;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
```

- [ ] **Step 3: Pass `onNavigate` from `SidebarContent`**

In `SidebarContent`, the existing `<AccountPanel ... />` call (last line before the closing fragment) should forward the existing `onNavigate` prop already in `SidebarContentProps`:

```tsx
      <AccountPanel currentUser={currentUser} theme={theme} onThemeChange={onThemeChange} onSignOut={onSignOut} onNavigate={onNavigate} />
```

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/app-shell.tsx
git commit -m "feat(account): link to Mi cuenta from the sidebar account panel"
```

---

## Task 7: Password-recovery trigger in AuthScreen

**Files:**
- Modify: `src/components/auth-screen.tsx`
- Modify: `src/components/app-shell.tsx`

- [ ] **Step 1: Add a recover handler in app-shell and pass it down**

In `app-shell.tsx`, add a handler near `submitAuth`:

```tsx
  async function sendPasswordReset() {
    const supabase = createSupabaseBrowserClient();
    if (!supabase || !authEmail) {
      setAuthMessage("Ingresá tu email para recuperar la contraseña.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(authEmail, {
      redirectTo: `${window.location.origin}/auth/callback?next=/restablecer`,
    });
    if (error) {
      setAuthMessage(error.message);
      return;
    }
    setAuthMessage("Si el email existe, te enviamos un enlace para restablecer la contraseña.");
  }
```

Pass `onRecoverPassword={sendPasswordReset}` to the `<AuthScreen>` usages for the **not-logged-in** state (the `if (!currentUser)` block and the `!supabaseEnabled` block). Do NOT add it to the pending-approval block.

- [ ] **Step 2: Render the link in AuthScreen**

In `auth-screen.tsx`, add `onRecoverPassword?: () => Promise<void> | void;` to the `AuthScreen` props type and destructure it. Then, below the submit `Button` and only in `login` mode, add:

```tsx
              {authMode === "login" && onRecoverPassword && (
                <button
                  type="button"
                  className="mt-1 justify-self-start text-left text-xs font-bold text-app-brand hover:underline"
                  onClick={() => onRecoverPassword()}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              )}
```

Place it inside the `grid gap-4` container, right after the submit `<Button>`.

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/auth-screen.tsx src/components/app-shell.tsx
git commit -m "feat(account): forgot-password email link from login screen"
```

---

## Task 8: Standalone `/restablecer` reset page + AppShell bypass

**Files:**
- Create: `src/app/restablecer/page.tsx`
- Modify: `src/components/app-shell.tsx`

- [ ] **Step 1: Bypass the AppShell gate for `/restablecer`**

In `AppShell` (`app-shell.tsx`), right after `const activeTab = activeTabFromPath(pathname);` add an early signal, and before the auth gates (`if (!authReady) ...`) return children directly for this path. Place this block immediately before `if (!authReady) {`:

```tsx
  if (pathname === "/restablecer") {
    return <>{children}</>;
  }
```

This renders the reset page without the login/approval gate. `pathname` is already available from `usePathname()`.

- [ ] **Step 2: Create the reset page**

```tsx
// src/app/restablecer/page.tsx
"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { LoadingLabel } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { validatePasswordChange } from "@/lib/account";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { ui } from "@/lib/ui-tokens";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    if (saving) return;
    setMessage("");

    const validation = validatePasswordChange(password, confirm);
    if (!validation.ok) {
      setMessage(validation.message);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase no está configurado.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMessage(error.message);
        return;
      }
      router.replace("/");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-app-bg p-4 text-app-text sm:p-8">
      <Card className="w-full max-w-md rounded-lg border border-app-line bg-app-panel-strong p-6 shadow-app sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="brand-mark size-12 border-app-line bg-white shadow-sm" aria-hidden="true">
            <Image className="size-full object-contain" src="/favicon.svg" alt="" width={455} height={701} priority />
          </span>
          <div>
            <strong className="block text-xl font-black leading-tight text-app-text">Prode Carbia</strong>
            <small className="block text-xs font-black uppercase tracking-wide text-app-brand">Restablecer contraseña</small>
          </div>
        </div>
        <h1 className="mb-2 text-2xl font-black leading-tight text-app-text">Elegí una contraseña nueva</h1>
        <p className="mb-6 text-sm font-bold leading-relaxed text-app-muted">Ingresá tu nueva contraseña para volver a entrar.</p>
        <div className="grid gap-4">
          <label className="grid gap-2">
            <span className={ui.label}>Nueva contraseña</span>
            <Input
              type="password"
              className="min-h-12 rounded-lg border-app-line bg-app-surface px-3 text-base font-bold text-app-text"
              value={password}
              disabled={saving}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label className="grid gap-2">
            <span className={ui.label}>Confirmar contraseña</span>
            <Input
              type="password"
              className="min-h-12 rounded-lg border-app-line bg-app-surface px-3 text-base font-bold text-app-text"
              value={confirm}
              disabled={saving}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </label>
          <Button className="mt-2 min-h-12 rounded-lg bg-app-brand text-app-brand-fg text-base font-black" disabled={saving} onClick={submit}>
            <LoadingLabel loading={saving} label="Guardar contraseña" />
          </Button>
          {message && <small className="text-sm font-bold text-app-muted">{message}</small>}
        </div>
      </Card>
    </main>
  );
}
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/restablecer/page.tsx src/components/app-shell.tsx
git commit -m "feat(account): standalone /restablecer reset page outside auth gate"
```

---

## Task 9: Full verification

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS (existing tests + new `account.test.ts`).

- [ ] **Step 2: Type-check + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: All PASS.

- [ ] **Step 3: Manual smoke checklist**

Confirm the `update_my_display_name` RPC from Task 2 is applied in Supabase, then with `npm run dev`:
- Log in → bottom AccountPanel shows "Editar perfil" → click → `/cuenta` loads.
- Change name → "Nombre actualizado." → name updates in sidebar/header after refresh.
- Change password → "Contraseña actualizada." → log out, log in with the new password.
- On login screen → "¿Olvidaste tu contraseña?" with an email → success message; email arrives; link lands on `/restablecer`; set new password → redirected to app; log in with it.

- [ ] **Step 4: No commit** (verification only)

---

## Self-Review Notes

- **Spec coverage:** name edit (Tasks 2–5), password change logged-in (Task 5), recovery email (Task 7) + reset page (Task 8), AccountPanel-as-gateway (Task 6), `/restablecer` gate bypass (Task 8), read-only email (Task 5), shared validation helpers (Task 1). All spec sections mapped.
- **Naming consistency:** `updateDisplayNameAction`, `update_my_display_name(new_name)`, `validatePasswordChange`, `isValidDisplayName`, `MIN_PASSWORD_LENGTH`, `tabRoutes.account`, `onRecoverPassword`, `onNavigate` are used identically across tasks.
- **Context hook confirmed:** `useApp` (from `src/components/app-context.tsx`) exposes `currentUser: Profile` and `refreshSupabaseData`. All file contents referenced are verified against the codebase.
