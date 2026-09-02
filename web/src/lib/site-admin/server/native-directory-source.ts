/**
 * BUILDER 2027 · P2B — server-side card resolution for the NATIVE `directory`
 * node's FALLBACK grid (`dataSources.directoryProfiles` /
 * `directoryProfilesByNodeId`).
 *
 * WHICH PATH THIS IS
 * ──────────────────
 * A native `directory` node has two render paths, and this file feeds the
 * second one:
 *
 *   1. LIVE — the server caller injects `renderNativeLiveBlock`, the node is
 *      handed to the curated directory engine (reactive re-query, faceted
 *      sidebar, map, AI interpret). That path resolves its own data and never
 *      reads anything in this file.
 *   2. FALLBACK — no engine injected (editor canvas, a tenant-less preview, or
 *      a surface that deliberately renders static). The node paints its own
 *      heading, a REAL GET filter form and a card grid. Those cards come from
 *      here.
 *
 * The fallback is not decoration: it is what a crawler sees before hydration
 * and what renders with JavaScript off, so its cards must be the same people
 * the live engine would show, and its GET form must actually filter.
 *
 * TENANT ISOLATION
 * ────────────────
 * Every read goes through `getCachedDirectoryFirstPage({ tenantId })`, whose
 * `fetchDirectoryPage` intersects the result with
 * `listTalentIdsOnTenantRoster(tenantId)` — an EXPLICIT `tenant_id` equality
 * plus the public-listing gate (`status='active'`,
 * `agency_visibility ∈ {site_visible, featured}`, `talent_site_hidden=false`).
 * Scoping is enforced in the QUERY layer, not by RLS alone. That distinction is
 * the whole of the 2026 incident where an agency page served a talent it had
 * REMOVED from its roster, with a dead Inquire button: RLS enforces the global
 * listing gate, roster membership is a separate predicate and has to be applied
 * separately.
 *
 * `applyNativeDirectoryCardPolicy` re-applies the node's own exclusions over
 * the fetched rows, and is exported PURE so a test can hand it a foreign
 * tenant's card and assert it does not survive.
 */
import "server-only";

import { getRequestSearchParams } from "@/i18n/request-locale";
import { getCachedDirectoryFirstPage } from "@/lib/directory/cache";
import type { DirectoryCardDTO } from "@/lib/directory/types";
import { logServerError } from "@/lib/server/safe-error";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type {
  NativeDirectoryNeed,
  NativeFeaturedTalentNeed,
} from "@/lib/site-admin/builder-node/native-data-block-needs";
import {
  nativeDirectoryScopeSignature,
  nativeFeaturedTalentSignature,
} from "@/lib/site-admin/builder-node/native-data-block-needs";
import type { FeaturedTalentCardDTO } from "@/lib/site-admin/sections/featured_talent/fetch";
import { fetchFeaturedTalentForSection } from "@/lib/site-admin/sections/featured_talent/fetch";
import { resolveDirectoryScopeSeed } from "@/lib/site-admin/sections/directory/scope-seed";
import { mapDirectoryDefaultSort } from "@/lib/site-admin/sections/directory/default-sort";

/**
 * The node's `defaultSort` vocabulary is the SECTION's, and the mapping onto an
 * engine sort is `mapDirectoryDefaultSort` — deliberately REUSED rather than
 * re-derived. The live engine's client island keys its first query off that
 * same function; a second, subtly different mapping here would seed the
 * fallback grid in one order and the live grid in another, and the visible
 * symptom is a card reshuffle the instant the page hydrates.
 *
 * `DIRECTORY_SORT_VALUES` has no `az` or `availability` member, so those (and
 * `curated`) fall back honestly to `recommended` there rather than being passed
 * through as a string the cache key would fragment on.
 */
export { mapDirectoryDefaultSort };

/** Project a directory row onto the card shape the native grid renders. */
export function projectDirectoryCardForNativeGrid(
  card: DirectoryCardDTO,
): FeaturedTalentCardDTO {
  return {
    id: card.id,
    profileCode: card.profileCode,
    slugPart: card.slugPart,
    displayName: card.displayName,
    primaryTalentTypeLabel: card.primaryTalentTypeLabel,
    // The cached directory payload carries neither of these, and widening it
    // would bump the shared directory cache key for every consumer. The card
    // omits them rather than rendering anything invented.
    secondaryTalentTypeLabel: null,
    locationLabel: card.locationLabel,
    languages: [],
    availabilityLabel: null,
    parentCategoryLabel: null,
    isFeatured: card.isFeatured,
    thumbnailUrl: card.thumbnail.url,
    bookable: card.bookable === true,
  };
}

/**
 * PURE per-node card policy: exclusions, manual pick, pinning, page size.
 *
 * Separated from the fetch so the roster gate is directly testable — pass rows
 * that include a talent the tenant removed and assert none of it survives. The
 * `rosterProfileCodes` argument is the primary gate's own output; a row whose
 * code is not in it is dropped here as well as in the query (defence in depth,
 * exactly as `deriveTalentDisciplines` does for the discipline blocks).
 *
 * `rosterProfileCodes: null` means "the caller could not enumerate the roster
 * separately" and the query-layer gate stands alone — never "allow everything
 * through", which is why the parameter is required rather than optional.
 */
export function applyNativeDirectoryCardPolicy(params: {
  cards: ReadonlyArray<FeaturedTalentCardDTO>;
  rosterProfileCodes: ReadonlySet<string> | null;
  manualProfileCodes: ReadonlyArray<string>;
  pinnedProfileCodes: ReadonlyArray<string>;
  excludedProfileCodes: ReadonlyArray<string>;
  pageSize: number;
}): FeaturedTalentCardDTO[] {
  const {
    cards,
    rosterProfileCodes,
    manualProfileCodes,
    pinnedProfileCodes,
    excludedProfileCodes,
    pageSize,
  } = params;

  const norm = (code: string) => code.trim().toLowerCase();
  const excluded = new Set(excludedProfileCodes.map(norm));
  const manual = manualProfileCodes.map(norm).filter(Boolean);
  const manualSet = new Set(manual);
  const pinned = pinnedProfileCodes.map(norm).filter(Boolean);

  const kept = cards.filter((card) => {
    const code = norm(card.profileCode ?? "");
    if (!code) return false;
    // TENANT GATE (defence in depth — see the file header).
    if (rosterProfileCodes && !rosterProfileCodes.has(code)) return false;
    if (excluded.has(code)) return false;
    if (manualSet.size > 0 && !manualSet.has(code)) return false;
    return true;
  });

  // Manual pick is an ORDERED list: the operator's order is the display order.
  if (manual.length > 0) {
    const byCode = new Map(kept.map((card) => [norm(card.profileCode), card]));
    return manual
      .map((code) => byCode.get(code))
      .filter((card): card is FeaturedTalentCardDTO => Boolean(card))
      .slice(0, pageSize);
  }

  if (pinned.length === 0) return kept.slice(0, pageSize);

  const pinnedRank = new Map(pinned.map((code, index) => [code, index]));
  const front: FeaturedTalentCardDTO[] = [];
  const rest: FeaturedTalentCardDTO[] = [];
  for (const card of kept) {
    if (pinnedRank.has(norm(card.profileCode))) front.push(card);
    else rest.push(card);
  }
  front.sort(
    (a, b) =>
      (pinnedRank.get(norm(a.profileCode)) ?? 0) -
      (pinnedRank.get(norm(b.profileCode)) ?? 0),
  );
  return [...front, ...rest].slice(0, pageSize);
}

/**
 * The visitor's `?q=` for THIS request, or "" when there is none.
 *
 * Never throws: a render context with no request headers (a cached fragment, a
 * test) yields "" and the grid is simply unfiltered, which is the same result
 * as an empty search box.
 */
async function readRequestDirectoryQuery(): Promise<string> {
  try {
    const searchParams = await getRequestSearchParams();
    return searchParams.get("q")?.trim() ?? "";
  } catch {
    return "";
  }
}

/**
 * Resolve the fallback cards for EVERY native `directory` node in a tree.
 *
 * Returns a map keyed by node id, so two differently-scoped directory bands on
 * one page each get their own people. Nodes that share a scope signature share
 * a single fetch, so the common case (one band, or several identical ones) is
 * exactly one round-trip.
 *
 * Never throws. Any failure yields no entry for that node, which the renderer
 * reads as "no cards" and paints as its authored empty state next to a working
 * GET form — never a blank band and never another tenant's roster.
 */
export async function fetchNativeDirectoryProfilesByNodeId(params: {
  tenantId: string;
  needs: ReadonlyArray<NativeDirectoryNeed>;
  locale: string;
  /** Live `?q=` from the request, so the fallback's GET form actually filters. */
  query?: string;
}): Promise<Record<string, FeaturedTalentCardDTO[]>> {
  const { tenantId, needs, locale } = params;
  const out: Record<string, FeaturedTalentCardDTO[]> = {};
  if (!tenantId || needs.length === 0) return out;
  if (!isSupabaseConfigured()) return out;

  // The fallback grid renders a REAL GET form that submits `?q=`. If the
  // resolver ignored it, that form would submit, the URL would change, and the
  // same cards would come back — a control that looks like it works and does
  // not. Next only hands `searchParams` to page components and this resolver
  // runs below them, so the live query string arrives via the middleware
  // header, exactly as the curated directory section reads it. Absent header
  // (a route that bypasses middleware) is "no filter", never an error.
  const query =
    params.query?.trim() ?? (await readRequestDirectoryQuery());

  // Group by scope signature so identical bands cost one fetch.
  const groups = new Map<string, NativeDirectoryNeed[]>();
  for (const need of needs) {
    const key = nativeDirectoryScopeSignature(need);
    const bucket = groups.get(key);
    if (bucket) bucket.push(need);
    else groups.set(key, [need]);
  }

  await Promise.all(
    [...groups.values()].map(async (bucket) => {
      const head = bucket[0];
      if (!head) return;
      try {
        // Scope keys (`by_talent_type` / `by_tag` slugs) resolve to taxonomy
        // term UUIDs through the SAME resolver the curated section uses, so a
        // division band cannot silently unscope to the whole roster.
        const seed = await resolveDirectoryScopeSeed(
          {
            scope: head.scope,
            talentTypeKeys: head.talentTypeKeys,
            tagKeys: head.tagKeys,
            manualProfileCodes: head.manualProfileCodes,
          },
          tenantId,
          locale,
        );
        // A by_tag / by_talent_type band whose keys resolved to NOTHING must
        // render empty, not unfiltered. An empty `taxonomyTermIds` is "no
        // filter" downstream, so the two cases have to be told apart here.
        const scopedByKeys =
          head.scope === "by_talent_type" || head.scope === "by_tag";
        if (scopedByKeys && seed.termIds.length === 0) {
          for (const need of bucket) out[need.nodeId] = [];
          return;
        }

        // The page's largest band decides the fetch limit; the policy then
        // slices each node to its own page size.
        const limit = Math.max(...bucket.map((need) => need.pageSize));
        const page = await getCachedDirectoryFirstPage({
          taxonomyTermIds: seed.termIds,
          limit,
          locale,
          sort: mapDirectoryDefaultSort(head.defaultSort),
          tenantId,
          ...(query ? { query } : {}),
          ...(seed.manualProfileCodes.length > 0
            ? { profileCodes: seed.manualProfileCodes }
            : {}),
        });
        const cards = page.items.map(projectDirectoryCardForNativeGrid);
        // The rows already came back through the tenant roster gate inside
        // `fetchDirectoryPage`; this set re-states it for the pure policy so
        // the defence-in-depth check is exercised on the real path too.
        const rosterCodes = new Set(
          cards.map((card) => card.profileCode.trim().toLowerCase()),
        );
        for (const need of bucket) {
          out[need.nodeId] = applyNativeDirectoryCardPolicy({
            cards,
            rosterProfileCodes: rosterCodes,
            manualProfileCodes: need.manualProfileCodes,
            pinnedProfileCodes: need.pinnedProfileCodes,
            excludedProfileCodes: need.excludedProfileCodes,
            pageSize: need.pageSize,
          });
        }
      } catch (error) {
        logServerError("native-directory-source/fetchNativeDirectoryProfiles", error);
      }
    }),
  );

  return out;
}

/**
 * PHASE 8B — resolve the cards for EVERY native `featured_talent` node in a
 * tree, keyed by node id.
 *
 * WHY THIS EXISTS. The only featured-talent fetch before it was keyed off a
 * bound CONTAINER's `dataBinding` and hard-coded to `auto_featured_flag`. A
 * native `featured_talent` node carries no `dataBinding`, so it contributed no
 * need at all, and on a page with no bound container — which is every page
 * after the Phase 8B swap — it resolved to nothing and painted its empty state.
 * It also could not express `manual_pick`: Impronta's homepage names five
 * profile codes, and one tree-wide auto-flag array is not those five people.
 *
 * WHY PER NODE, like `fetchNativeDirectoryProfilesByNodeId`: `sourceMode` and
 * `manualProfileCodes` are authored ON the node, so two featured bands on one
 * page can legitimately name different people. Nodes with an identical source
 * signature share one fetch, so the common case (a single band) is one
 * round-trip.
 *
 * Never throws. A failed node gets no entry, which the renderer reads as "no
 * cards" and paints as the authored empty state — never a blank band and never
 * another tenant's roster. Tenant scoping is `fetchFeaturedTalentForSection`'s
 * own: it reads through the same visible-roster gate the curated section used,
 * which is why it is REUSED here rather than re-derived.
 */
export async function fetchNativeFeaturedTalentByNodeId(params: {
  tenantId: string;
  needs: ReadonlyArray<NativeFeaturedTalentNeed>;
  locale: string;
}): Promise<Record<string, FeaturedTalentCardDTO[]>> {
  const { tenantId, needs, locale } = params;
  const out: Record<string, FeaturedTalentCardDTO[]> = {};
  if (!tenantId || needs.length === 0) return out;
  if (!isSupabaseConfigured()) return out;

  const groups = new Map<string, NativeFeaturedTalentNeed[]>();
  for (const need of needs) {
    const key = nativeFeaturedTalentSignature(need);
    const bucket = groups.get(key);
    if (bucket) bucket.push(need);
    else groups.set(key, [need]);
  }

  await Promise.all(
    [...groups.values()].map(async (bucket) => {
      const head = bucket[0];
      if (!head) return;
      try {
        // The largest band in the group decides the fetch limit; each node then
        // slices to its own, exactly as the directory resolver does.
        const limit = Math.max(...bucket.map((need) => need.limit));
        const cards = await fetchFeaturedTalentForSection(
          tenantId,
          {
            sourceMode: head.sourceMode,
            limit,
            columnsDesktop: head.columnsDesktop,
            variant: head.variant,
            presentation: {},
            ...(head.manualProfileCodes.length > 0
              ? { manualProfileCodes: head.manualProfileCodes }
              : {}),
            ...(head.filterServiceSlug
              ? { filterServiceSlug: head.filterServiceSlug }
              : {}),
            ...(head.filterDestinationSlug
              ? { filterDestinationSlug: head.filterDestinationSlug }
              : {}),
          } as Parameters<typeof fetchFeaturedTalentForSection>[1],
          locale,
        );
        for (const need of bucket) out[need.nodeId] = cards.slice(0, need.limit);
      } catch (error) {
        logServerError(
          "native-directory-source/fetchNativeFeaturedTalentByNodeId",
          error,
        );
      }
    }),
  );

  return out;
}
