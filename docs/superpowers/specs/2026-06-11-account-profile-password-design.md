# Mi cuenta: edición de perfil y recuperación de contraseña

**Fecha:** 2026-06-11
**Estado:** Aprobado — listo para plan de implementación

## Objetivo

Permitir que un usuario logueado:

1. Cambie su **nombre** (`display_name`).
2. Cambie su **contraseña** estando logueado.
3. Recupere la contraseña por **email** cuando no puede entrar.

El email de login queda **solo lectura** en esta iteración.

## Contexto del código actual

- App Next.js (App Router) + Supabase. Todo se envuelve en `<AppShell>` desde `src/app/layout.tsx`.
- `AppShell` (`src/components/app-shell.tsx`) maneja auth en el cliente: `signInWithPassword`, `signUp`, `signOut`. Muestra `AuthScreen` si no hay sesión o si el perfil no está aprobado.
- `AuthScreen` (`src/components/auth-screen.tsx`) tiene tabs Entrar/Crear cuenta.
- `AccountPanel` (dentro de `app-shell.tsx`, al pie del sidebar) muestra nombre, email, selector de tema y botón "Salir". Se renderiza en el sidebar de escritorio y en el `Sheet` mobile vía `SidebarContent`.
- Navegación principal: `tabRoutes` / `pageTitles` / `routeTabs` en `src/lib/ui-tokens.ts` y `app-shell.tsx`.
- `/auth/callback/route.ts` ya hace `exchangeCodeForSession(code)` y redirige a `next`.
- RLS de `profiles`: **solo** existe `profiles_admin_update`. Un usuario común **no puede** actualizar su propia fila. Existe `profiles_select_visible` para lectura.
- Las escrituras de dominio (predicciones, etc.) pasan por server actions en `src/app/actions.ts` usando el cliente servidor autenticado (respeta RLS como el usuario).

## Diseño

### 1. Punto de entrada — AccountPanel (pie del sidebar)

El bloque de nombre/email del `AccountPanel` se vuelve accionable (botón/enlace "Editar perfil") y navega a la nueva ruta **`/cuenta`**. Queda **al pie**, separado visualmente de la navegación principal. **No** se agrega un `NavLink` de nivel superior. Mismo comportamiento en el sidebar mobile (`SidebarContent` → cierra el sheet al navegar vía `onNavigate`).

### 2. Pantalla "Mi cuenta" — `/cuenta`

- Nuevos archivos: `src/app/cuenta/page.tsx` y `src/screens/account.tsx`.
- Se renderiza **dentro de `AppShell`** (gateada por login + aprobación, igual que las demás pantallas).
- Dos tarjetas:
  - **Datos del perfil**: input editable de `display_name`, email en solo lectura, botón "Guardar".
  - **Contraseña**: campos nueva contraseña + confirmar, botón "Cambiar contraseña".
- `account` se agrega a `pageTitles`, `routeTabs`/`AppRoute` y `routeTabs` map en `app-shell.tsx` (`activeTabFromPath`) para que el header muestre el título, pero **se excluye** de la lista de nav principal (`SidebarContent`).

### 3. Cambio de nombre (server action + RPC)

Como RLS bloquea el self-update de `profiles`, se agrega una **función Postgres security-definer** `update_my_display_name(new_name text)` que actualiza **solo** `display_name` para `auth.uid()`. Esto evita una policy de UPDATE amplia que podría permitir cambiar `approved`/`role`.

- Migración nueva: `docs/supabase-migration-account-display-name.sql`.
- La función valida que `new_name` no esté vacío (trim) y hace `update public.profiles set display_name = ..., updated_at = now() where id = auth.uid()`.
- `grant execute` a `authenticated`.
- Nueva server action `updateDisplayNameAction(displayName)` en `actions.ts`:
  - Verifica usuario logueado (`getCurrentUserId`).
  - Valida nombre no vacío (reusa helper puro, ver Testing).
  - Llama `supabase.rpc("update_my_display_name", { new_name })`.
  - Llama `supabase.auth.updateUser({ data: { display_name } })` para sincronizar metadata.
  - `revalidatePath("/")`.
- El cliente, tras éxito, llama `refreshSupabaseData()` para reflejar el nuevo nombre.

### 4. Cambio de contraseña (logueado)

- Client-side en la pantalla de cuenta: `supabase.auth.updateUser({ password })` (el browser ya tiene la sesión, mismo patrón que login/signup).
- Validaciones: nueva === confirmar y longitud mínima (helper puro compartido).
- Mensajes de éxito/error inline.

### 5. Recuperación de contraseña (link por email)

- En `AuthScreen` (modo login) se agrega enlace **"¿Olvidaste tu contraseña?"** que abre una vista "recover" ligera (dentro del mismo componente):
  - Input de email → `supabase.auth.resetPasswordForEmail(email, { redirectTo: ` `${window.location.origin}/auth/callback?next=/restablecer` ` })`.
  - Mensaje: "Si el email existe, te enviamos un enlace para restablecer la contraseña."
- `/auth/callback` ya intercambia el code y redirige a `next` (`/restablecer`).
- Nueva página **`/restablecer`** (`src/app/restablecer/page.tsx`), **fuera del gate de AppShell**:
  - Form: nueva contraseña + confirmar → `supabase.auth.updateUser({ password })` → redirige a `/`.
  - Usa el mismo helper de validación de contraseña.
- **Wrinkle de layout:** `layout.tsx` envuelve todo en `<AppShell>`, que mostraría el login si el perfil no está aprobado. Solución: `AppShell` detecta el pathname `/restablecer` (vía `usePathname`) y, en ese caso, renderiza `children` directamente sin el gate de auth/aprobación. La página `/restablecer` trae su propia UI autocontenida (card de marca + form), sin depender del contexto de la app.

## Componentes / límites

| Unidad | Responsabilidad | Depende de |
|---|---|---|
| `src/lib/account.ts` (helpers puros) | Validar nombre no vacío y contraseña (match + longitud) | nada |
| `src/screens/account.tsx` | UI de edición de perfil y contraseña | helpers, supabase browser client, `updateDisplayNameAction` |
| `updateDisplayNameAction` | Actualizar `display_name` vía RPC + metadata | supabase server client |
| `update_my_display_name` (SQL) | Update seguro de `display_name` del usuario actual | RLS / auth.uid() |
| `AuthScreen` (vista recover) | Disparar email de reset | supabase browser client |
| `src/app/restablecer/page.tsx` | Setear nueva contraseña post-link | supabase browser client, helpers |
| `AppShell` (bypass) | Saltar gate en `/restablecer` | `usePathname` |

## Manejo de errores

- Acciones devuelven `{ ok, message }` (patrón existente); la UI muestra el mensaje.
- Errores de Supabase (RPC/updateUser/reset) se muestran inline en la pantalla correspondiente.
- Validaciones de cliente antes de llamar a la red (nombre vacío, contraseñas no coinciden / cortas).

## Testing

- Tests unitarios (vitest) de helpers puros en `src/lib/account.test.ts`:
  - `isValidDisplayName` (vacío / con espacios / válido).
  - `validatePasswordChange` (coinciden, longitud mínima, no coinciden).
- Flujos con Supabase (RPC, updateUser, reset email, página `/restablecer`) se verifican manualmente.

## Fuera de alcance (YAGNI)

- Cambiar el email de login.
- Pedir la contraseña actual para cambiarla (Supabase no lo exige con sesión activa).
- Subida de avatar u otros campos de perfil.
- Rate limiting propio del reset (Supabase ya limita).
