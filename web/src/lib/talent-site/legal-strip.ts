/**
 * TUL-889: the slim Tulala legal strip, the pure model (no IO, no React).
 *
 * Every PUBLIC site (talent sites, hub profiles /t/<code>) ends with one strip
 * under its own footer: "Hecho con Tulala" plus Privacidad, Términos, Cookies,
 * Reportar in the site's language. It replaces the old multi-group Tulala
 * socket band that read as a second footer (TUL-796).
 *
 * The strip is NOT a tenant setting: nothing here reads whitelabel, plan or
 * theme input, so no talent can edit or hide it. Business admin workspaces
 * never mount it.
 *
 * Links (all existing routes on the marketing host):
 * - credit   -> marketing home
 * - legal    -> /legal/{privacy,terms,cookies} (`/es/legal/...` on Spanish sites)
 * - report   -> /contact?source=report (there is no dedicated report route; the
 *               contact page is the support path, the same one Help uses), with
 *               host + talent code so the ticket names the site being reported.
 */
import { pickLocale } from "@/lib/i18n/pick-locale";
import type { SocketLanguage } from "@/lib/talent-site/footer-socket";

/** Production marketing origin; server callers pass `resolveMarketingOrigin()`. */
const PRODUCTION_ORIGIN = "https://tulala.digital";

export interface LegalStripLink {
  key: "privacy" | "terms" | "cookies" | "report";
  label: string;
  href: string;
}

export interface LegalStripModel {
  locale: string;
  ariaLabel: string;
  credit: { label: string; href: string };
  links: LegalStripLink[];
  /** Language switch, only when the site has 2+ languages and no header switch. */
  languages: SocketLanguage[];
  langLabel: string;
}

function isSpanish(locale: string): boolean {
  return locale.toLowerCase().startsWith("es");
}

function cleanOrigin(origin: string | null | undefined): string {
  const o = (origin ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(o) ? o : PRODUCTION_ORIGIN;
}

export function buildLegalStripModel(input: {
  locale: string;
  /** `resolveMarketingOrigin()` from the server caller; omitted = production. */
  marketingOrigin?: string | null;
  /** Report context: which site the visitor is reporting. */
  profileCode?: string | null;
  siteHost?: string | null;
  languages?: readonly SocketLanguage[];
}): LegalStripModel {
  const { locale } = input;
  const origin = cleanOrigin(input.marketingOrigin);
  const lang = isSpanish(locale) ? "/es" : "";
  const legal = (doc: string) => `${origin}${lang}/legal/${doc}`;

  const params = new URLSearchParams();
  params.set("source", "report");
  const host = (input.siteHost ?? "").trim();
  const code = (input.profileCode ?? "").trim();
  if (host) params.set("host", host);
  if (code) params.set("code", code);

  const languages = input.languages ?? [];
  return {
    locale,
    ariaLabel: pickLocale(locale, { en: "Tulala legal", es: "Aviso legal de Tulala" }),
    credit: {
      label: pickLocale(locale, { en: "Made with Tulala", es: "Hecho con Tulala" }),
      href: origin,
    },
    links: [
      { key: "privacy", label: pickLocale(locale, { en: "Privacy", es: "Privacidad" }), href: legal("privacy") },
      { key: "terms", label: pickLocale(locale, { en: "Terms", es: "Términos" }), href: legal("terms") },
      { key: "cookies", label: "Cookies", href: legal("cookies") },
      {
        key: "report",
        label: pickLocale(locale, { en: "Report", es: "Reportar" }),
        href: `${origin}${lang}/contact?${params.toString()}`,
      },
    ],
    languages: languages.length >= 2 ? [...languages] : [],
    langLabel: pickLocale(locale, { en: "Language", es: "Idioma" }),
  };
}
