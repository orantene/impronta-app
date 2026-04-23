"use client";

/**
 * HeroContentInspector — curated canvas-native Content tab for hero sections.
 *
 * Intentionally scoped to copy + CTAs + backdrop. Mood / overlay are on the
 * Style tab; presentation (padding, container, alignment) is on the Layout
 * tab. Slides (lifestyle reel) live inside a collapsed "Multi-slide reel"
 * accordion so the simple single-hero case isn't cluttered by list-editing
 * UI for something most operators never touch.
 *
 * Every mutation bubbles up a *whole* `HeroV1`-shaped object via onChange —
 * InspectorDock treats that as the new draft and kicks the autosave loop.
 */

import { useState } from "react";

import { MediaPicker } from "@/lib/site-admin/sections/shared/MediaPicker";

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

interface CtaShape {
  label: string;
  href: string;
}

const LABEL = "text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500";
const INPUT =
  "w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none";
const TEXTAREA = `${INPUT} resize-y leading-snug`;
const FIELD = "flex flex-col gap-1";
const SECTION_TITLE =
  "text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400";
const HINT = "text-[11px] leading-tight text-zinc-500";

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
  const secondaryCta =
    (draftProps.secondaryCta as CtaShape | undefined) ?? null;
  const slides = (draftProps.slides as HeroSlide[] | undefined) ?? [];

  // Single-hero backdrop (when no slides). Uses top-level media fields.
  const backgroundImageUrl =
    slides.length > 0
      ? (slides[0]?.backgroundImageUrl ?? "")
      : // No direct field on HeroV1 — but public Component reads from slides
        // or falls back to tenant default. Surface the first slide as the
        // backdrop control for the classic single-hero case.
        "";
  const [showSecondary, setShowSecondary] = useState(Boolean(secondaryCta));
  const [showSlides, setShowSlides] = useState(slides.length > 1);

  function update(patch: Record<string, unknown>) {
    onChange(cleanObject({ ...draftProps, ...patch } as Record<string, unknown>));
  }

  function patchPrimary(patch: Partial<CtaShape>) {
    const next: CtaShape = {
      label: patch.label ?? primaryCta?.label ?? "",
      href: patch.href ?? primaryCta?.href ?? "",
    };
    if (!next.label && !next.href) {
      update({ primaryCta: undefined });
    } else {
      update({ primaryCta: next });
    }
  }

  function patchSecondary(patch: Partial<CtaShape>) {
    const next: CtaShape = {
      label: patch.label ?? secondaryCta?.label ?? "",
      href: patch.href ?? secondaryCta?.href ?? "",
    };
    if (!next.label && !next.href) {
      update({ secondaryCta: undefined });
    } else {
      update({ secondaryCta: next });
    }
  }

  function patchBackdrop(url: string | undefined) {
    if (slides.length === 0) {
      // Seed a first slide when the operator picks a backdrop.
      if (!url) return;
      update({ slides: [cleanObject({ backgroundImageUrl: url })] });
      return;
    }
    const next = [...slides];
    next[0] = cleanObject({ ...next[0], backgroundImageUrl: url });
    update({ slides: next });
  }

  function addSlide() {
    const next = [...slides, {} as HeroSlide];
    update({ slides: next });
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
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className={SECTION_TITLE}>Copy</div>
        <div className={FIELD}>
          <label className={LABEL}>Headline</label>
          <textarea
            className={TEXTAREA}
            value={headline}
            maxLength={140}
            rows={2}
            onChange={(e) => update({ headline: e.target.value })}
          />
        </div>
        <div className={FIELD}>
          <label className={LABEL}>Sub-headline</label>
          <textarea
            className={TEXTAREA}
            value={subheadline}
            maxLength={240}
            rows={2}
            placeholder="Optional"
            onChange={(e) =>
              update({ subheadline: e.target.value || undefined })
            }
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className={SECTION_TITLE}>Primary call to action</div>
        <div className="grid grid-cols-5 gap-2">
          <input
            type="text"
            className={`${INPUT} col-span-2`}
            placeholder="Label"
            value={primaryCta?.label ?? ""}
            maxLength={60}
            onChange={(e) => patchPrimary({ label: e.target.value })}
          />
          <input
            type="text"
            className={`${INPUT} col-span-3`}
            placeholder="/path or https://…"
            value={primaryCta?.href ?? ""}
            maxLength={500}
            onChange={(e) => patchPrimary({ href: e.target.value })}
          />
        </div>
        {!showSecondary && !secondaryCta ? (
          <button
            type="button"
            onClick={() => setShowSecondary(true)}
            className="w-fit rounded-md border border-dashed border-zinc-300 px-2.5 py-1 text-[11px] font-medium text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700"
          >
            + Add secondary CTA
          </button>
        ) : (
          <>
            <div className={SECTION_TITLE}>Secondary call to action</div>
            <div className="grid grid-cols-5 gap-2">
              <input
                type="text"
                className={`${INPUT} col-span-2`}
                placeholder="Label"
                value={secondaryCta?.label ?? ""}
                maxLength={60}
                onChange={(e) => patchSecondary({ label: e.target.value })}
              />
              <input
                type="text"
                className={`${INPUT} col-span-3`}
                placeholder="/path or https://…"
                value={secondaryCta?.href ?? ""}
                maxLength={500}
                onChange={(e) => patchSecondary({ href: e.target.value })}
              />
            </div>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className={SECTION_TITLE}>Backdrop</div>
        <div className={FIELD}>
          <label className={LABEL}>Image URL</label>
          <div className="flex items-center gap-2">
            <input
              type="url"
              className={`${INPUT} flex-1`}
              placeholder="https://… or leave blank for theme default"
              value={backgroundImageUrl}
              maxLength={2048}
              onChange={(e) => patchBackdrop(e.target.value || undefined)}
            />
            {tenantId ? (
              <MediaPicker
                tenantId={tenantId}
                onPick={(url) => patchBackdrop(url)}
                label="Library"
              />
            ) : null}
          </div>
          <p className={HINT}>
            Paste a URL or pick from the workspace media library.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setShowSlides((v) => !v)}
          className="flex items-center justify-between text-left"
        >
          <span className={SECTION_TITLE}>
            Multi-slide reel {slides.length > 0 ? `(${slides.length})` : ""}
          </span>
          <span className="text-[11px] font-medium text-zinc-400">
            {showSlides ? "Hide" : "Show"}
          </span>
        </button>
        {showSlides ? (
          <div className="flex flex-col gap-3">
            {slides.length <= 1 ? (
              <p className={HINT}>
                Add a second slide to turn the hero into a cross-fade reel.
              </p>
            ) : null}
            <ol className="flex flex-col gap-2">
              {slides.map((slide, i) => (
                <li
                  key={i}
                  className="rounded-md border border-zinc-200 bg-zinc-50/60 p-2 text-xs"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-medium text-zinc-500">
                      Slide {i + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveSlide(i, -1)}
                        disabled={i === 0}
                        className="rounded border border-zinc-200 bg-white px-1.5 disabled:opacity-30"
                        aria-label="Move up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSlide(i, 1)}
                        disabled={i === slides.length - 1}
                        className="rounded border border-zinc-200 bg-white px-1.5 disabled:opacity-30"
                        aria-label="Move down"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSlide(i)}
                        className="rounded border border-rose-200 bg-white px-1.5 text-rose-600"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <input
                      type="url"
                      className={INPUT}
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
                      className={INPUT}
                      placeholder="Slide headline (optional)"
                      value={slide.headline ?? ""}
                      onChange={(e) =>
                        patchSlide(i, { headline: e.target.value || undefined })
                      }
                    />
                    <input
                      type="text"
                      className={INPUT}
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
              className="w-fit rounded-md border border-dashed border-zinc-300 px-2.5 py-1 text-[11px] font-medium text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700 disabled:opacity-40"
            >
              + Add slide
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
