"use client";

import type { SectionEditorProps } from "../types";
import { PresentationPanel } from "../shared/PresentationPanel";
import { VariantPicker } from "../shared/VariantPicker";
import type { TrustStripV1, TrustStripItem } from "./schema";

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT =
  "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";
const HINT = "text-xs text-muted-foreground";

const VARIANTS: ReadonlyArray<{
  value: TrustStripV1["variant"];
  label: string;
  hint: string;
}> = [
  { value: "icon-row", label: "Icon row", hint: "Serif italic numerals (01 / 02 / 03)." },
  { value: "metrics-row", label: "Metrics row", hint: "Big stat + caption per item." },
  { value: "logo-row", label: "Logo row", hint: "Italic serif names — press / client strip." },
];

const BACKGROUNDS: ReadonlyArray<{
  value: NonNullable<TrustStripV1["background"]>;
  label: string;
}> = [
  { value: "neutral", label: "Neutral" },
  { value: "ivory", label: "Ivory" },
  { value: "champagne", label: "Champagne" },
  { value: "espresso", label: "Espresso (dark)" },
];

const DENSITIES: ReadonlyArray<{
  value: NonNullable<TrustStripV1["density"]>;
  label: string;
}> = [
  { value: "tight", label: "Tight" },
  { value: "standard", label: "Standard" },
  { value: "airy", label: "Airy" },
];

export function TrustStripEditor({
  initial,
  onChange,
}: SectionEditorProps<TrustStripV1>) {
  const value: TrustStripV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    items: initial.items ?? [{ label: "Destination-ready", detail: "" }],
    variant: initial.variant ?? "icon-row",
    background: initial.background ?? "neutral",
    density: initial.density,
    presentation: initial.presentation,
  };

  const patch = (p: Partial<TrustStripV1>) => onChange({ ...value, ...p });
  const patchItem = (i: number, p: Partial<TrustStripItem>) =>
    patch({
      items: value.items.map((it, j) => (j === i ? { ...it, ...p } : it)),
    });
  const addItem = () => {
    if (value.items.length >= 6) return;
    patch({
      items: [...value.items, { label: "New item", detail: "" }],
    });
  };
  const removeItem = (i: number) => {
    if (value.items.length <= 1) return;
    patch({ items: value.items.filter((_, j) => j !== i) });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>Eyebrow</span>
          <input
            className={INPUT}
            maxLength={60}
            placeholder="Why book us"
            value={value.eyebrow ?? ""}
            onChange={(e) => patch({ eyebrow: e.target.value })}
          />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Headline</span>
          <input
            className={INPUT}
            maxLength={140}
            placeholder="A curated house of…"
            value={value.headline ?? ""}
            onChange={(e) => patch({ headline: e.target.value })}
          />
        </label>
      </div>

      <VariantPicker
        name="trust_strip.variant"
        legend="Layout variant"
        sectionKey="trust_strip"
        options={VARIANTS.map((v) => ({
          value: v.value as NonNullable<TrustStripV1["variant"]>,
          label: v.label,
          hint: v.hint,
        }))}
        value={value.variant}
        onChange={(next) => patch({ variant: next })}
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className={FIELD}>
          <span className={LABEL}>Background</span>
          <select
            className={INPUT}
            value={value.background ?? "neutral"}
            onChange={(e) =>
              patch({
                background: e.target.value as NonNullable<TrustStripV1["background"]>,
              })
            }
          >
            {BACKGROUNDS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </label>

        <label className={FIELD}>
          <span className={LABEL}>Density</span>
          <select
            className={INPUT}
            value={value.density ?? ""}
            onChange={(e) =>
              patch({
                density: (e.target.value || undefined) as TrustStripV1["density"],
              })
            }
          >
            <option value="">Theme default</option>
            {DENSITIES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className={LABEL}>Items ({value.items.length} / 6)</span>
          <button
            type="button"
            onClick={addItem}
            disabled={value.items.length >= 6}
            className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-50"
          >
            + Add item
          </button>
        </div>
        {value.items.map((item, i) => (
          <div
            key={i}
            className="grid grid-cols-1 gap-2 rounded-md border border-border/60 bg-muted/30 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto_auto]"
          >
            {value.variant === "metrics-row" ? (
              <input
                className={INPUT}
                placeholder="Stat (e.g. 12+ years)"
                maxLength={40}
                value={item.stat ?? ""}
                onChange={(e) => patchItem(i, { stat: e.target.value })}
              />
            ) : (
              <input
                className={INPUT}
                placeholder="Label"
                maxLength={80}
                value={item.label}
                onChange={(e) => patchItem(i, { label: e.target.value })}
              />
            )}
            <input
              className={INPUT}
              placeholder="Supporting detail (optional)"
              maxLength={200}
              value={item.detail ?? ""}
              onChange={(e) => patchItem(i, { detail: e.target.value })}
            />
            {value.variant === "metrics-row" ? (
              <input
                className={INPUT}
                placeholder="Label"
                maxLength={80}
                value={item.label}
                onChange={(e) => patchItem(i, { label: e.target.value })}
              />
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => removeItem(i)}
              disabled={value.items.length <= 1}
              className="rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground disabled:opacity-30"
              aria-label="Remove item"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <PresentationPanel
        value={value.presentation}
        onChange={(next) => patch({ presentation: next })}
      />
    </div>
  );
}
