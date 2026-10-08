/**
 * Web Office (paid) talent site: Instagram, TikTok and WhatsApp links in the
 * footer, with a WhatsApp message that names where the visitor came from.
 *
 * Pure. Render-time only: nothing here touches a design payload or a theme
 * seed, so authored-overlay snapshot hashes are unchanged. The Free plan never
 * reaches these functions (the gate below is false), so it renders as before.
 *
 * Labels live in this module's own small es/en table on purpose; they are
 * not in the message catalog.
 */
import { talentPlanGrantsSiteCapability } from "@/lib/access/talent-membership";

export type SocialRecord = { platform: string; href: string; label?: string };

export type WebOfficeLocale = "es" | "en";

export type WebOfficeLink = {
  platform: "instagram" | "tiktok" | "whatsapp";
  href: string;
  /** Short visible label. */
  label: string;
  /** Spoken label for assistive tech. */
  ariaLabel: string;
};

/** Paid Web Office only. `personalSiteSections` is a Web Office-only capability. */
export function webOfficeSocialEnabled(planKey: string | null | undefined): boolean {
  return talentPlanGrantsSiteCapability(planKey, "personalSiteSections");
}

export function webOfficeLocale(locale: string | null | undefined): WebOfficeLocale {
  return (locale ?? "").trim().toLowerCase().startsWith("es") ? "es" : "en";
}

const LABELS = {
  instagram: { es: "Instagram", en: "Instagram" },
  tiktok: { es: "TikTok", en: "TikTok" },
  whatsapp: { es: "WhatsApp", en: "WhatsApp" },
} as const;

const ARIA = {
  instagram: { es: "Mira mi Instagram", en: "See my Instagram" },
  tiktok: { es: "Mira mi TikTok", en: "See my TikTok" },
  whatsapp: { es: "Escríbeme por WhatsApp", en: "Message me on WhatsApp" },
} as const;

export const WEB_OFFICE_NAV_LABEL = { es: "Redes y contacto", en: "Social and contact" } as const;

/** Digits of a WhatsApp number in E.164 shape (8 to 15 digits, no leading 0), or null. */
export function normalizeWhatsappNumber(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return null;
  return digits;
}

/** The number inside a wa.me or api.whatsapp.com link she set, or null. */
export function whatsappNumberFromHref(href: string | null | undefined): string | null {
  const value = (href ?? "").trim();
  const wame = /^https:\/\/wa\.me\/\+?([\d\s-]+)(?:[/?#]|$)/i.exec(value);
  if (wame?.[1]) return normalizeWhatsappNumber(wame[1]);
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && /(^|\.)whatsapp\.com$/i.test(url.hostname)) {
      return normalizeWhatsappNumber(url.searchParams.get("phone"));
    }
  } catch {
    /* not a URL */
  }
  return null;
}

/** The prefilled message that names the source. No em dashes. */
export function whatsappMessage(locale: string | null | undefined, siteLabel: string | null | undefined): string {
  const site = (siteLabel ?? "").trim();
  if (webOfficeLocale(locale) === "es") {
    return `Hola, vengo de tu sitio web${site ? ` (${site})` : ""}. Quisiera reservar contigo.`;
  }
  return `Hi, I found you on your website${site ? ` (${site})` : ""}. I'd like to book with you.`;
}

/** `https://wa.me/<number>?text=<encoded>`, or null when there is no usable number. */
export function whatsappHref(input: {
  number: string | null | undefined;
  locale: string | null | undefined;
  siteLabel?: string | null;
}): string | null {
  const number = normalizeWhatsappNumber(input.number);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(whatsappMessage(input.locale, input.siteLabel))}`;
}

/** Her site's address for the message: host (plus `/t/site/<slug>` on the app host). Empty when unknown. */
export function siteAddressOf(input: {
  canonicalOrigin?: string | null;
  canonicalPath?: string | null;
  siteSlug?: string | null;
}): string {
  try {
    const host = new URL(input.canonicalOrigin ?? "").host;
    if (!host) return "";
    const slug = (input.siteSlug ?? "").trim();
    const root = slug ? `/t/site/${slug}` : "";
    const onAppPath = root !== "" && (input.canonicalPath ?? "").startsWith(root);
    return onAppPath ? `${host}${root}` : host;
  } catch {
    return "";
  }
}

/** Swap her WhatsApp record for the prefilled link. Records without a readable number pass through. */
export function withSourceWhatsapp(records: SocialRecord[], locale: string, siteLabel: string): SocialRecord[] {
  return records.map((rec) => {
    if (rec.platform !== "whatsapp") return rec;
    const href = whatsappHref({ number: whatsappNumberFromHref(rec.href), locale, siteLabel });
    return href ? { ...rec, href } : rec;
  });
}

/** The links to show: Instagram, TikTok, WhatsApp, in that order, only those she has. Never invented. */
export function webOfficeLinks(records: SocialRecord[], locale: string, siteLabel: string): WebOfficeLink[] {
  const lang = webOfficeLocale(locale);
  const out: WebOfficeLink[] = [];
  for (const platform of ["instagram", "tiktok", "whatsapp"] as const) {
    const rec = records.find((r) => r.platform === platform);
    if (!rec) continue;
    let href: string | null;
    if (platform === "whatsapp") {
      href = whatsappHref({ number: whatsappNumberFromHref(rec.href), locale, siteLabel });
    } else {
      href = /^https:\/\//i.test(rec.href.trim()) ? rec.href.trim() : null;
    }
    if (!href) continue;
    out.push({ platform, href, label: LABELS[platform][lang], ariaLabel: ARIA[platform][lang] });
  }
  return out;
}
