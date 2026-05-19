import "server-only";

import {
  loadDiscoverTalents,
  type DiscoverTalentListItem,
} from "@/app/(workspace)/[tenantSlug]/_data-bridge/discover";
import { prefixPublicHref } from "@/lib/saas/public-hrefs";
import { withLocalePath } from "@/i18n/pathnames";
import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import { logServerError } from "@/lib/server/safe-error";
import type { DirectoryV1 } from "./schema";

/**
 * Path A data (CDP-0 amendment): the canonical card is fed by
 * `DiscoverTalentListItem` from the cross-tenant Discover bridge — the
 * same source as the public `/t/<slug>` profile — NOT the legacy
 * `DirectoryCardDTO`. Carries agency/independent + availability; trust
 * tier is deferred (Amendment A2 — not in this projection yet).
 *
 * Projection limits (honest): `DiscoverTalentListItem` has no tag,
 * rating, price, or generic-attribute fields — so `scope=by_tag` and the
 * card `showRating/showPriceFrom/showAttributes` toggles are inert with
 * Path A data until the projection is extended. by_talent_type filters
 * on `primaryTypeSlug`; manual on `profileCode`.
 */

export type DirectoryCardData = {
  id: string;
  name: string;
  /** Raw profile code (for inquiry actions). Null when unset. */
  profileCode: string | null;
  /** Final, tenant- + locale-prefixed `/t/<code>`. Empty when no code. */
  profileHref: string;
  primaryType: string | null;
  location: string | null;
  photoUrl: string | null;
  agencyName: string | null;
  isExclusive: boolean;
  /** Human availability line, or the ratified unknown fallback. */
  availabilityLabel: string;
  availabilityKnown: boolean;
  /** Days free in the next 30 (sort key); null = unknown. */
  availableDaysInNext30: number | null;
};

/** Ratified fallback string (Discover spec §5.4 / acceptance AV-2). */
export const AVAILABILITY_UNKNOWN = "Availability unknown — ask to confirm";

function formatAvailability(item: DiscoverTalentListItem): {
  label: string;
  known: boolean;
} {
  if (item.nextAvailableDate) {
    const d = new Date(`${item.nextAvailableDate}T00:00:00`);
    if (!Number.isNaN(d.getTime())) {
      const when = d.toLocaleDateString("en", {
        month: "short",
        day: "numeric",
      });
      return { label: `Available from ${when}`, known: true };
    }
  }
  if (
    typeof item.availableDaysInNext30 === "number" &&
    item.availableDaysInNext30 > 0
  ) {
    return {
      label: `Available ${item.availableDaysInNext30} days in next 30`,
      known: true,
    };
  }
  return { label: AVAILABILITY_UNKNOWN, known: false };
}

function joinLocation(city: string | null, country: string | null): string | null {
  const parts = [city, country].filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0,
  );
  return parts.length ? parts.join(", ") : null;
}

export type LoadDirectorySectionResult = {
  items: DirectoryCardData[];
  total: number;
  /** True when a requested scope can't be enforced on the Path-A projection. */
  scopeLimited: boolean;
};

/**
 * Maps section config → Discover query, returns normalized, prop-ready
 * card data with server-computed profile hrefs (no client router hook —
 * keeps the card prop-driven for the T2 reuse gate, RP-1).
 */
export async function loadDirectorySectionTalents(
  props: DirectoryV1,
  ctx: { locale: string; publicPathPrefix?: string },
): Promise<LoadDirectorySectionResult> {
  const locale: Locale = isLocale(ctx.locale) ? ctx.locale : defaultLocale;
  const prefix = ctx.publicPathPrefix ?? "";

  const wantTypes =
    props.scope === "by_talent_type" && props.talentTypeKeys.length > 0
      ? new Set(props.talentTypeKeys.map((s) => s.toLowerCase()))
      : null;
  const manualCodes =
    props.scope === "manual" && props.manualProfileCodes.length > 0
      ? props.manualProfileCodes
      : null;
  const manualSet = manualCodes ? new Set(manualCodes) : null;
  const clientFiltering = Boolean(wantTypes || manualSet);
  // by_tag can't be enforced (no tag field on the projection).
  const scopeLimited =
    props.scope === "by_tag" && props.tagKeys.length > 0;

  // Fetch a wider window when we post-filter so a full page survives.
  const fetchLimit = clientFiltering
    ? Math.min(60, Math.max(props.pageSize * 4, props.pageSize))
    : props.pageSize;

  let raw: { items: DiscoverTalentListItem[]; total: number };
  try {
    raw = await loadDiscoverTalents({ limit: fetchLimit, offset: 0 });
  } catch (err) {
    logServerError("directory-section.loadTalents", err);
    return { items: [], total: 0, scopeLimited };
  }

  const excluded = new Set(props.excludedProfileCodes);

  const rows = raw.items.filter((it) => {
    if (it.profileCode && excluded.has(it.profileCode)) return false;
    // VS-1: requirePhoto is opt-in; off by default so the section never
    // drops an is_discoverable talent the pipeline didn't.
    if (props.requirePhoto && !it.headshotUrl) return false;
    if (
      wantTypes &&
      !(
        it.primaryTypeSlug &&
        wantTypes.has(it.primaryTypeSlug.toLowerCase())
      )
    ) {
      return false;
    }
    if (manualSet && !(it.profileCode && manualSet.has(it.profileCode))) {
      return false;
    }
    return true;
  });

  const matched = rows.length;

  let items: DirectoryCardData[] = rows.map((it) => {
    const availability = formatAvailability(it);
    const profileHref = it.profileCode
      ? withLocalePath(
          prefixPublicHref(`/t/${encodeURIComponent(it.profileCode)}`, prefix),
          locale,
        )
      : "";
    return {
      id: it.id,
      name: it.displayName,
      profileCode: it.profileCode,
      profileHref,
      primaryType: it.primaryTypeLabel,
      location: joinLocation(it.homeCity, it.homeCountry),
      photoUrl: it.headshotUrl,
      agencyName: it.agencyName,
      isExclusive: it.isExclusive,
      availabilityLabel: availability.label,
      availabilityKnown: availability.known,
      availableDaysInNext30: it.availableDaysInNext30,
    };
  });

  // Sort. newest/recommended/curated keep source order (no created field
  // on the projection); az + availability are derivable.
  if (props.defaultSort === "az") {
    items.sort((a, b) => a.name.localeCompare(b.name));
  } else if (props.defaultSort === "availability") {
    items.sort(
      (a, b) =>
        Number(b.availabilityKnown) - Number(a.availabilityKnown) ||
        (b.availableDaysInNext30 ?? -1) - (a.availableDaysInNext30 ?? -1),
    );
  }

  // Manual scope: honor the operator's explicit order.
  if (manualCodes) {
    const order = new Map(manualCodes.map((c, i) => [c, i] as const));
    items.sort(
      (a, b) =>
        (order.get(a.id.startsWith("TAL") ? a.id : "") ?? Infinity) -
        (order.get(b.id.startsWith("TAL") ? b.id : "") ?? Infinity),
    );
  }

  // Feature-first: pinned codes float to the front, in order.
  if (props.pinnedProfileCodes.length > 0) {
    const order = new Map(
      props.pinnedProfileCodes.map((code, i) => [code, i] as const),
    );
    items.sort((a, b) => {
      const ai = order.has(a.id) ? (order.get(a.id) as number) : Infinity;
      const bi = order.has(b.id) ? (order.get(b.id) as number) : Infinity;
      return ai - bi;
    });
  }

  items = items.slice(0, props.pageSize);

  return {
    items,
    total: clientFiltering ? matched : raw.total,
    scopeLimited,
  };
}
