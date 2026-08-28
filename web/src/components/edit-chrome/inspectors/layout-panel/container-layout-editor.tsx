"use client";

/**
 * Layout tab — THE CONTAINER EDITOR, stack model first.
 *
 * WHAT CHANGED AND WHY
 * ────────────────────
 * The engine has always laid children out as an ordered stack: a container is
 * a flex column, a row, or a grid, with a token gap, and a drag reorders
 * through the drop resolver. There is no pixel-coordinate base model to fall
 * out of, which is exactly why "a user can't break layouts and still have
 * flexibility" is true of the renderer today.
 *
 * The panel did not say so. Direction, gap, columns and alignment were four
 * equal chips in a two-by-two grid, sharing that grid with "Display mode" and
 * "HTML tag"; wrap and justification were not in this tab at all, reachable
 * only from a collapsed spec-named block in the Style tab's Advanced group.
 * An operator reading this panel could not tell which controls shape a layout
 * and which are escapes.
 *
 * So the order is now: what this block is doing, in a sentence → the stack
 * fundamentals → the grid's own two decisions → the layouts that work, as one
 * click → everything else, collapsed. Nothing was removed and nothing is
 * gated; the display-mode / items-per-view / HTML-tag controls are all still
 * here, one disclosure down.
 *
 * TWO FIELDS ARE STYLE, NOT PROPS
 * ───────────────────────────────
 * Wrap and justification have no container prop: the renderer reads them off
 * `style.flexWrap` / `style.justifyContent`, and a grid's minimum column width
 * off `style.gridTemplateColumns`. They write through `node-style-write.ts`,
 * which routes to the same bucket the Style tab's own controls route to, so
 * the two tabs cannot come to disagree about one value. A custom breakpoint
 * tier has container-prop lanes and no style-key lanes, so on those tiers the
 * three fields say they are desktop/tablet/mobile only rather than accepting
 * an edit the page would never show.
 */

import type { BuilderContainerNode } from "@/lib/site-admin/builder-node";
import type { BuilderNodeStyleValue } from "@/lib/site-admin/builder-node";

import { NumberUnit } from "../../kit/number-unit";
import { Segmented } from "../../kit/segmented";
import { CHROME } from "../../kit/tokens";
import { InspectorGroup } from "../kit";
import {
  INSPECTOR_FIELD_LABEL_CLASS as FIELD_LABEL,
  INSPECTOR_HELP_TEXT_CLASS as HINT,
} from "../kit/inspector-ui";
import { useInspectorT } from "../kit/use-inspector-t";
import { ContainerFieldLabel } from "./field-label";
import { StackGroup, StackSummary } from "./container-stack-group";
import { NodeLayoutPresetGrid, nodeLayoutResetPatch } from "./node-layout-presets";
import {
  CONTAINER_HTML_TAG_OPTIONS,
  DISPLAY_MODE_OPTIONS,
  GRID_COLUMNS_OPTIONS,
  ITEMS_PER_VIEW_OPTIONS,
  cleanContainerResponsive,
  type ContainerLayoutFieldKey,
  type ContainerResponsiveViewport,
} from "./node-layout-options";
import {
  stackStyleWithPatch,
  stackTierOverride,
  stackViewportStyle,
} from "./node-style-write";
import {
  gapFieldValue,
  gapPatchValue,
  isForeignGridTemplate,
  minColumnWidthTemplate,
  parseMinColumnWidth,
  tierSupportsStyleOverrides,
} from "./stack-model";

const MIN_COLUMN_UNITS = ["px", "rem", "%"] as const;

const TIER_ONLY_NOTE =
  "Wrapping, flow and the minimum column width are set on Desktop, Tablet or Mobile.";

export interface ContainerLayoutEditorProps {
  node: BuilderContainerNode;
  onPatch: (patch: Record<string, unknown>) => void;
  /** The active editing tier id. `desktop` is the base; anything else is a bucket. */
  device: string;
  /** Friendly label for the active tier (e.g. "Wide", "Compact phone"). */
  tierLabel?: string;
}

export function ContainerLayoutEditor({
  node,
  onPatch,
  device,
  tierLabel,
}: ContainerLayoutEditorProps) {
  const { t } = useInspectorT();
  const responsive = node.props.responsive;
  const editingOverride = device !== "desktop";
  // Any non-desktop tier id is a valid override bucket now — not just the two
  // built-ins. This is the core "remove the tier limitation" behaviour.
  const overrideBucket = editingOverride ? responsive?.[device] : undefined;
  const activeTierLabel = tierLabel ?? device;

  const patchResponsive = (
    viewport: ContainerResponsiveViewport,
    key: ContainerLayoutFieldKey,
    next: string | number | undefined,
  ) => {
    const nextResponsive: NonNullable<BuilderContainerNode["props"]["responsive"]> = {
      ...(responsive ?? {}),
      [viewport]: {
        ...(responsive?.[viewport] ?? {}),
        [key]: next,
      },
    };
    onPatch({ responsive: cleanContainerResponsive(nextResponsive) });
  };

  // Per-field reset on this tier: drop the one key from the override bucket,
  // re-inheriting the desktop base. Reuses cleanContainerResponsive so an
  // emptied bucket disappears entirely.
  const resetField = (key: ContainerLayoutFieldKey) => {
    if (!editingOverride) return;
    patchResponsive(device, key, undefined);
  };

  // A field is "modified on this tier" when its override bucket key is set.
  const isFieldOverridden = (key: ContainerLayoutFieldKey): boolean =>
    editingOverride && overrideBucket?.[key] !== undefined && overrideBucket?.[key] !== null;

  const patchLayoutField = (
    key: ContainerLayoutFieldKey,
    next: string | number | undefined,
  ) => {
    if (editingOverride) {
      patchResponsive(device, key, next);
      return;
    }
    if (key === "layout") onPatch({ layout: next as string });
    else if (key === "gap") onPatch({ gap: next as string });
    else if (key === "columns") onPatch({ columns: next as number | undefined });
    else if (key === "display") onPatch({ display: next as string | undefined });
    else if (key === "itemsPerView") onPatch({ itemsPerView: next as number | undefined });
    else onPatch({ align: next as string });
  };

  const layoutValue = editingOverride ? overrideBucket?.layout ?? "" : node.props.layout;
  const columnsValue = editingOverride
    ? String(overrideBucket?.columns ?? "")
    : String(node.props.columns ?? "");
  const alignValue = editingOverride
    ? overrideBucket?.align ?? ""
    : node.props.align ?? "stretch";

  const effectiveLayout = editingOverride
    ? overrideBucket?.layout ?? node.props.layout
    : node.props.layout;
  const effectiveAlign = editingOverride
    ? overrideBucket?.align ?? node.props.align ?? "stretch"
    : node.props.align ?? "stretch";
  const effectiveColumns = editingOverride
    ? overrideBucket?.columns ?? node.props.columns
    : node.props.columns;

  // Effective display/itemsPerView for the active tier (override wins, then base).
  const effectiveDisplay = editingOverride
    ? overrideBucket?.display ?? node.props.display ?? "grid"
    : node.props.display ?? "grid";
  const displayValue = editingOverride
    ? overrideBucket?.display ?? ""
    : node.props.display ?? "grid";
  const itemsPerViewValue = editingOverride
    ? String(overrideBucket?.itemsPerView ?? "")
    : String(node.props.itemsPerView ?? "3");

  // ── The style-backed third of the stack model ────────────────────────────
  const styleSupported = tierSupportsStyleOverrides(device);
  const viewportStyle = stackViewportStyle(node.props.style, device);
  const tierOverride = stackTierOverride(node.props.style, device);
  const patchStyle = (patch: Partial<BuilderNodeStyleValue>) => {
    const next = stackStyleWithPatch(node.props.style, device, patch);
    if (next === null) return;
    onPatch({ style: next });
  };

  const gridTemplate = viewportStyle?.gridTemplateColumns;
  const minColumnWidth = parseMinColumnWidth(gridTemplate);
  const foreignTemplate = isForeignGridTemplate(gridTemplate);
  const isGrid = effectiveLayout === "grid";
  const isSlider = isGrid && effectiveDisplay === "slider";

  return (
    <div className="flex flex-col gap-3" data-builder-node-layout-panel="container">
      <div className="flex items-center justify-between">
        <span className={FIELD_LABEL}>{t("Selected block")}</span>
        <button
          type="button"
          data-builder-node-layout-reset=""
          onClick={() => onPatch(nodeLayoutResetPatch(node))}
          className="cursor-pointer text-[12px] font-semibold"
          style={{
            background: "transparent",
            border: "none",
            color: CHROME.muted,
            padding: 0,
          }}
        >
          {t("Reset block")}
        </button>
      </div>
      {editingOverride ? (
        <span className={HINT}>
          Editing {activeTierLabel} layout overrides, desktop values stay the base.
        </span>
      ) : null}

      <StackSummary
        shape={{
          direction: effectiveLayout,
          wrap: viewportStyle?.flexWrap,
          align: effectiveAlign,
          justify: viewportStyle?.justifyContent,
          columns: effectiveColumns,
          minColumnWidth,
          slider: isSlider,
        }}
      />

      <StackGroup
        directionValue={layoutValue}
        onDirectionChange={(next) => patchLayoutField("layout", next)}
        directionLabel={
          <ContainerFieldLabel
            label="Direction"
            modified={isFieldOverridden("layout")}
            onReset={() => resetField("layout")}
          />
        }
        gapValue={gapFieldValue(
          editingOverride ? overrideBucket?.gap : node.props.gap ?? "m",
        )}
        onGapChange={(next) => {
          const stored = gapPatchValue(next);
          if (stored === false) return;
          patchLayoutField("gap", stored);
        }}
        gapLabel={
          <ContainerFieldLabel
            label="Gap"
            modified={isFieldOverridden("gap")}
            onReset={() => resetField("gap")}
          />
        }
        alignValue={alignValue}
        onAlignChange={(next) => patchLayoutField("align", next)}
        alignLabel={
          <ContainerFieldLabel
            label="Line children up"
            modified={isFieldOverridden("align")}
            onReset={() => resetField("align")}
          />
        }
        flow={{
          wrapValue: viewportStyle?.flexWrap ?? "",
          onWrapChange: (next) =>
            patchStyle({ flexWrap: (next || undefined) as BuilderNodeStyleValue["flexWrap"] }),
          wrapLabel: (
            <ContainerFieldLabel
              label="Wrapping"
              modified={Boolean(tierOverride?.flexWrap)}
              onReset={() => patchStyle({ flexWrap: undefined })}
            />
          ),
          justifyValue: viewportStyle?.justifyContent ?? "",
          onJustifyChange: (next) =>
            patchStyle({
              justifyContent: (next || undefined) as BuilderNodeStyleValue["justifyContent"],
            }),
          justifyLabel: (
            <ContainerFieldLabel
              label="Along the flow"
              modified={Boolean(tierOverride?.justifyContent)}
              onReset={() => patchStyle({ justifyContent: undefined })}
            />
          ),
          unavailableNote: styleSupported ? undefined : TIER_ONLY_NOTE,
        }}
      />

      {/* ── Grid ────────────────────────────────────────────────────────────
          Two decisions, and the second one is the point: a minimum column
          width turns a fixed count into a grid that drops to fewer columns
          rather than squashing them. It writes the `repeat(auto-fit,
          minmax(...,1fr))` the renderer already honors at every breakpoint. */}
      {isGrid ? (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <ContainerFieldLabel
                label="Columns"
                modified={isFieldOverridden("columns")}
                onReset={() => resetField("columns")}
              />
              <Segmented
                fullWidth
                compact
                value={columnsValue}
                onChange={(next) =>
                  patchLayoutField("columns", next ? Number.parseInt(next, 10) : undefined)
                }
                options={GRID_COLUMNS_OPTIONS}
              />
            </div>
            <div className="flex flex-col gap-1.5" data-builder-stack-control="min-column-width">
              <ContainerFieldLabel
                label="Min column width"
                modified={Boolean(tierOverride?.gridTemplateColumns)}
                onReset={() => patchStyle({ gridTemplateColumns: undefined })}
              />
              {styleSupported ? (
                <NumberUnit
                  units={MIN_COLUMN_UNITS}
                  defaultUnit="px"
                  step={10}
                  min={1}
                  placeholder="Off"
                  value={minColumnWidth}
                  onChange={(next) =>
                    patchStyle({
                      gridTemplateColumns: next
                        ? minColumnWidthTemplate(next.value, next.unit)
                        : undefined,
                    })
                  }
                />
              ) : (
                <span className={HINT}>{t(TIER_ONLY_NOTE)}</span>
              )}
            </div>
          </div>
          <span className={HINT}>
            {minColumnWidth
              ? t(
                  "The grid fits as many columns as clear this width and drops to fewer when it cannot, so the column count above stops applying.",
                )
              : t(
                  "Set a minimum column width and the grid reflows to fewer columns on small screens instead of squashing them.",
                )}
          </span>
          {foreignTemplate ? (
            <span className={HINT}>
              {t("This grid uses a hand-written column template:")}{" "}
              <code style={{ fontFamily: "var(--font-mono, monospace)" }}>{gridTemplate}</code>{" "}
              {t("Setting a minimum width above replaces it.")}
            </span>
          ) : null}
        </div>
      ) : null}

      <NodeLayoutPresetGrid kind={node.kind} onApply={onPatch} />

      {/* ── Advanced ────────────────────────────────────────────────────────
          The escapes, one disclosure down and never gated: a grid that scrolls
          sideways instead of wrapping, and the semantic element the box emits.
          Both were previously chips of the same weight as Direction and Gap. */}
      <InspectorGroup
        title="Advanced"
        collapsible
        advanced
        storageKey="layout-panel:container-advanced"
        defaultOpen={false}
        searchTerms={["display mode", "slider", "items per view", "html tag", "landmark"]}
      >
        {isGrid ? (
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <ContainerFieldLabel
                label="Display mode"
                modified={isFieldOverridden("display")}
                onReset={() => resetField("display")}
              />
              <Segmented
                fullWidth
                compact
                value={displayValue}
                onChange={(next) =>
                  patchLayoutField("display", next === "grid" && !editingOverride ? undefined : next)
                }
                options={DISPLAY_MODE_OPTIONS}
              />
            </div>
            {isSlider ? (
              <div className="flex flex-col gap-1.5">
                <ContainerFieldLabel
                  label="Items per view"
                  modified={isFieldOverridden("itemsPerView")}
                  onReset={() => resetField("itemsPerView")}
                />
                <Segmented
                  fullWidth
                  compact
                  value={itemsPerViewValue}
                  onChange={(next) =>
                    patchLayoutField("itemsPerView", next ? Number.parseInt(next, 10) : undefined)
                  }
                  options={ITEMS_PER_VIEW_OPTIONS}
                />
              </div>
            ) : null}
          </div>
        ) : null}
        {/* REND-1 — Semantic HTML tag picker. Only shown when editing the base
            desktop tier (not a breakpoint override), because htmlTag is a
            document-structure decision not a responsive one. Default (div) is
            the standard value that keeps existing trees byte-stable. */}
        {!editingOverride ? (
          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>HTML tag</span>
            <Segmented
              fullWidth
              compact
              value={node.props.htmlTag ?? "div"}
              onChange={(next) => {
                onPatch({ htmlTag: next === "div" ? undefined : next });
              }}
              options={CONTAINER_HTML_TAG_OPTIONS}
            />
            <span className={HINT}>
              Semantic landmark element emitted in the page HTML. Default (div) keeps the
              standard layout box. Use section/article for content regions, header/footer
              for page-level landmarks, nav for navigation, aside for supplementary content.
            </span>
          </div>
        ) : null}
      </InspectorGroup>
    </div>
  );
}
