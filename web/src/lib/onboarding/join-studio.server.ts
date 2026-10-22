import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isLiveDomainStatus } from "@/lib/saas/workspace-live-url";
import { logServerError } from "@/lib/server/safe-error";

import type { StudioReference } from "./join-studio";

export type JoinableStudio = { tenantId: string; displayName: string; acceptsOpenApplications: boolean };

/** The caller's own live talent profile id, `null` when none, or `"error"` on a failed read. */
export async function loadOwnTalentProfileId(admin: SupabaseClient, userId: string): Promise<string | null | "error"> {
  const { data, error } = await admin
    .from("talent_profiles")
    .select("id")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (error) {
    logServerError("join-studio.profile", error);
    return "error";
  }
  return data?.id ?? null;
}

/**
 * Resolve a pasted studio reference to a studio workspace. Platform hosts
 * (no tenant) and the hub are never joinable here; a cancelled or archived
 * workspace resolves to nothing. Whether the studio accepts requests at all is
 * the caller's check (registration settings, or the open-applications switch).
 */
export async function resolveJoinableStudio(
  admin: SupabaseClient,
  ref: StudioReference,
): Promise<JoinableStudio | null> {
  let tenantId: string | null = null;
  if (ref.kind === "host") {
    const { data, error } = await admin
      .from("agency_domains")
      .select("tenant_id, status")
      .in("hostname", [ref.host, `www.${ref.host}`]);
    if (error) {
      logServerError("join-studio.domain", error);
      return null;
    }
    const live = (data ?? []).find((d) => d.tenant_id && isLiveDomainStatus(d.status));
    tenantId = live?.tenant_id ?? null;
    if (!tenantId) return null;
  }

  const query = admin.from("agencies").select("id, display_name, status, kind, accepts_open_applications").limit(1);
  const { data: agency, error } = await (ref.kind === "slug" ? query.eq("slug", ref.slug) : query.eq("id", tenantId)).maybeSingle();
  if (error) {
    logServerError("join-studio.agency", error);
    return null;
  }
  if (!agency || agency.kind !== "agency") return null;
  if (agency.status === "cancelled" || agency.status === "archived") return null;
  return { tenantId: agency.id, displayName: agency.display_name, acceptsOpenApplications: agency.accepts_open_applications === true };
}
