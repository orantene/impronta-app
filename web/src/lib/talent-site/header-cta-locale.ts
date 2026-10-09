/**
 * TUL-369 split (PM 2026-10-09): header CTA guess kept as a FALLBACK only.
 *
 * New themes carry `props.i18n` overlays (`header-i18n.ts` + `seed-i18n.ts`).
 * This rewrites the untouched seeded English "Inquire" label for legacy
 * header trees that never got an overlay. Prefer overlays when present.
 * Follow-up PR deletes this file once missing-es recount is 0.
 */
import { SEED_TEXT_ES } from "./theme-catalog/seed-i18n";
import { warnGuessMapFallback } from "./design-label-locale";

const SEEDED_CTA_LABEL = "inquire";
const SEEDED_CTA_EN = "Inquire";
const SEEDED_CTA_ES = SEED_TEXT_ES[SEEDED_CTA_EN] ?? "Escríbeme";

function localeKey(locale: string | null | undefined): string {
  return (locale ?? "").trim().toLowerCase().slice(0, 2);
}

// Ticket #209: the overlay half of the header labels lives in header-i18n.ts.
export { headerSectionProps } from "./header-i18n";

/** The header CTA label for a locale ("Inquire" / "Escríbeme"). */
export function talentHeaderCtaLabel(locale: string | null | undefined): string {
  return localeKey(locale) === "es" ? SEEDED_CTA_ES : SEEDED_CTA_EN;
}

function localiseLabel(label: unknown, locale: string): unknown {
  if (typeof label !== "string") return label;
  return label.trim().toLowerCase() === SEEDED_CTA_LABEL
    ? talentHeaderCtaLabel(locale)
    : label;
}

/**
 * Returns a copy of `site_header` sectionProps with the seeded CTA labels
 * localised when there is no i18n overlay covering them. Returns the input
 * unchanged for English or non-object input.
 */
export function localiseTalentHeaderDefaults(
  sectionProps: unknown,
  locale: string | null | undefined,
  context?: { profileCode?: string | null; nodeKey?: string | null },
): unknown {
  const key = localeKey(locale);
  if (!key || key === "en") return sectionProps;
  if (!sectionProps || typeof sectionProps !== "object") return sectionProps;
  const props = { ...(sectionProps as Record<string, unknown>) };

  const cta = props.primaryCta;
  if (cta && typeof cta === "object") {
    const c = cta as Record<string, unknown>;
    const before = c.label;
    const after = localiseLabel(before, key);
    if (after !== before && typeof before === "string" && typeof after === "string") {
      warnGuessMapFallback({
        profileCode: context?.profileCode,
        nodeKey: context?.nodeKey ?? "shell/site_header",
        nodeKind: "section",
        locale: "es",
        path: "sectionProps.primaryCta.label",
        from: before,
        to: after,
      });
      props.primaryCta = { ...c, label: after };
    }
  }

  const regions = props.regions;
  if (regions && typeof regions === "object") {
    const next: Record<string, unknown> = {};
    for (const [slot, items] of Object.entries(regions as Record<string, unknown>)) {
      next[slot] = Array.isArray(items)
        ? items.map((item, idx) => {
            if (!item || typeof item !== "object") return item;
            const it = item as Record<string, unknown>;
            if (it.type !== "cta" || !("label" in it)) return item;
            const before = it.label;
            const after = localiseLabel(before, key);
            if (after !== before && typeof before === "string" && typeof after === "string") {
              warnGuessMapFallback({
                profileCode: context?.profileCode,
                nodeKey: context?.nodeKey ?? "shell/site_header",
                nodeKind: "section",
                locale: "es",
                path: `sectionProps.regions.${slot}.${idx}.label`,
                from: before,
                to: after,
              });
              return { ...it, label: after };
            }
            return item;
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
