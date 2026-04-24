"use client";

/**
 * VisualChipGroup — swatch/icon/tone chip picker for schema enums.
 *
 * Replaces every raw enum dropdown in the bespoke panels: CTA variant,
 * band tone, featured-talent source mode, icon keys. A chip renders a
 * visual preview (swatch, tiny wireframe, icon glyph) above a short
 * caption, so the operator picks the *effect*, not the *keyword*.
 *
 * Options are opinionated — caller supplies a `preview` node per option.
 * For text-only options (edge cases), pass `null` as preview and the chip
 * renders caption-only.
 */

import type { ReactNode } from "react";

import { InfoTip } from "@/components/ui/info-tip";

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  /** Visual preview rendered above the label. Null → caption-only chip. */
  preview: ReactNode | null;
  /** Optional tooltip shown beside the label. */
  info?: string;
}

interface VisualChipGroupProps<T extends string> {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<ChipOption<T>>;
  /** Visual density. Wide = full-width 3-column; compact = auto. */
  density?: "wide" | "compact";
  /** Column count override for `wide` density. Defaults to options.length. */
  columns?: number;
}

export function VisualChipGroup<T extends string>({
  value,
  onChange,
  options,
  density = "wide",
  columns,
}: VisualChipGroupProps<T>) {
  const cols = columns ?? Math.min(options.length, 3);
  const gridCls =
    density === "wide"
      ? `grid gap-2`
      : "flex flex-wrap gap-1.5";
  const gridStyle =
    density === "wide" ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined;

  return (
    <div
      role="radiogroup"
      className={gridCls}
      style={gridStyle}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`group flex flex-col items-stretch gap-1.5 rounded-lg border bg-white p-2 text-left transition ${
              active
                ? "border-zinc-900 shadow-[0_0_0_1px_rgba(24,24,27,0.9)]"
                : "border-zinc-200 hover:border-zinc-400"
            }`}
          >
            {opt.preview ? (
              <div
                className={`flex h-14 items-center justify-center overflow-hidden rounded-md ${
                  active ? "bg-zinc-100" : "bg-zinc-50"
                }`}
              >
                {opt.preview}
              </div>
            ) : null}
            <div className="flex items-center gap-1 px-0.5">
              <span
                className={`text-[11px] font-semibold ${
                  active ? "text-zinc-900" : "text-zinc-700"
                }`}
              >
                {opt.label}
              </span>
              {opt.info ? <InfoTip label={opt.info} size={11} /> : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
