import type {
  BuilderAccordionItemNode,
  BuilderAccordionNode,
  BuilderCardNode,
  BuilderCarouselNode,
  BuilderContainerNode,
  BuilderCtaGroupNode,
  BuilderDividerNode,
  BuilderNode,
  BuilderNodeKind,
  BuilderNodeTree,
  BuilderMasonryNode,
  BuilderSpacerNode,
  BuilderSplitNode,
  BuilderTabPanelNode,
  BuilderTabsNode,
} from "./types";

export type BuilderNodeLayoutHealthNode =
  | BuilderContainerNode
  | BuilderCardNode
  | BuilderCtaGroupNode
  | BuilderSplitNode
  | BuilderAccordionNode
  | BuilderTabsNode
  | BuilderCarouselNode
  | BuilderMasonryNode
  | BuilderDividerNode
  | BuilderSpacerNode;

export type BuilderNodeLayoutFindingLevel = "info" | "warning";

export interface BuilderNodeLayoutFinding {
  id: string;
  level: BuilderNodeLayoutFindingLevel;
  title: string;
  message: string;
  quickFixLabel?: string;
  quickFixPatch?: Record<string, unknown>;
}

export interface BuilderNodeTreeLayoutFinding extends BuilderNodeLayoutFinding {
  nodeId: string;
  nodeKind: BuilderNodeKind;
  ownerSectionId: string | null;
}

const BLOCKING_LAYOUT_FINDING_IDS = new Set<string>([
  "container-mobile-stack",
  "container-mobile-overflow",
  "split-mobile-collapse",
  "carousel-controls",
  "carousel-slides-overflow",
  "tabs-no-panels",
]);

export function isBlockingLayoutFindingId(id: string): boolean {
  return BLOCKING_LAYOUT_FINDING_IDS.has(id);
}

function isLayoutHealthNode(node: BuilderNode): node is BuilderNodeLayoutHealthNode {
  return (
    node.kind === "container" ||
    node.kind === "card" ||
    node.kind === "cta_group" ||
    node.kind === "split" ||
    node.kind === "accordion" ||
    node.kind === "tabs" ||
    node.kind === "carousel" ||
    node.kind === "masonry" ||
    node.kind === "divider" ||
    node.kind === "spacer"
  );
}

function mergeResponsive(
  responsive: BuilderContainerNode["props"]["responsive"] | undefined,
  patch: NonNullable<BuilderContainerNode["props"]["responsive"]>,
): BuilderContainerNode["props"]["responsive"] {
  const next: NonNullable<BuilderContainerNode["props"]["responsive"]> = {
    ...(responsive ?? {}),
  };
  // Generalized over ALL breakpoint tiers (tablet / mobile / wide / compact /
  // custom) — merge each patched tier onto its existing override.
  for (const tier of Object.keys(patch)) {
    const tierPatch = patch[tier];
    if (!tierPatch) continue;
    next[tier] = { ...(responsive?.[tier] ?? {}), ...tierPatch };
  }
  return next;
}

/**
 * STYLE-AWARE CHECKS.
 *
 * Everything above reads structured props. These two read `props.style`,
 * because both of them describe a layout that is authorable in three clicks
 * and renders as nothing — each one shipped to production on a live page
 * before it was caught by eye.
 */

/** The width beyond which a capped kind's base class silently wins. */
const CONTAINER_BASE_MAX_WIDTH_PX = 1120;

/**
 * Kinds whose base class carries `max-width: 1120px`. An authored `width`
 * larger than that is discarded unless the author ALSO lifts the cap with
 * `maxWidth: "full"` (or a free max-width) — which nothing in the editor
 * says out loud.
 */
const MAX_WIDTH_CAPPED_KINDS = new Set<BuilderNodeKind>([
  "container",
  "card",
  "cta_group",
  "split",
  "carousel",
  "masonry",
]);

/** px value of a length, or null when it is not a plain px/rem length. */
function lengthToPx(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(-?\d*\.?\d+)(px|rem)$/.exec(value.trim());
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  return match[2] === "rem" ? n * 16 : n;
}

/** True when this style lifts the base max-width cap. */
function liftsMaxWidthCap(style: Record<string, unknown> | undefined): boolean {
  if (!style) return false;
  if (style.maxWidth === "full") return true;
  const free = style.maxWidthFree;
  if (typeof free !== "string") return false;
  const trimmed = free.trim();
  if (trimmed === "100%" || trimmed === "none") return true;
  const px = lengthToPx(trimmed);
  return px !== null && px > CONTAINER_BASE_MAX_WIDTH_PX;
}

/** Does this style give the node a height the layout can use? */
function hasHeightSource(style: Record<string, unknown> | undefined): boolean {
  if (!style) return false;
  if (style.height || style.minHeight) return true;
  if (style.aspectRatioFree) return true;
  if (typeof style.aspectRatio === "string" && style.aspectRatio !== "auto") return true;
  // The escape hatch counts: a scoped rule can supply the height too.
  if (typeof style.customCss === "string" && /(aspect-ratio|min-height|height)\s*:/.test(style.customCss)) {
    return true;
  }
  return false;
}

/** A child that is taken out of flow contributes no height to its parent. */
function isOutOfFlow(node: BuilderNode): boolean {
  const position = (node.props as { style?: { position?: unknown } } | undefined)?.style?.position;
  return position === "absolute" || position === "fixed";
}

function getStyleFindings(
  node: BuilderNodeLayoutHealthNode,
): BuilderNodeLayoutFinding[] {
  const findings: BuilderNodeLayoutFinding[] = [];
  const style = (node.props as { style?: Record<string, unknown> }).style;

  // 1. An authored width the base class throws away.
  if (MAX_WIDTH_CAPPED_KINDS.has(node.kind) && !liftsMaxWidthCap(style)) {
    const widthPx = lengthToPx(style?.width);
    const wantsFullBleed = typeof style?.width === "string" && style.width.trim() === "100%";
    if ((widthPx !== null && widthPx > CONTAINER_BASE_MAX_WIDTH_PX) || wantsFullBleed) {
      findings.push({
        id: "width-exceeds-container-cap",
        level: "warning",
        title: "This width is capped at 1120px",
        message:
          "Blocks like this one stop at 1120px wide by default, so the width set here has no visible effect. Set the max width to Full to let it run edge to edge.",
        quickFixLabel: "Allow full width",
        quickFixPatch: { style: { ...(style ?? {}), maxWidth: "full" } },
      });
    }
  }

  // 2. A box with nothing to give it height. Every child out of flow + no
  //    height source = 0px tall, which reads as "my section disappeared".
  const children = (node as { children?: BuilderNode[] }).children ?? [];
  if (
    children.length > 0 &&
    children.every(isOutOfFlow) &&
    !hasHeightSource(style)
  ) {
    findings.push({
      id: "absolute-children-no-height",
      level: "warning",
      title: "This block will collapse to nothing",
      message:
        "Everything inside is positioned freely, so nothing is left to give this block a height and it renders 0px tall. Give it a ratio or a minimum height.",
      quickFixLabel: "Set a 4:3 ratio",
      quickFixPatch: { style: { ...(style ?? {}), aspectRatio: "4:3" } },
    });
  }

  return findings;
}

export function getBuilderNodeLayoutFindings(
  node: BuilderNodeLayoutHealthNode,
): ReadonlyArray<BuilderNodeLayoutFinding> {
  const findings: BuilderNodeLayoutFinding[] = [];

  if (node.kind === "divider") {
    return findings;
  }

  if (node.kind === "container") {
    const columns = node.props.columns ?? 1;
    const mobile = node.props.responsive?.mobile;
    const tablet = node.props.responsive?.tablet;
    const mobileLayout = mobile?.layout ?? node.props.layout;
    const mobileColumns =
      mobile?.columns ??
      (mobileLayout === "grid" ? columns : mobileLayout === "stack" ? 1 : columns);

    if (
      node.props.layout === "grid" &&
      columns >= 2 &&
      mobile?.layout !== "stack" &&
      mobile?.columns !== 1
    ) {
      findings.push({
        id: "container-mobile-stack",
        level: "warning",
        title: "Mobile grid needs a stack rule",
        message:
          "Multi-column grids should collapse to one column on mobile before templates are reused broadly.",
        quickFixLabel: "Stack on mobile",
        quickFixPatch: {
          responsive: mergeResponsive(node.props.responsive, {
            mobile: { layout: "stack", columns: 1 },
          }),
        },
      });
    }

    if (
      node.props.layout === "grid" &&
      columns >= 3 &&
      tablet?.columns == null
    ) {
      findings.push({
        id: "container-tablet-grid",
        level: "info",
        title: "Tablet columns are inheriting desktop",
        message:
          "A lighter tablet grid usually keeps cards readable between desktop and mobile.",
        quickFixLabel: "Use two columns",
        quickFixPatch: {
          responsive: mergeResponsive(node.props.responsive, {
            tablet: { layout: "grid", columns: 2 },
          }),
        },
      });
    }

    if (node.props.layout === "row" && mobile?.layout !== "stack") {
      findings.push({
        id: "container-row-mobile",
        level: "info",
        title: "Row layout has no mobile stack",
        message:
          "Rows can squeeze nested blocks on phones unless mobile explicitly stacks them.",
        quickFixLabel: "Stack on mobile",
        quickFixPatch: {
          responsive: mergeResponsive(node.props.responsive, {
            mobile: { layout: "stack", columns: 1 },
          }),
        },
      });
    }

    if (mobileLayout === "grid" && mobileColumns >= 3) {
      findings.push({
        id: "container-mobile-overflow",
        level: "warning",
        title: "Mobile grid may overflow",
        message:
          "Three or more mobile columns usually squeeze content and cause clipping. Use one or two columns for readability.",
        quickFixLabel: "Use one column",
        quickFixPatch: {
          responsive: mergeResponsive(node.props.responsive, {
            mobile: { layout: "stack", columns: 1 },
          }),
        },
      });
    }
  }

  if (node.kind === "split" && node.props.collapseOnMobile === false) {
    findings.push({
      id: "split-mobile-collapse",
      level: "warning",
      title: "Split will stay side-by-side on mobile",
      message:
        "Most split sections should stack on small screens to keep copy and media legible.",
      quickFixLabel: "Enable stack",
      quickFixPatch: { collapseOnMobile: undefined },
    });
  }

  if (node.kind === "carousel") {
    if (node.props.autoplayMs && !node.props.showArrows && !node.props.showDots) {
      findings.push({
        id: "carousel-controls",
        level: "warning",
        title: "Autoplay carousel has no controls",
        message:
          "Visitors need a visible way to pause context or move through slides when autoplay is enabled.",
        quickFixLabel: "Show controls",
        quickFixPatch: { showArrows: true, showDots: true },
      });
    }

    if ((node.props.slidesPerView ?? 2) >= 4) {
      findings.push({
        id: "carousel-density",
        level: "info",
        title: "Dense carousel",
        message:
          "Four visible slides is useful for logos or thumbnails; editorial cards usually read better at two or three.",
        quickFixLabel: "Use three slides",
        quickFixPatch: { slidesPerView: 3 },
      });
    }
  }

  if (node.kind === "masonry" && (node.props.columns ?? 3) >= 5) {
    findings.push({
      id: "masonry-density",
      level: "info",
      title: "Very dense masonry",
      message:
        "Five columns can feel cramped unless the images are decorative thumbnails.",
      quickFixLabel: "Use four columns",
      quickFixPatch: { columns: 4 },
    });
  }

  if (node.kind === "spacer" && node.props.size === "l") {
    findings.push({
      id: "spacer-large",
      level: "info",
      title: "Large spacer",
      message:
        "Large spacers are fine for hero rhythm; repeated use can create accidental blank bands.",
    });
  }

  if (node.kind === "masonry" && (node.props.columns ?? 3) >= 4) {
    findings.push({
      id: "masonry-mobile-overflow",
      level: "warning",
      title: "Masonry may feel cramped on mobile",
      message:
        "Dense masonry columns are hard to scan on phones. Consider reducing columns or replacing with a simpler feed on mobile.",
      quickFixLabel: "Use three columns",
      quickFixPatch: { columns: 3 },
    });
  }

  if (node.kind === "carousel") {
    const childCount = node.children.length;
    if (childCount > 0 && (node.props.slidesPerView ?? 2) > childCount) {
      findings.push({
        id: "carousel-slides-overflow",
        level: "warning",
        title: "Carousel shows more slides than it has",
        message:
          "The current slides-per-view setting is higher than available cards, which creates awkward empty lanes.",
        quickFixLabel: "Match available cards",
        quickFixPatch: {
          slidesPerView: Math.min(3, Math.max(1, childCount)) as 1 | 2 | 3 | 4,
        },
      });
    }
  }

  if (node.kind === "accordion") {
    const itemIds = node.children
      .filter(
        (child): child is BuilderAccordionItemNode =>
          child.kind === "accordion_item",
      )
      .map((child) => child.id);
    const defaultOpen = node.props.defaultOpenItemIds ?? [];
    const missingDefaultIds = defaultOpen.filter((id) => !itemIds.includes(id));
    if (missingDefaultIds.length > 0) {
      const nextDefaults = defaultOpen.filter((id) => itemIds.includes(id));
      findings.push({
        id: "accordion-default-item-missing",
        level: "warning",
        title: "Accordion default item is missing",
        message:
          "Some default-open item IDs no longer exist in this accordion. Update defaults so publish state stays predictable.",
        quickFixLabel: "Clean default IDs",
        quickFixPatch: {
          defaultOpenItemIds: nextDefaults.length > 0 ? nextDefaults : undefined,
        },
      });
    }
    if (node.props.allowMultiple === false && defaultOpen.length > 1) {
      findings.push({
        id: "accordion-default-multi",
        level: "warning",
        title: "Single-open accordion has multiple defaults",
        message:
          "When multiple panels are disallowed, only one default-open item should be configured.",
        quickFixLabel: "Keep first default",
        quickFixPatch: { defaultOpenItemIds: [defaultOpen[0]].filter(Boolean) },
      });
    }
  }

  if (node.kind === "tabs") {
    const panelIds = node.children
      .filter(
        (child): child is BuilderTabPanelNode => child.kind === "tab_panel",
      )
      .map((child) => child.id);
    const defaultTabId = node.props.defaultTabId;
    if (defaultTabId && !panelIds.includes(defaultTabId)) {
      findings.push({
        id: "tabs-default-panel-missing",
        level: "warning",
        title: "Default tab no longer exists",
        message:
          "The configured default tab ID is missing from current tab panels. This can land visitors on an unintended panel.",
        quickFixLabel: "Use first tab",
        quickFixPatch: { defaultTabId: panelIds[0] ?? undefined },
      });
    }
    if (panelIds.length === 0) {
      findings.push({
        id: "tabs-no-panels",
        level: "warning",
        title: "Tabs has no panels",
        message:
          "This tabs block has no child panels, so it cannot render usable content until at least one panel exists.",
      });
    }
  }

  findings.push(...getStyleFindings(node));

  return findings;
}

export function collectBuilderTreeLayoutFindings(
  tree: BuilderNodeTree,
): ReadonlyArray<BuilderNodeTreeLayoutFinding> {
  const findings: BuilderNodeTreeLayoutFinding[] = [];

  const walk = (
    nodes: ReadonlyArray<BuilderNode>,
    ownerSectionId: string | null,
  ): void => {
    for (const node of nodes) {
      const nextOwnerSectionId =
        node.kind === "section"
          ? node.props.sectionId ?? ownerSectionId
          : ownerSectionId;
      if (isLayoutHealthNode(node)) {
        for (const finding of getBuilderNodeLayoutFindings(node)) {
          findings.push({
            ...finding,
            nodeId: node.id,
            nodeKind: node.kind,
            ownerSectionId: nextOwnerSectionId,
          });
        }
      }
      if ("children" in node && Array.isArray(node.children)) {
        walk(node.children, nextOwnerSectionId);
      }
    }
  };

  walk(tree, null);
  return findings;
}
