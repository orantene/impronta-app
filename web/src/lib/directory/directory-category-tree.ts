import { unstable_cache } from "next/cache";

import { CACHE_TAG_DIRECTORY, CACHE_TAG_TAXONOMY } from "@/lib/cache-tags";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { listTalentIdsOnTenantRoster } from "@/lib/saas/talent-roster";
import { loadTenantTaxonomyVisibility } from "@/lib/directory/taxonomy-tenant-safety";

/**
 * Two-level category model for the directory top bar.
 *
 * The talent taxonomy is a tree: parent_category (L1) → category_group (L2) →
 * talent_type (L3). The roster tags talent at the LEAF (talent_type). This
 * loader rolls those leaf assignments up to their L1 parent_category so the top
 * bar can show a short list of PARENT pills (Models, Hosts & Promo, …) instead
 * of dozens of leaf types, and reveal the leaf types as a refine sub-row.
 *
 * Counts are DISTINCT talent (a talent tagged with two model types is one model,
 * not two), scoped to the tenant's public roster — so a parent count matches the
 * result of clicking it (the `?tax=` resolver expands a parent to all its
 * talent-type leaves). Empty parents/children (count 0) are dropped, so the bar
 * only ever shows categories that actually have talent.
 */

export type DirectoryCategoryChild = {
  /** talent_type term id — filterable via `?tax=`. */
  id: string;
  label: string;
  count: number;
};

export type DirectoryCategoryParent = {
  /** parent_category term id — filterable via `?tax=` (expands to its leaves). */
  id: string;
  label: string;
  count: number;
  children: DirectoryCategoryChild[];
};

type TermRow = {
  id: string;
  parent_id: string | null;
  term_type: string | null;
  name_i18n: Record<string, string | null> | null;
  slug: string;
  sort_order: number | null;
  is_active: boolean | null;
  is_public_filter: boolean | null;
};

const MAX_IN = 400;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function termLabel(t: TermRow, locale: string): string {
  const i18n = t.name_i18n ?? {};
  return (
    pickLocale(locale, {
      en: i18n.en ?? t.slug,
      es: i18n.es ?? undefined,
    }) || t.slug
  );
}

async function loadCategoryTreeUncached(
  tenantId: string,
  locale: string,
): Promise<DirectoryCategoryParent[]> {
  const supabase = createServiceRoleClient();
  if (!supabase) return [];

  const rosterAllIds = await listTalentIdsOnTenantRoster(supabase, tenantId);
  if (rosterAllIds.length === 0) return [];

  // The chip count must be countable on the RESULT set, not the roster.
  //
  // `listTalentIdsOnTenantRoster` answers "on this tenant's public roster"
  // (status/agency_visibility/talent_site_hidden). The directory listing then
  // applies a STRICTER public gate — `deleted_at is null`, `is_publicly_hidden
  // = false`, `is_publicly_listed = true` (fetch-directory-page). Counting on
  // the looser set is what made a chip promise more talent than clicking it
  // produced, and — where every talent in a category was unlisted — a chip with
  // a number that clicked through to "No one matches yet" (2 such categories
  // live at the time of this change).
  //
  // Applying the same gate here restores the invariant this module's header
  // already claims: "a parent count matches the result of clicking it".
  const rosterIds: string[] = [];
  for (const ids of chunk(rosterAllIds, MAX_IN)) {
    const { data, error } = await supabase
      .from("talent_profiles")
      .select("id")
      .in("id", ids)
      .is("deleted_at", null)
      .eq("is_publicly_hidden", false)
      .eq("is_publicly_listed", true);
    if (error) return [];
    for (const row of (data ?? []) as { id: string }[]) rosterIds.push(row.id);
  }
  if (rosterIds.length === 0) return [];

  // Tenant category overrides (Settings → Roster & profile fields → Categories).
  // A category the tenant disabled must not appear as a top-bar pill or a refine
  // chip, even when roster talent are still tagged with it.
  const taxonomyVisibility = await loadTenantTaxonomyVisibility(supabase, tenantId);

  // Taxonomy tree (the three category levels only — ~530 rows, one page).
  const { data: termRows, error: termErr } = await supabase
    .from("taxonomy_terms")
    .select(
      "id, parent_id, term_type, name_i18n, slug, sort_order, is_active, is_public_filter",
    )
    .in("term_type", ["parent_category", "category_group", "talent_type"]);
  if (termErr || !termRows) return [];
  const terms = termRows as TermRow[];
  const byId = new Map(terms.map((t) => [t.id, t]));

  /** Walk up from any term to its enclosing parent_category (or null). */
  function parentCategoryOf(termId: string): TermRow | null {
    let cur: TermRow | undefined = byId.get(termId);
    let hops = 0;
    while (cur && hops < 6) {
      if (cur.term_type === "parent_category") return cur;
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
      hops++;
    }
    return null;
  }

  // Roster leaf assignments (chunked over the `.in()` limit).
  type AssignRow = { talent_profile_id: string; taxonomy_term_id: string };
  const assigns: AssignRow[] = [];
  for (const ids of chunk(rosterIds, MAX_IN)) {
    const { data, error } = await supabase
      .from("talent_profile_taxonomy")
      .select("talent_profile_id, taxonomy_term_id")
      .in("talent_profile_id", ids);
    if (error) return [];
    assigns.push(...((data ?? []) as AssignRow[]));
  }

  // Tally distinct talent per parent_category and per talent_type leaf.
  const parentTalents = new Map<string, Set<string>>();
  const childTalents = new Map<string, Set<string>>();
  const childParent = new Map<string, string>(); // leafId → parentCategoryId

  for (const a of assigns) {
    const leaf = byId.get(a.taxonomy_term_id);
    if (!leaf || leaf.term_type !== "talent_type") continue;
    if (leaf.is_active === false) continue;
    if (!taxonomyVisibility.isTermVisible(leaf.id)) continue;
    const parent = parentCategoryOf(leaf.id);
    if (!parent || parent.is_active === false) continue;
    if (!taxonomyVisibility.isTermVisible(parent.id)) continue;

    (parentTalents.get(parent.id) ?? parentTalents.set(parent.id, new Set()).get(parent.id)!).add(
      a.talent_profile_id,
    );
    // Every active talent_type with roster talent becomes a refine chip. NB:
    // `is_public_filter` is NOT the gate here — it governs the SIDEBAR facets;
    // the talent-type TOP bar surfaces all active types (Fashion Model etc. are
    // is_public_filter=false yet are valid top-bar/refine options).
    childParent.set(leaf.id, parent.id);
    (childTalents.get(leaf.id) ?? childTalents.set(leaf.id, new Set()).get(leaf.id)!).add(
      a.talent_profile_id,
    );
  }

  // Assemble parents (count > 0) with their non-empty children, sorted by count.
  const parents: DirectoryCategoryParent[] = [];
  for (const [parentId, talents] of parentTalents) {
    const pterm = byId.get(parentId);
    if (!pterm || talents.size === 0) continue;

    const children: DirectoryCategoryChild[] = [];
    for (const [leafId, pid] of childParent) {
      if (pid !== parentId) continue;
      const ct = childTalents.get(leafId);
      const cterm = byId.get(leafId);
      if (!ct || ct.size === 0 || !cterm) continue;
      children.push({ id: leafId, label: termLabel(cterm, locale), count: ct.size });
    }
    children.sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label),
    );

    parents.push({
      id: parentId,
      label: termLabel(pterm, locale),
      count: talents.size,
      children,
    });
  }
  parents.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return parents;
}

/**
 * Cached two-level directory category tree for a tenant's public roster.
 * Invalidated by the directory + taxonomy cache tags (roster/tag changes).
 */
export async function loadDirectoryCategoryTree(
  tenantId: string,
  locale: string,
): Promise<DirectoryCategoryParent[]> {
  if (!tenantId) return [];
  const cached = unstable_cache(
    () => loadCategoryTreeUncached(tenantId, locale),
    ["directory-category-tree", tenantId, locale],
    { tags: [CACHE_TAG_DIRECTORY, CACHE_TAG_TAXONOMY], revalidate: 300 },
  );
  return cached();
}
