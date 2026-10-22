import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { tenantAdminSlugFromNext, type PostAuthContext } from "@/lib/auth-flow";
import { logServerError } from "@/lib/server/safe-error";

/**
 * TUL-1255: the membership fact `resolvePostAuthDestination` needs to honor
 * `next=/<slug>/admin` for a workspace owner whose `app_role` is `talent`.
 *
 * One cheap read, and only when `next` really is a tenant-scoped admin path. Fails
 * closed: any error or no match yields an empty context, which is today's behavior
 * (the user lands on their own dashboard). The admin layout still gates the page.
 */
export async function postAuthContextForNext(
  supabase: Pick<SupabaseClient, "from">,
  userId: string,
  next: string | null | undefined,
): Promise<PostAuthContext> {
  const slug = tenantAdminSlugFromNext(next);
  if (!slug) return {};
  try {
    const { data, error } = await supabase
      .from("agency_memberships")
      .select("status, agencies:tenant_id ( slug )")
      .eq("profile_id", userId)
      .eq("status", "active");
    if (error) {
      logServerError("auth/postAuthContextForNext", error);
      return { membershipUnknown: true };
    }
    const rows = (data ?? []) as unknown as Array<{ agencies: { slug: string } | null }>;
    return rows.some((r) => r.agencies?.slug === slug) ? { memberSlugs: new Set([slug]) } : {};
  } catch (thrown) {
    logServerError("auth/postAuthContextForNext", thrown);
    return { membershipUnknown: true };
  }
}
