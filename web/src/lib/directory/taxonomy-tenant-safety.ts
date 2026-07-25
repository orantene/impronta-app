import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/admin";

export type DirectoryTaxonomySafetyTerm = {
  id: string;
  parent_id: string | null;
};

export type DirectoryTaxonomySafetySetting = {
  taxonomy_term_id: string;
  is_enabled: boolean | null;
  show_in_directory: boolean | null;
};

/**
 * A resolved, request-scoped answer to "may this tenant's public surfaces show
 * this taxonomy term?". Built by `loadTenantTaxonomyVisibility`; every public
 * DISPLAY surface (directory category bar, sidebar facets, card chips, the
 * public profile) must funnel its term ids through `isTermVisible` so an admin
 * who disables a category in Settings → Roster & profile fields → Categories
 * sees it disappear everywhere, not just from the `?tax=` filter.
 */
export type TenantTaxonomyVisibility = {
  /** true when the term and every ancestor are enabled + directory-visible. */
  isTermVisible: (termId: string | null | undefined) => boolean;
  /** true when the tenant has no overrides at all (fast path / allow-all). */
  readonly unrestricted: boolean;
};

/** Allow-everything visibility — the hub host, a missing tenant, or a read error. */
export const ALLOW_ALL_TAXONOMY_VISIBILITY: TenantTaxonomyVisibility = {
  isTermVisible: () => true,
  unrestricted: true,
};

/**
 * THE tenant-visibility predicate for a single taxonomy term. A term is hidden
 * when the tenant disabled it (`agency_taxonomy_settings.is_enabled = false`) or
 * removed it from the directory (`show_in_directory = false`) — or when any
 * ANCESTOR of it carries either flag. PURE / unit-tested.
 *
 * `unknownTermVisible` decides the verdict for a term id that is not present in
 * `termsById`:
 *  - `false` (default) — FAIL CLOSED. Correct for *filter input* (user-supplied
 *    `?tax=` ids): an id we cannot resolve must not widen the result set.
 *  - `true` — FAIL OPEN. Correct for *display* filtering (chips, facets, the
 *    category bar), where `termsById` intentionally only carries the tenant's
 *    hidden subtrees; anything outside them is simply not overridden.
 */
export function isTaxonomyTermVisibleForTenant(
  termId: string,
  termsById: ReadonlyMap<string, DirectoryTaxonomySafetyTerm>,
  settingsByTermId: ReadonlyMap<string, DirectoryTaxonomySafetySetting>,
  options?: { unknownTermVisible?: boolean },
): boolean {
  let current: DirectoryTaxonomySafetyTerm | undefined = termsById.get(termId);
  if (!current) return options?.unknownTermVisible === true;
  let depth = 0;
  while (current && depth < 8) {
    const setting = settingsByTermId.get(current.id);
    if (setting?.is_enabled === false || setting?.show_in_directory === false) {
      return false;
    }
    current = current.parent_id ? termsById.get(current.parent_id) : undefined;
    depth += 1;
  }
  return true;
}

export function filterTaxonomyTermIdsByTenantDirectorySafety(input: {
  requestedTermIds: readonly string[];
  termsById: ReadonlyMap<string, DirectoryTaxonomySafetyTerm>;
  settingsByTermId: ReadonlyMap<string, DirectoryTaxonomySafetySetting>;
}): string[] {
  return [...new Set(input.requestedTermIds.filter(Boolean))].filter((termId) =>
    isTaxonomyTermVisibleForTenant(termId, input.termsById, input.settingsByTermId),
  );
}

/**
 * Resolve the requested filter terms to the LEAF terms talent are actually
 * tagged with. The taxonomy is hierarchical (parent_category → category_group →
 * talent_type); `talent_profile_taxonomy` only tags the leaves. The directory
 * matches "OR within kind, AND across kinds", so a filter on a parent term (a
 * different `kind` than its leaves, and with zero direct tags) matches nobody.
 *
 * Given the requested terms plus a `termsById` closure that includes their
 * descendants, this returns the leaves (terms that are not a parent of any
 * other collected term) within the requested subtrees. A granular leaf request
 * (a directory pill, e.g. a single talent_type) is its own leaf → unchanged; a
 * group request resolves to its tagged descendant leaves. PURE / unit-tested.
 */
export function selectDirectoryMatchLeafTermIds(input: {
  requestedTermIds: readonly string[];
  termsById: ReadonlyMap<string, DirectoryTaxonomySafetyTerm>;
}): string[] {
  const requested = new Set(input.requestedTermIds);
  const parentIds = new Set<string>();
  for (const term of input.termsById.values()) {
    if (term.parent_id) parentIds.add(term.parent_id);
  }
  const isUnderRequested = (id: string): boolean => {
    let current: DirectoryTaxonomySafetyTerm | undefined = input.termsById.get(id);
    let depth = 0;
    while (current && depth < 16) {
      if (requested.has(current.id)) return true;
      current = current.parent_id ? input.termsById.get(current.parent_id) : undefined;
      depth += 1;
    }
    return false;
  };
  const leaves: string[] = [];
  for (const id of input.termsById.keys()) {
    if (!parentIds.has(id) && isUnderRequested(id)) leaves.push(id);
  }
  // Never broaden to nothing: if no leaves resolved (e.g. a term whose subtree
  // wasn't loaded), fall back to the requested ids that we do know about.
  return leaves.length > 0
    ? leaves
    : [...requested].filter((id) => input.termsById.has(id));
}

/**
 * Build the tenant's DISPLAY-side taxonomy visibility.
 *
 * Cheap by construction: it reads only the tenant's *overridden* settings rows
 * and then expands the DISABLED ones downward to their descendants. A tenant
 * with nothing disabled costs a single indexed read and returns the allow-all
 * object; the expansion frontier is normally a handful of ids.
 *
 * The resulting `termsById` deliberately contains ONLY the hidden subtrees, so
 * the shared predicate is asked with `unknownTermVisible: true` — anything
 * outside a hidden subtree is not overridden and therefore shows.
 *
 * Fails OPEN on any read error: a transient Supabase blip must not blank out
 * every category chip on the site.
 */
export async function loadTenantTaxonomyVisibility(
  supabase: SupabaseClient,
  tenantId: string | null | undefined,
): Promise<TenantTaxonomyVisibility> {
  if (!tenantId) return ALLOW_ALL_TAXONOMY_VISIBILITY;
  const client = createServiceRoleClient() ?? supabase;

  const { data: settingRows, error: settingsError } = await client
    .from("agency_taxonomy_settings")
    .select("taxonomy_term_id, is_enabled, show_in_directory")
    .eq("tenant_id", tenantId)
    .or("is_enabled.is.false,show_in_directory.is.false");
  if (settingsError) return ALLOW_ALL_TAXONOMY_VISIBILITY;

  const hiddenRoots = ((settingRows ?? []) as DirectoryTaxonomySafetySetting[]).filter(
    (row) => row.is_enabled === false || row.show_in_directory === false,
  );
  if (hiddenRoots.length === 0) return ALLOW_ALL_TAXONOMY_VISIBILITY;

  const settingsByTermId = new Map<string, DirectoryTaxonomySafetySetting>();
  const termsById = new Map<string, DirectoryTaxonomySafetyTerm>();
  for (const row of hiddenRoots) {
    settingsByTermId.set(row.taxonomy_term_id, row);
    // parent_id is irrelevant for a root: the walk stops on its own setting.
    termsById.set(row.taxonomy_term_id, { id: row.taxonomy_term_id, parent_id: null });
  }

  // Expand DOWN — a disabled parent_category must also hide its category_groups
  // and talent_types (that is how the roster tags talent).
  let frontier = hiddenRoots.map((row) => row.taxonomy_term_id);
  for (let depth = 0; depth < 8 && frontier.length > 0; depth += 1) {
    const { data, error } = await client
      .from("taxonomy_terms")
      .select("id, parent_id")
      .in("parent_id", frontier)
      .is("archived_at", null);
    if (error) return ALLOW_ALL_TAXONOMY_VISIBILITY;
    const next: string[] = [];
    for (const row of (data ?? []) as DirectoryTaxonomySafetyTerm[]) {
      if (termsById.has(row.id)) continue;
      termsById.set(row.id, row);
      next.push(row.id);
    }
    frontier = next;
  }

  return {
    unrestricted: false,
    isTermVisible: (termId) =>
      !termId ||
      isTaxonomyTermVisibleForTenant(termId, termsById, settingsByTermId, {
        unknownTermVisible: true,
      }),
  };
}

export async function resolveTenantSafeDirectoryTaxonomyTermIds(
  supabase: SupabaseClient,
  tenantId: string | null,
  requestedTermIds: readonly string[],
): Promise<string[]> {
  const requested = [...new Set(requestedTermIds.filter(Boolean))];
  if (!tenantId || requested.length === 0) return requested;

  const client = createServiceRoleClient() ?? supabase;
  const termsById = new Map<string, DirectoryTaxonomySafetyTerm>();

  // Fetch the requested terms themselves.
  const { data: reqRows, error: reqErr } = await client
    .from("taxonomy_terms")
    .select("id, parent_id")
    .in("id", requested)
    .is("archived_at", null);
  if (reqErr) return [];
  for (const row of (reqRows ?? []) as DirectoryTaxonomySafetyTerm[]) {
    termsById.set(row.id, row);
  }
  if (requested.some((id) => !termsById.has(id))) return [];

  // (A) Walk DOWN — collect every descendant of the requested terms. Talent are
  // tagged at the leaf (talent_type) level, so a filter on a parent_category /
  // category_group must resolve to its tagged leaves (see
  // selectDirectoryMatchLeafTermIds). Bounded by depth + the finite taxonomy.
  let down = [...termsById.keys()];
  for (let depth = 0; depth < 8 && down.length > 0; depth += 1) {
    const { data, error } = await client
      .from("taxonomy_terms")
      .select("id, parent_id")
      .in("parent_id", down)
      .is("archived_at", null);
    if (error) return [];
    const next: string[] = [];
    for (const row of (data ?? []) as DirectoryTaxonomySafetyTerm[]) {
      if (!termsById.has(row.id)) {
        termsById.set(row.id, row);
        next.push(row.id);
      }
    }
    down = next;
  }

  // (B) Walk UP — collect ancestors so the safety check can see a disabled
  // ancestor ABOVE a requested term.
  let up = (reqRows ?? [])
    .map((r) => (r as DirectoryTaxonomySafetyTerm).parent_id)
    .filter((p): p is string => p != null && !termsById.has(p));
  for (let depth = 0; depth < 8 && up.length > 0; depth += 1) {
    const { data, error } = await client
      .from("taxonomy_terms")
      .select("id, parent_id")
      .in("id", up)
      .is("archived_at", null);
    if (error) return [];
    const next: string[] = [];
    for (const row of (data ?? []) as DirectoryTaxonomySafetyTerm[]) {
      if (!termsById.has(row.id)) {
        termsById.set(row.id, row);
        if (row.parent_id) next.push(row.parent_id);
      }
    }
    up = [...new Set(next)];
  }

  // Resolve to the tagged leaves before the tenant-safety filter.
  const leafMatchIds = selectDirectoryMatchLeafTermIds({
    requestedTermIds: requested,
    termsById,
  });

  const { data: settings, error: settingsError } = await client
    .from("agency_taxonomy_settings")
    .select("taxonomy_term_id, is_enabled, show_in_directory")
    .eq("tenant_id", tenantId)
    .in("taxonomy_term_id", [...termsById.keys()]);
  if (settingsError) return [];

  const settingsByTermId = new Map<string, DirectoryTaxonomySafetySetting>();
  for (const row of (settings ?? []) as DirectoryTaxonomySafetySetting[]) {
    settingsByTermId.set(row.taxonomy_term_id, row);
  }

  return filterTaxonomyTermIdsByTenantDirectorySafety({
    requestedTermIds: leafMatchIds,
    termsById,
    settingsByTermId,
  });
}
