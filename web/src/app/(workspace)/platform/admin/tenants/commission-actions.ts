"use server";

/**
 * Platform Admin — per-tenant commission override actions.
 *
 * Set, clear, and review commission rate overrides for a workspace.
 * Extracted from actions.ts to keep that file within the 800-line budget.
 */

import { getCachedActorSession } from "@/lib/server/request-cache";
import { getPlatformRole } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

type CommissionActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function requirePlatformAdmin(): Promise<
  { ok: true; sb: SupabaseClient; actorId: string } | { ok: false; error: string }
> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "You must be signed in." };
  if (getPlatformRole(session.profile) !== "super_admin") {
    return { ok: false, error: "Forbidden — platform admin only." };
  }
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Platform service client unavailable." };
  return { ok: true, sb, actorId: session.user.id };
}

async function audit(
  sb: SupabaseClient,
  actorId: string,
  tenantId: string,
  action: string,
  severity: "info" | "warn",
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await sb.from("platform_audit_log").insert({
      actor_profile_id: actorId,
      actor_role: "super_admin",
      action,
      target_type: "workspace_commission_overrides",
      target_id: tenantId,
      tenant_id: tenantId,
      severity,
      metadata,
    });
  } catch (err) {
    logServerError("platform.commission.audit", err);
  }
}

function revalidate(tenantId: string): void {
  revalidatePath("/platform/admin/tenants");
  revalidatePath(`/platform/admin/tenants/${tenantId}`);
}

const NOW = () => new Date().toISOString();

function validateBps(bps: number, label: string): string | null {
  if (!Number.isFinite(bps) || bps < 0 || bps > 5000) {
    return `${label} must be between 0 and 5000 bps (0–50%).`;
  }
  return null;
}

export async function actionSetTenantCommissionOverride(input: {
  tenantId: string;
  platformTakeBps: number;
  platformTakeFloorCents: number;
  note?: string;
}): Promise<CommissionActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const { sb, actorId } = auth;

  if (!input.tenantId) return { ok: false, error: "Missing workspace." };
  const bpsErr = validateBps(Math.round(input.platformTakeBps), "Platform take");
  if (bpsErr) return { ok: false, error: bpsErr };
  if (!Number.isFinite(input.platformTakeFloorCents) || input.platformTakeFloorCents < 0) {
    return { ok: false, error: "Floor must be 0 or a positive number of cents." };
  }

  const { data: agency } = await sb.from("agencies").select("id").eq("id", input.tenantId).maybeSingle();
  if (!agency) return { ok: false, error: "Workspace not found." };

  const { error: upsertErr } = await sb
    .from("workspace_commission_overrides")
    .upsert(
      {
        tenant_id: input.tenantId,
        platform_take_bps: Math.round(input.platformTakeBps),
        platform_take_floor_cents: Math.round(input.platformTakeFloorCents),
        override_note: input.note?.trim() ?? "",
        set_by_user_id: actorId,
        set_at: NOW(),
      },
      { onConflict: "tenant_id" },
    );
  if (upsertErr) {
    logServerError("platform.commission.set", upsertErr);
    return { ok: false, error: "Could not save the commission override." };
  }

  await audit(sb, actorId, input.tenantId, "platform.commission.override.set", "warn", {
    platform_take_bps: Math.round(input.platformTakeBps),
    platform_take_floor_cents: Math.round(input.platformTakeFloorCents),
    note: input.note?.trim() ?? null,
  });
  revalidate(input.tenantId);
  return { ok: true, data: undefined };
}

export async function actionClearTenantCommissionOverride(input: {
  tenantId: string;
}): Promise<CommissionActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const { sb, actorId } = auth;

  if (!input.tenantId) return { ok: false, error: "Missing workspace." };

  const { error: updErr } = await sb
    .from("workspace_commission_overrides")
    .update({
      platform_take_bps: null,
      platform_take_floor_cents: null,
      override_note: "",
      set_by_user_id: actorId,
      set_at: NOW(),
    })
    .eq("tenant_id", input.tenantId);
  if (updErr) {
    logServerError("platform.commission.clear", updErr);
    return { ok: false, error: "Could not clear the commission override." };
  }

  await audit(sb, actorId, input.tenantId, "platform.commission.override.clear", "warn", {});
  revalidate(input.tenantId);
  return { ok: true, data: undefined };
}

export async function actionReviewCommissionRequest(input: {
  tenantId: string;
  decision: "approve" | "deny";
  platformTakeBps?: number;
  reviewNote?: string;
}): Promise<CommissionActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const { sb, actorId } = auth;

  if (!input.tenantId) return { ok: false, error: "Missing workspace." };

  const { data: existing } = await sb
    .from("workspace_commission_overrides")
    .select("requested_platform_take_bps, request_status")
    .eq("tenant_id", input.tenantId)
    .maybeSingle();

  if (!existing || existing.request_status !== "open") {
    return { ok: false, error: "No open commission request for this workspace." };
  }

  if (input.decision === "approve") {
    const bps = input.platformTakeBps ?? existing.requested_platform_take_bps;
    if (bps === null || bps === undefined) {
      return { ok: false, error: "Cannot approve: no bps value available." };
    }
    const bpsErr = validateBps(Math.round(bps), "Approved take");
    if (bpsErr) return { ok: false, error: bpsErr };

    const { error: updErr } = await sb
      .from("workspace_commission_overrides")
      .update({
        platform_take_bps: Math.round(bps),
        request_status: "approved",
        reviewed_at: NOW(),
        reviewed_by_user_id: actorId,
        review_note: input.reviewNote?.trim() ?? null,
        set_by_user_id: actorId,
        set_at: NOW(),
      })
      .eq("tenant_id", input.tenantId);
    if (updErr) {
      logServerError("platform.commission.request.approve", updErr);
      return { ok: false, error: "Could not approve the commission request." };
    }
    await audit(sb, actorId, input.tenantId, "platform.commission.request.approved", "warn", {
      approved_platform_take_bps: Math.round(bps),
      review_note: input.reviewNote?.trim() ?? null,
    });
  } else {
    const { error: updErr } = await sb
      .from("workspace_commission_overrides")
      .update({
        request_status: "denied",
        reviewed_at: NOW(),
        reviewed_by_user_id: actorId,
        review_note: input.reviewNote?.trim() ?? null,
      })
      .eq("tenant_id", input.tenantId);
    if (updErr) {
      logServerError("platform.commission.request.deny", updErr);
      return { ok: false, error: "Could not deny the commission request." };
    }
    await audit(sb, actorId, input.tenantId, "platform.commission.request.denied", "info", {
      review_note: input.reviewNote?.trim() ?? null,
    });
  }

  revalidate(input.tenantId);
  return { ok: true, data: undefined };
}
