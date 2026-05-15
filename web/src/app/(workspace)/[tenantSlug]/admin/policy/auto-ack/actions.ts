"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Update the workspace auto-acknowledgement policy. Gated on owner / admin
 * membership role — coordinators don't get to flip the auto-ack switch.
 *
 * Reads `enabled` and `message` from the form. Empty message falls back
 * to a sensible default; the DB column is NOT NULL with a default of
 * "Thanks — we'll get back to you within 4 hours." per migration
 * 20260514024818_agencies_auto_ack.sql, so we just substitute that here
 * if the textarea is blank.
 */
export async function updateAutoAckPolicy(formData: FormData): Promise<void> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) {
    redirect(`/admin/policy/auto-ack?err=${encodeURIComponent(auth.error)}`);
  }

  const tenantSlug = String(formData.get("tenantSlug") ?? "").trim();

  // requireStaffTenantAction only confirms staff-on-this-tenant; we want
  // a tighter gate (owner/admin) for policy edits. Membership role lives
  // on agency_memberships keyed by (tenant_id, user_id).
  const { data: membership } = await auth.supabase
    .from("agency_memberships")
    .select("role")
    .eq("tenant_id", auth.tenantId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  const role = (membership as { role: string } | null)?.role ?? null;
  if (role !== "owner" && role !== "admin") {
    redirect(
      `/${tenantSlug}/admin/policy/auto-ack?err=${encodeURIComponent("Only owners and admins can change this setting.")}`,
    );
  }

  const enabled = formData.get("enabled") === "on";
  const rawMessage = String(formData.get("message") ?? "").trim();
  const message =
    rawMessage.length > 0
      ? rawMessage.slice(0, 500)
      : "Thanks — we'll get back to you within 4 hours.";

  const { error } = await auth.supabase
    .from("agencies")
    .update({
      auto_ack_enabled: enabled,
      auto_ack_message: message,
    })
    .eq("id", auth.tenantId);

  if (error) {
    logServerError("admin.policy.autoAck.update", error);
    redirect(
      `/${tenantSlug}/admin/policy/auto-ack?err=${encodeURIComponent("Failed to save. Try again.")}`,
    );
  }

  revalidatePath(`/${tenantSlug}/admin/policy/auto-ack`);
  redirect(`/${tenantSlug}/admin/policy/auto-ack?ok=1`);
}
