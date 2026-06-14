# Design System

The conventions that keep the UI consistent. **Read this before adding or editing UI.**
This documents what the codebase *already does* — it is descriptive, not aspirational.

Runtime source of truth: the `ui` object in [`src/lib/ui-tokens.ts`](../src/lib/ui-tokens.ts).
When a className combo is described here, prefer the `ui.*` constant over retyping it.

---

## Color

Use the `app-*` design tokens only. They are defined in the `@theme` block of
[`src/app/globals.css`](../src/app/globals.css) and adapt to light/dark automatically.

| Token | Use for |
|-------|---------|
| `app-bg` | page background |
| `app-surface`, `app-surface-2` | raised surfaces, subtle rows |
| `app-panel`, `app-panel-strong` | cards / panels |
| `app-text`, `app-muted` | primary text, secondary text |
| `app-line`, `app-line-strong` | borders, hover borders |
| `app-brand`, `app-brand-fg` | active/selected state + its foreground |
| `app-green`, `app-blue`, `app-amber`, `app-red` | status (ok / info / warning / error) |
| `app-solid`, `app-solid-fg` | solid emphasis buttons + foreground |
| `app-sidebar`, `app-nav` | chrome surfaces |

Shadows: `shadow-app`, `shadow-app-panel`, `shadow-app-card`.

**No raw colors** (`white`, `black`, `gray-*`, hex, `slate-*`, …). The only sanctioned
exceptions today are `text-white`/`bg-white`/`bg-black` on solid-colored badges
(e.g. white text on `bg-app-green`). Add a token before introducing a new raw color.

Use opacity modifiers on status tokens for tinted fills, e.g. `bg-app-blue/10`,
`bg-app-amber/15`, `bg-app-green/10` (see `StatusChip` in `src/components/badges.tsx`).

---

## Typography

**Size scale** (Tailwind presets):

| Class | Use for |
|-------|---------|
| `text-display` | hero / page-display headings (`clamp(2rem, 4vw, 2.75rem)`) |
| `text-2xl` / `text-xl` / `text-lg` | section & card headings |
| `text-base` | emphasized body |
| `text-sm` | **default body / controls** (most common) |
| `text-xs` | secondary text, labels, badges |

Avoid arbitrary font sizes. `text-[10px]` is reserved for tight badge labels only
(e.g. the green "Nuevo" pill); do not use it for regular text — use `text-xs`.

### Eyebrow / micro-label

The small uppercase label should be the named constant **`ui.label`**:

```
text-xs font-black uppercase leading-none text-app-muted   // ui.label (the constant)
```

Always `font-black`, always `text-xs`. Do not vary the size — `text-sm` and
`text-[10px]` copies are drift to be avoided.

> **Known drift:** most call sites currently hand-write this inline as
> `text-xs font-black uppercase tracking-wide text-app-muted` (with `tracking-wide`,
> without `leading-none`) instead of importing `ui.label`. Converge on `ui.label`; if
> `tracking-wide` is wanted, add it to the constant so every label matches in one edit.

---

## Font weight scale

One weight per role — don't mix them for the same kind of element:

| Weight | Role |
|--------|------|
| `font-black` | primary emphasis: labels, headings, key numbers |
| `font-extrabold` | muted secondary emphasis: footers, tab triggers, inline links (`text-app-muted`/`text-app-blue`) |
| `font-bold` | body-strong |
| `font-medium` | UI chrome / shadcn defaults |

---

## Radius

Maps to the `--radius-*` scale in `globals.css` (`--radius: 0.625rem`).

| Class | Use for |
|-------|---------|
| `rounded-lg` | panels, cards, primary containers (default) |
| `rounded-md` | rows, controls, inputs, list items |
| `rounded-xl` | larger grouped containers (e.g. tab bars) |
| `rounded-full` | pills / badges |

---

## Surfaces & shared classes

Prefer the `ui.*` constants from `src/lib/ui-tokens.ts` over retyping:

| Constant | Value |
|----------|-------|
| `ui.panel` | `rounded-lg border border-app-line bg-app-panel shadow-app-panel` |
| `ui.panelPlain` | same, no shadow |
| `ui.row` | `rounded-md bg-app-surface-2` |
| `ui.control` | `h-9` bordered surface control with hover states |
| `ui.label` | the eyebrow micro-label (see Typography) |
| `ui.controlValue` | `text-sm font-black leading-none text-app-text` |

---

## Badges & status

- **`src/components/badges.tsx`** — the app's composed badges. Use these, don't hand-roll:
  - `StageBadge` — stage / group pill
  - `StatusChip` — match status (open/locked/finalized) with optional hover detail
  - `SaveStatus` — saving/saved/error indicator
  - `StageTabs` — stage selector (Select on mobile, Tabs on desktop)
- **`src/components/ui/badge.tsx`** — the shadcn primitive `<Badge>`. Build new badge
  types on top of it inside `badges.tsx` rather than scattering inline overrides.

### Known convergence items

These are inconsistencies flagged in audit; converge toward the above when touched:

- The green **"Nuevo"** badge is built inline in both `app-shell.tsx` and
  `components/stats/stats-teaser.tsx`. Promote it to a shared variant in `badges.tsx`.
- The shadcn primitive uses `rounded-4xl`; app pills use `rounded-full`. Pills should
  read as `rounded-full`.

---

## Adding a new pattern

If a className combination repeats **3 or more times**, promote it to a `ui.*` constant
in `src/lib/ui-tokens.ts` (or a component in `badges.tsx`) and update this doc.
