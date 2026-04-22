"use client";

import type { SectionEditorProps } from "../types";
import { PresentationPanel } from "../shared/PresentationPanel";
import { VariantPicker } from "../shared/VariantPicker";
import { MediaPicker } from "../shared/MediaPicker";
import type { CategoryGridV1, CategoryGridItem } from "./schema";

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT =
  "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";

const VARIANTS: ReadonlyArray<{ value: CategoryGridV1["variant"]; label: string; hint: string }> = [
  { value: "portrait-masonry", label: "Portrait masonry", hint: "Editorial portrait tiles with icon overlay." },
  { value: "horizontal-scroll", label: "Horizontal scroll", hint: "Scroll rail on mobile; grid on desktop." },
  { value: "small-icon-list", label: "Small icon list", hint: "Dense icon-only grid, no imagery." },
];

const ICONS: CategoryGridItem["iconKey"][] = [
  "brush",
  "scissors",
  "camera",
  "film",
  "clipboard",
  "floral",
  "sparkle",
  "music",
  "ring",
  "pin",
  "calendar",
  "plane",
  "star",
  "circle",
  "square",
  "diamond",
];

export function CategoryGridEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<CategoryGridV1>) {
  const value: CategoryGridV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    copy: initial.copy ?? "",
    items:
      initial.items ?? [
        { label: "Bridal Makeup", tagline: "Long-wear, luminous" },
      ],
    variant: initial.variant ?? "portrait-masonry",
    columnsDesktop: initial.columnsDesktop ?? 4,
    footerCta: initial.footerCta,
    presentation: initial.presentation,
  };

  const patch = (p: Partial<CategoryGridV1>) => onChange({ ...value, ...p });
  const patchItem = (i: number, p: Partial<CategoryGridItem>) =>
    patch({
      items: value.items.map((it, j) => (j === i ? { ...it, ...p } : it)),
    });
  const addItem = () => {
    if (value.items.length >= 12) return;
    patch({
      items: [...value.items, { label: "New category" }],
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
            value={value.eyebrow ?? ""}
            onChange={(e) => patch({ eyebrow: e.target.value })}
            placeholder="Services"
          />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Headline</span>
          <input
            className={INPUT}
            maxLength={200}
            value={value.headline ?? ""}
            onChange={(e) => patch({ headline: e.target.value })}
            placeholder="A house of beauty, image, and live experience."
          />
        </label>
      </div>
      <label className={FIELD}>
        <span className={LABEL}>Copy</span>
        <textarea
          className={`${INPUT} min-h-[60px]`}
          maxLength={320}
          value={value.copy ?? ""}
          onChange={(e) => patch({ copy: e.target.value })}
        />
      </label>

      <VariantPicker
        name="category_grid.variant"
        legend="Variant"
        sectionKey="category_grid"
        options={VARIANTS.map((v) => ({
          value: v.value as NonNullable<CategoryGridV1["variant"]>,
          label: v.label,
          hint: v.hint,
        }))}
        value={value.variant}
        onChange={(next) => patch({ variant: next })}
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>Columns (desktop)</span>
          <input
            className={INPUT}
            type="number"
            min={2}
            max={5}
            value={value.columnsDesktop}
            onChange={(e) =>
              patch({ columnsDesktop: Math.max(2, Math.min(5, Number(e.target.value))) })
            }
          />
        </label>
        <div className={FIELD}>
          <span className={LABEL}>Footer CTA</span>
          <input
            className={INPUT}
            placeholder="Label (leave blank to hide)"
            value={value.footerCta?.label ?? ""}
            onChange={(e) =>
              patch({
                footerCta: e.target.value
                  ? {
                      label: e.target.value,
                      href: value.footerCta?.href ?? "/",
                    }
                  : undefined,
              })
            }
          />
          <input
            className={INPUT}
            placeholder="Link"
            value={value.footerCta?.href ?? ""}
            onChange={(e) =>
              patch({
                footerCta: value.footerCta
                  ? { ...value.footerCta, href: e.target.value }
                  : e.target.value
                    ? { label: "See all", href: e.target.value }
                    : undefined,
              })
            }
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className={LABEL}>Items ({value.items.length} / 12)</span>
          <button
            type="button"
            onClick={addItem}
            disabled={value.items.length >= 12}
            className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-50"
          >
            + Add
          </button>
        </div>
        {value.items.map((item, i) => (
          <div
            key={i}
            className="grid grid-cols-1 gap-2 rounded-md border border-border/60 bg-muted/30 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,120px)_auto]"
          >
            <input
              className={INPUT}
              placeholder="Label"
              maxLength={60}
              value={item.label}
              onChange={(e) => patchItem(i, { label: e.target.value })}
            />
            <input
              className={INPUT}
              placeholder="Tagline (optional)"
              maxLength={120}
              value={item.tagline ?? ""}
              onChange={(e) => patchItem(i, { tagline: e.target.value })}
            />
            <div className="flex items-center gap-2">
              <input
                className={`${INPUT} flex-1`}
                placeholder="Image URL (optional)"
                value={item.imageUrl ?? ""}
                onChange={(e) =>
                  patchItem(i, { imageUrl: e.target.value || undefined })
                }
              />
              {tenantId ? (
                <MediaPicker
                  tenantId={tenantId}
                  onPick={(url) => patchItem(i, { imageUrl: url })}
                  label=""
                />
              ) : null}
            </div>
            <select
              className={INPUT}
              value={item.iconKey ?? ""}
              onChange={(e) =>
                patchItem(i, {
                  iconKey: (e.target.value ||
                    undefined) as CategoryGridItem["iconKey"],
                })
              }
            >
              <option value="">No icon</option>
              {ICONS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => removeItem(i)}
              disabled={value.items.length <= 1}
              className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-30"
              aria-label="Remove"
            >
              ×
            </button>
            <input
              className={`${INPUT} md:col-span-5`}
              placeholder="Link href (optional)"
              value={item.href ?? ""}
              onChange={(e) => patchItem(i, { href: e.target.value || undefined })}
            />
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
