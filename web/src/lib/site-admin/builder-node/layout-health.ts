import type {
  BuilderAccordionNode,
  BuilderCarouselNode,
  BuilderContainerNode,
  BuilderMasonryNode,
  BuilderSpacerNode,
  BuilderSplitNode,
  BuilderTabsNode,
} from "./types";

export type BuilderNodeLayoutHealthNode =
  | BuilderContainerNode
  | BuilderSplitNode
  | BuilderAccordionNode
  | BuilderTabsNode
  | BuilderCarouselNode
  | BuilderMasonryNode
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

  if (node.kind === "container") {
    const columns = node.props.columns ?? 1;
    const mobile = node.props.responsive?.mobile;
    const tablet = node.props.responsive?.tablet;

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

  return findings;
}
