/**
 * WS7 Phase 0 — server-side data resolution for the NATIVE builder-node data
 * blocks (`hero_search`, `talent_type_grid`).
 *
 * WHY THIS FILE EXISTS (and not a per-section `fetch.ts` under `sections/`)
 * ────────────────────────────────────────────────────────────────────────
 * The two homepage data blocks previously reached freeform only through
 * `section_embed`, which re-renders the CURATED section — the very thing
 * `ws7-legacy-section-removal-plan.md` deletes in Phase 3. So the fetches are
 * re-homed here, outside the frozen `sections/` tree, with the SAME queries and
 * the SAME tenant gate the curated sections used. Nothing here imports from
 * `sections/`; when that tree is deleted this module is untouched.
 *
 * TENANT ISOLATION — the highest-risk property in this file
 * ────────────────────────────────────────────────────────
 * Both reads start from `listTalentIdsOnTenantRoster(supabase, tenantId)`, which
 * filters `agency_talent_roster` on an EXPLICIT `tenant_id` equality plus the
 * public-listing gate (`status = 'active'`, `agency_visibility ∈ PUBLIC_VISIBILITIES`,
 * `talent_site_hidden = false`). That id set is then the `.in("talent_profile_id", …)`
 * constraint on every downstream row. Scoping is therefore enforced in the QUERY
 * LAYER, not by RLS alone, exactly as the curated sections documented. A talent
 * off this tenant's visible roster cannot contribute a row, a count, or a
 * category label.
 *
 * The RENDERER never calls any of this: it reads the resolved values off
 * `dataSources`. A builder node holds no tenant id and issues no query, so a
 * cross-tenant leak is not reachable from the render path at all.
 */
import { pickLocale } from "@/lib/i18n/pick-locale";
import { byLabel } from "@/lib/field-engine/sort-comparators";
import { listTalentIdsOnTenantRoster } from "@/lib/saas/talent-roster";
import { logServerError } from "@/lib/server/safe-error";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import {
  rowToOffering,
  type TalentOfferingRow,
} from "@/lib/talent/offerings-types";

/** One discipline card's worth of derived data. */
export type NativeTalentDiscipline = {
  termId: string;
  label: string;
  count: number;
};

/**
 * A `talent_profile_taxonomy` row joined to its term. PostgREST returns the
 * embedded relation as an object OR a single-element array depending on the
 * inferred cardinality, so both shapes are accepted (`one()` below).
 */
export type TalentTaxonomyJoinRow = {
  talent_profile_id: string;
  taxonomy_term_id: string;
  taxonomy_terms:
    | TalentTaxonomyTerm
    | TalentTaxonomyTerm[]
    | null;
};

export type TalentTaxonomyTerm = {
  id: string;
  name_i18n: Record<string, string | null> | null;
  term_type: string | null;
  parent_id: string | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

/**
 * PURE derivation of the discipline cards from already-fetched rows.
 *
 * Extracted from the fetcher so the tenant gate is DIRECTLY testable: pass rows
 * that include a foreign tenant's talent and assert none of it survives. The
 * `rosterTalentIds` argument is the tenant's visible roster; any row whose
 * `talent_profile_id` is not in it is dropped here as well as in the query, so
 * the isolation holds even if a caller ever widens the query by mistake
 * (defence in depth — the query constraint remains the primary gate).
 *
 * Behavioural spec = `sections/talent_type_grid/fetch.ts`: only `talent_type` /
 * `parent_category` terms count, counts are DISTINCT talent per resolved term,
 * optional parent rollup, optional `selectedTermIds` narrowing, sorted by count
 * then label, capped at `maxItems`.
 */
export function deriveTalentDisciplines(params: {
  rows: ReadonlyArray<TalentTaxonomyJoinRow>;
  rosterTalentIds: ReadonlyArray<string>;
  parentCategoryMode: boolean;
  selectedTermIds?: ReadonlyArray<string>;
  maxItems: number;
  locale: string;
  /** Parent term labels, when rolling up (`id → name_i18n`). */
  parentTerms?: ReadonlyArray<{
    id: string;
    name_i18n: Record<string, string | null> | null;
  }>;
}): NativeTalentDiscipline[] {
  const {
    rows,
    rosterTalentIds,
    parentCategoryMode,
    selectedTermIds,
    maxItems,
    locale,
    parentTerms,
  } = params;
  const roster = new Set(rosterTalentIds);
  if (roster.size === 0) return [];

  const byTerm = new Map<string, { label: string; talents: Set<string> }>();

  for (const row of rows) {
    // TENANT GATE (defence in depth — see the file header).
    if (!roster.has(row.talent_profile_id)) continue;
    const term = one(row.taxonomy_terms);
    if (!term) continue;
    // Only filterable disciplines surface.
    if (term.term_type !== "talent_type" && term.term_type !== "parent_category") {
      continue;
    }
    if (parentCategoryMode && term.parent_id) {
      const slot =
        byTerm.get(term.parent_id) ?? { label: "", talents: new Set<string>() };
      slot.talents.add(row.talent_profile_id);
      byTerm.set(term.parent_id, slot);
      continue;
    }
    if (
      selectedTermIds &&
      selectedTermIds.length > 0 &&
      !selectedTermIds.includes(term.id)
    ) {
      continue;
    }
    const i18n = term.name_i18n ?? {};
    const label = pickLocale(locale, { en: i18n.en, es: i18n.es }) ?? i18n.en ?? "";
    const slot = byTerm.get(term.id) ?? { label, talents: new Set<string>() };
    if (!slot.label) slot.label = label;
    slot.talents.add(row.talent_profile_id);
    byTerm.set(term.id, slot);
  }

  if (parentCategoryMode) {
    for (const parent of parentTerms ?? []) {
      const slot = byTerm.get(parent.id);
      if (!slot) continue;
      const i18n = parent.name_i18n ?? {};
      slot.label =
        pickLocale(locale, { en: i18n.en, es: i18n.es }) ?? i18n.en ?? slot.label;
    }
    if (selectedTermIds && selectedTermIds.length > 0) {
      for (const key of [...byTerm.keys()]) {
        if (!selectedTermIds.includes(key)) byTerm.delete(key);
      }
    }
  }

  return [...byTerm.entries()]
    .filter(([, value]) => value.label.length > 0)
    .map(([termId, value]) => ({
      termId,
      label: value.label,
      count: value.talents.size,
    }))
    .sort((a, b) => b.count - a.count || byLabel(a, b))
    .slice(0, maxItems);
}

/**
 * Tenant-scoped talent count for the native `hero_search` stat line.
 *
 * Scoping: `listTalentIdsOnTenantRoster(tenantId)` — the tenant's ACTIVE,
 * site-visible, non-hidden roster — and returns the size of that set. Zero-safe;
 * never throws (a failed read renders no stat rather than breaking the page).
 */
export async function fetchTenantTalentCount(tenantId: string): Promise<number> {
  const supabase = createPublicSupabaseClient();
  if (!supabase || !tenantId) return 0;
  try {
    const roster = await listTalentIdsOnTenantRoster(supabase, tenantId);
    return roster.length;
  } catch (error) {
    logServerError("native-data-blocks/fetchTenantTalentCount", error);
    return 0;
  }
}

/**
 * Tenant-scoped discipline categories for the native `talent_type_grid`.
 *
 * Scoping: the roster id set above constrains `talent_profile_taxonomy` via
 * `.in("talent_profile_id", roster)`; `deriveTalentDisciplines` re-checks the
 * same set. Empty roster ⇒ `[]` with no further round-trips.
 */
export async function fetchTenantTalentDisciplines(params: {
  tenantId: string;
  parentCategoryMode: boolean;
  selectedTermIds?: ReadonlyArray<string>;
  maxItems: number;
  locale: string;
}): Promise<NativeTalentDiscipline[]> {
  const { tenantId, parentCategoryMode, selectedTermIds, maxItems, locale } =
    params;
  const supabase = createPublicSupabaseClient();
  if (!supabase || !tenantId) return [];
  try {
    const roster = await listTalentIdsOnTenantRoster(supabase, tenantId);
    if (roster.length === 0) return [];

    const { data, error } = await supabase
      .from("talent_profile_taxonomy")
      .select(
        `talent_profile_id, taxonomy_term_id,
         taxonomy_terms ( id, name_i18n, term_type, parent_id )`,
      )
      .in("talent_profile_id", roster);
    if (error) {
      logServerError("native-data-blocks/fetchTenantTalentDisciplines", error);
      return [];
    }
    const rows = (data ?? []) as unknown as TalentTaxonomyJoinRow[];

    // Parent labels are only needed when rolling up.
    let parentTerms:
      | Array<{ id: string; name_i18n: Record<string, string | null> | null }>
      | undefined;
    if (parentCategoryMode) {
      const parentIds = new Set<string>();
      const rosterSet = new Set(roster);
      for (const row of rows) {
        if (!rosterSet.has(row.talent_profile_id)) continue;
        const term = one(row.taxonomy_terms);
        if (term?.parent_id) parentIds.add(term.parent_id);
      }
      if (parentIds.size > 0) {
        const { data: parents } = await supabase
          .from("taxonomy_terms")
          .select("id, name_i18n")
          .in("id", [...parentIds]);
        parentTerms = (parents ?? []).map((row) => ({
          id: row.id as string,
          name_i18n:
            (row as { name_i18n?: Record<string, string | null> | null })
              .name_i18n ?? null,
        }));
      }
    }

    return deriveTalentDisciplines({
      rows,
      rosterTalentIds: roster,
      parentCategoryMode,
      selectedTermIds,
      maxItems,
      locale,
      parentTerms,
    });
  } catch (error) {
    logServerError("native-data-blocks/fetchTenantTalentDisciplines", error);
    return [];
  }
}

export type WorkspaceMenuOffering = {
  id: string;
  title: string;
  description: string | null;
  amountCents: number | null;
  currency: string;
  priceType: string;
  priceDisplay: string;
  kind: string;
  /**
   * Units left, or null when this item is not stock-limited.
   *
   * SEAM, with the exact swap named. Today `inventory_qty` is the only stock
   * signal, so `!= null` is the correct "has stock" test. When PR #1520 lands,
   * `capacity_pool_id` becomes authoritative and `inventory_qty` is a mirror the
   * capacity RPCs maintain — at which point the test below becomes
   * `offering.capacityPoolId != null` (the Capacity Engine's registered
   * contract). The two agree under `set_offering_stock`, which nulls both
   * together for an unlimited item, so this derive is correct on either side of
   * that merge. Only this function reads the column: the island and the renderer
   * consume `unitsLeft`, so the swap is one line here and nothing else moves.
   *
   * Gated on stock PRESENCE, never on `kind`. instant-book reserves only when
   * `kind === "product"`, and the live seat-limited class is `kind='package'`,
   * so a kind gate leaves the one item that needs enforcement unenforced.
   */
  unitsLeft: number | null;
  /** Offering policy: may the customer settle in person? */
  allowPayInPerson: boolean;
};

/**
 * Workspace-owned menu items are NOT roster-gated.
 *
 * Business workspaces do not have a talent roster, so unlike the talent
 * homepage blocks this fetch keys directly off `talent_offerings` with the
 * workspace ownership predicates. Public menu pages still stay tenant-scoped
 * because the tenant id is part of every query predicate.
 */
export function deriveWorkspaceMenuOfferings(
  rows: ReadonlyArray<TalentOfferingRow>,
  tenantId: string,
  locale = "en",
): WorkspaceMenuOffering[] {
  if (!tenantId) return [];
  const out: WorkspaceMenuOffering[] = [];
  for (const row of rows) {
    if (row.tenant_id !== tenantId) continue;
    if (row.owner_kind !== "workspace") continue;
    if (row.status !== "published") continue;
    if (row.moderation_state !== "approved") continue;
    const offering = rowToOffering(row as TalentOfferingRow, locale);
    out.push({
      id: offering.id,
      title: offering.title,
      description: offering.description,
      amountCents: offering.amountCents,
      currency: offering.currency,
      priceType: offering.priceType,
      priceDisplay: offering.priceDisplay,
      kind: offering.kind,
      unitsLeft:
        typeof offering.inventoryQty === "number" && Number.isFinite(offering.inventoryQty)
          ? Math.max(0, Math.trunc(offering.inventoryQty))
          : null,
      allowPayInPerson: offering.allowPayInPerson === true,
    });
  }
  return out;
}

export async function fetchWorkspaceMenuOfferings(
  tenantId: string,
  locale = "en",
): Promise<WorkspaceMenuOffering[]> {
  const supabase = createPublicSupabaseClient();
  if (!supabase || !tenantId) return [];
  try {
    const { data, error } = await supabase
      .from("talent_offerings")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("owner_kind", "workspace")
      .eq("status", "published")
      .eq("moderation_state", "approved")
      .order("sort_order", { ascending: true });
    if (error) {
      logServerError("native-data-blocks/fetchWorkspaceMenuOfferings", error);
      return [];
    }
    return deriveWorkspaceMenuOfferings(
      (data ?? []) as TalentOfferingRow[],
      tenantId,
      locale,
    );
  } catch (error) {
    logServerError("native-data-blocks/fetchWorkspaceMenuOfferings", error);
    return [];
  }
}
