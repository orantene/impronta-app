"use server";

/**
 * Workspace self-serve — automatic base reservation fee.
 *
 * A workspace admin sets their own automatic base reservation fee (a flat
 * amount and/or a % of subtotal), charged on every booking as workspace
 * revenue. Bounded by the platform caps (platform_commission_config
 * max_base_fee_cents / max_base_fee_bps). The fee is never taken from the
 * talent — it's added on top of the quote and flows into workspace_fee.
 *
 * Capability-gated to `agency.workspace.edit` (workspace admins), then writes
 * via the service-role client because workspace_commission_overrides is under
 * admin-only RLS — the same pattern the platform commission actions use.
 */

import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { revalidatePath } from "next/cache";

export type BaseFeeResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type WorkspaceBaseFeeState = {
  /** Current flat base fee in cents (null = none). */
  baseFeeCents: number | null;
  /** Current % base fee in bps (null = none). */
  baseFeeBps: number | null;
  /** Platform cap on the flat fee in cents (null = uncapped). */
  maxBaseFeeCents: number | null;
  /** Platform cap on the % fee in bps (null = uncapped). */
  maxBaseFeeBps: number | null;
};

async function requireWorkspaceEditor(tenantSlug: string) {
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) return { ok: false as const, error: "Workspace not found." };
  const canEdit = await userHasCapability(scope.tenantId, "agency.workspace.edit");
  if (!canEdit) return { ok: false as const, error: "Forbidden — workspace admin only." };
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false as const, error: "You must be signed in." };
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false as const, error: "Service client unavailable." };
  return { ok: true as const, sb, tenantId: scope.tenantId, actorId: session.user.id };
}

export async function loadWorkspaceBaseFee(
  tenantSlug: string,
): Promise<BaseFeeResult<WorkspaceBaseFeeState>> {
  const auth = await requireWorkspaceEditor(tenantSlug);
  if (!auth.ok) return auth;
  const { sb, tenantId } = auth;

  try {
    const [{ data: override }, { data: caps }] = await Promise.all([
      sb
        .from("workspace_commission_overrides")
        .select("base_reservation_fee_cents, base_reservation_fee_bps")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      sb
        .from("platform_commission_config")
        .select("max_base_fee_cents, max_base_fee_bps")
        .eq("singleton_key", true)
        .maybeSingle(),
    ]);

    return {
      ok: true,
      data: {
        baseFeeCents: override?.base_reservation_fee_cents ?? null,
        baseFeeBps: override?.base_reservation_fee_bps ?? null,
        maxBaseFeeCents: caps?.max_base_fee_cents ?? null,
        maxBaseFeeBps: caps?.max_base_fee_bps ?? null,
      },
    };
  } catch (err) {
    logServerError("workspace.base-fee.load", err);
    return { ok: false, error: "Failed to load the base reservation fee." };
  }
}

export async function saveWorkspaceBaseFee(
  tenantSlug: string,
  input: { baseFeeCents: number | null; baseFeeBps: number | null },
): Promise<BaseFeeResult> {
  const auth = await requireWorkspaceEditor(tenantSlug);
  if (!auth.ok) return auth;
  const { sb, tenantId, actorId } = auth;

  // Normalize + validate the requested values.
  let cents: number | null = null;
  if (input.baseFeeCents != null) {
    const c = Math.round(input.baseFeeCents);
    if (!Number.isFinite(c) || c < 0) {
      return { ok: false, error: "Flat fee must be 0 or a positive amount." };
    }
    cents = c;
  }
  let bps: number | null = null;
  if (input.baseFeeBps != null) {
    const b = Math.round(input.baseFeeBps);
    if (!Number.isFinite(b) || b < 0 || b > 5000) {
      return { ok: false, error: "Percent fee must be between 0% and 50%." };
    }
    bps = b;
  }

  try {
    // Enforce the platform caps.
    const { data: caps } = await sb
      .from("platform_commission_config")
      .select("max_base_fee_cents, max_base_fee_bps")
      .eq("singleton_key", true)
      .maybeSingle();

    const maxCents = caps?.max_base_fee_cents ?? null;
    const maxBps = caps?.max_base_fee_bps ?? null;
    if (maxCents != null && cents != null && cents > maxCents) {
      return {
        ok: false,
        error: `Flat fee exceeds the platform cap of $${(maxCents / 100).toFixed(2)}.`,
      };
    }
    if (maxBps != null && bps != null && bps > maxBps) {
      return {
        ok: false,
        error: `Percent fee exceeds the platform cap of ${(maxBps / 100).toFixed(2)}%.`,
      };
    }

    const { error: upsertErr } = await sb
      .from("workspace_commission_overrides")
      .upsert(
        {
          tenant_id: tenantId,
          base_reservation_fee_cents: cents,
          base_reservation_fee_bps: bps,
          set_by_user_id: actorId,
          set_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id" },
      );
    if (upsertErr) {
      logServerError("workspace.base-fee.save", upsertErr);
      return { ok: false, error: "Could not save the base reservation fee." };
    }

    revalidatePath(`/${tenantSlug}/admin/payouts`);
    return { ok: true, data: undefined };
  } catch (err) {
    logServerError("workspace.base-fee.save", err);
    return { ok: false, error: "Could not save the base reservation fee." };
  }
}
