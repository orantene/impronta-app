/**
 * Fixtures for the Phase 2 subdomain-routing journey (`j4-subdomain.spec.ts`).
 *
 * Seeds against the isolated qa-journeys project ONLY — reuses the same
 * `isolatedService()` guard as `web/e2e/cases/_isolated-db.ts` (refuses
 * production and Impronta by project ref). Nothing here reads the UI; the
 * spec drives the browser, then these helpers give it real rows to find.
 *
 * Identities:
 *   - `t_max`       — a Max-tier talent with a published multi-page site
 *                      (`talent_sites.shell_tree` + `talent_pages`: home + about),
 *                      reachable at `<slug>.lvh.me` AND a custom domain.
 *   - `t_free_site` — a free-tier talent with a published personal site
 *                      (same `talent_sites` row shape, no Max plan key),
 *                      reachable at `<slug>.lvh.me`.
 *   - `acme`        — a live `agencies` row whose slug sits in the SAME shared
 *                      namespace `platform_subdomain_label_taken` enforces, so
 *                      a talent (or a new workspace) cannot claim it either.
 *
 * ASSUMPTION FLAGGED FOR THE IMPLEMENTER: `renderTalentMaxSite` (see
 * `web/src/lib/talent-site/server/render-max-site.tsx`) gates the public
 * `_talent-site` render on `maxSitePublicGate`, which requires
 * `talent_plan_key === "talent_portfolio"` (Max) UNLESS the caller is the
 * owner previewing a draft. As written today, `t_free_site` (plan key
 * "talent_basic") would 404 through that gate — the free-website render path
 * is not yet wired to the host resolver. This fixture still seeds
 * `t_free_site` as a fully published, non-Max site (matching the acceptance
 * list), so the journey below is the CORRECT target behaviour for Phase 2 /
 * early Phase 3; if it 404s when actually run, that is the implementation gap
 * to fix, not the test to weaken.
 */
import { randomUUID } from "node:crypto";

import { isolatedService } from "../cases/_isolated-db";
import {
  buildDefaultShellTree,
  buildStarterHomePageTree,
} from "@/lib/talent-site/default-max-site-trees";

/** Stable-ish per-run suffix so re-runs against a warm DB do not collide. */
const RUN = process.env.TALENT_SITE_E2E_RUN_ID ?? "j4";

export const ACME_AGENCY_ID = "44440001-0000-4000-8000-000000000acm";
export const ACME_SLUG = "acme";

export const T_MAX_PROFILE_ID = "44440002-0000-4000-8000-0000000000a1";
export const T_MAX_SLUG = `t-max-${RUN}`;
export const T_MAX_EMAIL =
  process.env.TALENT_SITE_E2E_T_MAX_EMAIL ?? "qa-journeys-t-max@impronta.test";
/** A live custom domain for the SAME talent, for the custom-domain nav leg. */
export const T_MAX_CUSTOM_DOMAIN = `t-max-custom-${RUN}.lvh.me`;

export const T_FREE_SITE_PROFILE_ID = "44440003-0000-4000-8000-0000000000a1";
export const T_FREE_SITE_SLUG = `t-free-${RUN}`;

export interface TalentSiteE2EFixture {
  agencyId: string;
  tMaxProfileId: string;
  tMaxSlug: string;
  tMaxCustomDomain: string;
  tFreeSiteProfileId: string;
  tFreeSiteSlug: string;
}

function must<T>(label: string, r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${label}: ${r.error.message}`);
  if (r.data == null) throw new Error(`${label}: no row`);
  return r.data;
}

/**
 * Create-if-missing an `@impronta.test` auth user, service-role, and return
 * its id. Mirrors what `/api/dev/signin`'s `mintFixtureSession` does on the
 * first hit (create, tolerate "already registered") so this fixture and that
 * route agree on one id for the same email.
 */
async function ensureFixtureAuthUserId(
  sb: ReturnType<typeof isolatedService>,
  email: string,
): Promise<string> {
  const admin = sb.auth.admin as unknown as {
    createUser: (input: {
      email: string;
      email_confirm: true;
    }) => Promise<{ data: { user: { id: string } } | null; error: { message?: string } | null }>;
    listUsers: (opts?: {
      page?: number;
      perPage?: number;
    }) => Promise<{ data: { users: { id: string; email?: string | null }[] } | null; error: unknown }>;
  };

  const created = await admin.createUser({ email, email_confirm: true });
  if (created.data?.user?.id) return created.data.user.id;

  // Already registered (or the create call otherwise didn't hand back the
  // row) — look it up. `listUsers` paginates; the fixture set is small, so a
  // few pages is always enough.
  for (let page = 1; page <= 5; page += 1) {
    const { data } = await admin.listUsers({ page, perPage: 200 });
    const users = data?.users ?? [];
    const match = users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (users.length < 200) break;
  }
  throw new Error(`could not resolve or create an auth user for ${email}`);
}

/**
 * Insert (or refresh) everything the journey needs. Idempotent: safe to call
 * once from a Playwright global setup, or per-file if the suite runs alone.
 */
export async function seedTalentSiteE2EFixture(): Promise<TalentSiteE2EFixture> {
  const sb = isolatedService();
  const now = new Date().toISOString();

  // `/api/dev/signin` (the passwordless fixture sign-in every e2e journey
  // uses) creates the auth user for a fresh `@impronta.test` email on demand
  // and assigns it whatever id GoTrue hands out — we cannot pick that id in
  // advance. Resolve it here (create-if-missing) so `talent_profiles.user_id`
  // actually matches the session `signInJourneysStaff`-style helpers mint.
  const tMaxUserId = await ensureFixtureAuthUserId(sb, T_MAX_EMAIL);

  // ── acme — a live workspace whose slug sits in the shared namespace ──────
  await sb
    .from("agencies")
    .upsert(
      {
        id: ACME_AGENCY_ID,
        slug: ACME_SLUG,
        display_name: "Acme (fixture, do not delete: slug meaning matters)",
        status: "active",
        kind: "agency",
        workspace_type: "agency",
      },
      { onConflict: "id" },
    )
    .throwOnError();

  // ── t_max — Max-tier talent, published multi-page site ──────────────────
  await sb
    .from("talent_profiles")
    .upsert(
      {
        id: T_MAX_PROFILE_ID,
        display_name: "T Max (fixture)",
        profile_code: `tmax${RUN}`.slice(0, 24),
        membership_tier: "premium",
        membership_status: "active",
        talent_plan_key: "talent_portfolio",
        is_publicly_hidden: false,
        is_publicly_listed: true,
        deleted_at: null,
        user_id: tMaxUserId,
      },
      { onConflict: "id" },
    )
    .throwOnError();

  const shellTree = buildDefaultShellTree({ displayName: "T Max (fixture)" });
  const { data: existingMaxSite } = await sb
    .from("talent_sites")
    .select("id")
    .eq("talent_profile_id", T_MAX_PROFILE_ID)
    .maybeSingle();

  const maxSiteId = (existingMaxSite as { id: string } | null)?.id ?? randomUUID();
  await sb
    .from("talent_sites")
    .upsert(
      {
        id: maxSiteId,
        talent_profile_id: T_MAX_PROFILE_ID,
        site_kind: "talent_personal",
        status: "published",
        site_slug: T_MAX_SLUG,
        shell_tree: shellTree,
        shell_published: shellTree,
        site_published_at: now,
        published_at: now,
        version: 1,
        draft_updated_at: now,
      },
      { onConflict: "id" },
    )
    .throwOnError();

  const homeTree = buildStarterHomePageTree({
    displayName: "T Max (fixture)",
    tagline: "Subdomain routing fixture",
  });
  await sb
    .from("talent_pages")
    .upsert(
      {
        talent_profile_id: T_MAX_PROFILE_ID,
        slug: "home",
        title: "Home",
        nav_label: "Home",
        is_home: true,
        status: "published",
        blocks: homeTree,
        sort_order: 0,
        published_at: now,
      },
      { onConflict: "talent_profile_id,slug" },
    )
    .throwOnError();
  await sb
    .from("talent_pages")
    .upsert(
      {
        talent_profile_id: T_MAX_PROFILE_ID,
        slug: "about",
        title: "About",
        nav_label: "About",
        is_home: false,
        status: "published",
        blocks: buildStarterHomePageTree({
          displayName: "T Max (fixture)",
          tagline: "The inner page the nav journey clicks through to.",
        }),
        sort_order: 1,
        published_at: now,
      },
      { onConflict: "talent_profile_id,slug" },
    )
    .throwOnError();

  // A live custom domain pointed at the SAME talent, for the custom-domain leg.
  await sb
    .from("talent_site_domains")
    .upsert(
      {
        talent_profile_id: T_MAX_PROFILE_ID,
        domain: T_MAX_CUSTOM_DOMAIN,
        status: "active",
      },
      { onConflict: "domain" },
    )
    .throwOnError();

  // ── t_free_site — free-tier talent, published personal site ─────────────
  await sb
    .from("talent_profiles")
    .upsert(
      {
        id: T_FREE_SITE_PROFILE_ID,
        display_name: "T Free Site (fixture)",
        profile_code: `tfree${RUN}`.slice(0, 24),
        membership_tier: "free",
        membership_status: "active",
        talent_plan_key: "talent_basic",
        is_publicly_hidden: false,
        is_publicly_listed: true,
        deleted_at: null,
      },
      { onConflict: "id" },
    )
    .throwOnError();

  const { data: existingFreeSite } = await sb
    .from("talent_sites")
    .select("id")
    .eq("talent_profile_id", T_FREE_SITE_PROFILE_ID)
    .maybeSingle();
  const freeSiteId = (existingFreeSite as { id: string } | null)?.id ?? randomUUID();
  const freeShellTree = buildDefaultShellTree({ displayName: "T Free Site (fixture)" });
  await sb
    .from("talent_sites")
    .upsert(
      {
        id: freeSiteId,
        talent_profile_id: T_FREE_SITE_PROFILE_ID,
        site_kind: "talent_personal",
        status: "published",
        site_slug: T_FREE_SITE_SLUG,
        shell_tree: freeShellTree,
        shell_published: freeShellTree,
        site_published_at: now,
        published_at: now,
        version: 1,
        draft_updated_at: now,
      },
      { onConflict: "id" },
    )
    .throwOnError();
  await sb
    .from("talent_pages")
    .upsert(
      {
        talent_profile_id: T_FREE_SITE_PROFILE_ID,
        slug: "home",
        title: "Home",
        nav_label: "Home",
        is_home: true,
        status: "published",
        blocks: buildStarterHomePageTree({ displayName: "T Free Site (fixture)" }),
        sort_order: 0,
        published_at: now,
      },
      { onConflict: "talent_profile_id,slug" },
    )
    .throwOnError();

  return {
    agencyId: ACME_AGENCY_ID,
    tMaxProfileId: T_MAX_PROFILE_ID,
    tMaxSlug: T_MAX_SLUG,
    tMaxCustomDomain: T_MAX_CUSTOM_DOMAIN,
    tFreeSiteProfileId: T_FREE_SITE_PROFILE_ID,
    tFreeSiteSlug: T_FREE_SITE_SLUG,
  };
}

/** Proof the fixture is really there, mirroring `workspaceBFixturePresent`. */
export async function talentSiteE2EFixturePresent(): Promise<boolean> {
  try {
    const sb = isolatedService();
    const [{ data: acme }, { data: maxSite }, { data: freeSite }] = await Promise.all([
      sb.from("agencies").select("id").eq("id", ACME_AGENCY_ID).maybeSingle(),
      sb
        .from("talent_sites")
        .select("id, site_slug, site_published_at")
        .eq("talent_profile_id", T_MAX_PROFILE_ID)
        .maybeSingle(),
      sb
        .from("talent_sites")
        .select("id, site_slug, site_published_at")
        .eq("talent_profile_id", T_FREE_SITE_PROFILE_ID)
        .maybeSingle(),
    ]);
    return Boolean(acme) && Boolean(maxSite) && Boolean(freeSite);
  } catch {
    return false;
  }
}

export { must };
