type MaybeRecord = Record<string, unknown> | null | undefined;

interface CtaLike {
  label: string;
  href: string;
}

function asRecord(value: unknown): MaybeRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isSectionHidden(props: MaybeRecord): boolean {
  const presentation = asRecord(props?.presentation);
  return asString(presentation?.visibility) === "hidden";
}

export function isInquiryIntentLabel(label: string | null | undefined): boolean {
  const text = (label ?? "").trim().toLowerCase();
  if (!text) return false;
  return /(book|inquir|contact|request|quote|availability|consult|hire)/i.test(
    text,
  );
}

export function isValidInquiryCtaHref(href: string | null | undefined): boolean {
  const value = (href ?? "").trim().toLowerCase();
  if (!value || value === "#" || value === "/") return false;
  if (value.startsWith("mailto:") || value.startsWith("tel:")) return true;
  if (value.startsWith("http://") || value.startsWith("https://")) return true;
  if (value.startsWith("#contact") || value.startsWith("#inquiry")) return true;
  if (
    /^\/([a-z]{2}\/)?(contact|inquiry|inquiries|book|booking|request|quote)(\/|$)/i.test(
      value,
    )
  ) {
    return true;
  }
  return false;
}

function collectCtas(props: MaybeRecord): CtaLike[] {
  if (!props) return [];
  const out: CtaLike[] = [];
  const keys = ["primaryCta", "secondaryCta", "footerCta", "cta"] as const;
  for (const key of keys) {
    const cta = asRecord(props[key]);
    if (!cta) continue;
    const label = asString(cta.label);
    const href = asString(cta.href);
    if (!label && !href) continue;
    out.push({ label, href });
  }
  return out;
}

/**
 * H-4: the phone section switcher reads the header's own menu links, so it
 * needs at least two that point at a section of the page (`#services`).
 * Fewer and the switcher renders nothing; say so before publish.
 */
export function findSectionSwitcherIssues(
  sectionName: string,
  sectionTypeKey: string,
  props: MaybeRecord,
): string[] {
  if (sectionTypeKey !== "site_header" || !props || isSectionHidden(props)) return [];
  const regions = asRecord(props.regions);
  const placed = ["left", "center", "right"].some((zone) => {
    const items = regions?.[zone];
    return Array.isArray(items) && items.some((i) => asRecord(i)?.type === "section_switcher");
  });
  if (!placed || !Array.isArray(props.navItems)) return [];
  const anchors = props.navItems.filter((i) => asString(asRecord(i)?.href).length > 1 && asString(asRecord(i)?.href).startsWith("#"));
  return anchors.length >= 2
    ? []
    : [`${sectionName}: the section switcher needs at least two menu links that point to sections of the page.`];
}

export function findInvalidInquiryCtas(
  sectionName: string,
  props: MaybeRecord,
): string[] {
  if (!props || isSectionHidden(props)) return [];
  return collectCtas(props)
    .filter((cta) => isInquiryIntentLabel(cta.label))
    .filter((cta) => !isValidInquiryCtaHref(cta.href))
    .map(
      (cta) =>
        `${sectionName}: "${cta.label}" should link to a contact/inquiry destination.`,
    );
}
