# Talent website E2E fixtures (Phase Q.3 + Maison PR9)

Fixture data and Playwright journeys for the talent-website suite
([`web/docs/talent-website-execution-plan-2026-09-23.md`](../../docs/talent-website-execution-plan-2026-09-23.md)
Phase Q.3) and Maison free-website journeys 1–6 (W77–W78).

## Files

- `seed.ts` — idempotent seeder. Service-role script; creates/repairs every
  row below. Writes `e2e/.auth/talent-website/ids.json` (talent_profile UUIDs).
- `fixtures.ts` — emails, profile codes, slugs, domains, Vale/Iván personas,
  `FIXTURE_PASSWORD`, and lazy `talentProfileId` from `ids.json`.
- `helpers.ts` — `signInTalentFixture`, viewports, locale cookie, Unlock assert.
- `auth.setup.ts` — one storage state per fixture (`talent-website-setup`).
- `maison-journeys.spec.ts` — Maison journeys 1–6 EN+ES (gate `MAISON_JOURNEY_E2E=1`).
- `jor-live-unlock.spec.ts` — read-only live Jor Unlock check (`JOR_LIVE_CHECK=1`).
- Legacy `j0`–`j8` / `maison-profile` — Phase Q theme-gallery journeys.
- `README.md` — this file.

## Running it

**CI** (`.github/workflows/talent-website-e2e.yml`): the workflow starts a
throwaway local Supabase (`supabase start`), which applies every migration
in `supabase/migrations/` from scratch, then (in the seeding step landing
alongside this one) runs:

```bash
cd web
tsx --env-file=<the CLI's printed local env file, or exported vars> e2e/talent-website/seed.ts
```

using the Supabase CLI's own printed local `NEXT_PUBLIC_SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY` (the local anon/service keys `supabase start`
prints, not `.env.local`). Because the database is local to the job, this
never touches production or any shared Supabase project.

**Local dev**, against your own linked project (matches the
`seed:default-storefront` convention in `web/package.json`):

```bash
cd web
tsx --env-file=.env.local e2e/talent-website/seed.ts
```

Re-running is safe — every write is select-then-branch or `upsert` on a
natural/unique key (see "Idempotency" in `seed.ts`'s header comment).

## The fixtures

All talent logins share `FIXTURE_PASSWORD` from `fixtures.ts`
(`TalentWebsiteE2E-2026!`) — not a secret; it only ever exists in a
hermetic, throwaway CI Supabase, per CLAUDE.md ("This environment has no
Supabase, Vercel or Stripe credentials").

| Key | Plan | Readiness | Site | Notes |
|---|---|---|---|---|
| `t_incomplete` | `talent_basic` | 3 of 8 (display_name, phone, short_bio) | none | `workflow_status='draft'`, no hub roster row — deliberately NOT publicly listed (see "Public listing" below). For J5's locked-badge journey. |
| `t_ready` | `talent_basic` | all 8 (display_name, phone, short_bio, location, primary taxonomy, 3 approved media, 1 published offering) | none | Ready to unlock the free site wizard but hasn't created one yet. |
| `t_free_site` | `talent_basic` | all 8 | published, slug `free-site-fiona`, home + `about` pages, custom domain `free-site.test` (ACTIVE) | Free-tier site that already exists. Until Phase 1 ships, the domain resolves via the existing `talent_site_domain_lookup` RPC into the existing Max render path, which still gates on `talent_portfolio` — so this fixture is also the flags-off-parity check that a `talent_basic` site does NOT render Max content today. |
| `t_max` | `talent_portfolio` | all 8 | published, slug `max-site-maxine`, home + `about` pages, custom domain `max-site.test` (ACTIVE) | The existing (pre-Phase-0) Max site journey — J0's flags-off parity baseline. |
| `t_pro_legacy` | `talent_pro` | all 8 | none | Grandfathered Pro talent (Phase 1.C folds `talent_pro` into `talent_portfolio` capabilities but keeps the plan key). No site seeded — the plan doesn't ask for one. |
| `t_multi_roster` | `talent_basic` | all 8 | none | On the platform hub (`site_visible`) plus three more agencies: `qa-roster-visible` (`active` / `site_visible`), `qa-roster-hidden` (`active` / `roster_only`), `qa-roster-pending` (`pending` / `site_visible`). For J8 ("Where I appear"). |

Plus agency **`acme`** (`agencies.slug = 'acme'`), with subdomain rows
`acme.tulala.digital` (primary) and `acme.lvh.me` (local/CI convenience) in
`agency_domains` — the collision-test agency the plan's Phase 2 slug-
namespace work needs (`platform_subdomain_label_taken` checks agency slugs
+ subdomain labels + `talent_sites.site_slug` against one namespace; `acme`
lets a later journey assert a talent can't take a slug an agency already
holds, and vice versa).

### "8 items" vs. the checklist you'll find in code today

The plan's readiness list (display_name, media, location, taxonomy,
short_bio, phone, 3+ photos, 1+ published offering) is the **Phase 3**
`TALENT_SITE_READINESS` gate, which doesn't exist on this branch yet — Phase
3 ships it. Today's `buildTalentChecklist` (`web/src/lib/talent-dashboard.ts`)
only has 6 keys and a looser `media` rule (`mediaCount > 0`, not `>= 3`).
This seed satisfies the **stricter, future** 8-item version (3 real
`media_assets` rows, a real published `talent_offerings` row) so it stays
correct once Phase 3 lands, rather than the weaker version that's
merely correct today.

### Media

`t_ready`, `t_free_site`, `t_max`, `t_pro_legacy` and `t_multi_roster` each
get 3 `media_assets` rows: `purpose='talent'`, `approval_state='approved'`,
`bucket_id='media-public'`. Their `storage_path`s are fixture placeholders
(`qa-fixtures/<talent_id>/photo-N.jpg`) — **no real object is uploaded to
Storage**. The e2e journeys this seeds for (readiness counters, DOM
assertions, gallery-block presence) don't need a real decodable image; if a
later journey adds a pixel-level screenshot assertion on the gallery, it
will need real uploaded assets, which is out of scope for a data-only seed
script.

### Public listing

`talent_profiles.is_publicly_listed` is a **trigger-maintained** column
(`20260803203521_public_listing_single_gate.sql`), not something this
script (or the app) writes directly. The trigger's predicate
(`talent_compute_publicly_listed`) is true when either (a) the talent sits
on a live roster whose "eye" (`agency_talent_roster.agency_visibility`) is
`site_visible`/`featured`, or (b) they have no live roster anywhere AND
`workflow_status IN ('approved','published')`. This script therefore:

- puts every fixture except `t_incomplete` on the platform hub roster
  (`agency_visibility='site_visible'`, mirroring
  `ensurePlatformHubRoster` in `web/src/lib/saas/registration-policy.ts`)
  AND sets `workflow_status='approved'` — either one alone would already
  make them listed; both together is belt-and-suspenders, matching how a
  real talent ends up listed after onboarding.
- keeps `t_incomplete` off every roster AND at `workflow_status='draft'`,
  so it stays unlisted through path (a) (no roster row) and path (b) (not
  approved). Setting only one of those two would have left it listed by
  the other path — this was caught and fixed while writing this script;
  if you add a new "not ready" fixture, keep both.

### A bootstrap gap this script works around (not a migration edit)

`getPlatformHubTenant()` (`web/src/lib/saas/platform-hub.ts`) requires
`kind='hub' AND plan_tier='network' AND status='active'`. Migration
`20260625100000_saas_p56_m0_org_kind_and_hub_seed.sql` seeds the hub agency
(`slug='hub'`, `kind='hub'`, `status='active'`) but never sets
`plan_tier`; `plan_tier` defaults to `'free'` (added later by
`20260630120000_saas_agencies_plan_tier_seats.sql`), and no migration ever
updates the hub row to `'network'`. On a hermetic from-scratch database this
means `getPlatformHubTenant()` — and therefore `ensurePlatformHubRoster` and
any app code that resolves the hub — finds **nothing**, silently, even
though a `kind='hub'` row exists.

`seed.ts`'s `ensurePlatformHub()` fixes this **in data**, not by editing the
migration (CLAUDE.md: migrations already applied in production are
immutable): it finds the existing `kind='hub'` row and updates
`plan_tier='network'` / `status='active'` if either is wrong, or creates one
from scratch if no `kind='hub'` row exists at all (e.g. if Q.1's fallback
schema-snapshot path was used instead of the full migration chain). Whoever
owns Q.1/Q.4 should decide whether this belongs in a proper follow-up
migration for production too — filing that decision, not silently fixing
production, is this script's job.

## Hosts

The task was to seed the host kinds the talent dashboard and marketing `/t/`
pages need for `localhost`, `127.0.0.1`, and the `.lvh.me` family, "if the
app supports it."

- **`localhost` / `127.0.0.1`: already covered, nothing to seed.** Migration
  `20260922100000_agency_domains_localhost_app_dev.sql` registers both as
  `agency_domains` rows with `kind='app'`, and
  `web/src/lib/saas/host-context.ts` (`resolveTenantContext`) ALSO falls back
  to `kind: "app"` for these two hostnames whenever `NODE_ENV=development`,
  even without that row. `kind: "app"` is allowed to render both the talent
  dashboard (`APP_WORKSPACE_PREFIXES` in `web/src/lib/saas/gate.ts`) and
  marketing `/t/<code>` profile pages (`CANONICAL_TALENT_PREFIX` is allowed
  on `app`, `marketing` and `hub` alike) — so no additional row was needed
  for either of the two surfaces the task named.
- **`*.lvh.me` for the agency `acme`: seeded (`acme.lvh.me`).** This mirrors
  an existing convention already in the codebase (e.g.
  `web/e2e/directory-modal.spec.ts` defaults to
  `http://impronta.lvh.me:3070`; `.lvh.me` resolves to `127.0.0.1` over real
  DNS, so `Host: acme.lvh.me:PORT` reaches a local dev/CI server exactly like
  a real subdomain would) and gives the acme collision-tests a working host
  today, not just a production-only one.
- **`*.lvh.me` for a TALENT's own subdomain: deliberately NOT seeded.**
  `<slug>.tulala.digital` / `<slug>.lvh.me` talent-site subdomain routing is
  **Phase 2** of the plan (`talent_site_subdomain_lookup` RPC +
  `resolveTalentSubdomainContext`) and does not exist on this branch yet —
  only the custom-domain resolver (`talent_site_domain_lookup`) does. A
  talent `.lvh.me` `agency_domains` row today would be dead data with
  nothing in the app to look it up. `t_free_site` and `t_max` are instead
  reachable today via their **custom domains** (`free-site.test`,
  `max-site.test`) through the existing Max-site domain resolver — see the
  fixtures table above. When Phase 2 lands, its own Q-equivalent work (or a
  follow-up to this file) should add `<slug>.lvh.me` rows once
  `talent_site_subdomain_lookup` exists to resolve them.

## Ground truth used

Column shapes: `web/src/lib/supabase/database.types.ts` and the migrations
under `supabase/migrations/` (in particular `20250409000000_init.sql`,
`20261030000000_talent_max_site.sql`, `20260708161910_talent_offerings.sql`,
`20260601152946_media_assets_builder_library.sql`,
`20260803203521_public_listing_single_gate.sql`,
`20260625100000_saas_p56_m0_org_kind_and_hub_seed.sql`). Patterns reused from
`web/src/lib/saas/registration-policy.ts` (`ensurePlatformHubRoster`),
`web/src/lib/saas/platform-hub.ts` (`getPlatformHubTenant`), and existing
seed scripts (`web/scripts/register-tulum-demo-talent.mjs`,
`web/scripts/seed-phase5-qa.mjs`, `web/scripts/seed-default-storefront.ts`
for the `tsx --env-file` invocation convention). Builder-node trees reuse
the pure helpers in `web/src/lib/talent-site/default-max-site-trees.ts`
(`buildDefaultShellTree`, `buildStarterHomePageTree`) rather than
`provisionTalentMaxSite` (`web/src/lib/talent-site/server/provision-max-site.ts`),
because that function is Max-gated (`talent_plan_key !== "talent_portfolio"`
is refused outright) and would reject `t_free_site`.

## Known gaps / follow-ups for whoever owns Q.2 or the later phases

- No Playwright specs live here yet — only the fixtures they'll need.
- `t_free_site`'s and `t_max`'s media/gallery blocks are the DEFAULT starter
  tree (hero + tagline), not a rich hydrated profile tree
  (`buildDefaultTalentProfileTree` + `hydrateTalentTree`, used by the real
  provisioning flow) — kept intentionally minimal and dependency-light for
  a fixture seeder; a later phase that wants photorealistic starter content
  in its screenshots should hydrate the fuller tree instead.
- This script was written and reviewed against the schema and migrations
  only; it has not been executed against a live Supabase instance in this
  environment (no Supabase/Vercel/Stripe credentials here, and Docker
  cannot pull images to run one locally — see CLAUDE.md). Q.2's CI workflow
  is the first real execution of this script; watch its first run closely.
