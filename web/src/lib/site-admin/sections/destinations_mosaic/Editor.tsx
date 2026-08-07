"use client";

import type { SectionEditorProps } from "../types";
import { PresentationPanel } from "../shared/PresentationPanel";
import { VariantPicker } from "../shared/VariantPicker";
import { MediaPicker } from "../shared/MediaPicker";
import { LinkPicker } from "../shared/LinkPicker";
import { useSectionT } from "../shared/section-editor-i18n";
import { RichEditor } from "@/components/edit-chrome/rich-editor";
import { KIT } from "@/components/edit-chrome/inspectors/kit";
import type {
  DestinationsMosaicV1,
  DestinationsMosaicItem,
} from "./schema";

const FIELD = KIT.field;
const LABEL = KIT.label;
const INPUT = KIT.input;

export function DestinationsMosaicEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<DestinationsMosaicV1>) {
  const t = useSectionT();
  const value: DestinationsMosaicV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    copy: initial.copy ?? "",
    items: initial.items ?? [
      { label: "Tulum", region: "Quintana Roo" },
      { label: "Los Cabos", region: "Baja California Sur" },
    ],
    footnote: initial.footnote ?? "",
    variant: initial.variant ?? "portrait-mosaic",
    presentation: initial.presentation,
  };

  const patch = (p: Partial<DestinationsMosaicV1>) => onChange({ ...value, ...p });
  const patchItem = (i: number, p: Partial<DestinationsMosaicItem>) =>
    patch({ items: value.items.map((it, j) => (j === i ? { ...it, ...p } : it)) });
  const addItem = () => {
    if (value.items.length >= 5) return;
    patch({ items: [...value.items, { label: "New destination" }] });
  };
  const removeItem = (i: number) => {
    if (value.items.length <= 2) return;
    patch({ items: value.items.filter((_, j) => j !== i) });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>{t("Eyebrow")}</span>
          <input className={INPUT} maxLength={60} value={value.eyebrow ?? ""} onChange={(e) => patch({ eyebrow: e.target.value })} placeholder={t("Destinations")} />
        </label>
        <div className={FIELD}>
          <span className={LABEL}>{t("Headline")}</span>
          <RichEditor value={value.headline ?? ""} onChange={(next) => patch({ headline: next })} variant="single" tenantId={tenantId} ariaLabel={t("Headline")} />
        </div>
      </div>
      <div className={FIELD}>
        <span className={LABEL}>{t("Copy")}</span>
        <RichEditor value={value.copy ?? ""} onChange={(next) => patch({ copy: next })} variant="multi" tenantId={tenantId} ariaLabel={t("Copy")} />
      </div>
      <label className={FIELD}>
        <span className={LABEL}>{t("Italic footnote")}</span>
        <input className={INPUT} maxLength={200} value={value.footnote ?? ""} onChange={(e) => patch({ footnote: e.target.value })} />
      </label>
      <VariantPicker
        name="destinations_mosaic.variant"
        legend={t("Variant")}
        sectionKey="destinations_mosaic"
        options={[
          { value: "portrait-mosaic", label: t("Portrait mosaic"), hint: t("Hero + 2×2 grid."), schematic: "mosaic" },
          { value: "tile-grid", label: t("Tile grid"), hint: t("Uniform tiles."), schematic: "grid" },
          { value: "map-inspired", label: t("Map inspired"), hint: t("Decorative map-styled."), schematic: "mosaic" },
        ]}
        value={value.variant}
        onChange={(next) => patch({ variant: next })}
      />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className={LABEL}>
            {t("Tiles ({count} / 5 · first tile renders hero)").replace(
              "{count}",
              String(value.items.length),
            )}
          </span>
          <button type="button" onClick={addItem} disabled={value.items.length >= 5} className={`${KIT.ghostButton} disabled:opacity-50`}>{t("+ Add")}</button>
        </div>
        {value.items.map((item, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-[#e5e0d5] bg-[#faf9f6] p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto]">
            <input className={INPUT} placeholder={t("Label (e.g. Tulum)")} maxLength={80} value={item.label} onChange={(e) => patchItem(i, { label: e.target.value })} />
            <input className={INPUT} placeholder={t("Region")} maxLength={80} value={item.region ?? ""} onChange={(e) => patchItem(i, { region: e.target.value })} />
            <input className={INPUT} placeholder={t("Tagline")} maxLength={180} value={item.tagline ?? ""} onChange={(e) => patchItem(i, { tagline: e.target.value })} />
            <button type="button" onClick={() => removeItem(i)} disabled={value.items.length <= 2} className={`${KIT.ghostButton} disabled:opacity-30`}>×</button>
            <div className="flex items-center gap-2 md:col-span-4">
              <input
                className={`${INPUT} flex-1`}
                placeholder={t("Image URL")}
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
            <div className="md:col-span-4">
              <LinkPicker
                value={item.href ?? ""}
                onChange={(next) => patchItem(i, { href: next || undefined })}
              />
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
