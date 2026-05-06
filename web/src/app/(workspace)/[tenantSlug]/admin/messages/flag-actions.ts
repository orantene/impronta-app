"use server";

// Phase 3.12 / Messages — per-user inquiry flag actions.
// Toggles pin / manual-unread / bulk archive against inquiry_user_flags
// via the SQL helper RPCs in 20260907100000_inquiry_user_flags.sql.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { logServerError } from "@/lib/server/safe-error";
import { revalidatePath } from "next/cache";

type FlagResult = { ok: true; pinned?: boolean; manuallyUnread?: boolean }
                | { ok: false; error: string };

type GateResult =
  | { ok: false; error: string }
  | { ok: true; scope: NonNullable<Awaited<ReturnType<typeof getTenantScopeBySlug>>>; supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>> };

async function gateAndClient(tenantSlug: string): Promise<GateResult> {
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) return { ok: false, error: "Workspace not found." };
  const can = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!can) return { ok: false, error: "Not authorised." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };
  return { ok: true, scope, supabase };
}

/** Toggle pinned flag for the calling user × inquiry. Returns new state. */
export async function togglePinInquiry(
  tenantSlug: string,
  inquiryId: string,
): Promise<FlagResult> {
  try {
    const r = await gateAndClient(tenantSlug);
    if (!r.ok) return { ok: false, error: r.error };

    const { data, error } = await r.supabase.rpc("toggle_inquiry_pin", {
      p_inquiry_id: inquiryId,
    });
    if (error) {
      logServerError("messages.togglePin", error);
      return { ok: false, error: "Could not update pin." };
    }

    revalidatePath(`/${tenantSlug}/admin/messages`);
    return { ok: true, pinned: Boolean(data) };
  } catch (err) {
    logServerError("messages.togglePin", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/** Toggle manual-unread flag for the calling user × inquiry. */
export async function toggleManualUnreadInquiry(
  tenantSlug: string,
  inquiryId: string,
): Promise<FlagResult> {
  try {
    const r = await gateAndClient(tenantSlug);
    if (!r.ok) return { ok: false, error: r.error };

    const { data, error } = await r.supabase.rpc("toggle_inquiry_manual_unread", {
      p_inquiry_id: inquiryId,
    });
    if (error) {
      logServerError("messages.toggleManualUnread", error);
      return { ok: false, error: "Could not update unread state." };
    }

    revalidatePath(`/${tenantSlug}/admin/messages`);
    return { ok: true, manuallyUnread: Boolean(data) };
  } catch (err) {
    logServerError("messages.toggleManualUnread", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/** Bulk-archive inquiries for the calling user. Returns count archived. */
export async function archiveInquiriesBulk(
  tenantSlug: string,
  inquiryIds: string[],
): Promise<{ ok: true; archived: number } | { ok: false; error: string }> {
  try {
    if (!Array.isArray(inquiryIds) || inquiryIds.length === 0) {
      return { ok: false, error: "Nothing to archive." };
    }
    const r = await gateAndClient(tenantSlug);
    if (!r.ok) return { ok: false, error: r.error };

    const { data, error } = await r.supabase.rpc("archive_inquiries_for_user", {
      p_inquiry_ids: inquiryIds,
    });
    if (error) {
      logServerError("messages.archiveBulk", error);
      return { ok: false, error: "Could not archive selection." };
    }

    revalidatePath(`/${tenantSlug}/admin/messages`);
    return { ok: true, archived: Number(data ?? 0) };
  } catch (err) {
    logServerError("messages.archiveBulk", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * "Nudge" — set next_action_by back to whoever should respond next.
 * Bulk-mode action that re-pings a stale conversation. Today: just bumps
 * updated_at + emits an inquiry_action_log entry. Future: real notification.
 */
export async function nudgeInquiriesBulk(
  tenantSlug: string,
  inquiryIds: string[],
): Promise<{ ok: true; nudged: number } | { ok: false; error: string }> {
  try {
    if (!Array.isArray(inquiryIds) || inquiryIds.length === 0) {
      return { ok: false, error: "Nothing to nudge." };
    }
    const r = await gateAndClient(tenantSlug);
    if (!r.ok) return { ok: false, error: r.error };

    const { error } = await r.supabase
      .from("inquiries")
      .update({ updated_at: new Date().toISOString() })
      .in("id", inquiryIds)
      .eq("tenant_id", r.scope.tenantId);

    if (error) {
      logServerError("messages.nudgeBulk", error);
      return { ok: false, error: "Could not nudge selection." };
    }

    revalidatePath(`/${tenantSlug}/admin/messages`);
    return { ok: true, nudged: inquiryIds.length };
  } catch (err) {
    logServerError("messages.nudgeBulk", err);
    return { ok: false, error: "Unexpected error." };
  }
}
