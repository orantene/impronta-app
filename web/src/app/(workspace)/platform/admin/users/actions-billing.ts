"use server";

/**
 * D.2 — Platform-admin talent plan override server actions.
 *
 * Mirrors the workspace plan-override pattern (actions.ts in admin/tenants)
 * but targets talent_profiles.talent_plan_key via talent_plan_overrides.
 */

import { revalidatePath } from "next/cache";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getPlatformRole } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { logPlatformAdminAction } from "@/lib/platform/audit";
import {
  computeOverrideExpiry,
  isOverrideDurationKey,
  type OverrideDurationKey,
} from "@/lib/platform/plan-override";
import {
  loadPersonBillingSnapshot,
  type PersonBillingSnapshot,
} from "../../platform-billing-data";

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const TALENT_PLAN_KEYS = [
  "talent_basic",
  "talent_pro",
  "talent_portfolio",
] as const;

type TalentPlanKey = (typeof TALENT_PLAN_KEYS)[number];

function isTalentPlanKey(value: unknown): value is TalentPlanKey {
  return typeof value === "string" && (TALENT_PLAN_KEYS as readonly string[]).includes(value);
}

async function requirePlatformAdmin(): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not authenticated." };
  const role = getPlatformRole(session.profile);
  if (role !== "super_admin") return { ok: false, error: "Forbidden." };
  return { ok: true, userId: session.user.id };
}

const NOW = () => new Date().toISOString();

// ─── Apply talent plan override ───────────────────────────────────────────────

/**
 * Grant a talent profile a temporary plan upgrade.
 * Mirrors the talent's base plan_key for clean reversal.
 */
export async function applyTalentPlanOverride(input: {
  talentProfileId: string;
  overridePlanKey: string;
  durationKey: string;
  customExpiresAt?: string | null;
  reason?: string | null;
  note?: string | null;
}): Promise<ActionResult<{ expiresAt: string | null }>> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;

  if (!input.talentProfileId?.trim()) {
    return { ok: false, error: "Missing talent profile ID." };
  }
  if (!isTalentPlanKey(input.overridePlanKey)) {
    return { ok: false, error: "Invalid plan key." };
  }
  if (!isOverrideDurationKey(input.durationKey)) {
    return { ok: false, error: "Invalid duration." };
  }

  const expiresAt = computeOverrideExpiry(input.durationKey as OverrideDurationKey, {
    customISO: input.customExpiresAt,
  });
  if (input.durationKey === "custom") {
    if (!expiresAt) return { ok: false, error: "Enter a valid custom expiry date." };
    if (new Date(expiresAt).getTime() <= Date.now()) {
      return { ok: false, error: "Custom expiry must be in the future." };
    }
  }

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service role client not available." };

  // Load current talent plan key
  const { data: talent, error: talentErr } = await admin
    .from("talent_profiles")
    .select("id, talent_plan_key")
    .eq("id", input.talentProfileId)
    .maybeSingle();
  if (talentErr || !talent) {
    return { ok: false, error: "Talent profile not found." };
  }

  // Check for an existing active override — preserve its original base
  const { data: existing } = await admin
    .from("talent_plan_overrides")
    .select("id, base_plan_key")
    .eq("talent_profile_id", input.talentProfileId)
    .eq("status", "active")
    .maybeSingle();

  let basePlanKey: TalentPlanKey;
  if (existing && isTalentPlanKey(existing.base_plan_key)) {
    basePlanKey = existing.base_plan_key;
    // Revoke the superseded override
    await admin
      .from("talent_plan_overrides")
      .update({ status: "revoked", ended_at: NOW(), ended_by: auth.userId })
      .eq("id", existing.id);
  } else {
    const rawKey = talent.talent_plan_key as string | null;
    basePlanKey = isTalentPlanKey(rawKey) ? rawKey : "talent_basic";
  }

  // Insert new override
  const { data: inserted, error: insErr } = await admin
    .from("talent_plan_overrides")
    .insert({
      talent_profile_id: input.talentProfileId,
      status: "active",
      base_plan_key: basePlanKey,
      override_plan_key: input.overridePlanKey,
      starts_at: NOW(),
      expires_at: expiresAt,
      reason: input.reason?.trim() || null,
      note: input.note?.trim() || null,
      created_by: auth.userId,
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    logServerError("platform/applyTalentPlanOverride.insert", insErr);
    return { ok: false, error: "Could not record the override." };
  }

  // Mirror onto talent_profiles.talent_plan_key
  const { error: updErr } = await admin
    .from("talent_profiles")
    .update({ talent_plan_key: input.overridePlanKey, updated_at: NOW() })
    .eq("id", input.talentProfileId);
  if (updErr) {
    // Compensate — revoke the inserted row so we don't leave a ghost override
    await admin
      .from("talent_plan_overrides")
      .update({ status: "revoked", ended_at: NOW(), ended_by: auth.userId })
      .eq("id", inserted.id);
    logServerError("platform/applyTalentPlanOverride.update", updErr);
    return { ok: false, error: "Could not apply the plan to the talent profile." };
  }

  await logPlatformAdminAction({
    actorUserId: auth.userId,
    targetKind: "talent_profile",
    targetId: input.talentProfileId,
    action: "talent_plan_override_applied",
    after: {
      overrideId: inserted.id,
      basePlanKey,
      overridePlanKey: input.overridePlanKey,
      expiresAt,
      reason: input.reason?.trim() || null,
    },
  });

  revalidatePath("/platform/admin/users");
  return { ok: true, data: { expiresAt } };
}

// ─── Remove talent plan override ─────────────────────────────────────────────

/**
 * Revoke an active talent plan override and restore the base plan.
 */
export async function removeTalentPlanOverride(
  talentProfileId: string,
): Promise<ActionResult<{ restoredPlanKey: TalentPlanKey }>> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;

  if (!talentProfileId?.trim()) {
    return { ok: false, error: "Missing talent profile ID." };
  }

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service role client not available." };

  const { data: ovr } = await admin
    .from("talent_plan_overrides")
    .select("id, base_plan_key, override_plan_key")
    .eq("talent_profile_id", talentProfileId)
    .eq("status", "active")
    .maybeSingle();
  if (!ovr) {
    return { ok: false, error: "This talent profile has no active override." };
  }

  const restorePlanKey: TalentPlanKey = isTalentPlanKey(ovr.base_plan_key)
    ? ovr.base_plan_key
    : "talent_basic";

  const { error: updErr } = await admin
    .from("talent_profiles")
    .update({ talent_plan_key: restorePlanKey, updated_at: NOW() })
    .eq("id", talentProfileId);
  if (updErr) {
    logServerError("platform/removeTalentPlanOverride.update", updErr);
    return { ok: false, error: "Could not restore the talent plan." };
  }

  await admin
    .from("talent_plan_overrides")
    .update({ status: "revoked", ended_at: NOW(), ended_by: auth.userId })
    .eq("id", ovr.id);

  await logPlatformAdminAction({
    actorUserId: auth.userId,
    targetKind: "talent_profile",
    targetId: talentProfileId,
    action: "talent_plan_override_removed",
    before: { overridePlanKey: ovr.override_plan_key },
    after: { restoredPlanKey: restorePlanKey },
  });

  revalidatePath("/platform/admin/users");
  return { ok: true, data: { restoredPlanKey: restorePlanKey } };
}

// ─── D.1 — Billing snapshot server action ────────────────────────────────────

/**
 * Fetch the billing snapshot for a person. Gated on super_admin.
 */
export async function getPersonBillingSnapshot(opts: {
  userId: string | null;
  talentProfileId: string | null;
}): Promise<PersonBillingSnapshot | null> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return null;
  return loadPersonBillingSnapshot(opts);
}
