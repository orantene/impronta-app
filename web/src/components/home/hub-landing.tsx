import Link from "next/link";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { loadPublicHomepage } from "@/lib/site-admin/server/homepage-reads";
import { loadPublicIdentity } from "@/lib/site-admin/server/reads";
import { HomepageCmsSections } from "@/components/home/homepage-cms-sections";
import { isLocale } from "@/lib/site-admin/locales";
import { getRequestLocale } from "@/i18n/request-locale";
import type { Locale } from "@/i18n/config";
import { canonicalTalentUrl } from "@/lib/saas/canonical-hosts";

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

  const kicker = identity?.public_name ?? "Impronta Hub";
  const tagline =
    identity?.tagline ??
    "Each agency runs its own storefront at its own domain. Visit one to browse its talent roster and open an inquiry.";
  const heroTitle = cmsHomepage?.title ?? "Agencies on the platform";

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
            No active agency domains yet.
          </p>
        ) : (
          <ul className="mt-12 grid gap-3 sm:grid-cols-2">
            {agencies.map((a) => (
              <li key={a.hostname}>
                <a
                  href={`//${a.hostname}`}
                  className="block rounded-lg border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)]/40 px-5 py-4 text-sm text-foreground transition hover:bg-[var(--impronta-surface)]/60"
                >
                  <span className="font-display tracking-[0.08em]">
                    {a.hostname}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}

        <HubTalentDirectory talent={hubTalent} />
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

async function HubTalentDirectory({ talent }: { talent: HubTalentCard[] }) {
  if (talent.length === 0) return null;
  return (
    <section className="mt-16">
      <h2 className="font-display text-sm font-medium uppercase tracking-[0.3em] text-[var(--impronta-gold-dim)]">
        Featured on the hub
      </h2>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {talent.map((t) => {
          const label = t.display_name?.trim() || t.profile_code;
          const card = (
            <div className="flex h-full flex-col justify-between rounded-lg border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)]/40 px-5 py-4 text-sm transition hover:bg-[var(--impronta-surface)]/60">
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
  talent_profiles: {
    profile_code: string;
    display_name: string | null;
    workflow_status: string | null;
    visibility: string | null;
    deleted_at: string | null;
  } | null;
};

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
  const cards = await Promise.all(
    rows
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

type AgencyDomainRow = { hostname: string; kind: string };

async function loadActiveAgencyDomains(): Promise<AgencyDomainRow[]> {
  const supabase = createPublicSupabaseClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("agency_domains")
    .select("hostname, kind")
    .in("kind", ["subdomain", "custom"])
    .in("status", ["active", "ssl_provisioned", "verified"])
    .order("hostname", { ascending: true });
  return (data ?? []) as AgencyDomainRow[];
}
