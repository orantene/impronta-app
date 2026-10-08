/**
 * Ticket #209 - the talent header's nav and CTA labels can hold a translation.
 *
 * The header (`site_header` section) keeps its labels inside `sectionProps`,
 * not on node props, so the flat overlay of the other blocks does not reach
 * them. The header node carries them as DOTTED keys prefixed `sectionProps.`:
 *
 *   props.i18n.es["sectionProps.navItems.0.label"]       = "Trabajos"
 *   props.i18n.es["sectionProps.primaryCta.label"]       = "Escríbeme"
 *   props.i18n.es["sectionProps.regions.right.5.label"]  = "Escríbeme"
 *
 * `headerSectionProps` returns the header's `sectionProps` with the overlay
 * for `locale` applied, BEFORE `stripHiddenAskHeaderCta` runs (the indexes
 * address the stored header). TUL-369: the Inquire→Escríbeme guess map is
 * gone; Spanish comes from `props.i18n` overlays (seed-i18n). A key whose
 * path does not already hold a string is skipped (an overlay translates
 * existing copy, it never invents structure). No overlay for the locale
 * returns the stored `sectionProps` unchanged (same object), so the output
 * is byte-identical.
 *
 * Pure (no React / no IO).
 */

export const HEADER_OVERLAY_PREFIX = "sectionProps.";

type Bag = Record<string, unknown>;

interface HeaderNodeLike {
  props?: unknown;
  i18n?: unknown;
}

function isBag(value: unknown): value is Bag {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `es-MX` -> `es`; the overlay is keyed by the two-letter language. */
function languageOf(locale: string | null | undefined): string {
  return (locale ?? "").trim().toLowerCase().split(/[-_]/)[0] ?? "";
}

function readString(root: unknown, segments: readonly string[]): string | undefined {
  let cur: unknown = root;
  for (const seg of segments) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = Array.isArray(cur) ? cur[Number(seg)] : (cur as Bag)[seg];
  }
  return typeof cur === "string" ? cur : undefined;
}

function writeString<T>(root: T, segments: readonly string[], value: string): T {
  const [head, ...rest] = segments;
  if (head === undefined) return root;
  if (Array.isArray(root)) {
    const index = Number(head);
    if (!Number.isInteger(index) || index < 0 || index >= root.length) return root;
    const copy: unknown[] = [...root];
    copy[index] = rest.length === 0 ? value : writeString(copy[index], rest, value);
    return copy as unknown as T;
  }
  if (!isBag(root)) return root;
  return {
    ...root,
    [head]: rest.length === 0 ? value : writeString(root[head], rest, value),
  } as T;
}

/** The overlay bag for `locale` on a header node (`node.i18n`, else `props.i18n`). */
function overlayFor(node: HeaderNodeLike, locale: string | null | undefined): Bag | null {
  const props = isBag(node.props) ? node.props : {};
  const overlay = isBag(node.i18n) ? node.i18n : isBag(props.i18n) ? props.i18n : null;
  if (!overlay) return null;
  const exact = (locale ?? "").trim();
  const bag = overlay[exact] ?? overlay[exact.toLowerCase()] ?? overlay[languageOf(locale)];
  return isBag(bag) ? bag : null;
}

/** The header's `sectionProps` with the `sectionProps.*` overlay for `locale`. */
export function headerSectionProps(
  node: HeaderNodeLike,
  locale: string | null | undefined,
): unknown {
  const props = isBag(node.props) ? node.props : {};
  const stored = props.sectionProps ?? {};
  const bag = overlayFor(node, locale);
  if (!bag) return stored;
  let next: unknown = stored;
  for (const [key, value] of Object.entries(bag)) {
    if (!key.startsWith(HEADER_OVERLAY_PREFIX) || typeof value !== "string") continue;
    const text = value.trim();
    if (!text) continue;
    const segments = key.slice(HEADER_OVERLAY_PREFIX.length).split(".");
    if (readString(next, segments) === undefined) continue;
    next = writeString(next, segments, text);
  }
  return next;
}

/**
 * Every visitor-facing label the header keeps in `sectionProps`, as
 * `{ key, text }` where `key` is the overlay key WITHOUT the `sectionProps.`
 * prefix (`navItems.0.label`, `primaryCta.label`, `regions.right.5.label`).
 * The seed walker and the static test share this one definition so neither can
 * drift from what `headerSectionProps` accepts.
 */
export function headerLabelEntries(sectionProps: unknown): Array<{ key: string; text: string }> {
  const out: Array<{ key: string; text: string }> = [];
  if (!isBag(sectionProps)) return out;
  const push = (key: string, value: unknown): void => {
    if (typeof value === "string" && value.trim()) out.push({ key, text: value });
  };
  if (Array.isArray(sectionProps.navItems)) {
    sectionProps.navItems.forEach((item, i) => {
      if (isBag(item)) push(`navItems.${i}.label`, item.label);
    });
  }
  if (isBag(sectionProps.primaryCta)) push("primaryCta.label", sectionProps.primaryCta.label);
  if (isBag(sectionProps.regions)) {
    for (const [slot, items] of Object.entries(sectionProps.regions)) {
      if (!Array.isArray(items)) continue;
      items.forEach((item, i) => {
        if (isBag(item) && item.type === "cta") push(`regions.${slot}.${i}.label`, item.label);
      });
    }
  }
  return out;
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
