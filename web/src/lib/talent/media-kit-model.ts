/**
 * media-kit-model.ts — the EPK (media kit) data assembly, PURE.
 *
 * Raw `talent_profiles` row + already-resolved media URLs in → a flat, fully
 * locale-resolved `TalentMediaKitModel` out. No DB, no fetch, no `Date.now()`
 * — every time-dependent value is passed in. That is what makes the shaping
 * rules (name fallback, bio fallback, taxonomy labelling, "from" price
 * precedence, gallery cap) unit-testable without a database.
 *
 * WHY A SEPARATE MODEL LAYER
 * ──────────────────────────
 * The EPK is marketed on /pricing as part of Talent Pro. It draws ONLY on
 * fields that already exist on the profile — nothing here invents a field or
 * a default. When a field is absent the model omits it and the renderer
 * simply does not draw that block; an EPK with a thin profile behind it must
 * look sparse, never fabricated.
 *
 * The renderer (`media-kit-pdf.ts`) and the loader (`media-kit-source.ts`)
 * sit on either side of this module.
 */

import type { Locale } from "@/i18n/config";
import { resolveLocalized, type LocalizedMap } from "@/lib/i18n/resolve-localized";
import {
  formatCityCountryLabel,
  resolveResidenceLocationEmbed,
  type CanonicalLocationEmbed,
} from "@/lib/canonical-location-display";
import { normalizeServicesMenu } from "@/lib/talent/services-menu-types";

/** How many gallery photos the kit will ever show. Keeps the PDF small and
 *  the layout predictable — the kit is a teaser, the profile is the archive. */
export const MEDIA_KIT_MAX_PHOTOS = 6;

/** Longest bio the kit prints. Beyond this it is ellipsised rather than
 *  spilling onto page three of what should be a one-glance document. */
export const MEDIA_KIT_MAX_BIO_CHARS = 1200;

/** A `taxonomy_terms` embed as PostgREST returns it (object or 1-element array). */
export type MediaKitTaxonomyTerm = {
  id?: string | null;
  kind?: string | null;
  slug?: string | null;
  name_i18n?: LocalizedMap | null;
};

export type MediaKitTaxonomyRow = {
  is_primary?: boolean | null;
  taxonomy_terms?: MediaKitTaxonomyTerm | MediaKitTaxonomyTerm[] | null;
};

/** The subset of `talent_profiles` the kit reads. Every field optional —
 *  a Free-tier-shaped row must not throw its way through here. */
export type MediaKitProfileRow = {
  id?: string | null;
  profile_code?: string | null;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  short_bio?: string | null;
  bio_i18n?: LocalizedMap | null;
  intro_italic?: string | null;
  /** Legacy FREE TEXT ("from $500/night"). Only used when no priced service exists. */
  starting_from?: string | null;
  services_menu?: unknown;
  residence_city?: CanonicalLocationEmbed | CanonicalLocationEmbed[] | null;
  legacy_location?: CanonicalLocationEmbed | CanonicalLocationEmbed[] | null;
  talent_profile_taxonomy?: MediaKitTaxonomyRow[] | null;
};

/** A photo whose URL has ALREADY been resolved and origin-checked upstream. */
export type MediaKitPhoto = {
  id: string;
  url: string;
  variantKind?: string | null;
};

export type MediaKitInput = {
  profile: MediaKitProfileRow;
  /** Approved, non-deleted gallery-ish assets, pre-sorted by sort_order. */
  gallery: readonly MediaKitPhoto[];
  /** Cover/headshot URL (the `card` variant on the public profile). */
  headshotUrl: string | null;
  locale: Locale;
  /** Deterministic fallback chain, e.g. ["es", "en"]. */
  fallbackChain: readonly Locale[];
  /** Absolute public URL of the talent's Tulala profile — the contact route. */
  profileUrl: string | null;
  /** ISO timestamp; passed in so the model stays deterministic under test. */
  generatedAtISO: string;
  /** Brand shown in the footer. Defaults to "Tulala". */
  brandName?: string;
};

export type TalentMediaKitModel = {
  displayName: string;
  /** `intro_italic` — the one-line tagline, when the talent wrote one. */
  headline: string | null;
  bio: string | null;
  /** The `is_primary` taxonomy term label, when one is flagged. */
  primaryTypeLabel: string | null;
  /** Every taxonomy label including the primary, de-duplicated, in row order. */
  talentTypeLabels: string[];
  locationLabel: string | null;
  /** "From $500" (cheapest published priced service) or the free-text fallback. */
  priceLabel: string | null;
  headshotUrl: string | null;
  photos: MediaKitPhoto[];
  profileUrl: string | null;
  profileCode: string | null;
  generatedAtISO: string;
  brandName: string;
  /** Slug-safe file name stem, e.g. "ana-ruiz-media-kit". */
  fileNameStem: string;
};

function clean(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
}

function firstEmbed<T>(raw: T | T[] | null | undefined): T | null {
  if (raw == null) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

/**
 * Name precedence mirrors the public profile page: display_name, else
 * "first last", else the profile code, else a neutral placeholder. The kit is
 * downloaded by the talent themselves, so an empty title bar would read as a
 * bug — but inventing a name would be worse.
 */
export function resolveMediaKitName(profile: MediaKitProfileRow): string {
  const display = clean(profile.display_name);
  if (display) return display;
  const joined = clean([profile.first_name, profile.last_name].map((p) => (p ?? "").trim()).join(" "));
  if (joined) return joined;
  return clean(profile.profile_code) ?? "Talent";
}

/** Locale-resolved taxonomy labels, primary first, de-duplicated. */
export function resolveMediaKitTalentTypes(
  rows: readonly MediaKitTaxonomyRow[] | null | undefined,
  locale: Locale,
  chain: readonly Locale[],
): { primary: string | null; all: string[] } {
  if (!Array.isArray(rows) || rows.length === 0) return { primary: null, all: [] };

  let primary: string | null = null;
  const all: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const term = firstEmbed(row?.taxonomy_terms);
    if (!term) continue;
    const label =
      clean(resolveLocalized(term.name_i18n, locale, chain).value) ?? clean(term.slug);
    if (!label) continue;
    if (row?.is_primary && !primary) primary = label;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(label);
  }

  // Primary leads the list when it is present but not already first.
  if (primary !== null) {
    const primaryKey = primary.toLowerCase();
    const idx = all.findIndex((l) => l.toLowerCase() === primaryKey);
    if (idx > 0) {
      all.splice(idx, 1);
      all.unshift(primary);
    }
  }

  return { primary, all };
}

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(cents / 100));
  } catch {
    return `${Math.round(cents / 100).toLocaleString("en-US")} ${currency}`;
  }
}

/**
 * "From" price precedence:
 *   1. cheapest ACTIVE, publicly-visible services_menu item with a real amount
 *   2. the legacy free-text `starting_from` column, verbatim
 *   3. nothing — the kit prints no rate row at all
 *
 * A service priced "on request" (amountCents null) deliberately does NOT
 * become a number here: the talent withheld it, and the kit must not speak a
 * figure over them.
 */
export function resolveMediaKitPriceLabel(profile: MediaKitProfileRow): string | null {
  const items = normalizeServicesMenu(profile.services_menu);
  let best: { cents: number; currency: string } | null = null;

  for (const item of items) {
    if (!item.isActive) continue;
    if (item.visibility !== "public") continue;
    if (item.amountCents == null || item.amountCents <= 0) continue;
    if (!best || item.amountCents < best.cents) {
      best = { cents: item.amountCents, currency: item.currency || "USD" };
    }
  }

  if (best) return `From ${formatMoney(best.cents, best.currency)}`;
  return clean(profile.starting_from);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Lowercase, ascii-ish, hyphenated stem for the Content-Disposition filename. */
export function mediaKitFileNameStem(displayName: string): string {
  const slug = displayName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug ? `${slug}-media-kit` : "media-kit";
}

/**
 * The one assembly entry point. Pure: same input, same output, always.
 */
export function buildTalentMediaKitModel(input: MediaKitInput): TalentMediaKitModel {
  const { profile, locale, fallbackChain } = input;

  const displayName = resolveMediaKitName(profile);

  const resolvedBio =
    clean(resolveLocalized(profile.bio_i18n, locale, fallbackChain).value) ??
    clean(profile.short_bio);

  const types = resolveMediaKitTalentTypes(profile.talent_profile_taxonomy, locale, fallbackChain);

  const locationLabel = clean(
    formatCityCountryLabel(
      locale,
      resolveResidenceLocationEmbed({
        residence_city: profile.residence_city ?? null,
        legacy_location: profile.legacy_location ?? null,
      }),
    ),
  );

  // Gallery: drop anything without a usable URL, drop the headshot if it also
  // shows up in the gallery (it already has the cover slot), then cap.
  const seenUrls = new Set<string>();
  if (input.headshotUrl) seenUrls.add(input.headshotUrl);
  const photos: MediaKitPhoto[] = [];
  for (const photo of input.gallery) {
    const url = clean(photo?.url);
    if (!url || seenUrls.has(url)) continue;
    seenUrls.add(url);
    photos.push({ id: photo.id, url, variantKind: photo.variantKind ?? null });
    if (photos.length >= MEDIA_KIT_MAX_PHOTOS) break;
  }

  return {
    displayName,
    headline: clean(profile.intro_italic),
    bio: resolvedBio ? truncate(resolvedBio, MEDIA_KIT_MAX_BIO_CHARS) : null,
    primaryTypeLabel: types.primary,
    talentTypeLabels: types.all,
    locationLabel,
    priceLabel: resolveMediaKitPriceLabel(profile),
    headshotUrl: clean(input.headshotUrl),
    photos,
    profileUrl: clean(input.profileUrl),
    profileCode: clean(profile.profile_code),
    generatedAtISO: input.generatedAtISO,
    brandName: clean(input.brandName) ?? "Tulala",
    fileNameStem: mediaKitFileNameStem(displayName),
  };
}
