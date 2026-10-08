import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import { EXTRA_ROWS, type CopyRow, type Variant } from "./section-template-copy-rows";

/**
 * TUL-52 C: layout placeholder copy follows the site kind and the content
 * locale. Templates are authored once in agency English; this pass swaps the
 * agency-specific strings. A solo talent site never gets "Our agency".
 * House rule: no em dashes in user copy.
 */
export interface TemplateCopyContext {
  /** "talent" = solo talent, "business" = local business, "agency" = roster site. */
  siteKind: "talent" | "business" | "agency";
  locale: string;
}

/** Site kind for placeholder copy: talent surfaces or talent URLs, else agency. */
export function templateCopySiteKind(
  surfaceKind: string | null | undefined,
  pathname: string | null | undefined,
  workspaceType?: string | null,
): TemplateCopyContext["siteKind"] {
  if (workspaceType === "business") return "business";
  if (surfaceKind === "talent_page" || surfaceKind === "theme_template") return "talent";
  const p = pathname ?? "";
  return p.startsWith("/talent/") || p.startsWith("/t/") ? "talent" : "agency";
}

/**
 * Language for inserted placeholder copy. The active content-locale store is
 * only published by the top bar; until then it holds its "en" boot default,
 * which made a Spanish site get English copy (TUL-80 / Grokbot B-9). When the
 * store's tenant default does not match the editor's real tenant default it
 * was never published for this site, so the site default wins.
 */
export function resolveCopyLocale(
  active: { locale: string; defaultLocale: string },
  siteDefaultLocale: string | null | undefined,
): string {
  const site = (siteDefaultLocale ?? "").trim();
  if (!site) return active.locale || "en";
  const published = active.defaultLocale.toLowerCase() === site.toLowerCase();
  return published && active.locale ? active.locale : site;
}

/** One place that builds the context both insert call sites pass. */
export function buildTemplateCopyContext(input: {
  surfaceKind: string | null | undefined;
  pathname: string | null | undefined;
  workspaceType?: string | null;
  active: { locale: string; defaultLocale: string };
  siteDefaultLocale?: string | null;
}): TemplateCopyContext {
  return {
    siteKind: templateCopySiteKind(input.surfaceKind, input.pathname, input.workspaceType),
    locale: resolveCopyLocale(input.active, input.siteDefaultLocale),
  };
}

type Row = CopyRow;

const BASE_ROWS: Record<string, Row> = {
  "Our agency": {
    agency: { en: "Our agency", es: "Nuestra agencia" },
    talent: { en: "About me", es: "Sobre mí" },
  },
  "About us": {
    agency: { en: "About us", es: "Sobre nosotros" },
    talent: { en: "About me", es: "Sobre mí" },
  },
  "Share your story, approach, and what makes your agency distinctive.": {
    agency: {
      en: "Share your story, approach, and what makes your agency distinctive.",
      es: "Cuenta tu historia, tu enfoque y lo que distingue a tu agencia.",
    },
    talent: {
      en: "Share your story, your approach, and what makes your work distinctive.",
      es: "Cuenta tu historia, tu enfoque y lo que hace único tu trabajo.",
    },
  },
  "Our story": {
    agency: { en: "Our story", es: "Nuestra historia" },
    talent: { en: "My story", es: "Mi historia" },
  },
  "Tell visitors who you are, how you work, and why clients trust your team.": {
    agency: {
      en: "Tell visitors who you are, how you work, and why clients trust your team.",
      es: "Cuenta quién eres, cómo trabajas y por qué los clientes confían en tu equipo.",
    },
    talent: {
      en: "Tell visitors who you are, how you work, and why clients trust you.",
      es: "Cuenta quién eres, cómo trabajas y por qué los clientes confían en ti.",
    },
  },
  "Key figures that reinforce your agency credibility.": {
    agency: {
      en: "Key figures that reinforce your agency credibility.",
      es: "Cifras clave que refuerzan la credibilidad de tu agencia.",
    },
    talent: {
      en: "Key figures that reinforce your credibility.",
      es: "Cifras clave que refuerzan tu credibilidad.",
    },
  },
  "Talent agency": {
    agency: { en: "Talent agency", es: "Agencia de talento" },
    talent: { en: "Welcome", es: "Bienvenida" },
  },
  "Introduce your agency, roster, or offer with a clear supporting line.": {
    agency: {
      en: "Introduce your agency, roster, or offer with a clear supporting line.",
      es: "Presenta tu agencia, tu roster o tu oferta con una línea clara.",
    },
    talent: {
      en: "Introduce yourself and your services with a clear supporting line.",
      es: "Preséntate y presenta tus servicios con una línea clara.",
    },
  },
};

const ROWS: Record<string, Row> = { ...BASE_ROWS, ...Object.fromEntries(EXTRA_ROWS) };

// A business speaks as "we", not "I".
const BUSINESS_VOICE: Record<string, Variant> = {
  "Our agency": { en: "About us", es: "Sobre nosotros" },
  "About us": { en: "About us", es: "Sobre nosotros" },
  "Our story": { en: "Our story", es: "Nuestra historia" },
  "Share your story, approach, and what makes your agency distinctive.": {
    en: "Share your story, your approach, and what makes your business distinctive.",
    es: "Cuenta tu historia, tu enfoque y lo que distingue a tu negocio.",
  },
  "Tell visitors who you are, how you work, and why clients trust your team.": {
    en: "Tell visitors who you are, how you work, and why clients trust your team.",
    es: "Cuenta quién eres, cómo trabajas y por qué los clientes confían en tu equipo.",
  },
  "Key figures that reinforce your agency credibility.": {
    en: "Key figures that reinforce your credibility.",
    es: "Cifras clave que refuerzan tu credibilidad.",
  },
  "Introduce your agency, roster, or offer with a clear supporting line.": {
    en: "Introduce your business and what you offer with a clear supporting line.",
    es: "Presenta tu negocio y lo que ofreces con una línea clara.",
  },
};
for (const [k, v] of Object.entries(BUSINESS_VOICE)) {
  if (ROWS[k]) ROWS[k] = { ...ROWS[k], business: v };
}

export function localizeTemplateString(value: string, ctx: TemplateCopyContext): string {
  const row = ROWS[value];
  if (!row) return value;
  const variant: Variant =
    ctx.siteKind === "agency" ? row.agency : ctx.siteKind === "business" ? (row.business ?? row.talent) : row.talent;
  return ctx.locale.toLowerCase().startsWith("es") ? variant.es : variant.en;
}

function walk(value: unknown, ctx: TemplateCopyContext): unknown {
  if (typeof value === "string") return localizeTemplateString(value, ctx);
  if (Array.isArray(value)) return value.map((v) => walk(v, ctx));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = k === "id" || k === "kind" ? v : walk(v, ctx);
    return out;
  }
  return value;
}

/** Default agency + English is the authored baseline: returned untouched. */
export function localizeSectionTemplate(node: BuilderNode, ctx: TemplateCopyContext | undefined): BuilderNode {
  if (!ctx) return node;
  if (ctx.siteKind === "agency" && !ctx.locale.toLowerCase().startsWith("es")) return node;
  return walk(node, ctx) as BuilderNode;
}
