"use server";

// ============================================================================
// admin-taxonomy.ts — Settings → Roster taxonomy management actions
// ============================================================================
//
// Purpose
// ───────
// The Settings → Roster page lets a workspace admin choose WHICH talent
// types their roster supports, in what order, with what local labels,
// and which are allowed as primary vs. secondary picks on a talent.
//
// This module is the server-side wedge for that UI.
//
//   getEnabledTaxonomyTree(tenantId) → 3-layer tree:
//     parent_category (level 1)
//       └── talent_type (level 3, parent_id → parent_category)
//             └── specialty (level 4, parent_id → talent_type) [optional]
//     each node carries its agency_taxonomy_settings overlay (is_enabled,
//     allow_as_primary, allow_as_secondary, display_order, custom_label,
//     show_in_registration, show_in_directory, requires_approval).
//
//   setTaxonomyEnabled(...)        → flip on/off for one term × tenant.
//   setTaxonomyFlags(...)          → bulk update flags on one row.
//   addCustomSubType(...)          → tenant-local sub-type via
//                                    agency_taxonomy_terms (NOT a global
//                                    catalog mutation).
//   removeCustomSubType(...)       → archive a tenant-local sub-type.
//
//   getFieldsForTalent(profileId)  → resolved field set for a talent based
//                                    on their primary + secondary types,
//                                    walking parent_category inheritance.
//                                    Used by the Talent profile drawer to
//                                    render category-specific sections
//                                    (Models → physical, Music & DJ →
//                                    band/singer, Chefs → menu/etc.).
//
// All mutating actions:
//   - require staff role on the tenant (requireStaffTenantAction)
//   - revalidate the workspace's settings + roster paths
//   - return a structured { ok, ... } | { ok:false, error }
//
// Non-goals for this module:
//   - Editing the master taxonomy_terms catalog (platform-staff only,
//     handled in a separate platform-admin server action set).
//   - Dynamic field schema CRUD (the catalog lives in
//     profile_field_definitions + profile_field_recommendations and
//     is platform-curated; tenants get per-field overrides via
//     workspace_profile_field_settings — handled elsewhere).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

// ─── Types ───────────────────────────────────────────────────────────────────

export type TaxonomyNode = {
  id: string;
  slug: string;
  name_en: string;
  name_es: string | null;
  level: number;
  term_type: string;
  parent_id: string | null;
  is_active: boolean;
  /** Tenant overlay (null when no agency_taxonomy_settings row yet — treat
   *  as catalog default = enabled). */
  is_enabled: boolean;
  show_in_registration: boolean;
  show_in_directory: boolean;
  allow_as_primary: boolean;
  allow_as_secondary: boolean;
  requires_approval: boolean;
  display_order: number;
  custom_label: string | null;
  helper_text: string | null;
  /** True when this is a tenant-local sub-type (lives in
   *  agency_taxonomy_terms, not the global taxonomy_terms catalog). */
  is_custom: boolean;
  children: TaxonomyNode[];
};

export type GetTaxonomyTreeResult =
  | { ok: true; tree: TaxonomyNode[] }
  | { ok: false; error: string };

// ─── Read: enabled taxonomy tree ─────────────────────────────────────────────

export async function getEnabledTaxonomyTree(): Promise<GetTaxonomyTreeResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  // Taxonomy hierarchy:
  //   level 1 = parent_category   (19  — Models, Music & DJs, Chefs, …)
  //   level 2 = category_group    (75  — Fashion Models, Commercial Models, …)
  //   level 3 = talent_type       (425 — Editorial Model, House DJ, …)
  //
  // For the Settings UI, level 1 + level 2 are the right grain ("which
  // categories do you support, and which sub-types within each"). The
  // level 3 talent_type catalog is still consumed elsewhere (Add Talent
  // picker, registration form) via useLiveTaxonomy — too granular for
  // the agency-level toggle UI here.
  const { data: terms, error: termsErr } = await supabase
    .from("taxonomy_terms")
    .select(
      "id, slug, name_en, name_es, level, term_type, parent_id, is_active, sort_order",
    )
    .eq("is_active", true)
    .in("term_type", ["parent_category", "category_group"])
    .order("sort_order", { ascending: true });

  if (termsErr) {
    logServerError("getEnabledTaxonomyTree.terms", termsErr);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  const { data: settings, error: settingsErr } = await supabase
    .from("agency_taxonomy_settings")
    .select(
      "taxonomy_term_id, is_enabled, show_in_registration, show_in_directory, allow_as_primary, allow_as_secondary, requires_approval, display_order, custom_label, helper_text",
    )
    .eq("tenant_id", tenantId);

  if (settingsErr) {
    logServerError("getEnabledTaxonomyTree.settings", settingsErr);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  const settingsByTermId = new Map(
    (settings ?? []).map((s) => [s.taxonomy_term_id, s] as const),
  );

  // Tenant-local sub-types live in agency_taxonomy_terms — surface them
  // alongside the global catalog so the UI can render them as children
  // of their parent_category.
  // agency_taxonomy_terms columns: id, tenant_id, term_type, parent_term_id,
  // slug, name_en, name_es, description, is_active, sort_order. Custom
  // sub-types inherit primary/secondary allowance from their parent's
  // catalog default — they don't get a per-term overlay.
  const { data: customTerms, error: customErr } = await supabase
    .from("agency_taxonomy_terms")
    .select(
      "id, slug, name_en, name_es, parent_term_id, is_active, sort_order, description",
    )
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  if (customErr) {
    logServerError("getEnabledTaxonomyTree.custom", customErr);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  // Build node map.
  const nodes = new Map<string, TaxonomyNode>();
  for (const t of terms ?? []) {
    const overlay = settingsByTermId.get(t.id);
    nodes.set(t.id, {
      id: t.id,
      slug: t.slug,
      name_en: t.name_en,
      name_es: t.name_es,
      level: t.level,
      term_type: t.term_type,
      parent_id: t.parent_id,
      is_active: t.is_active,
      is_enabled: overlay?.is_enabled ?? true,
      show_in_registration: overlay?.show_in_registration ?? true,
      show_in_directory: overlay?.show_in_directory ?? true,
      allow_as_primary: overlay?.allow_as_primary ?? true,
      allow_as_secondary: overlay?.allow_as_secondary ?? true,
      requires_approval: overlay?.requires_approval ?? false,
      display_order: overlay?.display_order ?? t.sort_order ?? 100,
      custom_label: overlay?.custom_label ?? null,
      helper_text: overlay?.helper_text ?? null,
      is_custom: false,
      children: [],
    });
  }

  for (const c of customTerms ?? []) {
    nodes.set(c.id, {
      id: c.id,
      slug: c.slug,
      name_en: c.name_en,
      name_es: c.name_es,
      // Custom sub-types attach to a parent_category (level 1) so we tag
      // them as level 3 to slot them next to global talent_types.
      level: 3,
      term_type: "talent_type",
      parent_id: c.parent_term_id,
      is_active: c.is_active,
      is_enabled: true,
      show_in_registration: true,
      show_in_directory: true,
      allow_as_primary: true,
      allow_as_secondary: true,
      requires_approval: false,
      display_order: c.sort_order ?? 100,
      custom_label: null,
      helper_text: c.description ?? null,
      is_custom: true,
      children: [],
    });
  }

  // Wire children → parent.
  const roots: TaxonomyNode[] = [];
  for (const node of nodes.values()) {
    if (node.parent_id && nodes.has(node.parent_id)) {
      nodes.get(node.parent_id)!.children.push(node);
    } else if (node.level === 1) {
      roots.push(node);
    }
  }

  // Sort siblings by display_order (overlay) then sort_order (catalog).
  const sortRecursive = (list: TaxonomyNode[]) => {
    list.sort((a, b) => a.display_order - b.display_order);
    for (const n of list) sortRecursive(n.children);
  };
  sortRecursive(roots);

  return { ok: true, tree: roots };
}

// ─── Read: full detail for one parent_category ───────────────────────────────
//
// Lazy companion to getEnabledTaxonomyTree(). When the admin expands a
// parent in Settings → Roster, we fetch:
//   - the level-3 talent_types under each level-2 category_group
//   - the field catalog recommended for the parent_category itself,
//     plus universal/global fields (since every talent gets those)
//
// The point of this query is to answer the admin's question "what am I
// actually turning on or off when I toggle this category?" in one open-
// the-row click — no extra trips into separate drawers.

export type CategoryDetailNode = {
  id: string;
  slug: string;
  name_en: string;
  level: number;
  term_type: string;
  parent_id: string | null;
  is_active: boolean;
};

export type CategoryFieldEntry = {
  field_definition_id: string;
  field_key: string;
  label: string;
  tier: "universal" | "global" | "type-specific";
  section: string;
  kind: string;
  is_required: boolean;
  /** Where it came from — 'universal' | 'global' | the term name. */
  source: string;
};

export type CategoryDetail = {
  parent: CategoryDetailNode;
  /** Level-3 talent_types grouped under their level-2 category_group parent. */
  groups: Array<{
    group: CategoryDetailNode;
    talentTypes: CategoryDetailNode[];
  }>;
  /** Direct talent_types under the parent (rare — most go through groups). */
  directTalentTypes: CategoryDetailNode[];
  /** Universal + global + type-specific recommended for this parent. */
  fields: CategoryFieldEntry[];
};

export type GetCategoryDetailResult =
  | { ok: true; detail: CategoryDetail }
  | { ok: false; error: string };

export async function getCategoryDetail(input: {
  parent_id: string;
}): Promise<GetCategoryDetailResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  // 1. The parent itself.
  const { data: parent, error: parentErr } = await supabase
    .from("taxonomy_terms")
    .select("id, slug, name_en, level, term_type, parent_id, is_active")
    .eq("id", input.parent_id)
    .maybeSingle();

  if (parentErr || !parent) {
    return { ok: false, error: "Category not found." };
  }

  // 2. All descendants — category_groups (level 2) + talent_types (level 3)
  // whose parent chain leads back to this parent_category. Two queries
  // because Postgrest doesn't do recursive in select.
  const { data: groups } = await supabase
    .from("taxonomy_terms")
    .select("id, slug, name_en, level, term_type, parent_id, is_active")
    .eq("is_active", true)
    .eq("parent_id", input.parent_id);

  const groupIds = (groups ?? []).map((g) => g.id);
  let talentTypes: CategoryDetailNode[] = [];
  if (groupIds.length > 0) {
    const { data: tts } = await supabase
      .from("taxonomy_terms")
      .select("id, slug, name_en, level, term_type, parent_id, is_active")
      .eq("is_active", true)
      .eq("term_type", "talent_type")
      .in("parent_id", groupIds);
    talentTypes = (tts ?? []) as CategoryDetailNode[];
  }

  // Some parent_categories may have direct talent_type children (no
  // category_group between them).
  const { data: directTTs } = await supabase
    .from("taxonomy_terms")
    .select("id, slug, name_en, level, term_type, parent_id, is_active")
    .eq("is_active", true)
    .eq("term_type", "talent_type")
    .eq("parent_id", input.parent_id);

  // 3. Field catalog: universal + global (always) + type-specific
  // recommended for this parent OR any of its descendants.
  const allDescIds = [
    input.parent_id,
    ...groupIds,
    ...talentTypes.map((t) => t.id),
    ...((directTTs ?? []).map((t) => t.id)),
  ];

  const { data: defs } = await supabase
    .from("profile_field_definitions")
    .select(
      "id, field_key, label, tier, section, kind, is_optional, deprecated_at",
    )
    .is("deprecated_at", null);

  const { data: recs } = await supabase
    .from("profile_field_recommendations")
    .select(
      "field_definition_id, taxonomy_term_id, relationship",
    )
    .in("taxonomy_term_id", allDescIds);

  // Build a quick term-id → name map for source labelling.
  const termNameById = new Map<string, string>();
  termNameById.set(parent.id, parent.name_en);
  for (const g of groups ?? []) termNameById.set(g.id, g.name_en);
  for (const t of talentTypes) termNameById.set(t.id, t.name_en);
  for (const t of directTTs ?? []) termNameById.set(t.id, t.name_en);

  const recsByField = new Map<
    string,
    { relationship: string; term_id: string }
  >();
  for (const r of recs ?? []) {
    const existing = recsByField.get(r.field_definition_id);
    if (
      !existing ||
      r.relationship === "required" ||
      (r.relationship === "recommended" && existing.relationship === "applies")
    ) {
      recsByField.set(r.field_definition_id, {
        relationship: r.relationship,
        term_id: r.taxonomy_term_id,
      });
    }
  }

  const fields: CategoryFieldEntry[] = [];
  for (const d of defs ?? []) {
    let source = "";
    let isRequired = false;
    if (d.tier === "universal") {
      source = "universal";
      isRequired = !d.is_optional;
    } else if (d.tier === "global") {
      source = "global";
    } else {
      const r = recsByField.get(d.id);
      if (!r) continue;
      source = termNameById.get(r.term_id) ?? "type-specific";
      isRequired = r.relationship === "required";
    }
    fields.push({
      field_definition_id: d.id,
      field_key: d.field_key,
      label: d.label,
      tier: d.tier as "universal" | "global" | "type-specific",
      section: d.section,
      kind: d.kind,
      is_required: isRequired,
      source,
    });
  }

  // Group talent_types under their parent group.
  const groupNodes: Array<{ group: CategoryDetailNode; talentTypes: CategoryDetailNode[] }> =
    (groups ?? []).map((g) => ({
      group: g as CategoryDetailNode,
      talentTypes: talentTypes
        .filter((t) => t.parent_id === g.id)
        .sort((a, b) => a.name_en.localeCompare(b.name_en)),
    }));

  return {
    ok: true,
    detail: {
      parent: parent as CategoryDetailNode,
      groups: groupNodes,
      directTalentTypes: ((directTTs ?? []) as CategoryDetailNode[]).sort(
        (a, b) => a.name_en.localeCompare(b.name_en),
      ),
      fields: fields.sort((a, b) => {
        const tierRank = { universal: 0, global: 1, "type-specific": 2 } as const;
        if (tierRank[a.tier] !== tierRank[b.tier])
          return tierRank[a.tier] - tierRank[b.tier];
        if (a.section !== b.section) return a.section.localeCompare(b.section);
        return a.label.localeCompare(b.label);
      }),
    },
  };
}

// ─── Mutate: enable/disable a term for this tenant ───────────────────────────

const setEnabledSchema = z.object({
  taxonomy_term_id: z.string().uuid(),
  is_enabled: z.boolean(),
});

export async function setTaxonomyEnabled(input: {
  taxonomy_term_id: string;
  is_enabled: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = setEnabledSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }

  // Upsert a settings row. The PK is (tenant_id, taxonomy_term_id) per
  // 20260801... migration — relying on that for ON CONFLICT.
  const { error } = await supabase.from("agency_taxonomy_settings").upsert(
    {
      tenant_id: tenantId,
      taxonomy_term_id: parsed.data.taxonomy_term_id,
      is_enabled: parsed.data.is_enabled,
    },
    { onConflict: "tenant_id,taxonomy_term_id" },
  );

  if (error) {
    logServerError("setTaxonomyEnabled", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  revalidatePath("/[tenantSlug]/admin/settings", "layout");
  revalidatePath("/[tenantSlug]/admin/roster", "layout");
  return { ok: true };
}

// ─── Mutate: bulk-update flags for one term ──────────────────────────────────

const setFlagsSchema = z.object({
  taxonomy_term_id: z.string().uuid(),
  is_enabled: z.boolean().optional(),
  show_in_registration: z.boolean().optional(),
  show_in_directory: z.boolean().optional(),
  allow_as_primary: z.boolean().optional(),
  allow_as_secondary: z.boolean().optional(),
  requires_approval: z.boolean().optional(),
  display_order: z.number().int().min(0).max(9999).optional(),
  custom_label: z.string().max(120).nullable().optional(),
  helper_text: z.string().max(500).nullable().optional(),
});

export async function setTaxonomyFlags(
  input: z.infer<typeof setFlagsSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = setFlagsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const { taxonomy_term_id, ...flags } = parsed.data;

  const { error } = await supabase.from("agency_taxonomy_settings").upsert(
    { tenant_id: tenantId, taxonomy_term_id, ...flags },
    { onConflict: "tenant_id,taxonomy_term_id" },
  );

  if (error) {
    logServerError("setTaxonomyFlags", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  revalidatePath("/[tenantSlug]/admin/settings", "layout");
  revalidatePath("/[tenantSlug]/admin/roster", "layout");
  return { ok: true };
}

// ─── Mutate: add a tenant-local sub-type ─────────────────────────────────────

const addCustomSchema = z.object({
  parent_id: z.string().uuid(),
  name_en: z.string().min(2).max(80),
  name_es: z.string().max(80).nullable().optional(),
  helper_text: z.string().max(500).nullable().optional(),
});

export async function addCustomSubType(input: {
  parent_id: string;
  name_en: string;
  name_es?: string | null;
  helper_text?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = addCustomSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const v = parsed.data;

  // Slug strategy: deterministic from name + tenant short id, kept unique
  // per (tenant_id, parent_id) so two tenants can both have "Ambient DJs".
  const slug = v.name_en
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/(^-|-$)/gu, "")
    .slice(0, 60);

  const { data, error } = await supabase
    .from("agency_taxonomy_terms")
    .insert({
      tenant_id: tenantId,
      term_type: "talent_type",
      parent_term_id: v.parent_id,
      slug,
      name_en: v.name_en,
      name_es: v.name_es ?? null,
      description: v.helper_text ?? null,
      is_active: true,
    })
    .select("id")
    .single();

  if (error || !data) {
    logServerError("addCustomSubType", error);
    return {
      ok: false,
      error:
        error?.code === "23505"
          ? "A sub-type with this name already exists."
          : CLIENT_ERROR.generic,
    };
  }

  revalidatePath("/[tenantSlug]/admin/settings", "layout");
  return { ok: true, id: data.id };
}

const removeCustomSchema = z.object({
  id: z.string().uuid(),
});

export async function removeCustomSubType(input: {
  id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = removeCustomSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }

  // Soft archive (is_active = false) — preserves any talent_profile_taxonomy
  // rows referencing it for historical accuracy.
  const { error } = await supabase
    .from("agency_taxonomy_terms")
    .update({ is_active: false })
    .eq("id", parsed.data.id)
    .eq("tenant_id", tenantId);

  if (error) {
    logServerError("removeCustomSubType", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  revalidatePath("/[tenantSlug]/admin/settings", "layout");
  return { ok: true };
}

// ─── Read: dynamic field set for a talent ────────────────────────────────────
//
// Resolves the union of profile_field_definitions that apply to a talent
// based on their primary + secondary types and parent_category inheritance.
//
// Resolution order:
//   1. Universal-tier fields → always.
//   2. Global-tier fields → always.
//   3. Type-specific fields recommended for any of:
//        primary_term_id
//        primary_term parent_id (parent_category)
//        each secondary_term_id
//        each secondary parent_id
//   4. Apply workspace_profile_field_settings overlay (enabled/required
//      override, label override, visibility override) for this tenant.
//
// Returns ordered field rows with `relationship` + `is_required` resolved.

export type ResolvedField = {
  field_definition_id: string;
  field_key: string;
  label: string;
  tier: "universal" | "global" | "type-specific";
  section: string;
  subsection: string | null;
  kind: string;
  placeholder: string | null;
  is_required: boolean;
  is_recommended: boolean;
  display_order: number;
  /** Source term that brought this field in (NULL for universal/global). */
  source_term_id: string | null;
  /** Field group slug if this field belongs to one (e.g., 'physical-casting'). */
  field_group_slug: string | null;
  field_group_label: string | null;
  /** Phase 4 — five requirement-level booleans from recommendations. */
  required_at_registration: boolean;
  required_before_publish: boolean;
  required_before_verification: boolean;
  is_admin_only: boolean;
  requires_verification: boolean;
  /** Validation rules (JSONB schema). */
  validation_rules: Record<string, unknown> | null;
  /** Conditional visibility rule. */
  show_when: { field_key: string; operator: string; value: unknown } | null;
  /** Tells UI which group panel to render this field under. */
  brought_in_by:
    | { kind: "tier" }
    | { kind: "group"; group_slug: string; weight: string }
    | { kind: "recommendation"; term_id: string };
};

export type ResolvedFieldGroup = {
  group_slug: string;
  group_label_en: string;
  group_label_es: string | null;
  weight: "default" | "heavy" | "light" | "optional";
  display_order: number;
  in_registration_wizard: boolean;
  field_count: number;
};

export type GetFieldsForTalentResult =
  | { ok: true; fields: ResolvedField[] }
  | { ok: false; error: string };

export type GetFieldsForTalentEnrichedResult =
  | { ok: true; fields: ResolvedField[]; groups: ResolvedFieldGroup[] }
  | { ok: false; error: string };

export async function getFieldsForTalent(input: {
  talent_profile_id: string;
}): Promise<GetFieldsForTalentEnrichedResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  // 1. Verify talent is on this tenant's roster.
  const { data: rosterRow, error: rosterErr } = await supabase
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", input.talent_profile_id)
    .maybeSingle();

  if (rosterErr || !rosterRow) {
    return { ok: false, error: "Talent is not on this tenant's roster." };
  }

  // 2. Pull primary + secondaries.
  const { data: assigns, error: assignErr } = await supabase
    .from("talent_profile_taxonomy")
    .select("relationship_type, taxonomy_term_id")
    .eq("talent_profile_id", input.talent_profile_id);

  if (assignErr) {
    logServerError("getFieldsForTalent.assigns", assignErr);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  const termIds = (assigns ?? []).map((a) => a.taxonomy_term_id);

  // Walk parent chain. talent_type level 3 → category_group level 2 →
  // parent_category level 1. We need the parent_categories for group
  // resolution, plus all intermediate ids for recommendation matching.
  const allTermIds = new Set(termIds);
  const parentCategoryIds = new Set<string>();

  if (termIds.length > 0) {
    const { data: tParents } = await supabase
      .from("taxonomy_terms")
      .select("id, parent_id, term_type, level")
      .in("id", termIds);

    const grandparentIdsToFetch: string[] = [];
    for (const p of tParents ?? []) {
      if (p.parent_id) {
        allTermIds.add(p.parent_id);
        // If parent is itself a category_group (L2), we need to fetch its parent (the parent_category L1)
        if (p.term_type === "talent_type") {
          grandparentIdsToFetch.push(p.parent_id);
        } else if (p.term_type === "parent_category") {
          parentCategoryIds.add(p.id);
        }
      }
    }

    if (grandparentIdsToFetch.length > 0) {
      const { data: gp } = await supabase
        .from("taxonomy_terms")
        .select("id, parent_id, term_type")
        .in("id", grandparentIdsToFetch);
      for (const g of gp ?? []) {
        if (g.parent_id) {
          allTermIds.add(g.parent_id);
          parentCategoryIds.add(g.parent_id);
        } else if (g.term_type === "parent_category") {
          parentCategoryIds.add(g.id);
        }
      }
    }
  }

  // 3. Pull groups auto-loaded for these parent_categories.
  let parentGroupRows: Array<{
    parent_category_id: string;
    field_group_id: string;
    weight: string;
    display_order: number;
    in_registration_wizard: boolean;
  }> = [];
  if (parentCategoryIds.size > 0) {
    const { data, error: pgErr } = await supabase
      .from("parent_category_field_groups")
      .select(
        "parent_category_id, field_group_id, weight, display_order, in_registration_wizard",
      )
      .in("parent_category_id", Array.from(parentCategoryIds));
    if (pgErr) {
      logServerError("getFieldsForTalent.parent_groups", pgErr);
      return { ok: false, error: CLIENT_ERROR.generic };
    }
    parentGroupRows = data ?? [];
  }

  const activeGroupIds = new Set(parentGroupRows.map((g) => g.field_group_id));

  // 4. Pull all field group metadata.
  const { data: groupRows, error: groupErr } = await supabase
    .from("profile_field_groups")
    .select("id, slug, name_en, name_es, sort_order, is_active")
    .eq("is_active", true);

  if (groupErr) {
    logServerError("getFieldsForTalent.groups", groupErr);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  const groupById = new Map((groupRows ?? []).map((g) => [g.id, g] as const));

  // 5. Pull tenant group overrides.
  const { data: groupOverrides } = await supabase
    .from("workspace_field_group_settings")
    .select(
      "field_group_id, is_enabled, show_in_registration, show_in_profile_edit, show_in_public_profile, display_order, custom_label",
    )
    .eq("tenant_id", tenantId);

  const groupOverrideById = new Map(
    (groupOverrides ?? []).map((o) => [o.field_group_id, o] as const),
  );

  // Resolve which groups are actually active for this talent (after tenant
  // overrides). Build group meta for the response.
  const resolvedGroups: ResolvedFieldGroup[] = [];
  // Map field_group_id → metadata for field-attribution decisions.
  const groupMetaById = new Map<
    string,
    {
      slug: string;
      label: string;
      label_es: string | null;
      weight: string;
      display_order: number;
      in_wizard: boolean;
    }
  >();
  for (const pg of parentGroupRows) {
    const groupRow = groupById.get(pg.field_group_id);
    if (!groupRow) continue;
    const ov = groupOverrideById.get(pg.field_group_id);
    if (ov?.is_enabled === false) continue; // tenant disabled this group
    // Highest-weight wins if multiple parents recommend the same group.
    const existing = groupMetaById.get(pg.field_group_id);
    if (existing && weightRank(existing.weight) >= weightRank(pg.weight)) continue;
    groupMetaById.set(pg.field_group_id, {
      slug: groupRow.slug,
      label: ov?.custom_label ?? groupRow.name_en,
      label_es: groupRow.name_es,
      weight: pg.weight,
      display_order: ov?.display_order ?? pg.display_order,
      in_wizard: pg.in_registration_wizard,
    });
  }

  // 6. Pull definitions (active only).
  const { data: defs, error: defsErr } = await supabase
    .from("profile_field_definitions")
    .select(
      "id, field_key, label, tier, section, subsection, kind, placeholder, is_optional, display_order, field_group_id, validation_rules, show_when, deprecated_at",
    )
    .is("deprecated_at", null);

  if (defsErr) {
    logServerError("getFieldsForTalent.defs", defsErr);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  // 7. Pull recommendations for all relevant terms.
  let recs: Array<{
    field_definition_id: string;
    taxonomy_term_id: string;
    relationship: string;
    display_order: number;
    required_at_registration: boolean;
    required_before_publish: boolean;
    required_before_verification: boolean;
    is_admin_only: boolean;
    requires_verification: boolean;
  }> = [];
  if (allTermIds.size > 0) {
    const { data: recRows, error: recErr } = await supabase
      .from("profile_field_recommendations")
      .select(
        "field_definition_id, taxonomy_term_id, relationship, display_order, required_at_registration, required_before_publish, required_before_verification, is_admin_only, requires_verification",
      )
      .in("taxonomy_term_id", Array.from(allTermIds));
    if (recErr) {
      logServerError("getFieldsForTalent.recs", recErr);
      return { ok: false, error: CLIENT_ERROR.generic };
    }
    recs = recRows ?? [];
  }

  // 8. Tenant field-level overrides.
  const { data: overrides } = await supabase
    .from("workspace_profile_field_settings")
    .select(
      "field_definition_id, enabled_override, required_override, custom_label, display_order_override",
    )
    .eq("tenant_id", tenantId);

  const overrideByField = new Map(
    (overrides ?? []).map((o) => [o.field_definition_id, o] as const),
  );

  // Aggregate the strongest recommendation per field (across all matching terms).
  const recsByField = new Map<
    string,
    {
      relationship: string;
      display_order: number;
      term_id: string;
      required_at_registration: boolean;
      required_before_publish: boolean;
      required_before_verification: boolean;
      is_admin_only: boolean;
      requires_verification: boolean;
    }
  >();

  for (const r of recs) {
    const existing = recsByField.get(r.field_definition_id);
    const promote =
      !existing ||
      r.relationship === "required" ||
      (r.relationship === "recommended" && existing.relationship === "applies");

    if (!existing) {
      recsByField.set(r.field_definition_id, { ...r, term_id: r.taxonomy_term_id });
    } else if (promote) {
      recsByField.set(r.field_definition_id, { ...r, term_id: r.taxonomy_term_id });
    } else {
      // OR the boolean flags across all matching recs (if ANY says required, it's required).
      existing.required_at_registration ||= r.required_at_registration;
      existing.required_before_publish ||= r.required_before_publish;
      existing.required_before_verification ||= r.required_before_verification;
      existing.is_admin_only ||= r.is_admin_only;
      existing.requires_verification ||= r.requires_verification;
    }
  }

  // 9. Resolve fields.
  const resolved: ResolvedField[] = [];
  const groupFieldCount = new Map<string, number>();

  for (const d of defs ?? []) {
    const o = overrideByField.get(d.id);
    if (o?.enabled_override === false) continue;

    let include = false;
    let relationship: string = "applies";
    let display_order = d.display_order ?? 100;
    let source_term_id: string | null = null;
    let brought_in_by: ResolvedField["brought_in_by"] = { kind: "tier" };

    // C1 fix (2026-05-07): type-specific fields require a recommendation
    // matching one of the talent's terms. Group membership alone is NOT
    // sufficient to include a type-specific field — otherwise chef.cuisines
    // (in media-portfolio group) would leak onto every Influencer profile,
    // since media-portfolio is auto-loaded for nearly all parents.
    //
    // Universal/global fields always render. Type-specific MUST have a
    // direct recommendation. The field_group_id is for UI bucketing only.
    if (d.tier === "universal" || d.tier === "global") {
      include = true;
      brought_in_by = { kind: "tier" };
    } else {
      const r = recsByField.get(d.id);
      if (r) {
        include = true;
        relationship = r.relationship;
        display_order = r.display_order || d.display_order || 100;
        source_term_id = r.term_id;
        // Surface group attribution if available so the UI buckets correctly,
        // but the gate is always the recommendation match.
        if (d.field_group_id && groupMetaById.has(d.field_group_id)) {
          const meta = groupMetaById.get(d.field_group_id)!;
          brought_in_by = { kind: "group", group_slug: meta.slug, weight: meta.weight };
        } else {
          brought_in_by = { kind: "recommendation", term_id: r.term_id };
        }
      }
    }
    if (!include) continue;

    // Get full requirement-level flags from rec (if any).
    const r = recsByField.get(d.id);
    const required_at_registration = r?.required_at_registration ?? false;
    const required_before_publish = r?.required_before_publish ?? false;
    const required_before_verification = r?.required_before_verification ?? false;
    const is_admin_only = r?.is_admin_only ?? false;
    const requires_verification = r?.requires_verification ?? false;

    const catalogRequired =
      relationship === "required" ||
      required_before_publish ||
      (d.tier === "universal" && d.is_optional === false);

    // Group metadata (if any)
    const groupMeta = d.field_group_id ? groupMetaById.get(d.field_group_id) : null;

    resolved.push({
      field_definition_id: d.id,
      field_key: d.field_key,
      label: o?.custom_label ?? d.label,
      tier: d.tier as "universal" | "global" | "type-specific",
      section: d.section,
      subsection: d.subsection,
      kind: d.kind,
      placeholder: d.placeholder,
      is_required: o?.required_override ?? catalogRequired,
      is_recommended: relationship === "recommended",
      display_order: o?.display_order_override ?? display_order,
      source_term_id,
      field_group_slug: groupMeta?.slug ?? null,
      field_group_label: groupMeta?.label ?? null,
      required_at_registration,
      required_before_publish,
      required_before_verification,
      is_admin_only,
      requires_verification,
      validation_rules: (d.validation_rules as Record<string, unknown> | null) ?? null,
      show_when:
        (d.show_when as { field_key: string; operator: string; value: unknown } | null) ??
        null,
      brought_in_by,
    });

    if (groupMeta) {
      groupFieldCount.set(groupMeta.slug, (groupFieldCount.get(groupMeta.slug) ?? 0) + 1);
    }
  }

  // Sort by group display_order → display_order within group → label.
  resolved.sort((a, b) => {
    const aGroup = a.field_group_slug
      ? groupMetaById.get(
          [...groupMetaById.entries()].find(([_id, m]) => m.slug === a.field_group_slug)?.[0] ?? "",
        )
      : null;
    const bGroup = b.field_group_slug
      ? groupMetaById.get(
          [...groupMetaById.entries()].find(([_id, m]) => m.slug === b.field_group_slug)?.[0] ?? "",
        )
      : null;
    const aOrder = aGroup?.display_order ?? 0;
    const bOrder = bGroup?.display_order ?? 0;
    if (aOrder !== bOrder) return aOrder - bOrder;
    if (a.display_order !== b.display_order)
      return a.display_order - b.display_order;
    return a.label.localeCompare(b.label);
  });

  // Build the resolved groups list (sorted by display_order).
  for (const [groupId, meta] of groupMetaById) {
    void groupId;
    resolvedGroups.push({
      group_slug: meta.slug,
      group_label_en: meta.label,
      group_label_es: meta.label_es,
      weight: meta.weight as ResolvedFieldGroup["weight"],
      display_order: meta.display_order,
      in_registration_wizard: meta.in_wizard,
      field_count: groupFieldCount.get(meta.slug) ?? 0,
    });
  }
  resolvedGroups.sort((a, b) => a.display_order - b.display_order);

  return { ok: true, fields: resolved, groups: resolvedGroups };
}

function weightRank(w: string): number {
  switch (w) {
    case "heavy":
      return 4;
    case "default":
      return 3;
    case "light":
      return 2;
    case "optional":
      return 1;
    default:
      return 0;
  }
}
