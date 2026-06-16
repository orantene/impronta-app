/**
 * shell-builder-tree.ts — WS-A A8. PURE helpers (no I/O) that enrich a shell
 * `builderTree` so a freshly-backfilled `site_shell` opens against the tenant's
 * REAL header/footer content — nav links, social row, brand logo — not just a
 * brand heading.
 *
 * WHY A SEPARATE MODULE (not the shared `snapshot-slot-bridge`):
 * --------------------------------------------------------------------------
 * `deriveLegacySectionChildNodes` (the shared bridge) is ALSO run at READ time
 * by `resolveSnapshotBuilderTree` → `reconcileBuilderTreeWithLegacySlots`. Its
 * derived children are constrained to ROLE-BOUND layers (heading/paragraph/
 * button) so the bespoke `SiteHeaderComponent`/`SiteFooterComponent` can re-bind
 * them — and the role-bindings invariant (every derived child is role-bound)
 * is enforced by a test. Adding `nav`/`social_links`/`image` there would break
 * that invariant AND make the read-time reconciler re-inject those nodes,
 * fighting freeform edits.
 *
 * So this enrichment runs ONLY on the BACKFILL SEED path — once, when the shell
 * row is created — producing the freeform header/footer children the new shell
 * surface + `renderBuilderNodes` consume. It is a one-shot seed, never a
 * read-time derivation.
 */

import type {
  BuilderNode,
  BuilderNodeTree,
  BuilderSectionNode,
  BuilderSocialPlatform,
} from "./types";

/** The legacy header/footer prop shapes the backfill writes (the relevant bits). */
export interface LegacyShellHeaderProps {
  brand?: { label?: string | null; href?: string | null; logoSrc?: string | null; logoMediaId?: string | null } | null;
  navItems?: Array<{ label?: string | null; href?: string | null }> | null;
}
export interface LegacyShellFooterProps {
  brand?: { label?: string | null; tagline?: string | null } | null;
  columns?: Array<{ links?: Array<{ label?: string | null; href?: string | null }> | null }> | null;
  social?: Array<{ platform?: string | null; href?: string | null }> | null;
}

const SHELL_SOCIAL_PLATFORMS = new Set<BuilderSocialPlatform>([
  "instagram",
  "tiktok",
  "facebook",
  "youtube",
  "linkedin",
  "x",
  "whatsapp",
  "email",
]);

/** Narrow a raw platform string to a `BuilderSocialPlatform` (or null). The
 *  legacy `social` array uses "twitter"; normalize it to the canonical "x". */
function asShellSocialPlatform(raw: string): BuilderSocialPlatform | null {
  const normalized = raw.trim() === "twitter" ? "x" : raw.trim();
  return SHELL_SOCIAL_PLATFORMS.has(normalized as BuilderSocialPlatform)
    ? (normalized as BuilderSocialPlatform)
    : null;
}

function readLinks(
  raw: Array<{ label?: string | null; href?: string | null }> | null | undefined,
): Array<{ label: string; href: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ label: string; href: string }> = [];
  for (const e of raw) {
    const label = typeof e?.label === "string" ? e.label.trim() : "";
    const href = typeof e?.href === "string" ? e.href.trim() : "";
    if (label && href) out.push({ label, href });
  }
  return out;
}

/**
 * Build the freeform children for the HEADER landmark: an optional brand logo
 * image and a `nav` node carrying the header nav links. Returns [] when there is
 * nothing to add (so the caller leaves the role-bound derivation alone).
 */
export function buildShellHeaderFreeformChildren(
  sectionNodeId: string,
  props: LegacyShellHeaderProps,
): BuilderNode[] {
  const children: BuilderNode[] = [];
  const brand = props.brand ?? null;
  const brandLabel = typeof brand?.label === "string" ? brand.label.trim() : "";
  const brandHref = typeof brand?.href === "string" ? brand.href.trim() : "";
  const logoSrc = typeof brand?.logoSrc === "string" ? brand.logoSrc.trim() : "";
  const logoMediaId = typeof brand?.logoMediaId === "string" ? brand.logoMediaId.trim() : "";

  if (logoSrc || logoMediaId) {
    children.push({
      id: `${sectionNodeId}:image:logo`,
      kind: "image",
      props: {
        src: logoSrc,
        ...(logoMediaId ? { mediaId: logoMediaId } : {}),
        alt: brandLabel || "Logo",
      },
    });
  }

  const navItems = readLinks(props.navItems);
  if (navItems.length > 0) {
    children.push({
      id: `${sectionNodeId}:nav:primary`,
      kind: "nav",
      props: {
        ...(brandLabel ? { brand: brandLabel } : {}),
        ...(brandHref ? { brandHref } : {}),
        links: navItems.map((n, i) => ({
          id: `${sectionNodeId}:navlink:${i}`,
          label: n.label,
          href: n.href,
        })),
        ariaLabel: "Primary",
      },
    });
  }
  return children;
}

/**
 * Build the freeform children for the FOOTER landmark: a `nav` node from the
 * flattened footer column links and a `social_links` node from the social
 * array. Returns [] when there is nothing to add.
 */
export function buildShellFooterFreeformChildren(
  sectionNodeId: string,
  props: LegacyShellFooterProps,
): BuilderNode[] {
  const children: BuilderNode[] = [];

  const columnLinks: Array<{ label: string; href: string }> = [];
  for (const col of Array.isArray(props.columns) ? props.columns : []) {
    columnLinks.push(...readLinks(col?.links));
  }
  if (columnLinks.length > 0) {
    children.push({
      id: `${sectionNodeId}:nav:footer`,
      kind: "nav",
      props: {
        links: columnLinks.map((n, i) => ({
          id: `${sectionNodeId}:navlink:${i}`,
          label: n.label,
          href: n.href,
        })),
        ariaLabel: "Footer",
      },
    });
  }

  const socialLinks: Array<{ id: string; platform: BuilderSocialPlatform; href: string }> = [];
  const socialRaw = Array.isArray(props.social) ? props.social : [];
  for (let i = 0; i < socialRaw.length; i++) {
    const e = socialRaw[i];
    const rawPlatform = typeof e?.platform === "string" ? e.platform : "";
    const platform = rawPlatform ? asShellSocialPlatform(rawPlatform) : null;
    const href = typeof e?.href === "string" ? e.href.trim() : "";
    if (platform && href) {
      socialLinks.push({ id: `${sectionNodeId}:social:${i}`, platform, href });
    }
  }
  if (socialLinks.length > 0) {
    children.push({
      id: `${sectionNodeId}:social_links:row`,
      kind: "social_links",
      props: { links: socialLinks, ariaLabel: "Social links" },
    });
  }
  return children;
}

/**
 * Enrich a shell `builderTree` (the base tree produced by
 * `buildLegacySectionBuilderTree`) by APPENDING the freeform header/footer
 * children to the matching landmark `section` nodes. The role-bound children the
 * base derivation already produced (brand heading, tagline, CTA) are preserved;
 * the nav / social / logo nodes are appended after them.
 *
 * Pure + idempotent-ish: re-running APPENDS again (the caller runs it once at
 * seed time). Non-landmark nodes pass through untouched.
 */
export function enrichShellBuilderTree(
  baseTree: BuilderNodeTree,
  legacy: {
    header?: LegacyShellHeaderProps;
    footer?: LegacyShellFooterProps;
  },
): BuilderNodeTree {
  return baseTree.map((node) => {
    if (node.kind !== "section") return node;
    const section = node as BuilderSectionNode;
    const typeKey = section.props.sectionTypeKey;
    if (typeKey === "site_header" && legacy.header) {
      const extra = buildShellHeaderFreeformChildren(section.id, legacy.header);
      if (extra.length === 0) return node;
      return { ...section, children: [...(section.children ?? []), ...extra] };
    }
    if (typeKey === "site_footer" && legacy.footer) {
      const extra = buildShellFooterFreeformChildren(section.id, legacy.footer);
      if (extra.length === 0) return node;
      return { ...section, children: [...(section.children ?? []), ...extra] };
    }
    return node;
  });
}
