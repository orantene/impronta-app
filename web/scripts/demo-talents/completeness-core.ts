/**
 * Completeness audit for the 224 Demo Foundation talents (read-only) and the
 * shared pieces the class fixer needs. Every check compares the database with
 * what the workbook says (foundation-load.ts) and with what the product itself
 * counts (the drawer's N/16, the publish gate), so a "0 gaps" result means the
 * talent sees a finished profile, not just that the seeder ran.
 *
 * Gap codes are stable strings. `media.*` and `off.photo_missing` belong to the
 * photos lane; everything else is fixable by fix-completeness.mts.
 *
 * Nothing here writes. Callers pass a client; the audit CLI hands it a
 * read-only proxy.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEMO_CODE_RE } from "./demo-identity";
import { LIVE_DEMO_CODES, type FoundationDemo, type SiteLocale } from "./foundation-load";
import {
  buildFieldValuePlan,
  buildLanguageRows,
  buildOfferingRows,
  deriveHours,
  primaryText,
  type FieldDef,
} from "./foundation-plan";
import { findLocationId, selectAll, type LocationIndex } from "./foundation-seed-core";

type Admin = SupabaseClient;
type Row = Record<string, unknown>;

/** Themes whose site template has an FAQ section (theme designer, 2026-09-29). Maison v2 shares the Maison roster. */
export const FAQ_THEMES: ReadonlySet<string> = new Set(["maison", "maison-v2", "ledger", "route", "nest"]);

/** Themes that already have a Design row in talent_theme_catalog; the rest are "under construction". */
export const DESIGN_BY_THEME: Readonly<Record<string, string>> = {
  maison: "maison",
  "maison-v2": "maison-v2",
  folio: "folio",
  solace: "solace",
  mono: "mono",
  frame: "frame",
};

/** FVS keys the audit reads. */
export const AUDIT_FIELD_KEYS = [
  "identity.pronouns",
  "identity.gender",
  "identity.tagline",
  "bios",
  "limits",
  "albums.list",
  "logistics.passportStatus",
  "logistics.driversLicense",
  "logistics.workEligibility",
  "credits",
  "reviews",
  "documents",
  "social_proof",
  "rates.cards",
] as const;

/** Values the demos must never carry (left empty on purpose). */
const FORBIDDEN_KEYS = ["credits", "reviews", "documents", "social_proof"] as const;

export const isPhotoGap = (code: string): boolean => code.startsWith("media.") || code === "off.photo_missing";

function chunk<T>(xs: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** The few filter methods the audit adds to a paged query (kept structural so the Supabase generics stay out of the way). */
type Q = {
  eq(col: string, v: unknown): Q;
  in(col: string, v: unknown[]): Q;
  is(col: string, v: null): Q;
};
type Paged<T> = { range(a: number, b: number): PromiseLike<{ data: T[] | null; error: { message: string } | null }> };

async function fetchIn<T extends Row>(
  admin: Admin,
  table: string,
  select: string,
  col: string,
  ids: readonly string[],
  extra?: (q: Q) => Q,
  size = 60,
): Promise<T[]> {
  const out: T[] = [];
  for (const part of chunk(ids, size)) {
    const rows = await selectAll<T>((a, b) => {
      let q = admin.from(table).select(select).in(col, part) as unknown as Q;
      if (extra) q = extra(q);
      return (q as unknown as Paged<T>).range(a, b);
    }, table);
    out.push(...rows);
  }
  return out;
}

export type ProfileRow = {
  id: string;
  profile_code: string;
  is_demo: boolean | null;
  display_name: string | null;
  short_bio: string | null;
  bio_i18n: Record<string, string> | null;
  preferred_locale: string | null;
  secondary_locales: string[] | null;
  home_city_text: string | null;
  location_id: string | null;
  gender: string | null;
  availability_data: { cells?: unknown[] } | null;
  default_currency: string | null;
};

export type OfferingDb = {
  id: string;
  talent_profile_id: string;
  title: string | null;
  description: string | null;
  title_i18n: Record<string, string> | null;
  description_i18n: Record<string, string> | null;
  category: string | null;
  category_i18n: Record<string, string> | null;
  price_display: string | null;
  amount_cents: number | null;
  currency: string | null;
  duration_minutes: number | null;
  booking_mode: string | null;
  sort_order: number;
};

export type FaqDb = {
  id: string;
  talent_profile_id: string;
  question: string;
  answer: string;
  status: string;
  sort_order: number;
  question_i18n: Record<string, string> | null;
  answer_i18n: Record<string, string> | null;
};

export type AuditData = {
  profiles: Map<string, ProfileRow>; // by profile_code
  primaryTermByProfile: Map<string, string>; // profile id -> term id
  areas: Map<string, Row[]>;
  languages: Map<string, Row[]>;
  offerings: Map<string, OfferingDb[]>;
  offeringPhotoLinks: Map<string, number>; // offering id -> link count
  hours: Map<string, Row>;
  sites: Map<string, Row>;
  media: Map<string, Row[]>;
  fvs: Map<string, Map<string, unknown>>; // profile id -> field_key -> value
  fvsCount: Map<string, number>; // profile id -> managed FVS rows
  faqs: Map<string, FaqDb[]>;
  designSlugs: Set<string>;
};

export type LoadContext = {
  admin: Admin;
  demos: FoundationDemo[];
  termIds: Map<string, string>;
  fieldDefs: Map<string, FieldDef>;
  locations: LocationIndex;
};

/** Read everything the checks need, in bulk, for the given demos. */
export async function loadAuditData(ctx: LoadContext): Promise<AuditData> {
  const { admin } = ctx;
  const codes = ctx.demos.map((d) => d.profileCode);
  const profiles = new Map<string, ProfileRow>();
  for (const r of await fetchIn<ProfileRow>(
    admin,
    "talent_profiles",
    "id, profile_code, is_demo, display_name, short_bio, bio_i18n, preferred_locale, secondary_locales, home_city_text, location_id, gender, availability_data, default_currency",
    "profile_code",
    codes,
    undefined,
    100,
  )) {
    profiles.set(r.profile_code, r);
  }
  const ids = [...profiles.values()].map((p) => p.id);

  const primaryTermByProfile = new Map<string, string>();
  for (const r of await fetchIn<{ talent_profile_id: string; taxonomy_term_id: string }>(
    admin,
    "talent_profile_taxonomy",
    "talent_profile_id, taxonomy_term_id, relationship_type",
    "talent_profile_id",
    ids,
    (q) => q.eq("relationship_type", "primary_role"),
  )) {
    primaryTermByProfile.set(r.talent_profile_id, r.taxonomy_term_id);
  }

  const group = <T extends Row>(rows: T[], key: string): Map<string, T[]> => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const k = String(r[key]);
      const arr = m.get(k) ?? [];
      arr.push(r);
      m.set(k, arr);
    }
    return m;
  };

  const areas = group(
    await fetchIn<Row>(admin, "talent_service_areas", "talent_profile_id, location_id, service_kind, notes", "talent_profile_id", ids),
    "talent_profile_id",
  );
  const languages = group(
    await fetchIn<Row>(admin, "talent_languages", "talent_profile_id, language_code", "talent_profile_id", ids),
    "talent_profile_id",
  );
  const offeringRows = await fetchIn<OfferingDb>(
    admin,
    "talent_offerings",
    "id, talent_profile_id, title, description, title_i18n, description_i18n, category, category_i18n, price_display, amount_cents, currency, duration_minutes, booking_mode, sort_order",
    "talent_profile_id",
    ids,
  );
  const offerings = group(offeringRows, "talent_profile_id") as Map<string, OfferingDb[]>;
  for (const list of offerings.values()) list.sort((a, b) => a.sort_order - b.sort_order);

  const offeringPhotoLinks = new Map<string, number>();
  for (const r of await fetchIn<{ offering_id: string }>(
    admin,
    "talent_offering_media",
    "offering_id",
    "offering_id",
    offeringRows.map((o) => o.id),
  )) {
    offeringPhotoLinks.set(r.offering_id, (offeringPhotoLinks.get(r.offering_id) ?? 0) + 1);
  }

  const hours = new Map<string, Row>();
  for (const r of await fetchIn<Row>(admin, "talent_booking_hours", "talent_profile_id, weekly", "talent_profile_id", ids)) {
    hours.set(String(r.talent_profile_id), r);
  }
  const sites = new Map<string, Row>();
  for (const r of await fetchIn<Row>(
    admin,
    "talent_sites",
    "talent_profile_id, status, site_slug, site_published_at, theme_design_slug",
    "talent_profile_id",
    ids,
  )) {
    sites.set(String(r.talent_profile_id), r);
  }
  const media = group(
    await fetchIn<Row>(
      admin,
      "media_assets",
      "owner_talent_profile_id, variant_kind, approval_state",
      "owner_talent_profile_id",
      ids,
      (q) => q.is("deleted_at", null),
    ),
    "owner_talent_profile_id",
  );

  const keyById = new Map<string, string>();
  const defIds: string[] = [];
  for (const k of AUDIT_FIELD_KEYS) {
    const def = ctx.fieldDefs.get(k);
    if (def) {
      keyById.set(def.id, k);
      defIds.push(def.id);
    }
  }
  const fvs = new Map<string, Map<string, unknown>>();
  for (const r of await fetchIn<{ talent_profile_id: string; field_definition_id: string; value: unknown }>(
    admin,
    "talent_profile_field_values",
    "talent_profile_id, field_definition_id, value",
    "talent_profile_id",
    ids,
    (q) => q.in("field_definition_id", defIds),
    40,
  )) {
    const key = keyById.get(r.field_definition_id);
    if (!key) continue;
    const m = fvs.get(r.talent_profile_id) ?? new Map<string, unknown>();
    m.set(key, r.value);
    fvs.set(r.talent_profile_id, m);
  }

  // Count of every planned field value present, by profile (trade fields included).
  const fvsCount = new Map<string, number>();
  const plannedIds = new Set<string>();
  for (const d of ctx.demos) {
    if (d.isLive) continue;
    for (const v of buildFieldValuePlan(d, ctx.fieldDefs).values) {
      const def = ctx.fieldDefs.get(v.fieldKey);
      if (def) plannedIds.add(def.id);
    }
  }
  for (const r of await fetchIn<{ talent_profile_id: string }>(
    admin,
    "talent_profile_field_values",
    "talent_profile_id, field_definition_id",
    "talent_profile_id",
    ids,
    (q) => q.in("field_definition_id", [...plannedIds]),
    15,
  )) {
    fvsCount.set(r.talent_profile_id, (fvsCount.get(r.talent_profile_id) ?? 0) + 1);
  }

  const faqs = group(
    await fetchIn<FaqDb>(
      admin,
      "talent_faq_items",
      "id, talent_profile_id, question, answer, status, sort_order, question_i18n, answer_i18n",
      "talent_profile_id",
      ids,
    ),
    "talent_profile_id",
  ) as Map<string, FaqDb[]>;
  for (const list of faqs.values()) list.sort((a, b) => a.sort_order - b.sort_order);

  const designs = await selectAll<{ slug: string }>(
    (a, b) => admin.from("talent_theme_catalog").select("slug").eq("kind", "design").range(a, b),
    "talent_theme_catalog",
  );

  return {
    profiles,
    primaryTermByProfile,
    areas,
    languages,
    offerings,
    offeringPhotoLinks,
    hours,
    sites,
    media,
    fvs,
    fvsCount,
    faqs,
    designSlugs: new Set(designs.map((d) => d.slug)),
  };
}

// ── The drawer's N/16 ───────────────────────────────────────────────────────

export const DRAWER_ITEMS = [
  "Identidad",
  "Servicios",
  "Ubicacion",
  "Logistica",
  "Media",
  "Albumes",
  "Acerca de",
  "Tarifas",
  "Disponibilidad",
  "Creditos",
  "Restricciones",
  "Archivos",
  "Clientes anteriores",
  "Confianza",
  "Campos de agencia",
  "Admin",
] as const;

const nonEmpty = (v: unknown): boolean => {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  return true;
};

type BioEntry = { locale?: string; text?: string };

/** The drawer's "Acerca de": the EN bios entry has at least 30 characters. */
function drawerBioOk(v: unknown): boolean {
  if (!Array.isArray(v)) return false;
  const en = (v as BioEntry[]).find((b) => b?.locale === "en");
  return (en?.text ?? "").trim().length >= 30;
}

function limitsOk(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const o = v as { hardLimits?: unknown[]; softLimits?: unknown[] };
  return (o.hardLimits?.length ?? 0) + (o.softLimits?.length ?? 0) > 0;
}

/**
 * The 16 sections the talent's drawer counts (TalentProfileShellDrawer
 * sectionComplete), computed from the rows the drawer loads. Confianza, Campos
 * de agencia and Admin are constants that always tick; Tarifas, Creditos,
 * Archivos and Clientes anteriores stay empty on purpose, so the ceiling for a
 * demo is 12/16.
 */
export function drawerScore(p: ProfileRow, data: AuditData, hasPrimary: boolean): { score: number; unmet: string[] } {
  const fv = data.fvs.get(p.id) ?? new Map<string, unknown>();
  const media = data.media.get(p.id) ?? [];
  const gallery = media.filter((m) => m.variant_kind === "gallery").length;
  const albumsList = fv.get("albums.list");
  const checks: Record<(typeof DRAWER_ITEMS)[number], boolean> = {
    Identidad: nonEmpty(fv.get("identity.pronouns")) || nonEmpty(p.gender),
    Servicios: hasPrimary,
    Ubicacion: nonEmpty(p.home_city_text),
    Logistica:
      nonEmpty(fv.get("logistics.passportStatus")) ||
      nonEmpty(fv.get("logistics.driversLicense")) ||
      nonEmpty(fv.get("logistics.workEligibility")),
    Media: gallery >= 3,
    Albumes: (Array.isArray(albumsList) && albumsList.length > 1) || gallery > 0,
    "Acerca de": drawerBioOk(fv.get("bios")),
    Tarifas: false,
    Disponibilidad: (p.availability_data?.cells?.length ?? 0) > 0,
    Creditos: nonEmpty(fv.get("credits")),
    Restricciones: limitsOk(fv.get("limits")),
    Archivos: nonEmpty(fv.get("documents")),
    "Clientes anteriores": nonEmpty(fv.get("social_proof")),
    Confianza: true,
    "Campos de agencia": true,
    Admin: true,
  };
  const unmet = DRAWER_ITEMS.filter((k) => !checks[k]);
  return { score: DRAWER_ITEMS.length - unmet.length, unmet };
}

// ── Text helpers shared with the fixer ──────────────────────────────────────

const has = (m: Record<string, string> | null | undefined, k: string): boolean => typeof m?.[k] === "string" && m[k].trim() !== "";

/** The planned service that a stored offering corresponds to (same order for new demos; ES title for live ones). */
export function matchService(d: FoundationDemo, o: OfferingDb, index: number): FoundationDemo["services"][number] | null {
  const titles = [o.title_i18n?.es, o.title_i18n?.en, o.title].filter((t): t is string => !!t);
  const byName = d.services.find((s) => titles.includes(s.name) || titles.includes(s.nameEn));
  if (byName) return byName;
  return d.isLive ? null : (d.services[index] ?? null);
}

export function expectedDesign(d: FoundationDemo, designSlugs: ReadonlySet<string>): string | null {
  const slug = DESIGN_BY_THEME[d.theme];
  return slug && designSlugs.has(slug) ? slug : null;
}

export const needsFaq = (d: FoundationDemo): boolean => FAQ_THEMES.has(d.theme);

// ── Per-demo audit ──────────────────────────────────────────────────────────

export type DemoAudit = {
  demo_id: string;
  code: string;
  name: string;
  theme: string;
  country: string;
  city: string;
  live: boolean;
  seeded: boolean;
  default_locale: SiteLocale;
  supported_locales: SiteLocale[];
  score: number | null;
  unmet: string[];
  gaps: string[];
  info: string[];
};

export function auditDemo(d: FoundationDemo, data: AuditData, ctx: Pick<LoadContext, "termIds" | "locations" | "fieldDefs">): DemoAudit {
  const base = {
    demo_id: d.demoId,
    code: d.profileCode,
    name: d.displayName,
    theme: d.theme,
    country: d.country,
    city: d.city,
    live: d.isLive,
    default_locale: d.defaultLocale,
    supported_locales: d.supportedLocales,
  };
  const p = data.profiles.get(d.profileCode);
  if (!p) {
    return { ...base, seeded: false, score: null, unmet: [], gaps: ["not_seeded"], info: [] };
  }
  const gaps: string[] = [];
  const info: string[] = [];
  const gap = (code: string) => gaps.push(code);
  const locales = d.supportedLocales;
  const fv = data.fvs.get(p.id) ?? new Map<string, unknown>();

  if (p.is_demo !== true) gap("id.not_demo");

  // Identity
  if (!d.isLive && p.display_name !== d.displayName) gap("id.name");
  if (!nonEmpty(p.short_bio)) gap("id.tagline_missing");
  if (!nonEmpty(fv.get("identity.tagline"))) gap("id.tagline_fvs_missing");
  for (const l of locales) if (!has(p.bio_i18n, l)) gap(`bio.${l}_missing`);
  if (!d.isLive) {
    if (has(p.bio_i18n, "es") && d.bio && p.bio_i18n?.es !== d.bio) info.push("bio.es_differs_from_workbook");
    if (has(p.bio_i18n, "en") && d.bioEn && p.bio_i18n?.en !== d.bioEn) info.push("bio.en_differs_from_workbook");
  }
  if (!drawerBioOk(fv.get("bios"))) gap("bio.drawer_en_missing");

  // Taxonomy
  const wantTerm = ctx.termIds.get(d.talentTypeSlug);
  const gotTerm = data.primaryTermByProfile.get(p.id);
  if (!gotTerm) gap("tax.primary_missing");
  else if (!d.isLive && wantTerm && gotTerm !== wantTerm) gap("tax.primary_wrong");

  // Place
  const areas = data.areas.get(p.id) ?? [];
  const home = areas.find((a) => a.service_kind === "home_base");
  const wantLoc = findLocationId(ctx.locations, d.city, d.country);
  if (!nonEmpty(p.home_city_text)) gap("loc.city_text_missing");
  else if (!d.isLive && p.home_city_text !== d.city) gap("loc.city_text_differs");
  if (!wantLoc) gap("loc.city_not_in_registry");
  if (!home) gap("loc.service_area_missing");
  else if (wantLoc && home.location_id !== wantLoc) gap("loc.service_area_wrong");
  if (!p.location_id) gap("loc.location_id_missing");
  else if (wantLoc && p.location_id !== wantLoc) gap("loc.location_id_wrong");
  if (d.neighbourhood && home && !nonEmpty(home.notes)) gap("loc.neighbourhood_missing");

  // Languages spoken
  const langs = new Set((data.languages.get(p.id) ?? []).map((l) => String(l.language_code)));
  if (langs.size === 0) gap("lang.missing");
  else if (!d.isLive) {
    const want = buildLanguageRows(d).map((l) => l.language_code);
    if (want.some((c) => !langs.has(c)) || langs.size !== want.length) gap("lang.differs");
  }

  // Site languages
  if (p.preferred_locale !== d.defaultLocale) gap("locale.preferred_mismatch");
  if (JSON.stringify(p.secondary_locales ?? []) !== JSON.stringify(d.supportedLocales.slice(1))) gap("locale.secondary_mismatch");

  // Offerings
  const offs = data.offerings.get(p.id) ?? [];
  if (!d.isLive && offs.length !== 4) gap("off.count");
  if (d.isLive && offs.length === 0) gap("off.count");
  const plan = d.isLive ? null : buildOfferingRows(d, p.id, "", "");
  offs.forEach((o, i) => {
    const s = matchService(d, o, i);
    for (const l of locales) {
      if (!has(o.title_i18n, l)) gap(`off.title_${l}_missing`);
      if (!has(o.description_i18n, l)) gap(`off.description_${l}_missing`);
    }
    if (!nonEmpty(o.category)) gap("off.category_missing");
    for (const l of locales) if (nonEmpty(o.category) && !has(o.category_i18n, l)) gap(`off.category_${l}_missing`);
    const quote = o.price_display === "quote";
    // A price of 0 is a free intro call or casting on purpose (the workbook says so or the live demo curated it); only a null price is a gap.
    if (!quote && typeof o.amount_cents !== "number") gap("off.price_missing");
    if (!quote && o.amount_cents === 0) info.push(`off.free:${o.title ?? o.id}`);
    if (!(typeof o.duration_minutes === "number" && o.duration_minutes > 0) && (s?.durationMin ?? 1) > 0) gap("off.duration_missing");
    if (!nonEmpty(o.booking_mode)) gap("off.mode_missing");
    if (!s) info.push(`off.unmatched:${o.title ?? o.id}`);
    if (plan) {
      const want = plan.rows[i];
      if (
        want &&
        (o.amount_cents !== want.amount_cents ||
          o.booking_mode !== want.booking_mode ||
          o.price_display !== want.price_display ||
          o.currency !== want.currency)
      ) {
        gap("off.differs_from_plan");
      }
    }
    if (!data.offeringPhotoLinks.get(o.id)) gap("off.photo_missing");
  });

  // Hours
  const anyInstant = offs.some((o) => o.booking_mode === "instant");
  const hoursRow = data.hours.get(p.id);
  const weekly = (hoursRow?.weekly ?? {}) as Record<string, unknown[]>;
  const hasHours = Object.values(weekly).some((w) => Array.isArray(w) && w.length > 0);
  if (anyInstant && !hasHours) gap("hours.missing");
  if (!d.isLive && d.hours && !hoursRow) gap("hours.missing_vs_workbook");
  if (!d.isLive && d.hours && (p.availability_data?.cells?.length ?? 0) === 0) gap("hours.calendar_cells_missing");
  if (!d.isLive && d.hours) {
    const want = deriveHours(d, plan?.instantFlags);
    if (want && hoursRow && JSON.stringify(sortKeys(hoursRow.weekly)) !== JSON.stringify(sortKeys(want.weekly))) gap("hours.differs");
  }

  // Media (photos lane)
  const media = data.media.get(p.id) ?? [];
  const approved = media.filter((m) => m.approval_state === "approved");
  const count = (kind: string) => approved.filter((m) => m.variant_kind === kind).length;
  if (count("card") < 1) gap("media.card_missing");
  if (count("hero") < 1) gap("media.hero_missing");
  if (count("gallery") < 4) gap("media.gallery_lt4");
  const albumsList = fv.get("albums.list");
  if (!Array.isArray(albumsList) || albumsList.length === 0) gap("media.albums_list_missing");

  // Site
  const site = data.sites.get(p.id);
  if (!site) gap("site.missing");
  else {
    if (!nonEmpty(site.site_slug)) gap("site.slug_missing");
    if (!d.isLive && (site.status === "published" || site.site_published_at)) gap("site.published");
    const design = expectedDesign(d, data.designSlugs);
    if (design && site.theme_design_slug !== design) gap("site.design_missing");
    if (!design) info.push(`site.design_pending_theme:${d.theme}`);
  }

  // FAQ
  if (needsFaq(d)) {
    const faqs = data.faqs.get(p.id) ?? [];
    if (faqs.length < 3) gap("faq.missing");
    for (const l of locales) {
      if (faqs.some((f) => !has(f.question_i18n, l) || !has(f.answer_i18n, l))) gap(`faq.${l}_missing`);
    }
  }

  // Trade fields and forbidden claims
  if (!d.isLive) {
    const planned = buildFieldValuePlan(d, ctx.fieldDefs).values.length;
    if ((data.fvsCount.get(p.id) ?? 0) < planned) gap("fields.missing");
  }
  for (const k of FORBIDDEN_KEYS) if (nonEmpty(fv.get(k))) gap(`forbidden.${k}`);

  const dr = drawerScore(p, data, !!gotTerm);
  // Every drawer item a demo can reach must tick; the four left empty on purpose never do.
  const onPurpose = new Set(["Tarifas", "Creditos", "Archivos", "Clientes anteriores"]);
  for (const item of dr.unmet) {
    if (onPurpose.has(item)) continue;
    gap(item === "Media" || item === "Albumes" ? `media.dash_${item.toLowerCase()}` : `dash.${item}`);
  }
  return { ...base, seeded: true, score: dr.score, unmet: dr.unmet, gaps: [...new Set(gaps)], info };
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v as Row)
        .sort()
        .map((k) => [k, sortKeys((v as Row)[k])]),
    );
  }
  return v;
}

// ── Summary ─────────────────────────────────────────────────────────────────

export type AuditSummary = {
  total: number;
  seeded: number;
  histogram: Record<string, number>;
  gapCounts: Record<string, number>;
  nonPhotoGapDemos: number;
  worst: { code: string; name: string; score: number | null; gaps: number; nonPhoto: number }[];
};

export function summarize(rows: DemoAudit[]): AuditSummary {
  const seededRows = rows.filter((r) => r.seeded);
  const histogram: Record<string, number> = {};
  const gapCounts: Record<string, number> = {};
  for (const r of seededRows) {
    const k = `${r.score}/16`;
    histogram[k] = (histogram[k] ?? 0) + 1;
  }
  for (const r of rows) for (const g of r.gaps) gapCounts[g] = (gapCounts[g] ?? 0) + 1;
  const worst = [...seededRows]
    .map((r) => ({
      code: r.code,
      name: r.name,
      score: r.score,
      gaps: r.gaps.length,
      nonPhoto: r.gaps.filter((g) => !isPhotoGap(g)).length,
    }))
    .sort((a, b) => b.nonPhoto - a.nonPhoto || b.gaps - a.gaps || (a.score ?? 0) - (b.score ?? 0))
    .slice(0, 10);
  return {
    total: rows.length,
    seeded: seededRows.length,
    histogram: Object.fromEntries(Object.entries(histogram).sort(([a], [b]) => Number.parseInt(a, 10) - Number.parseInt(b, 10))),
    gapCounts: Object.fromEntries(Object.entries(gapCounts).sort(([, a], [, b]) => b - a)),
    nonPhotoGapDemos: rows.filter((r) => r.gaps.some((g) => !isPhotoGap(g))).length,
    worst,
  };
}

export function isDemoCode(code: string): boolean {
  return DEMO_CODE_RE.test(code) || Object.values(LIVE_DEMO_CODES).includes(code);
}

export { primaryText };
