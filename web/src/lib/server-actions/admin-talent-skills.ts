"use server";

// ============================================================================
// admin-talent-skills.ts — Multi-skill talent management.
//
// Reads from talent_skills_resolved view (created by
// 20260907200000_multi_skill_talent_v1.sql).
//
// Caps enforced at DB layer via enforce_talent_skill_caps trigger:
//   - ≤9 total skills (primary + secondary)
//   - All primary_role rows share one parent_category
//   - secondary_role rows from ≤2 distinct parent_categories
//
// Server actions also do business validation (filter generic-fallback
// terms, check tenant ownership, etc.) before hitting the trigger.
// ============================================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import type {
  ProficiencyLevel,
  ResolvedSkill,
} from "./admin-talent-skills.types";

// Types/constants live in admin-talent-skills.types.ts because Next.js
// disallows non-async exports from "use server" files.

// ─── Read: get a talent's resolved skills ──────────────────────────────────

export async function getResolvedSkills(input: {
  talent_profile_id: string;
}): Promise<
  | { ok: true; skills: ResolvedSkill[] }
  | { ok: false; error: string }
> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  // Verify roster access.
  const { data: rosterRow } = await supabase
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", input.talent_profile_id)
    .maybeSingle();
  if (!rosterRow) {
    return { ok: false, error: "Talent is not on this tenant's roster." };
  }

  const { data, error } = await supabase
    .from("talent_skills_resolved")
    .select("*")
    .eq("talent_profile_id", input.talent_profile_id)
    .order("relationship_type", { ascending: true })
    .order("display_order", { ascending: true });

  if (error) {
    logServerError("getResolvedSkills", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  return { ok: true, skills: (data ?? []) as ResolvedSkill[] };
}

// ─── Add a skill (primary or secondary) ────────────────────────────────────

const addSkillSchema = z.object({
  talent_profile_id: z.string().uuid(),
  talent_type_term_id: z.string().uuid(),
  role: z.enum(["primary", "secondary"]),
  proficiency_level: z
    .enum(["beginner", "intermediate", "advanced", "expert", "master"])
    .optional(),
  years_experience: z.number().min(0).max(80).nullable().optional(),
});

export async function addSkill(
  input: z.input<typeof addSkillSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = addSkillSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const v = parsed.data;

  // Verify roster access.
  const { data: rosterRow } = await supabase
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", v.talent_profile_id)
    .maybeSingle();
  if (!rosterRow) {
    return { ok: false, error: "Talent is not on this tenant's roster." };
  }

  // Verify the term is a real talent_type (not a parent_category, context,
  // etc.) and not a generic-fallback.
  const { data: term } = await supabase
    .from("taxonomy_terms")
    .select("id, slug, term_type, level, is_active, is_generic_fallback")
    .eq("id", v.talent_type_term_id)
    .maybeSingle();
  if (!term) return { ok: false, error: "Skill not found." };
  if (term.term_type !== "talent_type") {
    return { ok: false, error: "Only talent_type terms can be added as skills." };
  }
  if (!term.is_active) {
    return { ok: false, error: "This skill is no longer available." };
  }
  if (term.is_generic_fallback) {
    return {
      ok: false,
      error: "Pick a specific role — generic fallback types can't be selected.",
    };
  }

  // Get next display_order (append to end of role group).
  const { data: existing } = await supabase
    .from("talent_profile_taxonomy")
    .select("display_order")
    .eq("talent_profile_id", v.talent_profile_id)
    .eq(
      "relationship_type",
      v.role === "primary" ? "primary_role" : "secondary_role",
    )
    .order("display_order", { ascending: false })
    .limit(1);
  const nextOrder = (existing?.[0]?.display_order ?? 0) + 10;

  // Insert. The DB trigger will reject if any cap is violated.
  const { error } = await supabase.from("talent_profile_taxonomy").insert({
    talent_profile_id: v.talent_profile_id,
    taxonomy_term_id: v.talent_type_term_id,
    relationship_type:
      v.role === "primary" ? "primary_role" : "secondary_role",
    proficiency_level: v.proficiency_level ?? null,
    years_experience: v.years_experience ?? null,
    display_order: nextOrder,
    tenant_id: tenantId,
    is_primary: v.role === "primary",
  });

  if (error) {
    // Bubble up the trigger error message verbatim — it's user-friendly.
    if (error.message?.includes("9 skills") || error.message?.includes("primary skills") || error.message?.includes("secondary categories")) {
      return { ok: false, error: error.message };
    }
    if (error.code === "23505") {
      return { ok: false, error: "This skill is already on the talent's profile." };
    }
    logServerError("addSkill", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  revalidatePath("/[tenantSlug]/admin/roster", "layout");
  return { ok: true };
}

// ─── Update proficiency / years on an existing skill ───────────────────────

const updateSkillSchema = z.object({
  talent_profile_id: z.string().uuid(),
  talent_type_term_id: z.string().uuid(),
  proficiency_level: z
    .enum(["beginner", "intermediate", "advanced", "expert", "master"])
    .nullable()
    .optional(),
  years_experience: z.number().min(0).max(80).nullable().optional(),
});

export async function updateSkill(
  input: z.input<typeof updateSkillSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = updateSkillSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const v = parsed.data;

  const { data: rosterRow } = await supabase
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", v.talent_profile_id)
    .maybeSingle();
  if (!rosterRow) {
    return { ok: false, error: "Talent is not on this tenant's roster." };
  }

  const updates: Record<string, unknown> = {};
  if (v.proficiency_level !== undefined) updates.proficiency_level = v.proficiency_level;
  if (v.years_experience !== undefined) updates.years_experience = v.years_experience;

  const { error } = await supabase
    .from("talent_profile_taxonomy")
    .update(updates)
    .eq("talent_profile_id", v.talent_profile_id)
    .eq("taxonomy_term_id", v.talent_type_term_id);

  if (error) {
    logServerError("updateSkill", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  revalidatePath("/[tenantSlug]/admin/roster", "layout");
  return { ok: true };
}

// ─── Remove a skill ────────────────────────────────────────────────────────

export async function removeSkill(input: {
  talent_profile_id: string;
  talent_type_term_id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const { data: rosterRow } = await supabase
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", input.talent_profile_id)
    .maybeSingle();
  if (!rosterRow) {
    return { ok: false, error: "Talent is not on this tenant's roster." };
  }

  const { error } = await supabase
    .from("talent_profile_taxonomy")
    .delete()
    .eq("talent_profile_id", input.talent_profile_id)
    .eq("taxonomy_term_id", input.talent_type_term_id)
    .in("relationship_type", ["primary_role", "secondary_role"]);

  if (error) {
    logServerError("removeSkill", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  revalidatePath("/[tenantSlug]/admin/roster", "layout");
  return { ok: true };
}

// ─── Verify a skill (admin/agency action) ──────────────────────────────────

const verifySkillSchema = z.object({
  talent_profile_id: z.string().uuid(),
  talent_type_term_id: z.string().uuid(),
  scope: z.enum(["agency", "platform"]).default("agency"),
  note: z.string().max(500).nullable().optional(),
});

export async function verifySkill(
  input: z.input<typeof verifySkillSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, user } = auth;

  const parsed = verifySkillSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const v = parsed.data;

  const { error } = await supabase
    .from("talent_profile_taxonomy")
    .update({
      verified_at: new Date().toISOString(),
      verified_by_user_id: user.id,
      verified_by_tenant_id: v.scope === "agency" ? tenantId : null,
      verification_note: v.note ?? null,
    })
    .eq("talent_profile_id", v.talent_profile_id)
    .eq("taxonomy_term_id", v.talent_type_term_id);

  if (error) {
    logServerError("verifySkill", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  // Phase 4.1: After successful skill verification, upsert an aggregate
  // "skills_verified" trust badge for this talent. Note count of currently-
  // verified skills in the badge note. Idempotent — uses upsert via a
  // best-effort SELECT then INSERT/UPDATE pattern. Failures here don't
  // block the skill verification itself (it's already saved).
  try {
    const { count: verifiedCount } = await supabase
      .from("talent_profile_taxonomy")
      .select("*", { count: "exact", head: true })
      .eq("talent_profile_id", v.talent_profile_id)
      .not("verified_at", "is", null)
      .or(`verified_by_tenant_id.eq.${tenantId},verified_by_tenant_id.is.null`);

    const { data: existingBadge } = await supabase
      .from("talent_profile_trust_badges")
      .select("id")
      .eq("talent_profile_id", v.talent_profile_id)
      .eq("badge_kind", "skills_verified")
      .eq("scope", v.scope === "agency" ? "agency" : "platform")
      .or(`scope_tenant_id.eq.${tenantId},scope_tenant_id.is.null`)
      .maybeSingle();

    const badgeNote = `${verifiedCount ?? 1} skill${(verifiedCount ?? 1) === 1 ? "" : "s"} verified`;

    if (existingBadge) {
      await supabase
        .from("talent_profile_trust_badges")
        .update({
          status: "verified",
          notes: badgeNote,
          verified_at: new Date().toISOString(),
          verified_by_user_id: user.id,
        })
        .eq("id", existingBadge.id);
    } else {
      await supabase.from("talent_profile_trust_badges").insert({
        talent_profile_id: v.talent_profile_id,
        badge_kind: "skills_verified",
        status: "verified",
        scope: v.scope === "agency" ? "agency" : "platform",
        scope_tenant_id: v.scope === "agency" ? tenantId : null,
        verified_at: new Date().toISOString(),
        verified_by_user_id: user.id,
        notes: badgeNote,
      });
    }
  } catch (badgeErr) {
    // Don't fail the skill-verify if the badge upsert breaks — log and continue.
    logServerError("verifySkill.badge", badgeErr);
  }

  revalidatePath("/[tenantSlug]/admin/roster", "layout");
  return { ok: true };
}

export async function unverifySkill(input: {
  talent_profile_id: string;
  talent_type_term_id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const { error } = await supabase
    .from("talent_profile_taxonomy")
    .update({
      verified_at: null,
      verified_by_user_id: null,
      verified_by_tenant_id: null,
      verification_note: null,
    })
    .eq("talent_profile_id", input.talent_profile_id)
    .eq("taxonomy_term_id", input.talent_type_term_id)
    .or(`verified_by_tenant_id.eq.${tenantId},verified_by_tenant_id.is.null`);

  if (error) {
    logServerError("unverifySkill", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  return { ok: true };
}

// ─── Reorder skills (drag-to-reorder; first row = featured skill) ──────────

const reorderSkillsSchema = z.object({
  talent_profile_id: z.string().uuid(),
  ordered_term_ids: z.array(z.string().uuid()).min(1),
});

export async function reorderSkills(
  input: z.input<typeof reorderSkillsSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = reorderSkillsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const v = parsed.data;

  const { data: rosterRow } = await supabase
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", v.talent_profile_id)
    .maybeSingle();
  if (!rosterRow) {
    return { ok: false, error: "Talent is not on this tenant's roster." };
  }

  for (let i = 0; i < v.ordered_term_ids.length; i++) {
    const { error } = await supabase
      .from("talent_profile_taxonomy")
      .update({ display_order: (i + 1) * 10 })
      .eq("talent_profile_id", v.talent_profile_id)
      .eq("taxonomy_term_id", v.ordered_term_ids[i]);
    if (error) {
      logServerError("reorderSkills", error);
      return { ok: false, error: CLIENT_ERROR.generic };
    }
  }

  revalidatePath("/[tenantSlug]/admin/roster", "layout");
  return { ok: true };
}

// ─── Set the talent's featured skill (for roster card display) ────────────
//
// Featured = lowest display_order. Sets the chosen skill to display_order=1,
// bumps all other skills to 10, 20, 30, … in their previous order. The roster
// card and search snippet read display_order ASC and pick the first.

const setFeaturedSchema = z.object({
  talent_profile_id: z.string().uuid(),
  talent_type_term_id: z.string().uuid(),
});

export async function setFeaturedSkill(
  input: z.input<typeof setFeaturedSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = setFeaturedSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const v = parsed.data;

  const { data: rosterRow } = await supabase
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", v.talent_profile_id)
    .maybeSingle();
  if (!rosterRow) {
    return { ok: false, error: "Talent is not on this tenant's roster." };
  }

  // Pull all role rows in current order to know how to renumber.
  const { data: rows } = await supabase
    .from("talent_profile_taxonomy")
    .select("taxonomy_term_id, display_order")
    .eq("talent_profile_id", v.talent_profile_id)
    .in("relationship_type", ["primary_role", "secondary_role"])
    .order("display_order", { ascending: true });

  if (!rows || rows.length === 0) {
    return { ok: false, error: "No skills to feature." };
  }

  // Featured first, then everyone else in their existing relative order.
  const featured = rows.find((r) => r.taxonomy_term_id === v.talent_type_term_id);
  if (!featured) {
    return { ok: false, error: "Skill not found on this talent." };
  }
  const others = rows.filter((r) => r.taxonomy_term_id !== v.talent_type_term_id);

  // Update featured → 1, others → 10, 20, 30, …
  const { error: errFeatured } = await supabase
    .from("talent_profile_taxonomy")
    .update({ display_order: 1 })
    .eq("talent_profile_id", v.talent_profile_id)
    .eq("taxonomy_term_id", v.talent_type_term_id);
  if (errFeatured) {
    logServerError("setFeaturedSkill.featured", errFeatured);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
  for (let i = 0; i < others.length; i++) {
    const { error } = await supabase
      .from("talent_profile_taxonomy")
      .update({ display_order: (i + 1) * 10 })
      .eq("talent_profile_id", v.talent_profile_id)
      .eq("taxonomy_term_id", others[i].taxonomy_term_id);
    if (error) {
      logServerError("setFeaturedSkill.bump", error);
      return { ok: false, error: CLIENT_ERROR.generic };
    }
  }

  revalidatePath("/[tenantSlug]/admin/roster", "layout");
  return { ok: true };
}

// ─── Get all enabled parent_categories for picker top-level ───────────────

export async function getEnabledParentCategoriesForPicker(): Promise<
  | {
      ok: true;
      parents: Array<{
        id: string;
        slug: string;
        name_en: string;
      }>;
    }
  | { ok: false; error: string }
> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  // Get all active parent_categories. Apply tenant overlay (is_enabled).
  const { data: terms } = await supabase
    .from("taxonomy_terms")
    .select("id, slug, name_en")
    .eq("term_type", "parent_category")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const { data: settings } = await supabase
    .from("agency_taxonomy_settings")
    .select("taxonomy_term_id, is_enabled")
    .eq("tenant_id", tenantId);

  const settingsByTermId = new Map(
    (settings ?? []).map((s) => [s.taxonomy_term_id, s] as const),
  );

  // Default: enabled when no overlay row exists.
  const filtered = (terms ?? []).filter((t) => {
    const overlay = settingsByTermId.get(t.id);
    return overlay?.is_enabled !== false;
  });

  return { ok: true, parents: filtered };
}

// ─── Per-tenant skill overrides (Phase 7.1) ────────────────────────────────

export type AgencySkillOverride = {
  id: string;
  taxonomy_term_id: string;
  is_visible_on_agency_site: boolean;
  is_featured_for_agency: boolean;
  display_order_override: number | null;
  custom_label: string | null;
  notes: string | null;
};

export async function getAgencySkillOverrides(input: {
  talent_profile_id: string;
}): Promise<
  | { ok: true; overrides: AgencySkillOverride[] }
  | { ok: false; error: string }
> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const { data, error } = await supabase
    .from("agency_talent_skill_overrides")
    .select(
      "id, taxonomy_term_id, is_visible_on_agency_site, is_featured_for_agency, display_order_override, custom_label, notes",
    )
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", input.talent_profile_id);

  if (error) {
    logServerError("getAgencySkillOverrides", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  return { ok: true, overrides: (data ?? []) as AgencySkillOverride[] };
}

const upsertOverrideSchema = z.object({
  talent_profile_id: z.string().uuid(),
  taxonomy_term_id: z.string().uuid(),
  is_visible_on_agency_site: z.boolean().optional(),
  is_featured_for_agency: z.boolean().optional(),
  display_order_override: z.number().int().min(0).max(9999).nullable().optional(),
  custom_label: z.string().max(120).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function upsertAgencySkillOverride(
  input: z.input<typeof upsertOverrideSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, user } = auth;

  const parsed = upsertOverrideSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const v = parsed.data;

  // If is_featured_for_agency is being set true, clear the flag from any
  // other override row for this (tenant, talent) — only one featured at a time.
  if (v.is_featured_for_agency) {
    await supabase
      .from("agency_talent_skill_overrides")
      .update({ is_featured_for_agency: false })
      .eq("tenant_id", tenantId)
      .eq("talent_profile_id", v.talent_profile_id)
      .neq("taxonomy_term_id", v.taxonomy_term_id);
  }

  const updates: Record<string, unknown> = {
    tenant_id: tenantId,
    talent_profile_id: v.talent_profile_id,
    taxonomy_term_id: v.taxonomy_term_id,
    created_by_user_id: user.id,
    updated_at: new Date().toISOString(),
  };
  if (v.is_visible_on_agency_site !== undefined)
    updates.is_visible_on_agency_site = v.is_visible_on_agency_site;
  if (v.is_featured_for_agency !== undefined)
    updates.is_featured_for_agency = v.is_featured_for_agency;
  if (v.display_order_override !== undefined)
    updates.display_order_override = v.display_order_override;
  if (v.custom_label !== undefined) updates.custom_label = v.custom_label;
  if (v.notes !== undefined) updates.notes = v.notes;

  const { error } = await supabase
    .from("agency_talent_skill_overrides")
    .upsert(updates, {
      onConflict: "tenant_id,talent_profile_id,taxonomy_term_id",
    });

  if (error) {
    logServerError("upsertAgencySkillOverride", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  revalidatePath("/[tenantSlug]/admin/roster", "layout");
  return { ok: true };
}

export async function clearAgencySkillOverride(input: {
  talent_profile_id: string;
  taxonomy_term_id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const { error } = await supabase
    .from("agency_talent_skill_overrides")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", input.talent_profile_id)
    .eq("taxonomy_term_id", input.taxonomy_term_id);

  if (error) {
    logServerError("clearAgencySkillOverride", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  return { ok: true };
}

// ─── Aspirations (Phase 1.2 / Q2 — career interests) ──────────────────────

const addAspirationSchema = z.object({
  talent_profile_id: z.string().uuid(),
  taxonomy_term_id: z.string().uuid(),
});

export async function addAspiration(
  input: z.input<typeof addAspirationSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = addAspirationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const v = parsed.data;

  const { error } = await supabase.from("talent_profile_taxonomy").insert({
    talent_profile_id: v.talent_profile_id,
    taxonomy_term_id: v.taxonomy_term_id,
    relationship_type: "aspiration",
    tenant_id: tenantId,
    is_primary: false,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Already on the talent's interests." };
    }
    logServerError("addAspiration", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  revalidatePath("/[tenantSlug]/admin/roster", "layout");
  return { ok: true };
}

export async function removeAspiration(input: {
  talent_profile_id: string;
  taxonomy_term_id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { error } = await supabase
    .from("talent_profile_taxonomy")
    .delete()
    .eq("talent_profile_id", input.talent_profile_id)
    .eq("taxonomy_term_id", input.taxonomy_term_id)
    .eq("relationship_type", "aspiration");

  if (error) {
    logServerError("removeAspiration", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  return { ok: true };
}

export async function getAspirations(input: {
  talent_profile_id: string;
}): Promise<
  | {
      ok: true;
      aspirations: Array<{ term_id: string; slug: string; name_en: string; parent_name: string | null }>;
    }
  | { ok: false; error: string }
> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { data, error } = await supabase
    .from("talent_profile_taxonomy")
    .select(
      `taxonomy_term_id,
       taxonomy_terms!inner ( slug, name_en, parent_id )`,
    )
    .eq("talent_profile_id", input.talent_profile_id)
    .eq("relationship_type", "aspiration");

  if (error) {
    logServerError("getAspirations", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  return {
    ok: true,
    aspirations: (data ?? []).map((row) => {
      const t = row.taxonomy_terms as unknown as {
        slug: string;
        name_en: string;
        parent_id: string | null;
      };
      return {
        term_id: row.taxonomy_term_id,
        slug: t.slug,
        name_en: t.name_en,
        parent_name: null, // Resolved in UI via parent_id if needed
      };
    }),
  };
}

// ─── Request a new taxonomy term ──────────────────────────────────────────
//
// "Don't see your skill?" path. Captures a user-submitted suggestion that
// platform staff can review later. Forms the input queue for catalog
// growth (talent_types added by demand, not just up-front spec).
//
// Future: trigger a notification to support / platform admin when a request
// lands. For now, just stores the row.

const requestTermSchema = z.object({
  parent_category_id: z.string().uuid().nullable().optional(),
  proposed_name: z.string().min(2).max(120),
  context_note: z.string().max(500).nullable().optional(),
  talent_profile_id: z.string().uuid().nullable().optional(),
  source: z
    .enum(["skill_picker", "registration", "inquiry_form", "admin_settings"])
    .default("skill_picker"),
});

export async function requestNewTaxonomyTerm(
  input: z.input<typeof requestTermSchema>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, user } = auth;

  const parsed = requestTermSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const v = parsed.data;

  // Lightweight de-dup: if this tenant already has a pending request for
  // the same name + parent in the last 30 days, surface the existing one
  // instead of double-logging.
  const { data: existing } = await supabase
    .from("taxonomy_term_requests")
    .select("id")
    .eq("requested_by_tenant_id", tenantId)
    .eq("proposed_name", v.proposed_name)
    .eq("status", "pending")
    .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .maybeSingle();

  if (existing) {
    return { ok: true, id: existing.id };
  }

  const { data, error } = await supabase
    .from("taxonomy_term_requests")
    .insert({
      requested_by_user_id: user.id,
      requested_by_tenant_id: tenantId,
      talent_profile_id: v.talent_profile_id ?? null,
      parent_category_id: v.parent_category_id ?? null,
      proposed_name: v.proposed_name,
      context_note: v.context_note ?? null,
      source: v.source,
    })
    .select("id")
    .single();

  if (error || !data) {
    logServerError("requestNewTaxonomyTerm", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  return { ok: true, id: data.id };
}

// ─── Get talent_types within a parent_category for the picker search ──────

export async function getTalentTypesUnderParent(input: {
  parent_category_id: string;
  query?: string;
}): Promise<
  | {
      ok: true;
      types: Array<{
        id: string;
        slug: string;
        name_en: string;
        name_es: string | null;
        category_group_name: string | null;
      }>;
    }
  | { ok: false; error: string }
> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  // Get all talent_type level-3 descendants of this parent_category, filter
  // out generic fallbacks. The taxonomy structure is:
  //   parent_category (L1) -> category_group (L2) -> talent_type (L3)
  const { data: groups } = await supabase
    .from("taxonomy_terms")
    .select("id, name_en")
    .eq("parent_id", input.parent_category_id)
    .eq("term_type", "category_group")
    .eq("is_active", true);

  const groupIds = (groups ?? []).map((g) => g.id);
  const groupNameById = new Map((groups ?? []).map((g) => [g.id, g.name_en] as const));

  if (groupIds.length === 0) {
    return { ok: true, types: [] };
  }

  // M7: alias-aware search. Match name_en (ILIKE), aliases array (any
  // element ILIKE), or search_synonyms array (any element ILIKE).
  //
  // Implementation: fetch all candidates by name_en first (the common path),
  // then if a query is provided, ALSO do a second fetch for terms whose
  // aliases/search_synonyms contain the query, and union the results
  // client-side. Two round-trips is fine at this scale; it avoids the
  // PostgREST array-literal escaping issues that broke the `or()` filter
  // for queries with spaces or special chars.
  const baseQuery = supabase
    .from("taxonomy_terms")
    .select("id, slug, name_en, name_es, parent_id")
    .in("parent_id", groupIds)
    .eq("term_type", "talent_type")
    .eq("is_active", true)
    .eq("is_generic_fallback", false)
    .order("name_en", { ascending: true });

  let primary: typeof baseQuery = baseQuery;
  if (input.query && input.query.length > 0) {
    primary = primary.ilike("name_en", `%${input.query}%`);
  }
  const { data: nameMatches, error } = await primary;
  if (error) {
    logServerError("getTalentTypesUnderParent.name", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  // Second pass: alias / synonym matches via a `cs` filter on each array.
  // Postgres array literal needs proper escaping — wrap the value in
  // double quotes to handle spaces ("wedding dj"). Backslashes and quotes
  // in user input are stripped to keep the literal valid.
  let aliasMatches: typeof nameMatches = [];
  if (input.query && input.query.length > 0) {
    const safe = input.query.replace(/[\\"]/g, "");
    const { data: aliasHits } = await supabase
      .from("taxonomy_terms")
      .select("id, slug, name_en, name_es, parent_id")
      .in("parent_id", groupIds)
      .eq("term_type", "talent_type")
      .eq("is_active", true)
      .eq("is_generic_fallback", false)
      .or(`aliases.cs.{"${safe}"},search_synonyms.cs.{"${safe}"}`);
    aliasMatches = aliasHits ?? [];
  }

  // Union (dedup by id), then sort by name_en for stable ordering.
  const seen = new Set<string>();
  const types: NonNullable<typeof nameMatches> = [];
  for (const row of [...(nameMatches ?? []), ...aliasMatches]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    types.push(row);
  }
  types.sort((a, b) => a.name_en.localeCompare(b.name_en));

  return {
    ok: true,
    types: types.map((t) => ({
      id: t.id,
      slug: t.slug,
      name_en: t.name_en,
      name_es: t.name_es,
      category_group_name: groupNameById.get(t.parent_id) ?? null,
    })),
  };
}
