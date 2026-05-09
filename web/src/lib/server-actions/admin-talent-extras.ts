"use server";

// ============================================================================
// admin-talent-extras.ts — V1 server actions for Phase 5 of the field
// architecture migration. Covers four new first-class concepts:
//
//   1. Trust badges          (talent_profile_trust_badges)
//   2. Permission requests   (talent_agency_permission_requests + grants)
//   3. External calendars    (talent_profile_external_calendars)
//   4. Agency media curation (agency_talent_media + media_assets ownership)
//
// All actions:
//   • Use requireStaffTenantAction for scope auth.
//   • Return structured Result types that the UI can render directly.
//   • Use existing CLIENT_ERROR + logServerError pattern.
//   • Validate inputs with zod.
// ============================================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { pgUuidSchema } from "@/lib/site-admin/validators";

// ─── Trust badges ───────────────────────────────────────────────────────────

const VALID_BADGE_KINDS = [
  "identity",
  "background_check",
  "license",
  "insurance",
  "social_account",
  "media_authentic",
  "agency_approved",
] as const;

export type TrustBadgeKind = (typeof VALID_BADGE_KINDS)[number];

export type TrustBadge = {
  id: string;
  badge_kind: TrustBadgeKind;
  status: "pending" | "verified" | "rejected" | "expired";
  scope: "platform" | "agency";
  scope_tenant_id: string | null;
  verified_at: string | null;
  expires_at: string | null;
  notes: string | null;
};

const createTrustBadgeSchema = z.object({
  talent_profile_id: pgUuidSchema(),
  badge_kind: z.enum(VALID_BADGE_KINDS),
  scope: z.enum(["platform", "agency"]).default("agency"),
  evidence_media_id: pgUuidSchema().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function createTrustBadge(
  input: z.input<typeof createTrustBadgeSchema>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = createTrustBadgeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const v = parsed.data;

  const { data, error } = await supabase
    .from("talent_profile_trust_badges")
    .insert({
      talent_profile_id: v.talent_profile_id,
      badge_kind: v.badge_kind,
      status: "pending",
      scope: v.scope,
      scope_tenant_id: v.scope === "agency" ? tenantId : null,
      evidence_media_id: v.evidence_media_id ?? null,
      notes: v.notes ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    logServerError("createTrustBadge", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  revalidatePath("/[tenantSlug]/admin/roster", "layout");
  return { ok: true, id: data.id };
}

const updateTrustBadgeSchema = z.object({
  badge_id: pgUuidSchema(),
  status: z.enum(["pending", "verified", "rejected", "expired"]),
  notes: z.string().max(500).nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
});

export async function updateTrustBadge(
  input: z.input<typeof updateTrustBadgeSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, user } = auth;

  const parsed = updateTrustBadgeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const v = parsed.data;

  const updates: Record<string, unknown> = {
    status: v.status,
    notes: v.notes ?? null,
    expires_at: v.expires_at ?? null,
  };
  if (v.status === "verified") {
    updates.verified_at = new Date().toISOString();
    updates.verified_by_user_id = user.id;
  }

  const { error } = await supabase
    .from("talent_profile_trust_badges")
    .update(updates)
    .eq("id", v.badge_id)
    .eq("scope_tenant_id", tenantId);

  if (error) {
    logServerError("updateTrustBadge", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  revalidatePath("/[tenantSlug]/admin/roster", "layout");
  return { ok: true };
}

export async function getTrustBadges(input: {
  talent_profile_id: string;
}): Promise<{ ok: true; badges: TrustBadge[] } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const { data, error } = await supabase
    .from("talent_profile_trust_badges")
    .select(
      "id, badge_kind, status, scope, scope_tenant_id, verified_at, expires_at, notes",
    )
    .eq("talent_profile_id", input.talent_profile_id)
    .or(`scope.eq.platform,scope_tenant_id.eq.${tenantId}`);

  if (error) {
    logServerError("getTrustBadges", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  return { ok: true, badges: (data ?? []) as TrustBadge[] };
}

// ─── Permission requests (OAuth-style consent) ──────────────────────────────

const VALID_DATA_SCOPES = [
  "identity",
  "media",
  "rates",
  "service_areas",
  "availability",
  "documents",
  "physical",
  "experience",
] as const;

export type DataScope = (typeof VALID_DATA_SCOPES)[number];

const createPermissionRequestSchema = z.object({
  talent_profile_id: pgUuidSchema(),
  requested_scopes: z.array(z.enum(VALID_DATA_SCOPES)).min(1).max(8),
  request_message: z.string().max(2000).nullable().optional(),
});

export async function createPermissionRequest(
  input: z.input<typeof createPermissionRequestSchema>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = createPermissionRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const v = parsed.data;

  // Don't allow duplicate pending requests for same (talent, tenant) pair.
  const { data: existing } = await supabase
    .from("talent_agency_permission_requests")
    .select("id")
    .eq("talent_profile_id", v.talent_profile_id)
    .eq("requesting_tenant_id", tenantId)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    return {
      ok: false,
      error: "A permission request for this talent is already pending.",
    };
  }

  const { data, error } = await supabase
    .from("talent_agency_permission_requests")
    .insert({
      talent_profile_id: v.talent_profile_id,
      requesting_tenant_id: tenantId,
      requested_scopes: v.requested_scopes,
      request_message: v.request_message ?? null,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) {
    logServerError("createPermissionRequest", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  return { ok: true, id: data.id };
}

const respondToPermissionRequestSchema = z.object({
  request_id: pgUuidSchema(),
  decision: z.enum(["approved", "denied"]),
  approved_scopes: z.array(z.enum(VALID_DATA_SCOPES)).optional(),
});

export async function respondToPermissionRequest(
  input: z.input<typeof respondToPermissionRequestSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user } = auth;

  const parsed = respondToPermissionRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const v = parsed.data;

  // Pull request to validate + use its values.
  const { data: req, error: reqErr } = await supabase
    .from("talent_agency_permission_requests")
    .select(
      "id, talent_profile_id, requesting_tenant_id, requested_scopes, status",
    )
    .eq("id", v.request_id)
    .maybeSingle();

  if (reqErr || !req) {
    return { ok: false, error: "Permission request not found." };
  }
  if (req.status !== "pending") {
    return { ok: false, error: "This request was already responded to." };
  }

  const approvedScopes =
    v.decision === "approved"
      ? (v.approved_scopes ?? req.requested_scopes)
      : null;

  const { error: updErr } = await supabase
    .from("talent_agency_permission_requests")
    .update({
      status: v.decision,
      responded_at: new Date().toISOString(),
      approved_scopes: approvedScopes,
      responded_by_user_id: user.id,
    })
    .eq("id", v.request_id);

  if (updErr) {
    logServerError("respondToPermissionRequest", updErr);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  // On approval, create or update the data grant.
  if (v.decision === "approved" && approvedScopes && approvedScopes.length > 0) {
    const { error: grantErr } = await supabase
      .from("talent_agency_data_grants")
      .upsert(
        {
          talent_profile_id: req.talent_profile_id,
          tenant_id: req.requesting_tenant_id,
          granted_scopes: approvedScopes,
          source_request_id: req.id,
          granted_by_user_id: user.id,
          revoked_at: null,
        },
        { onConflict: "talent_profile_id,tenant_id" },
      );

    if (grantErr) {
      logServerError("respondToPermissionRequest.grant", grantErr);
      return { ok: false, error: CLIENT_ERROR.generic };
    }
  }

  return { ok: true };
}

export async function revokeDataGrant(input: {
  grant_id: string;
  reason?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { error } = await supabase
    .from("talent_agency_data_grants")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", input.grant_id);

  if (error) {
    logServerError("revokeDataGrant", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  return { ok: true };
}

// ─── External calendars ─────────────────────────────────────────────────────

const addCalendarSchema = z.object({
  talent_profile_id: pgUuidSchema(),
  kind: z.enum(["calendly", "google", "ical", "cal_com", "manual"]),
  external_url: z.string().url().nullable().optional(),
  is_primary: z.boolean().default(false),
});

export async function addExternalCalendar(
  input: z.input<typeof addCalendarSchema>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const parsed = addCalendarSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const v = parsed.data;

  // If marking primary, unset any existing primary.
  if (v.is_primary) {
    await supabase
      .from("talent_profile_external_calendars")
      .update({ is_primary: false })
      .eq("talent_profile_id", v.talent_profile_id);
  }

  const { data, error } = await supabase
    .from("talent_profile_external_calendars")
    .insert({
      talent_profile_id: v.talent_profile_id,
      kind: v.kind,
      external_url: v.external_url ?? null,
      is_primary: v.is_primary,
    })
    .select("id")
    .single();

  if (error || !data) {
    logServerError("addExternalCalendar", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  return { ok: true, id: data.id };
}

export async function removeExternalCalendar(input: {
  calendar_id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { error } = await supabase
    .from("talent_profile_external_calendars")
    .delete()
    .eq("id", input.calendar_id);

  if (error) {
    logServerError("removeExternalCalendar", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  return { ok: true };
}

// ─── Agency media curation ──────────────────────────────────────────────────

export type AgencyMediaRow = {
  id: string;
  agency_media_id: string;
  master_media_id: string | null;
  display_order: number;
  caption: string | null;
  is_visible_on_agency_site: boolean;
};

export async function getAgencyMediaForTenant(input: {
  talent_profile_id: string;
}): Promise<
  | { ok: true; rows: AgencyMediaRow[] }
  | { ok: false; error: string }
> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const { data, error } = await supabase
    .from("agency_talent_media")
    .select(
      "id, agency_media_id, master_media_id, display_order, caption, is_visible_on_agency_site",
    )
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", input.talent_profile_id)
    .order("display_order", { ascending: true });

  if (error) {
    logServerError("getAgencyMediaForTenant", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  return { ok: true, rows: (data ?? []) as AgencyMediaRow[] };
}

const addAgencyMediaSchema = z.object({
  talent_profile_id: pgUuidSchema(),
  agency_media_id: pgUuidSchema(),
  master_media_id: pgUuidSchema().nullable().optional(),
  caption: z.string().max(500).nullable().optional(),
  display_order: z.number().int().min(0).max(9999).default(100),
});

export async function addAgencyMedia(
  input: z.input<typeof addAgencyMediaSchema>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, user } = auth;

  const parsed = addAgencyMediaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const v = parsed.data;

  const { data, error } = await supabase
    .from("agency_talent_media")
    .insert({
      tenant_id: tenantId,
      talent_profile_id: v.talent_profile_id,
      agency_media_id: v.agency_media_id,
      master_media_id: v.master_media_id ?? null,
      caption: v.caption ?? null,
      display_order: v.display_order,
      created_by_user_id: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    logServerError("addAgencyMedia", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  revalidatePath("/[tenantSlug]/admin/roster", "layout");
  return { ok: true, id: data.id };
}

export async function removeAgencyMedia(input: {
  agency_talent_media_id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const { error } = await supabase
    .from("agency_talent_media")
    .delete()
    .eq("id", input.agency_talent_media_id)
    .eq("tenant_id", tenantId);

  if (error) {
    logServerError("removeAgencyMedia", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  revalidatePath("/[tenantSlug]/admin/roster", "layout");
  return { ok: true };
}

const reorderAgencyMediaSchema = z.object({
  talent_profile_id: pgUuidSchema(),
  ordered_ids: z.array(pgUuidSchema()).min(1),
});

export async function reorderAgencyMedia(
  input: z.input<typeof reorderAgencyMediaSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = reorderAgencyMediaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const v = parsed.data;

  // Update each row's display_order (10, 20, 30, …).
  for (let i = 0; i < v.ordered_ids.length; i++) {
    const { error } = await supabase
      .from("agency_talent_media")
      .update({ display_order: (i + 1) * 10 })
      .eq("id", v.ordered_ids[i])
      .eq("tenant_id", tenantId)
      .eq("talent_profile_id", v.talent_profile_id);
    if (error) {
      logServerError("reorderAgencyMedia", error);
      return { ok: false, error: CLIENT_ERROR.generic };
    }
  }

  revalidatePath("/[tenantSlug]/admin/roster", "layout");
  return { ok: true };
}

// ─── Profile completeness compute ──────────────────────────────────────────

/**
 * Computes a 0-100 percent completeness score based on:
 *   - Required-before-publish field fill rate weighted by completeness_weight
 *     of the parent_category_field_groups mapping.
 *
 * Stores result in talent_profiles.profile_completeness_pct.
 *
 * V1 simple version: ratio of filled required-before-publish fields / total
 * required-before-publish fields (binary, no weighting). Refines later.
 */
export async function computeProfileCompleteness(input: {
  talent_profile_id: string;
}): Promise<{ ok: true; pct: number } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  // 1. Get all fields resolved for this talent (use the resolver indirectly
  //    via direct DB query for performance).
  const { data: assigns } = await supabase
    .from("talent_profile_taxonomy")
    .select("taxonomy_term_id")
    .eq("talent_profile_id", input.talent_profile_id);
  const termIds = (assigns ?? []).map((a) => a.taxonomy_term_id);

  if (termIds.length === 0) {
    await supabase
      .from("talent_profiles")
      .update({ profile_completeness_pct: 0 })
      .eq("id", input.talent_profile_id);
    return { ok: true, pct: 0 };
  }

  // Walk parents
  const allTermIds = new Set(termIds);
  const { data: tParents } = await supabase
    .from("taxonomy_terms")
    .select("id, parent_id")
    .in("id", termIds);
  const grandparentIds: string[] = [];
  for (const p of tParents ?? []) {
    if (p.parent_id) {
      allTermIds.add(p.parent_id);
      grandparentIds.push(p.parent_id);
    }
  }
  if (grandparentIds.length > 0) {
    const { data: gp } = await supabase
      .from("taxonomy_terms")
      .select("id, parent_id")
      .in("id", grandparentIds);
    for (const g of gp ?? []) {
      if (g.parent_id) allTermIds.add(g.parent_id);
    }
  }

  // 2. Get required-before-publish field count for these terms.
  const { data: requiredFields } = await supabase
    .from("profile_field_recommendations")
    .select("field_definition_id")
    .in("taxonomy_term_id", Array.from(allTermIds))
    .eq("required_before_publish", true);

  const requiredFieldIds = Array.from(
    new Set((requiredFields ?? []).map((r) => r.field_definition_id)),
  );

  if (requiredFieldIds.length === 0) {
    // No required fields — talent is "publishable" by default.
    await supabase
      .from("talent_profiles")
      .update({ profile_completeness_pct: 100 })
      .eq("id", input.talent_profile_id);
    return { ok: true, pct: 100 };
  }

  // 3. Get filled values count.
  const { data: values } = await supabase
    .from("talent_profile_field_values")
    .select("field_definition_id")
    .eq("talent_profile_id", input.talent_profile_id)
    .in("field_definition_id", requiredFieldIds);

  const filledCount = values?.length ?? 0;
  const pct = Math.round((filledCount / requiredFieldIds.length) * 100);

  await supabase
    .from("talent_profiles")
    .update({ profile_completeness_pct: pct })
    .eq("id", input.talent_profile_id);

  return { ok: true, pct };
}

// ─── Touch last_active_at (called from chrome on activity) ─────────────────

export async function touchTalentLastActive(input: {
  talent_profile_id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { error } = await supabase
    .from("talent_profiles")
    .update({ last_active_at: new Date().toISOString() })
    .eq("id", input.talent_profile_id);

  if (error) {
    logServerError("touchTalentLastActive", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  return { ok: true };
}
