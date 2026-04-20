import { createPublicSupabaseClient } from "@/lib/supabase/public";

/**
 * Root page for `kind === "hub"` — the cross-tenant hub surface
 * (e.g. impronta.group, pitiriasisversicolor.com).
 *
 * Scope in this phase: a single landing that lists every registered agency
 * domain as an outbound link. No hub-wide search, no hub auth, no CMS.
 * Agency brand surfaces remain the source of truth for their own content.
 */
export async function HubLanding() {
  const supabase = createPublicSupabaseClient();

  type AgencyDomainRow = { hostname: string; kind: string };
  let agencies: AgencyDomainRow[] = [];

  if (supabase) {
    const { data } = await supabase
      .from("agency_domains")
      .select("hostname, kind")
      .in("kind", ["subdomain", "custom"])
      .in("status", ["active", "ssl_provisioned", "verified"])
      .order("hostname", { ascending: true });
    agencies = (data ?? []) as AgencyDomainRow[];
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <p className="font-display text-xs font-medium uppercase tracking-[0.4em] text-[var(--impronta-gold-dim)]">
          Impronta Hub
        </p>
        <h1 className="mt-6 font-display text-3xl font-normal leading-tight tracking-[0.06em] text-foreground sm:text-4xl">
          Agencies on the platform
        </h1>
        <p className="mt-4 max-w-xl text-base text-[var(--impronta-muted)]">
          Each agency runs its own storefront at its own domain. Visit one to
          browse its talent roster and open an inquiry.
        </p>

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
