"use server";

// ============================================================================
// talent-field-values-catalog.ts — Talent-self version of the NEW catalog
// (talent_profile_field_values + profile_field_definitions) write paths.
// Parallels admin-talent-field-values.ts but uses `requireTalent` +
// ownership check + the `talent_editable` gate on the field definition.
//
// Lives in its own file (not appended to talent-field-values.ts) because
// the older file is reserved for legacy `field_values` writes and the
// project's formatter strips trailing additions during reformat passes.
// ============================================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTalent } from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { pgUuidSchema } from "@/lib/site-admin/validators";
import type { ResolvedField, ResolvedFieldGroup } from "./admin-taxonomy";

const setValueSchema = z.object({
  talent_profile_id: pgUuidSchema(),
  field_definition_id: pgUuidSchema(),
  value: z.unknown().optional(),
});

const setVisibilitySchema = z.object({
  talent_profile_id: pgUuidSchema(),
  field_definition_id: pgUuidSchema(),
  visibility: z.array(z.enum(["public", "agency", "private"])).max(3),
});

function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string" && v.trim() === "") return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

export async function setTalentFieldValueAsTalent(
  input: z.input<typeof setValueSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireTalent();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user } = auth;

  const parsed = setValueSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const v = parsed.data;

  const { data: owned } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("id", v.talent_profile_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!owned) return { ok: false, error: "Not authorized." };

  const { data: rosterRow } = await supabase
    .from("agency_talent_roster")
    .select("tenant_id")
    .eq("talent_profile_id", v.talent_profile_id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!rosterRow) return { ok: false, error: "Talent is not on any active roster." };

  const { data: def } = await supabase
    .from("profile_field_definitions")
    .select("id, kind, talent_editable, deprecated_at")
    .eq("id", v.field_definition_id)
    .maybeSingle();
  if (!def) return { ok: false, error: "Unknown field." };
  if (def.deprecated_at) return { ok: false, error: "Field no longer accepts input." };
  if (def.talent_editable === false) {
    return { ok: false, error: "This field can only be edited by the workspace admin." };
  }

  if (isEmptyValue(v.value)) {
    const { error } = await supabase
      .from("talent_profile_field_values")
      .delete()
      .eq("talent_profile_id", v.talent_profile_id)
      .eq("field_definition_id", v.field_definition_id);
    if (error) {
      logServerError("setTalentFieldValueAsTalent.delete", error);
      return { ok: false, error: CLIENT_ERROR.update };
    }
    revalidatePath("/talent", "layout");
    return { ok: true };
  }

  const { error } = await supabase
    .from("talent_profile_field_values")
    .upsert(
      {
        tenant_id: rosterRow.tenant_id,
        talent_profile_id: v.talent_profile_id,
        field_definition_id: v.field_definition_id,
        value: v.value,
        workflow_state: "live",
        last_edited_role: "talent",
        last_edited_by_user_id: user.id,
      },
      { onConflict: "talent_profile_id,field_definition_id" },
    );

  if (error) {
    logServerError("setTalentFieldValueAsTalent.upsert", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath("/talent", "layout");
  return { ok: true };
}

export async function setTalentFieldVisibilityAsTalent(
  input: z.input<typeof setVisibilitySchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireTalent();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user } = auth;

  const parsed = setVisibilitySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const v = parsed.data;

  const { data: owned } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("id", v.talent_profile_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!owned) return { ok: false, error: "Not authorized." };

  const visibilityToStore = v.visibility.length === 0 ? null : v.visibility;
  const { error } = await supabase
    .from("talent_profile_field_values")
    .update({ visibility_override: visibilityToStore })
    .eq("talent_profile_id", v.talent_profile_id)
    .eq("field_definition_id", v.field_definition_id);

  if (error) {
    logServerError("setTalentFieldVisibilityAsTalent", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  return { ok: true };
}

export async function getTalentFieldValuesAsTalent(input: {
  talent_profile_id: string;
}): Promise<
  | { ok: true; values: Array<{ field_definition_id: string; value: unknown; visibility_override: string[] | null; workflow_state: string; updated_at: string | null }> }
  | { ok: false; error: string }
> {
  const auth = await requireTalent();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user } = auth;

  const { data: owned } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("id", input.talent_profile_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!owned) return { ok: false, error: "Not authorized." };

  const { data, error } = await supabase
    .from("talent_profile_field_values")
    .select("field_definition_id, value, visibility_override, workflow_state, updated_at")
    .eq("talent_profile_id", input.talent_profile_id);
  if (error) {
    logServerError("getTalentFieldValuesAsTalent", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
  return { ok: true, values: (data ?? []) as never };
}

export async function getFieldsForTalentAsTalent(input: {
  talent_profile_id: string;
}): Promise<
  | { ok: true; fields: ResolvedField[]; groups: ResolvedFieldGroup[] }
  | { ok: false; error: string }
> {
  const auth = await requireTalent();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user } = auth;

  const { data: owned } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("id", input.talent_profile_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!owned) return { ok: false, error: "Not authorized." };

  // Simplified resolver — admin-side carries workspace overrides + weighted
  // groups + brought-in-by tracking; talent-self gets the same field set
  // but without workspace customization. This is intentional: the talent
  // doesn't need to see "this field was disabled by your agency" UX, just
  // the fields they CAN fill.
  const { data: assigns } = await supabase
    .from("talent_profile_taxonomy")
    .select("taxonomy_term_id")
    .eq("talent_profile_id", input.talent_profile_id);
  const termIds = (assigns ?? []).map((a) => a.taxonomy_term_id);

  const allTermIds = new Set<string>(termIds);
  if (termIds.length > 0) {
    const { data: tParents } = await supabase
      .from("taxonomy_terms")
      .select("id, parent_id, term_type")
      .in("id", termIds);
    const grandparentIds: string[] = [];
    for (const p of tParents ?? []) {
      if (p.parent_id) {
        allTermIds.add(p.parent_id);
        if (p.term_type === "talent_type") grandparentIds.push(p.parent_id);
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
  }

  const { data: defs } = await supabase
    .from("profile_field_definitions")
    .select(
      "id, field_key, label, label_es, tier, section, subsection, kind, placeholder, options, default_visibility, is_optional, display_order, field_group_id, validation_rules, show_when, deprecated_at",
    )
    .is("deprecated_at", null);

  let recs: Array<{
    field_definition_id: string;
    relationship: string;
    required_before_publish: boolean;
  }> = [];
  if (allTermIds.size > 0) {
    const { data: recRows } = await supabase
      .from("profile_field_recommendations")
      .select("field_definition_id, relationship, required_before_publish")
      .in("taxonomy_term_id", Array.from(allTermIds));
    recs = recRows ?? [];
  }
  const recsByField = new Map<string, { relationship: string; required_before_publish: boolean }>();
  for (const r of recs) {
    recsByField.set(r.field_definition_id, {
      relationship: r.relationship,
      required_before_publish: r.required_before_publish,
    });
  }

  const { data: groupRows } = await supabase
    .from("profile_field_groups")
    .select("id, slug, name_en, name_es, sort_order, is_active")
    .eq("is_active", true);

  const fields: ResolvedField[] = [];
  const groupFieldCount = new Map<string, number>();

  for (const d of defs ?? []) {
    let include = false;
    if (d.tier === "universal" || d.tier === "global") include = true;
    else if (recsByField.has(d.id)) include = true;
    if (!include) continue;

    const r = recsByField.get(d.id);
    const required = r?.required_before_publish ?? (d.tier === "universal" && d.is_optional === false);
    const group = d.field_group_id ? (groupRows ?? []).find((g) => g.id === d.field_group_id) ?? null : null;

    fields.push({
      field_definition_id: d.id,
      field_key: d.field_key,
      label: d.label,
      label_es: (d as { label_es?: string | null }).label_es ?? null,
      tier: d.tier as "universal" | "global" | "type-specific",
      section: d.section,
      subsection: d.subsection,
      kind: d.kind,
      placeholder: d.placeholder,
      options: Array.isArray(d.options) ? (d.options as string[]) : null,
      default_visibility: Array.isArray(d.default_visibility)
        ? (d.default_visibility as string[])
        : [],
      is_required: required,
      is_recommended: r?.relationship === "recommended",
      display_order: d.display_order ?? 100,
      source_term_id: null,
      field_group_slug: group?.slug ?? null,
      field_group_label: group?.name_en ?? null,
      required_at_registration: false,
      required_before_publish: required,
      required_before_verification: false,
      is_admin_only: false,
      requires_verification: false,
      validation_rules: (d.validation_rules as Record<string, unknown> | null) ?? null,
      show_when: null,
      brought_in_by: { kind: "tier" },
    });
    if (group) {
      groupFieldCount.set(group.slug, (groupFieldCount.get(group.slug) ?? 0) + 1);
    }
  }

  const groups: ResolvedFieldGroup[] = [];
  for (const [slug, count] of groupFieldCount.entries()) {
    const groupRow = (groupRows ?? []).find((g) => g.slug === slug);
    if (!groupRow) continue;
    groups.push({
      group_slug: groupRow.slug,
      group_label_en: groupRow.name_en,
      group_label_es: groupRow.name_es,
      weight: "default",
      display_order: groupRow.sort_order ?? 100,
      in_registration_wizard: false,
      field_count: count,
    });
  }

  return { ok: true, fields, groups };
}
