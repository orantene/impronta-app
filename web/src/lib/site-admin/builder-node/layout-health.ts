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
  if (patch.tablet || responsive?.tablet) {
    next.tablet = patch.tablet
      ? {
          ...(responsive?.tablet ?? {}),
          ...patch.tablet,
        }
      : responsive?.tablet;
  }
  if (patch.mobile || responsive?.mobile) {
    next.mobile = patch.mobile
      ? {
          ...(responsive?.mobile ?? {}),
          ...patch.mobile,
        }
      : responsive?.mobile;
  }
  return next;
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
