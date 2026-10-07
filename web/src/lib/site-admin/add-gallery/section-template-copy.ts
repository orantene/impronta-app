import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

/**
 * TUL-52 C: layout placeholder copy follows the site kind and the content
 * locale. Templates are authored once in agency English; this pass swaps the
 * agency-specific strings. A solo talent site never gets "Our agency".
 * House rule: no em dashes in user copy.
 */
export interface TemplateCopyContext {
  siteKind: "talent" | "agency";
  locale: string;
}

/** Site kind for placeholder copy: talent surfaces or talent URLs, else agency. */
export function templateCopySiteKind(
  surfaceKind: string | null | undefined,
  pathname: string | null | undefined,
): TemplateCopyContext["siteKind"] {
  if (surfaceKind === "talent_page" || surfaceKind === "theme_template") return "talent";
  const p = pathname ?? "";
  return p.startsWith("/talent/") || p.startsWith("/t/") ? "talent" : "agency";
}

type Variant = { en: string; es: string };
interface Row {
  agency: Variant;
  talent: Variant;
}

const ROWS: Record<string, Row> = {
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

export function localizeTemplateString(value: string, ctx: TemplateCopyContext): string {
  const row = ROWS[value];
  if (!row) return value;
  const variant = ctx.siteKind === "talent" ? row.talent : row.agency;
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
