/**
 * Pure builders for the foundation seeder: every function here turns one
 * FoundationDemo into the exact rows and values the seeder writes. No database,
 * no network, no clock other than the `now` argument, so every rule is unit
 * tested (foundation.test.ts) and --dry-run counts rows from the same code the
 * real run uses.
 *
 * Storage shapes are copied from the app's own writers:
 *   - talent_offerings          scripts/demo-talents/seed.mts + talent_offerings migration
 *   - talent_booking_hours      seed.mts writeBookingHours (weekly {"0".."6": [{startMin,endMin}]})
 *   - talent_profile_field_values  setTalentFieldValueAsTalent / mirrorWriteToCanonical
 *       (tenant_id = hub, workflow_state "live", one row per talent x field,
 *        select values stored as the option string, multiselect/chips as string[])
 *   - bios / limits / identity.*   blob-, identity- and scalar-field-values-catalog.ts
 */
import { randomUUID } from "node:crypto";
import { deriveSiteSlug } from "../../src/lib/talent-site/server/derive-site-slug";
import { DEMO_BATCH } from "./demos";
import type { FoundationDemo, FoundationService } from "./foundation-load";

// ── Locale ──────────────────────────────────────────────────────────────────

/** The text in the demo's primary language: Spanish for MX/AR, English for US. */
export function primaryText(d: Pick<FoundationDemo, "localePrimary">, es: string, en: string | null | undefined): string {
  return d.localePrimary === "en" && en ? en : es;
}

/** The demo's talent currency; every service must agree (see checkDemoData). */
export function demoCurrency(d: Pick<FoundationDemo, "services">): "MXN" | "USD" {
  return d.services[0]?.currency === "USD" ? "USD" : "MXN";
}

const HOME_COUNTRY_TEXT: Record<string, string> = { MX: "México", US: "United States", AR: "Argentina" };

/** talent_profiles.home_country_text for the demo's country. */
export function homeCountryText(country: string): string {
  const t = HOME_COUNTRY_TEXT[country];
  if (!t) throw new Error(`no home country text for ${country}`);
  return t;
}

/** Data problems that make a demo unsafe to seed; --dry-run and the real run both stop on these. */
export function checkDemoData(d: FoundationDemo): string[] {
  const problems: string[] = [];
  if (!["MX", "US", "AR"].includes(d.country)) problems.push(`unknown country ${d.country}`);
  if (d.isLive && d.country !== "MX") problems.push("a live demo must stay in Mexico");
  if (!["es", "en"].includes(d.defaultLocale) || d.supportedLocales[0] !== d.defaultLocale) problems.push("site language: default must be first in supported_locales");
  if (!["es", "en"].includes(d.localePrimary)) problems.push(`unknown primary locale ${d.localePrimary}`);
  const currencies = new Set(d.services.map((s) => s.currency));
  for (const c of currencies) if (c !== "MXN" && c !== "USD") problems.push(`currency ${c} is not supported (the engine prices in MXN or USD)`);
  if (currencies.size > 1) problems.push(`services mix currencies (${[...currencies].join(", ")})`);
  const want = d.country === "MX" ? "MXN" : "USD";
  if (currencies.size === 1 && [...currencies][0] !== want) problems.push(`${d.country} demos are priced in ${want}, found ${[...currencies][0]}`);
  if (d.country === "AR" && d.services.some((s) => s.priceArsReference == null)) {
    // Informational only, but the brief asks for it on every AR service.
    problems.push("an Argentine service has no price_ars_reference");
  }
  if (d.country !== "AR" && d.services.some((s) => s.priceArsReference != null)) problems.push("price_ars_reference only belongs on Argentine services");
  return problems;
}

/** Things worth a look that do not stop a run. */
export function warnDemoData(d: FoundationDemo): string[] {
  const warnings: string[] = [];
  if (d.localePrimary === "en") {
    if (!d.bioEn) warnings.push("English-primary demo has no English bio");
    if (d.services.some((s) => s.nameEn === s.name)) warnings.push("English-primary demo has a service with no separate English name");
    if (d.services.some((s) => s.category && !s.categoryEn)) warnings.push("service categories have no English text (category left empty on the offerings)");
  }
  return warnings;
}

// ── Offerings ───────────────────────────────────────────────────────────────

const UNIT_TO_PRICE_TYPE: Record<string, string> = {
  session: "per_contact",
  hour: "hour",
  event: "event",
  person: "per_person",
  package: "flat_package",
  day: "day",
};

/**
 * price_type for one service. A project that has a stated price is a flat
 * package: `custom` makes the app treat the row as quote-only (no amount, no
 * offer), so `custom` is kept for quotes.
 */
export function priceTypeFor(s: Pick<FoundationService, "mode" | "pricingUnit">): string {
  if (s.pricingUnit === "project") return s.mode === "quote" ? "custom" : "flat_package";
  return UNIT_TO_PRICE_TYPE[s.pricingUnit] ?? (s.mode === "quote" ? "custom" : "flat_package");
}

/** The app's "where" vocabulary (Services editor): studio | client | remote | agreed. */
const LOCATION_TO_WHERE: Record<string, string> = {
  studio: "studio",
  client_home: "client",
  online: "remote",
  on_location: "agreed",
  venue: "agreed",
};

export function whereFor(location: string): string {
  return LOCATION_TO_WHERE[location] ?? "agreed";
}

export function sellingWhere(services: readonly Pick<FoundationService, "location">[]): string[] {
  return [...new Set(services.map((s) => whereFor(s.location)))].sort();
}

export type OfferingRow = {
  talent_profile_id: string;
  tenant_id: string;
  kind: "service";
  title: string;
  description: string;
  title_i18n: { es: string; en?: string };
  description_i18n: { es: string; en?: string };
  category: string | null;
  price_type: string;
  price_display: "exact" | "from" | "quote";
  amount_cents: number | null;
  currency: "MXN" | "USD";
  booking_mode: "instant" | "request";
  reserve_mode: "free";
  allow_pay_in_person: true;
  duration_minutes: number | null;
  status: "published";
  visibility: "public";
  moderation_state: "approved";
  is_featured: boolean;
  sort_order: number;
  owner_kind: "talent";
  first_published_at: string;
  attributes: { demo_batch: string; where: string[]; price_ars_reference?: number };
};

export type OfferingPlan = {
  rows: OfferingRow[];
  /** Human-readable notes about services that could not be written as the workbook has them. */
  notes: string[];
  /** How many services end up as instant booking after the constraint check. */
  instantCount: number;
  /** Per service, in order: is it instant after the constraint check. */
  instantFlags: boolean[];
};

/**
 * The four offerings of one demo.
 *
 * instant  -> booking_mode instant (price exact, price_type never custom)
 * request  -> booking_mode request
 * quote    -> price_display quote, booking_mode request, amount_cents = the
 *             "desde" floor when the workbook has a price (renders "A cotizar")
 *
 * The database only allows instant for an exact price
 * (talent_offerings_instant_needs_price). A workbook service that is instant
 * but priced "from" is written as request and noted, never as an invalid row.
 */
export function buildOfferingRows(
  d: FoundationDemo,
  talentProfileId: string,
  hubTenantId: string,
  nowIso: string,
): OfferingPlan {
  const notes: string[] = [];
  const rows = d.services.map((s, i): OfferingRow => {
    const quote = s.mode === "quote" || s.priceDisplay === "quote";
    const priceDisplay: OfferingRow["price_display"] = quote ? "quote" : s.priceDisplay;
    let bookingMode: OfferingRow["booking_mode"] = s.mode === "instant" ? "instant" : "request";
    if (bookingMode === "instant" && priceDisplay !== "exact") {
      notes.push(`${d.profileCode} "${s.name}": instant service priced "${priceDisplay}" written as request`);
      bookingMode = "request";
    }
    // English text is stored when the file has it, and always for an English-primary demo.
    const withEn = d.localePrimary === "en" || s.nameEn !== s.name;
    const attributes: OfferingRow["attributes"] = { demo_batch: DEMO_BATCH, where: [whereFor(s.location)] };
    if (s.priceArsReference != null) attributes.price_ars_reference = s.priceArsReference;
    return {
      talent_profile_id: talentProfileId,
      tenant_id: hubTenantId,
      kind: "service",
      title: primaryText(d, s.name, s.nameEn),
      description: primaryText(d, s.description, s.descriptionEn),
      title_i18n: withEn ? { es: s.name, en: s.nameEn } : { es: s.name },
      description_i18n: withEn ? { es: s.description, en: s.descriptionEn } : { es: s.description },
      // No English category text in the files yet: an English site gets no group label rather than a Spanish one.
      category: d.localePrimary === "en" ? (s.categoryEn ?? null) : s.category,
      price_type: priceTypeFor({ mode: quote ? "quote" : s.mode, pricingUnit: s.pricingUnit }),
      price_display: priceDisplay,
      amount_cents: quote ? (s.price > 0 ? Math.round(s.price * 100) : null) : Math.round(s.price * 100),
      currency: s.currency === "USD" ? "USD" : "MXN",
      booking_mode: bookingMode,
      reserve_mode: "free",
      allow_pay_in_person: true,
      duration_minutes: s.durationMin && s.durationMin > 0 ? s.durationMin : null,
      status: "published",
      visibility: "public",
      moderation_state: "approved",
      is_featured: i < 2,
      sort_order: i,
      owner_kind: "talent",
      first_published_at: nowIso,
      attributes,
    };
  });
  const instantFlags = rows.map((r) => r.booking_mode === "instant");
  const instantCount = instantFlags.filter(Boolean).length;
  return { rows, notes, instantCount, instantFlags };
}

/** The older services_menu jsonb on the profile (kept in step with the offerings). */
export function buildServicesMenu(rows: readonly OfferingRow[]) {
  let instantSeen = false;
  return rows.map((r, i) => {
    const instant = r.booking_mode === "instant" && !instantSeen;
    if (instant) instantSeen = true;
    const quote = r.price_display === "quote";
    return {
      id: randomUUID(),
      name: r.title,
      description: r.description,
      pricingType: quote ? "custom" : r.price_type,
      amountCents: quote ? null : r.amount_cents,
      currency: r.currency,
      taxonomyTermIds: null,
      addOns: [],
      tiers: [],
      isActive: true,
      visibility: "public",
      sortOrder: i,
      isInstantBook: instant,
      childServiceIds: null,
    };
  });
}

// ── Booking hours ───────────────────────────────────────────────────────────

export type HoursPlan = {
  timezone: string;
  weekly: Record<string, { startMin: number; endMin: number }[]>;
  exceptions: never[];
  slot_minutes: 30 | 60;
  buffer_before_min: number;
  buffer_after_min: number;
  min_notice_min: number;
  horizon_days: 60;
};

const BUFFER_MAX_MIN = 240;

/**
 * talent_booking_hours for a demo, only when the workbook gives hours.
 *   buffer_before = the largest prep of the timed (non-quote) services
 *   buffer_after  = min(largest cleanup, 240)
 *   min_notice    = the smallest notice_hours (in minutes) of the timed services
 *   slot_minutes  = 60 when every instant (else every timed) duration is a whole
 *                   number of hours, otherwise 30
 */
export function deriveHours(d: FoundationDemo, effectiveInstant?: readonly boolean[]): HoursPlan | null {
  if (!d.hours) return null;
  const weekly: HoursPlan["weekly"] = {};
  for (let day = 0; day < 7; day += 1) {
    weekly[String(day)] = d.hours.days.includes(day) ? [{ startMin: d.hours.startMin, endMin: d.hours.endMin }] : [];
  }
  const timed = d.services.filter((s) => s.mode !== "quote");
  const before = timed.length ? Math.max(...timed.map((s) => s.prepMin)) : 0;
  const after = timed.length ? Math.max(...timed.map((s) => s.cleanupMin)) : 0;
  const notice = timed.length ? Math.min(...timed.map((s) => s.noticeHours)) * 60 : 0;
  const instants = d.services.filter((s, i) => (effectiveInstant ? effectiveInstant[i] : s.mode === "instant"));
  const basis = (instants.length ? instants : timed).map((s) => s.durationMin).filter((m): m is number => !!m && m > 0);
  const slot: 30 | 60 = basis.length > 0 && basis.every((m) => m % 60 === 0) ? 60 : 30;
  return {
    timezone: d.hours.timezone,
    weekly,
    exceptions: [],
    slot_minutes: slot,
    buffer_before_min: Math.min(before, BUFFER_MAX_MIN),
    buffer_after_min: Math.min(after, BUFFER_MAX_MIN),
    min_notice_min: notice,
    horizon_days: 60,
  };
}

/** One "open" availability cell per open weekday (next occurrence), so the drawer's Disponibilidad ticks. */
export function buildAvailabilityCells(
  d: FoundationDemo,
  today: Date,
): { date: string; status: "open"; note?: string }[] {
  if (!d.hours) return [];
  const cells: { date: string; status: "open"; note?: string }[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset));
    if (!d.hours.days.includes(day.getUTCDay())) continue;
    const cell: { date: string; status: "open"; note?: string } = { date: day.toISOString().slice(0, 10), status: "open" };
    if (cells.length === 0 && d.universal.availabilityNoteEs) cell.note = d.universal.availabilityNoteEs;
    cells.push(cell);
  }
  return cells;
}

// ── Profile columns ─────────────────────────────────────────────────────────

const COUNTRY_NAME_EN: Record<string, string> = {
  MX: "Mexico",
  US: "United States",
  CA: "Canada",
  ES: "Spain",
  AR: "Argentina",
  CO: "Colombia",
  PE: "Peru",
  CL: "Chile",
  BR: "Brazil",
  FR: "France",
  DE: "Germany",
  GB: "United Kingdom",
  IT: "Italy",
};

/** The country autocomplete stores name_en. Unknown codes fail loudly. */
export function countryName(iso: string): string {
  const name = COUNTRY_NAME_EN[iso.toUpperCase()];
  if (!name) throw new Error(`no country name for ISO code ${iso}`);
  return name;
}

const GENDER_LABEL: Record<string, string> = { female: "Woman", male: "Man", nonbinary: "Non-binary" };
export function genderLabel(g: string): string | null {
  return GENDER_LABEL[g] ?? null;
}

const PRONOUNS: Record<string, string> = { ella: "she_her", "él": "he_him", el: "he_him", elle: "they_them" };
export function pronounsValue(p: string | null): string | null {
  return p ? (PRONOUNS[p.toLowerCase()] ?? null) : null;
}

const RESPONSE_TIME: Record<string, string> = {
  under_1h: "1h",
  under_4h: "4h",
  same_day: "24h",
  next_day: "48h",
};
export function responseTimeValue(v: string | null): string | null {
  return v ? (RESPONSE_TIME[v] ?? null) : null;
}

const BIO_TONE_RULES: [RegExp, string][] = [
  [/juvenil|divertid|alegre|juguet|fresc/i, "playful"],
  [/audaz|atrevid|fuerte|intens/i, "bold"],
  [/minimal|sobri|sencill/i, "minimal"],
  [/c[aá]lid|cercan|tranquil|seren|amable|relajad/i, "warm"],
  [/elegant|profesional|preciso|claro|clara|ordenad|confiable|puntual|cuidados/i, "professional"],
];
export function bioToneValue(v: string | null): string | null {
  if (!v) return null;
  for (const [re, tone] of BIO_TONE_RULES) if (re.test(v)) return tone;
  return null;
}

export type ProfileCtx = {
  userId: string;
  nowIso: string;
  /** Existing talent_profiles.booking_terms / selling_defaults / bio fields, merged not clobbered. */
  existingBookingTerms?: unknown;
  existingSellingDefaults?: unknown;
  /** How many services end up instant, and whether the demo has hours. */
  instantCount: number;
  hasHours: boolean;
  servicesMenu: unknown[];
};

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {};
}

/** booking_terms.directBookingOptIn true only with an instant service and hours; other keys survive. */
export function mergeBookingTerms(existing: unknown, optIn: boolean): Record<string, unknown> | null {
  const base = asObject(existing);
  if (optIn) base.directBookingOptIn = true;
  else delete base.directBookingOptIn;
  return Object.keys(base).length ? base : null;
}

/**
 * The talent_profiles columns the seeder writes.
 *
 * Live demos get content only. Their name, city, visibility, site and photos
 * belong to the people who set them up, so this never sets display_name,
 * first/last name, home_city_text, visibility flags or user_id for them.
 */
export function buildProfilePatch(d: FoundationDemo, ctx: ProfileCtx): Record<string, unknown> {
  const u = d.universal;
  // Default language first (jsonb itself does not keep key order; the bios field value does).
  const bio_i18n: Record<string, string> = {};
  for (const l of [d.defaultLocale, d.defaultLocale === "en" ? "es" : "en"]) {
    const text = l === "en" ? d.bioEn : d.bio;
    if (text) bio_i18n[l] = text;
  }
  const optIn = ctx.instantCount > 0 && ctx.hasHours;
  const selling = asObject(ctx.existingSellingDefaults);
  selling.where = sellingWhere(d.services);

  const patch: Record<string, unknown> = {
    short_bio: primaryText(d, d.tagline, d.taglineEn),
    bio_i18n,
    gender: genderLabel(d.gender),
    date_of_birth: u.dob,
    nationality: u.nationality ? countryName(u.nationality) : null,
    home_country_text: homeCountryText(d.country),
    languages: d.languages,
    travel_radius_km: u.travelRadiusKm && u.travelRadiusKm > 0 ? u.travelRadiusKm : null,
    travel_fee_required: u.travelFeeRequired ?? false,
    remote_only: u.remoteOnly ?? false,
    // The workbook only has a Spanish availability line; an English-primary site does not get it.
    booking_note: d.localePrimary === "es" ? u.availabilityNoteEs : null,
    booking_terms: mergeBookingTerms(ctx.existingBookingTerms, optIn),
    selling_defaults: selling,
    services_menu: ctx.servicesMenu,
    service_category_slug: d.serviceCategorySlug,
    preferred_locale: d.defaultLocale,
    default_currency: demoCurrency(d),
    is_demo: true,
    updated_at: ctx.nowIso,
  };
  if (d.isLive) return patch;

  return {
    ...patch,
    display_name: d.displayName,
    first_name: d.firstName,
    last_name: d.lastName || null,
    profile_kind: "person",
    home_city_text: d.city,
    talent_plan_key: "talent_portfolio",
    workflow_status: "approved",
    visibility: "public",
    // Not in the public directory; no Stripe account.
    is_publicly_listed: false,
    is_discoverable: false,
    is_publicly_hidden: false,
    user_id: ctx.userId,
    deleted_at: null,
  };
}

// ── Languages ───────────────────────────────────────────────────────────────

const LANGUAGES: Record<string, { code: string; name: string }> = {};
for (const [names, code, name] of [
  [["español", "spanish", "castellano"], "es", "Spanish"],
  [["inglés", "ingles", "english"], "en", "English"],
  [["francés", "frances", "french"], "fr", "French"],
  [["alemán", "aleman", "german"], "de", "German"],
  [["italiano", "italian"], "it", "Italian"],
  [["portugués", "portugues", "portuguese"], "pt", "Portuguese"],
  [["chino", "chinese", "mandarín", "mandarin", "cantonese", "cantonés"], "zh", "Chinese"],
  [["japonés", "japones", "japanese"], "ja", "Japanese"],
  [["coreano", "korean"], "ko", "Korean"],
  [["árabe", "arabe", "arabic"], "ar", "Arabic"],
  [["hindi"], "hi", "Hindi"],
  [["ruso", "russian"], "ru", "Russian"],
  [["vietnamita", "vietnamese"], "vi", "Vietnamese"],
  [["tagalo", "tagalog", "filipino"], "tl", "Tagalog"],
  [["hebreo", "hebrew"], "he", "Hebrew"],
  [["polaco", "polish"], "pl", "Polish"],
  [["griego", "greek"], "el", "Greek"],
  [["turco", "turkish"], "tr", "Turkish"],
  [["persa", "persian", "farsi"], "fa", "Persian"],
  [["criollo haitiano", "haitian creole"], "ht", "Haitian Creole"],
  [["lengua de señas", "american sign language", "asl"], "ase", "American Sign Language"],
  [["tamil"], "ta", "Tamil"],
  [["urdu"], "ur", "Urdu"],
  [["bengalí", "bengali"], "bn", "Bengali"],
  [["punyabí", "punjabi"], "pa", "Punjabi"],
  [["swahili", "suajili"], "sw", "Swahili"],
  [["tailandés", "thai"], "th", "Thai"],
  [["indonesio", "indonesian"], "id", "Indonesian"],
  [["neerlandés", "holandés", "dutch"], "nl", "Dutch"],
  [["sueco", "swedish"], "sv", "Swedish"],
  [["ucraniano", "ukrainian"], "uk", "Ukrainian"],
  [["rumano", "romanian"], "ro", "Romanian"],
  [["checo", "czech"], "cs", "Czech"],
  [["húngaro", "hungarian"], "hu", "Hungarian"],
  [["amárico", "amharic"], "am", "Amharic"],
  [["yoruba"], "yo", "Yoruba"],
  [["navajo"], "nv", "Navajo"],
  [["maya"], "yua", "Maya"],
  [["náhuatl", "nahuatl"], "nah", "Nahuatl"],
] as [string[], string, string][]) {
  for (const n of names) LANGUAGES[n] = { code, name };
}

export type LanguageRow = {
  language_code: string;
  language_name: string;
  speaking_level: string;
  is_native: boolean;
  can_host: boolean;
  can_sell: boolean;
  can_translate: boolean;
  can_teach: boolean;
  display_order: number;
};

/** Rows for replace_talent_languages. The first language is native, the rest conversational. */
export function buildLanguageRows(d: FoundationDemo): LanguageRow[] {
  const names = d.universal.languages.length ? d.universal.languages : d.languages;
  return names.map((n, i) => {
    const l = LANGUAGES[n.trim().toLowerCase()];
    if (!l) throw new Error(`${d.profileCode}: no language mapping for "${n}"`);
    const level = i === 0 ? "native" : "conversational";
    return {
      language_code: l.code,
      language_name: l.name,
      speaking_level: level,
      is_native: level === "native",
      can_host: false,
      can_sell: false,
      can_translate: false,
      can_teach: false,
      display_order: i,
    };
  });
}

// ── Field values ────────────────────────────────────────────────────────────

export type FieldDef = {
  id: string;
  field_key: string;
  kind: string;
  options: unknown;
  is_sensitive: boolean;
  deprecated_at: string | null;
  validation_rules?: { min?: number; max?: number } | null;
};

export type PlannedValue = { fieldKey: string; value: unknown };
export type FieldPlan = {
  values: PlannedValue[];
  /** Every key this seeder owns for the demo: rows outside the plan are removed on re-run. */
  managedKeys: string[];
  skipped: { key: string; reason: string }[];
  /** Keys the demo needs whose definition is missing from profile_field_definitions. */
  missingDefs: string[];
  heightCm: number | null;
};

export const UNIVERSAL_FIELD_KEYS = [
  "identity.pronouns",
  "identity.gender",
  "identity.ageDisplayMode",
  "identity.response_time",
  "identity.tagline",
  "about.bioTone",
  "bios",
  "logistics.passportStatus",
  "logistics.driversLicense",
  "logistics.workEligibility",
  "limits",
] as const;

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string" && v.trim() === "") return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

function optionList(def: FieldDef): string[] | null {
  return Array.isArray(def.options) && def.options.length ? def.options.map((o) => String(o)) : null;
}

/** Coerce one raw value to what the engine stores for this kind; null with a reason to skip. */
export function coerceFieldValue(def: FieldDef, raw: unknown): { value: unknown } | { skip: string } {
  if (isEmpty(raw)) return { skip: "empty" };
  const options = optionList(def);
  switch (def.kind) {
    case "text":
    case "textarea":
    case "date":
      return typeof raw === "string" ? { value: raw.trim() } : { skip: `expected text, got ${typeof raw}` };
    case "number": {
      const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
      if (!Number.isFinite(n)) return { skip: "not a number" };
      const r = def.validation_rules;
      if (r && ((typeof r.min === "number" && n < r.min) || (typeof r.max === "number" && n > r.max))) {
        return { skip: "outside the field's min/max" };
      }
      return { value: n };
    }
    case "toggle":
      return typeof raw === "boolean" ? { value: raw } : { skip: "expected true/false" };
    case "select":
      if (typeof raw !== "string") return { skip: "expected one option" };
      if (options && !options.includes(raw)) return { skip: `"${raw}" is not one of the field's options` };
      return { value: raw };
    case "multiselect": {
      const list = Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? [raw] : [];
      const kept = options ? list.filter((x) => options.includes(x)) : list;
      return kept.length ? { value: kept } : { skip: "no value is one of the field's options" };
    }
    case "chips": {
      const list = Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? [raw] : [];
      const cleaned = list.map((x) => x.trim()).filter(Boolean);
      return cleaned.length ? { value: cleaned } : { skip: "empty" };
    }
    default:
      return { skip: `unsupported kind ${def.kind}` };
  }
}

/** The universal values as {fieldKey, raw} before coercion; empties are dropped by the caller. */
export function universalValues(d: FoundationDemo): { fieldKey: string; value: unknown }[] {
  const u = d.universal;
  const bios: { locale: string; text: string }[] = [];
  if (d.bioEn) bios.push({ locale: "en", text: d.bioEn });
  if (d.bio) bios.push({ locale: "es", text: d.bio });
  if (d.defaultLocale === "es") bios.reverse();
  const license = u.driversLicense === null ? null : u.driversLicense ? "standard" : "none";
  return [
    { fieldKey: "identity.pronouns", value: pronounsValue(u.pronouns) },
    { fieldKey: "identity.gender", value: genderLabel(d.gender) },
    { fieldKey: "identity.ageDisplayMode", value: u.ageDisplay },
    { fieldKey: "identity.response_time", value: responseTimeValue(u.responseTime) },
    { fieldKey: "identity.tagline", value: primaryText(d, d.tagline, d.taglineEn) },
    { fieldKey: "about.bioTone", value: bioToneValue(u.bioTone) },
    { fieldKey: "bios", value: bios },
    { fieldKey: "logistics.passportStatus", value: u.passportStatus },
    { fieldKey: "logistics.driversLicense", value: license },
    { fieldKey: "logistics.workEligibility", value: u.workEligibility },
    {
      fieldKey: "limits",
      value: u.restrictions.length ? { hardLimits: u.restrictions, softLimits: [] } : null,
    },
  ];
}

/**
 * Everything that goes into talent_profile_field_values for one demo: the
 * universal values plus the trade fields. Empty values and sensitive fields are
 * skipped; a value the field cannot hold is skipped with a reason, never forced.
 */
export function buildFieldValuePlan(d: FoundationDemo, defs: ReadonlyMap<string, FieldDef>): FieldPlan {
  const values: PlannedValue[] = [];
  const skipped: FieldPlan["skipped"] = [];
  const missingDefs: string[] = [];
  const managed = new Set<string>(UNIVERSAL_FIELD_KEYS);
  let heightCm: number | null = null;

  const put = (fieldKey: string, raw: unknown, sensitiveHint: boolean) => {
    managed.add(fieldKey);
    if (isEmpty(raw)) {
      skipped.push({ key: fieldKey, reason: "empty" });
      return;
    }
    const def = defs.get(fieldKey);
    if (!def) {
      missingDefs.push(fieldKey);
      return;
    }
    if (def.deprecated_at) {
      skipped.push({ key: fieldKey, reason: "field is deprecated" });
      return;
    }
    if (sensitiveHint || def.is_sensitive) {
      skipped.push({ key: fieldKey, reason: "sensitive" });
      return;
    }
    // Bespoke blobs (bios, limits, work eligibility) are stored verbatim.
    const verbatim = fieldKey === "bios" || fieldKey === "limits";
    const c = verbatim ? { value: raw } : coerceFieldValue(def, raw);
    if ("skip" in c) {
      skipped.push({ key: fieldKey, reason: c.skip });
      return;
    }
    values.push({ fieldKey, value: c.value });
    if (fieldKey === "physical.height_cm" && typeof c.value === "number") heightCm = Math.round(c.value);
  };

  for (const { fieldKey, value } of universalValues(d)) put(fieldKey, value, false);
  for (const [key, raw] of Object.entries(d.typeFields)) {
    put(key, raw, d.typeFieldMeta[key]?.sensitive === true);
  }
  return { values, managedKeys: [...managed], skipped, missingDefs, heightCm };
}

// ── Slugs ───────────────────────────────────────────────────────────────────

/** Labels the platform keeps for itself (mirrors platform_subdomain_label_taken). */
export const RESERVED_LABELS: ReadonlySet<string> = new Set([
  "www", "api", "app", "admin", "dashboard", "hub", "auth", "login", "logout", "signin", "signup",
  "register", "account", "billing", "checkout", "support", "help", "docs", "status", "mail", "email",
  "smtp", "ftp", "ns", "ns1", "ns2", "cdn", "assets", "static", "media", "files", "uploads", "img",
  "images", "blog", "press", "jobs", "careers", "about", "legal", "privacy", "terms", "security",
  "marketing", "directory", "discover", "search", "t", "w", "c", "p", "preview", "staging", "stage",
  "dev", "test", "beta", "alpha", "demo", "example", "internal", "platform", "sandbox", "edge",
]);

/** Everything already holding a subdomain label, read once from the database. */
export type SlugNamespace = {
  siteSlugs: Set<string>;
  agencySlugs: Set<string>;
  /** First label of every kind=subdomain agency_domains hostname. */
  domainLabels: Set<string>;
  /** Unexpired saas_subdomain_reservations. */
  reservations: Set<string>;
  /** talent_profiles.public_slug_part. */
  publicSlugParts: Set<string>;
};

export function emptyNamespace(): SlugNamespace {
  return {
    siteSlugs: new Set(),
    agencySlugs: new Set(),
    domainLabels: new Set(),
    reservations: new Set(),
    publicSlugParts: new Set(),
  };
}

export function isLabelTaken(ns: SlugNamespace, label: string): boolean {
  const l = label.trim().toLowerCase();
  return (
    RESERVED_LABELS.has(l) ||
    ns.siteSlugs.has(l) ||
    ns.agencySlugs.has(l) ||
    ns.domainLabels.has(l) ||
    ns.reservations.has(l) ||
    ns.publicSlugParts.has(l)
  );
}

/** ascii first-last, hyphenated, "-2" on collision; the chosen slug is reserved in `ns`. */
export function chooseSiteSlug(d: Pick<FoundationDemo, "firstName" | "lastName" | "profileCode">, ns: SlugNamespace): string {
  const slug = deriveSiteSlug(`${d.firstName} ${d.lastName}`.trim(), d.profileCode, [], (s) => isLabelTaken(ns, s));
  ns.siteSlugs.add(slug);
  return slug;
}

// ── Completeness ────────────────────────────────────────────────────────────

/**
 * The drawer score the workbook predicts (build.py "Completeness" rules):
 * sixteen checks, three of them free constants, four never met by a demo
 * (Tarifas, Creditos, Archivos, Clientes anteriores).
 */
export function predictCompleteness(d: FoundationDemo): { score: number; total: 16; unmet: string[]; label: string } {
  const u = d.universal;
  const checks: Record<string, boolean> = {
    Identidad: !!(u.pronouns && d.gender),
    Servicios: !!d.talentTypeSlug,
    Ubicacion: !!u.homeBase,
    Logistica: !!(u.passportStatus || u.driversLicense !== null || u.workEligibility.length),
    Media: d.mediaPlan.gallery.length >= 3,
    Albumes: d.mediaPlan.albums.length > 0,
    "Acerca de": (u.bioEn ?? "").length >= 30,
    Tarifas: false,
    Disponibilidad: !!(d.hours || u.availabilityNoteEs),
    Creditos: false,
    Restricciones: u.restrictions.length > 0,
    Archivos: false,
    "Clientes anteriores": false,
    Confianza: true,
    "Campos de agencia": true,
    Admin: true,
  };
  const score = Object.values(checks).filter(Boolean).length;
  return {
    score,
    total: 16,
    unmet: Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k),
    label: `${score}/16`,
  };
}

// ── Row counts (dry-run) ────────────────────────────────────────────────────

export type PlannedCounts = Record<string, number>;

/** What a real run would write for one demo, by table. Live demos never touch site, service areas or roster. */
export function plannedCounts(
  d: FoundationDemo,
  fieldPlan: FieldPlan,
  opts: { offerings: number; languages: number; hasHours: boolean; siteExists: boolean; serviceAreas: number; rosterExists: boolean },
): PlannedCounts {
  const newSite = !d.isLive && !opts.siteExists;
  return {
    "auth.users (create/update + password)": 1,
    profiles: 1,
    talent_profiles: 1,
    talent_profile_taxonomy: 1,
    talent_offerings: opts.offerings,
    talent_profile_field_values: fieldPlan.values.length,
    talent_languages: opts.languages,
    talent_booking_hours: opts.hasHours ? 1 : 0,
    talent_service_areas: d.isLive ? 0 : opts.serviceAreas,
    agency_talent_roster: d.isLive || opts.rosterExists ? 0 : 1,
    talent_sites: newSite ? 1 : 0,
    talent_pages: newSite ? 1 : 0,
  };
}
