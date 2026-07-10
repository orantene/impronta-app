/**
 * Freeform layer-row visuals + wayfinding — the icon map (job #1) and the
 * click-to-locate flash (job #5) for FreeformLayersTree. Split out of
 * `freeform-layers-tree.tsx` to keep that file under its max-lines budget; kept
 * separate from `freeform-layer-name.ts` (which stays React/lucide-free so its
 * resolver can be unit-tested without pulling a component graph).
 */

import type { ComponentType } from "react";
import {
  Box,
  Columns2,
  CreditCard,
  Grid3x3,
  Heading,
  Image as ImageIcon,
  LayoutGrid,
  Link2,
  ListTree,
  Minus,
  MousePointerClick,
  Navigation,
  PanelsTopLeft,
  Play,
  Rows3,
  Space,
  SquareCode,
  Star,
  Table,
  Type as TypeIcon,
} from "lucide-react";

import {
  kindLabel,
  layerIconKeyForKind,
  type LayerIconKey,
  type ResponsiveOverrideSummary,
} from "./freeform-layer-name";
import { CHROME } from "./kit";
import type { BuilderNode, BuilderNodeKind } from "@/lib/site-admin/builder-node";

type LayerIconComponent = ComponentType<{ size?: number; strokeWidth?: number }>;

/**
 * Per-kind icon for the layer pill — a small lucide glyph for at-a-glance
 * scanning (job #1). Layout containers split by their layout (stack/row/grid)
 * so a column, a row, and a grid read differently; unknown keys use a box.
 */
const LAYER_ICON_BY_KEY: Record<LayerIconKey, LayerIconComponent> = {
  section: PanelsTopLeft,
  section_embed: LayoutGrid,
  container_stack: Rows3,
  container_row: Columns2,
  container_grid: Grid3x3,
  split: Columns2,
  card: CreditCard,
  cta_group: MousePointerClick,
  accordion: ListTree,
  accordion_item: Minus,
  tabs: PanelsTopLeft,
  tab_panel: PanelsTopLeft,
  carousel: LayoutGrid,
  masonry: Grid3x3,
  nav: Navigation,
  heading: Heading,
  paragraph: TypeIcon,
  rich_text: TypeIcon,
  button: MousePointerClick,
  image: ImageIcon,
  video: Play,
  embed: Link2,
  icon: Star,
  pricing_table: Table,
  code: SquareCode,
  divider: Minus,
  spacer: Space,
  generic: Box,
};

export function layerIcon(node: BuilderNode): LayerIconComponent {
  return LAYER_ICON_BY_KEY[layerIconKeyForKind(node)] ?? Box;
}

/** Kind pill — a small per-kind icon chip for at-a-glance scanning (job #1). */
export function LayerKindPill({
  kind,
  Icon,
  selected,
}: {
  kind: BuilderNodeKind;
  Icon: LayerIconComponent;
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
        flexShrink: 0,
      }}
    >
      <Icon size={13} strokeWidth={2} />
    </span>
  );
}

/**
 * Job #33 — "responsive overrides" indicator on a layer row. A small blue dot
 * signals the block behaves differently on tablet and/or mobile, so an operator
 * scanning the layers tree can see at a glance what is NOT just the desktop
 * base. The tooltip names the exact breakpoints. Inline (after the label) so it
 * rides the same row rhythm as the lock glyph; aria-label carries the meaning
 * for screen readers.
 */
export function ResponsiveOverrideDot({
  summary,
}: {
  summary: ResponsiveOverrideSummary;
}) {
  const scopes = [
    summary.tablet ? "tablet" : null,
    summary.mobile ? "mobile" : null,
  ].filter((scope): scope is string => scope !== null);
  const label = `Has ${scopes.join(" + ")} override${scopes.length > 1 ? "s" : ""}`;
  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        marginLeft: 6,
        verticalAlign: "middle",
        borderRadius: 999,
        background: CHROME.blue,
        boxShadow: "0 0 0 2px rgba(58,123,255,0.18)",
        flexShrink: 0,
      }}
    />
  );
}

// ── Click-to-locate flash (job #5) ──────────────────────────────────────────
// Clicking a layer row scrolls the matching canvas block into view and briefly
// flashes it. The flash is a short outline pulse keyed off a data-attribute the
// selection-layer's hover ring doesn't own, injected once at the tree root.
// Skipped under prefers-reduced-motion (the scroll-into-view still happens).
export const LAYERS_FLASH_KEYFRAMES_ID = "freeform-layers-flash-keyframes";
const LAYERS_FLASH_ANIM = "freeform-layers-flash";
export const LAYERS_FLASH_KEYFRAMES = `
@keyframes ${LAYERS_FLASH_ANIM} {
  0%   { box-shadow: 0 0 0 2px rgba(124,58,237,0.0), 0 0 0 6px rgba(124,58,237,0.0); }
  18%  { box-shadow: inset 0 0 0 2px rgba(124,58,237,0.9), 0 0 0 4px rgba(124,58,237,0.28); }
  100% { box-shadow: 0 0 0 2px rgba(124,58,237,0.0), 0 0 0 6px rgba(124,58,237,0.0); }
}
[data-builder-node-flash="1"] {
  animation: ${LAYERS_FLASH_ANIM} 720ms ease-out 1;
  border-radius: 6px;
}
`;

/**
 * Idempotently inject the locate/flash keyframes into <head>. FreeformLayersTree
 * renders the same `<style>` when it is mounted, but locateCanvasNode is called
 * from surfaces where that tree isn't present (add-gallery insert, mobile health
 * panel). The id guard keeps this a no-op when the style already exists.
 */
export function ensureLocateFlashKeyframes(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(LAYERS_FLASH_KEYFRAMES_ID)) return;
  const style = document.createElement("style");
  style.id = LAYERS_FLASH_KEYFRAMES_ID;
  style.textContent = LAYERS_FLASH_KEYFRAMES;
  document.head.appendChild(style);
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Scroll the canvas block for `nodeId` into view and briefly flash it. Retries
 * a few frames because a freshly-inserted node's DOM may lag the layers tree
 * (the tree reads `builderTree`; the canvas mounts via an RSC refresh). Ignores
 * the edit chrome so a layer row's own `data-builder-node-id` isn't flashed.
 */
export function locateCanvasNode(nodeId: string): void {
  if (typeof document === "undefined") return;
  let attempts = 0;
  const run = () => {
    const el =
      Array.from(
        document.querySelectorAll<HTMLElement>(
          `[data-builder-node-id="${CSS.escape(nodeId)}"]`,
        ),
      ).find(
        (candidate) =>
          !candidate.closest(
            "[data-edit-topbar], [data-edit-drawer], [data-edit-overlay]",
          ),
      ) ?? null;
    if (!el) {
      if (attempts < 8) {
        attempts += 1;
        requestAnimationFrame(run);
      }
      return;
    }
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const SAFE_TOP = 78; // clear the edit topbar
    const fullyVisible = r.top >= SAFE_TOP && r.bottom <= vh - 24;
    if (!fullyVisible) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (prefersReducedMotion()) return;
    ensureLocateFlashKeyframes();
    el.setAttribute("data-builder-node-flash", "1");
    window.setTimeout(() => {
      el.removeAttribute("data-builder-node-flash");
    }, 760);
  };
  run();
}
