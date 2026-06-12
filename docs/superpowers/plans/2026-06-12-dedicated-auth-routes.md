# Dedicated Auth Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give login, sign up, and password recovery their own URLs (`/ingresar`, `/crear-cuenta`, `/recuperar`), with recovery as a dedicated email-entry screen, and turn `AppShell` into a redirecting auth gate.

**Architecture:** Three new client route pages plus the existing `/restablecer` share an extracted `AuthLayout` card shell. `AppShell` stops rendering the login form; instead it treats the four auth paths as public, redirects unauthenticated visitors to `/ingresar`, subscribes to Supabase `onAuthStateChange` so standalone pages update the shell reactively, and shows a `PendingApproval` screen for logged-in-but-unapproved users.

**Tech Stack:** Next.js 15 App Router (client components), Supabase JS auth, Tailwind v4, Vitest.

---

## File Structure

- Create `src/components/auth/auth-layout.tsx` — `AuthLayout` card shell, `ThemePicker`, `authInputClass` const.
- Create `src/components/auth/loading-screen.tsx` — `LoadingScreen` (moved from `auth-screen.tsx`).
- Create `src/components/auth/pending-approval.tsx` — `PendingApproval` (extracted from `AuthScreen`'s pending branch).
- Create `src/app/ingresar/page.tsx` — login page.
- Create `src/app/crear-cuenta/page.tsx` — signup page.
- Create `src/app/recuperar/page.tsx` — password-recovery email screen.
- Modify `src/app/restablecer/page.tsx` — migrate onto `AuthLayout`.
- Modify `src/components/app-shell.tsx` — auth gate, redirect effects, `onAuthStateChange` subscription; remove the auth form.
- Delete `src/components/auth-screen.tsx` — contents redistributed.
- Modify `src/lib/account.ts` — `validateLogin`, `validateSignup`.
- Modify `src/lib/account.test.ts` — tests for the two helpers.

**Important nuance (drives Task 6):** the password-reset email link lands on `/restablecer` **already signed in** (the `/auth/callback` route exchanges the code for a session first). Therefore the "redirect signed-in users off auth routes" rule must apply only to `/ingresar`, `/crear-cuenta`, `/recuperar` — **never** `/restablecer`, or the reset flow breaks. Two sets are used: `PUBLIC_AUTH_ROUTES` (all four, render standalone) and `REDIRECT_WHEN_AUTHED` (the three, bounce signed-in users to `/pronosticos`).

**Navigation model:** the login/signup/recover pages do **not** call `router` themselves. On successful sign-in the `onAuthStateChange` subscription updates `AppShell`'s `currentUser`, and `AppShell`'s redirect effect moves the user off the auth route. This avoids a navigate-before-data race. Only `/restablecer` keeps its own `router.replace("/")` (unchanged).

---

## Task 1: Validation helpers

**Files:**
- Modify: `src/lib/account.ts`
- Test: `src/lib/account.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/account.test.ts`:

```ts
import { isValidDisplayName, validateLogin, validatePasswordChange, validateSignup, MIN_PASSWORD_LENGTH } from "./account";

describe("validateLogin", () => {
  it("rejects an empty email", () => {
    const result = validateLogin("   ", "abcdef");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("Ingresá tu email.");
  });

  it("rejects an empty password", () => {
    const result = validateLogin("a@b.com", "");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("Ingresá tu contraseña.");
  });

  it("accepts email and password present", () => {
    expect(validateLogin("a@b.com", "abcdef")).toEqual({ ok: true });
  });
});

describe("validateSignup", () => {
  it("rejects an empty email", () => {
    const result = validateSignup("Manu", "  ", "abcdef", "abcdef");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("Ingresá tu email.");
  });

  it("rejects mismatched passwords", () => {
    const result = validateSignup("Manu", "a@b.com", "abcdef", "abcdeX");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("Las contraseñas no coinciden.");
  });

  it("rejects passwords shorter than the minimum", () => {
    const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    const result = validateSignup("Manu", "a@b.com", short, short);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    }
  });

  it("accepts a valid signup (name optional)", () => {
    const good = "a".repeat(MIN_PASSWORD_LENGTH);
    expect(validateSignup("", "a@b.com", good, good)).toEqual({ ok: true });
  });
});
```

Note: the existing top-of-file import line `import { isValidDisplayName, validatePasswordChange, MIN_PASSWORD_LENGTH } from "./account";` already exists — replace it with the expanded import shown above (which adds `validateLogin`, `validateSignup`) rather than adding a duplicate import.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/account.test.ts`
Expected: FAIL — `validateLogin`/`validateSignup` are not exported (TypeScript/import error).

- [ ] **Step 3: Implement the helpers**

Append to `src/lib/account.ts`:

```ts
export function validateLogin(email: string, password: string): ValidationResult {
  if (!email.trim()) {
    return { ok: false, message: "Ingresá tu email." };
  }
  if (!password) {
    return { ok: false, message: "Ingresá tu contraseña." };
  }
  return { ok: true };
}

export function validateSignup(
  _name: string,
  email: string,
  password: string,
  confirm: string,
): ValidationResult {
  if (!email.trim()) {
    return { ok: false, message: "Ingresá tu email." };
  }
  return validatePasswordChange(password, confirm);
}
```

(The name is optional — it defaults to the email prefix at the call site — so it is accepted but not validated. The `_name` prefix documents that.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/account.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/account.ts src/lib/account.test.ts
git commit -m "feat(account): validateLogin and validateSignup helpers"
```

---

## Task 2: Shared auth UI components

Create three presentational components reused by the pages and the shell. These are additive — nothing imports them yet, so the build stays green.

**Files:**
- Create: `src/components/auth/auth-layout.tsx`
- Create: `src/components/auth/loading-screen.tsx`
- Create: `src/components/auth/pending-approval.tsx`

- [ ] **Step 1: Create `src/components/auth/auth-layout.tsx`**

```tsx
"use client";

import Image from "next/image";
import { Monitor, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ui } from "@/lib/ui-tokens";
import { useTheme, type Theme } from "@/lib/use-theme";
import { cn } from "@/lib/utils";

export const authInputClass =
  "min-h-12 rounded-lg border-app-line bg-app-surface px-3 text-base font-bold text-app-text placeholder:text-app-muted";

export function ThemePicker({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  const themeLabels: Record<Theme, string> = {
    light: "Claro",
    dark: "Oscuro",
    system: "Sistema",
  };

  return (
    <Select value={theme} onValueChange={(value) => onChange(value as Theme)}>
      <SelectTrigger className={cn(ui.control, "w-full justify-start border-app-brand")} aria-label="Tema">
        {theme === "light" && <Sun size={15} />}
        {theme === "dark" && <Moon size={15} />}
        {theme === "system" && <Monitor size={15} />}
        <SelectValue>{themeLabels[theme]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="light"><Sun size={15} /> Claro</SelectItem>
        <SelectItem value="dark"><Moon size={15} /> Oscuro</SelectItem>
        <SelectItem value="system"><Monitor size={15} /> Sistema</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function AuthLayout({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  const [theme, setTheme] = useTheme();

  return (
    <main className="grid min-h-screen place-items-center bg-app-bg p-4 text-app-text sm:p-8">
      <Card className="w-full max-w-md rounded-lg border border-app-line bg-app-panel-strong p-6 shadow-app sm:p-8">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="brand-mark size-12 border-app-line bg-white shadow-sm" aria-hidden="true">
              <Image className="size-full object-contain" src="/favicon.svg" alt="" width={455} height={701} priority />
            </span>
            <div>
              <strong className="block text-xl font-black leading-tight text-app-text">Prode Carbia</strong>
              <small className="block text-xs font-black uppercase tracking-wide text-app-brand">{eyebrow}</small>
            </div>
          </div>
          <div className="w-32">
            <ThemePicker theme={theme} onChange={setTheme} />
          </div>
        </div>
        {children}
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Create `src/components/auth/loading-screen.tsx`**

```tsx
"use client";

import Image from "next/image";

import { Card } from "@/components/ui/card";

export function LoadingScreen() {
  return (
    <main className="login-shell grid min-h-screen place-items-center p-4 sm:p-7">
      <Card className="login-panel loading-panel">
        <div className="brand login-brand">
          <span className="brand-mark" aria-hidden="true">
            <Image className="size-full object-contain" src="/favicon.svg" alt="" width={455} height={701} priority />
          </span>
          <div>
            <strong>Prode Carbia</strong>
            <small>Familia · 2026</small>
          </div>
        </div>
        <div className="loading-line" />
      </Card>
    </main>
  );
}
```

- [ ] **Step 3: Create `src/components/auth/pending-approval.tsx`**

```tsx
"use client";

import { RefreshCcw } from "lucide-react";
import { useState } from "react";

import { AuthLayout } from "@/components/auth/auth-layout";
import { LoadingLabel } from "@/components/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function PendingApproval({
  message,
  onRefresh,
  onSignOut,
}: {
  message: string;
  onRefresh?: () => Promise<void> | void;
  onSignOut?: () => Promise<void> | void;
}) {
  const [pending, setPending] = useState<"refresh" | "signout" | null>(null);

  async function run(action: "refresh" | "signout", callback?: () => Promise<void> | void) {
    if (!callback || pending) return;
    setPending(action);
    try {
      await callback();
    } finally {
      setPending(null);
    }
  }

  return (
    <AuthLayout eyebrow="Mundial 2026">
      <div className="rounded-lg border border-app-line bg-app-surface-2 p-5">
        <Badge variant="outline" className="status-chip locked">Pendiente</Badge>
        <h1 className="mb-3 mt-5 text-3xl font-black leading-tight text-app-text">Tu cuenta está esperando aprobación</h1>
        <p className="mb-6 text-sm font-bold leading-relaxed text-app-muted">{message}</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button disabled={Boolean(pending)} onClick={() => run("refresh", onRefresh)}>
            <LoadingLabel loading={pending === "refresh"} icon={<RefreshCcw size={16} />} label="Revisar aprobación" />
          </Button>
          <Button variant="outline" disabled={Boolean(pending)} onClick={() => run("signout", onSignOut)}>
            <LoadingLabel loading={pending === "signout"} label="Salir" />
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no errors). The new files are not yet imported anywhere, which is fine.

- [ ] **Step 5: Commit**

```bash
git add src/components/auth/auth-layout.tsx src/components/auth/loading-screen.tsx src/components/auth/pending-approval.tsx
git commit -m "feat(auth): shared AuthLayout, LoadingScreen, PendingApproval components"
```

---

## Task 3: Login page `/ingresar`

**Files:**
- Create: `src/app/ingresar/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";

import { AuthLayout, authInputClass } from "@/components/auth/auth-layout";
import { LoadingLabel } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateLogin } from "@/lib/account";
import { createSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase";

export default function LoginPage() {
  const supabaseEnabled = hasSupabaseConfig();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    if (submitting) return;
    setMessage("");

    const validation = validateLogin(email, password);
    if (!validation.ok) {
      setMessage(validation.message);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase no está configurado.");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage(error.message);
        return;
      }
      // Success: AppShell's auth-state subscription loads the profile and its
      // redirect effect moves us off this route. Keep the button busy meanwhile.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout eyebrow="Mundial 2026">
      <h1 className="mb-2 text-3xl font-black leading-tight text-app-text">Entrá al prode</h1>
      <p className="mb-6 text-sm font-bold leading-relaxed text-app-muted">
        {supabaseEnabled
          ? "Usá email y contraseña para entrar al prode familiar."
          : "Configurá NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY."}
      </p>
      <div className="grid gap-4">
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-wide text-app-muted">Email</span>
          <Input
            type="email"
            placeholder="tu@email.com"
            className={authInputClass}
            disabled={submitting || !supabaseEnabled}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-wide text-app-muted">Contraseña</span>
          <Input
            type="password"
            placeholder="Ingresá tu contraseña"
            className={authInputClass}
            disabled={submitting || !supabaseEnabled}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <Button
          className="mt-2 min-h-12 rounded-lg bg-app-brand text-app-brand-fg text-base font-black shadow-lg hover:bg-app-brand"
          disabled={submitting || !supabaseEnabled}
          onClick={submit}
        >
          <LoadingLabel loading={submitting} label="Entrar" />
        </Button>
        <Link href="/recuperar" className="mt-1 justify-self-start text-xs font-bold text-app-brand hover:underline">
          ¿Olvidaste tu contraseña?
        </Link>
      </div>
      <p className="mt-6 text-sm font-bold text-app-muted">
        ¿No tenés cuenta?{" "}
        <Link href="/crear-cuenta" className="text-app-brand hover:underline">Crear cuenta</Link>
      </p>
      {message && <small className="auth-message">{message}</small>}
    </AuthLayout>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Manual smoke (optional but recommended)**

Run: `npm run dev`, open `http://localhost:3000/ingresar`.
Expected: the login card renders with email/password fields, a "Crear cuenta" link, and a "¿Olvidaste tu contraseña?" link. (Full sign-in is verified end-to-end after Task 6.)

- [ ] **Step 4: Commit**

```bash
git add src/app/ingresar/page.tsx
git commit -m "feat(auth): dedicated /ingresar login page"
```

---

## Task 4: Signup page `/crear-cuenta`

**Files:**
- Create: `src/app/crear-cuenta/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";

import { AuthLayout, authInputClass } from "@/components/auth/auth-layout";
import { LoadingLabel } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateSignup } from "@/lib/account";
import { createSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase";

export default function SignupPage() {
  const supabaseEnabled = hasSupabaseConfig();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    if (submitting) return;
    setMessage("");

    const validation = validateSignup(name, email, password, confirm);
    if (!validation.ok) {
      setMessage(validation.message);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase no está configurado.");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: name || email.split("@")[0] } },
      });
      if (error) {
        setMessage(error.message);
        return;
      }
      // If Supabase creates a session immediately, AppShell redirects to the
      // pending screen. If email confirmation is required, this message stays.
      setMessage("Cuenta creada. Te vamos a aprobar para participar.");
      setPassword("");
      setConfirm("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout eyebrow="Mundial 2026">
      <h1 className="mb-2 text-3xl font-black leading-tight text-app-text">Creá tu cuenta</h1>
      <p className="mb-6 text-sm font-bold leading-relaxed text-app-muted">
        {supabaseEnabled
          ? "Registrate con email y contraseña para participar del prode familiar."
          : "Configurá NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY."}
      </p>
      <div className="grid gap-4">
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-wide text-app-muted">Nombre</span>
          <Input
            type="text"
            placeholder="Tu nombre"
            className={authInputClass}
            disabled={submitting || !supabaseEnabled}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-wide text-app-muted">Email</span>
          <Input
            type="email"
            placeholder="tu@email.com"
            className={authInputClass}
            disabled={submitting || !supabaseEnabled}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-wide text-app-muted">Contraseña</span>
          <Input
            type="password"
            placeholder="Ingresá tu contraseña"
            className={authInputClass}
            disabled={submitting || !supabaseEnabled}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-wide text-app-muted">Confirmar contraseña</span>
          <Input
            type="password"
            placeholder="Repetí tu contraseña"
            className={authInputClass}
            disabled={submitting || !supabaseEnabled}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </label>
        <Button
          className="mt-2 min-h-12 rounded-lg bg-app-brand text-app-brand-fg text-base font-black shadow-lg hover:bg-app-brand"
          disabled={submitting || !supabaseEnabled}
          onClick={submit}
        >
          <LoadingLabel loading={submitting} label="Crear cuenta" />
        </Button>
      </div>
      <p className="mt-6 text-sm font-bold text-app-muted">
        ¿Ya tenés cuenta?{" "}
        <Link href="/ingresar" className="text-app-brand hover:underline">Entrar</Link>
      </p>
      {message && <small className="auth-message">{message}</small>}
    </AuthLayout>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/crear-cuenta/page.tsx
git commit -m "feat(auth): dedicated /crear-cuenta signup page"
```

---

## Task 5: Password recovery page `/recuperar`

**Files:**
- Create: `src/app/recuperar/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";

import { AuthLayout, authInputClass } from "@/components/auth/auth-layout";
import { LoadingLabel } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase";

export default function RecoverPage() {
  const supabaseEnabled = hasSupabaseConfig();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    if (submitting) return;
    setMessage("");

    if (!email.trim()) {
      setMessage("Ingresá tu email para recuperar la contraseña.");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase no está configurado.");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/restablecer`,
      });
      if (error) {
        setMessage(error.message);
        return;
      }
      setSent(true);
      setMessage("Si el email existe, te enviamos un enlace para restablecer la contraseña.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout eyebrow="Recuperar contraseña">
      <h1 className="mb-2 text-3xl font-black leading-tight text-app-text">Recuperá tu contraseña</h1>
      <p className="mb-6 text-sm font-bold leading-relaxed text-app-muted">
        {supabaseEnabled
          ? "Ingresá tu email y te enviamos un enlace para restablecerla."
          : "Configurá NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY."}
      </p>
      <div className="grid gap-4">
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-wide text-app-muted">Email</span>
          <Input
            type="email"
            placeholder="tu@email.com"
            className={authInputClass}
            disabled={submitting || sent || !supabaseEnabled}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <Button
          className="mt-2 min-h-12 rounded-lg bg-app-brand text-app-brand-fg text-base font-black shadow-lg hover:bg-app-brand"
          disabled={submitting || sent || !supabaseEnabled}
          onClick={submit}
        >
          <LoadingLabel loading={submitting} label="Enviar enlace" />
        </Button>
      </div>
      <p className="mt-6 text-sm font-bold text-app-muted">
        <Link href="/ingresar" className="text-app-brand hover:underline">Volver a entrar</Link>
      </p>
      {message && <small className="auth-message">{message}</small>}
    </AuthLayout>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/recuperar/page.tsx
git commit -m "feat(auth): dedicated /recuperar password-recovery screen"
```

---

## Task 6: AppShell auth gate + cutover

This is the cutover: `AppShell` becomes a redirecting gate, subscribes to auth changes, uses the new components, and the old `auth-screen.tsx` is deleted. `/restablecer` migrates onto `AuthLayout`. Apply each edit below in order.

**Files:**
- Modify: `src/components/app-shell.tsx`
- Modify: `src/app/restablecer/page.tsx`
- Delete: `src/components/auth-screen.tsx`

- [ ] **Step 1: Swap the auth-screen import in `app-shell.tsx`**

In `src/components/app-shell.tsx`, replace this import (currently around line 78):

```tsx
import { AuthScreen, LoadingScreen } from "./auth-screen";
```

with:

```tsx
import { LoadingScreen } from "@/components/auth/loading-screen";
import { PendingApproval } from "@/components/auth/pending-approval";
```

- [ ] **Step 2: Add the route-set constants in `app-shell.tsx`**

Just below the existing `routeTabs` / `activeTabFromPath` block (after the `activeTabFromPath` function, before `export function AppShell`), add:

```tsx
// Paths that render their own standalone card with no app chrome.
const PUBLIC_AUTH_ROUTES = new Set(["/ingresar", "/crear-cuenta", "/recuperar", "/restablecer"]);
// Signed-in users are bounced away from these to the app. NOTE: /restablecer is
// intentionally excluded — the reset email link lands there already signed in.
const REDIRECT_WHEN_AUTHED = new Set(["/ingresar", "/crear-cuenta", "/recuperar"]);
```

- [ ] **Step 3: Remove the dead auth-form state**

In the `AppShell` component body, delete these six state declarations (currently lines ~122-127):

```tsx
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authName, setAuthName] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
```

Keep `dataMessage`, `authReady`, `saveState`, `theme`, etc. (`theme`/`setTheme` are still used by the main app sidebar, so leave them.)

- [ ] **Step 4: Remove the `submitAuth` and `sendPasswordReset` handlers**

Delete the entire `async function submitAuth() { … }` block (currently lines ~205-232) and the entire `async function sendPasswordReset() { … }` block (currently lines ~234-248). The pages own these flows now.

- [ ] **Step 5: Add the auth-state subscription effect**

Immediately after the existing initial-load effect (the one ending `}, [refreshSupabaseData, supabaseEnabled]);`, around line 196), add:

```tsx
  useEffect(() => {
    if (!supabaseEnabled) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        // Defer the data reload out of the callback to avoid Supabase's
        // "do not await inside onAuthStateChange" deadlock.
        setTimeout(() => {
          void refreshSupabaseData();
        }, 0);
      }
    });
    return () => subscription.unsubscribe();
  }, [supabaseEnabled, refreshSupabaseData]);
```

- [ ] **Step 6: Add the redirect effect**

Replace the existing admin-guard effect (currently lines ~198-203):

```tsx
  useEffect(() => {
    if (!currentUser) return;
    if (activeTab === "admin" && !isAdmin) {
      router.replace(tabRoutes.predictions);
    }
  }, [activeTab, currentUser, isAdmin, router]);
```

with the combined redirect effect:

```tsx
  useEffect(() => {
    if (!currentUser) return;
    if (activeTab === "admin" && !isAdmin) {
      router.replace(tabRoutes.predictions);
    }
  }, [activeTab, currentUser, isAdmin, router]);

  useEffect(() => {
    if (!authReady) return;
    const signedIn = supabaseEnabled && Boolean(currentUser);
    if (!signedIn && !PUBLIC_AUTH_ROUTES.has(pathname)) {
      router.replace("/ingresar");
    } else if (signedIn && REDIRECT_WHEN_AUTHED.has(pathname)) {
      router.replace(tabRoutes.predictions);
    }
  }, [authReady, supabaseEnabled, currentUser, pathname, router]);
```

- [ ] **Step 7: Replace the render gate**

Replace the whole block that currently starts at `if (pathname === "/restablecer") {` and runs through the end of the `if (!currentUser.approved) { … }` block (currently lines ~525-602) with:

```tsx
  // Public auth pages render their own standalone card.
  if (PUBLIC_AUTH_ROUTES.has(pathname)) {
    return <>{children}</>;
  }

  if (!authReady) {
    return <LoadingScreen />;
  }

  // Not signed in (or Supabase unconfigured): the redirect effect sends the
  // user to /ingresar; show the loader while it happens.
  if (!supabaseEnabled || !currentUser) {
    return <LoadingScreen />;
  }

  if (!currentUser.approved) {
    return (
      <PendingApproval
        message={dataMessage || "Tu usuario está pendiente de aprobación."}
        onRefresh={refreshSupabaseData}
        onSignOut={signOut}
      />
    );
  }
```

- [ ] **Step 8: Migrate `/restablecer` onto `AuthLayout`**

Replace the entire contents of `src/app/restablecer/page.tsx` with:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthLayout, authInputClass } from "@/components/auth/auth-layout";
import { LoadingLabel } from "@/components/badges";
import { Button } from "@/components/ui/button";
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
    <AuthLayout eyebrow="Restablecer contraseña">
      <h1 className="mb-2 text-2xl font-black leading-tight text-app-text">Elegí una contraseña nueva</h1>
      <p className="mb-6 text-sm font-bold leading-relaxed text-app-muted">Ingresá tu nueva contraseña para volver a entrar.</p>
      <div className="grid gap-4">
        <label className="grid gap-2">
          <span className={ui.label}>Nueva contraseña</span>
          <Input
            type="password"
            className={authInputClass}
            value={password}
            disabled={saving}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label className="grid gap-2">
          <span className={ui.label}>Confirmar contraseña</span>
          <Input
            type="password"
            className={authInputClass}
            value={confirm}
            disabled={saving}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </label>
        <Button
          className="mt-2 min-h-12 rounded-lg bg-app-brand text-app-brand-fg text-base font-black"
          disabled={saving}
          onClick={submit}
        >
          <LoadingLabel loading={saving} label="Guardar contraseña" />
        </Button>
        {message && <small className="text-sm font-bold text-app-muted">{message}</small>}
      </div>
    </AuthLayout>
  );
}
```

- [ ] **Step 9: Delete the obsolete `auth-screen.tsx`**

```bash
git rm src/components/auth-screen.tsx
```

- [ ] **Step 10: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS. If `tsc` reports an unused import/variable in `app-shell.tsx` (e.g. a now-unused icon import that was only used by the old auth form, or `setTheme` if it became unused — it should still be used by the sidebar), remove the genuinely-unused symbol and re-run. Do **not** remove anything still referenced by the main app shell.

- [ ] **Step 11: Build**

Run: `npm run build`
Expected: PASS — `/ingresar`, `/crear-cuenta`, `/recuperar`, and `/restablecer` all appear in the route list.

- [ ] **Step 12: Manual end-to-end smoke (recommended)**

Run: `npm run dev` and verify against a configured Supabase env:
1. Visiting any protected path (e.g. `/pronosticos`) while logged out redirects to `/ingresar`.
2. Logging in at `/ingresar` lands on `/pronosticos` (no bounce back to login).
3. `/crear-cuenta` creates an account and shows the approval message (or the pending screen if a session was created).
4. `/recuperar` accepts an email and shows the "te enviamos un enlace" confirmation.
5. Following a reset link reaches `/restablecer` (signed in) and is **not** bounced away; saving a new password returns to the app.
6. While logged in, visiting `/ingresar` redirects to `/pronosticos`.

- [ ] **Step 13: Commit**

```bash
git add src/components/app-shell.tsx src/app/restablecer/page.tsx
git commit -m "feat(auth): AppShell auth gate with dedicated route redirects"
```

---

## Self-review notes

- **Spec coverage:** `/ingresar` (Task 3), `/crear-cuenta` (Task 4), `/recuperar` new screen (Task 5), `AppShell` gate + `PUBLIC_AUTH_ROUTES` + redirect + `onAuthStateChange` + `PendingApproval` (Task 6), shared `AuthLayout` + de-dup of `/restablecer` (Tasks 2 & 6), validation helpers + tests (Task 1), removed auth form / deleted `auth-screen.tsx` (Task 6). All spec sections map to a task.
- **Spec refinement:** the spec's "redirect approved users on auth routes" rule is implemented via `REDIRECT_WHEN_AUTHED` (excludes `/restablecer`) and applies to any signed-in user, not only approved ones — required so the reset-email flow (which arrives signed-in) is not bounced, and so freshly-signed-up users reach the pending screen.
- **Type consistency:** `AuthLayout({ eyebrow, children })`, `authInputClass`, `PendingApproval({ message, onRefresh, onSignOut })`, `LoadingScreen()`, `validateLogin(email, password)`, `validateSignup(name, email, password, confirm)` are used identically wherever referenced.
