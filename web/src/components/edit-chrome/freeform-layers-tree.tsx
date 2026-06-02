"use client";

/**
 * FreeformLayersTree — left-rail layer list for FREEFORM full-page designs.
 *
 * The Structure Navigator (`navigator-panel.tsx`) lists curated *sections*
 * built from composition slots. A freeform full-page design (one-click
 * starter designs) has NO slots — its content is a non-empty `builderTree`
 * of containers + blocks. With zero slots the navigator's section list is
 * empty, so there was no way to see or navigate the block hierarchy from the
 * left rail.
 *
 * This is a SEPARATE component (it does not touch the section/slot code paths
 * or the section-coupled FlatRow model). It renders the builder tree as a
 * flat, indented, Figma/Webflow-style layer list keyed off the SAME
 * BuilderNode identity the canvas + inspector use, so selecting a row here
 * highlights the block everywhere.
 *
 * Wires (from `useEditContext`):
 *   - `builderTree` — the freeform node tree.
 *   - `selectBuilderNode(nodeId)` — click a row → select that node.
 *   - `selectedBuilderNodeId` — drives the selected-row state.
 *   - `moveBuilderNodeWithinParent(nodeId, "up"|"down")` — per-row reorder.
 *   - `removeBuilderNode(nodeId)` — per-row delete.
 *
 * Styling reuses the CHROME tokens and matches the navigator's section/child
 * rows (indigo-tinted selected fill + inset accent bar, soft hover tint).
 */

import {
  useCallback,
  useMemo,
  useState,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";

import { CHROME, CHROME_RADII } from "./kit";
import { useEditContext } from "./edit-context";
import {
  BUILDER_NODE_REGISTRY,
  type BuilderNode,
  type BuilderNodeKind,
  type BuilderNodeTree,
} from "@/lib/site-admin/builder-node";

const ROW_FONT_SIZE = 14;
const ACTION_ICON_SIZE = 15;
/** Per-depth indent (px). Matches the navigator child-row left-pad rhythm. */
const DEPTH_INDENT = 14;
const ROOT_PADDING = 8;

interface LayerRow {
  id: string;
  kind: BuilderNodeKind;
  label: string;
  depth: number;
  /** Index of this node within its parent's child list (for reorder enablement). */
  index: number;
  /** Number of siblings in this node's parent list (reorder only when > 1). */
  siblingCount: number;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

/** Registry label for a kind, with an underscore→space fallback. */
function kindLabel(kind: BuilderNodeKind): string {
  return BUILDER_NODE_REGISTRY[kind]?.label ?? kind.replace(/_/g, " ");
}

/**
 * Human row name: prefer the node's own text/label content, else the registry
 * label. Mirrors the canvas/navigator "primary label" derivation so the same
 * block reads the same in every surface.
 */
function rowLabel(node: BuilderNode): string {
  switch (node.kind) {
    case "heading":
      return truncate(node.props.text, 56) || "Heading";
    case "paragraph":
    case "rich_text":
      return truncate(node.props.text, 56) || kindLabel(node.kind);
    case "button":
      return node.props.label || "Button";
    case "image":
      return node.props.alt?.trim() || "Image";
    case "icon":
      return node.props.label || kindLabel(node.kind);
    case "accordion_item":
    case "tab_panel":
      return node.props.title || kindLabel(node.kind);
    case "divider":
      return node.props.tone === "muted" ? "Divider · muted" : "Divider";
    case "spacer":
      return `Spacer · ${node.props.size.toUpperCase()}`;
    case "section":
      return node.props.label?.trim() || kindLabel(node.kind);
    default:
      return kindLabel(node.kind);
  }
}

/** Short 1–2 char glyph for the kind pill (first letter of the kind label). */
function kindGlyph(kind: BuilderNodeKind): string {
  return kindLabel(kind).charAt(0).toUpperCase();
}

/**
 * Flatten the tree to indented rows in document order. When the tree's single
 * root is a layout wrapper container (a full-page <main> wrapper), its children
 * start at depth 0 so the whole page isn't visually nested under one root row.
 */
function flattenTree(tree: BuilderNodeTree): LayerRow[] {
  const rows: LayerRow[] = [];

  const walk = (
    nodes: ReadonlyArray<BuilderNode>,
    depth: number,
  ): void => {
    nodes.forEach((node, index) => {
      rows.push({
        id: node.id,
        kind: node.kind,
        label: rowLabel(node),
        depth,
        index,
        siblingCount: nodes.length,
      });
      if ("children" in node && Array.isArray(node.children) && node.children.length > 0) {
        walk(node.children, depth + 1);
      }
    });
  };

  // A freeform full-page design is usually a single wrapper container holding
  // the whole page. Hoist its children to the top level so the list reads as a
  // page of blocks, not one giant root. Only collapse a *container* root (it's
  // the structural page wrapper); a lone section/block root stays visible.
  const onlyRoot =
    tree.length === 1 &&
    tree[0] &&
    tree[0].kind === "container" &&
    "children" in tree[0] &&
    Array.isArray(tree[0].children) &&
    tree[0].children.length > 0
      ? tree[0]
      : null;

  if (onlyRoot && "children" in onlyRoot && Array.isArray(onlyRoot.children)) {
    walk(onlyRoot.children, 0);
  } else {
    walk(tree, 0);
  }

  return rows;
}

/**
 * Small icon button matching the navigator's NodeInlineActionButton: ghost at
 * rest, indigo tint on hover/focus, deeper tint on press. Self-contained so
 * this component does not depend on navigator-panel internals.
 */
function LayerActionButton({
  children,
  label,
  onClick,
  disabled,
  tabIndex,
}: {
  children: ReactNode;
  label: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  tabIndex?: number;
}) {
  const [hover, setHover] = useState(false);
  const [active, setActive] = useState(false);
  const interactive = !disabled;
  const lit = interactive && (hover || active);
  const background = disabled
    ? "transparent"
    : active
      ? "rgba(42,49,71,0.20)"
      : hover
        ? "rgba(42,49,71,0.13)"
        : "rgba(42,49,71,0.06)";
  const borderColor = disabled
    ? "transparent"
    : lit
      ? "rgba(42,49,71,0.22)"
      : "rgba(42,49,71,0.12)";
  const color = disabled ? CHROME.muted2 : lit ? CHROME.accent : CHROME.muted2;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      tabIndex={tabIndex}
      draggable={false}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => {
        event.stopPropagation();
        if (interactive) setActive(true);
      }}
      onMouseUp={() => setActive(false)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setActive(false);
      }}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      onClick={onClick}
      style={{
        width: 22,
        height: 22,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        borderRadius: 6,
        border: `1px solid ${borderColor}`,
        background,
        color,
        cursor: disabled ? "default" : "pointer",
        transition: "background 100ms ease, color 100ms ease, border-color 100ms ease",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

/** Kind pill — a small uppercase glyph chip, matching the navigator pill. */
function LayerKindPill({
  kind,
  selected,
}: {
  kind: BuilderNodeKind;
  selected: boolean;
}) {
  return (
    <span
      aria-hidden
      title={kindLabel(kind)}
      style={{
        width: 22,
        height: 20,
        alignSelf: "center",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 5,
        border: selected
          ? "1px solid rgba(42,49,71,0.22)"
          : `1px solid ${CHROME.line}`,
        background: selected ? "rgba(42,49,71,0.10)" : CHROME.paper,
        color: selected ? CHROME.accent : CHROME.muted,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: "0.02em",
        flexShrink: 0,
      }}
    >
      {kindGlyph(kind)}
    </span>
  );
}

export function FreeformLayersTree() {
  const {
    builderTree,
    selectedBuilderNodeId,
    selectBuilderNode,
    moveBuilderNodeWithinParent,
    removeBuilderNode,
  } = useEditContext();

  const rows = useMemo(() => flattenTree(builderTree), [builderTree]);

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleMove = useCallback(
    async (nodeId: string, direction: "up" | "down") => {
      if (pending) return;
      setPending(true);
      selectBuilderNode(nodeId);
      try {
        await moveBuilderNodeWithinParent(nodeId, direction);
      } finally {
        setPending(false);
      }
    },
    [moveBuilderNodeWithinParent, pending, selectBuilderNode],
  );

  const handleRemove = useCallback(
    async (nodeId: string) => {
      if (pending) return;
      setPending(true);
      try {
        await removeBuilderNode(nodeId);
      } finally {
        setPending(false);
      }
    },
    [pending, removeBuilderNode],
  );

  return (
    <div
      role="tree"
      aria-label="Page layers"
      style={{ display: "flex", flexDirection: "column", gap: 1 }}
    >
      <div
        style={{
          padding: "8px 10px 6px",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          color: CHROME.muted2,
        }}
      >
        Layers
      </div>

      {rows.map((row) => {
        const selected = row.id === selectedBuilderNodeId;
        const hovered = hoveredId === row.id;
        const actionsVisible = selected || hovered;
        const canMoveUp = row.siblingCount > 1 && row.index > 0;
        const canMoveDown =
          row.siblingCount > 1 && row.index < row.siblingCount - 1;
        return (
          <div
            key={row.id}
            role="treeitem"
            aria-level={row.depth + 1}
            aria-selected={selected}
            tabIndex={0}
            data-builder-node-id={row.id}
            data-builder-node-kind={row.kind}
            data-selected={selected ? "true" : "false"}
            onClick={() => selectBuilderNode(row.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                selectBuilderNode(row.id);
              }
            }}
            onMouseEnter={() => setHoveredId(row.id)}
            onMouseLeave={() =>
              setHoveredId((current) => (current === row.id ? null : current))
            }
            style={{
              position: "relative",
              display: "grid",
              gridTemplateColumns: "22px minmax(0, 1fr) auto",
              alignItems: "center",
              columnGap: 8,
              minHeight: 32,
              padding: "4px 8px",
              paddingLeft: ROOT_PADDING + row.depth * DEPTH_INDENT,
              borderRadius: CHROME_RADII.sm,
              background: selected
                ? "rgba(42,49,71,0.10)"
                : hovered
                  ? "rgba(42,49,71,0.045)"
                  : "transparent",
              color: selected ? CHROME.text : CHROME.muted,
              fontSize: ROW_FONT_SIZE,
              fontWeight: selected ? 600 : 500,
              cursor: "pointer",
              opacity: pending ? 0.72 : 1,
              boxShadow: selected ? `inset 3px 0 0 ${CHROME.accent}` : "none",
              transition: "background 140ms ease, box-shadow 140ms ease, color 80ms ease",
            }}
          >
            <LayerKindPill kind={row.kind} selected={selected} />
            <span
              style={{
                minWidth: 0,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                lineHeight: 1.2,
                paddingRight: actionsVisible ? 72 : 0,
              }}
            >
              {row.label}
            </span>
            <span
              aria-hidden={!actionsVisible}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                display: actionsVisible ? "inline-flex" : "none",
                position: "absolute",
                right: 6,
                top: "50%",
                transform: "translateY(-50%)",
                alignItems: "center",
                gap: 2,
                padding: "3px 4px",
                borderRadius: 9,
                border: `1px solid ${CHROME.line}`,
                background: selected ? "rgba(247,248,250,0.99)" : CHROME.paper,
                boxShadow: "0 4px 12px rgba(15,23,42,0.12)",
                pointerEvents: "auto",
                zIndex: 2,
              }}
            >
              <LayerActionButton
                label={`Move ${row.label} up`}
                disabled={!canMoveUp || pending}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleMove(row.id, "up");
                }}
                tabIndex={actionsVisible ? 0 : -1}
              >
                <ArrowUp size={ACTION_ICON_SIZE} strokeWidth={2.2} aria-hidden />
              </LayerActionButton>
              <LayerActionButton
                label={`Move ${row.label} down`}
                disabled={!canMoveDown || pending}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleMove(row.id, "down");
                }}
                tabIndex={actionsVisible ? 0 : -1}
              >
                <ArrowDown size={ACTION_ICON_SIZE} strokeWidth={2.2} aria-hidden />
              </LayerActionButton>
              <LayerActionButton
                label={`Remove ${row.label}`}
                disabled={pending}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleRemove(row.id);
                }}
                tabIndex={actionsVisible ? 0 : -1}
              >
                <X size={ACTION_ICON_SIZE} strokeWidth={2.2} aria-hidden />
              </LayerActionButton>
            </span>
          </div>
        );
      })}
    </div>
  );
}
