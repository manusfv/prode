# Prode — project notes for Claude

## UI / styling

This project has a **design system**: [`docs/design-system.md`](docs/design-system.md).
Read it before adding or editing UI. Key rules:

- Use `app-*` color tokens only — no raw `white`/`black`/`gray`/hex.
- Shared className recipes live in the `ui` object in `src/lib/ui-tokens.ts`
  (e.g. `ui.label`, `ui.panel`, `ui.control`) — prefer them over retyping.
- Badges/status pills come from `src/components/badges.tsx`, built on the
  shadcn `ui/badge.tsx` primitive.
- The eyebrow micro-label is always `text-xs font-black uppercase tracking-wide
  text-app-muted` (= `ui.label`). Avoid arbitrary font sizes.

If a className combo repeats 3+ times, promote it to `ui-tokens.ts` and update the
design-system doc.
