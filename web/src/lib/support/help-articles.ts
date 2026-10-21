import type { HelpEntry } from "@/components/admin/shell/internal/help-registry";
import { SUPPORT_HELP_REGISTRY } from "./help-corpus";
import { TALENT_HELP_ES } from "./help-corpus-es";
import { TALENT_EDITION_HELP_ES } from "./help-corpus-es-edition";

/**
 * The how-to articles at /help/articles/<slug> (TUL-1392). They are built from
 * the very entries the support AI retrieves from, so a reader of /help and the
 * assistant never disagree. One article per Edition pillar; an article may join
 * several registry entries (payments and plans is deposits + payouts + plan).
 */
export type HelpArticleDef = {
  slug: string;
  title: { en: string; es: string };
  summary: { en: string; es: string };
  /** Registry keys, in reading order. */
  keys: readonly string[];
};

export const HELP_ARTICLES: readonly HelpArticleDef[] = [
  {
    slug: "payments-and-plans",
    title: { en: "Payments, deposits and plans", es: "Pagos, anticipos y planes" },
    summary: {
      en: "Charge a deposit, get paid to your bank, and choose or change your plan.",
      es: "Cobra un anticipo, recibe tus pagos en tu banco y elige o cambia tu plan.",
    },
    keys: ["talent-deposits", "talent-payouts", "talent-plan"],
  },
  {
    slug: "promos",
    title: { en: "Promos and discounts", es: "Promos y descuentos" },
    summary: {
      en: "Fill the days you have free with a discount, a free extra or a secret code.",
      es: "Llena los días que tienes libres con un descuento, un extra gratis o un código secreto.",
    },
    keys: ["talent-promos"],
  },
  {
    slug: "posts",
    title: { en: "Posts for your website", es: "Posts para tu sitio web" },
    summary: {
      en: "Write short articles that help people find you on Google.",
      es: "Escribe artículos cortos que ayudan a que te encuentren en Google.",
    },
    keys: ["talent-posts"],
  },
  {
    slug: "client-accounts",
    title: { en: "Client accounts", es: "Cuentas de clientes" },
    summary: {
      en: "Your clients sign in to see their bookings, messages and receipts.",
      es: "Tus clientes inician sesión para ver sus reservas, mensajes y recibos.",
    },
    keys: ["talent-client-account"],
  },
  {
    slug: "get-found-on-google",
    title: { en: "Get found on Google", es: "Que te encuentren en Google" },
    summary: {
      en: "Your score, your Google Business Profile and Search Console, step by step.",
      es: "Tu puntuación, tu Perfil de Negocio de Google y Search Console, paso a paso.",
    },
    keys: ["talent-get-found"],
  },
  {
    slug: "themes-and-services",
    title: { en: "Themes and how your services show", es: "Temas y cómo se ven tus servicios" },
    summary: {
      en: "Change your design and manage the services your page shows.",
      es: "Cambia tu diseño y administra los servicios que muestra tu página.",
    },
    keys: ["talent-design", "talent-presence", "talent-services"],
  },
  {
    slug: "support",
    title: { en: "Getting help", es: "Cómo pedir ayuda" },
    summary: {
      en: "Ask a question, chat with a person, open a ticket or send an idea.",
      es: "Haz una pregunta, chatea con una persona, abre un ticket o envía una idea.",
    },
    keys: ["talent-support"],
  },
];

export type HelpArticleSection = Pick<HelpEntry, "category" | "purpose" | "youCanHere"> & {
  key: string;
  faqs: { q: string; a: string }[];
};

export type HelpArticle = {
  slug: string;
  title: string;
  summary: string;
  sections: HelpArticleSection[];
};

function registryFor(lang: "en" | "es"): Partial<Record<string, HelpEntry>> {
  return lang === "es"
    ? { ...SUPPORT_HELP_REGISTRY, ...TALENT_HELP_ES, ...TALENT_EDITION_HELP_ES }
    : SUPPORT_HELP_REGISTRY;
}

export function getHelpArticle(slug: string, locale: string | null | undefined): HelpArticle | null {
  const def = HELP_ARTICLES.find((a) => a.slug === slug);
  if (!def) return null;
  const lang = (locale ?? "").toLowerCase().startsWith("es") ? "es" : "en";
  const registry = registryFor(lang);
  const sections: HelpArticleSection[] = [];
  for (const key of def.keys) {
    const e = registry[key];
    if (!e) continue;
    sections.push({
      key,
      category: e.category,
      purpose: e.purpose,
      youCanHere: e.youCanHere,
      faqs: e.faqs ?? [],
    });
  }
  return { slug: def.slug, title: def.title[lang], summary: def.summary[lang], sections };
}

export function listHelpArticles(locale: string | null | undefined): { slug: string; title: string; summary: string }[] {
  const lang = (locale ?? "").toLowerCase().startsWith("es") ? "es" : "en";
  return HELP_ARTICLES.map((a) => ({ slug: a.slug, title: a.title[lang], summary: a.summary[lang] }));
}
