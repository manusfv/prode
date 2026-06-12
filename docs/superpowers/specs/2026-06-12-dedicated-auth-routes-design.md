# Dedicated auth routes — design

## Problem

Login, sign up, and "recover password" all live on a single `AuthScreen` card
rendered inline by `AppShell` when there is no logged-in user. They have no URLs
of their own:

- `AppShell` (`src/components/app-shell.tsx`) holds all auth form state
  (`authMode`, `authEmail`, `authName`, `authPassword`, `authConfirmPassword`,
  `authMessage`) and the `submitAuth` / `sendPasswordReset` handlers.
- `AuthScreen` (`src/components/auth-screen.tsx`) renders a tabbed
  login/signup card plus a "¿Olvidaste tu contraseña?" link.
- Password recovery is not a real screen: the link reuses whatever is in the
  login email field and fires `resetPasswordForEmail`.
- `/restablecer` is the only dedicated auth page (set a new password after
  following the email link); `AppShell` special-cases it with
  `if (pathname === "/restablecer") return children`.

We want dedicated paths for log in, sign up, and password recovery, and the
recovery flow should be its own screen with an email input.

## Routes

Spanish slugs, consistent with the existing routes (`/pronosticos`, `/tabla`,
`/cuenta`, `/restablecer`):

| Path           | Purpose                                   | Status   |
| -------------- | ----------------------------------------- | -------- |
| `/ingresar`    | Log in (email + password)                 | new      |
| `/crear-cuenta`| Sign up (name + email + password + confirm)| new     |
| `/recuperar`   | Password recovery — enter email, send link | new     |
| `/restablecer` | Set a new password after the email link   | existing |

These four form the `PUBLIC_AUTH_ROUTES` set.

## Page behaviour

Each page is a `"use client"` route component that calls Supabase directly
(the pattern `/restablecer` already uses), composed inside a shared
`AuthLayout`.

### `/ingresar` (login)

- Fields: email, password.
- Submit: `supabase.auth.signInWithPassword({ email, password })`.
- On success: `router.replace("/pronosticos")`. `AppShell`'s auth-state
  subscription loads the profile and renders the app.
- On error: show the Supabase error message.
- Links: "Crear cuenta" → `/crear-cuenta`, "¿Olvidaste tu contraseña?" →
  `/recuperar`.

### `/crear-cuenta` (sign up)

- Fields: name, email, password, confirm password.
- Validation via `validateSignup` (see Tests) before calling Supabase.
- Submit: `supabase.auth.signUp({ email, password, options: { data: {
  display_name: name || email.split("@")[0] } } })`.
- On success: stay on the page and show "Cuenta creada. Te vamos a aprobar para
  participar." (unchanged copy/behaviour). Clear the password fields.
- Link: "Entrar" → `/ingresar`.

### `/recuperar` (password recovery — the new screen)

- Field: email only.
- Submit: `supabase.auth.resetPasswordForEmail(email, { redirectTo:
  ` `${window.location.origin}/auth/callback?next=/restablecer` ` })`.
- On success: show "Si el email existe, te enviamos un enlace para restablecer
  la contraseña." (confirmation state; the form may stay visible).
- On error: show the Supabase error message.
- Link: "Entrar" → `/ingresar`.

### `/restablecer` (unchanged)

Already implemented. No functional change; it joins `PUBLIC_AUTH_ROUTES`
explicitly instead of via its own special-case.

## `AppShell` as gate / redirector

`AppShell` stops rendering the login/signup form. Its render gate becomes:

1. If `pathname` is in `PUBLIC_AUTH_ROUTES` → render `{children}` with no app
   chrome (generalises the current `/restablecer` bypass).
2. If `!authReady` → `LoadingScreen` (unchanged; covers the first-load flash).
3. If `!currentUser` and the path is protected → `router.replace("/ingresar")`,
   render `LoadingScreen` while redirecting.
4. If `currentUser` and `!currentUser.approved` → `PendingApproval` component
   (extracted from the current `AuthScreen` pending branch; still owns
   `onRefresh` / `onSignOut`).
5. If `currentUser` is approved and `pathname` is an auth route →
   `router.replace("/pronosticos")`.
6. Otherwise → the normal app shell with `{children}`.

### Auth-state subscription

Because the auth pages no longer share `AppShell`'s state, `AppShell` subscribes
to `supabase.auth.onAuthStateChange` and calls `refreshSupabaseData()` on
`SIGNED_IN` / `SIGNED_OUT` (in addition to the existing on-mount load). This is
what lets a standalone login/logout page update the shell reactively. The
subscription is cleaned up on unmount.

### Supabase-not-configured

When `hasSupabaseConfig()` is false, `/ingresar` renders a clear "Faltan las
variables de Supabase / Configurá NEXT_PUBLIC_SUPABASE_URL y
NEXT_PUBLIC_SUPABASE_ANON_KEY" message in place of the form. `AppShell` treats
the unconfigured case as "not logged in" and redirects protected routes to
`/ingresar`, where the message is shown.

## Shared `AuthLayout`

Extract the card shell currently duplicated across `AuthScreen` and
`/restablecer` into `AuthLayout` (`src/components/auth/auth-layout.tsx`):

- Centered `<main>` + `Card`.
- Brand header (favicon mark + "Prode Carbia" + an eyebrow subtitle prop).
- `ThemePicker` in the corner, wired to `useTheme` internally so pages don't
  thread theme props.
- Renders children (the page's form / content).

`ThemePicker` moves into (or is re-exported from) the auth module so all auth
pages share it. `/restablecer` is migrated onto `AuthLayout` as part of the
de-duplication.

## Removed / changed code

- `AppShell`: delete auth form state (`authMode`, `authEmail`, `authName`,
  `authPassword`, `authConfirmPassword`, `authMessage`) and the `submitAuth` /
  `sendPasswordReset` handlers. Add the `PUBLIC_AUTH_ROUTES` gate, the redirect
  logic, and the `onAuthStateChange` subscription.
- `auth-screen.tsx`: the login/signup form is removed. The pending-approval
  branch becomes the `PendingApproval` component. `LoadingScreen` and
  `ThemePicker` are retained (moved/re-exported as needed).

## Tests

Add pure validation helpers to `src/lib/account.ts` and unit-test them in
`src/lib/account.test.ts` (alongside the existing `validatePasswordChange`):

- `validateLogin(email, password)` → requires non-empty email and password.
- `validateSignup(name, email, password, confirm)` → requires email + password,
  and `password === confirm`; reuses the password rules from
  `validatePasswordChange` where applicable.

Both return the existing `{ ok: true } | { ok: false; message: string }` shape.
Supabase calls and routing stay thin and are not unit-tested.

## Out of scope

- Server-side / middleware route protection (gating stays client-side, matching
  the app today).
- Changes to the `/auth/callback` route or the reset-email redirect target.
- Visual redesign of the auth cards beyond the shared-layout extraction.
