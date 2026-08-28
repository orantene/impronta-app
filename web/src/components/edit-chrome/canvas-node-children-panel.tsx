"use client";

/**
 * canvas-node-children-panel.tsx — the "Nested blocks" panel (#908).
 *
 * Extracted verbatim from `selection-layer.tsx` (row 5.4 of the page-builder
 * 8/10 program). This is a PURE MOVE: no markup, style value, handler or label
 * changed. The seam is clean because the panel is a leaf of the selection
 * layer — it takes every input as a prop, owns only its own drag/hover/focus
 * state, and the selection layer never reads anything back out of it.
 *
 * `canvasChildPrimaryLabel` and `truncateNodeLabel` travel with the panel
 * because they are its label vocabulary; the selection layer still uses them
 * for the chip and breadcrumb, so they are exported rather than duplicated.
 */

import { useState, type DragEvent } from "react";
import {
  ArrowDown, ArrowUp, ClipboardPaste, Copy, CornerLeftUp, Files, FolderTree,
  Plus, Trash2,
} from "lucide-react";

import { siblingDropGapToMoveIndex } from "@/lib/site-admin/builder-node/sibling-drop-gap";
import { BUILDER_NODE_REGISTRY, type BuilderNode } from "@/lib/site-admin/builder-node";
import { resolveLayerDisplayName } from "@/lib/site-admin/builder-node/freeform-layer-name";
import type { BuilderNodePastePreview } from "./edit-context";
import { useEditorLocale } from "./use-editor-locale";
import { BUILDER_VISUAL } from "./inspectors/kit/tokens";
import { CANVAS_CHILDREN_PANEL, CHROME, CHROME_RADII, Z_INDEX } from "./kit/tokens";
import { PortaledOverlay } from "./kit/portaled-overlay";
import { useCanvasPanelPlacement } from "./canvas-panel-clearance";
import {
  BLUE, BLUE_RGB, CANVAS_CHROME_RADIUS, DROP_LINE_HEIGHT, DROP_LINE_RADIUS,
} from "./selection-layer-canvas-tokens";
import type { Rect } from "./selection-layer-geometry";

export function CanvasNodeChildrenPanel({
  selectedRect,
  open,
  onClose,
  parentNodeId,
  parentLabel,
  viewingChild = false,
  onSelectParent,
  onOpen,
  nodes,
  selectedNodeId,
  copiedKind,
  reduceMotion = false,
  onSelect,
  onMove,
  onMoveToIndex,
  onCopy,
  onDuplicate,
  onPaste,
  getPastePreview,
  onRemove,
}: {
  selectedRect: Rect;
  /** Controlled by the selection chip's "Nested blocks" toggle. */
  open: boolean;
  onClose: () => void;
  parentNodeId: string | null;
  parentLabel: string;
  /** True when the SELECTION is one of `nodes`, not the parent holding them. */
  viewingChild?: boolean;
  /** Jump up to the parent. Null when the parent is already selected. */
  onSelectParent?: (() => void) | null;
  /** Reopen from the collapsed pill. */
  onOpen: () => void;
  nodes: BuilderNode[];
  selectedNodeId: string | null;
  copiedKind: BuilderNode["kind"] | null;
  reduceMotion?: boolean;
  onSelect: (nodeId: string) => void;
  onMove: (nodeId: string, direction: "up" | "down") => Promise<void>;
  onMoveToIndex: (
    nodeId: string,
    parentNodeId: string,
    targetIndex: number,
  ) => Promise<void>;
  onCopy: (nodeId: string) => Promise<void>;
  onDuplicate: (nodeId: string) => Promise<void>;
  onPaste: (nodeId: string) => Promise<void>;
  getPastePreview: (nodeId?: string | null) => BuilderNodePastePreview | null;
  onRemove: (nodeId: string) => Promise<void>;
}) {
  const [draggingNode, setDraggingNode] = useState<{
    nodeId: string;
    sourceIndex: number;
  } | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  // Open/closed is owned by the parent so the selection chip's toggle and the
  // panel's own `×` drive the SAME state (one truth, two entry points).
  const { t } = useEditorLocale();
  const viewportHeight =
    typeof window === "undefined" ? selectedRect.top + selectedRect.height + 220 : window.innerHeight;
  const viewportWidth =
    typeof window === "undefined" ? selectedRect.left + 308 : window.innerWidth;
  // WAVE2-2.2 — the panel used to be pinned at a literal `left: 14`, which put
  // its top rows underneath the left command dock (and underneath any open dock
  // panel) whenever the viewport was short enough for the rail to reach into
  // its band. Measure the left chrome and sit clear of it instead, so this
  // stays correct when the dock, the navigator width, or the panel height move.
  const placement = useCanvasPanelPlacement({
    enabled: viewportWidth > CANVAS_CHILDREN_PANEL.minViewportWidth,
    preferredWidth: CANVAS_CHILDREN_PANEL.width,
    minWidth: CANVAS_CHILDREN_PANEL.minWidth,
    height: open ? CANVAS_CHILDREN_PANEL.maxHeight : CANVAS_CHILDREN_PANEL.pillHeight,
    bottomOffset: CANVAS_CHILDREN_PANEL.bottom,
    homeInset: CANVAS_CHILDREN_PANEL.homeInset,
    gap: CANVAS_CHILDREN_PANEL.gap,
    rightGutter: CANVAS_CHILDREN_PANEL.rightGutter,
  });
  if (viewportWidth <= CANVAS_CHILDREN_PANEL.minViewportWidth) return null;
  // Closed → collapse to a pill in the SAME spot rather than disappearing, so
  // the panel has a visible home to come back from. Sits on the bottom-left
  // control stack directly above the zoom bar.
  if (!open) {
    return (
      // PANELS-1 — body-portaled, not left inside #edit-overlay-portal. That
      // host is a stacking context at z-83, so this panel's own z was flattened
      // to 83 and it painted BEHIND the inspector dock (85), the drawers
      // (87/88), and the left dock rail (86) - the owner's "the panels are
      // always behind". Portaled to <body>, the band below is global and real.
      <PortaledOverlay>
      <button
        type="button"
        data-builder-node-canvas-children-collapsed=""
        onClick={onOpen}
        aria-label={t("Show nested blocks ({count})").replace(
          "{count}",
          String(nodes.length),
        )}
        aria-expanded={false}
        title={t("Show nested blocks")}
        style={{
          position: "fixed",
          bottom: CANVAS_CHILDREN_PANEL.bottom,
          left: placement.left,
          height: CANVAS_CHILDREN_PANEL.pillHeight,
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          padding: "0 11px 0 9px",
          borderRadius: CHROME_RADII.lg,
          border: `1px solid ${BUILDER_VISUAL.panelBorder}`,
          background: CHROME.surface,
          boxShadow: BUILDER_VISUAL.toolbarShadow,
          color: CHROME.muted,
          cursor: "pointer",
          zIndex: Z_INDEX.canvasPanels,
          pointerEvents: "auto",
          fontSize: 11.5,
          fontWeight: 600,
          fontFamily:
            'ui-sans-serif, "SF Pro Text", system-ui, -apple-system, sans-serif',
        }}
      >
        <FolderTree size={14} strokeWidth={2} aria-hidden />
        <span>{nodes.length}</span>
      </button>
      </PortaledOverlay>
    );
  }
  const clearDragState = () => {
    setDraggingNode(null);
    setDropIndex(null);
  };
  const handleDragStart =
    (nodeId: string, sourceIndex: number) =>
    (event: DragEvent<HTMLDivElement>) => {
      if (!parentNodeId || nodes.length <= 1) return;
      event.stopPropagation();
      // Match navigator child-row drag: promote the dragged node so inspector,
      // chip, and reorder targets agree (P7A-3 parity).
      onSelect(nodeId);
      setDraggingNode({ nodeId, sourceIndex });
      setDropIndex(null);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", nodeId);
    };
  const handleDragOver =
    (index: number) => (event: DragEvent<HTMLDivElement>) => {
      if (!draggingNode || !parentNodeId) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      setDropIndex(event.clientY > rect.top + rect.height / 2 ? index + 1 : index);
    };
  const handleDrop = async (event: DragEvent<HTMLElement>) => {
    if (!draggingNode || dropIndex === null || !parentNodeId) {
      clearDragState();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const resolved = siblingDropGapToMoveIndex({
      dropGapIndex: dropIndex,
      sourceSiblingIndex: draggingNode.sourceIndex,
      sameParent: true,
    });
    if (resolved.kind === "noop") {
      clearDragState();
      return;
    }
    const nodeId = draggingNode.nodeId;
    clearDragState();
    await onMoveToIndex(nodeId, parentNodeId, resolved.targetSiblingIndex);
  };
  return (
    // PANELS-1 — same body portal as the collapsed pill above.
    <PortaledOverlay>
    <div
      data-builder-node-canvas-children=""
      style={{
        position: "fixed",
        // Docked above the zoom bar on the left rather than chasing the
        // selection, so it shares the bottom control-bar stack with the other
        // floating chrome instead of covering the canvas mid-page. `left` and
        // `width` are MEASURED against the left chrome (WAVE2-2.2) so the dock
        // and any open dock panel never clip the header or the first row.
        bottom: CANVAS_CHILDREN_PANEL.bottom,
        left: placement.left,
        width: placement.width,
        maxHeight: CANVAS_CHILDREN_PANEL.maxHeight,
        padding: "10px 10px 11px",
        borderRadius: CHROME_RADII.lg,
        border: `1px solid ${BUILDER_VISUAL.panelBorder}`,
        background: CHROME.surface,
        color: CHROME.ink,
        boxShadow: BUILDER_VISUAL.toolbarShadow,
        zIndex: Z_INDEX.canvasPanels,
        pointerEvents: "auto",
        overflow: "hidden",
        fontFamily:
          'ui-sans-serif, "SF Pro Text", system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <div className="min-w-0">
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: CHROME.muted3,
            }}
          >
            Nested blocks
          </div>
          {/* Parent row. When a CHILD is selected this is a button that jumps
              up a level, and it reads muted so the highlighted child row below
              stays the "you are here" marker. When the parent itself is
              selected it is violet + not clickable (already there). */}
          <button
            type="button"
            disabled={!onSelectParent}
            onClick={() => onSelectParent?.()}
            title={
              onSelectParent
                ? t("Select the parent ({label})").replace("{label}", parentLabel)
                : t("Parent is selected")
            }
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              maxWidth: "100%",
              border: "none",
              background: "transparent",
              fontSize: 11.5,
              fontWeight: 600,
              textAlign: "left",
              color: viewingChild ? CHROME.muted : CHROME.accent,
              cursor: onSelectParent ? "pointer" : "default",
              // Reads as a control: a hit area with a hover wash, and the
              // label underlined so "you can click this" survives at 11.5px.
              margin: "1px 0 0 -5px",
              padding: "2px 6px",
              borderRadius: 6,
              // Longhand only — mixing the `textDecoration` shorthand with
              // `textDecorationColor` makes React warn and lets the shorthand
              // clobber the colour on re-render.
              textDecorationLine: onSelectParent ? "underline" : "none",
              textDecorationColor: CHROME.muted3,
              textUnderlineOffset: 2,
              transition: "background 110ms ease, color 110ms ease",
            }}
            onMouseEnter={(e) => {
              if (!onSelectParent) return;
              e.currentTarget.style.background = "rgba(24,24,27,0.05)";
              e.currentTarget.style.color = CHROME.ink;
            }}
            onMouseLeave={(e) => {
              if (!onSelectParent) return;
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = CHROME.muted;
            }}
          >
            <CornerLeftUp
              size={11}
              strokeWidth={2.4}
              aria-hidden
              style={{ flexShrink: 0, opacity: viewingChild ? 1 : 0.35 }}
            />
            <span
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {parentLabel}
            </span>
            {!viewingChild ? (
              <span
                style={{
                  flexShrink: 0,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: CHROME.accent,
                  background: BUILDER_VISUAL.accentBg,
                  borderRadius: 4,
                  padding: "1px 4px",
                }}
              >
                Selected
              </span>
            ) : null}
          </button>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              color: CHROME.muted,
            }}
          >
            {(nodes.length === 1 ? t("{count} block") : t("{count} blocks")).replace(
              "{count}",
              String(nodes.length),
            )}
          </span>
          <button
            type="button"
            aria-label={t("Hide nested blocks panel")}
            title={t("Hide for this selection")}
            onClick={onClose}
            style={{
              width: 18,
              height: 18,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              borderRadius: CANVAS_CHROME_RADIUS,
              background: "transparent",
              color: CHROME.muted,
              cursor: "pointer",
              padding: 0,
              fontSize: 14,
              lineHeight: 1,
              transition: "background 110ms ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(24,24,27,0.06)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            ×
          </button>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          maxHeight: 168,
          overflowY: "auto",
          paddingRight: 2,
          // Children sit indented off a hairline that runs down from the parent
          // row above, so one glance says "these belong to that".
          marginLeft: 5,
          paddingLeft: 9,
          borderLeft: `1px solid ${CHROME.line}`,
        }}
      >
        {nodes.map((node, index) => {
          const isSelected = selectedNodeId === node.id;
          // Actions appear only once a row is SELECTED (or keyboard-focused).
          // Revealing them on hover resized the row under the cursor and left a
          // half-painted icon strip while the list scrolled.
          const showActionRow = isSelected || focusedNodeId === node.id;
          const pastePreview = copiedKind ? getPastePreview(node.id) : null;
          return (
            <div key={node.id}>
              {draggingNode && dropIndex === index ? (
                <div
                  aria-hidden
                  style={{
                    position: "relative",
                    height: DROP_LINE_HEIGHT,
                    margin: "0 2px 8px",
                    borderRadius: DROP_LINE_RADIUS,
                    background: `linear-gradient(90deg, rgba(${BLUE_RGB},0) 0%, rgba(${BLUE_RGB},0.4) 14%, ${BLUE} 50%, rgba(${BLUE_RGB},0.4) 86%, rgba(${BLUE_RGB},0) 100%)`,
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.38), 0 0 0 1px rgba(${BLUE_RGB},0.22), 0 2px 14px rgba(${BLUE_RGB},0.32)`,
                    transition: reduceMotion ? "none" : "opacity 120ms ease-out",
                  }}
                />
              ) : null}
              <div
                draggable={!!parentNodeId && nodes.length > 1}
                onDragStart={handleDragStart(node.id, index)}
                onDragOver={handleDragOver(index)}
                onDrop={(event) => void handleDrop(event)}
                onDragEnd={clearDragState}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  gap: 8,
                  padding: "7px 8px",
                  borderRadius: CANVAS_CHROME_RADIUS,
                  opacity: draggingNode?.nodeId === node.id ? 0.62 : 1,
                  // Hover only TINTS the row now; it no longer reveals the
                  // action strip, so the row never changes height under the
                  // cursor.
                  background: isSelected
                    ? BUILDER_VISUAL.accentBg
                    : hoveredNodeId === node.id
                      ? "rgba(24,24,27,0.06)"
                      : "rgba(24,24,27,0.03)",
                  border: isSelected
                    ? `1px solid ${CHROME.accent}`
                    : `1px solid ${CHROME.line}`,
                }}
                onMouseEnter={() => setHoveredNodeId(node.id)}
                onMouseLeave={() =>
                  setHoveredNodeId((current) => (current === node.id ? null : current))
                }
                onFocusCapture={() => setFocusedNodeId(node.id)}
                onBlurCapture={(event) => {
                  const next = event.relatedTarget;
                  if (next instanceof Node && event.currentTarget.contains(next)) {
                    return;
                  }
                  setFocusedNodeId((current) => (current === node.id ? null : current));
                }}
              >
              <button
                type="button"
                onClick={() => onSelect(node.id)}
                style={{
                  flex: "1 1 100%",
                  minWidth: "100%",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  border: "none",
                  background: "transparent",
                  color: CHROME.ink,
                  cursor: "pointer",
                  padding: 0,
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: CANVAS_CHROME_RADIUS,
                    background: "rgba(24,24,27,0.05)",
                    color: CHROME.muted,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {nodes.length > 1 ? "⋮⋮" : index + 1}
                </span>
                <span className="flex-1 min-w-0">
                  {/* TYPE leads — it is what the operator is scanning for. The
                      block's own text is the supporting summary underneath,
                      clamped to two lines so long copy can't push the row. */}
                  <span
                    style={{
                      display: "block",
                      fontSize: 12,
                      fontWeight: 700,
                      lineHeight: 1.25,
                      color: isSelected ? CHROME.accent : CHROME.ink,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {t(canvasChildSecondaryLabel(node))}
                  </span>
                  <span
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      marginTop: 2,
                      fontSize: 10.5,
                      lineHeight: 1.3,
                      color: CHROME.muted,
                      overflow: "hidden",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {t(canvasChildPrimaryLabel(node))}
                  </span>
                </span>
              </button>
              <div
                style={{
                  display: showActionRow ? "inline-flex" : "none",
                  width: "100%",
                  alignItems: "center",
                  gap: 4,
                  flexShrink: 0,
                  paddingLeft: 26,
                  marginTop: 6,
                  paddingTop: 6,
                  borderTop: `1px solid ${CHROME.line}`,
                }}
              >
                <CanvasMiniButton
                  label={t("Move {label} up").replace("{label}", t(canvasChildPrimaryLabel(node)))}
                  disabled={index === 0}
                  onClick={() => {
                    onSelect(node.id);
                    void onMove(node.id, "up");
                  }}
                >
                  <ArrowUp size={13} strokeWidth={2.1} aria-hidden />
                </CanvasMiniButton>
                <CanvasMiniButton
                  label={t("Move {label} down").replace("{label}", t(canvasChildPrimaryLabel(node)))}
                  disabled={index === nodes.length - 1}
                  onClick={() => {
                    onSelect(node.id);
                    void onMove(node.id, "down");
                  }}
                >
                  <ArrowDown size={13} strokeWidth={2.1} aria-hidden />
                </CanvasMiniButton>
                <CanvasMiniButton
                  label={t("Duplicate {label}").replace("{label}", t(canvasChildPrimaryLabel(node)))}
                  onClick={() => {
                    onSelect(node.id);
                    void onDuplicate(node.id);
                  }}
                >
                  <Files size={12} strokeWidth={2.1} aria-hidden />
                </CanvasMiniButton>
                <CanvasMiniButton
                  label={t("Copy {label}").replace("{label}", t(canvasChildPrimaryLabel(node)))}
                  onClick={() => {
                    onSelect(node.id);
                    void onCopy(node.id);
                  }}
                >
                  <Copy size={12} strokeWidth={2.1} aria-hidden />
                </CanvasMiniButton>
                {copiedKind ? (
                  <CanvasMiniButton
                    label={
                      pastePreview?.message ??
                      t("Paste copied {label}").replace(
                        "{label}",
                        t(BUILDER_NODE_REGISTRY[copiedKind].label),
                      )
                    }
                    disabled={pastePreview?.mode === "blocked"}
                    onClick={() => {
                      onSelect(node.id);
                      void onPaste(node.id);
                    }}
                  >
                    <ClipboardPaste size={12} strokeWidth={2.1} aria-hidden />
                  </CanvasMiniButton>
                ) : null}
                <CanvasMiniButton
                  label={t("Add block near {label}").replace(
                    "{label}",
                    t(canvasChildPrimaryLabel(node)),
                  )}
                  onClick={() => onSelect(node.id)}
                >
                  <Plus size={12} strokeWidth={2.1} aria-hidden />
                </CanvasMiniButton>
                <CanvasMiniButton
                  label={t("Remove {label}").replace("{label}", t(canvasChildPrimaryLabel(node)))}
                  onClick={() => {
                    onSelect(node.id);
                    void onRemove(node.id);
                  }}
                >
                  <Trash2 size={12} strokeWidth={2.1} aria-hidden />
                </CanvasMiniButton>
              </div>
            </div>
            </div>
          );
        })}
        {draggingNode ? (
          <div
            aria-hidden
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setDropIndex(nodes.length);
            }}
            onDrop={(event) => void handleDrop(event)}
            style={{
              height: dropIndex === nodes.length ? 8 : 2,
              borderRadius: CANVAS_CHROME_RADIUS,
              background:
                dropIndex === nodes.length
                  ? `rgba(${BLUE_RGB},0.85)`
                  : "transparent",
            }}
          />
        ) : null}
      </div>
    </div>
    </PortaledOverlay>
  );
}

function CanvasMiniButton({
  children,
  label,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 22,
        height: 22,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: CANVAS_CHROME_RADIUS,
        border: "none",
        background: "rgba(24,24,27,0.05)",
        color: CHROME.muted,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.35 : 1,
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

export function canvasChildPrimaryLabel(node: BuilderNode): string {
  switch (node.kind) {
    case "heading":
      return node.props.text;
    case "paragraph":
      return truncateNodeLabel(node.props.text, 56);
    case "rich_text":
      return truncateNodeLabel(node.props.text, 56);
    case "button":
      return node.props.label;
    case "image":
      return node.props.alt?.trim() || "Image block";
    case "icon":
      return node.props.label || BUILDER_NODE_REGISTRY[node.kind].label;
    case "accordion_item":
    case "tab_panel":
      return node.props.title;
    case "container":
      // Unified with the layers tree (resolveLayerDisplayName): borrow the
      // wrapped section heading, else a structural Row/Stack/Grid name — so the
      // canvas chip + breadcrumb + a11y labels never disagree with the navigator.
      return resolveLayerDisplayName(node);
    default:
      return BUILDER_NODE_REGISTRY[node.kind].label;
  }
}

function canvasChildSecondaryLabel(node: BuilderNode): string {
  switch (node.kind) {
    case "social_post":
      // Name the network, not the generic kind: a page can carry several of
      // these and "Social post" three times over tells the operator nothing.
      return node.props.provider === "tiktok"
        ? "TikTok post"
        : "Instagram post";
    case "social_feed":
      // Same reasoning as social_post: name the network the feed pulls from.
      return node.props.provider === "tiktok"
        ? "TikTok feed"
        : "Instagram feed";
    case "heading":
      return `Heading · H${node.props.level}`;
    case "paragraph":
      return "Paragraph block";
    case "rich_text":
      return "Rich text block";
    case "button":
      return node.props.href || "Button link";
    case "image":
      return "Image block";
    case "video":
      return "Video block";
    case "embed":
      return "Embed block";
    case "icon":
      return node.props.size ? `Icon · ${node.props.size.toUpperCase()}` : "Icon";
    case "pricing_table":
      return `${node.props.tiers.length} pricing tier${node.props.tiers.length === 1 ? "" : "s"}`;
    case "code":
      return "Raw HTML (sandboxed)";
    case "accordion_item":
    case "tab_panel":
      return `${node.children.length} nested block${node.children.length === 1 ? "" : "s"}`;
    case "container":
    case "card":
    case "cta_group":
    case "split":
    case "accordion":
    case "tabs":
    case "carousel":
    case "masonry":
      return `${node.children.length} nested block${node.children.length === 1 ? "" : "s"}`;
    case "divider":
      return node.props.tone === "muted" ? "Divider · muted" : "Divider";
    case "spacer":
      return `Spacer · ${node.props.size.toUpperCase()}`;
    case "nav":
      return `Navigation · ${node.props.links.length} link${node.props.links.length === 1 ? "" : "s"}`;
    case "social_links":
      return node.props.dataBinding?.sourceKey === "workspace_social_links"
        ? "Social links · synced"
        : `Social links · ${node.props.links.length} link${node.props.links.length === 1 ? "" : "s"}`;
    case "form":
      return `Form · ${node.props.fields.length} field${node.props.fields.length === 1 ? "" : "s"}`;
    case "section":
      return BUILDER_NODE_REGISTRY[node.kind].description;
    case "section_embed":
      return `Tulala component · ${node.props.sectionTypeKey}`;
    // WS7 Phase 0 — native data blocks; name the SOURCE, not the kind.
    case "hero_search":
      return "Search hero";
    case "talent_type_grid":
      return node.props.mode === "dynamic"
        ? "Disciplines · from your roster"
        : "Disciplines · hand-authored";
  }
}

export function truncateNodeLabel(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}
