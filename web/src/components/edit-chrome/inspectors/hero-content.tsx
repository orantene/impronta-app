"use client";

/**
 * HeroContentInspector — curated canvas-native Content tab for hero sections.
 *
 * Scoped to copy + CTAs + backdrop. Mood/overlay are on the Style tab;
 * presentation (padding, container, alignment) is on the Layout tab. The
 * multi-slide reel lives behind a collapsed Card so the simple single-hero
 * case isn't cluttered by list-editing UI.
 *
 * Built with the kit primitives (Card / Field / Helper / MediaPickerButton /
 * CtaDuoEditor) so the panel matches the visual quality of all other
 * curated inspectors.
 */

import { useState } from "react";

import { Card, CardHead, CardBody } from "../kit";
import {
  Field,
  FieldLabel,
  Helper,
  HelperCounter,
} from "../kit";
import {
  CtaDuoEditor,
  MediaPickerButton,
  type CtaShape,
} from "./kit";
import { KIT } from "./kit/tokens";
import { RichEditor } from "@/components/edit-chrome/rich-editor";

interface HeroContentProps {
  draftProps: Record<string, unknown>;
  tenantId: string;
  onChange: (next: Record<string, unknown>) => void;
}

interface HeroSlide {
  eyebrow?: string;
  headline?: string;
  subheadline?: string;
  backgroundImageUrl?: string;
  backgroundMediaAssetId?: string;
  overlayOpacity?: number;
}

function cleanObject<T extends Record<string, unknown>>(o: T): T {
  const out = { ...o };
  for (const k of Object.keys(out)) {
    const v = out[k as keyof T];
    if (v === "" || v === null || v === undefined) delete out[k as keyof T];
  }
  return out;
}

export function HeroContentInspector({
  draftProps,
  tenantId,
  onChange,
}: HeroContentProps) {
  const headline = (draftProps.headline as string | undefined) ?? "";
  const subheadline = (draftProps.subheadline as string | undefined) ?? "";
  const primaryCta = (draftProps.primaryCta as CtaShape | undefined) ?? null;
  const secondaryCta = (draftProps.secondaryCta as CtaShape | undefined) ?? null;
  const slides = (draftProps.slides as HeroSlide[] | undefined) ?? [];

  // Single-hero backdrop: surface the first slide's image as the main control.
  const backdropUrl =
    slides.length > 0 ? (slides[0]?.backgroundImageUrl ?? null) : null;

  const [showSlides, setShowSlides] = useState(slides.length > 1);

  function update(patch: Record<string, unknown>) {
    onChange(cleanObject({ ...draftProps, ...patch } as Record<string, unknown>));
  }

  function patchBackdrop(url: string | null) {
    if (!url) {
      if (slides.length === 0) return;
      const next = [...slides];
      next[0] = cleanObject({ ...next[0], backgroundImageUrl: undefined });
      update({ slides: next.length ? next : undefined });
      return;
    }
    if (slides.length === 0) {
      update({ slides: [cleanObject({ backgroundImageUrl: url })] });
      return;
    }
    const next = [...slides];
    next[0] = cleanObject({ ...next[0], backgroundImageUrl: url });
    update({ slides: next });
  }

  function addSlide() {
    update({ slides: [...slides, {} as HeroSlide] });
    setShowSlides(true);
  }

  function removeSlide(i: number) {
    const next = slides.filter((_, idx) => idx !== i);
    update({ slides: next.length ? next : undefined });
  }

  function moveSlide(i: number, delta: -1 | 1) {
    const j = i + delta;
    if (j < 0 || j >= slides.length) return;
    const next = [...slides];
    [next[i], next[j]] = [next[j], next[i]];
    update({ slides: next });
  }

  function patchSlide(i: number, patch: Partial<HeroSlide>) {
    const next = [...slides];
    next[i] = cleanObject({ ...next[i], ...patch });
    update({ slides: next });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ── Copy ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHead title="Copy" />
        <CardBody>
          <div className="flex flex-col gap-3">
            <Field>
              <FieldLabel>Headline</FieldLabel>
              <RichEditor
                value={headline}
                onChange={(next) => update({ headline: next })}
                variant="single"
                tenantId={tenantId}
                ariaLabel="Headline"
              />
              <Helper><span /><HelperCounter current={headline.length} max={140} /></Helper>
            </Field>

            <Field>
              <FieldLabel>Sub-headline</FieldLabel>
              <RichEditor
                value={subheadline}
                onChange={(next) => update({ subheadline: next || undefined })}
                variant="single"
                tenantId={tenantId}
                placeholder="Optional"
                ariaLabel="Sub-headline"
              />
              {subheadline ? (
                <Helper><span /><HelperCounter current={subheadline.length} max={240} /></Helper>
              ) : null}
            </Field>
          </div>
        </CardBody>
      </Card>

      {/* ── Calls to action ──────────────────────────────────────────── */}
      <Card>
        <CardHead title="Calls to action" />
        <CardBody>
          <CtaDuoEditor
            primary={primaryCta}
            secondary={secondaryCta}
            onChangePrimary={(next) =>
              update({ primaryCta: next ?? undefined })
            }
            onChangeSecondary={(next) =>
              update({ secondaryCta: next ?? undefined })
            }
            secondaryAddLabel="Add secondary button"
          />
        </CardBody>
      </Card>

      {/* ── Backdrop ─────────────────────────────────────────────────── */}
      <Card>
        <CardHead title="Backdrop" />
        <CardBody>
          <MediaPickerButton
            tenantId={tenantId}
            value={backdropUrl}
            onChange={patchBackdrop}
            emptyLabel="Add backdrop image"
            aspect="16/9"
          />
          <Helper>Paste a URL or pick from the workspace media library.</Helper>
        </CardBody>
      </Card>

      {/* ── Multi-slide reel (collapsed by default) ───────────────────── */}
      <Card>
        <CardHead
          title={
            slides.length > 1
              ? `Multi-slide reel (${slides.length})`
              : "Multi-slide reel"
          }
          action={
            <button
              type="button"
              className={KIT.subtleButton}
              onClick={() => setShowSlides((v) => !v)}
            >
              {showSlides ? "Hide" : "Show"}
            </button>
          }
        />
        {showSlides ? (
          <CardBody>
            {slides.length <= 1 ? (
              <Helper>
                Add a second slide to turn the hero into a cross-fade reel.
              </Helper>
            ) : null}
            <ol className="mt-2 flex flex-col gap-2">
              {slides.map((slide, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-[#e5e0d5] bg-[#faf9f6]/60 p-2.5 text-xs"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-semibold text-zinc-600">
                      Slide {i + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveSlide(i, -1)}
                        disabled={i === 0}
                        className={`${KIT.subtleButton} px-1.5 disabled:opacity-30`}
                        aria-label="Move up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSlide(i, 1)}
                        disabled={i === slides.length - 1}
                        className={`${KIT.subtleButton} px-1.5 disabled:opacity-30`}
                        aria-label="Move down"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSlide(i)}
                        className="rounded border border-rose-200 bg-white px-1.5 py-0.5 text-[11px] text-rose-600 hover:bg-rose-50"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <input
                      type="url"
                      className={KIT.input}
                      placeholder="Image URL"
                      value={slide.backgroundImageUrl ?? ""}
                      onChange={(e) =>
                        patchSlide(i, {
                          backgroundImageUrl: e.target.value || undefined,
                        })
                      }
                    />
                    <input
                      type="text"
                      className={KIT.input}
                      placeholder="Slide headline (optional)"
                      value={slide.headline ?? ""}
                      onChange={(e) =>
                        patchSlide(i, { headline: e.target.value || undefined })
                      }
                    />
                    <input
                      type="text"
                      className={KIT.input}
                      placeholder="Slide sub-headline (optional)"
                      value={slide.subheadline ?? ""}
                      onChange={(e) =>
                        patchSlide(i, {
                          subheadline: e.target.value || undefined,
                        })
                      }
                    />
                  </div>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={addSlide}
              disabled={slides.length >= 8}
              className={`${KIT.ghostButton} mt-2 w-fit disabled:opacity-40`}
            >
              + Add slide
            </button>
          </CardBody>
        ) : null}
      </Card>
    </div>
  );
}
