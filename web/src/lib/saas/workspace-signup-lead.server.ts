// ============================================================================
// workspace-signup-lead.server.ts — small server-only reads against a
// marketing lead (saas_marketing_signups), split out of the workspace-signup
// server module to keep that file under the max-lines cap.
// ============================================================================

import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * Read just the contact email captured on a marketing lead, by lead id.
 * Used to pre-fill the register form's email field after the get-started
 * funnel hands off to /register?intent=workspace&lead=<id>, so the operator
 * never retypes the address they just entered. Service-role read scoped to a
 * single lead id; returns null on any miss/error — the pre-fill is a pure
 * convenience and must never gate or break registration. The email is never
 * passed through the URL (it's PII); it is resolved server-side here.
 */
export async function loadWorkspaceLeadEmail(
  leadId: string,
): Promise<string | null> {
  if (!leadId) return null;
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("saas_marketing_signups")
    .select("email")
    .eq("id", leadId)
    .maybeSingle();
  if (error || !data?.email) return null;
  return String(data.email).trim() || null;
}
