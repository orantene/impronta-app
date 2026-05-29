# Remediation phase prompts — 2026-05-28

Six self-contained prompts, one per phase of the master plan at
`web/docs/product-flow-remediation-plan-2026-05-28.md`. Paste each
verbatim into a fresh chat — they assume **no** carry-over context.

Model recommendation header on each. **Effort hours** assume one
engineer; double for "review + iterate" loops.

---

## Phase A — Default storefront homepage

**Model: Sonnet · Effort: 1–2 days (10–14 hrs)**

```text
You are working on the Tulala SaaS monorepo at /Users/oranpersonal/Desktop/impronta-app.
The app lives in `web/` and deploys to Vercel.

READ FIRST (project conventions):
- `CLAUDE.md` at repo root — deploy protocol, schema-shipping rule, branch
  workflow. `main` is canonical; never push directly.
- `web/AGENTS.md` — "This is NOT the Next.js you know." Heed deprecation
  notices in `web/node_modules/next/dist/docs/` before writing route code.
- `web/docs/product-flow-remediation-plan-2026-05-28.md` — the master plan.
  Your scope is Phase A only; the F-codes you close are F3 and F27 setup.

CONTEXT:
- Multi-tenant SaaS. Middleware at `web/src/proxy.ts` resolves the incoming
  Host header against the `agency_domains` table and rewrites to internal
  tenant routes. A host not in `agency_domains` returns 404 before route
  matching.
- Workspace public routes live under `web/src/app/(workspace)/[tenantSlug]/`.
  Today only `admin/`, `client/`, `talent/` exist. There is NO root
  `page.tsx` for `[tenantSlug]`, so every workspace shows a branded 404 at
  its own domain until someone publishes a page through the (unfinished)
  page builder.
- Workspaces (rows in `agencies` table) have: `id, display_name, slug, kind,
  plan_tier, talent_seat_limit, status, created_at, updated_at, settings (jsonb)`.
- Server actions for talent reads: see `web/src/lib/server-data/` and the
  existing roster code in `web/src/app/(workspace)/[tenantSlug]/admin/roster/`.
- The platform-admin Domains controls live at
  `web/src/app/(workspace)/platform/admin/tenants/tenant-sections-control.tsx`
  and the server actions in `actions-control.ts` — DO NOT change those.
  You will add ONE call from `actionCreateTenant` (same file).

WHAT TO BUILD:

1. Create `web/src/app/(workspace)/[tenantSlug]/page.tsx`. A server component
   that loads the agency row by slug and renders a Tulala-default homepage:
   - Hero: workspace display name as <h1>, tagline from
     `agencies.settings.tagline ?? "Coming soon"`, brand color background
     from `agencies.settings.branding.primaryColor ?? Tulala neutral`.
   - Roster grid: query `talent_profiles where tenant_id = workspace.id and
     status = 'published'` (use the same loader the workspace admin uses).
     Empty state: "No talent yet — check back soon."
   - Single inquiry CTA — a link to `/[tenantSlug]/inquiry` (route may not
     exist yet; for Phase A just link to it, the form is owned by Discover
     binding spec). Empty-state version: a `mailto:` to the workspace
     contact email if set in `agencies.settings.contact_email`.
   - Branded layout: shares the same fonts and base CSS reset as the rest
     of the `(public)` group (check `web/src/app/(public)/layout.tsx`).
   - Set page metadata: `<title>${displayName} — Tulala</title>`,
     description from settings.
   - Add `export const dynamic = "force-dynamic"` (workspace data changes
     too often to cache).

2. In `web/src/app/(workspace)/platform/admin/tenants/actions-control.ts`,
   inside `actionCreateTenant`, after the agency row is inserted and
   ownership is granted, automatically insert an `agency_domains` row:
   ```
   { tenant_id: newAgencyId, hostname: `${slug}.tulala.digital`,
     kind: 'subdomain', is_primary: true, status: 'active',
     verified_at: NOW(), ssl_provisioned_at: NOW() }
   ```
   Use the same insert pattern the existing `actionAddDomain` uses. If the
   insert fails (e.g. someone already manually claimed the host), log via
   `logServerError` but DO NOT fail workspace creation — surface the
   failure to the admin in the response payload as a non-fatal warning.

3. Read the `is_reserved_platform_hostname()` Postgres function in
   `supabase/migrations/20260905121000_agency_domains_custom_hostname_guard.sql`
   to make sure your inserted hostname passes the check constraint
   (subdomain rows with a `.tulala.digital` suffix are fine).

DEV LOOP:
- Dev server already runs at `app.lvh.me:3000` once `cd web && npm run dev`.
  Allowed dev origins are configured in `next.config.ts`. Add
  `*.tulala.digital.lvh.me` if you need to test wildcard subdomain hits
  locally — but `lvh.me` already wildcard-resolves to 127.0.0.1.
- Gate before commit: `cd web && npx tsc --noEmit && npm run lint`.
- Branch off latest `main`: `git fetch origin && git switch -c phase-a-default-storefront origin/main`.

ACCEPTANCE TEST (Chrome MCP):
1. Create a new agency through Platform Admin (the modal at
   `/platform/admin/tenants`). Confirm a `<slug>.tulala.digital` row
   appears in the Domains drawer section automatically.
2. Navigate to `<slug>.tulala.digital.lvh.me:3000/` — must render the new
   homepage with workspace name, NOT the branded 404.
3. Existing workspaces (run a backfill INSERT in a separate migration or
   via the platform admin Domain section) also serve the homepage at
   their subdomain.

NON-GOALS:
- Do not build the inquiry form. Just link to `/inquiry`.
- Do not build the page builder. That's Phase C.
- Do not touch admin-shell fixture data. That's Phase B.
- Do not change anything in `platform/admin/tenants/tenant-sections-*.tsx`
  beyond the one call inside `actionCreateTenant`.

DELIVERABLES:
- New file: `web/src/app/(workspace)/[tenantSlug]/page.tsx`
- Edited file: `web/src/app/(workspace)/platform/admin/tenants/actions-control.ts`
- Optional: a small backfill migration in `supabase/migrations/` to seed
  subdomains for existing workspaces.
- PR description references F3 and F27.
```

---

## Phase B — De-fixture the admin shell

**Model: Opus (planning + first surface) → Sonnet (replication) · Effort: 3–5 days (24–40 hrs)**

```text
You are working on the Tulala SaaS monorepo at /Users/oranpersonal/Desktop/impronta-app.
The app lives in `web/` and deploys to Vercel.

READ FIRST:
- `CLAUDE.md` at repo root — deploy protocol; never push directly to `main`.
- `web/AGENTS.md` — Next.js breaking changes warning.
- `web/docs/product-flow-remediation-plan-2026-05-28.md` — master plan.
  Your scope is Phase B. F-codes you close: F1, F2 url, F7, F8, F10, F11,
  F12, F17, F21, F22, F23.

CONTEXT:
- The workspace admin shell at
  `web/src/components/admin/shell/internal/` is a sophisticated prototype
  state machine. Many surfaces still read from in-memory fixtures
  (PROTO_TENANT_ID = "tenant.acme-models", WEBSITE_STATE object,
  MOCK_BOOKINGS arrays, TOP_PERFORMERS rows, "SS27 capsule" copy, etc.).
  These fixtures override whatever real workspace the user is in, so a
  brand-new workspace today shows 4,730 visits / Vogue Italia bookings /
  acme-models.tulala.digital URL.
- The real workspace ID is available via the existing
  `useAdminShell().effectiveTenant` context (and on the server via the
  route param `tenantSlug` → lookup against `agencies` table).
- Real data sources you can use:
  - `agencies.{id, display_name, slug, plan_tier, settings}` for identity
  - `agency_domains where tenant_id = X` for the LIVE URL
  - `inquiry_bookings where tenant_id = X` for the calendar
  - `inquiry_threads where tenant_id = X` for unread counts and the
    notifications bell
  - `talent_profiles where tenant_id = X and status = 'published'` for
    roster counts on the activation arc
- You will need ONE new Supabase view for cumulative analytics
  (page views / inquiries / bookings / revenue). Either:
  (a) create `agency_analytics_aggregates` rolling-7-day view, OR
  (b) ship Phase B with zeros + helper copy ("Analytics start once you
       have visits") and defer the view to a separate ticket.
  Pick (b) unless you've already wired analytics elsewhere in the codebase
  — grep first.

WHAT TO BUILD:

1. STRATEGY PASS (Opus reasoning):
   Read `components/admin/shell/internal/` end-to-end. Inventory every
   fixture symbol (PROTO_TENANT_ID, WEBSITE_STATE, MOCK_BOOKINGS,
   TOP_PERFORMERS, fixture copy banners, hard-coded "acme-models"
   strings). For each, decide:
     - REPLACE WITH REAL LOADER: name the table/view, write the loader.
     - REPLACE WITH EMPTY STATE: copy goes here. Helper text goes here.
     - DELETE: when fixture has no real-data equivalent yet.
   Write the inventory to `web/docs/admin-shell-defixture-inventory.md`
   BEFORE starting the refactor. The integrator will sanity-check the
   inventory before approving the refactor commit.

2. EXECUTE (Sonnet replication after Opus inventory):
   - Replace `PROTO_TENANT_ID` everywhere. Pipe `effectiveTenant.id` down
     via existing context (don't add prop drilling).
   - Replace the `WEBSITE_STATE` static object with a server-loaded one.
     For the LIVE URL: read `agency_domains` row where `is_primary=true`.
     Fallback: `<slug>.tulala.digital` text (Phase A ensures this row
     exists for new workspaces; backfill exists for old ones).
   - Replace `MOCK_BOOKINGS` with a real loader from `inquiry_bookings`.
     Empty state: "No bookings yet — they'll appear here once a client
     confirms."
   - Replace TOP_PERFORMERS table with real per-page analytics IF you
     went with option (a) above; otherwise replace the panel with a
     friendly "Top pages will appear once you have visits" empty state.
   - Remove the "SS27 capsule" banner and any other fixture copy that has
     no corresponding workspace setting. If a workspace later wants
     announcements, they can use the page builder (Phase C).
   - Activation arc completion booleans (F22): each step's `done` flag
     reads from real counts:
       - Add talent: `talent_profiles.count(tenant_id) > 0`
       - Publish profile: `talent_profiles.count_where(status=published) > 0`
       - Storefront link: any `agency_domains` row exists (Phase A)
       - Demo inquiry: `agencies.settings.activation.demo_inquiry_done`
         boolean — only flip after a real demo inquiry is submitted.
       - Invite teammate: `agency_memberships.count(tenant_id) > 1`
   - Roster nav-tab badge (F5/F24): switch to the SAME query as the page
     body. Single source of truth.
   - Notifications bell (F21): scope to current workspace. If you need
     cross-workspace, add a second indicator with a clear "All
     workspaces" label.

DEV LOOP:
- `cd web && npm run dev` (already configured for `app.lvh.me:3000`).
- Gate: `cd web && npx tsc --noEmit && npm run lint`.
- Branch: `git switch -c phase-b-defixture-shell origin/main`.

ACCEPTANCE TEST (Chrome MCP, in order):
1. Create a fresh workspace called "QA Defixture Test".
2. Open `/qa-defixture-test/admin/website` → LIVE URL reads
   `qa-defixture-test.tulala.digital`, NOT `acme-models.tulala.digital`.
3. VISITS / INQUIRIES / BOOKINGS / REVENUE all read 0 (or hidden with
   helper copy).
4. Calendar tab → "No bookings yet" empty state, NOT Mango / Vogue
   bookings.
5. Overview tab → activation arc shows step 1 incomplete; add a talent;
   reload; step 1 ticks green.
6. Open Impronta Models in another tab — its real data is unchanged.

NON-GOALS:
- Do not build the page builder backend. That's Phase C.
- Do not fix roster talent-draft persistence. That's Phase D.
- Do not wire `/messages`, `/pitches`, `/operations`, `/production`.
  Those are Phase E.

DELIVERABLES:
- New inventory doc: `web/docs/admin-shell-defixture-inventory.md`.
- Edited files: anything in `web/src/components/admin/shell/internal/`
  that touches `PROTO_TENANT_ID`, `WEBSITE_STATE`, `MOCK_BOOKINGS`,
  `TOP_PERFORMERS`, or fixture banners. Probably 15–30 files.
- Optional: 1–2 small Supabase views in `supabase/migrations/` if you
  chose option (a) for analytics.
- One commit per logical surface (Website, Calendar, Overview-activation-
  arc, Roster-badge, Bell). NOT one giant commit.
```

---

## Phase C — Page builder backend

**Model: Opus (schema + actions design) → Sonnet (UI components) · Effort: 4–6 days (32–48 hrs)**

```text
You are working on the Tulala SaaS monorepo at /Users/oranpersonal/Desktop/impronta-app.
The app lives in `web/` and deploys to Vercel.

READ FIRST:
- `CLAUDE.md` — deploy + schema-shipping protocol. New migrations require
  `npm run db:push` AS PART OF THE COMMIT, not later.
- `web/AGENTS.md` — Next.js 16 breaking changes.
- `web/docs/product-flow-remediation-plan-2026-05-28.md` — master plan.
  Scope: Phase C. F-codes you close: F2 builder, supplies F3 publish flow.
- `web/src/middleware.ts` §326 and §526 — the rewrite logic for CMS clean
  URLs is already there: a single-segment path on an agency host gets
  rewritten to `/p/{slug}` which is rendered by
  `web/src/app/(public)/p/[[...slug]]/page.tsx`. You will wire the data
  source for that route.

CONTEXT:
- Tulala workspaces today have NO `workspace_pages` table. The public
  rewrite target exists but reads from fixtures.
- Tenancy: every page belongs to one `agency` (`tenant_id` column,
  FK + RLS).
- The admin shell already has a "Website" tab UI (Phase B reworks its
  numbers); the BUILDER drawer is fixture-only today.

WHAT TO BUILD:

1. SCHEMA (Opus reasoning required — design before coding):
   New migration in `supabase/migrations/<ts>_workspace_pages.sql`:
     - `workspace_pages` (id uuid pk, tenant_id uuid fk agencies(id) on
       delete cascade, slug text, title text, status text check
       in ('draft','scheduled','published'), blocks jsonb, theme jsonb,
       published_at timestamptz, scheduled_for timestamptz, created_by
       uuid fk profiles(id), created_at, updated_at). Unique
       (tenant_id, slug). RLS: members of `tenant_id` can read/write;
       anonymous can read where `status='published'`.
     - `workspace_page_revisions` (id, page_id fk on delete cascade,
       blocks jsonb, theme jsonb, created_by, created_at). For
       autosaved drafts and rollback. Trigger inserts a revision on
       every `workspace_pages` UPDATE.
   Apply with `cd web && npm run db:push` IN THE SAME COMMIT.

2. SERVER ACTIONS in
   `web/src/app/(workspace)/[tenantSlug]/admin/website/actions.ts`
   (create file). Each action is `"use server"` and checks:
   (a) the actor has an admin membership on the tenant via the existing
   capability helper (`web/src/lib/access/capabilities.ts`), AND
   (b) the tenant_id matches.
   Actions: `createPage`, `updatePageBlocks`, `updatePageTheme`,
   `publishPage`, `unpublishPage`, `schedulePage`, `deletePage`.
   Every successful action calls
   `revalidatePath(`/${tenantSlug}/p/${page.slug}`)` and the parent
   `/${tenantSlug}` so the public storefront updates immediately.

3. PUBLIC RENDER at
   `web/src/app/(public)/p/[[...slug]]/page.tsx` (or wherever the
   middleware §326 currently points). Server component that:
     - reads the rewritten `tenantSlug` from the request headers
       (HOST_TENANT_SLUG_HEADER — see `web/src/proxy.ts`)
     - looks up the page by (tenant_id, slug) where status='published'
     - renders the blocks array
     - falls back to the Phase A default homepage when slug is empty
       and no page exists
   Blocks renderer: support hero, text, image, gallery, roster (reads
   from talent_profiles), cta. Each block is a small server component in
   `web/src/components/page-builder/blocks/`. Keep theme tokens
   (background, font color, font family) as CSS custom properties on the
   page <main>.

4. BUILDER UI in
   `web/src/components/admin/shell/internal/page-modules/page-builder/`.
   Minimum viable surfaces:
     - Pages list: table of pages with status pill + last-edited + slug.
       "+ New page" button → action createPage with default blocks.
     - Page editor: left sidebar = block list (drag to reorder),
       middle = preview iframe pointing at
       `/${tenantSlug}/p/${slug}?preview=1`, right sidebar = block props
       editor.
     - Theme panel: 2 controls — background color picker, font color
       picker, optional font family dropdown. (User asked for "white
       background and blue fonts" — make sure that combination works
       on day 1.)
     - Publish button: action publishPage with confirmation modal.

DEV LOOP:
- `cd web && npm run dev`.
- Migration: write the SQL, then `cd web && npm run db:push`.
- Gate: `cd web && npx tsc --noEmit && npm run lint`.
- Branch: `git switch -c phase-c-page-builder origin/main`.

ACCEPTANCE TEST (Chrome MCP):
1. Create a workspace called "QA Builder Test".
2. Open `/qa-builder-test/admin/website` → "+ New page" → set title
   "About", slug "about". Save.
3. Add a hero block + text block + CTA block in the editor. Set theme
   background to white, font color to blue (#1d4ed8). Save.
4. Click Publish. Confirm modal → confirm.
5. Visit `qa-builder-test.tulala.digital.lvh.me:3000/about` (or whatever
   the route resolves to per middleware). Page renders with white bg
   and blue text. No 404.
6. Edit the text in the builder. Republish. Public page updates within
   1 refresh.
7. Unpublish. Public page 404s (or falls back to the Phase A homepage).

NON-GOALS:
- Do not build a rich-text editor inside text blocks; use a textarea +
  basic markdown render for v1.
- Do not build a drag-from-block-library UX; "+ Add block" → modal with
  type picker is fine.
- Do not implement scheduled publish in v1 — leave the column in the
  schema but the UI is "Publish now" only.
- Do not touch fixture removal — that's Phase B.
- Do not change roster persistence — that's Phase D.

DELIVERABLES:
- Migration files (workspace_pages, workspace_page_revisions).
- `web/src/app/(workspace)/[tenantSlug]/admin/website/actions.ts`
- `web/src/app/(public)/p/[[...slug]]/page.tsx` rewired to real data.
- `web/src/components/page-builder/blocks/*` (5–6 small components).
- `web/src/components/admin/shell/internal/page-modules/page-builder/*`
- PR description references F2 builder + supplies F27 end-to-end.
```

---

## Phase D — Roster persistence + talent editor UX

**Model: Opus · Effort: 3–4 days (24–32 hrs)**

```text
You are working on the Tulala SaaS monorepo at /Users/oranpersonal/Desktop/impronta-app.
The app lives in `web/` and deploys to Vercel.

READ FIRST:
- `CLAUDE.md` — schema shipping rule.
- `web/AGENTS.md`.
- `web/docs/product-flow-remediation-plan-2026-05-28.md` — master plan.
  Scope: Phase D. F-codes you close: F4, F5, F14, F15, F16, F24.

CONTEXT:
- The roster editor is the highest-impact surface for new-workspace
  activation. In the audit, two attempts to add a talent both silently
  lost the draft on drawer dismiss with no toast/recovery.
- The current editor uses a cascade validation pattern ("Pick primary
  talent type" → then "Enter home base" → etc.) that creates a series of
  one-error-at-a-time gates with no overview.
- Roster nav-tab badge and page body talent count disagree (badge:
  fixture; page: real).
- Talent editor is oriented to fashion / DJ / chef taxonomies. A user
  trying to add hotel staff or laundry concierge has no good fit.
- See user-memory:
  `~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/`
  files `feedback_engine_comprehensive_not_pilot.md`,
  `feedback_admin_edit_ux.md`,
  `feedback_admin_editor_field_layout.md`. They describe the user's
  hard preferences on talent-editor UX — read them before designing.

WHAT TO BUILD:

1. PERSIST-ON-EVERY-BLUR (the core unlock):
   - In the add-talent flow, create a draft `talent_profiles` row on
     first keystroke. Use status='draft'.
   - Every field blur autosaves to that row via a debounced server
     action.
   - On drawer close (X, Escape, click-outside, "Save & exit"): no work
     is lost — the draft persists.
   - The roster page shows draft rows as ghosted cards with a "Continue"
     button. Clicking reopens the editor pointed at the same draft.
   - "Discard draft" is an explicit affordance inside the editor.

2. REPLACE CASCADE VALIDATION:
   - Add a "Ready to publish" checklist panel at the TOP of the editor:
       [ ] Name
       [ ] Primary talent type
       [ ] Home base
       [ ] At least one photo
   - Each item ticks off as the user fills the relevant field. Order does
     not matter.
   - Publish button enabled only when all four are green. Otherwise it
     reads "Save draft & exit" and continues to autosave.
   - Remove the inline "Pick a primary talent type to continue" red
     banner.

3. ADD "SERVICES" TAXONOMY (F16):
   - In the field-catalog / talent-type taxonomy, add a top-level
     category "Services" alongside Models / Hosts / Performers / Music /
     Wellness / Photo&Video / Creators.
   - Subcategories under Services: Hospitality, Cleaning, Transport,
     Security, Catering, Retail, Technical. These are the v1 set; more
     can land later without re-architecting.
   - A talent in Services has different relevant fields than a fashion
     talent. Update the field-catalog (per the user's
     `feedback_engine_comprehensive_not_pilot.md` rule — comprehensive
     mapping across all parent categories, NOT a pilot for one).
   - For Services profiles, the gallery is "photos of work / venue"
     not "portfolio" — adjust copy.

4. ROSTER NAV-TAB BADGE = PAGE BODY COUNT (F5/F24):
   - Identify the badge data source today (grep for "Roster 2" or
     similar). Switch it to read from the SAME query as the page body
     uses (likely `loadTenantTalentList(tenantId)` or equivalent).
   - This usually means lifting the query to the admin layout and
     passing the count down via the existing
     `useAdminShell()` context.

5. SAVE & EXIT SEMANTICS:
   - Bottom toolbar: "Save draft & exit" (always available) + "Publish"
     (gated on the checklist).
   - "Publish" runs the same `submitTalentProfile` server action with
     status flipped to 'published'.

DEV LOOP:
- `cd web && npm run dev`.
- New migration if needed (e.g. a status column already exists; check
  first with `grep "talent_profiles" supabase/migrations/`).
- Gate: `cd web && npx tsc --noEmit && npm run lint`.
- Branch: `git switch -c phase-d-roster-persistence origin/main`.

ACCEPTANCE TEST (Chrome MCP):
1. Create a workspace "QA Roster Test".
2. Open Roster → + Add talent. Type "Maria H" in the name field. Click
   X to close drawer.
3. Reload roster page. Maria H appears as a draft card with
   "Continue" CTA.
4. Click Continue → editor reopens with Maria H name pre-filled.
5. Fill all four checklist items (Name, Type=Services > Hospitality,
   Home base=Playa del Carmen, upload a photo). Each ticks green.
6. Publish. Public roster grid (via Phase A homepage) shows Maria H.
7. Roster nav-tab badge = page body count = 1 (NOT a fixture number).
8. Try the same flow but Service > Cleaning. Field catalog adapts;
   no "portfolio" leakage in copy.

NON-GOALS:
- Do not rewrite the entire talent editor's 15 sections — additive
  changes only.
- Do not touch the platform-admin tenants surfaces.
- Do not change the public storefront — it's already built in Phase A
  and consumed via Phase C blocks.

DELIVERABLES:
- Migration if schema changes (status default='draft' if not present).
- Edited talent editor + field-catalog files in
  `web/src/components/admin/shell/internal/talent-drawers/` and
  `web/src/components/admin/shell/internal/field-catalog.ts`.
- Possibly a new draft list loader in the roster page.
- PR description references F4, F5, F14, F15, F16, F24.
```

---

## Phase E — Tab-by-tab wiring

**Model: Sonnet · Effort: 4–6 days (32–48 hrs)**

```text
You are working on the Tulala SaaS monorepo at /Users/oranpersonal/Desktop/impronta-app.
The app lives in `web/` and deploys to Vercel.

READ FIRST:
- `CLAUDE.md`, `web/AGENTS.md`.
- `web/docs/product-flow-remediation-plan-2026-05-28.md` — master plan.
  Scope: Phase E. F-codes you close: F6, F13, F18, F19, F20.

CONTEXT:
- Phase B (de-fixture admin shell) is assumed done. If it isn't, your
  changes will collide with the fixture-loader migration — coordinate
  with whoever is running Phase B before starting.
- Several admin tabs render blank, never navigate, or have stale
  gating from prototype days.

WHAT TO BUILD (5 small independent slices, ship one at a time):

E1 — Messages tab (F6):
- `/[tenantSlug]/admin/messages` currently renders a completely blank
  body for new workspaces. Find the page component (it's a thin server
  component that delegates to `components/admin/shell/internal/...`).
- Wire it to `inquiry_threads where tenant_id = current`.
  Use the existing thread loader if one exists; otherwise create a
  small one.
- Empty state: "No messages yet — they'll appear here as clients reach
  out via your storefront." with a link to the workspace public URL.
- Header counter (e.g. "0 pending") reads from the same query.

E2 — Pitches tab (F13):
- Clicking the Pitches tab doesn't change the URL. The nav button is
  wired in the tab strip but the route either doesn't exist or has a
  bad navigate handler. Diagnose by grepping the tab definitions in
  `components/admin/shell/internal/` and the routes under
  `app/(workspace)/[tenantSlug]/admin/`.
- Wire the route. Surface should read from existing `inquiry_pitches`
  table (per `project_pitch_feature.md` binding spec).

E3 — Operations & Production tabs:
- Audit each. Same de-fixturing approach as Phase B — real data or
  honest empty state.

E4 — Domain Drawer gating (F18):
- File:
  `web/src/components/admin/shell/internal/drawers/light-05.tsx`
  exports `DomainDrawer`. It's gated by
  `meetsPlan(state.plan, "studio")`. This means Free-tier owners can't
  see their own subdomain through the drawer.
- Change: every workspace can see / copy their assigned subdomain
  (read from `agency_domains where is_primary and tenant_id`). Custom
  domain entry (the text input + Verify flow) stays gated on Studio+.
- Update the activation-arc CTA copy: "Set your workspace domain →
  Configure" should change for Free workspaces to "Your storefront
  lives at <slug>.tulala.digital. Want a branded domain? Upgrade to
  Studio."

E5 — Wrong-workspace redirects (F19, F20):
- `/[tenantSlug]/talent` while signed in as owner of a DIFFERENT
  workspace currently silently switches to that other workspace and
  shows a celebration modal. That's wrong.
  - If user is owner of `tenantSlug`: redirect to
    `/${tenantSlug}/admin/roster` with toast "Open your workspace admin
    to manage talent."
  - If user has no talent profile here: render
    "Create your talent profile here" CTA (existing design in
    `project_workspace_talent_hybrid.md` binding).
  - NEVER silently switch workspaces.
- `/[tenantSlug]/client` for a non-client (e.g. the workspace owner)
  currently returns a generic branded 404. Render instead a soft page:
  "You don't have a client account on this workspace.
   [Sign in as a client] · [Open admin dashboard]".

DEV LOOP:
- `cd web && npm run dev`.
- Gate: `cd web && npx tsc --noEmit && npm run lint`.
- Branch: `git switch -c phase-e-tab-wiring origin/main`.
- Commit one slice (E1–E5) at a time; do not bundle.

ACCEPTANCE TEST (Chrome MCP, one per slice):
- E1: Fresh workspace → /admin/messages → header + empty state visible,
  no blank page.
- E2: Click Pitches tab → URL updates to /admin/pitches → empty state
  rendered.
- E3: Operations + Production tabs → real data or "Nothing yet" copy.
- E4: Free-tier workspace owner opens Domain Drawer → sees the assigned
  subdomain with Copy button. Tries custom-domain input → Studio
  upsell. Studio-tier owner gets the full surface.
- E5a: Signed in as owner-of-A; visit /b/talent → land on /b/admin
  with a "Create your talent profile here" CTA or a redirect to your
  own /a/admin/roster (decide which on read of the hybrid binding doc).
- E5b: Signed in as owner-of-A; visit /a/client → soft landing page
  with two CTAs, NOT a branded 404.

NON-GOALS:
- Do not redesign any tab beyond making it serve real data.
- Do not touch platform admin.
- Do not modify roster code (Phase D).

DELIVERABLES:
- Five small commits, one per slice (E1–E5).
- PR description references F6, F13, F18, F19, F20.
```

---

## Phase F — Polish

**Model: Sonnet · Effort: 1–2 days (8–14 hrs)**

```text
You are working on the Tulala SaaS monorepo at /Users/oranpersonal/Desktop/impronta-app.
The app lives in `web/` and deploys to Vercel.

READ FIRST:
- `CLAUDE.md`, `web/AGENTS.md`.
- `web/docs/product-flow-remediation-plan-2026-05-28.md` — master plan.
  Scope: Phase F. F-codes you close: F25, F26.

WHAT TO BUILD:

F1 (polish, NOT to be confused with code F1) — row-level optimistic
   update for plan-override remove (F25):
- Platform admin → Tenants list → Manage drawer → remove an override.
  The drawer refreshes correctly (the REFRESHING indicator I shipped
  earlier handles that) but the LIST-PAGE ROW DOT (the green dot next
  to the AGENCY plan chip) stays visible for ~300 ms after the action.
- File:
  `web/src/app/(workspace)/platform/admin/tenants/TenantsClient.tsx`.
- Approach: when the drawer's onChanged fires (passed up via callback
  from TenantDrawer), optimistically remove that tenant's
  `hasActiveOverride=true` from the local rows state, alongside the
  router.refresh() that's already running. The router refresh will
  then reconcile.

F2 (polish) — workspace × talent hybrid flow end-to-end QA (F26):
- File path: see `feedback_client_is_client_no_hybrid.md` and
  `project_workspace_talent_hybrid.md` in user-memory for the canonical
  design.
- In Settings → "Want to take bookings yourself?" card, click "Create →".
- Verify the resulting talent profile:
  - Is created with the workspace owner as the linked profile.
  - Appears in the workspace's own /[tenant]/admin/roster.
  - Has the workspace's tenant_id on the talent_profiles row.
  - Does NOT toggle the owner's account type into a client/talent
    hybrid (that's the explicit anti-pattern in
    `feedback_client_is_client_no_hybrid.md`).
- This is a QA pass, not a build. If anything is missing, file a
  follow-up; do not extend scope here.

DEV LOOP:
- `cd web && npm run dev`.
- Gate: `cd web && npx tsc --noEmit && npm run lint`.
- Branch: `git switch -c phase-f-polish origin/main`.

ACCEPTANCE TEST:
- F1: open Manage drawer for a workspace with an override; remove the
  override; the row's plan-column dot disappears immediately (within
  one paint frame), not after a 300ms gap.
- F2: as the QA pass above. Document findings in
  `web/docs/hybrid-flow-qa-2026-MM-DD.md`.

NON-GOALS:
- Do not extend the hybrid feature in either direction. Just QA it and
  report.
- Do not touch other phases' surfaces.

DELIVERABLES:
- One edit to TenantsClient.tsx for F1.
- One QA doc for F2.
- PR description references F25, F26.
```

---

## How to use these prompts

1. Open a fresh Claude chat (Web or Code) in `/Users/oranpersonal/Desktop/impronta-app/`.
2. Pick the model recommended in the header for that phase.
3. Paste the prompt verbatim.
4. Let the agent read the master plan and produce a sub-plan or
   inventory before any code (especially for B and C — that's the
   "Opus reasoning required" step).
5. Approve the sub-plan, then let it execute.
6. Run the acceptance test in Chrome / Chrome MCP yourself before
   merging — the agent should also self-test but you make the final
   call.
7. Multi-agent coordination: if you run multiple phases in parallel,
   each goes on its own branch off `main` per the integrator protocol
   in `project_multi_agent_integrator_protocol.md`.

## Recommended order

- **Day 1–2:** Phase A (unblocks the domain test today).
- **Day 3–5:** Phase D (highest-impact UX fix, parallel with B).
- **Day 3–7:** Phase B (parallel with D — no overlap in files).
- **Day 6–11:** Phase C (depends on A for the public route fallback,
  builds on B for the admin shell).
- **Day 9–14:** Phase E (parallel with C, no overlap).
- **Day 14–15:** Phase F (after the rest is on `main`).
