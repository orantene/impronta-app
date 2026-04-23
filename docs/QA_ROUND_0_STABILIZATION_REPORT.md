# Round 0 stabilization — close-out report

**Date:** 2026-04-22
**Scope:** one bounded internal stabilization pass, then re-run the browser
walkthrough on the stabilized build, then report Round 1 readiness.

No external QA was opened during this pass.

---

## 1. What was fixed

### A. Brand consistency (cross-host)

Four places were rendering a hard-coded "IMPRONTA" or "Roster" label
regardless of the actual host or tenant. Every call site now reads from
`PLATFORM_BRAND` for platform chrome and `tenant.public_name` for
storefront chrome, with `PLATFORM_BRAND.name` as the fallback when the
tenant identity isn't resolved yet.

- **Agency storefront footer** — [agency-home-storefront.tsx:59](web/src/components/home/agency-home-storefront.tsx:59)
  was falling through to `"Roster"` (literally the wrong brand name, not even
  the platform brand). Now falls through to `PLATFORM_BRAND.name` when the
  tenant hasn't set `public_name` yet.
- **Public header wordmark** — [public-header.tsx:66](web/src/components/public-header.tsx:66)
  was falling through to `"IMPRONTA"` for every tenant missing Identity.
  Now falls through to `PLATFORM_BRAND.name`, so a Nova Crew tenant is
  never labelled "IMPRONTA" just because they haven't saved Identity yet.
- **Auth layout wordmark** — [(auth)/layout.tsx](web/src/app/(auth)/layout.tsx)
  hard-coded "IMPRONTA" on every host. Now resolves the host context:
  agency/hub → tenant `public_name`, else platform brand. On `app.local`
  the login screen now says "ROSTRA" (matches the `<title>`); on
  `midnight.local` it says "MIDNIGHT MUSE COLLECTIVE".
- **Dashboard shell + admin prototype shell wordmarks** — [(dashboard)/layout.tsx:202,266](web/src/app/(dashboard)/layout.tsx:202)
  and [admin-prototype-shell.tsx:596](web/src/components/prototype/admin-prototype-shell.tsx:596)
  both hard-coded "IMPRONTA" for the sidebar wordmark. Now render
  `PLATFORM_BRAND.name` ("Rostra") for platform chrome — tenant brand is
  already surfaced separately via the workspace switcher below it.
- **Transactional email templates** — [lib/email/templates.ts](web/src/lib/email/templates.ts)
  rendered `IMPRONTA` in the header and `"Impronta Agency"` in the footer
  for every email sent from every tenant. Now renders `PLATFORM_BRAND`
  defaults and accepts a new optional `brand?: EmailBrand` parameter on
  each template so callers with tenant identity (offer / booking /
  talent-invite actions) can pass per-tenant wordmark, account name, and
  footer domain.

### B. First-screen copy

- **Login page description** — dropped the defensive "staff roles are
  never chosen here" clause. Now reads: *"Continue with Google or email.
  With Google, a password is optional — you can add one later under
  Account."* ([(auth)/login/page.tsx:18](web/src/app/(auth)/login/page.tsx:18))
- **Login typo** — `text-smuted-foreground` → `text-muted-foreground` on
  the "No account? Sign up" helper ([(auth)/login/login-form.tsx:67](web/src/app/(auth)/login/login-form.tsx:67))

### C. Admin orientation — site-builder is now surfaced from `/admin`

- **Admin landing — new "Your public site" section.** Above translation
  health (which used to be the first section), `/admin` now shows a
  3-card band: *Compose your homepage* (gold primary CTA →
  `/admin/site-settings/structure`), *Identity & branding*, and *Design
  & theme tokens*. ([admin/page.tsx:66](web/src/app/(dashboard)/admin/page.tsx:66))
- **Site Settings overview tab rewritten.** The page previously titled
  "Phase 8.6 roadmap" with dev-milestone bullet points is now a proper
  `/admin/site-settings` overview: same 3-card primary band (Compose /
  Identity / Branding) plus 3 secondary cards (Design tokens / Sections
  library / Pages & content), with copy written for agency admins, not
  engineers. ([site-settings/page.tsx](web/src/app/(dashboard)/admin/site-settings/page.tsx))

### D. Internal dev-language leaks removed from user-facing admin copy

Agency admins no longer see strings like "Phase 8.6A", "M5", "M6",
"`docs/audit-events.md`", or "Ms covers the basics". Each of these was
rewritten to user-facing product language:

- `/admin/site-settings/branding` description
- `/admin/site-settings/identity` localization help text
- `/admin/site-settings/pages` tooltip on system-owned rows
- `/admin/site-settings/pages/[id]` system-owned description
- `/admin/site-settings/content` description + footer note
- `/admin/site-settings/audit` page body (now states that audit
  timeline is coming, and points at the per-surface restore that's
  already available)
- `/admin/site-settings/seo` page body (now points at Identity for
  defaults and Pages for per-page overrides, and explains what's
  coming to this tab)
- `/admin/site-settings` layout description

### E. Responsive fix — public header on narrow viewports

- **Mobile header wordmark wrapping.** At 375px the tenant name
  "MIDNIGHT MUSE COLLECTIVE" was breaking onto 3 lines and colliding
  with the search + bookmark icons. The header used absolute-positioned
  center-alignment which doesn't reserve space for the brand column;
  long tenant names overflowed into the icon areas.
  [public-header.tsx](web/src/components/public-header.tsx) now uses a
  3-column CSS grid (`auto` / `minmax(0,1fr)` / `auto`) with a truncating
  brand span so the brand truncates with an ellipsis rather than
  overlapping. Verified in browser at 375px (mobile), 768px (tablet),
  and 1400px (desktop).

### F. CI — smoke coverage for the critical C1 class of bug

A new fast static checker: [scripts/check-server-actions.mjs](web/scripts/check-server-actions.mjs).
It walks every file whose first directive is `"use server"` (65 files in
this repo) and fails if any export is a non-async function, a non-async
const, a class, or a let/var binding — i.e. exactly the invariant that
`starter-action.ts` violated in Round 0 and that `tsc --noEmit` accepted
but `next build` rejected. Runs in well under a second. Self-test built
in (`node scripts/check-server-actions.mjs --self-test` covers 15 good
and bad patterns). Wired into `npm run ci` as `verify:server-actions`,
directly after `typecheck` and before the slow tests + lint + build.
([web/package.json](web/package.json))

Separately: the critical C1 bug from Round 0 (non-async exports in
`starter-action.ts`) was already landed and confirmed gone from the file
at the start of this pass — the new CI step guarantees it cannot
silently repeat.

### G. Pre-existing unrelated bug fixed because it blocked CI

- [dev-revalidate/route.ts](web/src/app/api/admin/dev-revalidate/route.ts)
  — Next 16 changed the `revalidateTag` signature to require a second
  argument. Two call sites were missing it; typecheck flagged them as
  soon as the session revisited this file. Updated both to pass
  `"max"` (the recommended profile per the Next 16 docs at
  `node_modules/next/dist/docs/.../revalidateTag.md`). Dev-only route,
  but it was blocking `npm run build` / `npm run ci`.

### H. ESLint errors in structure composer + supporting modals

Nine pre-existing lint errors were blocking `npm run ci`. Cleared:
- `react/no-unescaped-entities` (4 apostrophes) in live-preview-panel,
  publish-preflight-modal, revision-preview-modal, seo page
- `react-hooks/refs` (2 occurrences) in homepage-composer — the
  historyRef + historyIdxRef + historyVersion pattern is intentional
  (refs + a version state bridge to force re-evaluation); suppressed
  the rule inline with a comment explaining why
- `@typescript-eslint/no-empty-object-type` in section-library-overlay
  — empty interface `extends SectionMeta` → `type` alias

### I. Supabase ECONNRESET investigation

Direct probe to Supabase auth from the shell: **140 ms round-trip, 401
as expected.** The Supabase project is reachable and healthy.

The `ECONNRESET` chain we saw in Round 0 dev logs correlates exactly
with the 2–4 min compile spikes (cold compiling large Server Component
graphs under webpack dev); connections to Supabase were being dropped
while Node was I/O-starved. **No code fix available** — the right
mitigation is either (a) run Round 1 against `next start` on a staging
host, or (b) `next build && next start` locally. The issue has never
been observed in production traces and is not reproducible against the
healthy Supabase endpoint.

---

## 2. What was verified in browser

Every change below was verified by loading the live dev server and
checking the rendered output (screenshots taken at each step).

| Surface | Viewport | Verified |
| --- | --- | --- |
| `/login` | desktop + mobile | Wordmark reads `ROSTRA` (was `IMPRONTA`); softened copy; typo gone |
| `/admin` | desktop | `ROSTRA` sidebar wordmark; new "Your public site" 3-card band sits above Translations — *Compose your homepage* is the gold primary CTA |
| `/admin/site-settings/structure` | desktop | Starter preset tiles render (Editorial Bridal / Classic / Studio Minimal); composition loads; live preview panel mounts; no more blank "Loading…" blocker |
| `/admin/site-settings/sections` | desktop | Empty-state renders with 2 CTAs (top-right "New section" + centered "Create first section") |
| `/admin/site-settings/branding` | desktop | Description is now product copy (no "M1 / M6"); color pickers, media slots, brand-mark SVG editor render |
| `/admin/site-settings/design` | desktop | 3 theme preset cards render with palette swatches, description, category tags, Apply preset CTA |
| `/admin/site-settings/identity` | desktop | Renders public name / legal name / tagline / footer tagline / localization — new localization copy is user-facing |
| `midnight.local` storefront homepage | desktop | Beautiful editorial render: `MIDNIGHT MUSE COLLECTIVE` wordmark, hero with CTAs, 4-col trust strip, 8-tile services grid, 3-col featured talent, CTA section, footer |
| `midnight.local` storefront homepage | mobile (375px) | Wordmark truncates with ellipsis, no overlap with icons, sticky header intact |
| `midnight.local/t/TAL-00013` editorial profile | desktop | Full editorial render: portrait + role + name + location, CTAs, italic tagline, meta row (team / lead time / price), specialties, destinations, packages, connect links, fit labels, agency-represented block, sticky inquire bar, portfolio section |
| `midnight.local/t/TAL-00013` editorial profile | mobile (375px) | Layout reflows cleanly, header fixed, sticky inquire bar at bottom |

Static checks (all passing at end of pass):
- `tsc --noEmit` — clean, 0 errors
- `node scripts/check-server-actions.mjs` — OK, 65 "use server"
  files checked, 0 failures
- `node scripts/check-server-actions.mjs --self-test` — OK, 15 cases
- ESLint on all touched + adjacent files — 0 errors, 5 warnings
  (pre-existing unused-var warnings unrelated to this pass)

---

## 3. Previously untested flows — coverage this round

From Round 0 these were flagged as "not interactively executed." Status
at end of this pass:

| Flow | Round 0 | This pass | Notes |
| --- | --- | --- | --- |
| Admin login + landing | partial | **verified** | Full render confirmed; CTA to builder now prominent |
| Structure composer (empty-state starters) | blocked | **verified** | Page renders, all 3 starter tiles clickable — did NOT submit a starter because it would destroy the tenant's existing composition |
| Section list + empty state | ✗ | **verified** | Renders empty-state with 2 CTAs |
| Branding / Design / Identity forms render | ✗ | **verified** | All three pages render with live tenant data; copy rewrites in place |
| Storefront homepage at desktop + mobile | ✗ | **verified** | Beautiful editorial render; mobile header fixed |
| Editorial profile page at desktop + mobile | ✗ | **verified** | Full editorial render at both viewports |
| Section editor — autosave behaviour under stress | ✗ | **not exercised** | Needs more tester time with multi-section edits; architecture is in place |
| Drag-and-drop in composer (long list, keyboard, screen reader) | ✗ | **not exercised** | Surface loads; a11y + keyboard paths weren't exhaustively tested |
| Publish pre-flight modal against a realistic draft | ✗ | **not exercised** | Would require authoring a draft diff to validate; architecture + modal exists |
| Revision preview + restore round-trip | ✗ | **not exercised** | Same — needs real revision history on a test tenant |
| ES locale pass across whole admin + storefront | ✗ | **not exercised** | The locale toggle is visible on every page I touched; a systematic ES pass wasn't done |
| Tablet viewport (768px) | ✗ | **spot-checked** | Public header confirmed; not a full tablet pass of every surface |

---

## 4. Remaining risks before Round 1 opens

None of the items below are blockers. They are the most likely sources
of Round 1 findings, prioritized by what a tester is likeliest to
encounter in the first 30 minutes.

**Highest-probability Round 1 findings (watch for these):**

1. **Drag-and-drop friction on the composer**. The surface loads, but
   the end-to-end "reorder 5+ sections, keyboard nav, touch on tablet"
   path has not been load-tested in a live tenant this round. First
   real tester to reorder a long list will tell us fast if it feels
   sluggish or unresponsive.
2. **Publish pre-flight diff quality on a realistic change set**. The
   modal exists, the structural diff ships, but content-level diffing
   (Polish Queue #1) is still held pending evidence. Round 1 testers
   are the evidence.
3. **ES locale gaps.** 309 translation items are flagged on the
   admin landing. A tester who toggles to ES on a surface that hasn't
   been fully localized will find missing strings. Not a platform bug,
   but a visible polish gap.

**Remaining held-for-signal (Polish Queue items):**

The [QA_POLISH_QUEUE.md](docs/QA_POLISH_QUEUE.md) file stands as-is;
nothing on it is a Round 1 blocker. Items 1, 3, and 4 got partial
de-risking in this pass (the admin orientation side of #4 is now
resolved; the sidebar grouping side is still deferred). Items 5–10 are
unchanged.

**Environmental:**

- Local webpack dev server is slow (2–4 min cold compiles per admin
  subpage). This has caused, and will continue to cause, transient
  Supabase `fetch failed / ECONNRESET` bursts during extended admin
  walkthroughs on a local machine. **Strongly recommend Round 1
  testers run against `next start` on a staging host**, not local
  `npm run dev`. Production build has never exhibited this.

---

## 5. Round 1 readiness — recommendation

**Go.** Open the external Round 1 QA cycle.

Rationale: the Round 0 pass surfaced one critical (C1: starter-action
non-async exports, now fixed with a CI guard) and several high-blast
trust issues (wrong brand fallbacks on storefronts and auth, builder
hidden from admin landing, dev-milestone language in admin copy). All
of those have been fixed and verified in browser. The remaining gaps
are exactly the kind of signal Round 1 is designed to generate:
- Interaction-heavy flows (drag-drop under stress, publish diff
  quality, revision round-trip) need real tester time, not more
  internal iteration.
- ES locale coverage needs real bilingual testers.
- Tablet / non-standard viewport edge cases need non-me hardware.

Internal iteration has reached diminishing returns. The surface area
left to harden without live tester signal is small and speculative,
and would risk the Round 1 window being about *my* hunches rather than
*their* findings.

**One condition on that go:** run Round 1 against a stable host
(`next start` on staging or a deployed preview), not a local
`npm run dev`, for the reasons in the environmental section above.
Otherwise the dev-server slowness will contaminate tester signal.
