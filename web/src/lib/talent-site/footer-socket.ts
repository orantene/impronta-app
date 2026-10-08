/**
 * Global Tulala footer socket: the pure model (no IO, no React).
 *
 * ONE shared bottom strip rendered by every talent site under each design's
 * own footer. This file decides WHAT the strip says; `TalentSiteSocket`
 * paints it. Keeping the decision pure lets one test cover every design.
 *
 * - Talent policy links point at routes on the talent host (built elsewhere).
 * - Tulala's own terms and privacy live off-host, on the marketing domain.
 * - "Privacy choices" shows only when consent tooling is enabled.
 * - The language switch shows only when the site has 2+ languages.
 * - The "Hecho con Tulala" credit is hidden when whitelabel; the Tulala
 *   document links stay.
 */
import { pickLocale } from "@/lib/i18n/pick-locale";

export const TULALA_LEGAL_TERMS_URL = "https://tulala.digital/legal/terms";
export const TULALA_LEGAL_PRIVACY_URL = "https://tulala.digital/legal/privacy";
export const TULALA_HOME_URL = "https://tulala.digital";
export const TULALA_LEGAL_COOKIES_URL = "https://tulala.digital/legal/cookies";
export const TULALA_LEGAL_REFUNDS_URL = "https://tulala.digital/legal/refunds";

/** Legal pages keep one language per URL; a Spanish site links the /es/ copy. */
export function localizedLegalUrl(url: string, locale: string | null | undefined): string {
  return (locale ?? "").toLowerCase().startsWith("es") ? url.replace("tulala.digital/legal/", "tulala.digital/es/legal/") : url;
}

/** Talent-host policy routes (served by the policy-pages work). */
export const TALENT_BOOKING_POLICY_PATH = "/politicas";
export const TALENT_PRIVACY_PATH = "/privacidad";
export const TALENT_PRIVACY_CHOICES_PATH = "/privacidad#opciones";

/** The builder canvas hint (locked strip). */
export function socketLockedHint(locale: string | null | undefined): string {
  return pickLocale(locale, {
    en: "Tulala bar, looks the same on every design",
    es: "Barra de Tulala, se ve igual en todos los diseños",
  });
}

/** Server-side flag: consent tooling is not built yet, default off. */
export function socketConsentToolingEnabled(): boolean {
  return process.env.TALENT_SITE_CONSENT_TOOLING_ENABLED === "1";
}

export interface SocketLink {
  key: string;
  label: string;
  href: string;
  external: boolean;
}

export interface SocketLanguage {
  locale: string;
  label: string;
  href: string;
  current: boolean;
}

export interface SocketModel {
  /** The locale the site rendered in; the consent banner follows it. */
  locale?: string;
  siteGroupLabel: string;
  tulalaGroupLabel: string;
  langGroupLabel: string;
  siteLinks: SocketLink[];
  tulalaLinks: SocketLink[];
  languages: SocketLanguage[];
  /** null when whitelabel / paid plan hides the credit. `prefix` + linked `label`. */
  credit: { prefix: string; label: string; href: string } | null;
}

/**
 * The talent's short name for the strip's first group ("ALBA"): her display name
 * when it is short, otherwise its first word. Null when there is no usable name.
 */
export function shortTalentName(name: string | null | undefined): string | null {
  const full = (name ?? "").replace(/\s+/g, " ").trim();
  if (!full) return null;
  if (full.length <= 14) return full;
  const first = full.split(" ")[0] ?? "";
  return first.length > 0 ? first.slice(0, 14) : null;
}

interface HeaderLike {
  props?: { sectionProps?: { regions?: Record<string, unknown> } };
  children?: unknown;
}

/**
 * True when the header already carries a language switch (a `language` item in
 * its regions). The strip then drops its own language group: the language lives
 * in the header, never twice.
 */
export function headerShowsLanguageSwitch(headerTree: readonly unknown[]): boolean {
  for (const raw of headerTree) {
    const n = raw as HeaderLike;
    const regions = n?.props?.sectionProps?.regions;
    if (regions && typeof regions === "object") {
      for (const items of Object.values(regions)) {
        if (Array.isArray(items) && items.some((i) => (i as { type?: unknown })?.type === "language")) return true;
      }
    }
    if (Array.isArray(n?.children) && headerShowsLanguageSwitch(n.children as unknown[])) return true;
  }
  return false;
}

const LANGUAGE_LABELS: Record<string, string> = {
  es: "Español",
  en: "English",
};

export function buildSocketModel(input: {
  locale: string;
  /** "" on a talent host; "/t/site/<slug>" on the platform path form. */
  publicPathPrefix: string;
  supportedLocales: readonly string[];
  switcherHrefs?: Readonly<Record<string, string>>;
  /** Attribution wanted (plan gate). */
  showCredit: boolean;
  /** Agency whitelabel hides the credit whatever the plan. */
  whitelabel: boolean;
  consentTooling: boolean;
  /**
   * Replaces the talent-host policy links. Legacy `/t/[profileCode]` pages pass
   * `[]` (no talent policy routes there); agency storefronts pass their own
   * policy pages. Omit for the talent-site default.
   */
  siteLinks?: readonly SocketLink[];
  /** The talent's display name: the first group is labelled with it ("Alba"). */
  talentName?: string | null;
  /** The header already has a language switch, so the strip does not repeat it. */
  headerHasLanguageSwitch?: boolean;
}): SocketModel {
  const { locale } = input;
  const prefix = input.publicPathPrefix.replace(/\/+$/, "");

  const siteLinks: SocketLink[] = [
    {
      key: "booking-policy",
      label: pickLocale(locale, { en: "Booking policies", es: "Políticas de reserva" }),
      href: `${prefix}${TALENT_BOOKING_POLICY_PATH}`,
      external: false,
    },
    {
      key: "privacy",
      label: pickLocale(locale, { en: "Privacy", es: "Privacidad" }),
      href: `${prefix}${TALENT_PRIVACY_PATH}`,
      external: false,
    },
  ];
  if (input.siteLinks) {
    siteLinks.length = 0;
    siteLinks.push(...input.siteLinks);
  } else if (input.consentTooling) {
    siteLinks.push({
      key: "privacy-choices",
      label: pickLocale(locale, { en: "Your privacy choices", es: "Tus opciones de privacidad" }),
      href: `${prefix}${TALENT_PRIVACY_CHOICES_PATH}`,
      external: false,
    });
  }

  const tulalaLinks: SocketLink[] = [
    {
      key: "tulala-terms",
      label: pickLocale(locale, { en: "Terms", es: "Términos" }),
      href: localizedLegalUrl(TULALA_LEGAL_TERMS_URL, locale),
      external: true,
    },
    {
      key: "tulala-privacy",
      label: pickLocale(locale, { en: "Privacy", es: "Privacidad" }),
      href: localizedLegalUrl(TULALA_LEGAL_PRIVACY_URL, locale),
      external: true,
    },
    {
      key: "tulala-cookies",
      // ES: drop the English loanword; EN keeps Cookies. Ownership is the Tulala group.
      label: pickLocale(locale, { en: "Cookies", es: "Política de cookies" }),
      href: localizedLegalUrl(TULALA_LEGAL_COOKIES_URL, locale),
      external: true,
    },
    {
      key: "tulala-refunds",
      label: pickLocale(locale, { en: "Refunds", es: "Reembolsos" }),
      href: localizedLegalUrl(TULALA_LEGAL_REFUNDS_URL, locale),
      external: true,
    },
  ];

  const hrefs = input.switcherHrefs;
  const languages: SocketLanguage[] =
    !input.headerHasLanguageSwitch && input.supportedLocales.length >= 2 && hrefs
      ? input.supportedLocales
          .filter((l) => typeof hrefs[l] === "string")
          .map((l) => ({
            locale: l,
            label: LANGUAGE_LABELS[l] ?? l.toUpperCase(),
            href: hrefs[l] as string,
            current: l === locale,
          }))
      : [];

  return {
    locale,
    siteGroupLabel: shortTalentName(input.talentName) ?? pickLocale(locale, { en: "This site", es: "Este sitio" }),
    tulalaGroupLabel: "Tulala",
    langGroupLabel: pickLocale(locale, { en: "Language", es: "Idioma" }),
    siteLinks,
    tulalaLinks,
    languages: languages.length >= 2 ? languages : [],
    credit:
      input.showCredit && !input.whitelabel
        ? {
            prefix: pickLocale(locale, { en: "Site made with", es: "Sitio creado con" }),
            label: "Tulala.digital",
            href: TULALA_HOME_URL,
          }
        : null,
  };
}

/**
 * Design-level credits the socket supersedes. Matches a stored paragraph whose
 * text is the old per-design credit (any locale), so the socket hides it at
 * RENDER time without a payload edit (payload changes ship as theme releases).
 */
const POLICY_HREF = /(terms|privacy|polic|legal|cookies|terminos|privacidad|politica|aviso)/i;

/** Agency footer nav links that are policy pages (terms, privacy, policies). */
export function pickPolicyLinks(
  links: readonly { href: string; label: string }[],
): SocketLink[] {
  return links
    .filter((l) => POLICY_HREF.test(l.href) || POLICY_HREF.test(l.label))
    .slice(0, 4)
    .map((l, i) => ({
      key: `agency-policy-${i}`,
      label: l.label,
      href: l.href,
      external: /^https?:\/\//i.test(l.href),
    }));
}

/** Pure: the agency socket model (policy pages if any, whitelabel hides credit). */
export function buildAgencySocketModel(input: {
  locale: string;
  whitelabel: boolean;
  footerLinks: readonly { href: string; label: string }[];
}): SocketModel {
  return buildSocketModel({
    locale: input.locale,
    publicPathPrefix: "",
    supportedLocales: [],
    showCredit: true,
    whitelabel: input.whitelabel,
    consentTooling: false,
    siteLinks: pickPolicyLinks(input.footerLinks),
  });
}

const DESIGN_CREDIT_TEXTS = new Set(["hecho con tulala", "made with tulala", "powered by tulala"]);

export function isDesignCreditText(text: unknown): boolean {
  if (typeof text !== "string") return false;
  const plain = text
    .replace(/\{\/?[a-z]\}|<\/?[a-z]+>/gi, "")
    .trim()
    .toLowerCase();
  return DESIGN_CREDIT_TEXTS.has(plain);
}

interface TreeNodeLike {
  kind?: unknown;
  props?: { text?: unknown };
  children?: unknown;
}

/** Drop design-level credit paragraphs from a shell tree (pure, non-mutating). */
export function stripDesignCredits<T>(nodes: readonly T[]): T[] {
  const out: T[] = [];
  for (const raw of nodes) {
    const n = raw as unknown as TreeNodeLike;
    if (n && n.kind === "paragraph" && isDesignCreditText(n.props?.text)) continue;
    if (n && Array.isArray(n.children)) {
      out.push({ ...(n as object), children: stripDesignCredits(n.children as unknown[]) } as T);
    } else {
      out.push(raw);
    }
  }
  return out;
}
