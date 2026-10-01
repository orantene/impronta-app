/**
 * TEMPLATE FACTORY, goal #6: the PURE half of wiring a reference demo's content
 * fixture into the database. Given the canonical fixture (design-references/
 * <design>/content.json) and the rows a demo has now, these functions return the
 * exact writes needed (insert / update / archive). An identical rerun plans zero
 * ops, which is what makes the rebuild idempotent. No I/O here.
 *
 * `mockupOnly` is never read: no planned write can carry it (see `planHasMockupOnly`).
 */
import { sameStable } from "./stable";
import type { FixtureService } from "./content-fixture";
import type { DemoContentFixture as MockupFixture } from "./content-fixture";
import type { HeroFacts } from "./hero-facts";
import type { DemoLocation } from "./location";

type Row = Record<string, unknown>;

/** Tables the reference content step can write. The backup snapshot and the restore cover every one. */
export const CONTENT_WRITE_TABLES = [
  "talent_offerings",
  "talent_offering_media",
  "talent_offering_variants",
  "talent_offering_addons",
  "talent_faq_items",
  "talent_profile_field_values",
  "talent_languages",
  "talent_location_settings",
  "talent_profiles",
] as const;
export type ContentTable = (typeof CONTENT_WRITE_TABLES)[number];

/** Profile field keys the reference content step writes. */
export const CONTENT_FIELD_KEYS = [
  "identity.headline",
  "identity.tagline",
  "experience.years_total",
  "physical.height_cm",
] as const;

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const same = (a: unknown, b: unknown) => sameStable(a ?? null, b ?? null);

/** Only keys whose value differs from `have`. */
function diff(want: Row, have: Row | null): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(want)) {
    const cur = k.endsWith("_cents") || k === "sort_order" || k === "duration_minutes" || k === "deposit_pct" ? num(have?.[k]) : (have?.[k] ?? null);
    if (!same(cur, v ?? null)) out[k] = v;
  }
  return out;
}

// ── offerings ────────────────────────────────────────────────────────────────

export interface ExistingOffering extends Row {
  id: string;
  title: string;
  status: string;
  sort_order: number;
  variants: Row[];
  addons: Row[];
}

export interface ChildOps {
  insert: Row[];
  update: Array<{ id: string; patch: Row }>;
  delete: string[];
}

export type OfferingOp =
  | { op: "insert"; row: Row; variants: Row[]; addons: Row[] }
  | { op: "update"; id: string; patch: Row; variants: ChildOps; addons: ChildOps }
  | { op: "archive"; id: string };

const noChildOps = (c: ChildOps) => !c.insert.length && !c.update.length && !c.delete.length;

function bookingMode(s: FixtureService): "request" | "instant" | "inquiry" {
  return s.mode === "quote" || s.mode === "inquiry" ? "inquiry" : s.mode;
}

/** The managed columns one fixture service must hold. `have` keeps what the fixture does not speak to. */
export function desiredOffering(s: FixtureService, index: number, f: MockupFixture, have: Row | null): Row {
  const mode = bookingMode(s);
  const quote = s.priceAmount === null;
  const instant = mode === "instant";
  const payMode = s.payMode ?? (s.free ? "free" : "free");
  const deposit = instant && payMode === "deposit";
  const priceType = quote ? "custom" : have && have.price_type !== "custom" ? (have.price_type as string) : "flat_package";
  return {
    title: s.name,
    description: s.description,
    title_i18n: { ...((have?.title_i18n as Row | null) ?? {}), es: s.name },
    description_i18n: { ...((have?.description_i18n as Row | null) ?? {}), es: s.description },
    category: s.category,
    category_i18n: { ...((have?.category_i18n as Row | null) ?? {}), es: s.category },
    price_type: priceType,
    price_display: quote ? "quote" : s.priceFrom ? "from" : "exact",
    amount_cents: quote ? null : Math.round((s.priceAmount as number) * 100),
    currency: s.currency,
    booking_mode: mode,
    reserve_mode: instant ? (deposit ? "deposit" : payMode === "full" ? "full" : "free") : ((have?.reserve_mode as string) ?? "free"),
    deposit_pct: deposit ? (f.payment?.depositPercent ?? 25) : instant ? null : num(have?.deposit_pct),
    allow_pay_in_person: true,
    // The fixture's own length; null stays null (never invented).
    duration_minutes: s.durationMinutes,
    status: "published",
    visibility: "public",
    moderation_state: "approved",
    sort_order: index,
  };
}

function desiredVariants(s: FixtureService): Row[] {
  return (s.variants ?? []).map((v, j) => ({
    label: v.label,
    label_i18n: { es: v.label },
    amount_cents: Math.round(((s.priceAmount ?? 0) + v.priceDelta) * 100),
    presentation: { description: v.note },
    sort_order: j,
  }));
}

function desiredAddons(s: FixtureService): Row[] {
  return (s.extras ?? []).map((x, j) => ({
    label: x.label,
    label_i18n: { es: x.label },
    amount_cents: Math.round(x.priceDelta * 100),
    duration_minutes: x.minutesDelta,
    sort_order: j,
  }));
}

/** Match children by sort order; delete extras (variants and addons have no archive state). */
export function planChildren(want: Row[], have: Row[]): ChildOps {
  const bySort = new Map(have.map((r) => [num(r.sort_order), r]));
  const out: ChildOps = { insert: [], update: [], delete: [] };
  for (const w of want) {
    const h = bySort.get(num(w.sort_order)) ?? null;
    if (!h) {
      out.insert.push(w);
      continue;
    }
    const patch: Row = {};
    for (const [k, v] of Object.entries(w)) {
      if (k === "presentation") {
        const cur = ((h.presentation as Row | null) ?? {}).description ?? null;
        if (!same(cur, (v as Row).description)) patch.presentation = { ...((h.presentation as Row | null) ?? {}), ...(v as Row) };
      } else if (k === "label_i18n") {
        if (!same(((h.label_i18n as Row | null) ?? {}).es ?? null, (v as Row).es)) patch.label_i18n = { ...((h.label_i18n as Row | null) ?? {}), ...(v as Row) };
      } else if (!same(k === "amount_cents" || k === "duration_minutes" || k === "sort_order" ? num(h[k]) : h[k], v)) patch[k] = v;
    }
    if (Object.keys(patch).length) out.update.push({ id: h.id as string, patch });
    bySort.delete(num(w.sort_order));
  }
  for (const h of bySort.values()) out.delete.push(h.id as string);
  return out;
}

/** Offerings: match by title, then sort order; insert missing; archive the rest. Pure. */
export function planOfferingOps(f: MockupFixture, existing: ExistingOffering[]): OfferingOp[] {
  const live = existing.filter((o) => o.status !== "archived");
  const gone = existing.filter((o) => o.status === "archived");
  const taken = new Set<string>();
  const matchOf = new Map<number, ExistingOffering>();
  const take = (i: number, o: ExistingOffering | undefined) => {
    if (o && !taken.has(o.id) && !matchOf.has(i)) {
      matchOf.set(i, o);
      taken.add(o.id);
    }
  };
  f.services.forEach((s, i) => take(i, live.find((o) => o.title === s.name && !taken.has(o.id))));
  f.services.forEach((s, i) => take(i, gone.find((o) => o.title === s.name && !taken.has(o.id))));
  f.services.forEach((_s, i) => take(i, live.find((o) => !taken.has(o.id) && num(o.sort_order) === i)));

  const ops: OfferingOp[] = [];
  f.services.forEach((s, i) => {
    const have = matchOf.get(i) ?? null;
    const row = desiredOffering(s, i, f, have);
    if (!have) {
      ops.push({ op: "insert", row, variants: desiredVariants(s), addons: desiredAddons(s) });
      return;
    }
    const patch = diff(row, have);
    const variants = planChildren(desiredVariants(s), have.variants);
    const addons = planChildren(desiredAddons(s), have.addons);
    if (Object.keys(patch).length || !noChildOps(variants) || !noChildOps(addons)) {
      ops.push({ op: "update", id: have.id, patch, variants, addons });
    }
  });
  for (const o of live) if (!taken.has(o.id)) ops.push({ op: "archive", id: o.id });
  return ops;
}


// ── faq ──────────────────────────────────────────────────────────────────────

export type FaqOp =
  | { op: "insert"; row: Row }
  | { op: "update"; id: string; patch: Row }
  | { op: "unpublish"; id: string };

/** FAQ items by position; items beyond the fixture are set back to draft (not deleted). */
export function planFaqOps(items: Array<{ q: string; a: string }>, existing: Row[]): FaqOp[] {
  const bySort = new Map(existing.map((r) => [num(r.sort_order), r]));
  const ops: FaqOp[] = [];
  items.forEach((it, i) => {
    const want = { question: it.q, answer: it.a, status: "published", sort_order: i };
    const h = bySort.get(i);
    if (!h) ops.push({ op: "insert", row: want });
    else {
      const patch = diff(want, h);
      if (Object.keys(patch).length) ops.push({ op: "update", id: h.id as string, patch });
    }
    bySort.delete(i);
  });
  for (const h of bySort.values()) if (h.status !== "draft") ops.push({ op: "unpublish", id: h.id as string });
  return ops;
}

// ── profile columns, field values, languages ────────────────────────────────

/** talent_profiles columns the fixture sets (tagline, bio, city display, height mirror). */
export function planProfilePatch(f: MockupFixture, have: Row): Row {
  const want: Row = {
    short_bio: f.talent.tagline,
    bio_i18n: { ...((have.bio_i18n as Row | null) ?? {}), es: f.talent.bio },
    home_city_text: f.talent.city,
  };
  const h = fixtureHeightCm(f);
  if (h !== null) want.height_cm = h;
  const patch: Row = {};
  for (const [k, v] of Object.entries(want)) {
    if (k === "bio_i18n") {
      if (!same(((have.bio_i18n as Row | null) ?? {}).es ?? null, f.talent.bio)) patch[k] = v;
    } else if (!same(k === "height_cm" ? num(have[k]) : have[k], v)) patch[k] = v;
  }
  return patch;
}

/** The comp card's "Estatura cm" as a number, else null. */
export function fixtureHeightCm(f: MockupFixture): number | null {
  const s = f.stats.find((x) => /^estatura/i.test(x.label));
  const n = s ? Number(s.value) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Comp-card stats the profile schema has no field for (reported, not written). */
export function unmappedStats(f: MockupFixture): string[] {
  return f.stats
    .filter((s) => !/^estatura/i.test(s.label) && !/^idiomas/i.test(s.label))
    .map((s) => s.label);
}

export function fieldValuesWanted(f: MockupFixture): Array<[string, unknown]> {
  const out: Array<[string, unknown]> = [];
  if (f.hero.headline) out.push(["identity.headline", f.hero.headline]);
  out.push(["identity.tagline", f.talent.tagline]);
  if (typeof f.talent.yearsOfCraft === "number") out.push(["experience.years_total", f.talent.yearsOfCraft]);
  const h = fixtureHeightCm(f);
  if (h !== null) out.push(["physical.height_cm", h]);
  return out;
}

/** Field values that differ from `have` (key to stored value). */
export function planFieldValues(f: MockupFixture, have: ReadonlyMap<string, unknown>): Array<[string, unknown]> {
  return fieldValuesWanted(f).filter(([k, v]) => !(have.has(k) && same(have.get(k), v)));
}

const LANG: Readonly<Record<string, { code: string; name: string }>> = {
  es: { code: "es", name: "Spanish" },
  español: { code: "es", name: "Spanish" },
  spanish: { code: "es", name: "Spanish" },
  en: { code: "en", name: "English" },
  english: { code: "en", name: "English" },
};

export interface LanguageRow extends Row {
  language_code: string;
  language_name: string;
  speaking_level: string;
  is_native: boolean;
  display_order: number;
}

export function desiredLanguages(f: MockupFixture): LanguageRow[] {
  return f.talent.languages.flatMap((l, i) => {
    const m = LANG[l.trim().toLowerCase()];
    return m
      ? [{ language_code: m.code, language_name: m.name, speaking_level: i === 0 ? "native" : "fluent", is_native: i === 0, display_order: i }]
      : [];
  });
}

export interface LanguagePlan {
  upsert: LanguageRow[];
  remove: string[];
}

export function planLanguages(want: LanguageRow[], have: Row[]): LanguagePlan {
  const byCode = new Map(have.map((r) => [r.language_code as string, r]));
  const upsert = want.filter((w) => {
    const h = byCode.get(w.language_code);
    return !h || !same(num(h.display_order), w.display_order) || !same(h.is_native, w.is_native) || !same(h.speaking_level, w.speaking_level);
  });
  const keep = new Set(want.map((w) => w.language_code));
  return { upsert, remove: have.map((r) => r.language_code as string).filter((c) => !keep.has(c)) };
}

// ── location and hero facts derived from the fixture ────────────────────────

export function fixtureLocation(f: MockupFixture): DemoLocation | undefined {
  const l = f.location;
  if (!l) return undefined;
  const studio = l.studioKind === "home_visits" || l.studioKind === "both" ? l.studioKind : "studio";
  return { addressMode: l.addressMode, studioKind: studio, neighbourhood: l.zone, arrivalNote: l.arrivalNote ?? "" };
}

/** The instagram of the built-in facts (fictional demo content), headline from the fixture; no languages. */
export function fixtureHeroFacts(f: MockupFixture, builtIn: HeroFacts | undefined): HeroFacts | undefined {
  if (!builtIn) return undefined;
  const { languages: _languages, ...rest } = builtIn;
  return {
    ...rest,
    headline: f.hero.headline ?? builtIn.headline,
    tagline: f.talent.tagline,
    ...(typeof f.talent.yearsOfCraft === "number" ? { years: f.talent.yearsOfCraft } : {}),
  };
}

/** Fixture parts this build still cannot place (reported in `skipped`). */
export function fixtureSkipped(f: MockupFixture): string[] {
  const out: string[] = [];
  if (f.services.some((s) => s.includes.length)) out.push("services.includes (no offering field)");
  if (f.services.some((s) => s.imageKey)) out.push("services.images (existing demo media kept)");
  for (const s of unmappedStats(f)) out.push(`stats.${s} (no profile field)`);
  if (f.about || f.footer.headline) out.push("about/footer headline copy (page tree, design step)");
  return out;
}

/** True when any value in the planned writes carries a `mockupOnly` key (must never happen). */
export function planHasMockupOnly(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  if (Array.isArray(v)) return v.some(planHasMockupOnly);
  return Object.entries(v as Row).some(([k, x]) => k === "mockupOnly" || planHasMockupOnly(x));
}

/** The tables a set of planned ops would write. */
export function plannedTables(p: {
  offerings: OfferingOp[];
  faq: FaqOp[];
  fields: unknown[];
  languages: LanguagePlan;
  profilePatch: Row;
  location: boolean;
}): ContentTable[] {
  const t = new Set<ContentTable>();
  if (p.offerings.length) t.add("talent_offerings");
  for (const o of p.offerings) {
    if (o.op === "insert" && o.variants.length) t.add("talent_offering_variants");
    if (o.op === "insert" && o.addons.length) t.add("talent_offering_addons");
    if (o.op === "update") {
      if (!noChildOps(o.variants)) t.add("talent_offering_variants");
      if (!noChildOps(o.addons)) t.add("talent_offering_addons");
    }
  }
  if (p.faq.length) t.add("talent_faq_items");
  if (p.fields.length) t.add("talent_profile_field_values");
  if (p.languages.upsert.length || p.languages.remove.length) t.add("talent_languages");
  if (Object.keys(p.profilePatch).length) t.add("talent_profiles");
  if (p.location) t.add("talent_location_settings");
  return [...t];
}
