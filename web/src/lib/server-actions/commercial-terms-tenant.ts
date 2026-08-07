"use server";

// ============================================================================
// commercial-terms-tenant.ts — per-WORKSPACE commercial booking-terms config.
// ============================================================================
//
// Load + update of the tenant's default booking terms (default deposit %,
// refund-policy preset, instant-book enabled). Persisted per-tenant in
// agencies.settings.commercialTerms JSONB — no dedicated column, no migration.
//
// CONFIGURATION LAYER ONLY. These are *settings* a later money-flow wave will
// read. Nothing here charges a card, creates a Stripe object, or alters the
// offer/booking money math. The deposit % is a DEFAULT the offer can override.
//
// `agencies` is the tenant-root table (keyed by `id`, not `tenant_id`), so the
// tenant-scoped-query helper does not model it — every settings writer in the
// sibling admin-workspace-* modules accesses it the same way, gated by
// `requireWorkspaceStaffAction` and filtered by `.eq("id", tenantId)`.
//
// NOTE: a "use server" module may export ONLY async functions — the shared
// TenantCommercialTerms / RefundPolicyKey types live in the directive-free
// `@/lib/billing/commercial-terms-types` module and are imported here.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import type {
  RefundPolicyKey,
  TenantCommercialTerms,
} from "@/lib/billing/commercial-terms-types";

const REFUND_POLICY_KEYS = ["tiered", "flexible", "strict", "manual"] as const;

const tenantCommercialTermsSchema = z
  .object({
    // null = "use platform default". Whole-number percent, 0–100.
    depositPct: z.number().int().min(0).max(100).nullable(),
    refundPolicy: z.enum(REFUND_POLICY_KEYS).nullable(),
    instantBookEnabled: z.boolean(),
  })
  .strict();

const DEFAULT_TENANT_TERMS: TenantCommercialTerms = {
  depositPct: null,
  refundPolicy: null,
  instantBookEnabled: false,
};

/** Coerce an unknown JSONB blob into a safe TenantCommercialTerms, filling any
 *  missing / malformed field with the inherit-the-default value. */
function normalizeTenantCommercialTerms(raw: unknown): TenantCommercialTerms {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_TENANT_TERMS };
  const obj = raw as Record<string, unknown>;

  const depositRaw = obj.depositPct;
  const depositPct =
    typeof depositRaw === "number" &&
    Number.isFinite(depositRaw) &&
    depositRaw >= 0 &&
    depositRaw <= 100
      ? Math.round(depositRaw)
      : null;

  const policyRaw = obj.refundPolicy;
  const refundPolicy =
    typeof policyRaw === "string" &&
    (REFUND_POLICY_KEYS as readonly string[]).includes(policyRaw)
      ? (policyRaw as RefundPolicyKey)
      : null;

  return {
    depositPct,
    refundPolicy,
    instantBookEnabled: obj.instantBookEnabled === true,
  };
}

type LoadTenantCommercialTermsResult =
  | { ok: true; data: TenantCommercialTerms }
  | { ok: false; error: string };

/** Read the tenant's commercial-terms config from agencies.settings. */
export async function loadTenantCommercialTerms(): Promise<LoadTenantCommercialTermsResult> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const { data: agency, error } = await supabase
    .from("agencies")
    .select("settings")
    .eq("id", tenantId)
    .maybeSingle();

  if (error) {
    logServerError("commercial-terms-tenant.load", error);
    return { ok: false, error: "Could not load booking terms." };
  }

  const settings =
    typeof agency?.settings === "object" && agency.settings !== null
      ? (agency.settings as Record<string, unknown>)
      : {};

  return { ok: true, data: normalizeTenantCommercialTerms(settings.commercialTerms) };
}

type UpdateTenantCommercialTermsResult =
  | { ok: true; data: TenantCommercialTerms }
  | { ok: false; error: string };

/**
 * Merge the tenant's commercial-terms config into
 * `agencies.settings.commercialTerms` without clobbering sibling settings keys
 * (branding, watermark, rosterCardBadges, …). Scoped to the caller's own
 * tenant — the passed `tenantSlug` is reconciled against the authenticated
 * tenant; the DB filter always uses the auth-derived `tenantId`, never the
 * caller-supplied slug, so a mismatched slug cannot cross-write.
 */
export async function updateTenantCommercialTerms(
  tenantSlug: string,
  terms: TenantCommercialTerms,
): Promise<UpdateTenantCommercialTermsResult> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  // Reject a slug that doesn't match the authenticated tenant — the write is
  // always scoped to `tenantId`, so this is defense-in-depth against a stale
  // or spoofed slug from the client.
  if (typeof tenantSlug === "string" && tenantSlug && tenantSlug !== auth.tenantSlug) {
    return { ok: false, error: "You don't have permission to change this." };
  }

  const parsed = tenantCommercialTermsSchema.safeParse(terms);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid booking-terms payload.",
    };
  }

  // Read current settings so we merge the commercialTerms subset only.
  const { data: agency, error: readErr } = await supabase
    .from("agencies")
    .select("settings")
    .eq("id", tenantId)
    .single();
  if (readErr) {
    logServerError("commercial-terms-tenant.read", readErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  const currentSettings: Record<string, unknown> =
    typeof agency?.settings === "object" && agency.settings !== null
      ? (agency.settings as Record<string, unknown>)
      : {};

  const nextTerms: TenantCommercialTerms = {
    depositPct: parsed.data.depositPct,
    refundPolicy: parsed.data.refundPolicy,
    instantBookEnabled: parsed.data.instantBookEnabled,
  };

  const nextSettings = { ...currentSettings, commercialTerms: nextTerms };

  const { error: updateErr } = await supabase
    .from("agencies")
    .update({ settings: nextSettings, updated_at: new Date().toISOString() })
    .eq("id", tenantId);

  if (updateErr) {
    logServerError("commercial-terms-tenant.update", updateErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true, data: nextTerms };
}
