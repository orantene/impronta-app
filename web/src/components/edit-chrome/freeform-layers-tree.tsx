"use client";

/**
 * FreeformLayersTree — left-rail layer list for FREEFORM full-page designs.
 *
 * The Structure Navigator lists curated *sections* from composition slots; a
 * freeform one-click design has NO slots, just a non-empty `builderTree` of
 * containers + blocks the section list can't show. This SEPARATE component (it
 * does not touch the section/slot/FlatRow paths) renders that tree as a flat,
 * indented Figma/Webflow-style layer list keyed off the SAME BuilderNode
 * identity the canvas + inspector use, so selecting a row highlights the block
 * everywhere. Wires `builderTree` / `selectBuilderNode` / `selectedBuilderNodeId`
 * / `moveBuilderNodeWithinParent` / `removeBuilderNode` from `useEditContext`;
 * styling reuses CHROME tokens to match the navigator rows.
 */

import {
  useCallback,
  useMemo,
  useState,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";

import { CHROME, CHROME_RADII } from "./kit";
import { useEditContext } from "./edit-context";
import { FreeformInsertPopover } from "./freeform-insert-popover";
import {
  BUILDER_NODE_REGISTRY,
  gateNestedInsertKinds,
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
  /** Registry-allowed child kinds (pre-gate); non-empty drives per-row "add child". */
  rawChildKinds: ReadonlyArray<BuilderNodeKind>;
}

/** Registry-policy child kinds for a kind (raw allow-list; `[]` for leaves). */
function rawChildKindsForKind(kind: BuilderNodeKind): ReadonlyArray<BuilderNodeKind> {
  const policy = BUILDER_NODE_REGISTRY[kind].children;
  return policy.type === "allow_list" ? policy.kinds : [];
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

interface FlattenedTree {
  rows: LayerRow[];
  /** Header "+ Add block" target: hoisted wrapper, else first container anywhere, else `null` (append to tree root). */
  rootContainerId: string | null;
  /** Raw allowed-child kinds of the resolved root container — gated-non-empty drives the header pill (so it shows even when the root is hoisted). */
  rootContainerKinds: ReadonlyArray<BuilderNodeKind>;
}

/** Depth-first: the first `container` node anywhere in the tree, else `null`. */
function findFirstContainer(nodes: ReadonlyArray<BuilderNode>): BuilderNode | null {
  for (const node of nodes) {
    if (node.kind === "container") return node;
    if ("children" in node && Array.isArray(node.children) && node.children.length > 0) {
      const nested = findFirstContainer(node.children);
      if (nested) return nested;
    }
  }
  return null;
}

/**
 * Flatten the tree to indented rows in document order. When the single root is a
 * layout wrapper container, its children start at depth 0 (not nested under it).
 */
function flattenTree(tree: BuilderNodeTree): FlattenedTree {
  const rows: LayerRow[] = [];

  const walk = (nodes: ReadonlyArray<BuilderNode>, depth: number): void => {
    nodes.forEach((node, index) => {
      rows.push({
        id: node.id,
        kind: node.kind,
        label: rowLabel(node),
        depth,
        index,
        siblingCount: nodes.length,
        rawChildKinds: rawChildKindsForKind(node.kind),
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
    // The hoisted wrapper has NO row of its own, so the header must target it by
    // id + its real child kinds — else the kind-gated pill never renders.
    walk(onlyRoot.children, 0);
    return {
      rows,
      rootContainerId: onlyRoot.id,
      rootContainerKinds: rawChildKindsForKind(onlyRoot.kind),
    };
  }

  walk(tree, 0);
  // No hoisted wrapper: target the first container ANYWHERE (a page may nest its
  // only container under a section). With none, target tree root (`null`) + the
  // container catalog so the operator can still seed a first block.
  const firstContainer = findFirstContainer(tree);
  return {
    rows,
    rootContainerId: firstContainer?.id ?? null,
    rootContainerKinds: firstContainer
      ? rawChildKindsForKind(firstContainer.kind)
      : rawChildKindsForKind("container"),
  };
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

/** Active insert target — the container a freshly picked block lands inside. */
interface InsertTarget {
  /** Stable key so a second click on the same trigger toggles the popover shut. */
  key: string;
  /** Parent container the node is appended to (last child). */
  parentId: string | null;
  /** Plan/owner-gated kinds the picker may offer for this target. */
  allowedKinds: ReadonlyArray<BuilderNodeKind>;
  /** Human label for the popover header. */
  label: string;
}

export function FreeformLayersTree() {
  const {
    builderTree,
    selectedBuilderNodeId,
    selectBuilderNode,
    moveBuilderNodeWithinParent,
    removeBuilderNode,
    insertBuilderNode,
    insertBuilderSectionEmbed,
    advancedElementLibraryEnabled,
    canInsertRawHtmlElements,
  } = useEditContext();

  const { rows, rootContainerId, rootContainerKinds } = useMemo(
    () => flattenTree(builderTree),
    [builderTree],
  );

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [insertTarget, setInsertTarget] = useState<InsertTarget | null>(null);

  /** Plan + owner gate over a kind's raw registry allow-list (mirrors navigator). */
  const gateChildKinds = useCallback(
    (kinds: ReadonlyArray<BuilderNodeKind>): BuilderNodeKind[] =>
      gateNestedInsertKinds(
        kinds,
        advancedElementLibraryEnabled,
        canInsertRawHtmlElements,
      ),
    [advancedElementLibraryEnabled, canInsertRawHtmlElements],
  );

  // Header "+ Add block" targets the selected container row when one is selected,
  // else the resolved root container. Tracks selection off the live rows.
  const selectedContainerRow = useMemo(
    () =>
      rows.find((row) => row.id === selectedBuilderNodeId && row.rawChildKinds.length > 0) ??
      null,
    [rows, selectedBuilderNodeId],
  );
  const headerTargetId = selectedContainerRow?.id ?? rootContainerId;
  // Gate the ACTUAL header target's kinds: the selected container row, else the
  // resolved root container (hoisted wrapper has no row → kinds via
  // `rootContainerKinds`), so the pill renders even when the root is hoisted.
  const headerTargetKinds = useMemo(
    () =>
      gateChildKinds(
        selectedContainerRow ? selectedContainerRow.rawChildKinds : rootContainerKinds,
      ),
    [gateChildKinds, selectedContainerRow, rootContainerKinds],
  );
  const headerLabel = selectedContainerRow ? selectedContainerRow.label : "Page";
  // Hide the header add only when the gate empties the kinds (Advanced off).
  const headerAddEnabled = headerTargetKinds.length > 0;

  const toggleInsertTarget = useCallback((target: InsertTarget) => {
    setInsertTarget((prev) => (prev?.key === target.key ? null : target));
  }, []);

  // Shared insert scaffold (pending guard → run → select the new node). Both the
  // generic-kind insert and the Tulala-component (section_embed) insert funnel
  // through it so the popovers stay in sync.
  const runInsert = useCallback(
    async (
      insert: () => Promise<{ ok: boolean; error?: string; nodeId?: string }>,
    ) => {
      if (pending) return;
      setInsertTarget(null);
      setPending(true);
      try {
        const result = await insert();
        if (result.ok && result.nodeId) selectBuilderNode(result.nodeId);
      } finally {
        setPending(false);
      }
    },
    [pending, selectBuilderNode],
  );

  const handleInsert = useCallback(
    (parentId: string | null, kind: BuilderNodeKind) =>
      runInsert(() => insertBuilderNode(parentId, kind)),
    [insertBuilderNode, runInsert],
  );

  const handleInsertSectionEmbed = useCallback(
    (parentId: string | null, sectionTypeKey: string) =>
      runInsert(() => insertBuilderSectionEmbed(parentId, sectionTypeKey)),
    [insertBuilderSectionEmbed, runInsert],
  );

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
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "8px 8px 6px 10px",
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: CHROME.muted2,
          }}
        >
          Layers
        </span>
        {headerAddEnabled ? (
          <HeaderAddButton
            label={
              selectedContainerRow
                ? `Add block inside ${headerLabel}`
                : "Add block to page"
            }
            active={insertTarget?.key === "header"}
            disabled={pending}
            onClick={(e) => {
              e.stopPropagation();
              toggleInsertTarget({
                key: "header",
                parentId: headerTargetId,
                allowedKinds: headerTargetKinds,
                label: headerLabel,
              });
            }}
          />
        ) : null}
      </div>

      {insertTarget?.key === "header" ? (
        <FreeformInsertPopover
          target={insertTarget}
          onPick={(kind) => void handleInsert(insertTarget.parentId, kind)}
          onPickSectionEmbed={(sectionTypeKey) =>
            void handleInsertSectionEmbed(insertTarget.parentId, sectionTypeKey)
          }
          onDismiss={() => setInsertTarget(null)}
        />
      ) : null}

      {rows.map((row) => {
        const selected = row.id === selectedBuilderNodeId;
        const hovered = hoveredId === row.id;
        const insertOpenHere = insertTarget?.key === `row:${row.id}`;
        const actionsVisible = selected || hovered || insertOpenHere;
        const canMoveUp = row.siblingCount > 1 && row.index > 0;
        const canMoveDown =
          row.siblingCount > 1 && row.index < row.siblingCount - 1;
        // Per-container "add child" affordance: gate the kind's registry
        // allow-list. Empty for leaf kinds (no button) or when Advanced
        // composition is off.
        const rowChildKinds = gateChildKinds(row.rawChildKinds);
        const canAddChild = rowChildKinds.length > 0;
        // 3 base actions ≈ 72px; the add button adds ~24px more.
        const actionsReserve = canAddChild ? 96 : 72;
        return (
          <div key={row.id}>
          <div
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
                paddingRight: actionsVisible ? actionsReserve : 0,
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
              {canAddChild ? (
                <LayerActionButton
                  label={`Add block inside ${row.label}`}
                  disabled={pending}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectBuilderNode(row.id);
                    toggleInsertTarget({
                      key: `row:${row.id}`,
                      parentId: row.id,
                      allowedKinds: rowChildKinds,
                      label: row.label,
                    });
                  }}
                  tabIndex={actionsVisible ? 0 : -1}
                >
                  <Plus size={ACTION_ICON_SIZE} strokeWidth={2.2} aria-hidden />
                </LayerActionButton>
              ) : null}
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
          {insertOpenHere && insertTarget ? (
            <FreeformInsertPopover
              target={insertTarget}
              indent={ROOT_PADDING + row.depth * DEPTH_INDENT}
              onPick={(kind) => void handleInsert(insertTarget.parentId, kind)}
              onPickSectionEmbed={(sectionTypeKey) =>
                void handleInsertSectionEmbed(insertTarget.parentId, sectionTypeKey)
              }
              onDismiss={() => setInsertTarget(null)}
            />
          ) : null}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The discoverable header control — a labelled "Add block" pill (icon + text,
 * not a bare glyph) so the affordance reads as the primary way to add content on
 * a freeform page. Indigo-tinted, matching the Navigator's accent family.
 */
function HeaderAddButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
}) {
  const [hover, setHover] = useState(false);
  const lit = !disabled && (hover || active);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-expanded={active}
      disabled={disabled}
      data-freeform-add-block=""
      onPointerDown={(event) => event.stopPropagation()}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        height: 24,
        padding: "0 9px 0 7px",
        borderRadius: 999,
        border: `1px solid ${lit ? "rgba(61,79,124,0.45)" : "rgba(61,79,124,0.28)"}`,
        background: disabled
          ? "transparent"
          : lit
            ? "rgba(61,79,124,0.14)"
            : "rgba(61,79,124,0.07)",
        color: disabled ? CHROME.muted2 : CHROME.accent,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.01em",
        cursor: disabled ? "default" : "pointer",
        transition: "background 110ms ease, border-color 110ms ease",
        flexShrink: 0,
      }}
    >
      <Plus size={13} strokeWidth={2.4} aria-hidden />
      Add block
    </button>
  );
}

