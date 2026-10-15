import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/** `agencies.kind` ("agency" | "hub" | ...) for a tenant id, or null when unknown. */
export async function loadTenantKind(tenantId: string | null | undefined): Promise<string | null> {
  if (!tenantId) return null;
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin.from("agencies").select("kind").eq("id", tenantId).maybeSingle();
  if (error) {
    logServerError("tenant-kind.loadTenantKind", error);
    return null;
  }
  return (data as { kind?: string } | null)?.kind ?? null;
}
