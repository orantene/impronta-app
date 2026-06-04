"use server";

/**
 * Platform Admin — commercial-terms override actions.
 *
 * CONFIGURATION LAYER ONLY. These actions store + read commercial booking-term
 * *settings* (deposit %, refund-policy preset, instant-book). They do NOT charge
 * a card, create a Stripe object, or run any refund — that is a later wave.
 *
 * Two write paths, both super_admin gated (mirrors commission-actions.ts auth):
 *   • updateTenantCommercialTermsAsPlatform — overwrites a workspace's
 *     agencies.settings.commercialTerms (merge-preserving other settings keys).
 *   • updatePlatformCommercialDefaults — writes the platform_settings singleton
 *     (the base-layer defaults the resolver falls back to). The raw write lives
 *     in the server-only lib so this action stays free of untenanted `.from(...)`.
 *
 * NO type/interface exports — a "use server" module may export only async
 * functions. Shapes are imported from @/lib/billing/commercial-terms-types.
 */

import { getCachedActorSession } from "@/lib/server/request-cache";
import { getPlatformRole } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type RefundPolicyKey,
  type TenantCommercialTerms,
  type PlatformCommercialDefaults,
} from "@/lib/billing/commercial-terms-types";
import {
  asRefundPolicyKey,
  asDepositPct,
} from "@/lib/billing/commercial-terms-parse";
import { writePlatformCommercialDefaults } from "@/lib/platform/commercial-defaults";

type TermsActionResult = { ok: true } | { ok: false; error: string };

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
  tenantId: string | null,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await sb.from("platform_audit_log").insert({
      actor_profile_id: actorId,
      actor_role: "super_admin",
      action,
      target_type: tenantId ? "agencies" : "platform_settings",
      target_id: tenantId,
      tenant_id: tenantId,
      severity: "warn",
      metadata,
    });
  } catch (err) {
    logServerError("platform.commercialTerms.audit", err);
  }
}

/** Validate + normalise an incoming tenant terms payload. */
function normaliseTenantTerms(
  raw: TenantCommercialTerms,
): { ok: true; value: TenantCommercialTerms } | { ok: false; error: string } {
  const depositPct =
    raw.depositPct === null || raw.depositPct === undefined
      ? null
      : asDepositPct(raw.depositPct);
  if (raw.depositPct != null && depositPct === null) {
    return { ok: false, error: "Deposit must be a number between 0 and 100." };
  }
  const refundPolicy =
    raw.refundPolicy === null || raw.refundPolicy === undefined
      ? null
      : asRefundPolicyKey(raw.refundPolicy);
  if (raw.refundPolicy != null && refundPolicy === null) {
    return { ok: false, error: "Unknown refund policy preset." };
  }
  return {
    ok: true,
    value: {
      depositPct,
      refundPolicy,
      instantBookEnabled: raw.instantBookEnabled === true,
    },
  };
}

export async function updateTenantCommercialTermsAsPlatform(
  tenantId: string,
  terms: TenantCommercialTerms,
): Promise<TermsActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const { sb, actorId } = auth;

  if (!tenantId) return { ok: false, error: "Missing workspace." };
  const norm = normaliseTenantTerms(terms);
  if (!norm.ok) return norm;

  const { data: agency, error: readErr } = await sb
    .from("agencies")
    .select("id, settings")
    .eq("id", tenantId)
    .maybeSingle();
  if (readErr) {
    logServerError("platform.commercialTerms.read", readErr);
    return { ok: false, error: "Could not load the workspace settings." };
  }
  if (!agency) return { ok: false, error: "Workspace not found." };

  const existing =
    agency.settings && typeof agency.settings === "object" && !Array.isArray(agency.settings)
      ? (agency.settings as Record<string, unknown>)
      : {};

  const nextSettings = { ...existing, commercialTerms: norm.value };

  const { error: updErr } = await sb
    .from("agencies")
    .update({ settings: nextSettings })
    .eq("id", tenantId);
  if (updErr) {
    logServerError("platform.commercialTerms.write", updErr);
    return { ok: false, error: "Could not save the commercial terms." };
  }

  await audit(sb, actorId, tenantId, "platform.commercialTerms.tenant.set", {
    deposit_pct: norm.value.depositPct,
    refund_policy: norm.value.refundPolicy,
    instant_book_enabled: norm.value.instantBookEnabled,
  });
  revalidatePath("/platform/admin/tenants");
  revalidatePath(`/platform/admin/tenants/${tenantId}`);
  return { ok: true };
}

export async function updatePlatformCommercialDefaults(
  defaults: PlatformCommercialDefaults,
): Promise<TermsActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const { sb, actorId } = auth;

  const depositPct = asDepositPct(defaults.defaultDepositPct);
  if (depositPct === null) {
    return { ok: false, error: "Default deposit must be a number between 0 and 100." };
  }
  const refundPolicy = asRefundPolicyKey(defaults.defaultRefundPolicy);
  if (refundPolicy === null) {
    return { ok: false, error: "Unknown refund policy preset." };
  }
  const value: {
    defaultDepositPct: number;
    defaultRefundPolicy: RefundPolicyKey;
    instantBookDefault: boolean;
  } = {
    defaultDepositPct: depositPct,
    defaultRefundPolicy: refundPolicy,
    instantBookDefault: defaults.instantBookDefault === true,
  };

  const result = await writePlatformCommercialDefaults(actorId, value);
  if (!result.ok) {
    return { ok: false, error: "Could not save the platform defaults." };
  }

  await audit(sb, actorId, null, "platform.commercialTerms.defaults.set", {
    default_deposit_pct: value.defaultDepositPct,
    default_refund_policy: value.defaultRefundPolicy,
    instant_book_default: value.instantBookDefault,
  });
  revalidatePath("/platform/admin/settings");
  revalidatePath("/platform/admin/tenants");
  return { ok: true };
}
