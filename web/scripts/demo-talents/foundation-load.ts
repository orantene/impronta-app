/**
 * Reads the Demo Foundation JSON sources into one manifest of demos. No demo is
 * typed by hand: identity, services and hours come from out/batch-*.json, the
 * full profile fields from fields-out/batch-*.json, field metadata from
 * demo-type-fields.json, the 10 live accounts from live-accounts-export.json,
 * the emails from the out files themselves, and the design name from foundation.json.
 *
 * The shape follows demos.ts (`DemoTalent`): profileCode, email, displayName,
 * siteSlug, city, serviceCategorySlug, talentTypeSlug, theme, tagline, bio,
 * services, hours. It adds what the foundation carries beyond that.
 *
 * Pure file reads, no network, no database.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertDemoIdentity } from "./demo-identity";

/**
 * The 10 demos already live in production (build.py line 26). They keep their
 * @impronta.test emails, TAL codes, photos, themes and published sites.
 */
export const LIVE_DEMO_CODES: Readonly<Record<string, string>> = {
  DEMO044: "TAL-93001",
  DEMO002: "TAL-93002",
  DEMO001: "TAL-93003",
  DEMO008: "TAL-93004",
  DEMO037: "TAL-93005",
  DEMO092: "TAL-93006",
  DEMO095: "TAL-93007",
  DEMO085: "TAL-93008",
  DEMO050: "TAL-93009",
  DEMO029: "TAL-93010",
};

export type FoundationMode = "instant" | "request" | "quote";
export type FoundationPriceDisplay = "exact" | "from" | "quote";
export type FoundationUnit = "session" | "hour" | "event" | "person" | "package" | "project" | "day";

export type FoundationCurrency = "MXN" | "USD";

export type FoundationService = {
  name: string;
  description: string;
  /** English text; falls back to the Spanish text when the file has none. */
  nameEn: string;
  descriptionEn: string;
  category: string;
  /** Present only when the file carries an English category. */
  categoryEn: string | null;
  mode: FoundationMode;
  /** The demo's talent currency. The engine prices in MXN or USD only. */
  currency: FoundationCurrency;
  /** Price in `currency` (the old files call this price_mxn). */
  price: number;
  /** Argentina only: realistic local price in ARS, informational. */
  priceArsReference: number | null;
  priceDisplay: FoundationPriceDisplay;
  pricingUnit: FoundationUnit;
  durationMin: number | null;
  prepMin: number;
  cleanupMin: number;
  noticeHours: number;
  location: string;
};

export type FoundationHours = {
  days: number[];
  startMin: number;
  endMin: number;
  timezone: string;
};

export type FoundationUniversal = {
  pronouns: string | null;
  dob: string | null;
  ageDisplay: string | null;
  nationality: string | null;
  homeCountry: string | null;
  responseTime: string | null;
  bioEn: string | null;
  bioTone: string | null;
  personality: string[];
  languages: string[];
  homeBase: string | null;
  travelTo: string[];
  travelRadiusKm: number | null;
  travelFeeRequired: boolean | null;
  remoteOnly: boolean | null;
  passportStatus: string | null;
  driversLicense: boolean | null;
  workEligibility: string[];
  availabilityNoteEs: string | null;
  restrictions: string[];
};

export type FoundationFieldMeta = {
  key: string;
  label: string | null;
  kind: string;
  options: string[] | null;
  sensitive: boolean;
};

export type SiteLocale = "en" | "es";

export type SiteLanguage = { defaultLocale: SiteLocale; supportedLocales: SiteLocale[]; forced: boolean };

/**
 * Validate one site-languages.json entry: every value is en or es, at least
 * one is supported, and the default comes first. Spoken languages play no part:
 * a demo who does not speak English can still list en.
 */
export function parseSiteLanguage(id: string, e: { default_locale?: unknown; supported_locales?: unknown; forced?: unknown }): SiteLanguage {
  const ok = (v: unknown): v is SiteLocale => v === "en" || v === "es";
  const def = e.default_locale;
  const sup = e.supported_locales;
  if (!ok(def)) throw new Error(`${id}: default_locale must be "en" or "es"`);
  if (!Array.isArray(sup) || sup.length === 0 || sup.length > 2 || !sup.every(ok)) {
    throw new Error(`${id}: supported_locales must list "en" and/or "es" (at most two)`);
  }
  if (new Set(sup).size !== sup.length) throw new Error(`${id}: supported_locales has a duplicate`);
  if (sup[0] !== def) throw new Error(`${id}: default_locale ${def} must be first in supported_locales`);
  return { defaultLocale: def, supportedLocales: sup as SiteLocale[], forced: e.forced === true };
}

export type FoundationCountry = "MX" | "US" | "AR";

export type FoundationDemo = {
  demoId: string;
  /** TAL-93xxx. Live demos keep their own code. */
  profileCode: string;
  email: string;
  isLive: boolean;
  displayName: string;
  firstName: string;
  lastName: string;
  /** "female" | "male" | "nonbinary" as written in the batch files. */
  gender: string;
  age: number | null;
  /** ISO country of the demo (MX when the file has none). */
  country: FoundationCountry;
  /** The language the profile is written in first ("es" | "en"). New demos: the site language. */
  localePrimary: "es" | "en";
  /** Site and dashboard language (site-languages.json; else locale_primary). */
  defaultLocale: SiteLocale;
  /** Main language first, then the optional second one shown in the ES|EN switch. */
  supportedLocales: SiteLocale[];
  city: string;
  neighbourhood: string | null;
  state: string | null;
  languages: string[];
  /** Live demos keep their published slug; new demos get one at seed time. */
  siteSlug: string;
  serviceCategorySlug: string;
  talentTypeSlug: string;
  taxonomyPending: boolean;
  /** Design name from the workbook's "Primary theme" column (lower-cased). */
  theme: string;
  tagline: string;
  taglineEn: string | null;
  /** Spanish bio (bio_es). */
  bio: string;
  /** English bio (out file bio_en, else fields-out universal.bio_en). */
  bioEn: string | null;
  services: FoundationService[];
  hours: FoundationHours | null;
  photoBriefEs: string | null;
  universal: FoundationUniversal;
  /** field_key to value, exactly as written in fields-out (may hold empties). */
  typeFields: Record<string, unknown>;
  typeFieldMeta: Record<string, FoundationFieldMeta>;
  mediaPlan: { gallery: string[]; albums: { title_es: string; shots: number }[] };
};

export type LoadOptions = {
  /** Folder holding out/, fields-out/, foundation.json, ... */
  dir?: string;
  /** Sub-folder names (default "out" and "fields-out"; the localized files replace these in place). */
  outDir?: string;
  fieldsDir?: string;
};

export const DEFAULT_FOUNDATION_DIR = path.join(os.homedir(), "Desktop/tulala-exports/demo-foundation");

type Json = Record<string, unknown>;

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function readBatches(dir: string, sub: string): Json[] {
  const folder = path.join(dir, sub);
  const files = fs
    .readdirSync(folder)
    .filter((f) => /^batch-\d+\.json$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  return files.flatMap((f) => readJson<Json[]>(path.join(folder, f)));
}

/** "10:00" to minutes since midnight. */
export function hhmmToMin(v: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) throw new Error(`bad time ${v}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * New demos: TAL-93${100+n} where n is the numeric part of DEMO###. Live demos
 * keep the code they already have. Guarded against the demo range.
 */
export function codeForDemoId(demoId: string): string {
  const live = LIVE_DEMO_CODES[demoId];
  if (live) return live;
  const m = /^DEMO(\d{3})$/.exec(demoId);
  if (!m) throw new Error(`unexpected demo id ${demoId}`);
  const n = Number(m[1]);
  if (n < 1 || n > 224) throw new Error(`demo number out of range: ${demoId}`);
  const code = `TAL-93${100 + n}`;
  if (!/^TAL-93\d{3}$/.test(code)) throw new Error(`code ${code} outside the demo range`);
  return code;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}
function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
}
function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function boolOrNull(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function mapService(s: Json): FoundationService {
  const name = String(s.name_es);
  const description = String(s.description_es ?? "");
  return {
    name,
    description,
    nameEn: str(s.name_en) ?? name,
    descriptionEn: str(s.description_en) ?? description,
    category: String(s.category_es ?? ""),
    categoryEn: str(s.category_en),
    mode: s.mode as FoundationMode,
    currency: (str(s.currency)?.toUpperCase() ?? "MXN") as FoundationCurrency,
    price: numOrNull(s.price) ?? numOrNull(s.price_mxn) ?? 0,
    priceArsReference: numOrNull(s.price_ars_reference),
    priceDisplay: s.price_display as FoundationPriceDisplay,
    pricingUnit: s.pricing_unit as FoundationUnit,
    durationMin: numOrNull(s.duration_min),
    prepMin: Number(s.prep_min ?? 0),
    cleanupMin: Number(s.cleanup_min ?? 0),
    noticeHours: Number(s.notice_hours ?? 0),
    location: String(s.location ?? "studio"),
  };
}

function mapHours(h: unknown): FoundationHours | null {
  if (!h || typeof h !== "object") return null;
  const o = h as Json;
  const days = Array.isArray(o.days) ? (o.days as number[]) : [];
  if (days.length === 0) return null;
  return {
    days: [...days].sort((a, b) => a - b),
    startMin: hhmmToMin(String(o.start)),
    endMin: hhmmToMin(String(o.end)),
    timezone: String(o.timezone),
  };
}

function mapUniversal(u: Json): FoundationUniversal {
  return {
    pronouns: str(u.pronouns),
    dob: str(u.dob),
    ageDisplay: str(u.age_display),
    nationality: str(u.nationality),
    homeCountry: str(u.home_country),
    responseTime: str(u.response_time),
    bioEn: str(u.bio_en),
    bioTone: str(u.bio_tone),
    personality: strList(u.personality),
    languages: strList(u.languages),
    homeBase: str(u.home_base),
    travelTo: strList(u.travel_to),
    travelRadiusKm: numOrNull(u.travel_radius_km),
    travelFeeRequired: boolOrNull(u.travel_fee_required),
    remoteOnly: boolOrNull(u.remote_only),
    passportStatus: str(u.passport_status),
    driversLicense: boolOrNull(u.drivers_license),
    workEligibility: strList(u.work_eligibility),
    availabilityNoteEs: str(u.availability_note_es),
    restrictions: strList(u.restrictions),
  };
}

type LiveExportEntry = { email: string; profile: { profile_code: string }; site?: { site_slug?: string } | null };

export function loadFoundation(opts: LoadOptions = {}): FoundationDemo[] {
  const dir = opts.dir ?? process.env.DEMO_FOUNDATION_DIR ?? DEFAULT_FOUNDATION_DIR;

  const batches = readBatches(dir, opts.outDir ?? "out");
  const fieldsById = new Map(readBatches(dir, opts.fieldsDir ?? "fields-out").map((f) => [String(f.demo_id), f]));
  const typeFieldMeta = readJson<Record<string, { chain?: string[]; type_fields: Json[] }>>(
    path.join(dir, "demo-type-fields.json"),
  );
  const live = readJson<LiveExportEntry[]>(path.join(dir, "live-accounts-export.json"));
  const liveByCode = new Map(live.map((x) => [x.profile.profile_code, x]));
  const foundation = readJson<{ "Demo Profiles": { rows: Json[] } }>(path.join(dir, "foundation.json")); // theme only
  const workbookRows = new Map(foundation["Demo Profiles"].rows.map((r) => [String(r["Demo ID"]), r]));

  // Optional: without the file every demo is single-language in its locale_primary.
  const langFile = path.join(dir, "site-languages.json");
  const siteLangs = fs.existsSync(langFile)
    ? new Map(readJson<{ demos: { id: string; code?: string; default_locale?: unknown; supported_locales?: unknown; forced?: unknown }[] }>(langFile).demos.map((x) => [x.id, x]))
    : null;

  const out: FoundationDemo[] = [];
  const seenCodes = new Set<string>();
  const seenEmails = new Set<string>();

  for (const b of batches) {
    const demoId = String(b.demo_id);
    const profileCode = codeForDemoId(demoId);
    const isLive = demoId in LIVE_DEMO_CODES;

    // The email lives in the out file (single source of truth). Live demos keep
    // the @impronta.test address they already have; foundation.json's
    // "Proposed email" is no longer read.
    let email = str(b.email);
    let siteSlug = "";
    if (isLive) {
      const l = liveByCode.get(profileCode);
      if (!l) throw new Error(`${demoId}: live account ${profileCode} missing from live-accounts-export.json`);
      if (email && email.toLowerCase() !== l.email.toLowerCase()) {
        throw new Error(`${demoId}: live demo email ${email} differs from the live account (${l.email}); live emails never change`);
      }
      email = email ?? l.email;
      siteSlug = l.site?.site_slug ?? "";
    } else if (!email) {
      throw new Error(`${demoId}: no email in the out file`);
    }
    email = (email as string).toLowerCase();
    assertDemoIdentity({ profileCode, email });
    if (seenCodes.has(profileCode)) throw new Error(`duplicate code ${profileCode}`);
    if (seenEmails.has(email)) throw new Error(`duplicate email ${email}`);
    seenCodes.add(profileCode);
    seenEmails.add(email);

    const f = fieldsById.get(demoId);
    if (!f) throw new Error(`${demoId}: no fields-out entry`);
    const meta = typeFieldMeta[demoId];
    if (!meta) throw new Error(`${demoId}: no demo-type-fields entry`);
    const chain = meta.chain ?? [];
    const serviceCategorySlug = chain[1];
    if (!serviceCategorySlug) throw new Error(`${demoId}: no category group in the taxonomy chain`);

    const metaByKey: Record<string, FoundationFieldMeta> = {};
    for (const t of meta.type_fields) {
      metaByKey[String(t.key)] = {
        key: String(t.key),
        label: str(t.label),
        kind: String(t.kind),
        options: Array.isArray(t.options) ? (t.options as string[]) : null,
        sensitive: t.sensitive === true,
      };
    }

    const media = (f.media_plan ?? {}) as Json;
    const universal = mapUniversal((f.universal ?? {}) as Json);
    const country = (str(b.country)?.toUpperCase() ?? "MX") as FoundationCountry;
    const filePrimary = (str(b.locale_primary) ?? str(b.locale) ?? "es") as "es" | "en";
    let lang: SiteLanguage = { defaultLocale: filePrimary, supportedLocales: [filePrimary], forced: false };
    if (siteLangs) {
      const entry = siteLangs.get(demoId);
      if (!entry) throw new Error(`${demoId}: missing from site-languages.json`);
      if (entry.code && entry.code !== profileCode) throw new Error(`${demoId}: site-languages.json code ${entry.code} differs from ${profileCode}`);
      lang = parseSiteLanguage(demoId, entry);
    }
    // The site language overrides locale_primary for new demos; live demos keep theirs.
    const localePrimary = (isLive ? filePrimary : lang.defaultLocale) as "es" | "en";
    const themeCell = str(workbookRows.get(demoId)?.["Primary theme"]);

    out.push({
      demoId,
      profileCode,
      email,
      isLive,
      displayName: String(b.display_name),
      firstName: String(b.first_name),
      lastName: String(b.last_name ?? ""),
      gender: String(b.gender ?? ""),
      age: numOrNull(b.age),
      country,
      localePrimary,
      defaultLocale: lang.defaultLocale,
      supportedLocales: lang.supportedLocales,
      city: String(b.city),
      neighbourhood: str(b.neighbourhood),
      state: str(b.state),
      languages: strList(b.languages),
      siteSlug,
      serviceCategorySlug,
      talentTypeSlug: String(b.taxonomy_slug),
      taxonomyPending: b.taxonomy_pending === true,
      theme: (themeCell ?? "maison").toLowerCase().replace(/\s+/g, "-"),
      tagline: String(b.tagline_es ?? ""),
      taglineEn: str(b.tagline_en),
      bio: String(b.bio_es ?? ""),
      bioEn: str(b.bio_en) ?? universal.bioEn,
      services: (b.services as Json[]).map(mapService),
      hours: mapHours(b.hours),
      photoBriefEs: str(b.photo_brief_es),
      universal,
      typeFields: (f.type_fields ?? {}) as Record<string, unknown>,
      typeFieldMeta: metaByKey,
      mediaPlan: {
        gallery: strList(media.gallery),
        albums: Array.isArray(media.albums) ? (media.albums as { title_es: string; shots: number }[]) : [],
      },
    });
  }
  return out;
}

/** Filter by --only codes; refuses codes that do not exist in the manifest. */
export function selectDemos(all: FoundationDemo[], only: string[] | undefined): FoundationDemo[] {
  if (!only || only.length === 0) return all;
  const byCode = new Map(all.map((d) => [d.profileCode, d]));
  return only.map((c) => {
    const d = byCode.get(c);
    if (!d) {
      const n = /^TAL-93(\d{3})$/.exec(c);
      const demoId = n ? `DEMO${String(Number(n[1]) - 100).padStart(3, "0")}` : null;
      const live = demoId ? LIVE_DEMO_CODES[demoId] : undefined;
      throw new Error(
        `unknown demo code ${c}` + (live ? ` (${demoId} is a live demo and keeps ${live}; ${c} is never used)` : ""),
      );
    }
    return d;
  });
}
