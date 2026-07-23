# Get-Started signup redesign — execution plan (2026-07-11)

**Status: READY TO EXECUTE. Not started.**
Owner intent: make `/get-started` business-name-first, fully signed-in-aware, and
keep the (already good) lead-gen plumbing intact. Approved by Oran in session
2026-07-11 after a live walkthrough of the page while signed in.

---

## 0. Context an agent must load first

- Read `CLAUDE.md` (repo root) — branch/migration/deploy protocol is binding.
- Read `web/AGENTS.md` — this is a heavily modified Next.js 16; check
  `node_modules/next/dist/docs/` before assuming API behavior.
- This plan touches ONE marketing surface + ONE server action + ONE migration.
  It does NOT touch auth, onboarding, or pricing.

### The surface

| Piece | Path | Anchor |
|---|---|---|
| Page (server) | `web/src/app/(marketing)/get-started/page.tsx` | `getCachedActorSession()` at ~L179; builds `initialSignedIn {userId,email,displayName}` and passes to form at ~L397 |
| Form (client, 778 lines) | `web/src/components/marketing/get-started-form.tsx` | fields: hidden `audience` (L457), hidden `rosterSize` (L458), hidden `actorUserId` (L460, signed-in only), visible `subdomain` (L651), honeypot `company_website` (L443), UTM hidden fields L449-455 |
| Server action | `web/src/app/(marketing)/get-started/actions.ts` | `submitGetStartedSignup`; `SignupSchema` (zod) at top; inserts into `saas_marketing_signups` (~L276); reserves slug in `saas_subdomain_reservations` (~L312); sends lead email + founder digest; returns `leadId`; self-serve leads get `buildWorkspaceOnboardingPath(leadId)` on the app host |
| Table | `supabase/migrations/20260626120000_saas_marketing_signups.sql` | RLS enabled, NO policies — service-role only. Columns today: email, name, audience, roster_size, subdomain_wanted, tier_interest, UTM columns, hashed IP |
| Copy module | `web/src/lib/marketing/copy.ts` (+ tier copy in `get-started-form-tier-copy.ts`) | EN + ES both required for every string change |

### Verified behavior today (do not re-derive)

1. Form IS lead-gen: every submit inserts a `saas_marketing_signups` row with
   full UTM/referrer/source-page, fires `marketing_funnel_viewed`,
   `marketing_subdomain_typed`, `marketing_subdomain_checked`,
   `marketing_waitlist_submitted` / `marketing_submit_failed` events
   (idempotent-per-session via `trackOnce`), sends confirmation + founder
   digest emails, and rate-limits by IP with a honeypot.
2. Form does NOT create the workspace. Eligible leads are sent to
   `app.tulala.digital` onboarding with the `leadId`; slug is pre-reserved in
   `saas_subdomain_reservations`.
3. Signed-in state is HALF-wired: a banner says "You're signed in as
   {email}. This workspace will be added to your account." and
   `actorUserId` rides a hidden field — but the form still renders name +
   email inputs and the footer still shows "Already have an account? Sign in".
4. The business's human NAME is never captured anywhere — only the slug.

### Owner decisions (locked — do not re-litigate)

- D1: Business name is the FIRST field; it live-generates the slug; slug stays
  editable. Example: "Riviera Maya Work" → `tulala.digital/riviera-maya-work`.
- D2: Signed-in users get a compressed form: NO name input, NO email input,
  NO "Already have an account?" footer. Business name + link + CTA only.
- D3: Optional collapsed "Add a short description" disclosure; value is stored
  on the lead and passed to onboarding (future AI-generate seed). NOT a
  visible textarea by default.
- D4: "Which describes you best?" (audience) becomes OPTIONAL, defaulting to
  `operator` ("Just me"), visually demoted below the name/link block. Do NOT
  delete it — it routes onboarding flavor and segments leads.
- D5: Team-size chips (`rosterSize`) move OUT of the visible form; submit the
  existing default (`1-5`) via hidden field. Column stays NOT NULL — no schema
  loosening needed.
- D6: Keep ALL lead-gen plumbing byte-compatible: analytics event names,
  honeypot, rate limit, UTM fields, emails, `leadId` return shape.
- D7: Replace the `Reference: <code>` post-submit UI with the reserved link:
  "We saved your spot: tulala.digital/{slug}".
- D8: CTA fine print: one line under the button — plain-language "takes you
  straight to your new workspace, no credit card" (EN + ES).
- Copy rules (standing): NO em dashes in user-facing copy. Never
  "buyer"/"cart". Every new string needs EN + ES.

---

## 1. Work items

### W1 — migration (one file, one timestamp)

New migration (take timestamp with `date -u +%Y%m%d%H%M%S` at start of work):

```sql
ALTER TABLE public.saas_marketing_signups
  ADD COLUMN IF NOT EXISTS business_name TEXT,
  ADD COLUMN IF NOT EXISTS business_description TEXT;
```

Nullable, additive, no backfill, no RLS change. Per CLAUDE.md:
`npm run db:push` BEFORE the PR merges — this is part of the commit, not
optional. If push hits SASL/history drift, use the MCP `execute_sql` fallback
protocol (memory: `project_supabase_push_protocol.md`).

### W2 — server action

In `actions.ts`:
- Extend `SignupSchema`: `businessName: z.string().trim().min(2).max(120)`,
  `businessDescription: z.string().trim().max(500).optional().or(z.literal(""))`.
- Insert both into the new columns.
- Include `business_name` in the founder digest email body.
- Thread `businessName` into the onboarding redirect so the workspace is born
  pre-named (inspect `buildWorkspaceOnboardingPath` / the onboarding page's
  query params in `web/src/lib/saas/workspace-signup.ts` and extend whatever
  contract exists there — read it first, keep it backward-compatible for
  leads without a business name).

### W3 — form: business-name-first + auto-slug

In `get-started-form.tsx`:
- New visible field `businessName` at the top of the form (above audience).
- Live slugify → `subdomain` field (lowercase, hyphens, strip diacritics —
  reuse an existing slugify if one exists in `lib/` before writing one; check
  `WORKSPACE_SLUG_REGEX` in `lib/saas/workspace-signup.ts` for the target
  shape, max 32 chars).
- Once the user manually edits the slug field, STOP auto-syncing (dirty flag).
- The existing availability check + `marketing_subdomain_checked` event keep
  firing off the slug value exactly as today.
- Collapsed description disclosure (D3) → `businessDescription`.
- Demote audience per D4 (optional, default operator); remove roster chips per
  D5 (hidden `rosterSize` default stays).
- New funnel event ONLY if trivially additive: `marketing_business_name_typed`
  via the existing `trackOnce` pattern; must be added to
  `PRODUCT_ANALYTICS_EVENTS` or dropped — do not invent an untyped event.

### W4 — signed-in compression

- Page already passes `initialSignedIn`. In the form, when set: hide
  name/email inputs (submit them as hidden fields from `initialSignedIn`),
  hide the "Already have an account? Sign in" footer, keep the signed-in
  banner. Guest rendering unchanged.
- Post-submit success state per D7 (both modes).

### W5 — copy (EN + ES)

All new strings through the marketing copy module, both locales, no em
dashes: business-name label + placeholder ("e.g. Riviera Maya Work"),
description toggle label, demoted-audience label, CTA fine print, saved-spot
success line.

---

## 2. Gates and protocol (binding)

1. Branch off latest main: `git fetch origin && git switch -c feat/get-started-business-name origin/main`
   — in an ISOLATED WORKTREE, never `git switch` the shared checkout
   (`git worktree list` first; symlink `web/node_modules` + `web/.env.local`
   into the worktree).
2. One migration timestamp; `npm run db:push` before merge (W1 note).
3. Gate before every commit:
   `cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit && npm run lint`
   (never run tsc while a dev server is up; never tsc+next build together).
4. PR to `main`; squash-merge. Known-flaky CI: "Fidelity goldens" (storefront
   AA drift) and a pre-existing `edit-context.undo.test.tsx` failure in
   "Structural quality gate" — both unrelated to this surface; confirm the
   failures match those signatures before treating CI as green-enough.
5. **After merge: verify the prod ALIAS.** GitHub auto-deploy does NOT reliably
   repoint `tulala.digital` / `app.tulala.digital` (bit us twice on
   2026-07-11). Check the newest production deployment carries the
   `tulala-git-main-…` alias, then if the customer domains lag:
   `npx vercel alias set <deploy-url> tulala.digital --scope oran-tenes-projects`
   (and same for `app.tulala.digital`). Then `cd web && npm run deploy:smoke`.

---

## 3. QA protocol (what "done" means)

Localhost first (standing preference), but remember: on localhost ALL ports
share one cookie jar, so signed-in state on localhost proves nothing about
cross-host behavior — final signed-in QA happens on the live hosts.

Guest mode (incognito, live `tulala.digital/get-started`):
- [ ] Type "Riviera Maya Work" → link preview shows
      `tulala.digital/riviera-maya-work`, availability check fires.
- [ ] Edit slug manually → typing more in business name no longer overwrites it.
- [ ] Submit → row lands in `saas_marketing_signups` WITH `business_name`
      (verify via service-role SQL), reservation row exists, founder digest
      email mentions the business name, success UI shows the saved link (D7).
- [ ] Honeypot + rate limit still work (fill `company_website` → filtered).

Signed-in mode (live, real account):
- [ ] No name/email inputs, no "Already have an account?" footer, banner shows.
- [ ] Submit → lead row carries `actorUserId` linkage exactly as before, and
      the onboarding redirect carries the business name.

Both:
- [ ] ES locale renders every new string (no EN leakage) — check with the ES
      toggle, and remember chrome i18n only flips after hydration.
- [ ] Funnel events fire once each in the browser console/network
      (`marketing_funnel_viewed`, `subdomain_typed`, `subdomain_checked`,
      submit event) — event names unchanged.
- [ ] `npm run deploy:smoke` green after the prod alias check.

## 4. Out of scope (do not touch)

- Auth routes (`/auth/google`, `/auth/callback`) — just fixed (PRs #799/#800),
  leave them alone.
- Onboarding flow itself beyond threading the business name through.
- Pricing tiers/cards on the page, `loadMarketingTiers`, discount validation.
- The "login as modal on the apex" idea — separate future initiative, not this.
- Any renaming of existing analytics events or table columns.
