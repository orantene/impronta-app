"use client";

import { useState, type ChangeEvent } from "react";
import type { SectionEditorProps } from "../types";
import { PresentationPanel } from "../shared/PresentationPanel";
import { MediaPicker } from "../shared/MediaPicker";
import { AltTextField } from "../shared/AltTextField";
import { BlueprintPicker } from "../shared/BlueprintPicker";
import { RichEditor } from "@/components/edit-chrome/rich-editor";
import type { HeroSlide, HeroV1 } from "./schema";

type OverlayFlavor = NonNullable<HeroV1["overlay"]>;
type MoodPreset = NonNullable<HeroV1["mood"]>;

const OVERLAY_OPTIONS: ReadonlyArray<{
  value: OverlayFlavor;
  label: string;
  hint: string;
}> = [
  { value: "none", label: "None", hint: "Raw image, no darkening." },
  {
    value: "gradient-scrim",
    label: "Gradient scrim",
    hint: "Top-to-bottom darkening for photographic backdrops.",
  },
  {
    value: "aurora",
    label: "Aurora",
    hint: "Tenant-palette tinted wash — editorial glow.",
  },
  {
    value: "soft-vignette",
    label: "Soft vignette",
    hint: "Gentle edge darkening; keeps the center bright.",
  },
];

const MOOD_OPTIONS: ReadonlyArray<{
  value: MoodPreset;
  label: string;
  hint: string;
}> = [
  { value: "clean", label: "Clean", hint: "Compact type, tight rhythm." },
  {
    value: "editorial",
    label: "Editorial",
    hint: "Serif display, generous spacing.",
  },
  {
    value: "cinematic",
    label: "Cinematic",
    hint: "Oversized type, dramatic spacing — pairs with slider.",
  },
];

const FIELD = "flex flex-col gap-1.5 text-sm";
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const INPUT =
  "w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm";
const HINT = "text-xs text-muted-foreground";

/**
 * Hero section editor.
 *
 * Exposes the full v1 hero shape: copy (headline/subheadline), optional CTAs,
 * and the lifestyle/slider extensions (overlay, mood, autoplay, slides[]).
 *
 * Slides are an ordered list; 2+ entries switch the public render to the
 * auto-advancing CSS slider. Each slide can override copy or leave it blank
 * to act as a pure background frame.
 */
export function HeroEditor({
  initial,
  onChange,
  tenantId,
}: SectionEditorProps<HeroV1>) {
  const [state, setState] = useState<HeroV1>(initial);

  function commit(next: HeroV1) {
    setState(next);
    onChange(next);
  }

  function update<K extends keyof HeroV1>(key: K, value: HeroV1[K]) {
    commit({ ...state, [key]: value });
  }

  function updateSlides(slides: HeroSlide[] | undefined) {
    commit({ ...state, slides: slides && slides.length > 0 ? slides : undefined });
  }

  function addSlide() {
    const next = [...(state.slides ?? []), {} as HeroSlide];
    updateSlides(next);
  }

  function removeSlide(index: number) {
    const next = (state.slides ?? []).filter((_, i) => i !== index);
    updateSlides(next);
  }

  function moveSlide(index: number, delta: -1 | 1) {
    const target = index + delta;
    const arr = [...(state.slides ?? [])];
    if (target < 0 || target >= arr.length) return;
    [arr[index], arr[target]] = [arr[target], arr[index]];
    updateSlides(arr);
  }

  function patchSlide(index: number, patch: Partial<HeroSlide>) {
    const arr = [...(state.slides ?? [])];
    const base = arr[index] ?? {};
    const merged: HeroSlide = { ...base, ...patch };
    for (const k of Object.keys(merged) as (keyof HeroSlide)[]) {
      const v = merged[k];
      if (v === "" || v === undefined || v === null) delete merged[k];
    }
    arr[index] = merged;
    updateSlides(arr);
  }

  const slides = state.slides ?? [];
  const autoplayValue =
    typeof state.autoplayMs === "number" ? String(state.autoplayMs) : "";

  return (
    <div className="flex flex-col gap-6 text-sm">
      <BlueprintPicker
        sectionTypeKey="hero"
        current={state}
        onApply={(next) => commit(next)}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <div className={FIELD}>
          <span className={LABEL}>Headline</span>
          <RichEditor
            value={state.headline ?? ""}
            onChange={(next) => update("headline", next)}
            variant="single"
            tenantId={tenantId}
            ariaLabel="Headline"
          />
        </div>
        <div className={FIELD}>
          <span className={LABEL}>Sub-headline</span>
          <RichEditor
            value={state.subheadline ?? ""}
            onChange={(next) => update("subheadline", next || undefined)}
            variant="single"
            tenantId={tenantId}
            ariaLabel="Sub-headline"
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-4 rounded-md border border-border/60 p-4">
        <legend className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Visual treatment
        </legend>
        <div className="grid gap-4 md:grid-cols-2">
          <label className={FIELD}>
            <span className={LABEL}>Mood</span>
            <select
              className={INPUT}
              value={state.mood ?? ""}
              onChange={(e) =>
                update(
                  "mood",
                  (e.target.value || undefined) as MoodPreset | undefined,
                )
              }
            >
              <option value="">Default (clean)</option>
              {MOOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className={HINT}>
              {MOOD_OPTIONS.find((o) => o.value === state.mood)?.hint ??
                "Drives type scale + spacing rhythm."}
            </span>
          </label>
          <label className={FIELD}>
            <span className={LABEL}>Overlay</span>
            <select
              className={INPUT}
              value={state.overlay ?? ""}
              onChange={(e) =>
                update(
                  "overlay",
                  (e.target.value || undefined) as OverlayFlavor | undefined,
                )
              }
            >
              <option value="">Default (gradient scrim)</option>
              {OVERLAY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className={HINT}>
              {OVERLAY_OPTIONS.find((o) => o.value === state.overlay)?.hint ??
                "Applied above slide imagery, behind copy."}
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 rounded-md border border-border/60 p-4">
        <legend className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Slides — lifestyle reel
        </legend>
        <p className={HINT}>
          One slide renders as a static hero. Two or more slides trigger the
          auto-advancing cross-fade reel. Max 8 slides.
        </p>

        {slides.length === 0 ? (
          <p className="rounded-md bg-muted/30 px-3 py-4 text-xs text-muted-foreground">
            No slides yet — the hero will fall back to CMS copy with the
            tenant&rsquo;s default visual treatment.
          </p>
        ) : (
          <ol className="flex flex-col gap-4">
            {slides.map((slide, i) => (
              <li
                key={i}
                className="rounded-md border border-border/50 bg-card/40 p-3"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Slide {i + 1}
                  </span>
                  <div className="flex items-center gap-1 text-xs">
                    <button
                      type="button"
                      onClick={() => moveSlide(i, -1)}
                      disabled={i === 0}
                      className="rounded border border-border/60 px-2 py-0.5 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Move slide up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSlide(i, 1)}
                      disabled={i === slides.length - 1}
                      className="rounded border border-border/60 px-2 py-0.5 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Move slide down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSlide(i)}
                      className="rounded border border-destructive/40 px-2 py-0.5 text-destructive"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className={FIELD}>
                    <span className={LABEL}>Background image URL</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="url"
                        className={`${INPUT} flex-1`}
                        placeholder="https://…"
                        value={slide.backgroundImageUrl ?? ""}
                        maxLength={2048}
                        onChange={(e) =>
                          patchSlide(i, { backgroundImageUrl: e.target.value })
                        }
                      />
                      {tenantId ? (
                        <MediaPicker
                          tenantId={tenantId}
                          onPick={(url) =>
                            patchSlide(i, { backgroundImageUrl: url })
                          }
                          label="Library"
                        />
                      ) : null}
                    </div>
                    <span className={HINT}>
                      Paste an absolute URL or pick from the workspace media
                      library.
                    </span>
                    <div className="mt-2">
                      <AltTextField
                        imageUrl={slide.backgroundImageUrl}
                        value={slide.backgroundImageAlt ?? ""}
                        onChange={(next) =>
                          patchSlide(i, { backgroundImageAlt: next })
                        }
                      />
                    </div>
                  </label>
                  <label className={FIELD}>
                    <span className={LABEL}>Overlay opacity</span>
                    <input
                      type="number"
                      className={INPUT}
                      min={0}
                      max={100}
                      step={5}
                      value={
                        typeof slide.overlayOpacity === "number"
                          ? slide.overlayOpacity
                          : ""
                      }
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === "") {
                          patchSlide(i, { overlayOpacity: undefined });
                          return;
                        }
                        const n = Math.max(0, Math.min(100, Number(raw)));
                        patchSlide(i, { overlayOpacity: n });
                      }}
                    />
                    <span className={HINT}>
                      0 = no scrim, 100 = solid. Leave blank to use the hero
                      overlay default.
                    </span>
                  </label>
                  <label className={FIELD}>
                    <span className={LABEL}>Eyebrow</span>
                    <input
                      type="text"
                      className={INPUT}
                      value={slide.eyebrow ?? ""}
                      maxLength={80}
                      onChange={(e) =>
                        patchSlide(i, { eyebrow: e.target.value })
                      }
                    />
                  </label>
                  <div className={FIELD}>
                    <span className={LABEL}>Slide headline</span>
                    <RichEditor
                      key={`slide-${i}-headline`}
                      value={slide.headline ?? ""}
                      onChange={(next) => patchSlide(i, { headline: next })}
                      variant="single"
                      tenantId={tenantId}
                      ariaLabel="Slide headline"
                    />
                  </div>
                  <div className={`${FIELD} md:col-span-2`}>
                    <span className={LABEL}>Slide sub-headline</span>
                    <RichEditor
                      key={`slide-${i}-subheadline`}
                      value={slide.subheadline ?? ""}
                      onChange={(next) => patchSlide(i, { subheadline: next || undefined })}
                      variant="single"
                      tenantId={tenantId}
                      ariaLabel="Slide sub-headline"
                    />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}

        <div className="flex flex-wrap items-end gap-4">
          <button
            type="button"
            onClick={addSlide}
            disabled={slides.length >= 8}
            className="rounded-md border border-border/60 bg-background px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add slide
          </button>
          <label className={`${FIELD} max-w-[14rem]`}>
            <span className={LABEL}>Per-slide duration (ms)</span>
            <input
              type="number"
              className={INPUT}
              min={2000}
              max={20000}
              step={500}
              value={autoplayValue}
              placeholder="7000"
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  update("autoplayMs", undefined);
                  return;
                }
                const n = Math.max(2000, Math.min(20000, Number(raw)));
                update("autoplayMs", n);
              }}
            />
            <span className={HINT}>
              Only applies when 2+ slides are present. Defaults to 7s.
            </span>
          </label>
        </div>
      </fieldset>

      <PresentationPanel
        value={state.presentation}
        onChange={(next) => update("presentation", next)}
      />
    </div>
  );
}
