/**
 * AUD-027: the talent-site header CTA is seeded as the English default
 * "Inquire" (default-max-site-trees.ts) and saved into every shell tree, so a
 * Spanish site showed "INQUIRE". Rather than migrate saved trees, the renderer
 * localises the untouched seeded label at render time. A label the talent
 * typed themselves is never rewritten.
 */

const SEEDED_CTA_LABEL = "inquire";

const CTA_LABEL_BY_LOCALE: Record<string, string> = {
  en: "Inquire",
  es: "Escríbeme",
};

function localeKey(locale: string | null | undefined): string {
  return (locale ?? "").trim().toLowerCase().slice(0, 2);
}

/** The header CTA label for a locale ("Inquire" / "Escríbeme"). */
export function talentHeaderCtaLabel(locale: string | null | undefined): string {
  return CTA_LABEL_BY_LOCALE[localeKey(locale)] ?? "Inquire";
}

function localiseLabel(label: unknown, locale: string): unknown {
  if (typeof label !== "string") return label;
  return label.trim().toLowerCase() === SEEDED_CTA_LABEL
    ? talentHeaderCtaLabel(locale)
    : label;
}

/**
 * Returns a copy of `site_header` sectionProps with the seeded CTA labels
 * (`primaryCta.label` and any `regions.*[type=cta].label`) localised. Returns
 * the input unchanged for English or non-object input.
 */
export function localiseTalentHeaderDefaults(
  sectionProps: unknown,
  locale: string | null | undefined,
): unknown {
  const key = localeKey(locale);
  if (!key || key === "en") return sectionProps;
  if (!sectionProps || typeof sectionProps !== "object") return sectionProps;
  const props = { ...(sectionProps as Record<string, unknown>) };

  const cta = props.primaryCta;
  if (cta && typeof cta === "object") {
    const c = cta as Record<string, unknown>;
    props.primaryCta = { ...c, label: localiseLabel(c.label, key) };
  }

  const regions = props.regions;
  if (regions && typeof regions === "object") {
    const next: Record<string, unknown> = {};
    for (const [slot, items] of Object.entries(regions as Record<string, unknown>)) {
      next[slot] = Array.isArray(items)
        ? items.map((item) => {
            if (!item || typeof item !== "object") return item;
            const it = item as Record<string, unknown>;
            return it.type === "cta" && "label" in it
              ? { ...it, label: localiseLabel(it.label, key) }
              : it;
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
