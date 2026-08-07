/* eslint-disable max-lines -- canvas text toolbar: single cohesive floating bar with format controls. */
"use client";

/**
 * CanvasTextToolbar — single-row white floating bar for text layer quick edits.
 * Docked to the bottom-center of the viewport (decoupled from the selected
 * element) so formatting controls stay in a stable, reachable spot while editing.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ALargeSmall,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronDown,
  ChevronUp,
  Copy,
  FolderTree,
  GripVertical,
  Link2,
  MoreHorizontal,
  MoveHorizontal,
  SlidersHorizontal,
  Sparkles,
  Type,
} from "lucide-react";

import {
  blockPositionFromStyle,
  blockPositionStylePatch,
  clearBlockPositionPatch,
  type BlockPosition,
} from "./canvas-block-position";

import { BUILDER_VISUAL } from "./inspectors/kit/tokens";
import type { ViewportDevice } from "./inspectors/responsive-field-state";
import {
  baseBreakpointId,
  editableOverrideTierIds,
  isBaseBreakpoint,
} from "./breakpoint-registry";
import { useActiveCanvasTextFormatting } from "./use-canvas-text-formatting";
import {
  requestCanvasToolbarColor,
  requestCanvasToolbarLink,
} from "./canvas-lexical-bridge";
import { findBuilderNodeElement } from "./canvas-text-style-preview";
import { ColorPickerPopover } from "./kit/color-picker";
import {
  CANVAS_FLOATING_BAR,
  CHROME,
  CHROME_RADII,
  DRAWER_WIDTHS,
  INSPECTOR_PANEL_RIGHT_INSET_PX,
  INSPECTOR_RAIL_RIGHT_PX,
  INSPECTOR_RAIL_WIDTH_PX,
  Z_INDEX,
} from "./kit/tokens";
import { resolveLayerDisplayName } from "@/lib/site-admin/builder-node/freeform-layer-name";
import type { BuilderNode } from "@/lib/site-admin/builder-node";
import {
  BUILDER_TEXT_ROLE_OPTIONS,
  builderTextRoleSupported,
  readThemeTypographySize,
  resolveBuilderTextRoleFromNode,
  type BuilderTextRoleId,
} from "@/lib/site-admin/builder-node/text-role";
import { useEditContext } from "./edit-context";
import { useEditorLocale } from "./use-editor-locale";

export type CanvasTextKind = "heading" | "paragraph" | "rich_text" | "button";

export function isCanvasTextToolbarKind(
  node: BuilderNode,
): node is Extract<BuilderNode, { kind: CanvasTextKind }> {
  return (
    node.kind === "heading" ||
    node.kind === "paragraph" ||
    node.kind === "rich_text" ||
    node.kind === "button"
  );
}

export interface CanvasTextToolbarProps {
  node: Extract<BuilderNode, { kind: CanvasTextKind }>;
  rect: Pick<DOMRect, "top" | "left" | "width" | "height" | "bottom">;
  disabled?: boolean;
  onOpenInspector?: () => void;
  onDuplicate?: () => void;
  onRemove?: () => void;
  onToggleLock?: () => void;
  locked?: boolean;
  onPatchStyle?: (patch: Record<string, unknown>) => void;
  onRequestInlineEdit?: () => void;
  /** Opens the "revise this element with AI" modal for the selected text node. */
  onReviseWithAi?: () => void;
  /**
   * Nested-blocks panel visibility. Selecting text swaps the selection chip for
   * THIS bar, and the chip owned the only toggle — so on a text block the panel
   * could be closed and never reopened. Mirrored here so both surfaces expose
   * the same control.
   */
  nestedOpen?: boolean;
  /** Null when the selection has no sibling/child list to show. */
  onToggleNested?: (() => void) | null;
  /** Bump when canvas scroll/zoom changes so fixed position recomputes. */
  repositionKey?: number;
  onCopyStyle?: () => void;
  onPasteStyle?: () => void;
  onResetStyle?: () => void;
  onHideOnDevice?: () => void;
  canPasteStyle?: boolean;
  isBold?: boolean;
  isItalic?: boolean;
  onToggleBold?: () => void;
  onToggleItalic?: () => void;
  onChangeTextRole?: (role: BuilderTextRoleId) => void;
}

const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 240;

function normalizeFontSizePx(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  const str = String(value).trim().replace(/px$/i, "");
  return str.length > 0 ? str : null;
}

function resolveStyleField(
  style: Record<string, unknown>,
  device: ViewportDevice,
  field: string,
): unknown {
  if (!isBaseBreakpoint(device)) {
    const responsive = style.responsive as
      | Record<string, Record<string, unknown>>
      | undefined;
    const override = responsive?.[device]?.[field];
    if (override !== undefined && override !== null && override !== "") {
      return override;
    }
  }
  return style[field];
}

const FONT_FAMILIES = [
  { value: "", label: "Theme default" },
  { value: "Inter, sans-serif", label: "Inter" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "Playfair Display, serif", label: "Playfair" },
  { value: "DM Sans, sans-serif", label: "DM Sans" },
];

const TOOLBAR_MAX_WIDTH = 720;
/** Shared with the zoom bar so the two floating bars sit on one line. */
const TOOLBAR_HEIGHT = CANVAS_FLOATING_BAR.height;
/** Distance from the viewport bottom edge. */
const TOOLBAR_BOTTOM_GUTTER = CANVAS_FLOATING_BAR.bottom;
/** Keep the bar inside the viewport — flush to the right edge when needed. */
const VIEWPORT_EDGE_GUTTER = 8;
const VIEWPORT_LEFT_GUTTER = 8;

function inspectorRightReservePx(inspectorDockOpen: boolean): number {
  const railReserve = INSPECTOR_RAIL_RIGHT_PX + INSPECTOR_RAIL_WIDTH_PX + VIEWPORT_EDGE_GUTTER;
  if (!inspectorDockOpen) return railReserve;
  return (
    INSPECTOR_PANEL_RIGHT_INSET_PX +
    DRAWER_WIDTHS.dock +
    VIEWPORT_EDGE_GUTTER
  );
}

function computeToolbarPosition(
  measuredWidth: number | null,
  rightReservePx: number,
): { left: number } {
  const viewportWidth =
    typeof window !== "undefined" ? window.innerWidth : TOOLBAR_MAX_WIDTH;
  const widthEstimate =
    measuredWidth ?? Math.min(viewportWidth * 0.96, TOOLBAR_MAX_WIDTH);
  // The zoom bar shares this baseline, so the left clamp must clear it rather
  // than pinning to the viewport edge — otherwise a narrow window slides this
  // toolbar underneath it. Only clamp when the toolbar would actually reach
  // that far, so wide viewports keep a true centre.
  const leftLimit = Math.max(
    VIEWPORT_LEFT_GUTTER,
    CANVAS_FLOATING_BAR.leftReserve,
  );
  const availableWidth =
    viewportWidth - VIEWPORT_LEFT_GUTTER - rightReservePx;
  const centeredLeft =
    VIEWPORT_LEFT_GUTTER + (availableWidth - widthEstimate) / 2;
  const maxLeft = viewportWidth - rightReservePx - widthEstimate;
  return {
    left: Math.max(leftLimit, Math.min(centeredLeft, maxLeft)),
  };
}

function Divider() {
  return (
    <span
      aria-hidden
      style={{
        width: 1,
        alignSelf: "stretch",
        margin: "6px 2px",
        background: CHROME.line,
      }}
    />
  );
}

function ToolbarBtn({
  children,
  active,
  title,
  onClick,
  disabled,
  buttonRef,
}: {
  children: ReactNode;
  active?: boolean;
  title: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="inline-flex cursor-pointer items-center justify-center border-none transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        minWidth: 28,
        height: 28,
        borderRadius: 8,
        background: active ? BUILDER_VISUAL.accentBg : "transparent",
        color: active ? CHROME.accent : CHROME.muted,
        padding: "0 6px",
        fontSize: 12,
        fontWeight: active ? 700 : 600,
      }}
    >
      {children}
    </button>
  );
}

function preventToolbarBlur(e: React.MouseEvent) {
  const t = e.target as HTMLElement;
  if (t.closest("[data-allow-focus]")) return;
  e.preventDefault();
}

function FontSizeStepper({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const { t } = useEditorLocale();
  const numeric = Number(value);
  const isNumeric = Number.isFinite(numeric);

  const step = (delta: number) => {
    const base = isNumeric ? numeric : 16;
    const next = Math.min(
      FONT_SIZE_MAX,
      Math.max(FONT_SIZE_MIN, Math.round(base + delta)),
    );
    onChange(String(next));
  };

  const stepBtnStyle: React.CSSProperties = {
    display: "inline-flex",
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "transparent",
    color: CHROME.muted,
    cursor: disabled ? "not-allowed" : "pointer",
    padding: 0,
    minHeight: 0,
  };

  return (
    <div
      data-allow-focus
      title={t("Font size: {value}px").replace("{value}", value)}
      style={{
        display: "inline-flex",
        alignItems: "stretch",
        flexShrink: 0,
        height: 28,
        borderRadius: 8,
        border: `1px solid ${CHROME.line}`,
        background: CHROME.surface2,
        overflow: "hidden",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <input
        type="text"
        inputMode="numeric"
        value={value}
        disabled={disabled}
        aria-label={t("Font size")}
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (raw === "") return;
          const n = Number(raw);
          if (Number.isFinite(n)) {
            onChange(
              String(
                Math.min(
                  FONT_SIZE_MAX,
                  Math.max(FONT_SIZE_MIN, Math.round(n)),
                ),
              ),
            );
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            step(1);
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            step(-1);
          }
        }}
        className="min-w-0"
        style={{
          width: 36,
          border: "none",
          background: "transparent",
          textAlign: "center",
          fontSize: 12,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          outline: "none",
          color: CHROME.ink,
          padding: 0,
        }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: 18,
          borderLeft: `1px solid ${CHROME.line}`,
        }}
      >
        <button
          type="button"
          aria-label={t("Increase font size")}
          disabled={disabled || (isNumeric && numeric >= FONT_SIZE_MAX)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => step(1)}
          style={stepBtnStyle}
        >
          <ChevronUp size={11} strokeWidth={2.5} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={t("Decrease font size")}
          disabled={disabled || (isNumeric && numeric <= FONT_SIZE_MIN)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => step(-1)}
          style={stepBtnStyle}
        >
          <ChevronDown size={11} strokeWidth={2.5} aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function CanvasTextToolbar({
  node,
  rect: _selectionRect,
  disabled = false,
  onOpenInspector,
  onDuplicate,
  onRemove,
  onToggleLock,
  locked = false,
  onPatchStyle,
  onRequestInlineEdit,
  onReviseWithAi,
  nestedOpen,
  onToggleNested,
  repositionKey = 0,
  onCopyStyle,
  onPasteStyle,
  onResetStyle,
  onHideOnDevice,
  canPasteStyle = false,
  isBold = false,
  isItalic = false,
  onToggleBold,
  onToggleItalic,
  onChangeTextRole,
}: CanvasTextToolbarProps) {
  const { t } = useEditorLocale();
  const { inspectorDockOpen, device } = useEditContext();
  // Resolve to the active editable tier when the canvas is on a render-backed
  // override tier; otherwise fall back to the base tier (RESP-1 registry-driven).
  // Memoized so the registry lookups stay referentially stable per device.
  const viewportDevice = useMemo<ViewportDevice>(
    () =>
      editableOverrideTierIds().includes(device) ? device : baseBreakpointId(),
    [device],
  );
  const rightReservePx = inspectorRightReservePx(inspectorDockOpen);
  const lexical = useActiveCanvasTextFormatting(true);
  const editingActive = lexical.editor !== null;
  const resolvedBold = editingActive ? lexical.state.isBold : isBold;
  const resolvedItalic = editingActive ? lexical.state.isItalic : isItalic;
  const resolvedToggleBold = onToggleBold ?? lexical.toggleBold;
  const resolvedToggleItalic = onToggleItalic ?? lexical.toggleItalic;
  const [moreOpen, setMoreOpen] = useState(false);
  const [textStyleOpen, setTextStyleOpen] = useState(false);
  const [fontFamilyOpen, setFontFamilyOpen] = useState(false);
  const [nodeColorOpen, setNodeColorOpen] = useState(false);
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);
  const [blockPositionOpen, setBlockPositionOpen] = useState(false);
  const [styleOverride, setStyleOverride] = useState<Record<string, unknown>>({});
  const colorBtnRef = useRef<HTMLButtonElement | null>(null);
  const label = resolveLayerDisplayName(node);
  useEffect(() => {
    setStyleOverride({});
    setBlockPositionOpen(false);
    setFontFamilyOpen(false);
    setTextStyleOpen(false);
  }, [node.id]);
  const supportsTextRole = builderTextRoleSupported(node);
  const activeTextRole = supportsTextRole
    ? resolveBuilderTextRoleFromNode(node)
    : null;
  const activeTextRoleLabel =
    BUILDER_TEXT_ROLE_OPTIONS.find((opt) => opt.id === activeTextRole)
      ?.shortLabel ?? t("Text");
  const style = {
    ...((node.props.style ?? {}) as Record<string, unknown>),
    ...styleOverride,
  };
  const [computedFontSizePx, setComputedFontSizePx] = useState<string | null>(
    null,
  );
  const storedFontSizePx = normalizeFontSizePx(
    resolveStyleField(style, viewportDevice, "fontSize"),
  );
  const displayFontSize = storedFontSizePx ?? computedFontSizePx ?? "16";
  const usesThemeFontSize = !storedFontSizePx;
  const fontSizeTitle =
    usesThemeFontSize && activeTextRole
      ? t("Theme size: {size}. Adjust to override.").replace(
          "{size}",
          readThemeTypographySize(activeTextRole),
        )
      : t("Custom font size on this block");
  const fontFamily = (style.fontFamily as string | undefined) ?? "";
  const selectedFontLabel =
    FONT_FAMILIES.find((f) => f.value === fontFamily)?.label ??
    FONT_FAMILIES[0]!.label;
  const fontWeight = style.fontWeight;
  const fontStyle = style.fontStyle as string | undefined;
  const boldActive = editingActive ? resolvedBold : fontWeight === 700 || fontWeight === "700";
  const italicActive = editingActive ? resolvedItalic : fontStyle === "italic";
  const align = (style.align as string | undefined) ?? "left";
  const blockPosition = blockPositionFromStyle(style);
  const textColor = (style.textColor as string | undefined) ?? CHROME.ink;
  const showLink = node.kind !== "button";
  const showJustify = node.kind === "paragraph";

  useLayoutEffect(() => {
    const el = findBuilderNodeElement(node.id);
    if (!el) {
      setComputedFontSizePx(null);
      return;
    }
    setComputedFontSizePx(
      getComputedStyle(el).fontSize.replace(/px$/i, "").trim(),
    );
  }, [node.id, repositionKey, storedFontSizePx, viewportDevice, styleOverride]);

  const barRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(() =>
    computeToolbarPosition(null, rightReservePx),
  );

  useLayoutEffect(() => {
    function place() {
      const measured = barRef.current?.offsetWidth ?? null;
      setPosition(computeToolbarPosition(measured, rightReservePx));
    }
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [
    repositionKey,
    label,
    showJustify,
    showLink,
    moreOpen,
    blockPositionOpen,
    fontFamilyOpen,
    textStyleOpen,
    displayFontSize,
    rightReservePx,
  ]);

  useEffect(() => {
    if (!moreOpen && !blockPositionOpen && !fontFamilyOpen && !textStyleOpen) {
      return;
    }
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("[data-canvas-text-toolbar]")) return;
      setMoreOpen(false);
      setBlockPositionOpen(false);
      setFontFamilyOpen(false);
      setTextStyleOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [moreOpen, blockPositionOpen, fontFamilyOpen, textStyleOpen]);

  const patchAlign = useCallback(
    (next: string) => {
      setStyleOverride((prev) => ({ ...prev, align: next }));
      onPatchStyle?.({ align: next });
    },
    [onPatchStyle],
  );

  const patchFontSize = useCallback(
    (next: string) => {
      const fontSize = next.includes("px") ? next : `${next}px`;
      setStyleOverride((prev) => ({ ...prev, fontSize }));
      onPatchStyle?.({ fontSize });
    },
    [onPatchStyle],
  );

  const applyStylePatch = useCallback(
    (patch: Record<string, unknown>) => {
      setStyleOverride((prev) => ({ ...prev, ...patch }));
      onPatchStyle?.(patch);
    },
    [onPatchStyle],
  );

  const patchBlockPosition = useCallback(
    (next: BlockPosition) => {
      if (blockPosition === next) {
        applyStylePatch(clearBlockPositionPatch());
        return;
      }
      applyStylePatch(blockPositionStylePatch(next));
    },
    [applyStylePatch, blockPosition],
  );

  const handleColorClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (editingActive) {
        requestCanvasToolbarColor(e.currentTarget);
        return;
      }
      setNodeColorOpen((open) => {
        const next = !open;
        setColorAnchor(next ? e.currentTarget : null);
        return next;
      });
    },
    [editingActive],
  );

  const handleLinkClick = useCallback(() => {
    if (editingActive) {
      requestCanvasToolbarLink();
      return;
    }
    onRequestInlineEdit?.();
  }, [editingActive, onRequestInlineEdit]);

  const bar = (
    <div
      ref={barRef}
      data-canvas-text-toolbar=""
      role="toolbar"
      aria-label={t("{label} text toolbar").replace("{label}", label)}
      onMouseDown={preventToolbarBlur}
      style={{
        position: "fixed",
        bottom: TOOLBAR_BOTTOM_GUTTER,
        left: position.left,
        zIndex: Z_INDEX.floatingControls,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: TOOLBAR_HEIGHT,
        padding: "0 8px 0 6px",
        background: CHROME.surface,
        borderRadius: CHROME_RADII.lg ?? BUILDER_VISUAL.toolbarRadius,
        boxShadow: BUILDER_VISUAL.toolbarShadow,
        border: `1px solid ${BUILDER_VISUAL.panelBorder}`,
        pointerEvents: "auto",
        maxWidth: `min(96vw, ${TOOLBAR_MAX_WIDTH}px)`,
        overflow: "visible",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "0 4px 0 2px",
          flexShrink: 0,
        }}
      >
        <GripVertical size={14} strokeWidth={2} aria-hidden style={{ color: CHROME.muted3 }} />
        <button
          type="button"
          onClick={onOpenInspector}
          title={label}
          aria-label={t("{label}, open in inspector").replace("{label}", label)}
          className="inline-flex cursor-pointer items-center justify-center border-none bg-transparent p-0"
          onMouseDown={(e) => e.preventDefault()}
        >
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: 8,
              background: BUILDER_VISUAL.accentBg,
              color: CHROME.accent,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Type size={13} strokeWidth={2.25} aria-hidden />
          </span>
        </button>
        {onReviseWithAi ? (
          <button
            type="button"
            title={t("Revise with AI")}
            aria-label={t("Revise this block with AI")}
            data-canvas-text-action="ai"
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              onReviseWithAi();
            }}
            className="inline-flex cursor-pointer items-center justify-center border-none bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: 8,
                background: "rgba(124, 58, 237, 0.1)",
                color: "#7c3aed",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Sparkles size={13} strokeWidth={2.25} aria-hidden />
            </span>
          </button>
        ) : null}
      </span>

      <Divider />

      {supportsTextRole && onChangeTextRole ? (
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            type="button"
            title={t("Text style")}
            aria-label={t("Text style")}
            aria-haspopup="menu"
            aria-expanded={textStyleOpen}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              setTextStyleOpen((open) => !open);
              setMoreOpen(false);
              setBlockPositionOpen(false);
              setFontFamilyOpen(false);
            }}
            className="inline-flex cursor-pointer items-center gap-1 border-none bg-transparent px-1 disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              height: 28,
              borderRadius: 8,
              color: textStyleOpen ? CHROME.accent : CHROME.ink,
              background: textStyleOpen ? BUILDER_VISUAL.accentBg : "transparent",
              fontSize: 12,
              fontWeight: 700,
              minWidth: 44,
              justifyContent: "center",
            }}
          >
            {activeTextRoleLabel}
            <ChevronDown size={11} strokeWidth={2.5} aria-hidden />
          </button>
          {textStyleOpen ? (
            <div
              role="menu"
              aria-label={t("Text style")}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                left: 0,
                bottom: "calc(100% + 6px)",
                minWidth: 156,
                background: CHROME.surface,
                border: `1px solid ${CHROME.line}`,
                borderRadius: 10,
                boxShadow: BUILDER_VISUAL.toolbarShadow,
                padding: 4,
                zIndex: Z_INDEX.toast,
              }}
            >
              {BUILDER_TEXT_ROLE_OPTIONS.map((option) => {
                const selected = option.id === activeTextRole;
                const themeSize = readThemeTypographySize(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    disabled={disabled}
                    onClick={() => {
                      onChangeTextRole(option.id);
                      setTextStyleOpen(false);
                    }}
                    className="flex w-full cursor-pointer items-center justify-between gap-3 border-none bg-transparent px-3 py-2 text-left text-[12px] font-medium"
                    style={{
                      color: selected ? CHROME.accent : CHROME.ink,
                      background: selected ? BUILDER_VISUAL.accentBg : "transparent",
                      borderRadius: 6,
                    }}
                  >
                    <span>{t(option.label)}</span>
                    <span
                      style={{
                        fontSize: 10,
                        color: CHROME.muted,
                        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                      }}
                    >
                      {themeSize}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ position: "relative", flexShrink: 0 }}>
        <ToolbarBtn
          title={t("Font: {font}").replace("{font}", t(selectedFontLabel))}
          active={fontFamilyOpen}
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            setFontFamilyOpen((open) => !open);
            setMoreOpen(false);
            setBlockPositionOpen(false);
          }}
        >
          <ALargeSmall size={15} strokeWidth={2} aria-hidden />
        </ToolbarBtn>
        {fontFamilyOpen ? (
          <div
            role="menu"
            aria-label={t("Font family")}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              left: 0,
              bottom: "calc(100% + 6px)",
              minWidth: 168,
              background: CHROME.surface,
              border: `1px solid ${CHROME.line}`,
              borderRadius: 10,
              boxShadow: BUILDER_VISUAL.toolbarShadow,
              padding: 4,
              zIndex: Z_INDEX.toast,
            }}
          >
            {FONT_FAMILIES.map((family) => {
              const selected =
                (FONT_FAMILIES.some((f) => f.value === fontFamily)
                  ? fontFamily
                  : "") === family.value;
              return (
                <button
                  key={family.label}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  disabled={disabled}
                  onClick={() => {
                    applyStylePatch({
                      fontFamily: family.value || undefined,
                    });
                    setFontFamilyOpen(false);
                  }}
                  className="block w-full cursor-pointer border-none bg-transparent px-3 py-2 text-left text-[12px] font-medium"
                  style={{
                    color: selected ? CHROME.accent : CHROME.ink,
                    background: selected ? BUILDER_VISUAL.accentBg : "transparent",
                    borderRadius: 6,
                  }}
                >
                  {t(family.label)}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <span title={fontSizeTitle}>
        <FontSizeStepper
          value={displayFontSize}
          disabled={disabled}
          onChange={patchFontSize}
        />
      </span>

      <Divider />

      <ToolbarBtn
        title={t("Bold")}
        active={boldActive}
        disabled={disabled}
        onClick={() => {
          if (editingActive && resolvedToggleBold) {
            resolvedToggleBold();
            return;
          }
          applyStylePatch({
            fontWeight: boldActive ? undefined : 700,
          });
        }}
      >
        B
      </ToolbarBtn>
      <ToolbarBtn
        title={t("Italic")}
        active={italicActive}
        disabled={disabled}
        onClick={() => {
          if (editingActive && resolvedToggleItalic) {
            resolvedToggleItalic();
            return;
          }
          applyStylePatch({
            fontStyle: italicActive ? undefined : "italic",
          });
        }}
      >
        <span style={{ fontStyle: "italic" }}>I</span>
      </ToolbarBtn>

      <Divider />

      <ToolbarBtn
        title={t("Align text left (inside this block)")}
        active={align === "left"}
        disabled={disabled}
        onClick={() => patchAlign("left")}
      >
        <AlignLeft size={15} strokeWidth={2} aria-hidden />
      </ToolbarBtn>
      <ToolbarBtn
        title={t("Align text center (inside this block)")}
        active={align === "center"}
        disabled={disabled}
        onClick={() => patchAlign("center")}
      >
        <AlignCenter size={15} strokeWidth={2} aria-hidden />
      </ToolbarBtn>
      <ToolbarBtn
        title={t("Align text right (inside this block)")}
        active={align === "right"}
        disabled={disabled}
        onClick={() => patchAlign("right")}
      >
        <AlignRight size={15} strokeWidth={2} aria-hidden />
      </ToolbarBtn>
      {showJustify ? (
        <ToolbarBtn
          title={t("Justify text")}
          active={align === "justify"}
          disabled={disabled}
          onClick={() => patchAlign("justify")}
        >
          ≡
        </ToolbarBtn>
      ) : null}

      <Divider />

      <div style={{ position: "relative", flexShrink: 0 }}>
        <ToolbarBtn
          title={t("Move this block within its section")}
          active={blockPositionOpen || blockPosition !== null}
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            setBlockPositionOpen((open) => !open);
            setMoreOpen(false);
            setFontFamilyOpen(false);
          }}
        >
          <MoveHorizontal size={15} strokeWidth={2} aria-hidden />
        </ToolbarBtn>
        {blockPositionOpen ? (
          <div
            role="toolbar"
            aria-label={t("Block position")}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              left: "50%",
              bottom: "calc(100% + 6px)",
              transform: "translateX(-50%)",
              display: "inline-flex",
              alignItems: "center",
              gap: 2,
              padding: 4,
              background: CHROME.surface,
              border: `1px solid ${CHROME.line}`,
              borderRadius: 10,
              boxShadow: BUILDER_VISUAL.toolbarShadow,
              zIndex: Z_INDEX.toast,
            }}
          >
            {/* A header, because the icons alone cannot carry the distinction:
                this group moves the BLOCK, the group on the bar aligns the TEXT
                inside it. They used to share the same centre glyph, so
                "I clicked center and nothing moved" was the common failure. */}
            <span
              style={{
                alignSelf: "center",
                padding: "0 6px 0 4px",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: CHROME.muted3,
                whiteSpace: "nowrap",
              }}
            >
              {t("Block")}
            </span>
            <ToolbarBtn
              title={t("Move block to the left of its section")}
              active={blockPosition === "left"}
              disabled={disabled}
              onClick={() => patchBlockPosition("left")}
            >
              <AlignHorizontalJustifyStart size={15} strokeWidth={2} aria-hidden />
            </ToolbarBtn>
            <ToolbarBtn
              title={t("Center block in its section")}
              active={blockPosition === "center"}
              disabled={disabled}
              onClick={() => patchBlockPosition("center")}
            >
              <AlignHorizontalJustifyCenter size={15} strokeWidth={2} aria-hidden />
            </ToolbarBtn>
            <ToolbarBtn
              title={t("Move block to the right of its section")}
              active={blockPosition === "right"}
              disabled={disabled}
              onClick={() => patchBlockPosition("right")}
            >
              <AlignHorizontalJustifyEnd size={15} strokeWidth={2} aria-hidden />
            </ToolbarBtn>
          </div>
        ) : null}
      </div>

      <Divider />

      <ToolbarBtn
        title={t("Text color")}
        disabled={disabled}
        buttonRef={colorBtnRef}
        onClick={handleColorClick}
      >
        <span
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: textColor,
            boxShadow: `inset 0 0 0 1px ${CHROME.line}`,
          }}
        />
      </ToolbarBtn>

      {showLink ? (
        <ToolbarBtn title={t("Link")} disabled={disabled} onClick={handleLinkClick}>
          <Link2 size={15} strokeWidth={2} aria-hidden />
        </ToolbarBtn>
      ) : null}

      <Divider />

      {/* Nested blocks — mirrors the selection chip's toggle so a text block
          can reopen the panel it just closed. */}
      {onToggleNested ? (
        <ToolbarBtn
          title={nestedOpen ? t("Hide nested blocks") : t("Show nested blocks")}
          active={!!nestedOpen}
          disabled={disabled}
          onClick={onToggleNested}
        >
          <FolderTree size={15} strokeWidth={2} aria-hidden />
        </ToolbarBtn>
      ) : null}
      <ToolbarBtn
        title={t("Advanced, open inspector")}
        disabled={disabled}
        onClick={onOpenInspector}
      >
        <SlidersHorizontal size={15} strokeWidth={2} aria-hidden />
      </ToolbarBtn>

      <ToolbarBtn title={t("Duplicate")} disabled={disabled} onClick={onDuplicate}>
        <Copy size={15} strokeWidth={2} aria-hidden />
      </ToolbarBtn>

      <div style={{ position: "relative" }}>
        <ToolbarBtn
          title={t("More actions")}
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            setMoreOpen((o) => !o);
            setBlockPositionOpen(false);
            setFontFamilyOpen(false);
          }}
        >
          <MoreHorizontal size={16} strokeWidth={2} aria-hidden />
        </ToolbarBtn>
        {moreOpen ? (
          <div
            role="menu"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              right: 0,
              bottom: "calc(100% + 6px)",
              minWidth: 168,
              background: CHROME.surface,
              border: `1px solid ${CHROME.line}`,
              borderRadius: 10,
              boxShadow: BUILDER_VISUAL.toolbarShadow,
              padding: 4,
              zIndex: Z_INDEX.toast,
            }}
          >
            {[
              { label: t("Edit in inspector"), action: onOpenInspector },
              ...(usesThemeFontSize
                ? []
                : [
                    {
                      label: t("Use theme font size"),
                      action: () => applyStylePatch({ fontSize: undefined }),
                    },
                  ]),
              { label: t("Copy style"), action: onCopyStyle },
              { label: t("Paste style"), action: onPasteStyle, disabled: !canPasteStyle },
              { label: t("Reset style"), action: onResetStyle },
              { label: t("Hide on device"), action: onHideOnDevice },
              { label: locked ? t("Unlock") : t("Lock"), action: onToggleLock },
              { label: t("Delete"), action: onRemove, danger: true },
            ]
              .filter((item) => item.action)
              .map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  item.action?.();
                  setMoreOpen(false);
                }}
                className="block w-full cursor-pointer border-none bg-transparent px-3 py-2 text-left text-[12px] font-medium"
                style={{
                  color: item.danger ? "#b91c1c" : CHROME.ink,
                  borderRadius: 6,
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {!editingActive ? (
        <ColorPickerPopover
          open={nodeColorOpen}
          anchor={colorAnchor}
          value={textColor}
          onChange={(hex) => applyStylePatch({ textColor: hex })}
          onClose={() => {
            setNodeColorOpen(false);
            setColorAnchor(null);
          }}
        />
      ) : null}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(bar, document.body);
}
