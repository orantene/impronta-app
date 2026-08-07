"use client";

import type { SectionEditorProps } from "../types";
import { PresentationPanel } from "../shared/PresentationPanel";
import { VariantPicker } from "../shared/VariantPicker";
import { useSectionT } from "../shared/section-editor-i18n";
import type { TestimonialsTrioV1, TestimonialsTrioItem } from "./schema";

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT =
  "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";

export function TestimonialsTrioEditor({
  initial,
  onChange,
}: SectionEditorProps<TestimonialsTrioV1>) {
  const t = useSectionT();
  const value: TestimonialsTrioV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    items: initial.items ?? [
      { quote: "Quiet, unhurried, exquisite. They captured every moment." },
    ],
    variant: initial.variant ?? "trio-card",
    defaultAccent: initial.defaultAccent ?? "auto",
    presentation: initial.presentation,
  };
  const patch = (p: Partial<TestimonialsTrioV1>) => onChange({ ...value, ...p });
  const patchItem = (i: number, p: Partial<TestimonialsTrioItem>) =>
    patch({ items: value.items.map((it, j) => (j === i ? { ...it, ...p } : it)) });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>{t("Eyebrow")}</span>
          <input className={INPUT} maxLength={60} value={value.eyebrow ?? ""} onChange={(e) => patch({ eyebrow: e.target.value })} placeholder={t("Couples & planners")} />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>{t("Headline")}</span>
          <input className={INPUT} maxLength={200} value={value.headline ?? ""} onChange={(e) => patch({ headline: e.target.value })} placeholder={t("Words from the people we work for.")} />
        </label>
      </div>

      <VariantPicker
        name="testimonials_trio.variant"
        legend={t("Variant")}
        sectionKey="testimonials_trio"
        options={[
          { value: "trio-card", label: t("Trio card"), hint: t("Three accent cards in a row."), schematic: "grid" },
          { value: "single-hero", label: t("Single hero"), hint: t("One oversized pull-quote."), schematic: "overlay" },
          { value: "carousel-row", label: t("Carousel row"), hint: t("Horizontal scroll rail."), schematic: "carousel" },
        ]}
        value={value.variant}
        onChange={(next) => patch({ variant: next })}
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-1">
        <label className={FIELD}>
          <span className={LABEL}>{t("Default accent")}</span>
          <select className={INPUT} value={value.defaultAccent} onChange={(e) => patch({ defaultAccent: e.target.value as TestimonialsTrioV1["defaultAccent"] })}>
            <option value="auto">{t("Auto (cycle blush → sage → champagne)")}</option>
            <option value="blush">{t("Blush")}</option>
            <option value="sage">{t("Sage")}</option>
            <option value="champagne">{t("Champagne")}</option>
            <option value="ivory">{t("Ivory")}</option>
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className={LABEL}>
            {t("Items ({count} / 4)").replace("{count}", String(value.items.length))}
          </span>
          <button
            type="button"
            onClick={() =>
              value.items.length < 4 &&
              patch({ items: [...value.items, { quote: "Add your quote here." }] })
            }
            disabled={value.items.length >= 4}
            className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-50"
          >
            {t("+ Add")}
          </button>
        </div>
        {value.items.map((item, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/30 p-3">
            <textarea
              className={`${INPUT} min-h-[72px]`}
              maxLength={360}
              value={item.quote}
              onChange={(e) => patchItem(i, { quote: e.target.value })}
              placeholder={t("Quote")}
            />
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <input
                className={INPUT}
                placeholder={t("Author (e.g. Priya & Dev)")}
                maxLength={80}
                value={item.author ?? ""}
                onChange={(e) => patchItem(i, { author: e.target.value })}
              />
              <input
                className={INPUT}
                placeholder={t("Context (e.g. Three-day celebration)")}
                maxLength={120}
                value={item.context ?? ""}
                onChange={(e) => patchItem(i, { context: e.target.value })}
              />
              <input
                className={INPUT}
                placeholder={t("Location (e.g. Amalfi Coast)")}
                maxLength={120}
                value={item.location ?? ""}
                onChange={(e) => patchItem(i, { location: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">{t("Accent:")}</span>
                <select
                  className={INPUT}
                  value={item.accent ?? ""}
                  onChange={(e) =>
                    patchItem(i, {
                      accent: (e.target.value || undefined) as TestimonialsTrioItem["accent"],
                    })
                  }
                >
                  <option value="">{t("Use default")}</option>
                  <option value="blush">{t("Blush")}</option>
                  <option value="sage">{t("Sage")}</option>
                  <option value="champagne">{t("Champagne")}</option>
                  <option value="ivory">{t("Ivory")}</option>
                </select>
              </label>
              <button
                type="button"
                disabled={value.items.length <= 1}
                onClick={() => patch({ items: value.items.filter((_, j) => j !== i) })}
                className="rounded-md border border-border/60 px-2 py-1 text-xs disabled:opacity-30"
              >
                {t("Remove")}
              </button>
            </div>
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
