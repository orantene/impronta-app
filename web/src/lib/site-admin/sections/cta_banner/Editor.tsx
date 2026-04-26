"use client";

import type { SectionEditorProps } from "../types";
import { PresentationPanel } from "../shared/PresentationPanel";
import { VariantPicker } from "../shared/VariantPicker";
import { MediaPicker } from "../shared/MediaPicker";
import { LinkPicker } from "../shared/LinkPicker";
import { AltTextField } from "../shared/AltTextField";
import type { CtaBannerV1 } from "./schema";

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT =
  "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";
const HINT = "text-xs text-muted-foreground";

export function CtaBannerEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<CtaBannerV1>) {
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
          <span className={LABEL}>Eyebrow</span>
          <input
            className={INPUT}
            maxLength={60}
            placeholder="Ready when you are"
            value={value.eyebrow ?? ""}
            onChange={(e) => patch({ eyebrow: e.target.value })}
          />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Headline *</span>
          <input
            className={INPUT}
            maxLength={160}
            placeholder="Tell us about your celebration."
            value={value.headline}
            onChange={(e) => patch({ headline: e.target.value })}
          />
        </label>
      </div>

      <label className={FIELD}>
        <span className={LABEL}>Copy</span>
        <textarea
          className={`${INPUT} min-h-[68px]`}
          maxLength={320}
          placeholder="Share a few details and your concierge will return a curated team."
          value={value.copy ?? ""}
          onChange={(e) => patch({ copy: e.target.value })}
        />
      </label>

      <label className={FIELD}>
        <span className={LABEL}>Reassurance (italic)</span>
        <input
          className={INPUT}
          maxLength={120}
          placeholder="Quiet, unhurried, always in the same key."
          value={value.reassurance ?? ""}
          onChange={(e) => patch({ reassurance: e.target.value })}
        />
      </label>

      {/* ── CTAs ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className={FIELD}>
          <span className={LABEL}>Primary CTA</span>
          <input
            className={INPUT}
            placeholder="Label"
            value={value.primaryCta?.label ?? ""}
            onChange={(e) =>
              patch({
                primaryCta: e.target.value
                  ? {
                      label: e.target.value,
                      href: value.primaryCta?.href ?? "/contact",
                    }
                  : undefined,
              })
            }
          />
          <LinkPicker
            value={value.primaryCta?.href ?? ""}
            onChange={(next) =>
              patch({
                primaryCta: value.primaryCta
                  ? { ...value.primaryCta, href: next }
                  : next
                    ? { label: "CTA", href: next }
                    : undefined,
              })
            }
          />
        </div>
        <div className={FIELD}>
          <span className={LABEL}>Secondary CTA</span>
          <input
            className={INPUT}
            placeholder="Label (optional)"
            value={value.secondaryCta?.label ?? ""}
            onChange={(e) =>
              patch({
                secondaryCta: e.target.value
                  ? {
                      label: e.target.value,
                      href: value.secondaryCta?.href ?? "/",
                    }
                  : undefined,
              })
            }
          />
          <LinkPicker
            value={value.secondaryCta?.href ?? ""}
            onChange={(next) =>
              patch({
                secondaryCta: value.secondaryCta
                  ? { ...value.secondaryCta, href: next }
                  : undefined,
              })
            }
          />
        </div>
      </div>

      {/* ── Presentation ───────────────────────────────────── */}
      <VariantPicker
        name="cta_banner.variant"
        legend="Variant"
        sectionKey="cta_banner"
        options={[
          {
            value: "centered-overlay",
            label: "Centered overlay",
            hint: "Full-bleed image, text centered over it.",
            schematic: "overlay",
          },
          {
            value: "split-image",
            label: "Split image",
            hint: "Image on one side, text + CTAs on the other.",
            schematic: "split",
          },
          {
            value: "minimal-band",
            label: "Minimal band",
            hint: "Flat band — no image. Great for high-density pages.",
            schematic: "band",
          },
        ]}
        value={value.variant}
        onChange={(next) => patch({ variant: next })}
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className={FIELD}>
          <span className={LABEL}>Image side (split)</span>
          <select
            className={INPUT}
            value={value.imageSide}
            disabled={value.variant !== "split-image"}
            onChange={(e) =>
              patch({ imageSide: e.target.value as CtaBannerV1["imageSide"] })
            }
          >
            <option value="right">Right</option>
            <option value="left">Left</option>
          </select>
        </label>

        <label className={FIELD}>
          <span className={LABEL}>Band tone (minimal)</span>
          <select
            className={INPUT}
            value={value.bandTone}
            disabled={value.variant !== "minimal-band"}
            onChange={(e) =>
              patch({ bandTone: e.target.value as CtaBannerV1["bandTone"] })
            }
          >
            <option value="ivory">Ivory</option>
            <option value="champagne">Champagne</option>
            <option value="espresso">Espresso</option>
            <option value="blush">Blush</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className={FIELD}>
          <span className={LABEL}>Background image URL</span>
          <div className="flex items-center gap-2">
            <input
              className={`${INPUT} flex-1`}
              maxLength={2048}
              placeholder="https://… (or leave blank)"
              value={value.backgroundImageUrl ?? ""}
              onChange={(e) =>
                patch({ backgroundImageUrl: e.target.value || undefined })
              }
            />
            {tenantId ? (
              <MediaPicker
                tenantId={tenantId}
                onPick={(url) => patch({ backgroundImageUrl: url })}
                label="Library"
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
          <span className={LABEL}>Overlay darkness (0–100)</span>
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
          <span className="text-sm">Render as inset card</span>
        </label>
      </div>

      <PresentationPanel
        value={value.presentation}
        onChange={(next) => patch({ presentation: next })}
      />
    </div>
  );
}
