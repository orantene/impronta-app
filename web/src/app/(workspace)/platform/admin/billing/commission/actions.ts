"use server";

/**
 * Platform-admin commission-config surface (server actions).
 *
 * Edits the singleton `platform_commission_config` row. All writes are
 * platform-admin-only and audited to `platform_audit_log`.
 */

import { getCachedActorSession } from "@/lib/server/request-cache";
import { getPlatformRole } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export type CommissionConfig = {
  defaultTakeBps: number;
  defaultTakeFloorCents: number;
  planTierBps: Record<string, number>;
};

export type CommissionActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ─── Authorization ─────────────────────────────────────────────────────────

async function requirePlatformAdmin() {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false as const, error: "Not authenticated." };
  if (getPlatformRole(session.profile) !== "super_admin") {
    return { ok: false as const, error: "Forbidden — platform admin only." };
  }
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false as const, error: "Platform service client unavailable." };
  return { ok: true as const, sb, actorId: session.user.id };
}

// ─── Load ──────────────────────────────────────────────────────────────────

export async function loadPlatformCommissionConfig(): Promise<CommissionActionResult<CommissionConfig>> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const { sb } = auth;

  try {
    const { data, error } = await sb
      .from("platform_commission_config")
      .select("default_take_bps, default_take_floor_cents, plan_tier_bps")
      .eq("singleton_key", true)
      .maybeSingle();
    if (error || !data) {
      return { ok: false, error: error?.message ?? "Config not found." };
    }
    return {
      ok: true,
      data: {
        defaultTakeBps: data.default_take_bps,
        defaultTakeFloorCents: data.default_take_floor_cents,
        planTierBps: (data.plan_tier_bps ?? {}) as Record<string, number>,
      },
    };
  } catch (err) {
    logServerError("platform-commission.load", err);
    return { ok: false, error: "Failed to load commission config." };
  }
}

// ─── Update ────────────────────────────────────────────────────────────────

export type UpdateCommissionConfigArgs = {
  defaultTakeBps: number;
  defaultTakeFloorCents: number;
  planTierBps: Record<string, number>;
};

function validateBps(bps: number, label: string): string | null {
  if (!Number.isFinite(bps) || bps < 0 || bps > 5000) {
    return `${label} must be between 0 and 5000 bps (0–50%).`;
  }
  return null;
}

export async function updatePlatformCommissionConfig(
  args: UpdateCommissionConfigArgs,
): Promise<CommissionActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const { sb, actorId } = auth;

  // Validate default bps.
  const defaultErr = validateBps(Math.round(args.defaultTakeBps), "Default take");
  if (defaultErr) return { ok: false, error: defaultErr };

  if (!Number.isFinite(args.defaultTakeFloorCents) || args.defaultTakeFloorCents < 0) {
    return { ok: false, error: "Floor must be 0 or a positive number of cents." };
  }

  // Validate every plan tier bps.
  const VALID_TIERS = new Set(["free", "studio", "agency", "network"]);
  const cleanTierBps: Record<string, number> = {};
  for (const [tier, bps] of Object.entries(args.planTierBps)) {
    if (!VALID_TIERS.has(tier)) {
      return { ok: false, error: `Unknown plan tier: ${tier}.` };
    }
    const roundedBps = Math.round(bps);
    const tierErr = validateBps(roundedBps, `${tier} take`);
    if (tierErr) return { ok: false, error: tierErr };
    cleanTierBps[tier] = roundedBps;
  }

  try {
    // Read the before-state for the audit log.
    const { data: before } = await sb
      .from("platform_commission_config")
      .select("default_take_bps, default_take_floor_cents, plan_tier_bps")
      .eq("singleton_key", true)
      .maybeSingle();

    const { error: updErr } = await sb
      .from("platform_commission_config")
      .update({
        default_take_bps: Math.round(args.defaultTakeBps),
        default_take_floor_cents: Math.round(args.defaultTakeFloorCents),
        plan_tier_bps: cleanTierBps,
        updated_at: new Date().toISOString(),
      })
      .eq("singleton_key", true);
    if (updErr) {
      logServerError("platform-commission.update", updErr);
      return { ok: false, error: "Could not save commission config." };
    }

    // Audit log.
    await sb.from("platform_audit_log").insert({
      actor_profile_id: actorId,
      actor_role: "super_admin",
      action: "platform.commission.config.update",
      target_type: "platform_commission_config",
      target_id: "singleton",
      severity: "warn",
      metadata: {
        before: before ?? null,
        after: {
          default_take_bps: Math.round(args.defaultTakeBps),
          default_take_floor_cents: Math.round(args.defaultTakeFloorCents),
          plan_tier_bps: cleanTierBps,
        },
      },
    });

    return { ok: true, data: undefined };
  } catch (err) {
    logServerError("platform-commission.update", err);
    return { ok: false, error: "Failed to save commission config." };
  }
}
