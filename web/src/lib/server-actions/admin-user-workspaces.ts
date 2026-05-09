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
    .select("role, tenant_id, agencies!inner(id, slug, display_name, plan_tier, talent_seat_limit)")
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

  const { data: domainRows } = await supabase
    .from("agency_domains")
    .select("tenant_id, hostname, kind, is_primary")
    .in("tenant_id", tenantIds)
    .eq("kind", "subdomain");

  // Build a best-domain map: prefer is_primary, else first subdomain found.
  const domainByTenant: Record<string, string> = {};
  for (const d of (domainRows ?? []) as Array<{ tenant_id: string; hostname: string; kind: string; is_primary: boolean }>) {
    if (!domainByTenant[d.tenant_id] || d.is_primary) {
      domainByTenant[d.tenant_id] = d.hostname;
    }
  }

  const workspaces: UserWorkspace[] = memberships.map((m) => {
    const agRaw = m.agencies;
    const ag = (Array.isArray(agRaw) ? agRaw[0] : agRaw) as {
      id: string;
      slug: string;
      display_name: string;
      plan_tier: string | null;
      talent_seat_limit: number | null;
    } | null;

    return {
      id: (ag?.id ?? m.tenant_id) as string,
      slug: ag?.slug ?? "",
      name: ag?.display_name ?? m.tenant_id as string,
      role: m.role as string,
      tier: ag?.plan_tier ?? "free",
      domain: domainByTenant[m.tenant_id as string] ?? null,
      seatCap: ag?.talent_seat_limit ?? null,
    };
  });

  return { ok: true, workspaces };
}
