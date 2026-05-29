# Product-Flow QA Report — 2026-05-28

Scope: current-state diagnostic for `hotels-express-lavanderia` on localhost.

Environment:
- Repo checkout: `/Users/oranpersonal/Desktop/impronta-app`
- Branch observed: `phase-e-tab-wiring...origin/phase-e-tab-wiring`
- Dev server: `npm run dev` from `web/`, serving `http://localhost:3000`
- Browser: Codex in-app browser, desktop default viewport plus mobile `390x844`
- Important checkout note: `web/src/app/(workspace)/[tenantSlug]/page.tsx` is already untracked in this worktree, so Scenario 1 is no longer a pure "missing route" case here.

## Findings

1. Scenario 1 FAIL: the workspace root returns HTTP 200, but the public page is still not an instant working homepage. It renders: `This site hasn't published a homepage yet.`
   - Evidence: `screenshots/scenario-1-public-home.png`, `screenshots/mobile-public-home.png`

2. Scenario 2 FAIL: the owner dashboard contains workspace identity, but still ships fake/non-tenant data.
   - Found fixture copy: `acme-models.tulala.app`
   - Found fake/live contradiction: admin says storefront is live while public root says no homepage published.
   - Evidence: `screenshots/scenario-2-owner-overview.png`, `scenario-2-owner-overview.dom.txt`

3. Scenario 3 FAIL before mutation: Website -> `Edit homepage` briefly shows `Opening homepage editor...` and remains on `/admin/website`; no editor opens.
   - I did not save or publish public content.
   - Evidence: `screenshots/scenario-3-editor-entry.png`, `screenshots/scenario-5-website-owner.png`

4. Scenario 4 PARTIAL/FAIL: Roster -> Add loads, but the taxonomy is still a huge mixed talent taxonomy. It does include service terms such as `Housekeeper`, `Cleaner`, and `Laundry Assistant`, but it is not a focused service-business taxonomy.
   - I did not create a roster record.
   - Evidence: `screenshots/scenario-4-roster-add.png`

5. Scenario 5 FAIL: several top-level admin pages load, but fixtures/placeholders remain.
   - Website has hard-coded metrics: `4,730`, `23`, `6`, `EUR 14,500`, plus Acme SEO copy.
   - Calendar has non-tenant bookings such as `Vogue Italia`.
   - Discover Inquiries renders `Something broke` with `NEXT_HTTP_ERROR_FALLBACK;404`.
   - Some route captures timed out during browser automation: Overview, Roster Add, Media, Work, Triage, Site.
   - Evidence: `scenario-5-admin-route-sweep.json`, `screenshots/scenario-5-*.png`

6. Scenario 6 PARTIAL/FAIL: DB state matches the runbook caveat, and owner self-serve domain is gated on Free.
   - DB: only domain is `hotels-express.tulala.digital`, `kind=subdomain`, `status=active`, `is_primary=false`.
   - Owner Settings shows `Custom domain Requires Studio or above`.
   - Platform Manage drawer exposes `Set primary`, but I did not mutate domain state.
   - Evidence: `db-sanity.json`, `screenshots/scenario-6-owner-domain-gated.png`, `screenshots/scenario-6-platform-manage-hotels.png`

7. Scenario 7 FAIL/BLOCKED: client can reach the public workspace URL, but it is the unpublished-homepage placeholder. There is no usable public roster/inquiry entry point for this workspace in the tested flow.
   - I did not submit a client inquiry.
   - Evidence: `screenshots/role-client-public.png`

## Regression Sweep

- Domain kind auto-detect FAIL: in Platform -> Manage -> Domains, typing `qa-autodetect.tulala.digital` left the kind select at `custom`, and the `Add` button stayed enabled. No submit was performed.
  - Evidence: `screenshots/regression-domain-autodetect-fail.png`
- Subdomain Remove NOT VERIFIED: the only seeded domain is non-primary but no `Remove` button was visible in the expanded Domains section; this may be because it is the sole domain.
- Status refresh, list-page override stat refresh, optimistic role/name sync NOT EXECUTED because they mutate tenant state.

## Cross-Cutting

- No-fake-data audit: FAIL. `Acme`, `acme-models`, `Vogue Italia`, and `4,730` are present across owner/admin surfaces.
- Mobile: public and owner dashboard had no horizontal overflow at `390x844`, but the same product blockers remain.
- Role matrix:
  - Owner: admin loads.
  - Agency admin: admin loads.
  - Talent: `/talent/today` loads with `4 things need your reply.`
  - Client: public workspace page loads, but admin route returns `Page not found`.

## Mutating Checks Deliberately Skipped

I did not perform live DB/public-content mutations: save/publish page, create roster profile, submit inquiry, set primary domain, add/remove domain, freeze/activate/cancel tenant, apply/remove plan override, or change member role/name.
