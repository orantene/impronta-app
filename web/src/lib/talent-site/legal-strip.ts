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
 * - talent   -> the talent's own booking policy / privacy pages first, when they exist
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
  key: "booking-policy" | "talent-privacy" | "privacy" | "terms" | "cookies" | "report";
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
  /**
   * The talent's own policy pages (booking policy, privacy), already localized
   * hrefs on the talent host. Passed only when those pages exist; they lead the
   * strip, before Tulala's own links. Anything else is ignored.
   */
  talentLinks?: readonly { key: string; href: string }[];
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
  const talentLabels: Record<string, string> = {
    "booking-policy": pickLocale(locale, { en: "Booking policies", es: "Políticas de reserva" }),
    "talent-privacy": pickLocale(locale, { en: "Privacy", es: "Privacidad" }),
  };
  const talentLinks: LegalStripLink[] = [];
  for (const key of ["booking-policy", "talent-privacy"] as const) {
    const found = (input.talentLinks ?? []).find((l) => (l.key === key || (key === "talent-privacy" && l.key === "privacy")) && l.href.trim());
    if (found) talentLinks.push({ key, label: talentLabels[key]!, href: found.href });
  }
  return {
    locale,
    ariaLabel: pickLocale(locale, { en: "Tulala legal", es: "Aviso legal de Tulala" }),
    credit: {
      label: pickLocale(locale, { en: "Made with Tulala", es: "Hecho con Tulala" }),
      href: origin,
    },
    links: [
      ...talentLinks,
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
