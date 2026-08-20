/**
 * Mobile fix resolver (W3-M3) — turn each detected mobile problem into a
 * concrete, deterministic, APPLIED responsive override on the MOBILE breakpoint
 * only. This is the "one-click Fix mobile issues" engine: it consumes the M1
 * detection contract (`collectMobileOverflowOffenders` + `runMobileHealthCheck`)
 * and never re-detects, then produces the exact builder-tree mutations that make
 * a mobile-broken page fit the narrowest phone.
 *
 * The three deterministic transforms (all scoped to `responsive.mobile`, the
 * desktop/base style is NEVER touched):
 *
 *   1. **Fixed width / min-width overflow** (M1's blocking offenders) → a
 *      mobile-breakpoint override that makes the node fit: `width: 100%` +
 *      `max-width: 100%` (via the collision-safe `maxWidthFree` escape), and —
 *      only when a fixed `min-width` is itself wider than the viewport —
 *      `min-width: 0px` to release the clamp. After the fix `resolveMobileOverflow`
 *      returns `null`, so the publish-blocking `mobile_overflow` preflight error
 *      (W3-M1) clears. This is the load-bearing guarantee this lane closes.
 *
 *   2. **Multi-column container that never stacks** (soft advisory) → a
 *      container-level `responsive.mobile.layout = "stack"` override so the grid
 *      / row collapses to one column on phones.
 *
 *   3. **Split that does not collapse** (soft advisory, `collapseOnMobile:false`)
 *      → set `collapseOnMobile = true` so both columns stack on mobile.
 *
 * These are RULE-BASED transforms, not a model call — "AI" here is the one-click
 * auto-fix. Every produced mutation is a plain builder-node `patch` that flows
 * through `applyBuilderNodeOperation`, so the existing tree validation, the
 * copy-on-write spine, and the undo/redo transaction model all apply unchanged.
 * `applyMobileFixes` folds every fix into a SINGLE next tree so the whole batch
 * commits as one undoable transaction (one Cmd+Z reverts the entire fix).
 *
 * Pure module, zero I/O — unit-testable without a DOM or the EditProvider.
 */

import {
  collectBuilderTreeLayoutFindings,
  isBlockingLayoutFindingId,
} from "./layout-health";
import {
  collectMobileOverflowOffenders,
  parseLengthToPx,
  runMobileHealthCheck,
  MOBILE_VIEWPORT_MAX_PX,
} from "./mobile-health";
import { applyBuilderNodeOperation } from "./operations";
import type {
  BuilderNode,
  BuilderNodeKind,
  BuilderNodeStyle,
  BuilderNodeTree,
} from "./types";

// ── Public surface ───────────────────────────────────────────────────────────

/** Which deterministic transform a fix applies. */
export type MobileFixKind =
  | "overflow_width"
  | "container_stack"
  | "split_collapse"
  /** A publish-blocking layout finding applied via its own quickFixPatch. */
  | "layout_blocker";

/**
 * One applied-fix descriptor: the target node + the exact props `patch` that
 * resolves its mobile problem on the mobile breakpoint. The patch is a plain
 * builder-node props patch (shallow-merged by the `patch` op), so it is fed
 * straight to `applyBuilderNodeOperation`.
 */
export interface MobileFix {
  /** Target builder node id. */
  nodeId: string;
  /** Kind of the target node, for display labels. */
  nodeKind: BuilderNodeKind;
  /** Owning section id, if determinable (fallback-focus in the panel). */
  ownerSectionId: string | null;
  /** Which transform this fix applies. */
  kind: MobileFixKind;
  /** Human-readable, publish-drawer-ready summary of what the fix does. */
  summary: string;
  /** The props patch to apply to the node (mobile-scoped; desktop untouched). */
  patch: Record<string, unknown>;
}

// ── Node lookup (local pure walker — no client coupling) ─────────────────────

function findNodeById(tree: BuilderNodeTree, nodeId: string): BuilderNode | null {
  for (const node of tree) {
    if (node.id === nodeId) return node;
    if ("children" in node && Array.isArray(node.children)) {
      const hit = findNodeById(node.children, nodeId);
      if (hit) return hit;
    }
  }
  return null;
}

function readNodeStyle(node: BuilderNode): BuilderNodeStyle | undefined {
  return "props" in node && "style" in node.props
    ? (node.props as { style?: BuilderNodeStyle }).style
    : undefined;
}

// ── Transform builders (pure; each returns the props patch) ──────────────────

/**
 * Build the mobile-breakpoint style override that makes an overflowing node fit
 * the narrowest phone. Merges into the EXISTING `responsive.mobile` bucket so a
 * prior mobile override (font-size, order, …) survives, and leaves the base
 * style and the `tablet` bucket byte-untouched.
 */
function buildOverflowWidthPatch(node: BuilderNode): Record<string, unknown> {
  const style = readNodeStyle(node) ?? {};
  const responsive = style.responsive ?? {};
  const currentMobile = responsive.mobile ?? {};

  // Release a fixed min-width ONLY when it is itself wider than the viewport —
  // otherwise a benign small min-width is preserved. `width:100%` + a
  // `max-width:100%` clamp handle the plain-width case; both are relative, so
  // `resolveMobileOverflow` resolves them to `null` (unresolvable statically =
  // no overflow).
  const effectiveMinWidthPx = parseLengthToPx(
    currentMobile.minWidth ?? style.minWidth,
  );
  const releaseMinWidth =
    effectiveMinWidthPx !== null && effectiveMinWidthPx > MOBILE_VIEWPORT_MAX_PX;

  const nextMobile = {
    ...currentMobile,
    width: "100%",
    maxWidthFree: "100%",
    ...(releaseMinWidth ? { minWidth: "0px" } : {}),
  };

  const nextStyle: BuilderNodeStyle = {
    ...style,
    responsive: { ...responsive, mobile: nextMobile },
  };
  return { style: nextStyle };
}

/**
 * Build the container-level responsive override that stacks a multi-column
 * container to one column on mobile. This is the container `props.responsive`
 * channel (NOT `style.responsive`), matching how the renderer + `mobile-health`
 * read a container's mobile layout.
 */
function buildContainerStackPatch(node: BuilderNode): Record<string, unknown> {
  const props = node.props as {
    responsive?: Record<string, Record<string, unknown>>;
  };
  const responsive = props.responsive ?? {};
  const currentMobile = responsive.mobile ?? {};
  const nextResponsive = {
    ...responsive,
    // `columns: 1` is REQUIRED, not decorative: the tree validator rejects
    // "stack layout must use exactly 1 column", so preserving an inherited
    // `columns: 2` from the existing mobile bucket produced an INVALID tree
    // and `applyMobileFixes` silently dropped the fix — the button reported
    // success while the container still rendered two columns on phones.
    // (Live Impronta homepage: every grid carried
    // `mobile: { gap: "s", layout: "grid", columns: 2 }`, so all three of its
    // publish blockers survived a "Fix mobile issues" click.)
    mobile: { ...currentMobile, layout: "stack", columns: 1 },
  };
  return { responsive: nextResponsive };
}

/** Build the split patch that re-enables mobile collapse. */
function buildSplitCollapsePatch(): Record<string, unknown> {
  return { collapseOnMobile: true };
}

// ── Fix collection (consumes M1 detection — never re-detects) ────────────────

/**
 * Collect every FIXABLE mobile issue in a builder tree as a concrete
 * `MobileFix`. Consumes the M1 detection contract directly:
 *
 *   - `collectMobileOverflowOffenders` → the definite (publish-blocking)
 *     fixed-width / min-width overflows → `overflow_width` fixes.
 *   - `runMobileHealthCheck` overflow advisories → container multi-column
 *     (`container_stack`) and non-collapsing split (`split_collapse`) fixes.
 *
 * Tiny-text and tap-target advisories are intentionally NOT auto-fixed: their
 * correct value is a judgement call (which font-size? which tap size?), so they
 * stay advisory in `MobileHealthPanel`. Overflow — where the fix is
 * deterministic (make it fit) — is what this one-click action resolves.
 *
 * Pure function, zero I/O.
 */
export function collectMobileFixes(
  tree: BuilderNodeTree,
): ReadonlyArray<MobileFix> {
  const fixes: MobileFix[] = [];
  const seen = new Set<string>(); // dedupe by `${nodeId}:${kind}`

  const push = (fix: MobileFix): void => {
    const key = `${fix.nodeId}:${fix.kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    fixes.push(fix);
  };

  // 1. Blocking fixed-width / min-width overflow (M1's hard offender list).
  for (const offender of collectMobileOverflowOffenders(tree)) {
    const node = findNodeById(tree, offender.nodeId);
    if (!node) continue;
    push({
      nodeId: offender.nodeId,
      nodeKind: offender.nodeKind,
      ownerSectionId: offender.ownerSectionId,
      kind: "overflow_width",
      summary: `Constrain ${offender.nodeKind.replace(/_/g, " ")} to 100% width on mobile (was ${offender.widthPx}px).`,
      patch: buildOverflowWidthPatch(node),
    });
  }

  // 2. Soft overflow advisories (multi-column container / non-collapsing split).
  for (const issue of runMobileHealthCheck(tree)) {
    if (issue.kind !== "overflow" || issue.blocking) continue;
    const node = findNodeById(tree, issue.nodeId);
    if (!node) continue;

    if (node.kind === "container") {
      push({
        nodeId: issue.nodeId,
        nodeKind: issue.nodeKind,
        ownerSectionId: issue.ownerSectionId,
        kind: "container_stack",
        summary: "Stack this container to one column on mobile.",
        patch: buildContainerStackPatch(node),
      });
    } else if (node.kind === "split") {
      push({
        nodeId: issue.nodeId,
        nodeKind: issue.nodeKind,
        ownerSectionId: issue.ownerSectionId,
        kind: "split_collapse",
        summary: "Collapse this split so its columns stack on mobile.",
        patch: buildSplitCollapsePatch(),
      });
    }
  }

  // 3. Publish-BLOCKING layout findings that carry a quick fix. The layout
  //    linter (layout-health.ts) is what the publish preflight promotes to
  //    "error"; each blocking finding already computes the exact props patch
  //    its inspector quick-fix button applies. Folding them in here gives the
  //    publish drawer's one-click fix the same reach as the inspector — the
  //    2-column container the soft advisory above ignores (it only fires at
  //    3+ columns), carousels missing controls, overflowing slides, etc.
  //    `tabs-no-panels` has no patch (empty tabs need content, not settings)
  //    and correctly stays manual. Dedupe maps the two findings that
  //    duplicate transforms #1/#2 onto the SAME seen-key so a node never
  //    collects two fixes for one problem.
  for (const finding of collectBuilderTreeLayoutFindings(tree)) {
    if (!isBlockingLayoutFindingId(finding.id) || !finding.quickFixPatch) {
      continue;
    }
    const node = findNodeById(tree, finding.nodeId);
    if (!node) continue;
    // Both container findings ("never stacks" and "3+ mobile columns") apply
    // the same stack-to-one-column patch, so both map onto container_stack —
    // one node, one fix, regardless of how many linter rules flagged it.
    const kind: MobileFixKind =
      finding.id === "container-mobile-stack" ||
      finding.id === "container-mobile-overflow"
        ? "container_stack"
        : finding.id === "split-mobile-collapse"
          ? "split_collapse"
          : "layout_blocker";
    const key =
      kind === "layout_blocker"
        ? `${finding.nodeId}:${finding.id}`
        : `${finding.nodeId}:${kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    fixes.push({
      nodeId: finding.nodeId,
      nodeKind: finding.nodeKind,
      ownerSectionId: finding.ownerSectionId,
      kind,
      summary: `${finding.title}: ${finding.quickFixLabel ?? "apply the layout quick fix"}.`,
      patch: finding.quickFixPatch,
    });
  }

  return fixes;
}

// ── Batch apply (folds every fix into ONE next tree) ─────────────────────────

export type ApplyMobileFixesResult =
  | { ok: true; tree: BuilderNodeTree; appliedCount: number }
  | { ok: false; error: string };

/**
 * Fold every fix into a SINGLE next builder tree. Each fix runs through the real
 * `applyBuilderNodeOperation` `patch` op (so tree validation + the copy-on-write
 * spine apply), sequentially over the accumulating tree. A fix that no-ops
 * (`NO_CHANGE` — the override already holds) is skipped without failing the
 * batch; a fix whose node vanished is skipped too. The returned tree is what the
 * caller commits as ONE undoable transaction, so a single Cmd+Z reverts the
 * whole fix set.
 *
 * `fixes` defaults to `collectMobileFixes(tree)` so callers can apply
 * everything fixable in one call. Returns the final tree + how many fixes
 * actually changed the tree. When nothing applied, `tree` is the input
 * reference and `appliedCount` is 0 (the commit path's no-op guard then records
 * no history entry).
 */
export function applyMobileFixes(
  tree: BuilderNodeTree,
  fixes: ReadonlyArray<MobileFix> = collectMobileFixes(tree),
): ApplyMobileFixesResult {
  let acc = tree;
  let appliedCount = 0;

  for (const fix of fixes) {
    const result = applyBuilderNodeOperation({
      operation: "patch",
      tree: acc,
      nodeId: fix.nodeId,
      patch: fix.patch,
    });
    if (result.ok) {
      acc = result.tree;
      appliedCount += 1;
      continue;
    }
    // A no-op patch (override already present) is benign — skip it. Any other
    // failure (validation) is skipped too so one bad fix never sinks the batch;
    // the remaining fixes still improve the tree.
    if (result.code === "NO_CHANGE") continue;
  }

  return { ok: true, tree: acc, appliedCount };
}
