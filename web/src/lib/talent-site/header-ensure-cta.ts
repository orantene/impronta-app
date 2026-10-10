/**
 * TUL-530 / GRK-081: every talent theme header must expose a primary CTA.
 *
 * Heals three shell shapes at render/hydrate time so stale demo trees (kit
 * heading+nav only, empty utility_bar CTA, site_header missing primaryCta) get
 * a Book → `#services` control without a per-talent rebuild.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

const DEFAULT_CTA_LABEL = "Book";
const DEFAULT_CTA_HREF = "#services";

type Rec = Record<string, unknown>;
type AnyNode = BuilderNode & { children?: BuilderNode[] };

function regionHasCta(regions: unknown): boolean {
  if (!regions || typeof regions !== "object") return false;
  for (const items of Object.values(regions as Rec)) {
    if (
      Array.isArray(items) &&
      items.some((it) => it && typeof it === "object" && (it as Rec).type === "cta")
    ) {
      return true;
    }
  }
  return false;
}

function ensureSiteHeaderCta(node: BuilderNode): BuilderNode {
  if (node.kind !== "section" || node.props.sectionTypeKey !== "site_header") return node;
  const cfg = (node.props.sectionProps ?? {}) as Rec;
  const primary = cfg.primaryCta;
  const hasPrimary =
    primary &&
    typeof primary === "object" &&
    typeof (primary as Rec).label === "string" &&
    String((primary as Rec).label).trim() &&
    typeof (primary as Rec).href === "string" &&
    String((primary as Rec).href).trim();
  if (hasPrimary || regionHasCta(cfg.regions)) return node;

  const cta = { label: DEFAULT_CTA_LABEL, href: DEFAULT_CTA_HREF };
  const regions = cfg.regions && typeof cfg.regions === "object" ? ({ ...(cfg.regions as Rec) } as Rec) : {};
  const right = Array.isArray(regions.right) ? [...(regions.right as unknown[])] : [];
  if (!right.some((it) => it && typeof it === "object" && (it as Rec).type === "cta")) {
    right.push({ type: "cta", label: cta.label, href: cta.href, responsive: { mobile: "menu" } });
  }
  return {
    ...node,
    props: {
      ...node.props,
      sectionProps: {
        ...cfg,
        primaryCta: cta,
        regions: { ...regions, right },
      },
    },
  };
}

function ensureUtilityBarCta(node: BuilderNode): BuilderNode {
  if (node.kind !== "utility_bar") return node;
  const props = (node.props ?? {}) as Rec;
  const label = typeof props.ctaLabel === "string" ? props.ctaLabel.trim() : "";
  const href = typeof props.ctaHref === "string" ? props.ctaHref.trim() : "";
  if (label && href) return node;
  return {
    ...node,
    props: {
      ...props,
      ctaLabel: label || DEFAULT_CTA_LABEL,
      ctaHref: href || DEFAULT_CTA_HREF,
    },
  } as BuilderNode;
}

function isBrandNode(n: BuilderNode): boolean {
  if (n.kind !== "heading" && n.kind !== "image") return false;
  const layer = String(((n.props ?? {}) as Rec).layerLabel ?? "");
  return layer === "Wordmark" || layer === "Logo";
}

function kitHeaderHasCta(children: readonly BuilderNode[]): boolean {
  return children.some((c) => c.kind === "button" || c.kind === "utility_bar");
}

function ensureKitShellCta(node: BuilderNode): BuilderNode {
  const kids = (node as AnyNode).children;
  if (!Array.isArray(kids) || kids.length === 0) return node;
  const hasNav = kids.some((c) => c.kind === "nav");
  const hasBrand = kids.some(isBrandNode);
  if (!hasNav || !hasBrand || kitHeaderHasCta(kids)) {
    return { ...node, children: kids.map(ensureHeaderCtaNode) } as BuilderNode;
  }
  const cta: BuilderNode = {
    id: `hdr-cta-${node.id}`,
    kind: "button",
    props: {
      label: DEFAULT_CTA_LABEL,
      href: DEFAULT_CTA_HREF,
      tone: "primary",
      layerLabel: "Header CTA",
    },
  } as BuilderNode;
  return {
    ...node,
    children: [...kids.map(ensureHeaderCtaNode), cta],
  } as BuilderNode;
}

function ensureHeaderCtaNode(node: BuilderNode): BuilderNode {
  let next = ensureSiteHeaderCta(node);
  next = ensureUtilityBarCta(next);
  const kids = (next as AnyNode).children;
  if (Array.isArray(kids) && kids.length > 0) {
    // Kit shell header: container with brand + nav (and maybe no button yet).
    const layer = String(((next.props ?? {}) as Rec).layerLabel ?? "");
    if (next.kind === "container" && (layer === "Header" || kids.some((c) => c.kind === "nav"))) {
      return ensureKitShellCta(next);
    }
    return { ...next, children: kids.map(ensureHeaderCtaNode) } as BuilderNode;
  }
  return next;
}

/** Pure: return a shell tree where every header shape has a primary CTA. */
export function ensureHeaderCta(tree: readonly BuilderNode[]): BuilderNode[] {
  return tree.map(ensureHeaderCtaNode);
}
