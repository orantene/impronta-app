"use server";

// admin-user-workspaces.ts
//
// Returns all workspaces (agency_memberships) the current signed-in user
// belongs to, joined with agency display info and primary domain. Used by
// TenantSwitcherDrawer to replace mock data with the user's real workspaces.

import { requireSession } from "@/lib/server/action-guards";
import { logServerError } from "@/lib/server/safe-error";

export type UserWorkspace = {
  id: string;
  slug: string;
  name: string;
  /** Lowercase role as stored in DB: "owner" | "admin" | "coordinator" | "editor" | "talent" */
  role: string;
  /** Plan tier as stored in DB: "free" | "studio" | "agency" | "network" */
  tier: string;
  /** Organization kind: "agency" | "hub". */
  kind: string;
  /** Primary subdomain hostname, e.g. "acme.tulala.digital". Null if not yet provisioned. */
  domain: string | null;
  /** Seat cap from agencies.talent_seat_limit. Null = unlimited (network plan). */
  seatCap: number | null;
};

export type LoadUserWorkspacesResult =
  | { ok: true; workspaces: UserWorkspace[] }
  | { ok: false; error: string };

export async function actionLoadUserWorkspaces(): Promise<LoadUserWorkspacesResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user } = auth;

  const { data: memberships, error: membErr } = await supabase
    .from("agency_memberships")
    .select("role, tenant_id, agencies!inner(id, slug, display_name, plan_tier, talent_seat_limit, kind)")
    .eq("profile_id", user.id)
    .eq("status", "active");

  if (membErr) {
    logServerError("user-workspaces.load", membErr);
    return { ok: false, error: "Could not load workspaces." };
  }

  if (!memberships || memberships.length === 0) {
    return { ok: true, workspaces: [] };
  }

  const tenantIds = memberships.map((m) => m.tenant_id as string);

  // Include custom domains too (not just subdomains): a tenant's real public
  // face is often a custom primary domain (e.g. improntamodels.com), and the
  // switcher shows / copies / opens this host. Restricting to kind='subdomain'
  // excluded the primary and let a stale non-primary subdomain (a dead legacy
  // host like impronta.studiobooking.io) win by insertion order.
  const { data: domainRows } = await supabase
    .from("agency_domains")
    .select("tenant_id, hostname, kind, is_primary, status")
    .in("tenant_id", tenantIds)
    .eq("status", "active");

  // Build a best-domain map by rank so a stale host never wins on ordering:
  //   primary (3) > tulala.digital platform host (2) > any other (1).
  // Local/dev hosts (.local, .lvh.me) fall to the bottom automatically.
  type DomainRow = { tenant_id: string; hostname: string; kind: string; is_primary: boolean };
  const rankOf = (d: DomainRow): number =>
    d.is_primary ? 3 : /\.tulala\.digital$/i.test(d.hostname) ? 2 : /\.(local|lvh\.me)$/i.test(d.hostname) ? 0 : 1;
  const bestByTenant: Record<string, DomainRow> = {};
  for (const d of (domainRows ?? []) as DomainRow[]) {
    const cur = bestByTenant[d.tenant_id];
    if (!cur || rankOf(d) > rankOf(cur)) {
      bestByTenant[d.tenant_id] = d;
    }
  }
  const domainByTenant: Record<string, string> = {};
  for (const [tid, d] of Object.entries(bestByTenant)) {
    domainByTenant[tid] = d.hostname;
  }

  const workspaces: UserWorkspace[] = memberships.map((m) => {
    const agRaw = m.agencies;
    const ag = (Array.isArray(agRaw) ? agRaw[0] : agRaw) as {
      id: string;
      slug: string;
      display_name: string;
      plan_tier: string | null;
      talent_seat_limit: number | null;
      kind: string | null;
    } | null;

    return {
      id: (ag?.id ?? m.tenant_id) as string,
      slug: ag?.slug ?? "",
      name: ag?.display_name ?? m.tenant_id as string,
      role: m.role as string,
      tier: ag?.plan_tier ?? "free",
      kind: ag?.kind ?? "agency",
      domain: domainByTenant[m.tenant_id as string] ?? null,
      seatCap: ag?.talent_seat_limit ?? null,
    };
  });

  return { ok: true, workspaces };
}
