/**
 * scope-seed.ts — server-only, NO 'use server' directive.
 *
 * Resolves per-instance scope configuration into concrete filter seeds that
 * the SSR first-page fetch can pass directly to the directory cache:
 *
 *   - `by_talent_type`  → map talentTypeKeys (slugs) → taxonomy term UUIDs
 *                         so the first-page query pre-filters server-side
 *                         instead of fetching all talent then discarding.
 *   - `manual`          → resolve the requested profile codes for the listing
 *                         `.in("profile_code")` seed (client still re-orders).
 *   - `all`             → no seed.
 *   - `by_tag`          → map tagKeys (taxonomy slugs) → term UUIDs. Skills
 *                         resolve directly; parent / context slugs expand to
 *                         descendant talent_type leaves (same as by_talent_type)
 *                         so a division page does not silently unscope.
 *
 * `resolveDirectoryPublicCap` copies the same plan-tier + seat-limit pattern
 * from featured_talent/fetch.ts so callers can enforce a per-tenant cap on the
 * number of cards the section can display.
 */

import "server-only";

import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { resolvePublicRosterDisplayCap } from "@/lib/saas/roster-seat-limit";
import { logServerError } from "@/lib/server/safe-error";
import type { DirectoryV1 } from "./schema";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type DirectoryScopeSeed = {
  /** Taxonomy term UUIDs to pre-filter the SSR first page. Empty = no filter. */
  termIds: string[];
  /**
   * Resolved profile codes when scope=manual. The directory cache itself has
   * no manual-pick mode; these are surfaced so the client-island can apply the
   * filter reactively, and so the caller can show an honest scopeLimited hint.
   */
  manualProfileCodes: string[];
  /**
   * True when the requested scope cannot be fully enforced by the SSR seed
   * (e.g. by_tag keys that resolved to zero taxonomy terms).
   */
  scopeLimited: boolean;
};

/**
 * Maps section props + tenantId → a concrete seed for the SSR first-page
 * fetch and an honest `scopeLimited` hint.
 *
 * - `by_talent_type` with non-empty `talentTypeKeys`: resolves slugs → term
 *   UUIDs via a direct `taxonomy_terms` query (anon public client, no auth
 *   required). Unknown slugs are silently dropped.
 * - `manual` with non-empty `manualProfileCodes`: passes the codes through
 *   for the SSR `profileCodes` listing filter.
 * - `by_tag` with non-empty `tagKeys`: resolves slugs → term UUIDs. Skill
 *   terms seed directly; other non-leaf terms expand to talent_type leaves
 *   (parent ids are never seeded — they AND against a kind talent are not
 *   tagged on and would zero the roster).
 * - `all` or unconfigured: no seed, no scope limit.
 *
 * Never throws — returns an empty seed on any error.
 */
export async function resolveDirectoryScopeSeed(
  props: Pick<DirectoryV1, "scope" | "talentTypeKeys" | "tagKeys" | "manualProfileCodes">,
  _tenantId: string | null,
  _locale: string,
): Promise<DirectoryScopeSeed> {
  const empty: DirectoryScopeSeed = {
    termIds: [],
    manualProfileCodes: [],
    scopeLimited: false,
  };

  const scope = props.scope ?? "all";

  if (scope === "by_talent_type" && props.talentTypeKeys.length > 0) {
    return resolveByTalentType(props.talentTypeKeys);
  }

  if (scope === "manual" && props.manualProfileCodes.length > 0) {
    const codes = props.manualProfileCodes
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    return {
      ...empty,
      manualProfileCodes: codes,
      // SSR listing + count now accept profileCodes; the client still
      // re-orders to pick order. No hint — the public seed is honest.
      scopeLimited: false,
    };
  }

  if (scope === "by_tag" && props.tagKeys.length > 0) {
    return resolveByTag(props.tagKeys);
  }

  return empty;
}

/**
 * Returns the per-tenant cap on public cards for the directory section,
 * copying the pattern from featured_talent/fetch.ts.
 *
 * `null` = uncapped (paid plan with no explicit seat limit).
 * `0`    = hide the section entirely (e.g. Free plan, zero seats).
 */
export async function resolveDirectoryPublicCap(
  tenantId: string,
): Promise<number | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createPublicSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("agencies")
    .select("plan_tier, talent_seat_limit")
    .eq("id", tenantId)
    .maybeSingle<{ plan_tier: string | null; talent_seat_limit: number | null }>();

  if (error) {
    logServerError("directory/scope-seed/resolveDirectoryPublicCap", error);
    return null;
  }

  return resolvePublicRosterDisplayCap(
    data?.plan_tier ?? null,
    data?.talent_seat_limit ?? null,
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a list of talent-type slugs to their taxonomy term UUIDs.
 *
 * Uses the anon public client (no auth required — taxonomy_terms is public).
 * A single `.in("slug", keys)` fetch is sufficient; PostgREST's default
 * max-rows is 1000 and the number of talentTypeKeys the editor allows is
 * capped at 40 in the schema, so no paged fetch is needed here.
 *
 * Unknown slugs (misspelled, archived, wrong kind) are silently dropped
 * rather than erroring the whole section.
 */
async function resolveByTalentType(
  talentTypeKeys: string[],
): Promise<DirectoryScopeSeed> {
  const empty: DirectoryScopeSeed = {
    termIds: [],
    manualProfileCodes: [],
    scopeLimited: false,
  };

  if (!isSupabaseConfigured()) return empty;
  const supabase = createPublicSupabaseClient();
  if (!supabase) return empty;

  const slugs = [
    ...new Set(talentTypeKeys.map((k) => k.trim().toLowerCase()).filter(Boolean)),
  ];
  if (slugs.length === 0) return empty;

  try {
    // Query taxonomy_terms by slug. We accept both the legacy kind='talent_type'
    // and the v2 term_type='talent_type' shapes (matching isTalentTypeTerm in
    // lib/taxonomy/engine.ts) so the resolver stays forward-compatible.
    //
    // We intentionally do NOT filter on archived_at=null: if an admin has
    // configured a slug that is now archived, we drop it silently (the
    // directory will return no results for that term) rather than erroring
    // loudly. The editor's slug picker should guard against stale entries.
    const { data, error } = await (supabase as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          in: (col: string, vals: string[]) => Promise<{
            data: Array<{ id: string; slug: string; kind: string | null; term_type: string | null; archived_at: string | null }> | null;
            error: unknown;
          }>;
        };
      };
    })
      .from("taxonomy_terms")
      .select("id, slug, kind, term_type, archived_at")
      .in("slug", slugs);

    if (error) {
      logServerError("directory/scope-seed/resolveByTalentType", error);
      return empty;
    }

    const live = (data ?? []).filter((r) => r.archived_at == null);
    const isTalentType = (r: { kind: string | null; term_type: string | null }) =>
      r.term_type === "talent_type" || (!r.term_type && r.kind === "talent_type");

    const directIds = live.filter(isTalentType).map((r) => r.id).filter(Boolean);

    // A configured slug may be a PARENT (`term_type='parent_category'`) or a
    // mid-level `context` rather than a leaf talent_type. Talent are tagged
    // ONLY on level-3 talent_type terms, so a parent slug resolved to zero ids
    // here — which is indistinguishable from "no scope" downstream and made the
    // grid refetch UNSCOPED (a division page silently showing the whole
    // roster). Walk such terms down to their descendant talent_type leaves.
    const branchIds = live.filter((r) => !isTalentType(r)).map((r) => r.id).filter(Boolean);
    const descendantIds = branchIds.length > 0 ? await resolveDescendantTalentTypeIds(branchIds) : [];

    const termIds = [...new Set([...directIds, ...descendantIds])];
    return { termIds, manualProfileCodes: [], scopeLimited: false };
  } catch (err) {
    logServerError("directory/scope-seed/resolveByTalentType", err);
    return empty;
  }
}

/**
 * Resolve operator-entered tag keys (taxonomy slugs) into SSR seed term ids.
 *
 * Talent are tagged on `talent_type` leaves and on `skill` terms. Parent /
 * context / specialty rows must NOT be seeded as-is: they carry `kind='tag'`,
 * and fetch-directory-page ANDs across kinds — a parent id would require a
 * second kind no talent satisfies. Expand those to talent_type descendants
 * instead (same walk as by_talent_type).
 */
async function resolveByTag(tagKeys: string[]): Promise<DirectoryScopeSeed> {
  const empty: DirectoryScopeSeed = {
    termIds: [],
    manualProfileCodes: [],
    scopeLimited: false,
  };

  if (!isSupabaseConfigured()) return empty;
  const supabase = createPublicSupabaseClient();
  if (!supabase) return empty;

  const slugs = [
    ...new Set(tagKeys.map((k) => k.trim().toLowerCase()).filter(Boolean)),
  ];
  if (slugs.length === 0) return empty;

  try {
    const { data, error } = await (supabase as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          in: (col: string, vals: string[]) => Promise<{
            data: Array<{ id: string; slug: string; kind: string | null; term_type: string | null; archived_at: string | null }> | null;
            error: unknown;
          }>;
        };
      };
    })
      .from("taxonomy_terms")
      .select("id, slug, kind, term_type, archived_at")
      .in("slug", slugs);

    if (error) {
      logServerError("directory/scope-seed/resolveByTag", error);
      return { ...empty, scopeLimited: true };
    }

    const live = (data ?? []).filter((r) => r.archived_at == null);
    const partitioned = partitionTagScopeRows(live);
    const descendantIds =
      partitioned.branchIds.length > 0
        ? await resolveDescendantTalentTypeIds(partitioned.branchIds)
        : [];
    const termIds = [
      ...new Set([
        ...partitioned.talentTypeIds,
        ...partitioned.skillIds,
        ...descendantIds,
      ]),
    ];
    return {
      termIds,
      manualProfileCodes: [],
      // Keys were set but nothing resolved — keep the honest hint rather than
      // silently showing the full roster (the previous by_tag behaviour).
      scopeLimited: termIds.length === 0,
    };
  } catch (err) {
    logServerError("directory/scope-seed/resolveByTag", err);
    return { ...empty, scopeLimited: true };
  }
}

/**
 * Walk `parent_category` / `context` term ids down to their descendant
 * `talent_type` leaves (the only level talent are actually tagged on).
 *
 * The taxonomy is three levels (parent_category → context → talent_type), so
 * two descent hops reach every leaf; the loop is bounded at 3 regardless so a
 * malformed parent cycle can never spin. Returns [] on any error — an empty
 * result degrades to the pre-existing behaviour rather than erroring the
 * section.
 */
export interface TaxonomyDescentRow {
  id: string;
  kind: string | null;
  term_type: string | null;
  archived_at: string | null;
}

/** True for both the v2 `term_type` and the legacy `kind` shapes. */
export function isTalentTypeRow(row: Pick<TaxonomyDescentRow, "kind" | "term_type">): boolean {
  return row.term_type === "talent_type" || (!row.term_type && row.kind === "talent_type");
}

/** Skills hang off `kind`/`term_type` = `skill` — talent are tagged on these. */
export function isSkillTermRow(row: Pick<TaxonomyDescentRow, "kind" | "term_type">): boolean {
  return row.term_type === "skill" || (!row.term_type && row.kind === "skill");
}

/**
 * Split live taxonomy rows for a by_tag seed. Parent / context / specialty
 * ids go to `branchIds` so the caller can expand them to talent_type leaves;
 * they are never returned as seed ids themselves.
 */
export function partitionTagScopeRows(
  rows: ReadonlyArray<TaxonomyDescentRow>,
): { talentTypeIds: string[]; skillIds: string[]; branchIds: string[] } {
  const talentTypeIds: string[] = [];
  const skillIds: string[] = [];
  const branchIds: string[] = [];
  for (const row of rows) {
    if (!row.id) continue;
    if (isTalentTypeRow(row)) talentTypeIds.push(row.id);
    else if (isSkillTermRow(row)) skillIds.push(row.id);
    else branchIds.push(row.id);
  }
  return { talentTypeIds, skillIds, branchIds };
}

/**
 * Pure BFS from branch term ids down to their `talent_type` leaves, over an
 * injected child fetcher (so it is testable without a live taxonomy).
 *
 * Depth is bounded at 3 (parent_category → context → talent_type) and every
 * visited id is remembered, so a malformed parent cycle can never spin.
 */
export async function collectTalentTypeLeafIds(
  rootIds: string[],
  fetchChildren: (parentIds: string[]) => Promise<TaxonomyDescentRow[]>,
): Promise<string[]> {
  const leafIds: string[] = [];
  const seen = new Set<string>(rootIds);
  let frontier = rootIds;

  for (let depth = 0; depth < 3 && frontier.length > 0; depth += 1) {
    const children = (await fetchChildren(frontier)).filter(
      (r) => r.archived_at == null && r.id && !seen.has(r.id),
    );
    if (children.length === 0) break;

    const next: string[] = [];
    for (const child of children) {
      seen.add(child.id);
      if (isTalentTypeRow(child)) leafIds.push(child.id);
      else next.push(child.id);
    }
    frontier = next;
  }

  return leafIds;
}

async function resolveDescendantTalentTypeIds(rootIds: string[]): Promise<string[]> {
  const supabase = createPublicSupabaseClient();
  if (!supabase) return [];

  try {
    return await collectTalentTypeLeafIds(rootIds, async (parentIds) => {
      const { data, error } = await (supabase as unknown as {
        from: (t: string) => {
          select: (cols: string) => {
            in: (col: string, vals: string[]) => Promise<{
              data: TaxonomyDescentRow[] | null;
              error: unknown;
            }>;
          };
        };
      })
        .from("taxonomy_terms")
        .select("id, kind, term_type, archived_at")
        .in("parent_id", parentIds);

      if (error) {
        logServerError("directory/scope-seed/resolveDescendantTalentTypeIds", error);
        return [];
      }
      return data ?? [];
    });
  } catch (err) {
    logServerError("directory/scope-seed/resolveDescendantTalentTypeIds", err);
    return [];
  }
}
