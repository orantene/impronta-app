/**
 * TEMPLATE FACTORY, goal #6: the CANONICAL MOCKUP CONTENT FIXTURE of a design.
 * `design-references/<design>/content.json` holds, verbatim, the content the
 * design's mockup shows (exact strings, prices, accents). The reference demo
 * (Alba TAL-93020 for maison-v2, Mateo Ferrer TAL-93011 for folio) is rebuilt
 * from it, so parity checks against the mockup can be exact.
 *
 * `mockupOnly` is FICTIONAL mockup data (map labels, @handles, "Calle Ejemplo
 * 123", demo ratings, "ficticio de demo" credits, sample chat replies). The
 * demo rebuild MUST NOT write anything under `mockupOnly` to the database.
 *
 * Spanish is primary (both mockups are lang es). Mode names are the mockup's
 * own; `quote` is the mockup's word for the product's `inquiry` mode.
 * Pure types, a static loader and a pure validator; no I/O.
 */
import folioContent from "../../../../design-references/folio/content.json";
import gridlineContent from "../../../../design-references/gridline/content.json";
import maisonContent from "../../../../design-references/maison-v2/content.json";
import type { DemoDesign } from "./types";
import { GRIDLINE_DEMO_FIXTURES } from "./gridline-demo-fixtures";
import { FOLIO_DEMO_FIXTURES } from "./folio-demo-fixtures";

export type FixtureMode = "instant" | "request" | "inquiry" | "quote";

/**
 * A design that owns a canonical content fixture. A superset of `DemoDesign`:
 * Gridline (TH16) has a fixture before it has a design or a registry entry, so
 * its reference demo can be built and checked against the mockup first.
 */
export type FixtureDesign = DemoDesign | "gridline";

export interface FixtureVariant {
  id: string;
  label: string;
  note: string;
  priceDelta: number;
  minutesDelta: number;
  /** The mockup's own delta text ("-$50", "-5% por pieza"), kept verbatim. */
  deltaLabel?: string;
  /** Percent delta per unit (-5 = 5% off each piece); `priceDelta` stays 0 for these. */
  deltaPct?: number;
}

export interface FixtureBriefQuestion {
  key: string;
  label: string;
  placeholder?: string;
  type?: string;
  options?: string[];
  /** Soft-keyboard hint ("numeric"). */
  inputMode?: string;
  /** Helper line under the field. */
  help?: string;
}

/** Per-service cells of a comparison matrix (Gridline W-01). Typed, never computed. */
export interface FixtureMatrixCells {
  materials: string;
  warranty: string;
  response: string;
}

export interface FixtureService {
  id: string;
  category: string;
  name: string;
  shortName?: string;
  durationLabel: string | null;
  durationMinutes: number | null;
  priceLabel: string;
  /** null for "A cotizar". */
  priceAmount: number | null;
  currency: "MXN" | "USD";
  priceFrom?: boolean;
  priceUnit?: string;
  mode: FixtureMode;
  ctaLabel: string;
  description: string;
  includes: string[];
  imageKey: string;
  free?: boolean;
  payMode?: "deposit" | "free" | "full";
  modeNote?: string;
  variants?: FixtureVariant[];
  extras?: Array<Omit<FixtureVariant, "note"> & { note?: string }>;
  /** Label above the options ("Tipo de inmueble"). */
  optionsLabel?: string;
  /** Matrix cells; present on every service when the fixture has a `matrix`. */
  matrix?: FixtureMatrixCells;
  /** The service the matrix highlights while the talent's emergencies-today flag is on. */
  emergency?: boolean;
  /** Extra fields an instant booking asks for (Gridline: colonia). */
  whoFields?: FixtureBriefQuestion[];
  /** Payment note on the booking sheet. */
  payNote?: string;
  flow?: { title?: string; intro?: string; submit?: string; brief?: FixtureBriefQuestion[] };
  slots?: string[];
  slotNote?: string;
  policy?: string;
}

export interface FixtureReview {
  quote: string;
  author: string;
  service: string;
  initials?: string;
}

export interface FixtureTask {
  id: string;
  label: string;
  /** Icon key of the task picker glyph set. */
  icon: string;
  serviceId: string;
  hint: string;
}

/** A second language of a demo's written content (the talent does not speak it; the AI translate button wrote it). */
export interface FixtureTranslation {
  tagline?: string;
  bio?: string;
  services?: Record<string, { name: string; description: string; category?: string; matrix?: FixtureMatrixCells }>;
  faq?: Array<{ q: string; a: string }>;
  tasks?: Record<string, { label: string; hint: string }>;
  taskDefault?: { kicker: string; hint: string };
}

export interface DemoContentFixture {
  design: FixtureDesign;
  profileCode: string;
  /** Primary language of the written content. */
  locale: "es" | "en";
  /** Second language, keyed by language code (Gridline's bilingual demo). */
  translations?: Partial<Record<"en" | "es", FixtureTranslation>>;
  talent: {
    displayName: string;
    tagline: string;
    bio: string;
    trade: string;
    city: string;
    languages: string[];
    yearsOfCraft?: number;
  };
  hero: {
    headline?: string;
    eyebrow?: string;
    proofLine?: string;
    lines?: string[];
    lede?: string;
    ctas?: string[];
    imageKey?: string;
    imageAlt?: string;
    inset?: { imageKey: string; alt: string };
    /** Typed spec cells of a spec-block hero (Gridline). Never computed ratings. */
    facts?: Array<{ label: string; value: string }>;
    /** The same spec cells in another language, written onto the stats node as a per-language overlay. */
    factsI18n?: Partial<Record<"en" | "es", Array<{ label: string; value: string }>>>;
    /** Short credential chips under the who-card. */
    badges?: string[];
    mastheadLeft?: string;
    mastheadRight?: string;
  };
  menu: { eyebrow: string | null; title: string; subtitle: string; ticker?: string[] };
  /** Utility top bar (Gridline): sub line and the call button's accessible name. */
  topBar?: { subtitle: string; phoneAriaLabel: string };
  /** The talent's own daily "emergencies today" setting and what it drives. */
  urgency?: {
    setting: string;
    defaultOn: boolean;
    serviceId: string;
    statusOn: string;
    statusOff: string;
    band: { title: string; safetyLead: string; safety: string };
    dock: { on: { label: string; serviceId: string }; off: { label: string; serviceId: string } };
  };
  /** Task picker (Gridline W-11): tasks mapped to services. */
  tasks?: {
    title: string;
    hint: string;
    recommendKicker: string;
    detailsLabel: string;
    items: FixtureTask[];
    fallback: { kicker: string; badge: string; serviceId: string; body: string };
  };
  /** Comparison matrix rows (Gridline W-01); cells live on each service's `matrix`. */
  matrix?: { rows: Array<{ key: "price" | "dur" | "mode" | "mat" | "war" | "resp"; label: string }> };
  /** Spec table (Gridline): key/value rows. */
  specTable?: { title: string; subtitle: string; rows: Array<{ label: string; value: string }> };
  payment?: {
    depositPercent: number;
    inPersonMethods: string[];
    cancelHours: number;
    rescheduleHours: number;
    lateToleranceMinutes: number;
  };
  portfolio: {
    eyebrow: string | null;
    title: string | null;
    items: Array<{
      imageKey: string;
      caption: string;
      /** Card title above the caption (Gridline job cards). */
      title?: string;
      serviceId?: string;
      group?: string;
      numeral?: string;
      contents?: string;
    }>;
  };
  services: FixtureService[];
  reviews: { eyebrow?: string; title?: string; label?: string; items: FixtureReview[] };
  about: {
    eyebrow?: string;
    title?: string;
    text: string;
    credentials?: string[];
    portraitKey?: string;
  } | null;
  faq: { eyebrow?: string; title?: string; items: Array<{ q: string; a: string }> };
  /** Comp-card measures (Folio). Empty when the design has none. */
  stats: Array<{ label: string; value: string }>;
  statsTitle?: string;
  location: {
    eyebrow: string;
    title: string;
    kind: string;
    studioKind: string;
    addressMode: "zone_only" | "after_booking" | "public";
    zone: string;
    city: string;
    headline: string;
    sub: string;
    rows: Array<{ label: string; value: string }>;
    /** Municipalities / neighbourhoods served, as chips on an area card. */
    areas?: string[];
    arrivalNote: string | null;
  } | null;
  footer: {
    headline?: string;
    line?: string;
    cta?: string;
    columns: Array<{ title: string; text: string }>;
  };
  suggestions?: string[];
  /** Fictional mockup data. NEVER written to the database. */
  mockupOnly: Record<string, unknown>;
}

/**
 * Fixtures by key: a design (its reference demo's mockup content) or a demo's
 * profile code (Gridline's seven trade demos, authored in gridline-demo-fixtures.ts).
 */
const FIXTURES: Readonly<Record<string, DemoContentFixture>> = {
  "maison-v2": maisonContent as unknown as DemoContentFixture,
  folio: folioContent as unknown as DemoContentFixture,
  gridline: gridlineContent as unknown as DemoContentFixture,
  ...GRIDLINE_DEMO_FIXTURES,
  ...FOLIO_DEMO_FIXTURES,
};

export function loadDemoContentFixture(key: string): DemoContentFixture {
  const fixture = FIXTURES[key];
  if (!fixture) throw new Error(`no content fixture for ${key}`);
  const problems = validateDemoContentFixture(fixture);
  if (problems.length) throw new Error(`content fixture ${key} invalid: ${problems.join("; ")}`);
  return fixture;
}

const MODES: ReadonlySet<string> = new Set(["instant", "request", "inquiry", "quote"]);

/** Returns a list of problems; empty means valid. */
export function validateDemoContentFixture(f: DemoContentFixture): string[] {
  const out: string[] = [];
  const need = (ok: boolean, msg: string) => {
    if (!ok) out.push(msg);
  };
  const str = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  need(str(f?.design) && str(f?.profileCode), "design/profileCode missing");
  need(f?.locale === "es" || f?.locale === "en", "locale must be es or en");
  need(str(f?.talent?.displayName) && str(f?.talent?.tagline) && str(f?.talent?.bio), "talent name/tagline/bio missing");
  need(str(f?.talent?.trade) && str(f?.talent?.city), "talent trade/city missing");
  need(Array.isArray(f?.talent?.languages) && f.talent.languages.length > 0, "talent languages missing");
  need(Array.isArray(f?.services) && f.services.length > 0, "no services");
  const ids = new Set<string>();
  for (const s of f?.services ?? []) {
    need(str(s.id) && !ids.has(s.id), `service id duplicate or empty: ${s.id}`);
    ids.add(s.id);
    need(str(s.name) && str(s.category) && str(s.description), `service ${s.id}: name/category/description missing`);
    need(MODES.has(s.mode), `service ${s.id}: unknown mode ${s.mode}`);
    need(s.currency === "MXN" || s.currency === "USD", `service ${s.id}: currency must be MXN or USD`);
    need(str(s.priceLabel) && str(s.ctaLabel) && str(s.imageKey), `service ${s.id}: priceLabel/ctaLabel/imageKey missing`);
    need(s.priceAmount === null || (Number.isFinite(s.priceAmount) && s.priceAmount >= 0), `service ${s.id}: bad priceAmount`);
    need(s.mode === "quote" || s.mode === "inquiry" || s.priceAmount !== null, `service ${s.id}: priced mode without amount`);
    need(s.durationMinutes === null || s.durationMinutes > 0, `service ${s.id}: bad durationMinutes`);
  }
  for (const r of f?.reviews?.items ?? []) need(str(r.quote) && str(r.author), "review quote/author missing");
  for (const q of f?.faq?.items ?? []) need(str(q.q) && str(q.a), "faq q/a missing");
  for (const p of f?.portfolio?.items ?? []) {
    need(str(p.imageKey) && str(p.caption), "portfolio imageKey/caption missing");
    need(!p.serviceId || ids.has(p.serviceId), `portfolio links unknown service ${p.serviceId}`);
  }
  // Gridline blocks: every reference lands on a real service; every service carries its matrix cells.
  const ref = (id: string | undefined, what: string) => need(!!id && ids.has(id), `${what} points at unknown service ${id}`);
  for (const t of f?.tasks?.items ?? []) {
    need(str(t.id) && str(t.label) && str(t.icon) && str(t.hint), `task ${t.id}: id/label/icon/hint missing`);
    ref(t.serviceId, `task ${t.id}`);
  }
  if (f?.tasks) ref(f.tasks.fallback?.serviceId, "task fallback");
  if (f?.urgency) {
    ref(f.urgency.serviceId, "urgency");
    ref(f.urgency.dock?.on?.serviceId, "urgency dock on");
    ref(f.urgency.dock?.off?.serviceId, "urgency dock off");
  }
  if (f?.matrix) {
    need(f.matrix.rows.length > 0, "matrix has no rows");
    for (const s of f.services) {
      need(!!s.matrix && str(s.matrix.materials) && str(s.matrix.warranty) && str(s.matrix.response), `service ${s.id}: matrix cells missing`);
    }
  }
  need(typeof f?.mockupOnly === "object" && f.mockupOnly !== null, "mockupOnly must exist (use {} when empty)");
  return out;
}
