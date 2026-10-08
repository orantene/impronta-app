/**
 * AUD-027 + DS-62: the talent-site header CTA is often seeded as the English
 * default "Inquire" and saved into every shell tree. The renderer localises the
 * untouched seeded label at render time, and on bookable sites (instant /
 * request) rewrites that ask CTA to a booking verb + `#services` so a lash
 * studio does not lead with shouty "Escríbeme" / "Hacer una pregunta" alone.
 * A label the talent typed themselves is never rewritten.
 */

import type { SiteCtaMode } from "./design-label-locale";

const SEEDED_CTA_LABEL = "inquire";

/** Seeded / locale-localised ask labels the booking rewrite may replace. */
const SEEDED_ASK_LABELS = new Set([
  "inquire",
  "escríbeme",
  "write me",
  "ask",
  "write to me",
]);

const CTA_LABEL_BY_LOCALE: Record<string, string> = {
  en: "Inquire",
  es: "Escríbeme",
};

const BOOK_CTA_BY_MODE: Record<"instant" | "request", Record<string, string>> = {
  instant: { en: "Book now", es: "Reservar" },
  request: { en: "Request a time", es: "Solicitar cita" },
};

const BOOK_CTA_HREF = "#services";

function localeKey(locale: string | null | undefined): string {
  return (locale ?? "").trim().toLowerCase().slice(0, 2);
}

// Ticket #209: the overlay half of the header labels lives in header-i18n.ts.
export { headerSectionProps } from "./header-i18n";

/** The header CTA label for a locale ("Inquire" / "Escríbeme"). */
export function talentHeaderCtaLabel(locale: string | null | undefined): string {
  return CTA_LABEL_BY_LOCALE[localeKey(locale)] ?? "Inquire";
}

/** Booking-mode header label for a bookable site (instant / request). */
export function talentHeaderBookCtaLabel(
  locale: string | null | undefined,
  mode: "instant" | "request",
): string {
  const key = localeKey(locale);
  const row = BOOK_CTA_BY_MODE[mode];
  return row[key] ?? row.en;
}

function isSeededAskLabel(label: unknown): boolean {
  return typeof label === "string" && SEEDED_ASK_LABELS.has(label.trim().toLowerCase());
}

function localiseLabel(label: unknown, locale: string): unknown {
  if (typeof label !== "string") return label;
  return label.trim().toLowerCase() === SEEDED_CTA_LABEL
    ? talentHeaderCtaLabel(locale)
    : label;
}

function mapCta(
  cta: Record<string, unknown>,
  locale: string,
  mode: SiteCtaMode | null | undefined,
): Record<string, unknown> {
  const localised = { ...cta, label: localiseLabel(cta.label, locale) };
  if (mode !== "instant" && mode !== "request") return localised;
  if (!isSeededAskLabel(localised.label) && !isSeededAskLabel(cta.label)) return localised;
  return {
    ...localised,
    label: talentHeaderBookCtaLabel(locale, mode),
    href: BOOK_CTA_HREF,
  };
}

/**
 * Returns a copy of `site_header` sectionProps with the seeded CTA labels
 * (`primaryCta.label` and any `regions.*[type=cta].label`) localised, and on
 * bookable sites rewritten to a booking CTA. Custom talent labels stay.
 */
export function localiseTalentHeaderDefaults(
  sectionProps: unknown,
  locale: string | null | undefined,
  mode: SiteCtaMode | null | undefined = null,
): unknown {
  const key = localeKey(locale);
  const bookable = mode === "instant" || mode === "request";
  // English + inquiry: only rewrite when bookable; otherwise leave EN seeds alone.
  if ((!key || key === "en") && !bookable) return sectionProps;
  if (!sectionProps || typeof sectionProps !== "object") return sectionProps;
  const props = { ...(sectionProps as Record<string, unknown>) };
  const loc = key || "en";

  const cta = props.primaryCta;
  if (cta && typeof cta === "object") {
    props.primaryCta = mapCta(cta as Record<string, unknown>, loc, mode);
  }

  const regions = props.regions;
  if (regions && typeof regions === "object") {
    const next: Record<string, unknown> = {};
    for (const [slot, items] of Object.entries(regions as Record<string, unknown>)) {
      next[slot] = Array.isArray(items)
        ? items.map((item) => {
            if (!item || typeof item !== "object") return item;
            const it = item as Record<string, unknown>;
            return it.type === "cta" && "label" in it ? mapCta(it, loc, mode) : it;
          })
        : items;
    }
    props.regions = next;
  }
  return props;
}

/** True when a header CTA href points at the ask / chat entry. */
export function isTalentAskHref(href: unknown): boolean {
  if (typeof href !== "string") return false;
  const h = href.trim();
  return h === "#talent-ask" || h.endsWith("#talent-ask") || h.includes("inquire=1");
}

/**
 * Drop Ask / Escríbeme header CTAs when site switches hide ask entry points
 * (chat off + inquiries off). Prevents the SSR flash that TalentSiteContactBridge
 * used to hide after paint.
 */
export function stripHiddenAskHeaderCta(
  sectionProps: unknown,
  askVisible: boolean,
): unknown {
  if (askVisible) return sectionProps;
  if (!sectionProps || typeof sectionProps !== "object") return sectionProps;
  const props = { ...(sectionProps as Record<string, unknown>) };

  const cta = props.primaryCta;
  if (cta && typeof cta === "object" && isTalentAskHref((cta as Record<string, unknown>).href)) {
    delete props.primaryCta;
  }

  const regions = props.regions;
  if (regions && typeof regions === "object") {
    const next: Record<string, unknown> = {};
    for (const [slot, items] of Object.entries(regions as Record<string, unknown>)) {
      next[slot] = Array.isArray(items)
        ? items.filter((item) => {
            if (!item || typeof item !== "object") return true;
            const it = item as Record<string, unknown>;
            if (it.type === "cta" && isTalentAskHref(it.href)) return false;
            return true;
          })
        : items;
    }
    props.regions = next;
  }
  return props;
}
