"use client";

/**
 * CtaBannerContentInspector — bespoke Content tab for the cta_banner section.
 *
 * Operator intent: they're deciding the tone of a conversion block (calm
 * band vs. overlay vs. split-image) and writing a message + buttons. So
 * the panel leads with:
 *   1. Copy (eyebrow, headline, copy, reassurance) — the message is the product.
 *   2. Buttons via the shared CtaDuoEditor (primary filled, secondary ghost).
 *   3. Layout style as a three-option VisualChipGroup with real mini-wireframes.
 *   4. Background — conditional on variant: image variants show the picker,
 *      band variant shows tone swatches. No dropdowns surfaced to the operator.
 *   5. Advanced — inset-card toggle, image side, overlay opacity.
 */

import {
  KIT,
  InspectorGroup,
  VisualChipGroup,
  MediaPickerButton,
  CtaDuoEditor,
  type CtaShape,
} from "./kit";
import { RichEditor } from "@/components/edit-chrome/rich-editor";

type Variant = "centered-overlay" | "split-image" | "minimal-band";
type BandTone = "ivory" | "champagne" | "espresso" | "blush";
type ImageSide = "left" | "right";

interface Props {
  draftProps: Record<string, unknown>;
  tenantId: string;
  onChange: (next: Record<string, unknown>) => void;
}

const VARIANT_OPTIONS = [
  {
    value: "centered-overlay" as const,
    label: "Overlay",
    info: "Full-width image with text centered on top. Most dramatic.",
  },
  {
    value: "split-image" as const,
    label: "Split",
    info: "Image on one side, copy and buttons on the other. Editorial feel.",
  },
  {
    value: "minimal-band" as const,
    label: "Band",
    info: "Solid tone, no image. Calm, type-forward.",
  },
];

const BAND_TONES: ReadonlyArray<{ value: BandTone; hex: string; label: string }> = [
  { value: "ivory", hex: "#F4EFE6", label: "Ivory" },
  { value: "champagne", hex: "#E4C896", label: "Champagne" },
  { value: "espresso", hex: "#2E201A", label: "Espresso" },
  { value: "blush", hex: "#EAB7B0", label: "Blush" },
];

function cleanObject<T extends Record<string, unknown>>(o: T): T {
  const out = { ...o };
  for (const k of Object.keys(out)) {
    const v = out[k as keyof T];
    if (v === "" || v === null || v === undefined) delete out[k as keyof T];
  }
  return out;
}

export function CtaBannerContentInspector({
  draftProps,
  tenantId,
  onChange,
}: Props) {
  const eyebrow = (draftProps.eyebrow as string | undefined) ?? "";
  const headline = (draftProps.headline as string | undefined) ?? "";
  const copy = (draftProps.copy as string | undefined) ?? "";
  const reassurance = (draftProps.reassurance as string | undefined) ?? "";
  const primaryCta = (draftProps.primaryCta as CtaShape | undefined) ?? null;
  const secondaryCta = (draftProps.secondaryCta as CtaShape | undefined) ?? null;
  const variant = (draftProps.variant as Variant | undefined) ?? "centered-overlay";
  const bandTone = (draftProps.bandTone as BandTone | undefined) ?? "ivory";
  const imageSide = (draftProps.imageSide as ImageSide | undefined) ?? "right";
  const backgroundImageUrl =
    (draftProps.backgroundImageUrl as string | undefined) ?? "";
  const overlayOpacity =
    (draftProps.overlayOpacity as number | undefined) ?? 40;
  const insetCard = (draftProps.insetCard as boolean | undefined) ?? true;

  function update(patch: Record<string, unknown>) {
    onChange(cleanObject({ ...draftProps, ...patch }));
  }

  const usesImage = variant === "centered-overlay" || variant === "split-image";

  return (
    <div className="flex flex-col gap-6">
      <InspectorGroup title="Message">
        <div className={KIT.field}>
          <label className={KIT.label}>Eyebrow</label>
          <input
            type="text"
            className={KIT.input}
            placeholder="Optional — e.g. Ready when you are"
            maxLength={60}
            value={eyebrow}
            onChange={(e) => update({ eyebrow: e.target.value || undefined })}
          />
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>Headline</label>
          <RichEditor
            value={headline}
            onChange={(next) => update({ headline: next })}
            variant="single"
            tenantId={tenantId}
            placeholder="The decisive line. Keep it short."
            ariaLabel="Headline"
          />
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>Supporting copy</label>
          <RichEditor
            value={copy}
            onChange={(next) => update({ copy: next || undefined })}
            variant="multi"
            tenantId={tenantId}
            placeholder="Optional — one reassuring paragraph under the headline"
            ariaLabel="Supporting copy"
          />
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>Reassurance line</label>
          <RichEditor
            value={reassurance}
            onChange={(next) => update({ reassurance: next || undefined })}
            variant="single"
            tenantId={tenantId}
            placeholder="Optional — italic line below the buttons"
            ariaLabel="Reassurance line"
          />
        </div>
      </InspectorGroup>

      <InspectorGroup title="Buttons">
        <CtaDuoEditor
          primary={primaryCta}
          secondary={secondaryCta}
          onChangePrimary={(next) => update({ primaryCta: next ?? undefined })}
          onChangeSecondary={(next) =>
            update({ secondaryCta: next ?? undefined })
          }
        />
      </InspectorGroup>

      <InspectorGroup
        title="Layout style"
        info="Picks the visual treatment. Each option previews how the block reads."
      >
        <VisualChipGroup<Variant>
          value={variant}
          onChange={(v) => update({ variant: v })}
          options={VARIANT_OPTIONS.map((opt) => ({
            ...opt,
            preview: <VariantPreview value={opt.value} />,
          }))}
        />
      </InspectorGroup>

      {usesImage ? (
        <InspectorGroup title="Background image">
          <MediaPickerButton
            tenantId={tenantId}
            value={backgroundImageUrl}
            onChange={(url) =>
              update({ backgroundImageUrl: url ?? undefined })
            }
            emptyLabel="Add background image"
            aspect="21/9"
          />
          {variant === "centered-overlay" ? (
            <div className={KIT.field}>
              <label className={KIT.label}>
                Overlay darkness — {overlayOpacity}%
              </label>
              <input
                type="range"
                min={0}
                max={80}
                step={5}
                value={overlayOpacity}
                onChange={(e) =>
                  update({ overlayOpacity: Number(e.target.value) })
                }
                className="w-full accent-zinc-900"
              />
            </div>
          ) : null}
        </InspectorGroup>
      ) : (
        <InspectorGroup title="Tone">
          <div className="grid grid-cols-4 gap-2">
            {BAND_TONES.map((t) => {
              const active = t.value === bandTone;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => update({ bandTone: t.value })}
                  className={`flex flex-col items-stretch gap-1.5 rounded-lg border p-1.5 text-left transition ${
                    active
                      ? "border-zinc-900 shadow-[0_0_0_1px_rgba(24,24,27,0.9)]"
                      : "border-zinc-200 hover:border-zinc-400"
                  }`}
                >
                  <span
                    aria-hidden
                    className="block h-10 rounded-md"
                    style={{ background: t.hex }}
                  />
                  <span className="px-0.5 text-[11px] font-semibold text-zinc-700">
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>
        </InspectorGroup>
      )}

      <InspectorGroup
        title="Advanced"
        advanced
        collapsible
        storageKey="cta_banner:advanced"
      >
        <label className="flex items-center gap-2 text-[12px] text-zinc-700">
          <input
            type="checkbox"
            checked={insetCard}
            onChange={(e) => update({ insetCard: e.target.checked })}
            className="size-3.5 accent-zinc-900"
          />
          Inset card — wraps the banner in a bordered card
        </label>
        {variant === "split-image" ? (
          <div className={KIT.field}>
            <label className={KIT.label}>Image side</label>
            <VisualChipGroup<ImageSide>
              value={imageSide}
              onChange={(v) => update({ imageSide: v })}
              options={[
                {
                  value: "left",
                  label: "Image left",
                  preview: <SplitSidePreview side="left" />,
                },
                {
                  value: "right",
                  label: "Image right",
                  preview: <SplitSidePreview side="right" />,
                },
              ]}
              columns={2}
            />
          </div>
        ) : null}
      </InspectorGroup>
    </div>
  );
}

// ── preview glyphs ────────────────────────────────────────────────────────

function VariantPreview({ value }: { value: Variant }) {
  const common = "w-[72px] h-[38px]";
  if (value === "centered-overlay") {
    return (
      <svg viewBox="0 0 72 38" className={common} aria-hidden>
        <rect x="1" y="1" width="70" height="36" rx="4" className="fill-zinc-300" />
        <rect x="1" y="1" width="70" height="36" rx="4" className="fill-zinc-900/30" />
        <rect x="18" y="14" width="36" height="3" rx="1" className="fill-white/80" />
        <rect x="24" y="21" width="24" height="2" rx="1" className="fill-white/60" />
        <rect x="26" y="27" width="20" height="4" rx="2" className="fill-white" />
      </svg>
    );
  }
  if (value === "split-image") {
    return (
      <svg viewBox="0 0 72 38" className={common} aria-hidden>
        <rect x="1" y="1" width="36" height="36" rx="3" className="fill-zinc-400/70" />
        <rect x="40" y="10" width="26" height="3" rx="1" className="fill-zinc-600" />
        <rect x="40" y="17" width="22" height="2" rx="1" className="fill-zinc-400" />
        <rect x="40" y="24" width="14" height="4" rx="2" className="fill-zinc-900" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 72 38" className={common} aria-hidden>
      <rect x="1" y="1" width="70" height="36" rx="4" className="fill-zinc-100" />
      <rect x="18" y="12" width="36" height="3" rx="1" className="fill-zinc-700" />
      <rect x="22" y="19" width="28" height="2" rx="1" className="fill-zinc-400" />
      <rect x="28" y="26" width="16" height="4" rx="2" className="fill-zinc-900" />
    </svg>
  );
}

function SplitSidePreview({ side }: { side: "left" | "right" }) {
  return (
    <svg viewBox="0 0 72 38" className="w-[72px] h-[38px]" aria-hidden>
      {side === "left" ? (
        <>
          <rect x="1" y="1" width="32" height="36" rx="3" className="fill-zinc-400" />
          <rect x="38" y="12" width="28" height="3" rx="1" className="fill-zinc-600" />
          <rect x="38" y="19" width="24" height="2" rx="1" className="fill-zinc-400" />
          <rect x="38" y="26" width="16" height="4" rx="2" className="fill-zinc-900" />
        </>
      ) : (
        <>
          <rect x="39" y="1" width="32" height="36" rx="3" className="fill-zinc-400" />
          <rect x="6" y="12" width="28" height="3" rx="1" className="fill-zinc-600" />
          <rect x="6" y="19" width="24" height="2" rx="1" className="fill-zinc-400" />
          <rect x="6" y="26" width="16" height="4" rx="2" className="fill-zinc-900" />
        </>
      )}
    </svg>
  );
}
