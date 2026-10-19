/**
 * F3: the public, read-only catalog of a BUSINESS, for AI assistants and other
 * sites. Pure half: paging, the guest-sellable gate, the row shape.
 *
 * Only what a guest can buy (D-10: published, approved, public). A service that
 * is on request, agency-only or unapproved is NOT in the list at all, and a
 * quote service states no figure (D-10a). Prices are the storefront's own words
 * (`resolvePublicPrice`), so an assistant quotes what the page shows.
 */
import { isGuestSellableOffering } from "@/lib/offerings/guest-sellable";
import { resolvePublicPrice } from "@/lib/talent/public-price";
import type { TalentOffering } from "@/lib/talent/offerings-types";

export const BUSINESS_CATALOG_DEFAULT_LIMIT = 50;
export const BUSINESS_CATALOG_MAX_LIMIT = 100;

export type BusinessCatalogPaging = { limit: number; offset: number };

/** `limit` 1..100 (default 50), `offset` >= 0; junk falls back to the defaults. */
export function parseCatalogPaging(params: URLSearchParams): BusinessCatalogPaging {
  const int = (raw: string | null): number | null => {
    if (raw == null || !/^\d{1,6}$/.test(raw.trim())) return null;
    return Number(raw);
  };
  const limit = int(params.get("limit"));
  const offset = int(params.get("offset"));
  return {
    limit: limit == null || limit < 1 ? BUSINESS_CATALOG_DEFAULT_LIMIT : Math.min(limit, BUSINESS_CATALOG_MAX_LIMIT),
    offset: offset ?? 0,
  };
}

export type BusinessCatalogService = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  duration_minutes: number | null;
  /** The storefront words, e.g. "$550 MXN" or "Quote". */
  price: string;
  /** Null for a quote service: no figure is stated (D-10a). */
  amount_cents: number | null;
  currency: string;
  guest_sellable: true;
};

const DESCRIPTION_MAX = 280;

function summary(raw: string | null): string | null {
  const t = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > DESCRIPTION_MAX ? `${t.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…` : t;
}

/**
 * The guest-sellable, non-product offerings as API rows. The gate is applied
 * here as well as in the query, so a loader that forgets the filter still
 * cannot publish an unapproved service.
 */
export function toBusinessCatalogServices(offerings: readonly TalentOffering[], locale: string): BusinessCatalogService[] {
  return offerings
    .filter(
      (o) =>
        o.kind !== "product" &&
        isGuestSellableOffering({ status: o.status, moderation_state: o.moderationState, visibility: o.visibility }),
    )
    .map((o) => {
      const price = resolvePublicPrice(o, locale);
      return {
        id: o.id,
        title: o.title.trim(),
        description: summary(o.description),
        category: (o.categoryLabel ?? o.category ?? "").trim() || null,
        duration_minutes: typeof o.durationMinutes === "number" && o.durationMinutes > 0 ? o.durationMinutes : null,
        price: price.text,
        amount_cents: price.mode === "exact" || price.mode === "from" ? price.cents : null,
        currency: price.currency,
        guest_sellable: true as const,
      };
    });
}

/** One page of the list and where the next one starts (null at the end). */
export function pageOf<T>(all: readonly T[], paging: BusinessCatalogPaging): { items: T[]; next_offset: number | null } {
  const items = all.slice(paging.offset, paging.offset + paging.limit);
  const end = paging.offset + items.length;
  return { items, next_offset: end < all.length ? end : null };
}

// ─── Who may be listed (TUL-1320) ─────────────────────────────────────────────

/** A public profile code, as in `/t/<code>` and the agent catalog's `?talent=`. */
export const CATALOG_PROFILE_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export const CATALOG_PROFILE_COLUMNS = "id, deleted_at, is_publicly_hidden, is_publicly_listed, visibility, profile_kind";

export type CatalogProfileRow = {
  id: string;
  deleted_at: string | null;
  is_publicly_hidden: boolean | null;
  is_publicly_listed: boolean | null;
  visibility: string | null;
  profile_kind: string | null;
};

/**
 * The same public-listing gate the sitemap and the directory use: not deleted,
 * not hidden, publicly listed, visibility public, and not a resource profile.
 * A missing flag is NOT a yes.
 */
export function isPublicCatalogProfile(p: CatalogProfileRow): boolean {
  return (
    p.deleted_at == null &&
    p.is_publicly_hidden === false &&
    p.is_publicly_listed === true &&
    p.visibility === "public" &&
    p.profile_kind !== "resource"
  );
}

/** Workspace-owned rows (no talent) stay; a talent-owned row stays only while its talent is public. */
export function keepRowsOfPublicOwners<T extends { talent_profile_id: string | null }>(
  rows: readonly T[],
  publicTalentIds: ReadonlySet<string>,
): T[] {
  return rows.filter((r) => r.talent_profile_id == null || publicTalentIds.has(r.talent_profile_id));
}
