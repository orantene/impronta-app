/**
 * Site-wide booking CTA mode + render-time remaps that depend on it.
 *
 * TUL-369 split (PM 2026-10-09): seeded copy prefers `props.i18n.es` /
 * `props.i18n.en` (see `theme-catalog/seed-i18n.ts`). The EN↔ES guess maps in
 * `design-label-locale.ts` / `header-cta-locale.ts` stay as a FALLBACK only
 * when a node has no overlay for the target locale (dev warning + heal via
 * `qa:heal-seed-i18n-missing-es`). This module also:
 *   - resolves the site CTA mode (posture + plan ceiling);
 *   - rewrites mode-dependent action copy (`SEEDED_MODE_COPY`);
 *   - remaps Folio's legacy "Book" → #gallery nav to Work / Trabajos;
 *   - applies per-talent locale swaps.
 *
 * A label the talent edited no longer matches a seed exactly and is never
 * rewritten.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { parseSellingBookingSettings } from "@/lib/talent/selling-booking-settings";
import {
  guessSeededLabelFallback,
  nodeHasLocaleOverlay,
  warnGuessMapFallback,
  type GuessLabelTarget,
} from "./design-label-locale";
import { localiseTalentHeaderDefaults } from "./header-cta-locale";
import { DESIGN_ORIGIN_PROP, type DesignOrigin } from "@/lib/site-admin/builder-node/design-origin";

/** The talent's site-wide booking mode (posture after the plan ceiling). */
export type SiteCtaMode = "instant" | "request" | "inquiry";

/**
 * Site-wide CTA mode: the talent default posture (`selling_defaults`), with
 * the plan ceiling applied the same way deriveOfferingCta does (a plan that
 * confirms by hand turns instant into request).
 */
export function resolveSiteCtaMode(input: {
  sellingDefaults: unknown;
  confirmsByHand: boolean;
  /** false = instant cannot work yet (no working hours): same readiness step as resolveEffectiveBookingMode. */
  instantReady?: boolean;
}): SiteCtaMode {
  const posture = parseSellingBookingSettings(input.sellingDefaults).bookingPosture;
  if (posture === "instant" && input.confirmsByHand) return "request";
  if (posture === "instant" && input.instantReady === false) return "request";
  return posture;
}

type ModeCopy = Readonly<Record<SiteCtaMode, { en: string; es: string }>>;

/**
 * Seeded ACTION copy that must follow the booking mode, not just the locale.
 * A site in inquiry mode never promises online booking; an instant site never
 * reads as "write to me". Keys are exact seed strings (current and legacy).
 */
const SEEDED_MODE_COPY: Readonly<Record<string, ModeCopy>> = {
  "Inquire for bookings": {
    instant: { en: "Book online", es: "Reserva en línea" },
    request: { en: "Request an appointment", es: "Solicita una cita" },
    inquiry: { en: "Write to me for a quote", es: "Escríbeme para cotizar" },
  },
  "Book a session": {
    instant: { en: "Book a session", es: "Reserva una sesión" },
    request: { en: "Request a session", es: "Solicita una sesión" },
    inquiry: { en: "Write to me for a quote", es: "Escríbeme para cotizar" },
  },
  Book: {
    instant: { en: "Book", es: "Reserva" },
    request: { en: "Request", es: "Solicitar" },
    inquiry: { en: "Quote", es: "Cotizar" },
  },
  // Maison v2 hero primary: the booking mode picks the verb.
  "Reserve a time": {
    instant: { en: "Book now", es: "Reservar" },
    request: { en: "Request a time", es: "Solicitar cita" },
    inquiry: { en: "Ask for a quote", es: "Pide una cotización" },
  },
  Booking: {
    instant: { en: "Booking", es: "Reservas" },
    request: { en: "Appointments", es: "Citas" },
    inquiry: { en: "Quotes", es: "Cotizaciones" },
  },
  // Maison v2 2.7 footer button: the booking mode picks the verb.
  "Book an appointment": {
    instant: { en: "Book an appointment", es: "Reservar cita" },
    request: { en: "Request an appointment", es: "Solicitar cita" },
    inquiry: { en: "Write to me", es: "Escríbeme" },
  },
};

/** Spanish mode copy -> its entry, so a Spanish seed follows the mode in English. */
const SEEDED_MODE_COPY_BY_ES: Readonly<Record<string, ModeCopy>> = (() => {
  const out: Record<string, ModeCopy> = {};
  for (const copy of Object.values(SEEDED_MODE_COPY)) {
    for (const line of Object.values(copy)) if (!(line.es in out)) out[line.es] = copy;
  }
  return out;
})();

/**
 * Folio used to seed its GALLERY nav link as "Book" (a model's book of work).
 * That is not a booking action: it reads as "Work" whatever the mode.
 */
const WORK_LABEL = { en: "Work", es: "Trabajos" } as const;

/** Node props that carry visible label copy. */
const LABEL_PROPS = [
  "text",
  "label",
  "eyebrow",
  "title",
  "titleAccent",
  "emptyMessage",
  "bio",
  "mastRight",
  "subline",
  "coverLine",
  "coverStatement",
  "contentsTitle",
  "bookLabel",
  "ctaLabel",
  "statement",
  "creditLine",
  "contactLine",
  "subtitle",
] as const;

/**
 * The talent header (`site_header` section) carries its nav and CTA labels in
 * `sectionProps`, not on node props: localise those seeded labels too.
 */
const ROW_ARRAY_PROPS = ["links", "items", "contents"] as const;

function localiseHeaderProps(
  sectionProps: unknown,
  one: (v: string, href?: unknown) => string | null,
): Record<string, unknown> | null {
  if (!sectionProps || typeof sectionProps !== "object") return null;
  const sp = sectionProps as Record<string, unknown>;
  let next: Record<string, unknown> | null = null;
  const mapLink = (l: unknown): unknown => {
    if (!l || typeof l !== "object") return l;
    const o = l as Record<string, unknown>;
    if (typeof o.label !== "string") return l;
    const out = one(o.label, o.href);
    return out === null ? l : { ...o, label: out };
  };
  if (Array.isArray(sp.navItems)) {
    const mapped = sp.navItems.map(mapLink);
    if (mapped.some((m, i) => m !== (sp.navItems as unknown[])[i])) (next ??= { ...sp }).navItems = mapped;
  }
  if (sp.primaryCta && typeof sp.primaryCta === "object") {
    const mapped = mapLink(sp.primaryCta);
    if (mapped !== sp.primaryCta) (next ??= { ...sp }).primaryCta = mapped;
  }
  if (sp.regions && typeof sp.regions === "object") {
    const regions = sp.regions as Record<string, unknown>;
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [slot, items] of Object.entries(regions)) {
      out[slot] = Array.isArray(items)
        ? items.map((it) => {
            if (!it || typeof it !== "object" || (it as { type?: unknown }).type !== "cta") return it;
            const m = mapLink(it);
            if (m !== it) changed = true;
            return m;
          })
        : items;
    }
    if (changed) (next ??= { ...sp }).regions = out;
  }
  return next;
}

/** The label table a locale reads from: es, en, or none (other languages). */
export type LabelTarget = "es" | "en" | "other";

export function labelTarget(locale: string | null | undefined): LabelTarget {
  const key = (locale ?? "").trim().toLowerCase().slice(0, 2);
  return key === "es" ? "es" : key === "en" ? "en" : "other";
}

/**
 * Mode-aware / Folio-gallery replacement for one seeded string, or null when
 * it stays as is. EN↔ES guess maps are applied separately (fallback only).
 */
export function localiseOne(
  value: string,
  target: LabelTarget,
  mode: SiteCtaMode | null,
  href?: unknown,
): string | null {
  const key = value.trim();
  if (key === "Book" && href === "#gallery") return target === "es" ? WORK_LABEL.es : WORK_LABEL.en;
  const modeCopy = SEEDED_MODE_COPY[key] ?? (target === "en" ? SEEDED_MODE_COPY_BY_ES[key] : undefined);
  if (modeCopy) {
    const line = modeCopy[mode ?? "instant"];
    const out = target === "es" ? line.es : line.en;
    return out === value ? null : out;
  }
  return null;
}

/** Exposed for tests and callers that localise a single seeded string. */
export function localiseSeededDesignLabel(
  value: string,
  locale: string | null | undefined,
  mode: SiteCtaMode | null = null,
): string {
  return localiseOne(value, labelTarget(locale), mode) ?? value;
}

export interface LocaliseSeededContext {
  /** Talent profile code for guess-map fallback warnings. */
  profileCode?: string | null;
}

/**
 * Returns a copy of `tree` with mode-dependent seeded action copy matched to
 * the booking `mode` (null reads as instant), plus optional per-talent
 * `swaps`. When a node has no `props.i18n` for the target locale, the EN↔ES
 * guess map in `design-label-locale.ts` fills in (dev warning). Overlays win.
 */
export function localiseSeededDesignLabels(
  tree: BuilderNode[],
  locale: string | null | undefined,
  mode: SiteCtaMode | null = null,
  swaps: Readonly<Record<string, string>> = {},
  context: LocaliseSeededContext = {},
): BuilderNode[] {
  const target = labelTarget(locale);
  if (target === "other" && mode === null && Object.keys(swaps).length === 0) return tree;
  const guessTarget: GuessLabelTarget | null = target === "es" || target === "en" ? target : null;
  const visit = (node: BuilderNode): BuilderNode => {
    const props = (node.props ?? {}) as Record<string, unknown>;
    const origin = props[DESIGN_ORIGIN_PROP] as DesignOrigin | undefined;
    const nodeKey = typeof origin?.key === "string" ? origin.key : null;
    const hasOverlay = guessTarget ? nodeHasLocaleOverlay(props, guessTarget) : true;
    const one = (v: string, href?: unknown, path?: string): string | null => {
      const swapped = swaps[v.trim()];
      if (swapped) return swapped;
      const modeHit = localiseOne(v, target, mode, href);
      if (modeHit !== null) return modeHit;
      // Guess map: only when this node has no i18n overlay for the locale.
      if (!guessTarget || hasOverlay) return null;
      const guessed = guessSeededLabelFallback(v, guessTarget);
      if (guessed === null) return null;
      warnGuessMapFallback({
        profileCode: context.profileCode,
        nodeKey,
        nodeKind: node.kind,
        locale: guessTarget,
        path: path ?? "?",
        from: v,
        to: guessed,
      });
      return guessed;
    };
    let next: Record<string, unknown> | null = null;
    for (const key of LABEL_PROPS) {
      const v = props[key];
      if (typeof v !== "string") continue;
      const out = one(v, key === "label" ? props.href : undefined, key);
      if (out !== null) (next ??= { ...props })[key] = out;
    }
    if (node.kind === "section" && props.sectionTypeKey === "site_header") {
      let sectionProps = props.sectionProps;
      // Legacy Inquire CTA when the header node itself has no i18n overlay.
      if (!hasOverlay && guessTarget === "es") {
        sectionProps = localiseTalentHeaderDefaults(sectionProps, locale, {
          profileCode: context.profileCode,
          nodeKey: nodeKey ?? "shell/site_header",
        });
      }
      const header = localiseHeaderProps(sectionProps, (v, href) => one(v, href, "sectionProps"));
      if (header) (next ??= { ...props }).sectionProps = header;
      else if (sectionProps !== props.sectionProps) (next ??= { ...props }).sectionProps = sectionProps;
    }
    const items = props.items;
    if (node.kind === "marquee" && Array.isArray(items)) {
      let changed = false;
      const mapped = items.map((it: unknown) => {
        if (!it || typeof it !== "object") return it;
        const o = it as Record<string, unknown>;
        if (typeof o.text !== "string") return it;
        const out = one(o.text);
        if (out === null) return it;
        changed = true;
        return { ...o, text: out };
      });
      if (changed) (next ??= { ...props }).items = mapped;
    }
    const links = props.links;
    if (Array.isArray(links)) {
      let changed = false;
      const mapped = links.map((link: unknown) => {
        if (!link || typeof link !== "object") return link;
        const l = link as Record<string, unknown>;
        if (typeof l.label !== "string") return link;
        const out = one(l.label, l.href);
        if (out === null) return link;
        changed = true;
        return { ...l, label: out };
      });
      if (changed) (next ??= { ...props }).links = mapped;
    }
    // Contents index + magazine masthead index: label + optional credit.
    for (const key of ROW_ARRAY_PROPS) {
      if (key === "links") continue;
      const rows = props[key];
      if (!Array.isArray(rows)) continue;
      let changed = false;
      const mapped = rows.map((row: unknown) => {
        if (!row || typeof row !== "object") return row;
        const o = row as Record<string, unknown>;
        let nextRow: Record<string, unknown> | null = null;
        if (typeof o.label === "string") {
          const out = one(o.label, o.href ?? o.anchor);
          if (out !== null) (nextRow ??= { ...o }).label = out;
        }
        if (typeof o.credit === "string") {
          const out = one(o.credit);
          if (out !== null) (nextRow ??= { ...(nextRow ?? o) }).credit = out;
        }
        if (nextRow) changed = true;
        return nextRow ?? row;
      });
      if (changed) (next ??= { ...props })[key] = mapped;
    }
    const mappedChildren =
      "children" in node && Array.isArray(node.children) ? node.children.map(visit) : null;
    // Keep node identity when nothing below changed (untouched trees stay ===).
    const children =
      mappedChildren && mappedChildren.some((c, i) => c !== (node as { children: BuilderNode[] }).children[i])
        ? mappedChildren
        : null;
    if (!next && !children) return node;
    return {
      ...node,
      ...(next ? { props: next } : {}),
      ...(children ? { children } : {}),
    } as BuilderNode;
  };
  const out = tree.map(visit);
  return out.every((n, i) => n === tree[i]) ? tree : out;
}
