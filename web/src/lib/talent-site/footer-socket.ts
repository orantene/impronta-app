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
  siteGroupLabel: string;
  tulalaGroupLabel: string;
  langGroupLabel: string;
  siteLinks: SocketLink[];
  tulalaLinks: SocketLink[];
  languages: SocketLanguage[];
  /** null when whitelabel / paid plan hides the credit. */
  credit: { label: string; href: string } | null;
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
  if (input.consentTooling) {
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
      href: TULALA_LEGAL_TERMS_URL,
      external: true,
    },
    {
      key: "tulala-privacy",
      label: pickLocale(locale, { en: "Privacy", es: "Privacidad" }),
      href: TULALA_LEGAL_PRIVACY_URL,
      external: true,
    },
  ];

  const hrefs = input.switcherHrefs;
  const languages: SocketLanguage[] =
    input.supportedLocales.length >= 2 && hrefs
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
    siteGroupLabel: pickLocale(locale, { en: "This site", es: "Este sitio" }),
    tulalaGroupLabel: "Tulala",
    langGroupLabel: pickLocale(locale, { en: "Language", es: "Idioma" }),
    siteLinks,
    tulalaLinks,
    languages: languages.length >= 2 ? languages : [],
    credit:
      input.showCredit && !input.whitelabel
        ? {
            label: pickLocale(locale, { en: "Powered by Tulala", es: "Hecho con Tulala" }),
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
const DESIGN_CREDIT_TEXTS = new Set(["hecho con tulala", "made with tulala", "powered by tulala"]);

export function isDesignCreditText(text: unknown): boolean {
  return typeof text === "string" && DESIGN_CREDIT_TEXTS.has(text.trim().toLowerCase());
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
