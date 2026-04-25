# Admin aesthetic pass — Path A QA

Code-level verification passed (2026-04-25).

## Build

- **Source commit:** `67b0c2d` — `admin: kill gold accents, tighten inquiries spacing, nav sub-labels`. 16 files / +548 / -126.
- **Branch:** `phase-1` (auto-deploys preview to Vercel; promote to prod via `vercel promote`).
- **TypeScript:** `cd web && npx tsc --noEmit` exits clean at HEAD.
- **Scope:** workspace-side admin shell only. Editor chrome (`edit-chrome/*`) is untouched.

## Acceptance criteria

| Item | Status | Evidence |
|---|---|---|
| Light-theme `--admin-gold-*` neutralised | ✅ | `web/src/app/globals.css` lines 605–625 — light-theme overrides redefine the gold token family to white/near-white. Sidebar bg stays dark in both themes, so workspace gold halos disappear without breaking dark-theme contrast. |
| Tier-chip border (admin top bar) | ✅ | `admin-top-bar.tsx` lines 192–193 — `rgba(201,162,39,0.4)` → `rgba(24,24,27,0.4)`; focus ring also neutralised. |
| Composer publish pill | ✅ | `admin-top-bar.tsx` lines 213–215 — `border-amber-500/40 bg-amber-500/10 text-amber-400` → neutral foreground tints. |
| Luxury button shadow | ✅ | `dashboard-shell-classes.ts` line 40 — gold-tinted shadow → black/32. |
| Header icon halo | ✅ | `admin-page-header.tsx` lines 40–42 — gold halo replaced with neutral ink. |
| Site-card hover/icon accents | ✅ | `site-control-center/site-card.tsx` lines 54, 68–70 — gold border + iconAccent → neutral. |
| Inquiries dead space | ✅ | `(dashboard)/admin/inquiries/page.tsx` — wrapper now `mx-auto max-w-6xl space-y-5 pb-8` (was `space-y-8`); `ADMIN_PAGE_STACK` import removed. List columns no longer breathe with cathedral-sized gaps. |
| Nav sub-labels (12/12) | ✅ | `admin-prototype-nav.ts` — `PrototypeNavItem` extended with optional `description?: string`, `navItem()` accepts a 5th param; all 12 nav entries got plain-English subtitles (e.g. Inquiries: "Incoming requests, triage and convert to bookings"). |
| Tooltip surfaces description | ✅ | `admin-prototype-shell.tsx` — both collapsed/compact and expanded tooltip variants render `item.label` + `item.description` in a two-line layout. |

## Notes

- **Visual smoke** — workspace lives behind staff auth; manual screenshot pass requires a staff session at `https://impronta.tulala.digital/admin`. Code evidence stands until that capture happens.
- **Why not delete `--admin-gold` outright** — too many files reference the variable name; renaming it to `--admin-accent` is a pure-refactor follow-up. Neutralising the value to white keeps the diff narrow and the rollback trivial if the dark-theme treatment changes its mind.
- **What is intentionally still gold** — the Impronta storefront (canvasDark theme) keeps its `--impronta-gold` brand accent. Only the admin shell (`.dashboard-theme-*`) was neutralised.
