"use client";

/**
 * StateStyleFields — extracted from style-panel.tsx (mechanical lift, byte-stable).
 *
 * Renders the interaction-state (hover / focus-visible / active) style fields
 * plus the shared swatch-style helper used across the inspector. Pulled out of
 * the 10k-line `style-panel.tsx` as the first bounded extraction; behavior and
 * markup are unchanged.
 */

import { useState, type CSSProperties } from "react";

import { ColorPickerPopover } from "../kit/color-picker";
import type { BuilderNodeHoverStyle } from "@/lib/site-admin/builder-node";

const COLOR_SWATCH_CHECKERBOARD =
  "repeating-conic-gradient(#e5e0d8 0% 25%, #ffffff 0% 50%) 50% / 8px 8px";

/** Avoid mixing `background` shorthand with `backgroundImage` on rerender. */
export function inspectorColorSwatchStyle(
  hasValue: boolean,
  displayColor: string | undefined,
  extra: CSSProperties = {},
): CSSProperties {
  const base: CSSProperties = {
    width: 30,
    height: 30,
    borderRadius: 6,
    ...extra,
  };
  if (hasValue && displayColor) {
    return { ...base, backgroundColor: displayColor };
  }
  return {
    ...base,
    backgroundColor: "transparent",
    backgroundImage: COLOR_SWATCH_CHECKERBOARD,
  };
}
/**
 * Wave 3 · 3D — state-style fields component.
 *
 * Renders the same six fields (background, text color, border color, shadow,
 * scale, translate, opacity) for whichever interaction state is active
 * (hover / focus-visible / active). Extracted so the markup isn't triplicated
 * inline in the `<details>` block.
 */
interface StateStyleFieldsProps {
  state: "default" | "focus" | "active";
  hoverStyle: BuilderNodeHoverStyle | undefined;
  focusStyle: BuilderNodeHoverStyle | undefined;
  activeStyle: BuilderNodeHoverStyle | undefined;
  onPatchHover: (patch: Partial<BuilderNodeHoverStyle>) => void;
  onPatchFocus: (patch: Partial<BuilderNodeHoverStyle>) => void;
  onPatchActive: (patch: Partial<BuilderNodeHoverStyle>) => void;
  chromeMuted: string;
  chromeSurface2: string;
  chromeControlBorder: string;
  chromeInk: string;
}

// Swatch display helper: resolve a color value to a CSS background string for
// the swatch button. Returns empty string for unset (caller renders checkerboard).
function stateColorSwatchDisplay(value: string | undefined): string {
  if (!value) return "";
  return value;
}

export function StateStyleFields({
  state,
  hoverStyle,
  focusStyle,
  activeStyle,
  onPatchHover,
  onPatchFocus,
  onPatchActive,
  chromeMuted,
  chromeSurface2,
  chromeControlBorder,
  chromeInk,
}: StateStyleFieldsProps) {
  const stateStyle =
    state === "default" ? hoverStyle : state === "focus" ? focusStyle : activeStyle;
  const onPatch =
    state === "default" ? onPatchHover : state === "focus" ? onPatchFocus : onPatchActive;
  const hint =
    state === "default"
      ? "Applies while hovered or keyboard-focused."
      : state === "focus"
        ? "Applies while keyboard-focused (:focus-visible)."
        : "Applies while actively pressed (:active).";

  // Single-instance color popover keyed by the active field.
  const [stateColorField, setStateColorField] = useState<{
    field: "backgroundColor" | "color" | "borderColor";
    anchor: HTMLButtonElement;
  } | null>(null);

  const inputStyle: CSSProperties = {
    height: 30,
    width: "100%",
    fontSize: 12,
    background: chromeSurface2,
    border: `1px solid ${chromeControlBorder}`,
    borderRadius: 7,
    color: chromeInk,
    outline: "none",
  };

  const swatchStyle = (value: string | undefined): CSSProperties =>
    inspectorColorSwatchStyle(
      Boolean(value),
      stateColorSwatchDisplay(value) || undefined,
      {
        flexShrink: 0,
        border: `1px solid ${chromeControlBorder}`,
        cursor: "pointer",
      },
    );

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px]" style={{ color: chromeMuted }}>
        {hint}
      </span>
      {/* Background */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px]" style={{ color: chromeMuted }}>Background</span>
          {stateStyle?.backgroundColor ? (
            <button
              type="button"
              onClick={() => onPatch({ backgroundColor: undefined })}
              className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
              style={{ background: "transparent", border: "none", color: chromeMuted, padding: 0 }}
            >
              Clear
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Pick background color"
            onClick={(e) => {
              const btn = e.currentTarget;
              setStateColorField((prev) =>
                prev?.field === "backgroundColor" ? null : { field: "backgroundColor", anchor: btn },
              );
            }}
            style={swatchStyle(stateStyle?.backgroundColor)}
          />
          <input
            type="text"
            className="flex-1 px-2"
            style={{ ...inputStyle, width: undefined }}
            placeholder="e.g. #111111, or use the swatch"
            value={stateStyle?.backgroundColor ?? ""}
            onChange={(e) => onPatch({ backgroundColor: e.target.value.trim() || undefined })}
          />
        </div>
      </div>
      {/* Text color */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px]" style={{ color: chromeMuted }}>Text color</span>
          {stateStyle?.color ? (
            <button
              type="button"
              onClick={() => onPatch({ color: undefined })}
              className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
              style={{ background: "transparent", border: "none", color: chromeMuted, padding: 0 }}
            >
              Clear
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Pick text color"
            onClick={(e) => {
              const btn = e.currentTarget;
              setStateColorField((prev) =>
                prev?.field === "color" ? null : { field: "color", anchor: btn },
              );
            }}
            style={swatchStyle(stateStyle?.color)}
          />
          <input
            type="text"
            className="flex-1 px-2"
            style={{ ...inputStyle, width: undefined }}
            placeholder="e.g. #ffffff, or use the swatch"
            value={stateStyle?.color ?? ""}
            onChange={(e) => onPatch({ color: e.target.value.trim() || undefined })}
          />
        </div>
      </div>
      {/* Border color */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px]" style={{ color: chromeMuted }}>Border color</span>
          {stateStyle?.borderColor ? (
            <button
              type="button"
              onClick={() => onPatch({ borderColor: undefined })}
              className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.10em]"
              style={{ background: "transparent", border: "none", color: chromeMuted, padding: 0 }}
            >
              Clear
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Pick border color"
            onClick={(e) => {
              const btn = e.currentTarget;
              setStateColorField((prev) =>
                prev?.field === "borderColor" ? null : { field: "borderColor", anchor: btn },
              );
            }}
            style={swatchStyle(stateStyle?.borderColor)}
          />
          <input
            type="text"
            className="flex-1 px-2"
            style={{ ...inputStyle, width: undefined }}
            placeholder="e.g. #111111, or use the swatch"
            value={stateStyle?.borderColor ?? ""}
            onChange={(e) => onPatch({ borderColor: e.target.value.trim() || undefined })}
          />
        </div>
      </div>
      {/* Shadow */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px]" style={{ color: chromeMuted }}>Shadow</span>
        <input
          type="text"
          className="px-2"
          style={inputStyle}
          placeholder="0 12px 32px rgba(0,0,0,.18)"
          value={stateStyle?.boxShadow ?? ""}
          onChange={(e) => onPatch({ boxShadow: e.target.value.trim() || undefined })}
        />
      </div>
      <div className="flex gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <span className="text-[11px]" style={{ color: chromeMuted }}>Scale</span>
          <input
            type="text"
            className="px-2"
            style={inputStyle}
            placeholder="1.04"
            value={stateStyle?.scale ?? ""}
            onChange={(e) => onPatch({ scale: e.target.value.trim() || undefined })}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <span className="text-[11px]" style={{ color: chromeMuted }}>Translate</span>
          <input
            type="text"
            className="px-2"
            style={inputStyle}
            placeholder="0 -4px"
            value={stateStyle?.translate ?? ""}
            onChange={(e) => onPatch({ translate: e.target.value.trim() || undefined })}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <span className="text-[11px]" style={{ color: chromeMuted }}>Opacity</span>
          <input
            type="text"
            className="px-2"
            style={inputStyle}
            placeholder="0.85"
            value={typeof stateStyle?.opacity === "number" ? String(stateStyle.opacity) : ""}
            onChange={(e) => {
              const raw = e.target.value.trim();
              const parsed = Number.parseFloat(raw);
              onPatch({ opacity: raw && Number.isFinite(parsed) ? parsed : undefined });
            }}
          />
        </div>
      </div>
      {/* Shared color popover — single instance keyed by field */}
      <ColorPickerPopover
        open={stateColorField !== null}
        anchor={stateColorField?.anchor ?? null}
        value={
          (stateColorField
            ? (stateStyle?.[stateColorField.field] as string | undefined)
            : undefined) || "#111111"
        }
        onChange={(next) => {
          if (!stateColorField) return;
          onPatch({ [stateColorField.field]: next } as Partial<BuilderNodeHoverStyle>);
        }}
        onClose={() => setStateColorField(null)}
      />
    </div>
  );
}
