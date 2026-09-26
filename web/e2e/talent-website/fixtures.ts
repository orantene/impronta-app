/**
 * Talent website E2E — fixture identities (Phase Q.3 + Maison PR9).
 *
 * Mostly pure data so Playwright specs can import it without pulling in
 * `@supabase/supabase-js`. The only I/O is the lazy `talentProfileId` getter
 * that reads `e2e/.auth/talent-website/ids.json` written by `seed.ts`.
 *
 * See `README.md` in this folder for what each fixture is for and how the
 * readiness/tier/site state maps onto
 * `web/docs/talent-website-execution-plan-2026-09-23.md` ("Phase Q.3").
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
    | "t_multi_roster"
    | "t_vale"
    | "t_ivan";
  email: string;
  profileCode: string;
  displayName: string;
  talentPlanKey: "talent_basic" | "talent_pro" | "talent_portfolio";
  /** Set only for fixtures that own a published site (free or Max). */
  siteSlug?: string;
  /** Set only for fixtures with an ACTIVE custom domain row. */
  customDomain?: string;
  /**
   * Maison persona role (PR9). Drives seed shape — Vale starts at ~83%
   * (intro missing); Iván is quotes/chef ready for custom colors.
   */
  maisonRole?: "vale" | "ivan";
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
  // Maison journeys 1–2 / W77 — Vale Montes (nails, bookings, intro missing).
  {
    key: "t_vale",
    email: "qa-t-vale@impronta.test",
    profileCode: "TAL-QA-VALE",
    displayName: "Vale Montes",
    talentPlanKey: "talent_basic",
    siteSlug: "valemontes",
    maisonRole: "vale",
  },
  // Maison journeys 3–6 / W77 — Iván Lugo (private chef, quotes).
  {
    key: "t_ivan",
    email: "qa-t-ivan@impronta.test",
    profileCode: "TAL-QA-IVAN",
    displayName: "Iván Lugo",
    talentPlanKey: "talent_basic",
    siteSlug: "ivanlugo",
    maisonRole: "ivan",
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

/**
 * Maison catalogue offering titles.
 *
 * Identities, not seeding logic, so they live here with the other fixture
 * identities: a spec must be able to select on them WITHOUT importing
 * `seed.ts`, which runs `requireEnv`, builds a service-role client and calls
 * `main()` at module scope. Importing the seeder from a spec would either break
 * test collection (env unset) or turn `playwright test --list` into a database
 * write (env set).
 *
 * `seed.ts` imports these from here and writes rows with exactly these titles.
 */
export const MAISON_OPTIONED_OFFERING = "Maison QA — optioned service";
export const MAISON_FIXED_OFFERING = "Maison QA — fixed service";

// ─────────────────────────────────────────────────────────────────────────────
// Spec-facing helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The fixtures keyed by their `key`, so a spec can write `fixtures.t_max`
 * instead of hunting through the array.
 *
 * `TALENT_FIXTURES` stays the source of truth and the iteration order; this is
 * a lookup over the same objects, not a second copy. Adding a fixture to the
 * array adds it here with no other change.
 */
/**
 * The "Where I appear" view of a roster membership, as J8 consumes it.
 *
 * `effective` is the chip state the account menu is expected to render, DERIVED
 * here from the two columns the seed actually writes, because the spec's own
 * header asks for it: "The seed declares `effective` rather than the spec
 * deriving it." Keeping the derivation next to the data means one place to
 * change when the visibility model does.
 *
 *   rosterStatus 'pending'                  -> "pending"    (not linked)
 *   agencyVisibility 'site_visible'|'featured' -> "live"    (linked)
 *   agencyVisibility 'roster_only'          -> "agency_hidden" (not linked)
 *
 * A pending membership is "pending" whatever its visibility says: the agency has
 * not accepted the talent yet, so nothing of theirs is published anywhere.
 */
export interface TalentMembershipFixture {
  slug: string;
  displayName: string;
  effective: "live" | "agency_hidden" | "pending";
}

function effectiveVisibility(a: RosterAgencyFixture): TalentMembershipFixture["effective"] {
  if (a.rosterStatus === "pending") return "pending";
  // "agency_hidden", NOT "roster_only". The column is `roster_only`; the chip
  // the account menu renders is `agency_hidden`. Confirmed against the rendered
  // DOM (data-effective) rather than assumed from the column name — the first
  // run of this assertion is what caught the difference.
  return a.agencyVisibility === "roster_only" ? "agency_hidden" : "live";
}

export const T_MULTI_ROSTER_MEMBERSHIPS: readonly TalentMembershipFixture[] =
  MULTI_ROSTER_AGENCIES.map((a) => ({
    slug: a.slug,
    displayName: a.displayName,
    effective: effectiveVisibility(a),
  }));

/**
 * A seeded agency `t_multi_roster` is deliberately NOT on, so a spec can assert
 * that the account menu lists only real memberships. `acme` is seeded by the
 * same run (ACME_AGENCY_SLUG) and Mona is never added to its roster.
 */
export const NOT_A_MEMBER_SLUG = ACME_AGENCY_SLUG;

/**
 * Absolute URL of a talent's own public page.
 *
 * The CANONICAL PUBLIC origin, deliberately not the host the test is pointed at.
 * A talent's "my page" link is something they share, so the product emits the
 * real public URL even when the app is being served from localhost — verified
 * against the rendered href, which is `https://tulala.digital/t/<code>` on a
 * run served from `http://localhost:3000`.
 *
 * Overridable for a run against a different platform origin; it is a fixture
 * expectation, not a resolver, so the literal here does not fall under the
 * host-context "no hardcoded production domain" invariant.
 */
export function selfPageUrlFor(fx: TalentFixture): string {
  const base = process.env.E2E_PUBLIC_ORIGIN ?? "https://tulala.digital";
  return `${base.replace(/\/$/, "")}/t/${fx.profileCode}`;
}

/**
 * Directory holding one signed-in Playwright storage state per fixture.
 *
 * Written by `auth.setup.ts` (the `talent-website-setup` project) and read by
 * the journeys through `storageStateFor`. Gitignored: these hold real session
 * cookies for the local fixture users, and they are cheap to regenerate.
 * Also holds `ids.json` (talent_profile UUIDs) written by `seed.ts`.
 */
export const AUTH_STATE_DIR = "e2e/.auth/talent-website";

export type TalentFixtureView = TalentFixture & {
  /**
   * Slug of the extra published page on this talent's site, for specs that
   * assert an INNER page renders as well as the home page.
   *
   * It is `EXTRA_PAGE_SLUG` because that is the page `seed.ts` actually creates.
   * Absent it, J0 and J1 navigated to `/t/site/<slug>/undefined`, took a 404,
   * and failed 30 seconds later as a locator timeout — a missing fixture field
   * presenting as a hang rather than as "this field does not exist".
   */
  innerPageSlug: string;
  /** Roster memberships, present only on `t_multi_roster` (the fixture seeded with any). */
  memberships: readonly TalentMembershipFixture[];
  /** A seeded agency this talent is NOT on. */
  notAMemberSlug: string;
  /** Absolute URL of this talent's own public page on the host under test. */
  selfPageUrl: string;
  /**
   * UUID of the seeded `talent_profiles` row. Loaded lazily from
   * `e2e/.auth/talent-website/ids.json` (written by `seed.ts`). Specs that
   * need it before seed has run will throw a clear error naming the file —
   * never hang on `/undefined` query params (the pre-PR9 j0 failure mode).
   */
  talentProfileId: string;
};

function loadIdsFile(): Partial<Record<TalentFixture["key"], string>> {
  try {
    const path = join(process.cwd(), AUTH_STATE_DIR, "ids.json");
    if (!existsSync(path)) return {};
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      profiles?: Partial<Record<TalentFixture["key"], string>>;
    };
    return parsed.profiles ?? {};
  } catch {
    return {};
  }
}

export const fixtures: Readonly<Record<TalentFixture["key"], TalentFixtureView>> =
  Object.freeze(
    Object.fromEntries(
      TALENT_FIXTURES.map((f) => [
        f.key,
        {
          ...f,
          memberships: f.key === "t_multi_roster" ? T_MULTI_ROSTER_MEMBERSHIPS : [],
          notAMemberSlug: NOT_A_MEMBER_SLUG,
          innerPageSlug: EXTRA_PAGE_SLUG,
          get selfPageUrl() {
            // A getter, not a value: PLAYWRIGHT_BASE_URL is read when a spec
            // asks, not when this module is first imported, so a config that
            // sets it later still gets the right host.
            return selfPageUrlFor(f);
          },
          get talentProfileId() {
            const id = loadIdsFile()[f.key];
            if (!id) {
              throw new Error(
                `fixtures.${f.key}.talentProfileId missing — run e2e/talent-website/seed.ts ` +
                  `(writes ${AUTH_STATE_DIR}/ids.json).`,
              );
            }
            return id;
          },
        },
      ]),
    ),
  ) as Readonly<Record<TalentFixture["key"], TalentFixtureView>>;

/** Vale / Iván fixture identities from maison-seed-data.json (PR9). */
export const MAISON_VALE_INTRO_AFTER_AI =
  "Hago manicura en gel y nail art a mano alzada en mi estudio en García Ginerés. Trabajo con cita y con calma.";

export const MAISON_VALE_SERVICES = [
  { title: "Manicura en gel", category: "unas", amountCents: 42000, durationMin: 60 },
  { title: "Nail art a mano alzada · por uña", category: "unas", amountCents: 4000, durationMin: 10 },
  { title: "Retiro de gel", category: "unas", amountCents: 15000, durationMin: 30 },
] as const;

export const MAISON_IVAN_SERVICES = [
  { title: "Cena privada en tu casa · 2 a 12 personas", category: "cenas-privadas" },
  { title: "Menú de degustación mole y mezcal", category: "cenas-privadas" },
  { title: "Clase de cocina oaxaqueña · 3 horas", category: "clases" },
  { title: "Preparación semanal de comidas", category: "clases" },
] as const;

/**
 * Path to the signed-in storage state for one fixture.
 *
 * Returns a PATH, not a state: Playwright resolves it at context-creation time,
 * which is after the setup project has run and written the file. A spec calling
 * this at module scope therefore does not require the file to exist yet, which
 * is what lets `test.use({ storageState: storageStateFor("t_max") })` sit at the
 * top of a describe block.
 *
 * The file is created by auth.setup.ts. If it is missing when a test actually
 * runs, Playwright fails with ENOENT naming this path — which means the setup
 * project did not run (check `--project`), not that the fixture is wrong.
 */
export function storageStateFor(key: TalentFixture["key"]): string {
  return `${AUTH_STATE_DIR}/${key}.json`;
}
