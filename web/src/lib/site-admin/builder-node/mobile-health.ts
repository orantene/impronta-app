/**
 * Mobile health checker — a pure analysis pass over a BuilderNodeTree.
 *
 * Flags three classes of likely mobile problem:
 *
 *   1. **Tiny text** — a node's effective font-size on the mobile breakpoint
 *      resolves below 12 px (the browser accessibility minimum and the WCAG
 *      recommended floor). We parse the `style.fontSize` free-value escape and
 *      the `style.size` token; both desktop and mobile-override values are
 *      checked.
 *
 *   2. **Small / close tap targets** — button and icon nodes with explicit
 *      `width` or `height` set smaller than 44 px (Apple HIG minimum) and
 *      buttons that live in a row container with no gap (children's hit areas
 *      will physically touch).
 *
 *   3. **Horizontal overflow** — containers or splits whose effective mobile
 *      layout remains a non-wrapping multi-column row, OR nodes with a fixed
 *      `width` wider than 360 px (the narrowest modern viewport). Either
 *      condition forces a horizontal scroll bar on small phones.
 *
 * The checker is *advisory only* — it never blocks publish. Results feed
 * `MobileHealthPanel` in the publish drawer.
 *
 * Design principles:
 *   - Pure function, zero I/O: `runMobileHealthCheck(tree)` → issues[].
 *   - No false-positives on the pre-existing flagship design (`impronta.ts`).
 *   - Each issue carries a `nodeId` for one-click canvas locate.
 *   - Analogous pattern to `collectBuilderTreeLayoutFindings` (layout-health.ts).
 */

import type {
  BuilderButtonNode,
  BuilderContainerNode,
  BuilderHeadingNode,
  BuilderNode,
  BuilderNodeKind,
  BuilderNodeStyleValue,
  BuilderNodeTree,
  BuilderParagraphNode,
  BuilderRichTextNode,
  BuilderSplitNode,
} from "./types";

// ── Public surface ─────────────────────────────────────────────────────────

export type MobileHealthCheckKind =
  | "tiny_text"
  | "tap_target"
  | "overflow";

export interface MobileHealthIssue {
  /** Discriminates the check category for grouping in the UI. */
  kind: MobileHealthCheckKind;
  /** Human-readable description of the issue. */
  message: string;
  /** The affected builder node id — used to drive locateCanvasNode. */
  nodeId: string;
  /** Kind of the affected node, for display labels. */
  nodeKind: BuilderNodeKind;
  /** Owning section id, if determinable, for fallback-focus in the preflight surface. */
  ownerSectionId: string | null;
  /** Advisory only — never `"error"` (checker never blocks publish). */
  severity: "warn";
}

// ── Thresholds ─────────────────────────────────────────────────────────────

/** Minimum effective font-size in px that we consider legible on mobile. */
export const MOBILE_FONT_SIZE_MIN_PX = 12;

/** Apple HIG / Material recommended minimum tap-target dimension in px. */
export const TAP_TARGET_MIN_PX = 44;

/** Viewport width of the narrowest modern phone we target (iPhone SE 2). */
export const MOBILE_VIEWPORT_MAX_PX = 390;

// ── CSS length parser ──────────────────────────────────────────────────────

/**
 * Parse a CSS length string to pixels as best we can statically.
 * Returns `null` when the value is relative (%, em, rem, vw, …) because we
 * cannot resolve it without a layout context — callers skip those.
 */
export function parseLengthToPx(value: string | undefined | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  // px — direct parse
  const pxMatch = /^(-?\d+(?:\.\d+)?)px$/.exec(trimmed);
  if (pxMatch) return parseFloat(pxMatch[1]!);
  // pt — 1pt = 1.333…px
  const ptMatch = /^(-?\d+(?:\.\d+)?)pt$/.exec(trimmed);
  if (ptMatch) return parseFloat(ptMatch[1]!) * 1.3333;
  // Plain number (unitless) — treat as px for font-size (browser default)
  const plainMatch = /^(-?\d+(?:\.\d+)?)$/.exec(trimmed);
  if (plainMatch) return parseFloat(plainMatch[1]!);
  // Relative / calc / var — cannot determine statically
  return null;
}

// Token → approximate px mapping for the BuilderNodeStyleValue.size field.
const SIZE_TOKEN_PX: Record<string, number> = {
  sm: 13,
  md: 16,
  lg: 20,
  xl: 24,
};

/**
 * Resolve the effective font-size in px for a style bucket (either the base
 * style or the mobile-override bucket). Returns `null` when we cannot
 * determine it statically.
 */
function resolveEffectiveFontSizePx(style: BuilderNodeStyleValue | undefined): number | null {
  if (!style) return null;
  // Free fontSize string wins over the size token.
  if (style.fontSize) {
    const px = parseLengthToPx(style.fontSize);
    if (px !== null) return px;
  }
  if (style.size) {
    return SIZE_TOKEN_PX[style.size] ?? null;
  }
  return null;
}

// ── Check 1: Tiny text ─────────────────────────────────────────────────────

/** Nodes that carry user-visible text and can have a font-size style. */
function isTextNode(
  node: BuilderNode,
): node is BuilderHeadingNode | BuilderParagraphNode | BuilderRichTextNode | BuilderButtonNode {
  return (
    node.kind === "heading" ||
    node.kind === "paragraph" ||
    node.kind === "rich_text" ||
    node.kind === "button"
  );
}

function checkTinyText(
  node: BuilderNode,
  ownerSectionId: string | null,
): MobileHealthIssue | null {
  if (!isTextNode(node)) return null;
  const style = node.props.style;
  if (!style) return null;

  // Check mobile override first (most specific), then base style.
  const mobileOverride = style.responsive?.mobile;
  const baseSizePx = resolveEffectiveFontSizePx(style);
  const mobileSizePx = resolveEffectiveFontSizePx(mobileOverride);

  // If the mobile override explicitly sets a value, use it.
  const effectivePx = mobileSizePx ?? baseSizePx;
  if (effectivePx === null) return null; // cannot determine statically

  if (effectivePx < MOBILE_FONT_SIZE_MIN_PX) {
    return {
      kind: "tiny_text",
      severity: "warn",
      nodeId: node.id,
      nodeKind: node.kind,
      ownerSectionId,
      message: `Text node has ${effectivePx}px effective font-size on mobile (minimum: ${MOBILE_FONT_SIZE_MIN_PX}px). Increase the base or mobile font-size override.`,
    };
  }

  return null;
}

// ── Check 2: Tap targets ───────────────────────────────────────────────────

function parseDimensionPx(value: string | undefined | null): number | null {
  return parseLengthToPx(value);
}

/**
 * Flag a button (or interactive icon) whose explicit width/height is below
 * `TAP_TARGET_MIN_PX`. We only check free-value `width`/`height` escapes
 * because token-based sizing usually produces adequate targets.
 */
function checkTapTarget(
  node: BuilderNode,
  ownerSectionId: string | null,
): MobileHealthIssue | null {
  if (node.kind !== "button" && node.kind !== "icon") return null;
  const style = node.props.style;
  if (!style) return null;

  // Check mobile override; fall back to base.
  const mobileOverride = style.responsive?.mobile;
  const effectiveWidth = parseDimensionPx(mobileOverride?.width ?? style.width);
  const effectiveHeight = parseDimensionPx(mobileOverride?.height ?? style.height);

  const smallDim =
    (effectiveWidth !== null && effectiveWidth < TAP_TARGET_MIN_PX && effectiveWidth > 0)
      ? `width ${effectiveWidth}px`
      : (effectiveHeight !== null && effectiveHeight < TAP_TARGET_MIN_PX && effectiveHeight > 0)
        ? `height ${effectiveHeight}px`
        : null;

  if (!smallDim) return null;

  return {
    kind: "tap_target",
    severity: "warn",
    nodeId: node.id,
    nodeKind: node.kind,
    ownerSectionId,
    message: `${node.kind === "button" ? "Button" : "Icon"} has ${smallDim} — below the ${TAP_TARGET_MIN_PX}px minimum tap target. Increase size or remove the explicit dimension.`,
  };
}

/**
 * Flag a row container whose children include button/icon nodes but has no
 * gap set (children's hit areas will touch or overlap on mobile).
 */
function checkContainerButtonSpacing(
  node: BuilderNode,
  ownerSectionId: string | null,
): MobileHealthIssue | null {
  if (node.kind !== "container") return null;
  const container = node as BuilderContainerNode;

  const mobileLayout =
    container.props.responsive?.mobile?.layout ?? container.props.layout;
  // Only flag row layouts that persist on mobile.
  if (mobileLayout !== "row") return null;

  const hasButtons = container.children.some(
    (child) => child.kind === "button" || child.kind === "icon",
  );
  if (!hasButtons) return null;

  const mobileGap = container.props.responsive?.mobile?.gap ?? container.props.gap;
  if (mobileGap) return null; // a gap token is set — fine

  // Check free-value gap escape on the style.
  const mobileStyleGap =
    container.props.style?.responsive?.mobile?.gap ?? container.props.style?.gap;
  if (mobileStyleGap) return null;

  return {
    kind: "tap_target",
    severity: "warn",
    nodeId: node.id,
    nodeKind: node.kind,
    ownerSectionId,
    message: `Row container with buttons/icons has no gap on mobile — tap targets will touch. Add a gap token (s/m/l) or set a mobile stack layout.`,
  };
}

// ── Check 3: Horizontal overflow ───────────────────────────────────────────

/**
 * Flag a container that stays multi-column / row on mobile without wrapping.
 * Analogy: `container-mobile-stack` in layout-health.ts but focused on overflow
 * rather than readability (fires even for 2-column grids if no mobile override).
 */
function checkContainerOverflow(
  node: BuilderNode,
  ownerSectionId: string | null,
): MobileHealthIssue | null {
  if (node.kind !== "container") return null;
  const container = node as BuilderContainerNode;

  const mobileLayout = container.props.responsive?.mobile?.layout;

  // If the mobile layout is explicitly `stack`, the designer handled it.
  if (mobileLayout === "stack") return null;

  const baseLayout = container.props.layout;
  const baseColumns = container.props.columns ?? 1;

  if (
    (baseLayout === "grid" && baseColumns >= 3) ||
    (baseLayout === "row" && container.children.length >= 3)
  ) {
    // Check flexWrap on the style — if wrap is set, overflow is handled.
    const mobileWrap =
      container.props.style?.responsive?.mobile?.flexWrap ??
      container.props.style?.flexWrap;
    if (mobileWrap === "wrap" || mobileWrap === "wrap-reverse") return null;

    return {
      kind: "overflow",
      severity: "warn",
      nodeId: node.id,
      nodeKind: node.kind,
      ownerSectionId,
      message: `Container has ${baseLayout === "grid" ? `${baseColumns}-column grid` : `${container.children.length}-item row`} with no mobile stack override — likely horizontal overflow on phones. Set mobile layout to "stack" or add flex-wrap.`,
    };
  }

  return null;
}

/**
 * Flag a split that doesn't collapse on mobile (mirroring layout-health's
 * `split-mobile-collapse` but surfaced as an *overflow* mobile health issue
 * rather than a blocking layout finding).
 */
function checkSplitOverflow(
  node: BuilderNode,
  ownerSectionId: string | null,
): MobileHealthIssue | null {
  if (node.kind !== "split") return null;
  const split = node as BuilderSplitNode;
  if (split.props.collapseOnMobile === false) {
    return {
      kind: "overflow",
      severity: "warn",
      nodeId: node.id,
      nodeKind: node.kind,
      ownerSectionId,
      message: `Split block has "collapseOnMobile: false" — both columns will stay side-by-side on phones, likely causing content squeeze or overflow.`,
    };
  }
  return null;
}

/**
 * Flag any node with a fixed `width` wider than the narrowest mobile viewport
 * (390 px). Values specified as percentages / relative units are skipped
 * (they can't be resolved statically).
 */
function checkFixedWidthOverflow(
  node: BuilderNode,
  ownerSectionId: string | null,
): MobileHealthIssue | null {
  const style = "props" in node && "style" in node.props
    ? (node.props as { style?: { width?: string; responsive?: { mobile?: { width?: string } } } }).style
    : null;
  if (!style) return null;

  // Use mobile-override width when present, otherwise base.
  const rawWidth = style.responsive?.mobile?.width ?? style.width;
  if (!rawWidth) return null;

  const px = parseLengthToPx(rawWidth);
  if (px === null) return null; // relative — skip

  if (px > MOBILE_VIEWPORT_MAX_PX) {
    return {
      kind: "overflow",
      severity: "warn",
      nodeId: node.id,
      nodeKind: node.kind,
      ownerSectionId,
      message: `Node has fixed width ${px}px, which exceeds the narrowest mobile viewport (${MOBILE_VIEWPORT_MAX_PX}px). Use a relative width (%, 100%) or remove the fixed dimension.`,
    };
  }

  return null;
}

// ── Tree walker ────────────────────────────────────────────────────────────

/**
 * Run all mobile-health checks over a BuilderNodeTree.
 *
 * Pure function — no side effects, no I/O. All issues are advisory (`"warn"`).
 */
export function runMobileHealthCheck(tree: BuilderNodeTree): ReadonlyArray<MobileHealthIssue> {
  const issues: MobileHealthIssue[] = [];

  const walk = (
    nodes: ReadonlyArray<BuilderNode>,
    ownerSectionId: string | null,
  ): void => {
    for (const node of nodes) {
      const nextOwnerSectionId =
        node.kind === "section"
          ? node.props.sectionId ?? ownerSectionId
          : ownerSectionId;

      // Check 1: tiny text
      const tinyText = checkTinyText(node, nextOwnerSectionId);
      if (tinyText) issues.push(tinyText);

      // Check 2a: small tap target (button / icon)
      const tapTarget = checkTapTarget(node, nextOwnerSectionId);
      if (tapTarget) issues.push(tapTarget);

      // Check 2b: container with buttons and no gap
      const btnSpacing = checkContainerButtonSpacing(node, nextOwnerSectionId);
      if (btnSpacing) issues.push(btnSpacing);

      // Check 3a: container/split overflow
      const containerOverflow = checkContainerOverflow(node, nextOwnerSectionId);
      if (containerOverflow) issues.push(containerOverflow);

      const splitOverflow = checkSplitOverflow(node, nextOwnerSectionId);
      if (splitOverflow) issues.push(splitOverflow);

      // Check 3b: fixed width > viewport
      const widthOverflow = checkFixedWidthOverflow(node, nextOwnerSectionId);
      if (widthOverflow) issues.push(widthOverflow);

      // Recurse into children
      if ("children" in node && Array.isArray(node.children)) {
        walk(node.children, nextOwnerSectionId);
      }
    }
  };

  walk(tree, null);
  return issues;
}
