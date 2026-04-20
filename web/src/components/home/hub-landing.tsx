import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { loadPublicHomepage } from "@/lib/site-admin/server/homepage-reads";
import { loadPublicIdentity } from "@/lib/site-admin/server/reads";
import { HomepageCmsSections } from "@/components/home/homepage-cms-sections";
import { isLocale } from "@/lib/site-admin/locales";
import { getRequestLocale } from "@/i18n/request-locale";
import type { Locale } from "@/i18n/config";

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

  const [identity, cmsHomepage, agencies] = await Promise.all([
    loadPublicIdentity(tenantId),
    cmsLocale ? loadPublicHomepage(tenantId, cmsLocale) : Promise.resolve(null),
    loadActiveAgencyDomains(),
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
      </main>
    </div>
  );
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
