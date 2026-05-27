"use server";

// Server actions for Settings -> Roster taxonomy controls.

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { CACHE_TAG_TAXONOMY } from "@/lib/cache-tags";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { logEngineAudit } from "./engine-audit";
import {
  resolveTalentFields,
  getResolverMetricsSnapshotSync,
} from "@/lib/field-engine/resolve-talent-fields";
import { isResolvedFieldVisibleInAdminEditor } from "@/lib/field-engine/resolved-field-surfaces";
import type {
  ResolvedField,
  ResolvedFieldGroup,
} from "@/lib/field-engine/resolve-talent-fields";
import { assertCanEnableTenantParentCategory } from "@/lib/taxonomy/tenant-taxonomy-plan-limits";

// Keep legacy type import paths working while the field engine owns the shapes.
// Use direct type re-export; Turbopack emitted runtime references for local re-export.
export type {
  ResolvedField,
  ResolvedFieldGroup,
} from "@/lib/field-engine/resolve-talent-fields";

/** Returns a snapshot of in-process resolver counters. Not durable — resets on
 *  process restart. For ops debug only. Async because this file is
 *  `"use server"`; the underlying sync getter lives in the field-engine
 *  resolver module. */
export async function getResolverMetricsSnapshot(): Promise<
  ReturnType<typeof getResolverMetricsSnapshotSync>
> {
  return getResolverMetricsSnapshotSync();
}

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
  /** Phase 2 (Sub-Task 1): tenant-scoped Spanish label override.
   *  Mirrors `custom_label` (EN). NULL = fall back to taxonomy_terms.name_es. */
  custom_label_es: string | null;
  helper_text: string | null;
  /** True when this is a tenant-local sub-type (lives in
   *  agency_taxonomy_terms, not the global taxonomy_terms catalog). */
  is_custom: boolean;
  children: TaxonomyNode[];
};

export type GetTaxonomyTreeResult =
  | { ok: true; tree: TaxonomyNode[] }
  | { ok: false; error: string };

function revalidateTenantTaxonomySurfaces(): void {
  revalidateTag(CACHE_TAG_TAXONOMY, "default");
  revalidatePath("/[tenantSlug]/admin/settings", "layout");
  revalidatePath("/[tenantSlug]/admin/roster", "layout");
}

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
  // For the Settings UI, level 1 + level 2 are the visible grain ("which
  // categories do you support, and which sub-types within each"). We also
  // include level 3 talent_type rows in the returned tree so downstream
  // pickers can respect tenant leaf-type overrides without another fetch.
  const { data: terms, error: termsErr } = await supabase
    .from("taxonomy_terms")
    .select(
      "id, slug, name_en, name_es, level, term_type, parent_id, is_active, sort_order",
    )
    .eq("is_active", true)
    .in("term_type", ["parent_category", "category_group", "talent_type"])
    .order("sort_order", { ascending: true });

  if (termsErr) {
    logServerError("getEnabledTaxonomyTree.terms", termsErr);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  const { data: settings, error: settingsErr } = await supabase
    .from("agency_taxonomy_settings")
    .select(
      // Phase 2 (Sub-Task 1): include custom_label_es alongside custom_label.
      "taxonomy_term_id, is_enabled, show_in_registration, show_in_directory, allow_as_primary, allow_as_secondary, requires_approval, display_order, custom_label, custom_label_es, helper_text",
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
      custom_label_es: overlay?.custom_label_es ?? null,
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
      custom_label_es: null,
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
  const { supabase, tenantId, user } = auth;

  const parsed = setEnabledSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }

  // Phase 7a audit — capture before-state for the audit log. Best-effort:
  // a missing row means "default" (null beforeValue), not an error.
  const { data: beforeRow } = await supabase
    .from("agency_taxonomy_settings")
    .select("is_enabled")
    .eq("tenant_id", tenantId)
    .eq("taxonomy_term_id", parsed.data.taxonomy_term_id)
    .maybeSingle();

  if (parsed.data.is_enabled && beforeRow?.is_enabled === false) {
    const planLimit = await assertCanEnableTenantParentCategory({
      supabase,
      tenantId,
      taxonomyTermId: parsed.data.taxonomy_term_id,
    });
    if (!planLimit.ok) return planLimit;
  }

  // Upsert a settings row. The PK is (tenant_id, taxonomy_term_id) per
  // 20260801... migration — relying on that for ON CONFLICT.
  //
  // Phase 2 (Sub-Task 1): `created_by_user_id` only on INSERT (when beforeRow
  // is absent), so subsequent flips don't rewrite the creator. The audit log
  // carries the per-edit actor history.
  const { error } = await supabase.from("agency_taxonomy_settings").upsert(
    beforeRow
      ? {
          tenant_id: tenantId,
          taxonomy_term_id: parsed.data.taxonomy_term_id,
          is_enabled: parsed.data.is_enabled,
        }
      : {
          tenant_id: tenantId,
          taxonomy_term_id: parsed.data.taxonomy_term_id,
          is_enabled: parsed.data.is_enabled,
          created_by_user_id: user.id,
        },
    { onConflict: "tenant_id,taxonomy_term_id" },
  );

  if (error) {
    logServerError("setTaxonomyEnabled", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  // Phase 7a — fire-and-forget audit. Helper swallows its own errors.
  await logEngineAudit({
    tenantId,
    actorUserId: user.id,
    actorRole: "agency_admin",
    surface: "taxonomy",
    subjectKind: "category",
    subjectId: parsed.data.taxonomy_term_id,
    subjectKey: null,
    operation: parsed.data.is_enabled ? "enable" : "disable",
    beforeValue: beforeRow ? { is_enabled: beforeRow.is_enabled } : null,
    afterValue: { is_enabled: parsed.data.is_enabled },
  });

  revalidateTenantTaxonomySurfaces();
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
  // Phase 2 (Sub-Task 1): Spanish label override. Same length cap as EN.
  custom_label_es: z.string().max(120).nullable().optional(),
  helper_text: z.string().max(500).nullable().optional(),
});

export async function setTaxonomyFlags(
  input: z.infer<typeof setFlagsSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, user } = auth;

  const parsed = setFlagsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }
  const { taxonomy_term_id, ...flags } = parsed.data;

  // Phase 7a audit — capture before-state. Missing row → null beforeValue
  // (i.e. all defaults). Same columns as the upsert below for symmetry.
  // Phase 2: include custom_label_es so the audit log captures EN+ES label
  // changes side by side.
  const { data: beforeRow } = await supabase
    .from("agency_taxonomy_settings")
    .select(
      "is_enabled, show_in_registration, show_in_directory, allow_as_primary, allow_as_secondary, requires_approval, display_order, custom_label, custom_label_es, helper_text",
    )
    .eq("tenant_id", tenantId)
    .eq("taxonomy_term_id", taxonomy_term_id)
    .maybeSingle();

  if (flags.is_enabled === true && beforeRow?.is_enabled === false) {
    const planLimit = await assertCanEnableTenantParentCategory({
      supabase,
      tenantId,
      taxonomyTermId: taxonomy_term_id,
    });
    if (!planLimit.ok) return planLimit;
  }

  // Phase 2 (Sub-Task 1): set created_by_user_id on first insert. The column
  // is nullable + only-on-insert (no UPDATE clause for it), so subsequent
  // edits leave the original creator intact — engine_audit_log carries the
  // per-edit actor history.
  const upsertPayload = beforeRow
    ? { tenant_id: tenantId, taxonomy_term_id, ...flags }
    : { tenant_id: tenantId, taxonomy_term_id, ...flags, created_by_user_id: user.id };

  const { error } = await supabase.from("agency_taxonomy_settings").upsert(
    upsertPayload,
    { onConflict: "tenant_id,taxonomy_term_id" },
  );

  if (error) {
    logServerError("setTaxonomyFlags", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  await logEngineAudit({
    tenantId,
    actorUserId: user.id,
    actorRole: "agency_admin",
    surface: "taxonomy",
    subjectKind: "category",
    subjectId: taxonomy_term_id,
    subjectKey: null,
    operation: "set",
    beforeValue: beforeRow ?? null,
    afterValue: flags,
  });

  revalidateTenantTaxonomySurfaces();
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
  const { supabase, tenantId, user } = auth;

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

  // Phase 7a — audit the create. beforeValue is null (new row);
  // afterValue captures what was inserted.
  await logEngineAudit({
    tenantId,
    actorUserId: user.id,
    actorRole: "agency_admin",
    surface: "taxonomy",
    subjectKind: "category",
    subjectId: data.id,
    subjectKey: slug,
    operation: "set",
    beforeValue: null,
    afterValue: {
      term_type: "talent_type",
      parent_term_id: v.parent_id,
      slug,
      name_en: v.name_en,
      name_es: v.name_es ?? null,
      description: v.helper_text ?? null,
      is_active: true,
    },
  });

  revalidateTenantTaxonomySurfaces();
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
  const { supabase, tenantId, user } = auth;

  const parsed = removeCustomSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
    };
  }

  // Phase 7a audit — capture slug + before state for the history rail.
  const { data: termRow } = await supabase
    .from("agency_taxonomy_terms")
    .select("slug, is_active")
    .eq("id", parsed.data.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

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

  await logEngineAudit({
    tenantId,
    actorUserId: user.id,
    actorRole: "agency_admin",
    surface: "taxonomy",
    subjectKind: "category",
    subjectId: parsed.data.id,
    subjectKey: termRow?.slug ?? null,
    operation: "disable",
    beforeValue: termRow ? { is_active: termRow.is_active } : null,
    afterValue: { is_active: false },
  });

  revalidateTenantTaxonomySurfaces();
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

export type GetFieldsForTalentResult =
  | { ok: true; fields: ResolvedField[] }
  | { ok: false; error: string };

export type GetFieldsForTalentEnrichedResult =
  | { ok: true; fields: ResolvedField[]; groups: ResolvedFieldGroup[] }
  | { ok: false; error: string };

/**
 * Resolve the field set for a talent on this tenant's roster. P5-δ
 * (2026-05-19) collapse: the resolver body now lives in the shared
 * `resolve-talent-fields` engine module — this wrapper keeps the
 * staff-tenant auth check at the boundary and delegates to the pure
 * core. The roster-membership check runs inside `resolveTalentFields`
 * itself (it's the same SQL either way), so the wrapper only carries
 * what the auth gate adds: tenant context + the "agency_admin" viewer
 * role. Talent self-edit takes the symmetric path via
 * `getFieldsForTalentAsTalent` in `talent-field-values-catalog.ts`.
 */
export async function getFieldsForTalent(input: {
  talent_profile_id: string;
}): Promise<GetFieldsForTalentEnrichedResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const resolved = await resolveTalentFields({
    supabase: auth.supabase,
    talentProfileId: input.talent_profile_id,
    tenantId: auth.tenantId,
    viewerRole: "agency_admin",
  });
  if (!resolved.ok) return resolved;
  return {
    ok: true,
    fields: resolved.fields.filter(isResolvedFieldVisibleInAdminEditor),
    groups: resolved.groups,
  };
}
