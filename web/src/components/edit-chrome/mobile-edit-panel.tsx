"use client";

/**
 * MobileEditPanel — Wave 6C (job #35), the FOCUSED mobile-first editing
 * workflow. NOT a second editor: a thin HUD that surfaces the existing Wave-2
 * responsive plumbing in one place while `mobileEditMode` is on.
 *
 * Renders only when `editContext.mobileEditMode === true`. Mounting the mode
 * already (via edit-context):
 *   - pins the canvas to `device:"mobile"` through the SAME `setDevice` the
 *     topbar switcher uses, so the Wave-2B style-panel viewport sync scopes
 *     every style edit to the mobile breakpoint + shows its "Editing Mobile"
 *     banner (REUSED, not duplicated).
 *
 * This panel then adds:
 *   (b) the Wave-2C {@link MobileHealthPanel} inline (issues list with the
 *       existing `locateCanvasNode` click-to-locate), and
 *   (c) per-block mobile STRUCTURE affordances for the selected node:
 *       hide-on-mobile + reorder-on-mobile, writing the Wave-2A
 *       `style.responsive.mobile.{visibility,order}` channel through the
 *       context's surgical `setBuilderNodeMobileStructure` (preserves the
 *       tablet bucket + base style).
 *   (d) the Wave-2B "has mobile override" dot on the selected block (the layers
 *       tree keeps its own dots — unchanged).
 *
 * Positioned fixed at the lower-left, just right of the Structure navigator
 * rail (whose width is read from context), at z-84: above the navigator (z-80),
 * below the inspector dock (z-85) and right-rail drawers (z-88). The inspector
 * dock anchors right, so left-anchoring never collides with it. Everything is
 * additive + back-compat — when `mobileEditMode` is false nothing renders and
 * the editor behaves exactly as before.
 */

import { useEffect, useMemo, useState } from "react";

import { clampMobileEditPanelLeft } from "./mobile-edit-mode";
import { useMaybeEditContext } from "./edit-context";
import { useBuilderTree } from "./builder-tree-bridge";
import { useSelectedBuilderNodeId } from "./selection-bridge";
import { MobileHealthPanel } from "./MobileHealthPanel";
import { MobilePhoneMenuCard } from "./mobile-hud-cards";
import { layerIcon, LayerKindPill } from "./freeform-layer-row";
import {
  kindLabel,
  resolveLayerDisplayName,
  resolveResponsiveOverrides,
} from "@/lib/site-admin/builder-node/freeform-layer-name";
import { findBuilderNodeById } from "./inspectors/builder-node-content-utils";
import { runMobileHealthCheck } from "@/lib/site-admin/builder-node/mobile-health";
import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node";
import { CHROME } from "./kit";
import { useEditorLocale } from "./use-editor-locale";

// The navigator rail collapses to this hairline width when closed (mirrors
// navigator-panel.tsx's collapsed rail). Keep the panel clear of it.
const NAVIGATOR_COLLAPSED_RAIL_PX = 22;

// Panel geometry — width + the gap kept from the navigator rail and either
// viewport edge, so the on-screen clamp (clampMobileEditPanelLeft) can keep the
// whole HUD visible on any viewport width.
const PANEL_WIDTH = 296;
const PANEL_EDGE_INSET = 14;

// Stable empty-tree fallback so the `useMemo` deps below don't see a fresh array
// every render when no EditProvider tree is present.
const EMPTY_BUILDER_TREE: BuilderNodeTree = [];

/** Read hide/order overrides for the active device-tier HUD. */
function readDeviceStructure(
  node: BuilderNode | null,
  bucket: "mobile" | "tablet",
): {
  hidden: boolean;
  order: number | null;
} {
  if (!node) return { hidden: false, order: null };
  const style =
    "style" in node.props
      ? (node.props.style as
          | {
              responsive?: {
                mobile?: { visibility?: string; order?: number };
                tablet?: { visibility?: string; order?: number };
              };
            }
          | undefined)
      : undefined;
  const tier = style?.responsive?.[bucket];
  return {
    hidden: tier?.visibility === "hidden",
    order: typeof tier?.order === "number" ? tier.order : null,
  };
}

// ── Icons ──────────────────────────────────────────────────────────────────

function PhoneIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="5" y="2" width="14" height="20" rx="2.5" />
      <line x1="12" y1="18" x2="12" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9.88 9.88a3 3 0 0 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </svg>
  );
}

// ── Selected-block mobile structure affordances (job #35c) ──────────────────

function MobileStructureControls({
  node,
  bucket,
  onSetStructure,
}: {
  node: BuilderNode;
  bucket: "mobile" | "tablet";
  onSetStructure: (
    nodeId: string,
    patch: { visibility?: "visible" | "hidden"; order?: number | null },
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { t } = useEditorLocale();
  const [busy, setBusy] = useState(false);
  const { hidden, order } = readDeviceStructure(node, bucket);
  const overrides = resolveResponsiveOverrides(node);
  const label = resolveLayerDisplayName(node);
  const onTablet = bucket === "tablet";
  const hasBucketOverride = onTablet ? overrides.tablet : overrides.mobile;

  async function run(patch: {
    visibility?: "visible" | "hidden";
    order?: number | null;
  }) {
    if (busy) return;
    setBusy(true);
    try {
      await onSetStructure(node.id, patch);
    } finally {
      setBusy(false);
    }
  }

  // CSS `order` reorders within the parent fl/ grid container; lower paints
  // first. We nudge by 1 around 0 so an operator can pull a block ahead of (or
  // push it behind) its natural-flow siblings on mobile without touching the
  // desktop DOM order. Reset clears the mobile order back to natural flow.
  const effectiveOrder = order ?? 0;

  return (
    <div
      style={{
        borderRadius: 8,
        border: `1px solid ${CHROME.line}`,
        background: CHROME.paper,
        overflow: "hidden",
      }}
    >
      {/* Selected-block header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: `1px solid ${CHROME.line}`,
        }}
      >
        {/* Reuse the layers-tree kind pill (job #1 icon map) — keeps the icon
            rendering inside its own top-level component (no static-components
            violation) and the glyph language consistent across surfaces. */}
        <LayerKindPill
          kind={node.kind}
          Icon={layerIcon(node)}
          selected={false}
        />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span
            style={{
              display: "block",
              fontSize: 11.5,
              fontWeight: 600,
              color: CHROME.ink,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={label}
          >
            {label}
          </span>
          <span
            style={{
              display: "block",
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: CHROME.muted2,
            }}
          >
            {kindLabel(node.kind)}
          </span>
        </span>
        {/* (d) Wave-2B "has mobile override" dot — visible on the selected block. */}
        {hasBucketOverride ? (
          <span
            role="img"
            aria-label={
              onTablet
                ? t("This block has tablet-specific overrides")
                : t("This block has mobile-specific overrides")
            }
            title={
              onTablet
                ? t("This block behaves differently on tablet")
                : t("This block behaves differently on mobile")
            }
            style={{
              display: "inline-block",
              width: 7,
              height: 7,
              flexShrink: 0,
              borderRadius: 999,
              background: CHROME.blue,
              boxShadow: "0 0 0 2px rgba(58,123,255,0.18)",
            }}
          />
        ) : null}
      </div>

      {/* Hide-on-mobile toggle */}
      <button
        type="button"
        onClick={() =>
          void run({ visibility: hidden ? undefined : "hidden" })
        }
        disabled={busy}
        aria-pressed={hidden}
        title={
          hidden
            ? onTablet
              ? t("This block is hidden on tablet, show it again")
              : t("This block is hidden on mobile, show it again")
            : onTablet
              ? t("Hide this block on tablet only (desktop + phone unaffected)")
              : t("Hide this block on mobile only (desktop + tablet unaffected)")
        }
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "9px 12px",
          background: hidden ? CHROME.amberBg : "transparent",
          border: "none",
          borderBottom: `1px solid ${CHROME.line}`,
          cursor: busy ? "default" : "pointer",
          textAlign: "left",
          color: hidden ? CHROME.amber : CHROME.text,
        }}
      >
        <span style={{ display: "inline-flex", flexShrink: 0 }}>
          {hidden ? <EyeOffIcon /> : <EyeIcon />}
        </span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>
          {hidden
            ? onTablet
              ? t("Hidden on tablet")
              : t("Hidden on mobile")
            : onTablet
              ? t("Hide on tablet")
              : t("Hide on mobile")}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: hidden ? CHROME.amber : CHROME.muted2,
          }}
        >
            {hidden ? t("Tap to show") : t("Tap to hide")}
        </span>
      </button>

      {/* Reorder-on-mobile */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "9px 12px",
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 600,
              color: CHROME.text,
            }}
          >
            {onTablet ? t("Tablet order") : t("Mobile order")}
          </span>
          <span
            style={{
              display: "block",
              fontSize: 10,
              color: CHROME.muted2,
            }}
          >
            {order === null
              ? t("Natural flow")
              : t("Override: {order} (lower shows first)").replace(
                  "{order}",
                  String(order),
                )}
          </span>
        </span>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <button
            type="button"
            onClick={() => void run({ order: effectiveOrder - 1 })}
            disabled={busy}
            title={
              onTablet
                ? t("Move earlier on tablet (paint this block sooner)")
                : t("Move earlier on mobile (paint this block sooner)")
            }
            aria-label={
              onTablet
                ? t("Move earlier on tablet")
                : t("Move earlier on mobile")
            }
            style={nudgeBtnStyle(busy)}
          >
            <ArrowUpIcon />
          </button>
          <button
            type="button"
            onClick={() => void run({ order: effectiveOrder + 1 })}
            disabled={busy}
            title={
              onTablet
                ? t("Move later on tablet (paint this block after siblings)")
                : t("Move later on mobile (paint this block after siblings)")
            }
            aria-label={
              onTablet ? t("Move later on tablet") : t("Move later on mobile")
            }
            style={nudgeBtnStyle(busy)}
          >
            <ArrowDownIcon />
          </button>
          <button
            type="button"
            onClick={() => void run({ order: null })}
            disabled={busy || order === null}
            title={
              onTablet
                ? t("Reset tablet order to natural flow")
                : t("Reset mobile order to natural flow")
            }
            style={{
              height: 26,
              padding: "0 8px",
              fontSize: 10.5,
              fontWeight: 600,
              color: order === null ? CHROME.muted3 : CHROME.text2,
              background: CHROME.surface,
              border: `1px solid ${CHROME.lineMid}`,
              borderRadius: 6,
              cursor: busy || order === null ? "default" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {t("Reset")}
          </button>
        </div>
      </div>
    </div>
  );
}

function nudgeBtnStyle(busy: boolean): React.CSSProperties {
  return {
    width: 26,
    height: 26,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: CHROME.text2,
    background: CHROME.surface,
    border: `1px solid ${CHROME.lineMid}`,
    borderRadius: 6,
    cursor: busy ? "default" : "pointer",
    flexShrink: 0,
  };
}

// ── Panel ────────────────────────────────────────────────────────────────────

export function MobileEditPanel() {
  const ctx = useMaybeEditContext();

  // WS2 — tree VALUE from the micro-store (always safe to call; the store is a
  // module singleton independent of the provider). Keep the `ctx` guard so the
  // tree reads empty when this panel renders OUTSIDE an EditProvider — exactly
  // matching the prior `ctx?.builderTree ?? EMPTY_BUILDER_TREE` semantics.
  const liveBuilderTree = useBuilderTree();
  const builderTree = ctx ? liveBuilderTree : EMPTY_BUILDER_TREE;
  // W2 (selection-bridge) — selection VALUE from the micro-store (always safe to
  // call; the store is a module singleton independent of the provider).
  const selectedBuilderNodeId = useSelectedBuilderNodeId();

  const selectedNode = useMemo(
    () => findBuilderNodeById(builderTree, selectedBuilderNodeId),
    [builderTree, selectedBuilderNodeId],
  );

  // Advisory count badge in the header (the panel below shows the full list).
  const issueCount = useMemo(
    () => runMobileHealthCheck(builderTree).length,
    [builderTree],
  );

  // Track the viewport width so the fixed-position HUD can be clamped fully
  // on-screen. `null` until the first client measure (SSR-safe) — the clamp
  // falls back to the un-clamped navigator-relative offset in that window.
  const [viewportWidth, setViewportWidth] = useState<number | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setViewportWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const tabletHud = Boolean(ctx && ctx.device === "tablet" && !ctx.mobileEditMode);
  const hudOpen = Boolean(ctx && (ctx.mobileEditMode || tabletHud));
  // Mobile-first mode, or Tablet preview (structure HUD only). Never while
  // previewing — preview hides chrome.
  if (!ctx || !hudOpen || ctx.previewing) return null;
  const structureBucket: "mobile" | "tablet" = tabletHud ? "tablet" : "mobile";

  // Fixed left offset, clamped so the panel never clips off the LEFT or RIGHT
  // viewport edge (matches the other dock/floating panels' on-screen rule).
  const panelLeft = clampMobileEditPanelLeft({
    navigatorOpen: ctx.navigatorOpen,
    navigatorWidth: ctx.navigatorWidth,
    collapsedRailPx: NAVIGATOR_COLLAPSED_RAIL_PX,
    panelWidth: PANEL_WIDTH,
    viewportWidth,
    edgeInset: PANEL_EDGE_INSET,
  });
  // On a viewport narrower than the panel itself, shrink rather than overflow.
  const panelMaxWidth =
    viewportWidth != null && Number.isFinite(viewportWidth) && viewportWidth > 0
      ? Math.min(PANEL_WIDTH, viewportWidth - PANEL_EDGE_INSET * 2)
      : PANEL_WIDTH;

  const selectableNode =
    selectedNode && selectedNode.kind !== "section" ? selectedNode : null;

  return (
    <div
      data-edit-drawer
      data-mobile-edit-panel
      role="region"
      aria-label={tabletHud ? "Tablet editing" : "Mobile-first editing"}
      style={{
        position: "fixed",
        left: panelLeft,
        bottom: 18,
        zIndex: 84,
        width: PANEL_WIDTH,
        maxWidth: panelMaxWidth,
        maxHeight: "calc(100vh - 54px - 36px)",
        display: "flex",
        flexDirection: "column",
        borderRadius: 12,
        background: CHROME.surface,
        border: `1px solid ${CHROME.lineStrong}`,
        boxShadow:
          "0 24px 64px -16px rgba(0,0,0,0.28), 0 4px 12px rgba(0,0,0,0.10), 0 0 0 1px rgba(24,24,27,0.05)",
        overflow: "hidden",
      }}
    >
      {/* Header — mode identity + exit-to-desktop */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "10px 10px 10px 13px",
          background: `linear-gradient(180deg, ${CHROME.accent2} 0%, ${CHROME.accent} 100%)`,
          color: "#fff",
        }}
      >
        <span style={{ display: "inline-flex", flexShrink: 0, opacity: 0.95 }}>
          <PhoneIcon />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontSize: 12.5,
              fontWeight: 700,
              letterSpacing: "-0.01em",
            }}
          >
            {tabletHud ? "Tablet editing" : "Mobile editing"}
          </span>
          <span
            style={{
              display: "block",
              fontSize: 10,
              fontWeight: 500,
              opacity: 0.85,
            }}
          >
            {tabletHud
              ? "Hide and reorder apply to tablet"
              : "Style edits scope to mobile"}
          </span>
        </span>
        <button
          type="button"
          onClick={() => {
            if (tabletHud) ctx.setDevice("desktop");
            else ctx.setMobileEditMode(false);
          }}
          title="Exit to desktop editing"
          aria-label={
            tabletHud
              ? "Exit tablet editing, back to desktop"
              : "Exit mobile editing, back to desktop"
          }
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            height: 26,
            padding: "0 9px",
            fontSize: 11,
            fontWeight: 600,
            color: "#fff",
            background: "rgba(255,255,255,0.16)",
            border: "1px solid rgba(255,255,255,0.22)",
            borderRadius: 7,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <CloseIcon />
          Exit
        </button>
      </div>

      {/* Body — scrolls when content is tall */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: "12px",
          overflowY: "auto",
        }}
      >
        {/* (c) Per-block mobile structure — hide + reorder on the selection. */}
        {selectableNode ? (
          <MobileStructureControls
            node={selectableNode}
            bucket={structureBucket}
            onSetStructure={(nodeId, patch) =>
              ctx.setBuilderNodeMobileStructure(nodeId, patch, structureBucket)
            }
          />
        ) : (
          <div
            style={{
              borderRadius: 8,
              border: `1px dashed ${CHROME.lineStrong}`,
              background: CHROME.paper,
              padding: "12px 13px",
              fontSize: 11.5,
              lineHeight: 1.5,
              color: CHROME.muted,
            }}
          >
            <span style={{ fontWeight: 600, color: CHROME.text }}>
              Select a block
            </span>{" "}
            on the canvas to hide it on {tabletHud ? "tablet" : "mobile"} or
            change its {tabletHud ? "tablet" : "mobile"} order. Style edits
            already apply to this breakpoint.
          </div>
        )}

        {/* Phone menu — the one part of the header that cannot be seen while
            it is being edited, because it only exists once a pointer opens a
            disclosure and the canvas has none. */}
        {tabletHud ? null : <MobilePhoneMenuCard builderTree={builderTree} />}

        {/* (b) Wave-2C mobile-health checker — mobile mode only. */}
        {tabletHud ? null : (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 6,
              paddingLeft: 2,
            }}
          >
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: CHROME.muted2,
              }}
            >
              Mobile checks
            </span>
            {issueCount > 0 ? (
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  color: CHROME.amber,
                  background: CHROME.amberBg,
                  border: `1px solid ${CHROME.amberLine}`,
                  borderRadius: 999,
                  padding: "1px 6px",
                }}
              >
                {issueCount}
              </span>
            ) : null}
          </div>
          {/* REUSE: the exact Wave-2C panel + its locateCanvasNode click-to-locate. */}
          <MobileHealthPanel builderTree={builderTree} />
        </div>
        )}
      </div>
    </div>
  );
}
