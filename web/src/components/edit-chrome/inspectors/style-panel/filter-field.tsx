"use client";

/**
 * FilterField — real CSS `filter` controls (self, not backdrop).
 *
 * Honesty rules, same as glass-backdrop-field:
 *  - Rendering never emits a patch.
 *  - A value the grammar cannot own (drop-shadow, invert, url(), two blurs)
 *    keeps the raw text ONLY, with a note that it is kept as written.
 */

import { CHROME } from "../../kit/tokens";
import { useInspectorT } from "../kit/use-inspector-t";
import type { BuilderNodeStyleValue } from "@/lib/site-admin/builder-node";
import {
  composeCssFilter,
  parseCssFilter,
  type FilterParts,
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

const FIELDS: ReadonlyArray<{
  key: keyof FilterParts;
  label: string;
  min: number;
  max: number;
  step: number;
  dataAttr: string;
}> = [
  { key: "blur", label: "Blur", min: 0, max: 80, step: 1, dataAttr: "blur" },
  { key: "brightness", label: "Brightness", min: 0, max: 3, step: 0.05, dataAttr: "brightness" },
  { key: "contrast", label: "Contrast", min: 0, max: 3, step: 0.05, dataAttr: "contrast" },
  { key: "grayscale", label: "Grayscale", min: 0, max: 1, step: 0.05, dataAttr: "grayscale" },
  { key: "saturate", label: "Saturate", min: 0, max: 3, step: 0.05, dataAttr: "saturate" },
  { key: "sepia", label: "Sepia", min: 0, max: 1, step: 0.05, dataAttr: "sepia" },
  { key: "hueRotate", label: "Hue rotate", min: -180, max: 180, step: 1, dataAttr: "hueRotate" },
];

export function FilterField({
  value,
  onPatch,
}: {
  value: string | undefined;
  onPatch: (patch: Partial<BuilderNodeStyleValue>) => void;
}) {
  const { t } = useInspectorT();
  const parsed = parseCssFilter(value);
  const hasValue = Boolean(value && value.trim());
  const isForeign = hasValue && parsed === null;

  function setPart(key: keyof FilterParts, raw: string) {
    if (!parsed) return;
    const next: FilterParts = {
      ...parsed,
      [key]: raw === "" ? null : Number(raw),
    };
    const composed = composeCssFilter(next);
    onPatch({ filter: composed || undefined });
  }

  return (
    <div className="flex flex-col gap-1.5" data-builder-node-style-control="filter">
      <span className="text-[11px]" style={{ color: CHROME.muted }}>
        {t("Filter")}
      </span>
      <input
        type="text"
        className="px-2"
        data-builder-filter-raw=""
        style={inputStyle}
        placeholder="blur(8px) grayscale(0.4)"
        value={value ?? ""}
        onChange={(e) =>
          onPatch({ filter: e.target.value.trim() || undefined })
        }
      />
      {parsed ? (
        <div className="grid grid-cols-2 gap-1.5">
          {FIELDS.map((field) => (
            <div key={field.key} className="flex flex-col items-center gap-1">
              <span className="text-[10px]" style={{ color: CHROME.muted }}>
                {t(field.label)}
              </span>
              <input
                type="number"
                min={field.min}
                max={field.max}
                step={field.step}
                data-builder-filter-field={field.dataAttr}
                style={numStyle}
                placeholder=""
                value={parsed[field.key] ?? ""}
                onChange={(e) => setPart(field.key, e.target.value)}
              />
            </div>
          ))}
        </div>
      ) : null}
      {isForeign ? (
        <span
          className="text-[10px] leading-tight"
          data-builder-filter-foreign=""
          style={{ color: CHROME.muted }}
        >
          {t("Custom filter, kept exactly as written.")}
        </span>
      ) : null}
    </div>
  );
}
