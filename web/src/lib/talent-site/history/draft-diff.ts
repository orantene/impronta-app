/**
 * "What will go live": the sections that differ between the published site and
 * the draft, in the talent's language (EN + ES). Pure.
 *
 * - Sections are matched by their design key (`props.__origin.key`), then
 *   `props.slotKey`, then node id, so a reordered or re-seeded tree still lines
 *   up with its live counterpart.
 * - Labels are the section's display name (Hero, Services, Reviews...), never a
 *   node kind; an unnamed wrapper is looked through to its named sections, and
 *   nested containers are never listed on their own.
 * - Inline markup (`{i}…{/i}`) is stripped from excerpts.
 * - Tokens read as "Accent colour" with a swatch, fonts by family name.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { stableStringify, stripDesignOrigin } from "@/lib/talent-site/theme-releases/origin";

export type SectionChangeKind = "added" | "removed" | "changed";
export type DiffLocale = "en" | "es";

export interface SectionChange {
  /** "shell" | page id | "tokens". */
  scope: string;
  scopeLabel: string;
  key: string;
  change: SectionChangeKind;
  label: string;
  before: string | null;
  after: string | null;
  /** Colour tokens: CSS colour values to render as swatches. */
  beforeSwatch?: string | null;
  afterSwatch?: string | null;
}

export interface GoLiveInput {
  shell: { draft: unknown; live: unknown };
  pages: Array<{ id: string; title: string; draft: unknown; live: unknown }>;
  tokens: { draft: unknown; live: unknown };
}

const TEXT_PROPS = ["title", "heading", "headline", "eyebrow", "text", "subtitle", "label", "body", "caption"];
const EXCERPT = 80;

const SECTION_NAMES: Record<string, { en: string; es: string }> = {
  hero: { en: "Hero", es: "Portada" },
  "before-after": { en: "Before and after", es: "Antes y después" },
  services: { en: "Services", es: "Servicios" },
  menu: { en: "Services", es: "Servicios" },
  reviews: { en: "Reviews", es: "Reseñas" },
  testimonials: { en: "Reviews", es: "Reseñas" },
  about: { en: "About", es: "Sobre mí" },
  faq: { en: "FAQ", es: "Preguntas frecuentes" },
  gallery: { en: "Gallery", es: "Galería" },
  work: { en: "Gallery", es: "Galería" },
  portfolio: { en: "Gallery", es: "Galería" },
  visit: { en: "Visit", es: "Tu visita" },
  ticker: { en: "Recent work", es: "Novedades y trabajos recientes" },
  before_after: { en: "Before and after", es: "Antes y después" },
  "before-and-after": { en: "Before and after", es: "Antes y después" },
  aftercare: { en: "Aftercare", es: "Cuidados posteriores" },
  location: { en: "Location", es: "Ubicación" },
  hours: { en: "Hours", es: "Horario" },
  contact: { en: "Contact", es: "Contacto" },
  booking: { en: "Booking", es: "Reservas" },
  header: { en: "Header", es: "Encabezado" },
  footer: { en: "Footer", es: "Pie de página" },
  cta: { en: "Call to action", es: "Llamado a la acción" },
  team: { en: "Team", es: "Equipo" },
  pricing: { en: "Prices", es: "Precios" },
};

const GENERIC_SECTION = { en: "Section", es: "Sección" };

const COLOUR_NAMES: Record<string, { en: string; es: string }> = {
  accent: { en: "Accent colour", es: "Color de acento" },
  primary: { en: "Button colour", es: "Color de botones" },
  "primary-on": { en: "Button text colour", es: "Color del texto de botones" },
  ink: { en: "Text colour", es: "Color del texto" },
  muted: { en: "Soft text colour", es: "Color del texto suave" },
  background: { en: "Background colour", es: "Color de fondo" },
  surface: { en: "Card colour", es: "Color de tarjetas" },
  "surface-raised": { en: "Card colour", es: "Color de tarjetas" },
  line: { en: "Line colour", es: "Color de líneas" },
  blush: { en: "Highlight colour", es: "Color de realce" },
};

function nodes(value: unknown): BuilderNode[] {
  return Array.isArray(value) ? (value as BuilderNode[]) : [];
}

function propsOf(node: BuilderNode): Record<string, unknown> {
  const p = (node as { props?: unknown }).props;
  return p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
}

function kidsOf(node: BuilderNode): BuilderNode[] {
  return nodes((node as { children?: unknown }).children);
}

/** The section's own design identity (origin key / slotKey), or null. */
function namedKey(node: BuilderNode): string | null {
  const props = propsOf(node);
  const origin = props.__origin as { key?: unknown } | undefined;
  if (origin && typeof origin.key === "string" && origin.key && !origin.key.includes("/")) return origin.key;
  if (typeof props.slotKey === "string" && props.slotKey) return props.slotKey;
  return null;
}

export function sectionKey(node: BuilderNode): string {
  return namedKey(node) ?? String((node as { id?: unknown }).id ?? "");
}

/** Top-level sections; an unnamed wrapper whose children are named is looked through. */
export function sectionsOf(tree: unknown): BuilderNode[] {
  const out: BuilderNode[] = [];
  for (const node of nodes(tree)) {
    const kids = kidsOf(node);
    if (!namedKey(node) && kids.length > 0 && kids.some((k) => namedKey(k))) out.push(...kids);
    else out.push(node);
  }
  return out;
}

/** Strip inline markup like `{i}work{/i}` and `{b}…{/b}`, then collapse whitespace. */
export function stripInlineMarkup(s: string): string {
  return s.replace(/\{\/?[a-z]+\}/gi, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function clip(s: string): string {
  const t = stripInlineMarkup(s);
  return t.length > EXCERPT ? `${t.slice(0, EXCERPT - 1)}…` : t;
}

/** The first readable text a section carries (itself or a descendant). */
export function sectionText(node: BuilderNode, depth = 0): string | null {
  const props = propsOf(node);
  for (const k of TEXT_PROPS) {
    const v = props[k];
    if (typeof v === "string" && stripInlineMarkup(v)) return clip(v);
  }
  if (depth > 3) return null;
  for (const child of kidsOf(node)) {
    const t = sectionText(child, depth + 1);
    if (t) return t;
  }
  return null;
}

/** Talent-facing section name: known design slot, else a readable slot, else its heading. */
/**
 * The ONE key -> display name map (go-live sheet, update sheet "kept your
 * edits" line). Null when the key is not a known design slot.
 */
export function sectionNameForKey(key: string | null | undefined, locale: DiffLocale): string | null {
  if (!key) return null;
  const base = key.split(/[-_./]/)[0]?.toLowerCase() ?? "";
  const known = SECTION_NAMES[key.toLowerCase()] ?? SECTION_NAMES[base];
  return known ? known[locale] : null;
}

/**
 * Design kits label their sections in English (`layerLabel`). This maps those
 * labels to the talent's language; unknown labels come back unchanged.
 */
const LABEL_NAMES: Record<string, { en: string; es: string }> = {
  hero: { en: "Hero", es: "Portada" },
  "ticker and recent work": { en: "Ticker and recent work", es: "Novedades y trabajos recientes" },
  ticker: { en: "Ticker", es: "Novedades" },
  menu: { en: "Menu", es: "Menú" },
  services: { en: "Services", es: "Servicios" },
  reviews: { en: "Reviews", es: "Reseñas" },
  about: { en: "About", es: "Sobre mí" },
  visit: { en: "Visit", es: "Tu visita" },
  faq: { en: "FAQ", es: "Preguntas frecuentes" },
  "visit & faq": { en: "Visit & FAQ", es: "Tu visita y preguntas frecuentes" },
  "contact & faq": { en: "Contact & FAQ", es: "Contacto y preguntas frecuentes" },
  contact: { en: "Contact", es: "Contacto" },
  gallery: { en: "Gallery", es: "Galería" },
  chapter: { en: "Chapter", es: "Capítulo" },
  "before and after": { en: "Before and after", es: "Antes y después" },
  aftercare: { en: "Aftercare", es: "Cuidados posteriores" },
  header: { en: "Header", es: "Encabezado" },
  footer: { en: "Footer", es: "Pie de página" },
  "statement footer": { en: "Statement footer", es: "Pie con mensaje" },
  "comp card": { en: "Comp card", es: "Comp card" },
  contents: { en: "Contents", es: "Contenido" },
  "the book": { en: "The book", es: "El portafolio" },
};

export function sectionNameForLabel(label: string | null | undefined, locale: DiffLocale): string | null {
  const known = label ? LABEL_NAMES[label.trim().toLowerCase()] : undefined;
  return known ? known[locale] : null;
}

export function sectionLabel(node: BuilderNode, locale: DiffLocale): string {
  const key = namedKey(node);
  const known = sectionNameForKey(key, locale);
  if (known) return known;
  const role = propsOf(node).originRole;
  const roleTail = typeof role === "string" ? role.split(".").pop()?.toLowerCase() ?? "" : "";
  if (SECTION_NAMES[roleTail]) return SECTION_NAMES[roleTail]![locale];
  if (key && /^[a-z][a-z-]*$/i.test(key)) return key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, " ");
  const heading = sectionText(node);
  return heading && heading.length <= 40 ? heading : GENERIC_SECTION[locale];
}

function strip(node: BuilderNode): string {
  // Ignore the origin stamp: a re-stamp alone is not a visible change.
  return stableStringify(stripDesignOrigin([node]));
}

function diffTree(
  scope: string,
  scopeLabel: string,
  draft: unknown,
  live: unknown,
  locale: DiffLocale,
): SectionChange[] {
  const out: SectionChange[] = [];
  const liveByKey = new Map(sectionsOf(live).map((n) => [sectionKey(n), n] as const));
  const seen = new Set<string>();
  for (const node of sectionsOf(draft)) {
    const key = sectionKey(node);
    seen.add(key);
    const prev = liveByKey.get(key);
    const label = sectionLabel(node, locale);
    if (!prev) {
      out.push({ scope, scopeLabel, key, change: "added", label, before: null, after: sectionText(node) });
    } else if (strip(prev) !== strip(node)) {
      const before = sectionText(prev);
      const after = sectionText(node);
      out.push({
        scope,
        scopeLabel,
        key,
        change: "changed",
        label,
        before: before === after ? null : before,
        after: before === after ? null : after,
      });
    }
  }
  for (const [key, prev] of liveByKey) {
    if (seen.has(key)) continue;
    out.push({ scope, scopeLabel, key, change: "removed", label: sectionLabel(prev, locale), before: sectionText(prev), after: null });
  }
  return out;
}

function tokenMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/** First family of a CSS font stack: `"Bodoni Moda", Didot, serif` → Bodoni Moda. */
export function fontName(stack: string): string {
  return (stack.split(",")[0] ?? stack).replace(/["']/g, "").trim();
}

function isColourToken(key: string): boolean {
  return key.startsWith("color.") || key.startsWith("colour.");
}

function isFontToken(key: string): boolean {
  return /font-family|^font\.|\.font$/.test(key);
}

/** Talent-facing token name (EN / ES). */
export function tokenLabel(key: string, locale: DiffLocale): string {
  if (isColourToken(key)) {
    const name = key.slice(key.indexOf(".") + 1);
    const known = COLOUR_NAMES[name];
    if (known) return known[locale];
    const words = name.replace(/[-_.]/g, " ");
    return locale === "es" ? `Color ${words}` : `${words.charAt(0).toUpperCase()}${words.slice(1)} colour`;
  }
  if (isFontToken(key)) {
    if (/heading|display|title/.test(key)) return locale === "es" ? "Fuente de títulos" : "Heading font";
    return locale === "es" ? "Fuente del texto" : "Body font";
  }
  const words = key.split(".").pop()!.replace(/[-_]/g, " ");
  return locale === "es" ? `Estilo: ${words}` : `Style: ${words}`;
}

function diffTokens(draft: unknown, live: unknown, label: string, locale: DiffLocale): SectionChange[] {
  const d = tokenMap(draft);
  const l = tokenMap(live);
  const keys = [...new Set([...Object.keys(d), ...Object.keys(l)])].sort();
  const out: SectionChange[] = [];
  const seenLabels = new Set<string>();
  for (const key of keys) {
    if (d[key] === l[key]) continue;
    const name = tokenLabel(key, locale);
    // Two tokens that read the same to her (e.g. surface + surface-raised) are one row.
    if (seenLabels.has(name)) continue;
    seenLabels.add(name);
    const colour = isColourToken(key);
    const font = isFontToken(key);
    const show = (v: string | undefined) => (v === undefined ? null : colour ? null : font ? fontName(v) : v);
    out.push({
      scope: "tokens",
      scopeLabel: label,
      key,
      change: key in l ? (key in d ? "changed" : "removed") : "added",
      label: name,
      before: show(l[key]),
      after: show(d[key]),
      ...(colour ? { beforeSwatch: l[key] ?? null, afterSwatch: d[key] ?? null } : {}),
    });
  }
  return out;
}

export function diffDraftAgainstLive(
  input: GoLiveInput,
  labels: { header: string; colours: string },
  locale: DiffLocale = "en",
): SectionChange[] {
  return [
    ...diffTree("shell", labels.header, input.shell.draft, input.shell.live, locale),
    ...input.pages.flatMap((p) => diffTree(p.id, p.title, p.draft, p.live, locale)),
    ...diffTokens(input.tokens.draft, input.tokens.live, labels.colours, locale),
  ];
}

/**
 * Chip count + sheet rows from ONE source, so they always agree. A site that
 * was never published has no "changes": everything goes live for the first
 * time, summarised as pages + sections.
 */
export function summarizeGoLive(
  input: GoLiveInput,
  labels: { header: string; colours: string },
  locale: DiffLocale,
  published: boolean,
  /** False when the site publish cannot carry theme tokens live (theme gallery
   *  off): a draft-token difference is then not a change Publish could clear,
   *  so it must not show as "1 unpublished change" right after a publish. */
  tokensPublishable = true,
): {
  unpublishedCount: number;
  changes: SectionChange[];
  firstPublish: { pages: number; sections: number } | null;
} {
  if (!published) {
    const sections =
      sectionsOf(input.shell.draft).length +
      input.pages.reduce((n, p) => n + sectionsOf(p.draft).length, 0);
    return { unpublishedCount: 0, changes: [], firstPublish: { pages: input.pages.length, sections } };
  }
  const effective = tokensPublishable
    ? input
    : { ...input, tokens: { draft: input.tokens.live, live: input.tokens.live } };
  const changes = diffDraftAgainstLive(effective, labels, locale);
  return { unpublishedCount: changes.length, changes, firstPublish: null };
}
