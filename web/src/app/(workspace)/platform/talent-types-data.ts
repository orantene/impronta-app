/* eslint-disable max-lines -- cohesive taxonomy data-loader module (flat talent-type loaders + 3-level hierarchy loaders); a split is a clean follow-up. */
// Platform Talent Types + taxonomy-tree data loaders. Loads talent_type terms
// + the 3-level parent_category→category_group→talent_type hierarchy with
// analytics (agency_talent_roster + talent_profile_taxonomy joins). Service-role
// only — never import from client components. Degrades to empty on any failure.
import { unstable_cache } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { fetchAllTaxonomyTerms } from "@/lib/supabase/paged";
import { CACHE_TAG_TAXONOMY } from "@/lib/cache-tags";
import { CACHE_TAG_FIELD_CATALOG } from "@/lib/field-engine/cache-tags";
import { byLabel } from "@/lib/field-engine/sort-comparators";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TalentTypeRow = {
  id: string;
  slug: string;
  name_en: string;
  name_es: string | null;
  plural_name: string | null;
  description: string | null;
  icon: string | null;
  level: number;
  sort_order: number;
  is_active: boolean;
  archived_at: string | null;
  mappedFieldCount: number;
  agencyCount: number;
  talentCount: number;
};

export type TalentTypeRecommendation = {
  id: string;
  field_definition_id: string;
  field_key: string;
  field_label: string;
  field_label_es: string | null;
  field_tier: string;
  relationship: string;
  display_order: number;
  required_at_registration: boolean;
  required_before_publish: boolean;
  required_before_verification: boolean;
  requires_verification: boolean;
  is_admin_only: boolean;
};

export type TalentTypeDetail = {
  id: string;
  slug: string;
  name_en: string;
  name_es: string | null;
  plural_name: string | null;
  description: string | null;
  icon: string | null;
  level: number;
  sort_order: number;
  is_active: boolean;
  archived_at: string | null;
  is_public_filter: boolean;
  is_profile_badge: boolean;
  is_visible_by_default: boolean;
  is_restricted: boolean;
};

export type TalentTypeDetailResult =
  | {
      ok: true;
      term: TalentTypeDetail;
      recommendations: TalentTypeRecommendation[];
      /** All non-deprecated field definitions for the field mapping panel. */
      fieldOptions: Array<{
        id: string;
        field_key: string;
        label: string;
        tier: string;
        section: string | null;
        deprecated_at: string | null;
      }>;
      agencyCount: number;
      talentCount: number;
      mappedFieldCount: number;
      requiredMappingCount: number;
    }
  | { ok: false; notFound?: boolean };

export type LoadPlatformTalentTypesResult = {
  ok: boolean;
  types: TalentTypeRow[];
};

// ---------------------------------------------------------------------------
// List loader
// ---------------------------------------------------------------------------

const EMPTY_LIST: LoadPlatformTalentTypesResult = { ok: false, types: [] };

export async function loadPlatformTalentTypes(): Promise<LoadPlatformTalentTypesResult> {
  return unstable_cache(
    () => loadPlatformTalentTypesUncached(),
    ["platform:talent-types-list", "v1"],
    {
      tags: [CACHE_TAG_TAXONOMY, CACHE_TAG_FIELD_CATALOG],
      revalidate: 60,
    },
  )();
}

async function loadPlatformTalentTypesUncached(): Promise<LoadPlatformTalentTypesResult> {
  const sb = createServiceRoleClient();
  if (!sb) return EMPTY_LIST;

  try {
    const [termsR, recsR, assignmentsR, rosterR] = await Promise.all([
      sb
        .from("taxonomy_terms")
        // name_en/name_es folded into name_i18n {en,es} (WS4); flattened below.
        .select(
          "id, slug, name_i18n, plural_name, description, icon, level, sort_order, is_active, archived_at",
        )
        .eq("term_type", "talent_type")
        .order("sort_order", { ascending: true })
        .order("name_i18n->>en", { ascending: true }),
      sb
        .from("profile_field_recommendations")
        .select("taxonomy_term_id"),
      sb
        .from("talent_profile_taxonomy")
        .select("taxonomy_term_id, talent_profile_id"),
      sb
        .from("agency_talent_roster")
        .select("talent_profile_id, tenant_id")
        .neq("status", "removed"),
    ]);

    if (termsR.error) {
      // eslint-disable-next-line no-console
      console.error("[talent-types-data] terms load failed:", termsR.error.message);
      return EMPTY_LIST;
    }

    // mappedFieldCount per term
    const mappedCounts = new Map<string, number>();
    for (const row of (recsR.data ?? []) as Array<{ taxonomy_term_id: string | null }>) {
      if (!row.taxonomy_term_id) continue;
      mappedCounts.set(row.taxonomy_term_id, (mappedCounts.get(row.taxonomy_term_id) ?? 0) + 1);
    }

    // talentCount per term — distinct talent_profile_ids per taxonomy_term_id
    const talentsByTerm = new Map<string, Set<string>>();
    for (const row of (assignmentsR.data ?? []) as Array<{
      taxonomy_term_id: string | null;
      talent_profile_id: string | null;
    }>) {
      if (!row.taxonomy_term_id || !row.talent_profile_id) continue;
      const s = talentsByTerm.get(row.taxonomy_term_id) ?? new Set();
      s.add(row.talent_profile_id);
      talentsByTerm.set(row.taxonomy_term_id, s);
    }

    // agencyCount per term — for each talent in term, collect tenant_ids from roster
    // Build: talent_profile_id → Set<tenant_id>
    const tenantsByTalent = new Map<string, Set<string>>();
    for (const row of (rosterR.data ?? []) as Array<{
      talent_profile_id: string | null;
      tenant_id: string | null;
    }>) {
      if (!row.talent_profile_id || !row.tenant_id) continue;
      const s = tenantsByTalent.get(row.talent_profile_id) ?? new Set();
      s.add(row.tenant_id);
      tenantsByTalent.set(row.talent_profile_id, s);
    }

    const types: TalentTypeRow[] = (
      termsR.data as Array<{
        id: string;
        slug: string;
        name_i18n: Record<string, string | null> | null;
        plural_name: string | null;
        description: string | null;
        icon: string | null;
        level: number;
        sort_order: number;
        is_active: boolean;
        archived_at: string | null;
      }>
    ).map((term) => {
      const talentSet = talentsByTerm.get(term.id) ?? new Set<string>();
      const agencySet = new Set<string>();
      for (const talentId of talentSet) {
        for (const tenantId of (tenantsByTalent.get(talentId) ?? new Set())) {
          agencySet.add(tenantId);
        }
      }
      return {
        id: term.id,
        slug: term.slug,
        name_en: term.name_i18n?.en ?? "",
        name_es: term.name_i18n?.es ?? null,
        plural_name: term.plural_name,
        description: term.description,
        icon: term.icon,
        level: term.level,
        sort_order: term.sort_order ?? 100,
        is_active: term.is_active,
        archived_at: term.archived_at,
        mappedFieldCount: mappedCounts.get(term.id) ?? 0,
        agencyCount: agencySet.size,
        talentCount: talentSet.size,
      };
    });

    return { ok: true, types };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[talent-types-data] unexpected error:", e);
    return EMPTY_LIST;
  }
}

// ---------------------------------------------------------------------------
// Taxonomy tree loader — 3-level hierarchy for the Talent Types tab
// ---------------------------------------------------------------------------

export type TaxonomyTermBase = {
  id: string;
  slug: string;
  name_en: string;
  name_es: string | null;
  icon: string | null;
  parent_id: string | null;
  sort_order: number;
  term_type: string;
  is_active: boolean;
  archived_at: string | null;
};

export type TaxonomyTypeNode = TaxonomyTermBase & {
  mappedFieldCount: number;
  agencyCount: number;
  talentCount: number;
};

export type TaxonomyGroupNode = TaxonomyTermBase & {
  talentTypesCount: number;
  agencyCount: number;
  talentCount: number;
  types: TaxonomyTypeNode[];
};

export type TaxonomyParentNode = TaxonomyTermBase & {
  talentTypesCount: number;
  groupsCount: number;
  agencyCount: number;
  talentCount: number;
  groups: TaxonomyGroupNode[];
};

export type LoadPlatformTaxonomyTreeResult = {
  ok: boolean;
  parents: TaxonomyParentNode[];
};

const EMPTY_TREE: LoadPlatformTaxonomyTreeResult = { ok: false, parents: [] };

export async function loadPlatformTaxonomyTree(): Promise<LoadPlatformTaxonomyTreeResult> {
  return unstable_cache(
    () => loadPlatformTaxonomyTreeUncached(),
    ["platform:taxonomy-tree", "v1"],
    {
      tags: [CACHE_TAG_TAXONOMY, CACHE_TAG_FIELD_CATALOG],
      revalidate: 60,
    },
  )();
}

async function loadPlatformTaxonomyTreeUncached(): Promise<LoadPlatformTaxonomyTreeResult> {
  const sb = createServiceRoleClient();
  if (!sb) return EMPTY_TREE;

  try {
    const [termRows, recsR, assignmentsR, rosterR] = await Promise.all([
      // The 3 broad types under `archived_at IS NULL` are ~532 rows today, but
      // grow as talent_types are added and can cross PostgREST's 1000-row cap.
      // Page by `id`, then re-sort by the display order (sort_order → name_en)
      // below so the partitioned parent/group/type lists keep their order.
      // name_en/name_es folded into name_i18n {en,es} (WS4); flattened below.
      fetchAllTaxonomyTerms<Omit<TaxonomyTermBase, "name_en" | "name_es"> & {
        name_i18n: Record<string, string | null> | null;
      }>(
        sb,
        "id, slug, name_i18n, icon, parent_id, sort_order, term_type, is_active, archived_at",
        (q) =>
          q
            .in("term_type", ["parent_category", "category_group", "talent_type"])
            .is("archived_at", null),
      ),
      sb
        .from("profile_field_recommendations")
        .select("taxonomy_term_id"),
      sb
        .from("talent_profile_taxonomy")
        .select("taxonomy_term_id, talent_profile_id"),
      sb
        .from("agency_talent_roster")
        .select("talent_profile_id, tenant_id")
        .neq("status", "removed"),
    ]);

    const allTerms: TaxonomyTermBase[] = termRows
      .map((r) => ({
        id: r.id,
        slug: r.slug,
        name_en: r.name_i18n?.en ?? "",
        name_es: r.name_i18n?.es ?? null,
        icon: r.icon,
        parent_id: r.parent_id,
        sort_order: r.sort_order,
        term_type: r.term_type,
        is_active: r.is_active,
        archived_at: r.archived_at,
      }))
      .sort(
        (a, b) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
          a.name_en.localeCompare(b.name_en),
      );

    // ---- mapped field counts per talent_type ----
    const mappedCounts = new Map<string, number>();
    for (const row of (recsR.data ?? []) as Array<{ taxonomy_term_id: string | null }>) {
      if (!row.taxonomy_term_id) continue;
      mappedCounts.set(row.taxonomy_term_id, (mappedCounts.get(row.taxonomy_term_id) ?? 0) + 1);
    }

    // ---- talent and agency sets per talent_type ----
    // talent_profile_id → Set<tenant_id>
    const tenantsByTalent = new Map<string, Set<string>>();
    for (const row of (rosterR.data ?? []) as Array<{
      talent_profile_id: string | null;
      tenant_id: string | null;
    }>) {
      if (!row.talent_profile_id || !row.tenant_id) continue;
      const s = tenantsByTalent.get(row.talent_profile_id) ?? new Set<string>();
      s.add(row.tenant_id);
      tenantsByTalent.set(row.talent_profile_id, s);
    }

    // taxonomy_term_id → Set<talent_profile_id>  (only talent_type terms)
    const talentsByType = new Map<string, Set<string>>();
    for (const row of (assignmentsR.data ?? []) as Array<{
      taxonomy_term_id: string | null;
      talent_profile_id: string | null;
    }>) {
      if (!row.taxonomy_term_id || !row.talent_profile_id) continue;
      const s = talentsByType.get(row.taxonomy_term_id) ?? new Set<string>();
      s.add(row.talent_profile_id);
      talentsByType.set(row.taxonomy_term_id, s);
    }

    // Helper: given a Set of talent_profile_ids, derive distinct tenant set
    function agencySetFromTalents(talentIds: Set<string>): Set<string> {
      const agencies = new Set<string>();
      for (const tid of talentIds) {
        for (const tenantId of tenantsByTalent.get(tid) ?? new Set()) {
          agencies.add(tenantId);
        }
      }
      return agencies;
    }

    // ---- partition by term_type ----
    const parentTerms: TaxonomyTermBase[] = [];
    const groupTerms: TaxonomyTermBase[] = [];
    const typeTerms: TaxonomyTermBase[] = [];

    for (const t of allTerms) {
      if (t.term_type === "parent_category") parentTerms.push(t);
      else if (t.term_type === "category_group") groupTerms.push(t);
      else if (t.term_type === "talent_type") typeTerms.push(t);
    }

    // ---- build group → types map ----
    const typesByGroup = new Map<string, TaxonomyTypeNode[]>();
    for (const t of typeTerms) {
      const talentSet = talentsByType.get(t.id) ?? new Set<string>();
      const agencySet = agencySetFromTalents(talentSet);
      const node: TaxonomyTypeNode = {
        ...t,
        mappedFieldCount: mappedCounts.get(t.id) ?? 0,
        agencyCount: agencySet.size,
        talentCount: talentSet.size,
      };
      if (!t.parent_id) continue;
      const list = typesByGroup.get(t.parent_id) ?? [];
      list.push(node);
      typesByGroup.set(t.parent_id, list);
    }

    // ---- build parent → groups map ----
    const groupsByParent = new Map<string, TaxonomyGroupNode[]>();
    for (const g of groupTerms) {
      const childTypes = typesByGroup.get(g.id) ?? [];
      // Roll up: union of all descendant talent sets
      const unionTalents = new Set<string>();
      for (const ct of childTypes) {
        for (const tid of talentsByType.get(ct.id) ?? new Set()) {
          unionTalents.add(tid);
        }
      }
      const agencySet = agencySetFromTalents(unionTalents);
      const node: TaxonomyGroupNode = {
        ...g,
        talentTypesCount: childTypes.length,
        agencyCount: agencySet.size,
        talentCount: unionTalents.size,
        types: childTypes,
      };
      if (!g.parent_id) continue;
      const list = groupsByParent.get(g.parent_id) ?? [];
      list.push(node);
      groupsByParent.set(g.parent_id, list);
    }

    // ---- build parent nodes ----
    const parents: TaxonomyParentNode[] = parentTerms.map((p) => {
      const childGroups = groupsByParent.get(p.id) ?? [];
      // Roll up across all descendant talent_types of all groups
      const unionTalents = new Set<string>();
      for (const cg of childGroups) {
        for (const ct of cg.types) {
          for (const tid of talentsByType.get(ct.id) ?? new Set()) {
            unionTalents.add(tid);
          }
        }
      }
      const agencySet = agencySetFromTalents(unionTalents);
      const totalTypes = childGroups.reduce((s, cg) => s + cg.types.length, 0);
      return {
        ...p,
        talentTypesCount: totalTypes,
        groupsCount: childGroups.length,
        agencyCount: agencySet.size,
        talentCount: unionTalents.size,
        groups: childGroups,
      };
    });

    return { ok: true, parents };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[talent-types-data] tree unexpected error:", e);
    return EMPTY_TREE;
  }
}

// ---------------------------------------------------------------------------
// Generic taxonomy term detail loader (parent_category / category_group)
// ---------------------------------------------------------------------------

export type TaxonomyTermDetail = {
  id: string;
  slug: string;
  name_en: string;
  name_es: string | null;
  plural_name: string | null;
  description: string | null;
  icon: string | null;
  level: number;
  sort_order: number;
  is_active: boolean;
  archived_at: string | null;
  is_public_filter: boolean;
  is_profile_badge: boolean;
  is_visible_by_default: boolean;
  is_restricted: boolean;
  term_type: string;
  parent_id: string | null;
};

export type TaxonomyTermChild = {
  id: string;
  slug: string;
  name_en: string;
  name_es: string | null;
  term_type: string;
  agencyCount: number;
  talentCount: number;
  childCount: number;
};

export type TaxonomyTermDetailResult =
  | {
      ok: true;
      term: TaxonomyTermDetail;
      children: TaxonomyTermChild[];
      agencyCount: number;
      talentCount: number;
    }
  | { ok: false; notFound?: boolean };

export async function loadPlatformTaxonomyTermDetail(
  termId: string,
): Promise<TaxonomyTermDetailResult> {
  return unstable_cache(
    () => loadPlatformTaxonomyTermDetailUncached(termId),
    ["platform:taxonomy-term-detail", termId, "v1"],
    {
      tags: [CACHE_TAG_TAXONOMY, CACHE_TAG_FIELD_CATALOG],
      revalidate: 60,
    },
  )();
}

async function loadPlatformTaxonomyTermDetailUncached(
  termId: string,
): Promise<TaxonomyTermDetailResult> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false };

  try {
    const [termR, childrenR, assignmentsR, rosterR] = await Promise.all([
      sb
        .from("taxonomy_terms")
        // name_en/name_es folded into name_i18n {en,es} (WS4); flattened below.
        .select(
          "id, slug, name_i18n, plural_name, description, icon, level, sort_order, is_active, archived_at, is_public_filter, is_profile_badge, is_visible_by_default, is_restricted, term_type, parent_id",
        )
        .eq("id", termId)
        .in("term_type", ["parent_category", "category_group"])
        .maybeSingle(),
      sb
        .from("taxonomy_terms")
        .select("id, slug, name_i18n, term_type")
        .eq("parent_id", termId)
        .is("archived_at", null)
        .order("sort_order", { ascending: true })
        .order("name_i18n->>en", { ascending: true }),
      sb
        .from("talent_profile_taxonomy")
        .select("taxonomy_term_id, talent_profile_id"),
      sb
        .from("agency_talent_roster")
        .select("talent_profile_id, tenant_id")
        .neq("status", "removed"),
    ]);

    if (termR.error) {
      // eslint-disable-next-line no-console
      console.error("[talent-types-data] term-detail load failed:", termR.error.message);
      return { ok: false };
    }
    if (!termR.data) return { ok: false, notFound: true };

    // name_en/name_es resolved off name_i18n (WS4) into the flat DTOs.
    const termRaw = termR.data as Record<string, unknown>;
    const termNameMap = termRaw.name_i18n as Record<string, string | null> | null;
    const term = {
      ...(termRaw as object),
      name_en: termNameMap?.en ?? "",
      name_es: termNameMap?.es ?? null,
    } as TaxonomyTermDetail;
    const childRows = ((childrenR.data ?? []) as Array<{
      id: string;
      slug: string;
      name_i18n: Record<string, string | null> | null;
      term_type: string;
    }>).map((c) => ({
      id: c.id,
      slug: c.slug,
      name_en: c.name_i18n?.en ?? "",
      name_es: c.name_i18n?.es ?? null,
      term_type: c.term_type,
    }));

    // Build talent/agency rollups
    const tenantsByTalent = new Map<string, Set<string>>();
    for (const row of (rosterR.data ?? []) as Array<{
      talent_profile_id: string | null;
      tenant_id: string | null;
    }>) {
      if (!row.talent_profile_id || !row.tenant_id) continue;
      const s = tenantsByTalent.get(row.talent_profile_id) ?? new Set<string>();
      s.add(row.tenant_id);
      tenantsByTalent.set(row.talent_profile_id, s);
    }

    // taxonomy_term_id → Set<talent_profile_id>
    const talentsByTerm = new Map<string, Set<string>>();
    for (const row of (assignmentsR.data ?? []) as Array<{
      taxonomy_term_id: string | null;
      talent_profile_id: string | null;
    }>) {
      if (!row.taxonomy_term_id || !row.talent_profile_id) continue;
      const s = talentsByTerm.get(row.taxonomy_term_id) ?? new Set<string>();
      s.add(row.talent_profile_id);
      talentsByTerm.set(row.taxonomy_term_id, s);
    }

    function agencySetFromTalents(talentIds: Set<string>): Set<string> {
      const agencies = new Set<string>();
      for (const tid of talentIds) {
        for (const tenantId of tenantsByTalent.get(tid) ?? new Set()) {
          agencies.add(tenantId);
        }
      }
      return agencies;
    }

    // For a category_group: direct talent_type children carry assignments
    // For a parent_category: children are groups, which need further recursion
    // We approximate by loading all assignments and resolving via grandchildren
    // loaded separately. For the detail view, we load grandchildren too.
    const grandchildIds: string[] = [];
    if (term.term_type === "parent_category") {
      // grandchildren = talent_types whose parent is in childRows
      const groupIds = childRows.map((c) => c.id);
      if (groupIds.length > 0) {
        const gcR = await sb
          .from("taxonomy_terms")
          .select("id")
          .in("parent_id", groupIds)
          .eq("term_type", "talent_type")
          .is("archived_at", null);
        for (const gc of (gcR.data ?? []) as Array<{ id: string }>) {
          grandchildIds.push(gc.id);
        }
      }
    }

    const leafIds =
      term.term_type === "category_group"
        ? childRows.map((c) => c.id)
        : grandchildIds;

    const unionTalents = new Set<string>();
    for (const leafId of leafIds) {
      for (const tid of talentsByTerm.get(leafId) ?? new Set()) {
        unionTalents.add(tid);
      }
    }
    const unionAgencies = agencySetFromTalents(unionTalents);

    // Per-child counts — for category_group children (talent_types) use direct assignments
    // For parent_category children (groups) we load grandchild counts from the unified data
    const children: TaxonomyTermChild[] = childRows.map((c) => {
      const directTalents = talentsByTerm.get(c.id) ?? new Set<string>();
      const directAgencies = agencySetFromTalents(directTalents);
      return {
        id: c.id,
        slug: c.slug,
        name_en: c.name_en,
        name_es: c.name_es,
        term_type: c.term_type,
        agencyCount: directAgencies.size,
        talentCount: directTalents.size,
        childCount: 0, // populated as 0; list UI shows link not counts
      };
    });

    return {
      ok: true,
      term,
      children,
      agencyCount: unionAgencies.size,
      talentCount: unionTalents.size,
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[talent-types-data] term-detail unexpected error:", e);
    return { ok: false };
  }
}

// ---------------------------------------------------------------------------
// Detail loader
// ---------------------------------------------------------------------------

export async function loadPlatformTalentTypeDetail(
  termId: string,
): Promise<TalentTypeDetailResult> {
  return unstable_cache(
    () => loadPlatformTalentTypeDetailUncached(termId),
    ["platform:talent-type-detail", termId, "v1"],
    {
      tags: [CACHE_TAG_TAXONOMY, CACHE_TAG_FIELD_CATALOG],
      revalidate: 60,
    },
  )();
}

async function loadPlatformTalentTypeDetailUncached(
  termId: string,
): Promise<TalentTypeDetailResult> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false };

  try {
    const [termR, recsR, fieldsR, assignmentsR, rosterR] = await Promise.all([
      sb
        .from("taxonomy_terms")
        // name_en/name_es folded into name_i18n {en,es} (WS4); flattened below.
        .select(
          "id, slug, name_i18n, plural_name, description, icon, level, sort_order, is_active, archived_at, is_public_filter, is_profile_badge, is_visible_by_default, is_restricted",
        )
        .eq("id", termId)
        .eq("term_type", "talent_type")
        .maybeSingle(),
      sb
        .from("profile_field_recommendations")
        .select(
          "id, field_definition_id, taxonomy_term_id, relationship, display_order, required_at_registration, required_before_publish, required_before_verification, requires_verification, is_admin_only",
        )
        .eq("taxonomy_term_id", termId),
      sb
        .from("profile_field_definitions")
        // label/label_es folded into label_i18n {en,es} (WS3); flattened below.
        .select("id, field_key, label_i18n, tier, section, deprecated_at")
        .order("label_i18n->>en", { ascending: true }),
      sb
        .from("talent_profile_taxonomy")
        .select("talent_profile_id")
        .eq("taxonomy_term_id", termId),
      sb
        .from("agency_talent_roster")
        .select("talent_profile_id, tenant_id")
        .neq("status", "removed"),
    ]);

    if (termR.error) {
      // eslint-disable-next-line no-console
      console.error("[talent-types-data] detail term load failed:", termR.error.message);
      return { ok: false };
    }
    if (!termR.data) return { ok: false, notFound: true };

    const termRaw = termR.data as Record<string, unknown>;
    const termNameMap = termRaw.name_i18n as Record<string, string | null> | null;
    const term = {
      ...(termRaw as object),
      name_en: termNameMap?.en ?? "",
      name_es: termNameMap?.es ?? null,
    } as TalentTypeDetail;

    // Build recommendations joined to field definitions. label/label_es were
    // folded into label_i18n (WS3); flatten each def to keep the flat DTO.
    const fieldById = new Map(
      (
        fieldsR.data as Array<{
          id: string;
          field_key: string;
          label_i18n: Record<string, string | null> | null;
          tier: string;
          section: string | null;
          deprecated_at: string | null;
        }>
      ).map((f) => [
        f.id,
        {
          id: f.id,
          field_key: f.field_key,
          label: f.label_i18n?.en ?? "",
          label_es: f.label_i18n?.es ?? null,
          tier: f.tier,
          section: f.section,
          deprecated_at: f.deprecated_at,
        },
      ] as const),
    );

    const recommendations: TalentTypeRecommendation[] = (
      (recsR.data ?? []) as Array<{
        id: string;
        field_definition_id: string | null;
        taxonomy_term_id: string | null;
        relationship: string | null;
        display_order: number | null;
        required_at_registration: boolean | null;
        required_before_publish: boolean | null;
        required_before_verification: boolean | null;
        requires_verification: boolean | null;
        is_admin_only: boolean | null;
      }>
    )
      .filter((rec) => rec.field_definition_id && fieldById.has(rec.field_definition_id))
      .map((rec) => {
        const field = fieldById.get(rec.field_definition_id!)!;
        return {
          id: rec.id,
          field_definition_id: rec.field_definition_id!,
          field_key: field.field_key,
          field_label: field.label,
          field_label_es: field.label_es,
          field_tier: field.tier,
          relationship: rec.relationship ?? "applies",
          display_order: rec.display_order ?? 100,
          required_at_registration: !!rec.required_at_registration,
          required_before_publish: !!rec.required_before_publish,
          required_before_verification: !!rec.required_before_verification,
          requires_verification: !!rec.requires_verification,
          is_admin_only: !!rec.is_admin_only,
        };
      })
      .sort(
        (a, b) => a.display_order - b.display_order || a.field_label.localeCompare(b.field_label),
      );

    const fieldOptions = (
      fieldsR.data as Array<{
        id: string;
        field_key: string;
        label_i18n: Record<string, string | null> | null;
        tier: string;
        section: string | null;
        deprecated_at: string | null;
      }>
    )
      .map((f) => ({
        id: f.id,
        field_key: f.field_key,
        label: f.label_i18n?.en ?? "",
        tier: f.tier,
        section: f.section,
        deprecated_at: f.deprecated_at,
      }))
      .sort((a, b) => byLabel(a, b) || a.field_key.localeCompare(b.field_key));

    // Analytics
    const talentProfileIds = new Set(
      ((assignmentsR.data ?? []) as Array<{ talent_profile_id: string | null }>)
        .filter((r) => r.talent_profile_id)
        .map((r) => r.talent_profile_id!),
    );

    const agencySet = new Set<string>();
    for (const row of (rosterR.data ?? []) as Array<{
      talent_profile_id: string | null;
      tenant_id: string | null;
    }>) {
      if (row.tenant_id && row.talent_profile_id && talentProfileIds.has(row.talent_profile_id)) {
        agencySet.add(row.tenant_id);
      }
    }

    return {
      ok: true,
      term,
      recommendations,
      fieldOptions,
      agencyCount: agencySet.size,
      talentCount: talentProfileIds.size,
      mappedFieldCount: recommendations.length,
      requiredMappingCount: recommendations.filter(
        (r) => r.relationship === "required" || r.required_before_publish,
      ).length,
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[talent-types-data] detail unexpected error:", e);
    return { ok: false };
  }
}
