// Workspace admin — Activity Log.
//
// Server Component. Capability gate: `manage_agency_settings` (admin/owner —
// the log exposes IPs and security events, so it is not an all-staff surface).
// Reads the latest slice of `public.workspace_audit_events` for the tenant via
// the service-role client (RLS SELECT also allows staff; service-role keeps
// this page working for platform admins supporting a tenant). Filtering is
// client-side over the loaded slice, same pattern as the platform audit log.

import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { ActivityLogClient, type WorkspaceAuditRow } from "./ActivityLogClient";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;
type PageSearchParams = Promise<{ limit?: string }>;

const DEFAULT_LIMIT = 300;
const MAX_LIMIT = 1000;

export default async function ActivityLogPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: PageSearchParams;
}) {
  const { tenantSlug } = await params;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const canView = await userHasCapability("manage_agency_settings", scope.tenantId);
  if (!canView) notFound();

  const { limit: rawLimit } = await searchParams;
  const parsed = Number.parseInt(rawLimit ?? "", 10);
  const limit = Number.isFinite(parsed)
    ? Math.min(Math.max(parsed, 50), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const admin = createServiceRoleClient();
  let rows: WorkspaceAuditRow[] = [];
  if (admin) {
    const { data } = await admin
      .from("workspace_audit_events")
      .select(
        "id, actor_user_id, actor_label, actor_kind, action, category, target_type, target_id, target_label, summary, metadata, ip_address, country, user_agent, created_at",
      )
      .eq("tenant_id", scope.tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);
    rows = (data ?? []).map((r) => ({
      id: r.id as string,
      actorUserId: (r.actor_user_id as string | null) ?? null,
      actorLabel: (r.actor_label as string | null) ?? null,
      actorKind: (r.actor_kind as string) ?? "system",
      action: (r.action as string) ?? "",
      category: (r.category as string) ?? "system",
      targetType: (r.target_type as string | null) ?? null,
      targetId: (r.target_id as string | null) ?? null,
      targetLabel: (r.target_label as string | null) ?? null,
      summary: (r.summary as string | null) ?? null,
      metadata: (r.metadata as Record<string, unknown> | null) ?? null,
      ipAddress: (r.ip_address as string | null) ?? null,
      country: (r.country as string | null) ?? null,
      userAgent: (r.user_agent as string | null) ?? null,
      createdAtIso: r.created_at as string,
    }));
  }

  return <ActivityLogClient rows={rows} loadedLimit={limit} maxLimit={MAX_LIMIT} />;
}
