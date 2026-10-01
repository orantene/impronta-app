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
import maisonContent from "../../../../design-references/maison-v2/content.json";
import type { DemoDesign } from "./types";

export type FixtureMode = "instant" | "request" | "inquiry" | "quote";

export interface FixtureVariant {
  id: string;
  label: string;
  note: string;
  priceDelta: number;
  minutesDelta: number;
}

export interface FixtureBriefQuestion {
  key: string;
  label: string;
  placeholder?: string;
  type?: string;
  options?: string[];
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
  currency: "MXN";
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
  extras?: Array<Omit<FixtureVariant, "note">>;
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

export interface DemoContentFixture {
  design: DemoDesign;
  profileCode: string;
  locale: "es";
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
    mastheadLeft?: string;
    mastheadRight?: string;
  };
  menu: { eyebrow: string | null; title: string; subtitle: string; ticker?: string[] };
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

const FIXTURES: Readonly<Record<DemoDesign, DemoContentFixture>> = {
  "maison-v2": maisonContent as unknown as DemoContentFixture,
  folio: folioContent as unknown as DemoContentFixture,
};

export function loadDemoContentFixture(design: DemoDesign): DemoContentFixture {
  const fixture = FIXTURES[design];
  const problems = validateDemoContentFixture(fixture);
  if (problems.length) throw new Error(`content fixture ${design} invalid: ${problems.join("; ")}`);
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
  need(f?.locale === "es", "locale must be es");
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
    need(s.currency === "MXN", `service ${s.id}: currency must be MXN`);
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
  need(typeof f?.mockupOnly === "object" && f.mockupOnly !== null, "mockupOnly must exist (use {} when empty)");
  return out;
}
