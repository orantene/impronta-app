"use client";

import { PresentationPanel } from "../shared/PresentationPanel";
import { VariantPicker } from "../shared/VariantPicker";
import { MediaPicker } from "../shared/MediaPicker";
import { AltTextField } from "../shared/AltTextField";
import { useSectionT } from "../shared/section-editor-i18n";
import type { SectionEditorProps } from "../types";
import type {
  ImageCopyAlternatingV1,
  ImageCopyAlternatingItem,
} from "./schema";
import { KIT } from "@/components/edit-chrome/inspectors/kit";

const FIELD = KIT.field;
const LABEL = KIT.label;
const INPUT = KIT.input;

export function ImageCopyAlternatingEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<ImageCopyAlternatingV1>) {
  const t = useSectionT();
  const value: ImageCopyAlternatingV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "",
    items: initial.items ?? [
      { title: "Service one", italicTagline: "Long-wear, luminous.", body: "", side: "auto" },
    ],
    variant: initial.variant ?? "editorial-alternating",
    gap: initial.gap ?? "airy",
    imageRatio: initial.imageRatio ?? "5/6",
    presentation: initial.presentation,
  };
  const patch = (p: Partial<ImageCopyAlternatingV1>) => onChange({ ...value, ...p });
  const patchItem = (i: number, p: Partial<ImageCopyAlternatingItem>) =>
    patch({ items: value.items.map((it, j) => (j === i ? { ...it, ...p } : it)) });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>{t("Eyebrow")}</span>
          <input
            className={INPUT}
            maxLength={60}
            value={value.eyebrow ?? ""}
            onChange={(e) => patch({ eyebrow: e.target.value })}
          />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>{t("Headline")}</span>
          <input
            className={INPUT}
            maxLength={200}
            value={value.headline ?? ""}
            onChange={(e) => patch({ headline: e.target.value })}
          />
        </label>
      </div>

      <VariantPicker
        name="image_copy_alternating.variant"
        legend={t("Variant")}
        sectionKey="image_copy_alternating"
        options={[
          { value: "editorial-alternating", label: t("Editorial alternating"), hint: t("Image alternates left/right."), schematic: "split" },
          { value: "info-forward", label: t("Info forward"), hint: t("Text-heavy with supporting image."), schematic: "stack" },
        ]}
        value={value.variant}
        onChange={(next) => patch({ variant: next })}
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>{t("Gap")}</span>
          <select
            className={INPUT}
            value={value.gap}
            onChange={(e) => patch({ gap: e.target.value as ImageCopyAlternatingV1["gap"] })}
          >
            <option value="tight">{t("Tight")}</option>
            <option value="standard">{t("Standard")}</option>
            <option value="airy">{t("Airy")}</option>
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>{t("Image ratio")}</span>
          <select
            className={INPUT}
            value={value.imageRatio}
            onChange={(e) =>
              patch({ imageRatio: e.target.value as ImageCopyAlternatingV1["imageRatio"] })
            }
          >
            <option value="4/5">{t("Portrait 4:5")}</option>
            <option value="5/6">{t("Portrait 5:6 (editorial)")}</option>
            <option value="3/4">{t("Portrait 3:4")}</option>
            <option value="1/1">{t("Square 1:1")}</option>
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className={LABEL}>
            {t("Rows ({count} / 12)").replace(
              "{count}",
              String(value.items.length),
            )}
          </span>
          <button
            type="button"
            disabled={value.items.length >= 12}
            onClick={() =>
              patch({
                items: [...value.items, { title: "New row", side: "auto" }],
              })
            }
            className={`${KIT.ghostButton} disabled:opacity-50`}
          >
            {t("+ Add row")}
          </button>
        </div>
        {value.items.map((item, i) => (
          <details
            key={i}
            className="overflow-hidden rounded-lg border border-[#e5e0d5] bg-[#faf9f6] p-3"
          >
            <summary className="cursor-pointer select-none text-[13px] font-medium text-stone-700">
              {`${t("Row {n}").replace("{n}", String(i + 1))}: ${
                item.title || t("(untitled)")
              }`}
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              <input
                className={INPUT}
                placeholder={t("Eyebrow")}
                value={item.eyebrow ?? ""}
                onChange={(e) => patchItem(i, { eyebrow: e.target.value })}
              />
              <input
                className={INPUT}
                placeholder={t("Title")}
                value={item.title}
                onChange={(e) => patchItem(i, { title: e.target.value })}
              />
              <input
                className={INPUT}
                placeholder={t("Italic tagline")}
                value={item.italicTagline ?? ""}
                onChange={(e) => patchItem(i, { italicTagline: e.target.value })}
              />
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
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
                <AltTextField
                  imageUrl={item.imageUrl}
                  value={item.imageAlt ?? ""}
                  onChange={(next) =>
                    patchItem(i, { imageAlt: next || undefined })
                  }
                />
              </div>
              <textarea
                className={`${INPUT} md:col-span-2 min-h-[68px]`}
                placeholder={t("Body copy")}
                value={item.body ?? ""}
                onChange={(e) => patchItem(i, { body: e.target.value })}
              />
              <label className={FIELD}>
                <span className={LABEL}>{t("Image side")}</span>
                <select
                  className={INPUT}
                  value={item.side}
                  onChange={(e) =>
                    patchItem(i, { side: e.target.value as ImageCopyAlternatingItem["side"] })
                  }
                >
                  <option value="auto">{t("Auto (alternates)")}</option>
                  <option value="image-left">{t("Image left")}</option>
                  <option value="image-right">{t("Image right")}</option>
                </select>
              </label>
              <label className={FIELD}>
                <span className={LABEL}>
                  {t("“Ideal for” items (comma-separated)")}
                </span>
                <input
                  className={INPUT}
                  placeholder={t("Ceremonies, Editorial previews, Getting-ready")}
                  value={(item.listItems ?? []).join(", ")}
                  onChange={(e) =>
                    patchItem(i, {
                      listItems: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
            </div>
            <button
              type="button"
              disabled={value.items.length <= 1}
              onClick={() =>
                patch({ items: value.items.filter((_, j) => j !== i) })
              }
              className={`${KIT.ghostButton} mt-3 disabled:opacity-30`}
            >
              {t("Remove row")}
            </button>
          </details>
        ))}
      </div>

      <PresentationPanel
        value={value.presentation}
        onChange={(next) => patch({ presentation: next })}
      />
    </div>
  );
}
