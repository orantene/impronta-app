"use client";

/**
 * GlassBackdropField — the backdrop-filter control, with a one-click glass
 * surface preset.
 *
 * Backdrop blur used to be a bare text input with a `blur(12px)` placeholder:
 * expressible, unreachable. This control keeps that input (the escape hatch,
 * and the verbatim display for any hand-authored value), and adds:
 *
 *  - a "Glass" preset button that writes the whole effect in one patch —
 *    frosted backdrop + translucent fill + hairline border — because a blur
 *    alone does not read as glass;
 *  - Blur / Saturation number fields that appear whenever the stored value is
 *    one the grammar owns (`blur(Npx)` ± `saturate(X)`), each recomposing
 *    only the backdropFilter string.
 *
 * A value outside that grammar (`invert(1)`, two blurs, …) keeps the raw
 * input ONLY, with a note saying the value is kept as written — rendering
 * never emits a patch, so nothing is snapped. Pinned by
 * visual-effect-wiring.test.tsx.
 */

import { CHROME } from "../../kit/tokens";
import { useInspectorT } from "../kit/use-inspector-t";
import type { BuilderNodeStyleValue } from "@/lib/site-admin/builder-node";
import {
  composeGlassBackdrop,
  GLASS_SURFACE_PATCH,
  parseGlassBackdrop,
} from "./visual-effect-models";

const inputStyle = {
  height: 30,
  width: "100%",
  fontSize: 12,
  background: CHROME.surface2,
  border: `1px solid ${CHROME.controlBorder}`,
  borderRadius: 7,
  color: CHROME.ink,
  outline: "none",
};

const numStyle = {
  ...inputStyle,
  height: 28,
  textAlign: "center" as const,
};

export function GlassBackdropField({
  value,
  onPatch,
}: {
  /** The stored backdropFilter string for the active tier. */
  value: string | undefined;
  /** Patches the selected node's style at the active tier. */
  onPatch: (patch: Partial<BuilderNodeStyleValue>) => void;
}) {
  const { t } = useInspectorT();
  const parsed = parseGlassBackdrop(value);
  const hasValue = Boolean(value && value.trim());
  const isForeign = hasValue && parsed === null;

  return (
    <div
      className="flex flex-col gap-1.5"
      data-builder-node-style-control="backdropFilter"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px]" style={{ color: CHROME.muted }}>
          {t("Backdrop")}
        </span>
        <button
          type="button"
          data-builder-glass-preset=""
          className="cursor-pointer rounded-md text-[10px] font-semibold"
          style={{
            height: 22,
            padding: "0 9px",
            background: CHROME.surface2,
            color: CHROME.ink,
            border: `1px solid ${CHROME.controlBorder}`,
            outline: "none",
          }}
          title={t("Frosted blur, a translucent fill and a hairline border in one click. Every part stays adjustable.")}
          onClick={() => onPatch({ ...GLASS_SURFACE_PATCH })}
        >
          {t("Glass")}
        </button>
      </div>
      <input
        type="text"
        className="px-2"
        data-builder-glass-raw=""
        style={inputStyle}
        placeholder="blur(12px)"
        value={value ?? ""}
        onChange={(e) =>
          onPatch({ backdropFilter: e.target.value.trim() || undefined })
        }
      />
      {parsed ? (
        <div className="grid grid-cols-2 gap-1.5">
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px]" style={{ color: CHROME.muted }}>
              {t("Blur")}
            </span>
            <input
              type="number"
              min={0}
              max={80}
              data-builder-glass-blur=""
              style={numStyle}
              value={parsed.blur}
              onChange={(e) =>
                onPatch({
                  backdropFilter: composeGlassBackdrop({
                    ...parsed,
                    blur: Math.max(0, Math.min(80, Math.round(Number(e.target.value) || 0))),
                  }),
                })
              }
            />
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px]" style={{ color: CHROME.muted }}>
              {t("Saturation %")}
            </span>
            <input
              type="number"
              min={0}
              max={300}
              step={10}
              data-builder-glass-saturate=""
              style={numStyle}
              placeholder="100"
              value={parsed.saturate !== null ? Math.round(parsed.saturate * 100) : ""}
              onChange={(e) => {
                const raw = e.target.value;
                onPatch({
                  backdropFilter: composeGlassBackdrop({
                    ...parsed,
                    saturate:
                      raw === ""
                        ? null
                        : Math.max(0, Math.min(300, Number(raw))) / 100,
                  }),
                });
              }}
            />
          </div>
        </div>
      ) : null}
      {isForeign ? (
        <span className="text-[10px] leading-tight" style={{ color: CHROME.muted }}>
          {t("Custom backdrop filter, kept exactly as written.")}
        </span>
      ) : null}
    </div>
  );
}
