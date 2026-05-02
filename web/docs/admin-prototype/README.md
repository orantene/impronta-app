# Admin shell — developer handoff

Welcome. This is the entry point for any engineer picking up the
admin-shell work. Read in order:

1. **This file** — what the prototype is, what it isn't, and how to
   run it locally
2. [`./architecture.md`](./architecture.md) — file structure, state
   model, conventions, primitives
3. [`./production-handoff.md`](./production-handoff.md) — 17 production
   wiring tickets (T1–T17) with scope, dependencies, and effort
   estimates
4. [`./dev-handoff.md`](./dev-handoff.md) — older deep-dive on early
   architectural decisions; still useful as background

---

## What you're looking at

A high-fidelity clickable prototype of the **Tulala admin shell** — the
multi-surface SaaS app for talent agencies, the talent on those
rosters, the clients who book them, and Tulala HQ ops staff.

It lives at `/prototypes/admin-shell` and runs entirely client-side
against in-memory mock data. **Nothing persists.** Refresh the page and
state resets to defaults (URL query params re-hydrate plan/role/page
selections — that's intentional, see "URL state" below).

Across nine commits on `phase-1`, ~150 product, design, UX, copy, a11y,
and animation items have been resolved. The prototype answers every
product question that came up in the design phase. **The prototype's
job is now done; production wiring is what's left.**

## Run it

```bash
cd web
npm install     # first time only
npm run dev
```

Then visit:

- `/prototypes/admin-shell` — landing (free workspace, owner role)
- Press **⌘K** (or Ctrl+K) to open the command palette anywhere
- Press **?** to see all keyboard shortcuts

### Specific surfaces / states to demo

| URL | Shows |
|---|---|
| `/prototypes/admin-shell?surface=workspace&plan=studio&page=overview` | Studio plan workspace, "Today" |
| `/prototypes/admin-shell?surface=workspace&plan=studio&page=inbox` | **Unified Inbox — the showcase list** |
| `/prototypes/admin-shell?surface=workspace&plan=studio&page=workflow` | Workflow (Pipeline) — search + sort + CSV |
| `/prototypes/admin-shell?surface=workspace&plan=studio&page=talent` | Roster — state filter + search |
| `/prototypes/admin-shell?surface=workspace&plan=studio&page=clients` | Clients — status filter |
| `/prototypes/admin-shell?surface=workspace&plan=studio&page=calendar` | Roster month-grid calendar |
| `/prototypes/admin-shell?surface=talent&talentPage=today` | Talent perspective |
| `/prototypes/admin-shell?surface=client&clientPage=today` | Client perspective |
| `/prototypes/admin-shell?surface=platform&platformPage=today` | Tulala HQ perspective |
| `/prototypes/admin-shell?drawer=plan-compare` | Compare-plans drawer |
| `/prototypes/admin-shell?drawer=audit-log` | Audit log drawer |
| `/prototypes/admin-shell?dev=0` | Hides the dark dev controls |
| `/share/talent/marta-reyes` | Public talent landing page |

### What works without a backend

Every interactive surface, every drawer, every animation, every
keyboard shortcut. State changes re-render correctly. URL state
persists across refresh. Mobile responsive. The whole thing.

### What does NOT work

Anything that requires real persistence, third-party services, or
multi-user coordination:

- Sign-in / sign-up (no auth — every visitor is "Oran Tene", owner of
  Atelier Roma)
- Saving talent / inquiry / client edits (state is in-memory)
- File uploads (logos, photos, documents — all stubs)
- Stripe (the PaymentsSetupDrawer is mocked)
- Email delivery (toasts say "sent" but nothing leaves the browser)
- Custom domain DNS verification
- Real notifications (mock list)
- Audit log (hardcoded mock events)
- Identity verification (no review queue)

## How the URL works

The prototype encodes its full UI state in URL query params. Sharing
the URL re-creates the exact view the sender saw. Examples:

- `?surface=talent&talentPage=inbox` — talent surface, inbox page
- `?plan=agency&role=coordinator` — workspace as agency-plan
  coordinator
- `?drawer=tenant-switcher` — open the workspace switcher drawer
- `?drawer=inquiry-workspace&drawerPayload={"inquiryId":"iq2"}` — open
  a specific inquiry's workspace

The drawer-state syncing is in
`src/app/prototypes/admin-shell/_state.tsx::ProtoProvider` if you need
to extend.

## Tech stack

- **Next.js 15+** (App Router, server components, with the project's
  custom `next.config.ts` — see `web/AGENTS.md` for caveats)
- **React 19**
- **TypeScript** strict
- No styling library: inline styles + a global `<style>` block in
  `src/app/prototypes/admin-shell/page.tsx`. The prototype was kept
  CSS-framework-free deliberately so primitives are portable to any
  future CSS solution.
- **Supabase** (used elsewhere in `web/`; not yet wired into the
  prototype)

## Testing

There are zero tests on the prototype. Adding Playwright tests is
**T-test** in the production handoff plan — recommended once T1 (auth)
and T2 (core tables) land, so tests can hit real persistence rather
than mocks.

## Deploying

The project deploys via Vercel from `phase-1`. See
`~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/project_vercel_deployment.md`
for the full topology — deploys, aliases, ghost projects, Action
post-deploy aliasing.

Pushing a commit on any branch builds a Vercel preview (SSO-gated).
Push to `phase-1` → preview build (NOT auto-prod). Promote with:

```bash
vercel promote <preview-url> --yes
```

## Key files

```
web/src/app/prototypes/admin-shell/
├── page.tsx                       # mount point + global <style>
├── _state.tsx                     # types, mocks, ProtoProvider, design tokens
├── _primitives.tsx                # Avatar, Buttons, Cards, DrawerShell, Popover, Skeleton, BulkSelect, etc.
├── _palette.tsx                   # ⌘K command palette
├── _pages.tsx                     # ControlBar, WorkspaceTopbar, all surface routers, all workspace pages
├── _drawers.tsx                   # DrawerRoot dispatcher + every drawer body (~150)
├── _workspace.tsx                 # InquiryWorkspaceDrawer (the big drawer)
├── _talent.tsx                    # Talent surface (6.5K lines — refactor candidate)
├── _client.tsx                    # Client surface
├── _platform.tsx                  # Tulala HQ surface
└── _wave2.tsx                     # Newer drawers + cards + onboarding + share-card preview

web/src/app/share/talent/[slug]/page.tsx   # Public talent landing (route lives outside the prototype)
web/src/components/analytics/analytics-consent-banner.tsx  # Suppressed on /prototypes/* (already wired)
web/public/manifest.webmanifest             # PWA manifest

web/./
├── README.md                      # this file
├── architecture.md                # state model, conventions, primitives reference
├── production-handoff.md          # 17 wiring tickets
└── dev-handoff.md                 # older background
```

## Conventions cheat sheet

| Pattern | Where |
|---|---|
| New drawer | Add a `DrawerId` literal in `_state.tsx`, register a `case` in `DrawerRoot` (`_drawers.tsx`), build the body with `<DrawerShell>` |
| New surface page | Add a value to the surface's `*Page` type + `*PAGE_META` in `_state.tsx`, add a `case` in the surface's `PageRouter` |
| New primitive | Add to `_primitives.tsx`. Export by name. |
| Color | Use `COLORS` token from `_state.tsx`. Forest accent for "current state"; ink for default; red/green/amber sparingly. **No warm gold/rust.** |
| Typography | `FONTS.display` for headings, `FONTS.body` for prose, `FONTS.mono` for keys/timestamps |
| Spacing | `SPACE` tokens in `_state.tsx`; `RADIUS` for corners |
| Z-index | `Z` tokens in `_state.tsx` |
| Toast | `useProto().toast(message)` |
| New event | Push to the audit log via the (TBD) server action; UI auto-renders |

## Commit history (for the curious)

The prototype was built across nine focused commits on `phase-1`:

```
f08f04b  admin-shell: wire MentionTypeahead into composer + production-handoff doc
7f9971e  admin-shell: sweep search/sort/filter/CSV across Pipeline + Roster + Clients
de582a9  admin-shell: deploy primitives across the canonical Inbox + global polish
9fe39c0  admin-shell: prototype-quality build of the next-32 audit
8b327c0  admin-shell: close out the Wave-4 deferred items
3ceb2d2  admin-shell: 38-point audit pass — bugs, a11y, polish, animations
82e00b8  admin-shell: copy + naming sweep (30 UX-copy improvements)
51598d1  admin-shell: Wave 1+2 audit — 26 product/design improvements + mobile responsive layer
f1e2f47  admin-shell: import Popover in _drawers.tsx (plan-compare runtime fix)
```

Each commit message is a real spec of what shipped + what didn't and
why. They're worth reading if you're trying to understand a specific
surface or pattern.

## Next steps for the dev team

1. **Read the prototype.** Click through every surface, every drawer.
   Press ⌘K and explore. The interaction depth answers most of your
   "what should this do?" questions.
2. **Read [`architecture.md`](./architecture.md)** to understand how
   state flows.
3. **Read [`production-handoff.md`](./production-handoff.md)** for the
   17 tickets that move us from prototype → production.
4. **Start with T1** (auth + tenant resolution). Everything else
   builds on it.

## Questions

For product / design questions: re-read the relevant commit message
first — most product decisions are documented inline. If still
unclear, the original architectural docs in `web/docs/` give context.

For engineering questions: this README + the architecture doc cover
conventions; the per-component JSDoc comments in `_primitives.tsx` and
`_state.tsx` are dense and should answer specific questions.
