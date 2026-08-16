/**
 * config-merge.ts — the PURE read/write bridge between the `site_footer`
 * section's `props_jsonb` and the inspector's `SiteFooterSectionValue`.
 *
 * WHY THIS IS ITS OWN MODULE, AND WHY IT SPREADS RATHER THAN WHITELISTS
 * ---------------------------------------------------------------------
 * This is the F5 regression that already bit `site_header` and `site_footer`
 * once (see `sections/site_footer/editor-value.ts`): an editor that REBUILDS the
 * props object from a known field list silently erases every field it does not
 * know about. `site_footer` props carry `presentation` and `nodePresentation`
 * today, and the schema will grow more. So `mergeFooterProps` starts from the
 * CURRENT props object and overwrites only the keys the patch actually names.
 * A field this file has never heard of survives every inspector save.
 *
 * The same rule at a coarser grain is what protects the freeform children: they
 * live in `cms_pages.blocks`, not in this props object, so an inspector save is
 * structurally incapable of touching them. `mergeFooterProps` is nonetheless
 * asserted to be props-only (no `children` key is ever produced) so a future
 * refactor that tried to route children through here fails a test rather than
 * silently deleting an operator's custom footer blocks.
 *
 * PURE: no I/O, no Zod, no React. Node-testable directly.
 */

import { coerceLegacyHref, type LinkRef } from "../links/link-ref";
import {
  SITE_FOOTER_SOCIAL_PLATFORMS,
  type SiteFooterColumn,
  type SiteFooterLink,
  type SiteFooterSectionValue,
  type SiteFooterSocial,
  type SiteFooterSocialPlatform,
} from "./types";

// ── href flattening ──────────────────────────────────────────────────────────

/**
 * A stored `href` is either a structured `LinkRef` or a legacy plain string
 * (`linkRefOrLegacy`). The inspector edits ONE text field, so both shapes are
 * flattened to the string an operator would type.
 *
 * Inverse of `coerceLegacyHref` for every kind that round-trips through a single
 * text box. `tenant-page` / `anchor` / `external-url` return their value
 * verbatim; `mailto` / `tel` re-attach their scheme so re-coercing the result
 * yields the same kind back (proved by a round-trip test).
 */
export function linkRefToEditableHref(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (!raw || typeof raw !== "object") return "";
  const ref = raw as Partial<LinkRef>;
  const value = typeof ref.value === "string" ? ref.value : "";
  switch (ref.kind) {
    case "mailto":
      return value ? `mailto:${value}` : "";
    case "tel":
      return value ? `tel:${value}` : "";
    default:
      return value;
  }
}

/**
 * The inspector hands back a plain string; the schema's `linkRefOrLegacy`
 * coerces it. We coerce EAGERLY here (rather than persisting the bare string)
 * so what lands in the DB is always the structured form — otherwise the footer
 * would be the one surface still writing legacy strings, and the Finding-B auth
 * upgrade in `coerceLegacyHref` would never run for footer links.
 */
export function editableHrefToLinkRef(href: string): LinkRef {
  return coerceLegacyHref(href);
}

// ── props → inspector value (READ) ───────────────────────────────────────────

function readString(raw: unknown, max: number): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function readLink(raw: unknown): SiteFooterLink | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const label = typeof entry.label === "string" ? entry.label : "";
  if (!label.trim()) return null;
  return {
    label,
    href: linkRefToEditableHref(entry.href),
    ...(typeof entry.external === "boolean" ? { external: entry.external } : {}),
  };
}

function readLinks(raw: unknown, max: number): SiteFooterLink[] {
  if (!Array.isArray(raw)) return [];
  const out: SiteFooterLink[] = [];
  for (const entry of raw) {
    const link = readLink(entry);
    if (link) out.push(link);
    if (out.length >= max) break;
  }
  return out;
}

const SOCIAL_SET: ReadonlySet<string> = new Set(SITE_FOOTER_SOCIAL_PLATFORMS);

function readSocial(raw: unknown): SiteFooterSocial[] {
  if (!Array.isArray(raw)) return [];
  const out: SiteFooterSocial[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const platform = typeof row.platform === "string" ? row.platform : "";
    const href = typeof row.href === "string" ? row.href : "";
    if (!SOCIAL_SET.has(platform) || !href.trim()) continue;
    out.push({ platform: platform as SiteFooterSocialPlatform, href });
    if (out.length >= 6) break;
  }
  return out;
}

function readColumns(raw: unknown): SiteFooterColumn[] {
  if (!Array.isArray(raw)) return [];
  const out: SiteFooterColumn[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const heading = typeof row.heading === "string" ? row.heading : "";
    if (!heading.trim()) continue;
    out.push({ heading, links: readLinks(row.links, 8) });
    if (out.length >= 5) break;
  }
  return out;
}

function readEnum<T extends string>(
  raw: unknown,
  allowed: ReadonlyArray<T>,
  fallback: T,
): T {
  return typeof raw === "string" && (allowed as ReadonlyArray<string>).includes(raw)
    ? (raw as T)
    : fallback;
}

/**
 * Project the section row's `props_jsonb` onto the inspector's value shape.
 * Defensive by design: the row is operator/legacy data, so every field is
 * validated and a malformed entry is dropped rather than crashing the drawer.
 */
export function readFooterValue(
  props: Record<string, unknown>,
): SiteFooterSectionValue {
  const brandRaw =
    props.brand && typeof props.brand === "object"
      ? (props.brand as Record<string, unknown>)
      : {};
  const legalRaw =
    props.legal && typeof props.legal === "object"
      ? (props.legal as Record<string, unknown>)
      : {};

  return {
    brand: {
      ...(readString(brandRaw.label, 60) ? { label: readString(brandRaw.label, 60)! } : {}),
      ...(readString(brandRaw.logoUrl, 2048)
        ? { logoUrl: readString(brandRaw.logoUrl, 2048)! }
        : {}),
      ...(readString(brandRaw.logoAlt, 160)
        ? { logoAlt: readString(brandRaw.logoAlt, 160)! }
        : {}),
      ...(readString(brandRaw.tagline, 240)
        ? { tagline: readString(brandRaw.tagline, 240)! }
        : {}),
    },
    brandDisplay: readEnum(
      props.brandDisplay,
      ["image", "text", "image-and-text"] as const,
      "image-and-text",
    ),
    columns: readColumns(props.columns),
    social: readSocial(props.social),
    legal: {
      ...(readString(legalRaw.copyright, 200)
        ? { copyright: readString(legalRaw.copyright, 200)! }
        : {}),
      links: readLinks(legalRaw.links, 4),
    },
    variant: readEnum(
      props.variant,
      ["standard", "compact", "rich", "editorial"] as const,
      "standard",
    ),
    tone: readEnum(props.tone, ["follow", "light", "deep"] as const, "follow"),
  };
}

// ── inspector value → props (WRITE) ──────────────────────────────────────────

function writeLink(link: SiteFooterLink): Record<string, unknown> {
  return {
    label: link.label,
    href: editableHrefToLinkRef(link.href),
    ...(link.external === true ? { external: true } : {}),
  };
}

/**
 * Merge one inspector patch onto the CURRENT props object.
 *
 * Contract (all three are guarded by `config-merge.test.ts`):
 *   1. Unknown/unlisted keys on `current` are preserved verbatim.
 *   2. Only keys PRESENT on `patch` are written — `{}` is a no-op that returns
 *      structurally equal props.
 *   3. No `children` key is ever produced. The footer landmark's freeform
 *      children live in `cms_pages.blocks` and must never round-trip through
 *      the section row.
 */
export function mergeFooterProps(
  current: Record<string, unknown>,
  patch: Partial<SiteFooterSectionValue>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current };

  if (patch.brand !== undefined) {
    const currentBrand =
      current.brand && typeof current.brand === "object"
        ? (current.brand as Record<string, unknown>)
        : {};
    // Per-field merge, and an EMPTY STRING deletes rather than persisting "".
    // The schema types these as `.optional()`, so "" would be a legal-but-wrong
    // value that renders an empty wordmark instead of hiding it.
    const brand: Record<string, unknown> = { ...currentBrand };
    for (const key of ["label", "logoUrl", "logoAlt", "tagline"] as const) {
      if (!(key in patch.brand)) continue;
      const value = patch.brand[key];
      if (value === undefined || value === "") delete brand[key];
      else brand[key] = value;
    }
    next.brand = brand;
  }

  if (patch.brandDisplay !== undefined) next.brandDisplay = patch.brandDisplay;
  if (patch.variant !== undefined) next.variant = patch.variant;
  if (patch.tone !== undefined) next.tone = patch.tone;

  if (patch.columns !== undefined) {
    next.columns = patch.columns.slice(0, 5).map((column) => ({
      heading: column.heading,
      links: column.links.slice(0, 8).map(writeLink),
    }));
  }

  if (patch.social !== undefined) {
    next.social = patch.social
      .slice(0, 6)
      .map((row) => ({ platform: row.platform, href: row.href }));
  }

  if (patch.legal !== undefined) {
    const legal: Record<string, unknown> = {
      ...(current.legal && typeof current.legal === "object"
        ? (current.legal as Record<string, unknown>)
        : {}),
    };
    if ("copyright" in patch.legal) {
      const copyright = patch.legal.copyright;
      if (copyright === undefined || copyright === "") delete legal.copyright;
      else legal.copyright = copyright;
    }
    if (patch.legal.links !== undefined) {
      legal.links = patch.legal.links.slice(0, 4).map(writeLink);
    }
    next.legal = legal;
  }

  // Belt for contract 3 — see the doc comment. `children` has never been a
  // legitimate `site_footer` prop; if one ever appears on `current` we drop it
  // rather than persist a second, competing home for the landmark's subtree.
  delete next.children;

  return next;
}
