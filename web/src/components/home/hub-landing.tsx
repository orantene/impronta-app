import { unstable_cache } from "next/cache";
import Link from "next/link";
import { buildHubAgencyEntries, type HubAgencyDomainRow } from "@/lib/home/hub-agency-entries";
import { HubAgencyList } from "./hub-agency-list";
import { isPublicHubAgency, tenantsWithRealOwner, type HubAgencyCandidate, type HubAgencyItem } from "./hub-agency-model";
import { hubCmsTitle, hubDisplayName, hubDisplayTagline } from "./hub-landing-copy";
import { resolvePublicRootDomain } from "@/lib/brand/public-root-domain";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { loadPublicHomepage } from "@/lib/site-admin/server/homepage-reads";
import { loadPublicIdentity } from "@/lib/site-admin/server/reads";
import { HomepageCmsSections } from "@/components/home/homepage-cms-sections";
import { isLocale } from "@/lib/site-admin/locales";
import { getRequestLocale } from "@/i18n/request-locale";
import type { Locale } from "@/i18n/config";
import { canonicalTalentUrl, isDevOnlyHostname } from "@/lib/saas/canonical-hosts";
import { createTranslator } from "@/i18n/messages";
import { hubMayListTalent, mapTenantDiscoverExposure } from "@/lib/saas/discover-exposure";

/**
 * Root page for `kind === "hub"` — the cross-tenant hub surface
 * (e.g. impronta.group, pitiriasisversicolor.com).
 *
 * Phase 5/6 M1 — abstraction-gate proof. The hub renders through the same
 * CMS read primitives that agency tenants use:
 *   - identity  → loadPublicIdentity(tenantId)
 *   - homepage  → loadPublicHomepage(tenantId, locale)  → HomepageCmsSections
 * No code path here is hub-specific data access; the only hub-specific
 * concern is the agencies-on-platform list at the bottom, which is the
 * hub's actual product differentiator.
 *
 * The `tenantId` is the hub agency UUID (00000000-0000-0000-0000-000000000002),
 * threaded from the host-context resolver via the request header set by
 * middleware. NEVER hardcoded here — that would re-introduce the kind
 * coupling M1 just removed.
 */
export async function HubLanding({ tenantId }: { tenantId: string }) {
  const locale: Locale = await getRequestLocale();
  const cmsLocale = isLocale(locale) ? locale : null;

  const [identity, cmsHomepage, agencies, hubTalent] = await Promise.all([
    loadPublicIdentity(tenantId),
    cmsLocale ? loadPublicHomepage(tenantId, cmsLocale) : Promise.resolve(null),
    loadActiveAgencyDomains(),
    loadHubApprovedTalent(tenantId),
  ]);

  // TUL-978: the fixed copy follows the visitor's locale (CMS text is data and stays as written).
  const t = createTranslator(locale);
  const kicker = hubDisplayName(identity?.public_name, PLATFORM_BRAND.name); // TUL-1884
  const tagline = hubDisplayTagline(identity?.tagline, t("public.hubLanding.tagline"));
  const heroTitle = hubCmsTitle(cmsHomepage?.title, t("public.hubLanding.agenciesTitle")); // TUL-1884

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <p className="font-display text-xs font-medium uppercase tracking-[0.4em] text-[var(--impronta-gold-dim)]">
          {kicker}
        </p>

        {cmsHomepage?.snapshot ? (
          <div className="mt-6">
            <HomepageCmsSections
              snapshot={cmsHomepage.snapshot}
              tenantId={tenantId}
              locale={locale}
            />
          </div>
        ) : (
          <>
            <h1 className="mt-6 font-display text-3xl font-normal leading-tight tracking-[0.06em] text-foreground sm:text-4xl">
              {heroTitle}
            </h1>
            <p className="mt-4 max-w-xl text-base text-[var(--impronta-muted)]">
              {tagline}
            </p>
          </>
        )}

        {agencies.length === 0 ? (
          <p className="mt-12 text-sm text-[var(--impronta-muted)]">
            {t("public.hubLanding.noAgencies")}
          </p>
        ) : (
          <HubAgencyList
            agencies={agencies}
            labels={{
              search: t("public.hubLanding.searchAgencies"),
              noMatch: t("public.hubLanding.noMatch"),
              seeAll: t("public.hubLanding.seeAll"),
              showFewer: t("public.hubLanding.showFewer"),
            }}
          />
        )}

        <HubTalentDirectory talent={hubTalent} heading={t("public.hubLanding.featured")} />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hub talent directory — approved-visibility grid
// ---------------------------------------------------------------------------

type HubTalentCard = {
  profile_code: string;
  display_name: string | null;
  canonicalUrl: string | null;
};

async function HubTalentDirectory({ talent, heading }: { talent: HubTalentCard[]; heading: string }) {
  if (talent.length === 0) return null;
  return (
    <section className="mt-16">
      <h2 className="font-display text-sm font-medium uppercase tracking-[0.3em] text-[var(--impronta-gold-dim)]">
        {heading}
      </h2>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {talent.map((t) => {
          const label = t.display_name?.trim() || t.profile_code;
          const card = (
            <div className="flex h-full flex-col justify-between rounded-[var(--site-radius)] border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)]/40 px-5 py-4 text-sm transition hover:bg-[var(--impronta-surface)]/60">
              <span className="font-display tracking-[0.06em] text-foreground">
                {label}
              </span>
              <span className="mt-2 text-xs uppercase tracking-[0.2em] text-[var(--impronta-muted)]">
                {t.profile_code}
              </span>
            </div>
          );
          return (
            <li key={t.profile_code}>
              {t.canonicalUrl ? (
                <Link href={t.canonicalUrl} target="_blank" rel="noopener">
                  {card}
                </Link>
              ) : (
                card
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type HubRosterJoinRow = {
  talent_profile_id: string;
  talent_profiles: {
    profile_code: string;
    display_name: string | null;
    workflow_status: string | null;
    visibility: string | null;
    deleted_at: string | null;
  } | null;
};

/**
 * Drop talents whose primary workspace has vetoed hub exposure, or has narrowed
 * it to a hub list this one isn't on. One extra round trip for the whole page
 * (not per card): resolve each talent's primary roster, then that workspace's
 * exposure config. Independent talent — no primary workspace — always pass.
 */
async function filterByAgencyHubExposure(
  supabase: NonNullable<ReturnType<typeof createPublicSupabaseClient>>,
  hubTenantId: string,
  talentIds: string[],
): Promise<Set<string>> {
  const allowed = new Set(talentIds);
  if (talentIds.length === 0) return allowed;

  const { data: rosterRows } = await supabase
    .from("agency_talent_roster")
    .select("talent_profile_id, tenant_id, is_primary, added_at")
    .in("talent_profile_id", talentIds)
    // active + pending, matching the discover index's `live_roster` CTE — if a
    // pending row didn't count here, a vetoing workspace's not-yet-active talent
    // would still surface on hubs.
    .in("status", ["active", "pending"])
    .neq("tenant_id", hubTenantId);
  if (!rosterRows || rosterRows.length === 0) return allowed;

  // Primary workspace per talent — is_primary first, then oldest, mirroring the
  // discover index's `primary_roster` ordering so both surfaces agree.
  const primaryOf = new Map<string, string>();
  for (const r of [...rosterRows].sort((a, b) =>
    Number(b.is_primary) - Number(a.is_primary)
    || String(a.added_at ?? "").localeCompare(String(b.added_at ?? "")),
  )) {
    const talentId = r.talent_profile_id as string;
    if (!primaryOf.has(talentId)) primaryOf.set(talentId, r.tenant_id as string);
  }

  const tenantIds = [...new Set(primaryOf.values())];
  const { data: agencyRows } = await supabase
    .from("agencies")
    .select("id, discover_exposure_enabled, hub_exposure_tenant_ids")
    .in("id", tenantIds);

  const exposureOf = new Map(
    (agencyRows ?? []).map((a) => [a.id as string, mapTenantDiscoverExposure(a)]),
  );

  for (const [talentId, tenantId] of primaryOf) {
    if (!hubMayListTalent(exposureOf.get(tenantId) ?? null, hubTenantId)) {
      allowed.delete(talentId);
    }
  }
  return allowed;
}

async function loadHubApprovedTalent(
  hubTenantId: string,
): Promise<HubTalentCard[]> {
  const supabase = createPublicSupabaseClient();
  if (!supabase) return [];

  // Resolver contract (web/src/lib/talent/visibility.ts §hub):
  //   roster row on this hub tenant, hub_visibility_status='approved',
  //   joined to an approved + public + live talent_profiles row.
  // RLS on agency_talent_roster permits anon reads only when the joined
  // talent row passes the same gates, so this query is also the
  // authoritative boundary.
  const { data } = await supabase
    .from("agency_talent_roster")
    .select(
      `
        talent_profile_id,
        talent_profiles!inner (
          profile_code, display_name,
          workflow_status, visibility, deleted_at
        )
      `,
    )
    .eq("tenant_id", hubTenantId)
    .eq("hub_visibility_status", "approved")
    .eq("status", "active")
    .eq("talent_profiles.workflow_status", "approved")
    .eq("talent_profiles.visibility", "public")
    .is("talent_profiles.deleted_at", null)
    .limit(48);

  const rows = (data ?? []) as unknown as HubRosterJoinRow[];
  // Agency-level veto: a workspace can keep its talents off hubs entirely, or
  // allow only chosen hubs. Layered on top of the per-roster approval above.
  const allowedIds = await filterByAgencyHubExposure(
    supabase,
    hubTenantId,
    rows.map((r) => r.talent_profile_id).filter(Boolean),
  );
  const cards = await Promise.all(
    rows
      .filter((r) => allowedIds.has(r.talent_profile_id))
      .map((r) => r.talent_profiles)
      .filter(
        (tp): tp is NonNullable<HubRosterJoinRow["talent_profiles"]> => !!tp,
      )
      .map(async (tp) => ({
        profile_code: tp.profile_code,
        display_name: tp.display_name,
        canonicalUrl: await canonicalTalentUrl(tp.profile_code),
      })),
  );
  return cards;
}

type AgencyDomainRow = HubAgencyDomainRow;
type CmsHomeRow = { tenant_id: string | null };

/**
 * TUL-1884: the whole list (domains, agencies, homepages, owners, auth lookups) is cached for 10 minutes (read errors throw, so a failure is never stored) so
 * a hub render almost never touches auth. The key carries the public root so staging and production
 * entries in a shared Data Cache never mix.
 */
export const HUB_AGENCY_LIST_REVALIDATE_SECONDS = 600;
const cachedAgencyList = (): Promise<HubAgencyItem[]> =>
  unstable_cache(computeActiveAgencyDomains, ["hub-landing:agency-list", resolvePublicRootDomain(process.env)], {
    revalidate: HUB_AGENCY_LIST_REVALIDATE_SECONDS,
    tags: ["hub-landing:agencies"],
  })();

/**
 * Failures are never cached: `computeActiveAgencyDomains` THROWS on any read error, so unstable_cache stores
 * nothing, and the render falls back to an empty list (with a logged error) until the next request retries.
 */
async function loadActiveAgencyDomains(): Promise<HubAgencyItem[]> {
  try {
    return await cachedAgencyList();
  } catch (error) {
    logServerError("hubLanding.agencyList", error);
    return [];
  }
}

async function computeActiveAgencyDomains(): Promise<HubAgencyItem[]> {
  const supabase = createPublicSupabaseClient();
  if (!supabase) throw new Error("hubLanding: public Supabase client unavailable");
  const { data, error: domainsError } = await supabase
    .from("agency_domains")
    .select("hostname, kind, tenant_id")
    .in("kind", ["subdomain", "custom"])
    .in("status", ["active", "ssl_provisioned", "verified"])
    .order("hostname", { ascending: true });
  if (domainsError) throw domainsError;
  // Dev rows (localhost, *.local, LAN ips) are seeded for local work and must not
  // show up on a public hub landing (TUL-978).
  const rows = ((data ?? []) as AgencyDomainRow[]).filter((r) => !isDevOnlyHostname(r.hostname));

  // TUL-978: show the tenant's name, not just its raw domain. Names are public
  // (they head every storefront); a failed read only costs the nicer label.
  type AgencyMeta = Pick<HubAgencyCandidate, "name" | "status" | "discoverExposureEnabled" | "settings" | "agencyKind">;
  const meta = new Map<string, AgencyMeta>();
  const slugs = new Map<string, string>();
  const tenantIds = [...new Set(rows.map((r) => r.tenant_id).filter((v): v is string => Boolean(v)))];
  const admin = createServiceRoleClient();
  if (!admin && tenantIds.length > 0) throw new Error("hubLanding: service-role client unavailable");
  if (admin && tenantIds.length > 0) {
    // TUL-1884: status + exposure + settings flags decide whether a workspace is listed publicly.
    const { data: agencyRows, error: namesError } = await admin
      .from("agencies")
      .select("id, display_name, slug, status, kind, discover_exposure_enabled, settings")
      .in("id", tenantIds);
    if (namesError) throw namesError;
    for (const a of (agencyRows ?? []) as Array<{
      id: string;
      display_name: string | null;
      slug?: string | null;
      status: string | null;
      kind: string | null;
      discover_exposure_enabled: boolean | null;
      settings: Record<string, unknown> | null;
    }>) {
      if (a.slug) slugs.set(a.id, a.slug); // TUL-1843: the /w/<slug> fallback for custom-domain-only tenants
      meta.set(a.id, {
        name: a.display_name?.trim() || null,
        status: a.status,
        agencyKind: a.kind,
        discoverExposureEnabled: a.discover_exposure_enabled,
        settings: a.settings,
      });
    }
  }
  // TUL-1884: the listing bar for test workspaces is a PUBLISHED system homepage.
  const published = new Set<string>();
  if (admin && tenantIds.length > 0) {
    const { data: homes, error: homesError } = await admin
      .from("cms_pages")
      .select("tenant_id")
      .in("tenant_id", tenantIds)
      .eq("status", "published")
      .eq("is_system_owned", true)
      .eq("system_template_key", "homepage");
    if (homesError) throw homesError;
    for (const h of (homes ?? []) as CmsHomeRow[]) if (h.tenant_id) published.add(h.tenant_id);
  }
  const realOwned = await loadTenantsWithRealOwner(admin, tenantIds);
  // Eligibility (TUL-1884) decides WHICH tenants are listed; buildHubAgencyEntries (TUL-1843) decides each
  // entry's href: production-pattern hosts re-homed onto this environment, live custom domains dropped off
  // production, `/w/<slug>` for a custom-domain-only tenant. One card per tenant, custom domain first.
  const names = new Map<string, string>();
  const rowsByTenant = new Map<string, AgencyDomainRow[]>();
  for (const r of rows) {
    const m = r.tenant_id ? meta.get(r.tenant_id) : undefined;
    // A domain whose workspace row could not be read has no name or status: it is not listed.
    const candidate: HubAgencyCandidate = { hostname: r.hostname, tenantId: r.tenant_id, domainKind: r.kind, hasPublishedHomepage: Boolean(r.tenant_id && published.has(r.tenant_id)), hasRealOwner: Boolean(r.tenant_id && realOwned.has(r.tenant_id)), agencyKind: m?.agencyKind ?? null, name: m?.name ?? null, status: m?.status ?? "unknown", discoverExposureEnabled: m?.discoverExposureEnabled, settings: m?.settings };
    if (!r.tenant_id || !isPublicHubAgency(candidate)) continue;
    if (m?.name) names.set(r.tenant_id, m.name);
    rowsByTenant.set(r.tenant_id, [...(rowsByTenant.get(r.tenant_id) ?? []), r]);
  }
  const seen = new Set<string>();
  const out: HubAgencyItem[] = [];
  for (const tenantRows of rowsByTenant.values()) {
    const ordered = [...tenantRows].sort((x, y) => Number(y.kind === "custom") - Number(x.kind === "custom"));
    const entry = buildHubAgencyEntries(ordered, names, process.env, slugs)[0];
    if (!entry || !entry.name || seen.has(entry.hostname)) continue;
    seen.add(entry.hostname);
    out.push({ hostname: entry.hostname, name: entry.name });
  }
  return out;
}

/**
 * TUL-1884: tenants whose active owner is a real person. One batched read of owner memberships, one of the
 * account flags (profiles + talent_profiles), and one auth lookup per distinct owner (the repo's
 * service-role `auth.admin` pattern; profiles carries no email). A read failure THROWS (never cached);
 * the caller falls back to an empty list rather than test data.
 */
async function loadTenantsWithRealOwner(
  admin: ReturnType<typeof createServiceRoleClient>,
  tenantIds: string[],
): Promise<Set<string>> {
  if (!admin || tenantIds.length === 0) return new Set();
  const { data: members, error } = await admin
    .from("agency_memberships")
    .select("tenant_id, profile_id")
    .in("tenant_id", tenantIds)
    .eq("role", "owner")
    .eq("status", "active")
    .is("removed_at", null);
  if (error) throw error;
  const ownersByTenant = new Map<string, string[]>();
  for (const m of (members ?? []) as Array<{ tenant_id: string; profile_id: string }>) {
    ownersByTenant.set(m.tenant_id, [...(ownersByTenant.get(m.tenant_id) ?? []), m.profile_id]);
  }
  const ownerIds = [...new Set([...ownersByTenant.values()].flat())];
  if (ownerIds.length === 0) return new Set();

  const flagged = new Set<string>();
  const [profileFlags, talentFlags] = await Promise.all([
    admin.from("profiles").select("id").in("id", ownerIds).eq("is_test_account", true),
    admin.from("talent_profiles").select("user_id").in("user_id", ownerIds).or("is_test_account.eq.true,is_demo.eq.true"),
  ]);
  if (profileFlags.error || talentFlags.error) throw profileFlags.error ?? talentFlags.error;
  for (const r of (profileFlags.data ?? []) as Array<{ id: string }>) flagged.add(r.id);
  for (const r of (talentFlags.data ?? []) as Array<{ user_id: string | null }>) if (r.user_id) flagged.add(r.user_id);

  const emailByUser = new Map<string, string>();
  // Owners already flagged as test accounts are decided; only the rest need an auth email lookup.
  await Promise.all(
    ownerIds.filter((id) => !flagged.has(id)).map(async (id) => {
      const { data, error: userError } = await admin.auth.admin.getUserById(id);
      if (userError) throw userError;
      if (data?.user?.email) emailByUser.set(id, data.user.email);
    }),
  );
  return tenantsWithRealOwner({ ownersByTenant, emailByUser, flaggedUserIds: flagged });
}
