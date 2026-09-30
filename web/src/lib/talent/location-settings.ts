/**
 * Talent location settings: the single source of truth for how a talent's
 * place is shown on her site (Services > Defaults > Where you work).
 *
 * Row: `talent_location_settings` (service role only, no anon grant).
 *
 * PRIVACY CONTRACT. `exactAddress` is private. The ONLY way it reaches page
 * data, JSON-LD, links or an embed is `toPublicLocation`, and that keeps it
 * only when `addressMode === "public"`. Every public consumer goes through
 * `toPublicLocation`; nothing else in the codebase may read `exactAddress`
 * into render data.
 */

export const ADDRESS_MODES = ["zone_only", "after_booking", "public"] as const;
export type AddressMode = (typeof ADDRESS_MODES)[number];

export const STUDIO_KINDS = ["studio", "home_visits", "both"] as const;
export type StudioKind = (typeof STUDIO_KINDS)[number];

export type LocationSettings = {
  addressMode: AddressMode;
  studioKind: StudioKind;
  /** Public. Free text, e.g. "Centro". */
  zoneNeighbourhood: string;
  /** Public. How to arrive; never the exact address. */
  arrivalNote: string;
  /** Public. Optional https photo of the entrance or studio. */
  arrivalPhotoUrl: string;
  /** PRIVATE. Empty string when unset. */
  exactAddress: string;
};

export const DEFAULT_LOCATION_SETTINGS: LocationSettings = {
  addressMode: "zone_only",
  studioKind: "studio",
  zoneNeighbourhood: "",
  arrivalNote: "",
  arrivalPhotoUrl: "",
  exactAddress: "",
};

export const LOCATION_LIMITS = {
  zoneNeighbourhood: 120,
  arrivalNote: 600,
  arrivalPhotoUrl: 2000,
  exactAddress: 300,
} as const;

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** https only: a photo URL never smuggles a script or a data URI. */
function photoUrl(v: unknown): string {
  const s = str(v, LOCATION_LIMITS.arrivalPhotoUrl);
  return /^https:\/\//i.test(s) ? s : "";
}

/** Normalise untrusted input (form or DB row, snake_case or camelCase). */
export function parseLocationSettings(raw: unknown): LocationSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = (camel: string, snake: string) => (camel in r ? r[camel] : r[snake]);
  return {
    addressMode: oneOf(pick("addressMode", "address_mode"), ADDRESS_MODES, "zone_only"),
    studioKind: oneOf(pick("studioKind", "studio_kind"), STUDIO_KINDS, "studio"),
    zoneNeighbourhood: str(pick("zoneNeighbourhood", "zone_neighbourhood"), LOCATION_LIMITS.zoneNeighbourhood),
    arrivalNote: str(pick("arrivalNote", "arrival_note"), LOCATION_LIMITS.arrivalNote),
    arrivalPhotoUrl: photoUrl(pick("arrivalPhotoUrl", "arrival_photo_url")),
    exactAddress: str(pick("exactAddress", "exact_address"), LOCATION_LIMITS.exactAddress),
  };
}

/** DB row shape written by the save action. */
export function toLocationRow(s: LocationSettings): Record<string, string | null> {
  return {
    address_mode: s.addressMode,
    studio_kind: s.studioKind,
    zone_neighbourhood: s.zoneNeighbourhood || null,
    arrival_note: s.arrivalNote || null,
    arrival_photo_url: s.arrivalPhotoUrl || null,
    exact_address: s.exactAddress || null,
  };
}

/** What the public site (and only the public site) is allowed to know. */
export type TalentLocationPublic = {
  addressMode: AddressMode;
  studioKind: StudioKind;
  /** City of the zone (from the profile). */
  city: string;
  neighbourhood: string;
  arrivalNote: string;
  arrivalPhotoUrl: string;
  /** PRESENT ONLY when addressMode === "public". */
  exactAddress?: string;
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * The privacy gate. Builds the public DTO from the settings row and the city
 * text of the profile. Returns null when there is no zone to show at all.
 * The exact address is dropped unless the mode is "public"; in every other
 * mode it is also scrubbed out of the free-text fields in case the talent
 * typed it into the note.
 */
export function toPublicLocation(settings: LocationSettings, city: string): TalentLocationPublic | null {
  const isPublic = settings.addressMode === "public";
  const exact = settings.exactAddress.trim();
  const leaks = (text: string) => !isPublic && exact.length >= 4 && norm(text).includes(norm(exact));

  const cleanCity = city.trim();
  const neighbourhood = leaks(settings.zoneNeighbourhood) ? "" : settings.zoneNeighbourhood.trim();
  const arrivalNote = leaks(settings.arrivalNote) ? "" : settings.arrivalNote.trim();
  const showExact = isPublic && exact.length > 0;

  if (!cleanCity && !neighbourhood && !showExact) return null;
  return {
    addressMode: settings.addressMode,
    studioKind: settings.studioKind,
    city: cleanCity,
    neighbourhood,
    arrivalNote,
    arrivalPhotoUrl: settings.arrivalPhotoUrl,
    ...(showExact ? { exactAddress: exact } : {}),
  };
}

/** The zone as one line: "Centro, Mérida". Empty when there is no zone. */
export function zoneLabel(loc: Pick<TalentLocationPublic, "city" | "neighbourhood">): string {
  return [loc.neighbourhood, loc.city].filter(Boolean).join(", ");
}

/** Plain external link, opened by the visitor. No embed, no request before a click. */
export function directionsHref(exactAddress: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(exactAddress)}`;
}

/** Area search only: never an address, even in the query. */
export function zoneSearchHref(loc: Pick<TalentLocationPublic, "city" | "neighbourhood">): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(zoneLabel(loc))}`;
}

/**
 * What the future live map may be centred on. The exact address only in
 * "public" mode; otherwise the zone text, so an embed can never pin a home.
 */
export function mapEmbedQuery(loc: TalentLocationPublic): string {
  return loc.addressMode === "public" && loc.exactAddress ? loc.exactAddress : zoneLabel(loc);
}

/** Settings: the modes as they read in the dashboard (EN source strings). */
export const ADDRESS_MODE_LABELS: Record<AddressMode, { label: string; hint: string }> = {
  zone_only: {
    label: "Zone only",
    hint: "Clients see your city and neighbourhood. The address is never shown.",
  },
  after_booking: {
    label: "Exact address after booking",
    hint: "Clients see the zone now and receive the exact address once the booking is confirmed.",
  },
  public: {
    label: "Public address",
    hint: "Your exact address is shown on your site with a Get directions button.",
  },
};

export const STUDIO_KIND_LABELS: Record<StudioKind, string> = {
  studio: "Studio",
  home_visits: "Home visits",
  both: "Studio and home visits",
};
