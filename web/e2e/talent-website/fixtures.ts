/**
 * Talent website E2E — fixture identities (Phase Q.3).
 *
 * Pure data (no I/O, no imports beyond types) so Playwright specs can import
 * it directly without pulling in `@supabase/supabase-js` or any server-only
 * module. `seed.ts` creates exactly these rows; keep the two files in sync —
 * if you rename or add a fixture here, update `seed.ts` to match (and vice
 * versa).
 *
 * See `README.md` in this folder for what each fixture is for and how the
 * readiness/tier/site state maps onto
 * `web/docs/talent-website-execution-plan-2026-09-23.md` ("Phase Q.3").
 */

/**
 * Shared login password for every seeded talent auth user. Not a secret —
 * this only ever exists in a hermetic, throwaway CI Supabase instance (see
 * `.github/workflows/talent-website-e2e.yml`), never against a real project.
 * Exported so Playwright specs and `seed.ts` use one literal value.
 */
export const FIXTURE_PASSWORD = "TalentWebsiteE2E-2026!";

/** One seeded talent identity. */
export interface TalentFixture {
  /** Stable key used in test titles / plan cross-references. */
  key:
    | "t_incomplete"
    | "t_ready"
    | "t_free_site"
    | "t_max"
    | "t_pro_legacy"
    | "t_multi_roster";
  email: string;
  profileCode: string;
  displayName: string;
  talentPlanKey: "talent_basic" | "talent_pro" | "talent_portfolio";
  /** Set only for fixtures that own a published site (free or Max). */
  siteSlug?: string;
  /** Set only for fixtures with an ACTIVE custom domain row. */
  customDomain?: string;
}

export const TALENT_FIXTURES: readonly TalentFixture[] = [
  {
    key: "t_incomplete",
    email: "qa-t-incomplete@impronta.test",
    profileCode: "TAL-QA-INCOMPLETE",
    displayName: "Incomplete Ivy",
    talentPlanKey: "talent_basic",
  },
  {
    key: "t_ready",
    email: "qa-t-ready@impronta.test",
    profileCode: "TAL-QA-READY",
    displayName: "Ready Renata",
    talentPlanKey: "talent_basic",
  },
  {
    key: "t_free_site",
    email: "qa-t-free-site@impronta.test",
    profileCode: "TAL-QA-FREESITE",
    displayName: "Free Site Fiona",
    talentPlanKey: "talent_basic",
    siteSlug: "free-site-fiona",
    customDomain: "free-site.test",
  },
  {
    key: "t_max",
    email: "qa-t-max@impronta.test",
    profileCode: "TAL-QA-MAX",
    displayName: "Max Site Maxine",
    talentPlanKey: "talent_portfolio",
    siteSlug: "max-site-maxine",
    customDomain: "max-site.test",
  },
  {
    key: "t_pro_legacy",
    email: "qa-t-pro-legacy@impronta.test",
    profileCode: "TAL-QA-PROLEGACY",
    displayName: "Pro Legacy Priya",
    talentPlanKey: "talent_pro",
  },
  {
    key: "t_multi_roster",
    email: "qa-t-multi-roster@impronta.test",
    profileCode: "TAL-QA-MULTIROSTER",
    displayName: "Multi Roster Mona",
    talentPlanKey: "talent_basic",
  },
] as const;

export function talentFixture(key: TalentFixture["key"]): TalentFixture {
  const found = TALENT_FIXTURES.find((f) => f.key === key);
  if (!found) throw new Error(`Unknown talent fixture key: ${key}`);
  return found;
}

/** The extra published page on `t_free_site`'s and `t_max`'s sites. */
export const EXTRA_PAGE_SLUG = "about";

/**
 * The collision-test agency. Slug doubles as the subdomain label
 * (`acme.tulala.digital`, and `acme.lvh.me` for local/CI Playwright runs —
 * see README "Hosts" for why only the agency gets an `.lvh.me` row and no
 * talent site does yet).
 */
export const ACME_AGENCY_SLUG = "acme";
export const ACME_AGENCY_DOMAIN = "acme.tulala.digital";
export const ACME_AGENCY_LOCAL_DOMAIN = "acme.lvh.me";

/** The three agencies `t_multi_roster` is a member of, one per visibility state. */
export interface RosterAgencyFixture {
  slug: string;
  displayName: string;
  /** `agency_talent_roster.status` for Mona's membership row. */
  rosterStatus: "active" | "pending";
  /** `agency_talent_roster.agency_visibility` for Mona's membership row. */
  agencyVisibility: "site_visible" | "roster_only" | "featured";
}

export const MULTI_ROSTER_AGENCIES: readonly RosterAgencyFixture[] = [
  {
    slug: "qa-roster-visible",
    displayName: "QA Roster Visible Agency",
    rosterStatus: "active",
    agencyVisibility: "site_visible",
  },
  {
    slug: "qa-roster-hidden",
    displayName: "QA Roster Hidden Agency",
    rosterStatus: "active",
    agencyVisibility: "roster_only",
  },
  {
    slug: "qa-roster-pending",
    displayName: "QA Roster Pending Agency",
    rosterStatus: "pending",
    agencyVisibility: "site_visible",
  },
] as const;

/**
 * Hosts seeded in `agency_domains` so the app resolves on `localhost` /
 * `127.0.0.1` for the talent dashboard and marketing `/t/` pages.
 *
 * `localhost` and `127.0.0.1` are NOT re-seeded here — migration
 * `20260922100000_agency_domains_localhost_app_dev.sql` already registers
 * both as `kind='app'`, and `web/src/lib/saas/host-context.ts` also falls
 * back to `kind: "app"` for loopback hosts in `NODE_ENV=development` even
 * without that row. `kind: "app"` is allowed to render both the talent
 * dashboard (`APP_WORKSPACE_PREFIXES` / `CANONICAL_TALENT_PREFIX` in
 * `web/src/lib/saas/gate.ts`) and marketing `/t/<code>` pages, so no
 * additional host row is needed for those two surfaces on loopback.
 */
export const LOOPBACK_HOSTS = ["localhost", "127.0.0.1"] as const;
