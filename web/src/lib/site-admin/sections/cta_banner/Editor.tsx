"use client";

import type { SectionEditorProps } from "../types";
import { PresentationPanel } from "../shared/PresentationPanel";
import { VariantPicker } from "../shared/VariantPicker";
import { MediaPicker } from "../shared/MediaPicker";
import { LinkKindPicker } from "../shared/LinkKindPicker";
import { AltTextField } from "../shared/AltTextField";
import { useSectionT } from "../shared/section-editor-i18n";
import { RichEditor } from "@/components/edit-chrome/rich-editor";
import { coerceLegacyHref } from "../../links/link-ref";
import type { CtaBannerV1 } from "./schema";

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT =
  "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";

export function CtaBannerEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<CtaBannerV1>) {
  const t = useSectionT();
  const value: CtaBannerV1 = {
    eyebrow: initial.eyebrow ?? "",
    headline: initial.headline ?? "Tell us about your celebration.",
    copy: initial.copy ?? "",
    reassurance: initial.reassurance ?? "",
    primaryCta: initial.primaryCta,
    secondaryCta: initial.secondaryCta,
    backgroundMediaAssetId: initial.backgroundMediaAssetId,
    backgroundImageUrl: initial.backgroundImageUrl ?? "",
    backgroundImageAlt: initial.backgroundImageAlt ?? "",
    overlayOpacity: initial.overlayOpacity ?? 45,
    variant: initial.variant ?? "centered-overlay",
    imageSide: initial.imageSide ?? "right",
    bandTone: initial.bandTone ?? "ivory",
    insetCard: initial.insetCard ?? true,
    presentation: initial.presentation,
  };
  const patch = (p: Partial<CtaBannerV1>) => onChange({ ...value, ...p });

  return (
    <div className="flex flex-col gap-4">
      {/* ── Copy ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>{t("Eyebrow")}</span>
          <input
            className={INPUT}
            maxLength={60}
            placeholder={t("Ready when you are")}
            value={value.eyebrow ?? ""}
            onChange={(e) => patch({ eyebrow: e.target.value })}
          />
        </label>
        <div className={FIELD}>
          <span className={LABEL}>{t("Headline *")}</span>
          <RichEditor
            value={value.headline}
            onChange={(next) => patch({ headline: next })}
            variant="single"
            tenantId={tenantId}
            placeholder={t("Tell us about your celebration.")}
            ariaLabel={t("Headline")}
          />
        </div>
      </div>

      <div className={FIELD}>
        <span className={LABEL}>{t("Copy")}</span>
        <RichEditor
          value={value.copy ?? ""}
          onChange={(next) => patch({ copy: next || undefined })}
          variant="multi"
          tenantId={tenantId}
          placeholder={t(
            "Share a few details and your concierge will return a curated team.",
          )}
          ariaLabel={t("Copy")}
        />
      </div>

      <div className={FIELD}>
        <span className={LABEL}>{t("Reassurance (italic)")}</span>
        <RichEditor
          value={value.reassurance ?? ""}
          onChange={(next) => patch({ reassurance: next || undefined })}
          variant="single"
          tenantId={tenantId}
          placeholder={t("Quiet, unhurried, always in the same key.")}
          ariaLabel={t("Reassurance")}
        />
      </div>

      {/* ── CTAs ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className={FIELD}>
          <span className={LABEL}>{t("Primary CTA")}</span>
          <input
            className={INPUT}
            placeholder={t("Label")}
            value={value.primaryCta?.label ?? ""}
            onChange={(e) =>
              patch({
                primaryCta: e.target.value
                  ? {
                      label: e.target.value,
                      href:
                        value.primaryCta?.href ?? coerceLegacyHref("/contact"),
                    }
                  : undefined,
              })
            }
          />
          <LinkKindPicker
            value={value.primaryCta?.href}
            tenantId={tenantId}
            onChange={(next) =>
              patch({
                primaryCta: value.primaryCta
                  ? { ...value.primaryCta, href: next }
                  : { label: "CTA", href: next },
              })
            }
          />
        </div>
        <div className={FIELD}>
          <span className={LABEL}>{t("Secondary CTA")}</span>
          <input
            className={INPUT}
            placeholder={t("Label (optional)")}
            value={value.secondaryCta?.label ?? ""}
            onChange={(e) =>
              patch({
                secondaryCta: e.target.value
                  ? {
                      label: e.target.value,
                      href: value.secondaryCta?.href ?? coerceLegacyHref("/"),
                    }
                  : undefined,
              })
            }
          />
          <LinkKindPicker
            value={value.secondaryCta?.href}
            tenantId={tenantId}
            onChange={(next) =>
              patch({
                secondaryCta: value.secondaryCta
                  ? { ...value.secondaryCta, href: next }
                  : { label: "CTA", href: next },
              })
            }
          />
        </div>
      </div>

      {/* ── Presentation ───────────────────────────────────── */}
      <VariantPicker
        name="cta_banner.variant"
        legend={t("Variant")}
        sectionKey="cta_banner"
        options={[
          {
            value: "centered-overlay",
            label: t("Centered overlay"),
            hint: t("Full-bleed image, text centered over it."),
            schematic: "overlay",
          },
          {
            value: "split-image",
            label: t("Split image"),
            hint: t("Image on one side, text + CTAs on the other."),
            schematic: "split",
          },
          {
            value: "minimal-band",
            label: t("Minimal band"),
            hint: t("Flat band, no image. Great for high-density pages."),
            schematic: "band",
          },
        ]}
        value={value.variant}
        onChange={(next) => patch({ variant: next })}
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>{t("Image side (split)")}</span>
          <select
            className={INPUT}
            value={value.imageSide}
            disabled={value.variant !== "split-image"}
            onChange={(e) =>
              patch({ imageSide: e.target.value as CtaBannerV1["imageSide"] })
            }
          >
            <option value="right">{t("Right")}</option>
            <option value="left">{t("Left")}</option>
          </select>
        </label>

        <label className={FIELD}>
          <span className={LABEL}>{t("Band tone (minimal)")}</span>
          <select
            className={INPUT}
            value={value.bandTone}
            disabled={value.variant !== "minimal-band"}
            onChange={(e) =>
              patch({ bandTone: e.target.value as CtaBannerV1["bandTone"] })
            }
          >
            <option value="ivory">{t("Ivory")}</option>
            <option value="champagne">{t("Champagne")}</option>
            <option value="espresso">{t("Espresso")}</option>
            <option value="blush">{t("Blush")}</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className={FIELD}>
          <span className={LABEL}>{t("Background image URL")}</span>
          <div className="flex items-center gap-2">
            <input
              className={`${INPUT} flex-1`}
              maxLength={2048}
              placeholder={t("https://… (or leave blank)")}
              value={value.backgroundImageUrl ?? ""}
              onChange={(e) =>
                patch({ backgroundImageUrl: e.target.value || undefined })
              }
            />
            {tenantId ? (
              <MediaPicker
                tenantId={tenantId}
                onPick={(url) => patch({ backgroundImageUrl: url })}
                label={t("Library")}
              />
            ) : null}
          </div>
          <div className="mt-2">
            <AltTextField
              imageUrl={value.backgroundImageUrl}
              value={value.backgroundImageAlt ?? ""}
              onChange={(next) => patch({ backgroundImageAlt: next })}
            />
          </div>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>{t("Overlay darkness (0–100)")}</span>
          <input
            className={INPUT}
            type="number"
            min={0}
            max={100}
            value={value.overlayOpacity ?? 45}
            onChange={(e) =>
              patch({
                overlayOpacity: Math.max(0, Math.min(100, Number(e.target.value))),
              })
            }
          />
        </label>
        <label className="flex items-end gap-2">
          <input
            type="checkbox"
            checked={value.insetCard}
            onChange={(e) => patch({ insetCard: e.target.checked })}
          />
          <span className="text-sm">{t("Render as inset card")}</span>
        </label>
      </div>

      <PresentationPanel
        value={value.presentation}
        onChange={(next) => patch({ presentation: next })}
      />
    </div>
  );
}
