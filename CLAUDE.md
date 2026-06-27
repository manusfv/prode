# Prode — project notes for Claude

## UI / styling

This project has a **design system**: [`docs/design-system.md`](docs/design-system.md).
Read it before adding or editing UI. Key rules:

- Style with Tailwind utility classes on the elements, not by adding new rules
  to `globals.css`. The raw CSS classes still in `globals.css` (e.g. `.admin-row`,
  `.admin-score-edit`) are legacy — match the Tailwind components like
  `GroupAdminCard`, and migrate nearby legacy CSS to Tailwind when you touch it
  rather than extending it.
- Use `app-*` color tokens only — no raw `white`/`black`/`gray`/hex.
- Shared className recipes live in the `ui` object in `src/lib/ui-tokens.ts`
  (e.g. `ui.label`, `ui.panel`, `ui.control`) — prefer them over retyping.
- Badges/status pills come from `src/components/badges.tsx`, built on the
  shadcn `ui/badge.tsx` primitive.
- The eyebrow micro-label is always `text-xs font-black uppercase tracking-wide
  text-app-muted` (= `ui.label`). Avoid arbitrary font sizes.

If a className combo repeats 3+ times, promote it to `ui-tokens.ts` and update the
design-system doc.

## Novedades modal

When you add a new user-facing feature, ask whether to update the Novedades modal
(`src/components/novedades-modal.tsx`) with an entry for it.
