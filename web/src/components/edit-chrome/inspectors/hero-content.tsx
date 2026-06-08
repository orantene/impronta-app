"use client";

/**
 * HeroContentInspector — curated Content tab aligned to the canvas-first mockup.
 *
 * Flat grouped fields: eyebrow, heading, description, side-by-side CTA text/link
 * rows, and hero image with thumbnail preview. Multi-slide reel stays collapsed.
 */

import { useEffect, useMemo, useRef } from "react";
import { resolveBuilderNodeRole } from "@/lib/site-admin/builder-node";

import { CHROME } from "../kit";
import { RichEditor } from "@/components/edit-chrome/rich-editor";
import { LinkKindPicker } from "@/lib/site-admin/sections/shared/LinkKindPicker";
import {
  InspectorGroup,
  InspectorSection,
  InspectorBody,
  KIT,
  MediaPickerButton,
  type CtaShape,
} from "./kit";

interface HeroContentProps {
  draftProps: Record<string, unknown>;
  tenantId: string;
  selectedBuilderNodeId: string | null;
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

type HeroNodeRole = "headline" | "subheadline" | "primaryCta" | "secondaryCta";

function heroNodeRoleLabel(role: HeroNodeRole | null): string | null {
  if (role === "headline") return "Headline";
  if (role === "subheadline") return "Description";
  if (role === "primaryCta") return "Primary button";
  if (role === "secondaryCta") return "Secondary button";
  return null;
}

function CtaInlineRow({
  title,
  cta,
  onChange,
  nodeRole,
}: {
  title: string;
  cta: CtaShape | null | undefined;
  onChange: (next: CtaShape | null) => void;
  nodeRole?: string;
}) {
  function patch(partial: Partial<CtaShape>) {
    const next: CtaShape = {
      label: partial.label ?? cta?.label ?? "",
      href: partial.href ?? cta?.href ?? "",
    };
    if (!next.label && !next.href) {
      onChange(null);
      return;
    }
    onChange(next);
  }

  return (
    <InspectorSection title={title}>
      <div
        className="grid grid-cols-2 gap-2"
        data-hero-node-role={nodeRole}
      >
        <div className={KIT.field}>
          <label className={KIT.label}>Text</label>
          <input
            type="text"
            className={KIT.input}
            placeholder="Button label"
            maxLength={60}
            value={cta?.label ?? ""}
            onChange={(e) => patch({ label: e.target.value })}
          />
        </div>
        <div className={KIT.field}>
          <label className={KIT.label}>Link</label>
          <LinkKindPicker
            value={cta?.href}
            onChange={(next) => patch({ href: next })}
          />
        </div>
      </div>
    </InspectorSection>
  );
}

export function HeroContentInspector({
  draftProps,
  tenantId,
  selectedBuilderNodeId,
  onChange,
}: HeroContentProps) {
  const headline = (draftProps.headline as string | undefined) ?? "";
  const subheadline = (draftProps.subheadline as string | undefined) ?? "";
  const primaryCta = (draftProps.primaryCta as CtaShape | undefined) ?? null;
  const secondaryCta = (draftProps.secondaryCta as CtaShape | undefined) ?? null;
  const slides = (draftProps.slides as HeroSlide[] | undefined) ?? [];

  const eyebrow = slides[0]?.eyebrow ?? "";
  const backdropUrl =
    slides.length > 0 ? (slides[0]?.backgroundImageUrl ?? null) : null;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const focusRole = useMemo(() => {
    if (!selectedBuilderNodeId) return null;
    const role = resolveBuilderNodeRole(selectedBuilderNodeId);
    if (
      role === "headline" ||
      role === "subheadline" ||
      role === "primaryCta" ||
      role === "secondaryCta"
    ) {
      return role;
    }
    return null;
  }, [selectedBuilderNodeId]);
  const focusLabel = useMemo(() => heroNodeRoleLabel(focusRole), [focusRole]);

  useEffect(() => {
    if (!focusRole) return;
    const root = rootRef.current;
    if (!root) return;
    const target = root.querySelector<HTMLElement>(
      `[data-hero-node-role="${focusRole}"]`,
    );
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const focusable = target.querySelector<HTMLElement>(
      "[contenteditable='true'],input,textarea,select,button",
    );
    focusable?.focus({ preventScroll: true });
  }, [focusRole]);

  function update(patch: Record<string, unknown>) {
    onChange(cleanObject({ ...draftProps, ...patch } as Record<string, unknown>));
  }

  function patchEyebrow(value: string) {
    if (slides.length === 0) {
      update({ slides: [cleanObject({ eyebrow: value || undefined })] });
      return;
    }
    const next = [...slides];
    next[0] = cleanObject({ ...next[0], eyebrow: value || undefined });
    update({ slides: next });
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
    <InspectorBody className="gap-4">
      <div ref={rootRef} className="flex flex-col gap-4">
      {focusRole && focusLabel ? (
        <div
          className="rounded-lg border px-3 py-2 text-xs font-medium"
          style={{
            borderColor: "rgba(124, 58, 237, 0.28)",
            background: "rgba(124, 58, 237, 0.08)",
            color: CHROME.accentInk,
          }}
        >
          Editing selected canvas node: {focusLabel}
        </div>
      ) : null}

      <InspectorSection title="Hero Content">
        <div className={KIT.field}>
          <label className={KIT.label}>Eyebrow</label>
          <input
            type="text"
            className={KIT.input}
            placeholder="Optional — e.g. IMPRONTA MODELS"
            maxLength={80}
            value={eyebrow}
            onChange={(e) => patchEyebrow(e.target.value)}
          />
        </div>
        <div className={KIT.field} data-hero-node-role="headline">
          <label className={KIT.label}>Heading</label>
          <RichEditor
            value={headline}
            onChange={(next) => update({ headline: next })}
            variant="single"
            tenantId={tenantId}
            ariaLabel="Heading"
          />
        </div>
        <div className={KIT.field} data-hero-node-role="subheadline">
          <label className={KIT.label}>Description</label>
          <RichEditor
            value={subheadline}
            onChange={(next) => update({ subheadline: next || undefined })}
            variant="multi"
            tenantId={tenantId}
            placeholder="Supporting copy under the headline"
            ariaLabel="Description"
          />
        </div>
      </InspectorSection>

      <CtaInlineRow
        title="Primary Button"
        cta={primaryCta}
        onChange={(next) => update({ primaryCta: next ?? undefined })}
        nodeRole="primaryCta"
      />

      <CtaInlineRow
        title="Secondary Button"
        cta={secondaryCta}
        onChange={(next) => update({ secondaryCta: next ?? undefined })}
        nodeRole="secondaryCta"
      />

      <InspectorSection title="Right Image">
        <MediaPickerButton
          tenantId={tenantId}
          value={backdropUrl}
          onChange={patchBackdrop}
          emptyLabel="Add hero image"
          aspect="16/9"
          variant="row"
        />
      </InspectorSection>

      <InspectorGroup
        title={
          slides.length > 1
            ? `Multi-slide reel (${slides.length})`
            : "Multi-slide reel"
        }
        collapsible
        storageKey="hero:slides"
        defaultOpen={slides.length > 1}
      >
        {slides.length <= 1 ? (
          <p className={KIT.hint}>
            Add a second slide to turn the hero into a cross-fade reel.
          </p>
        ) : null}
        {slides.length > 0 ? (
          <ol className="mt-2 flex flex-col gap-2">
            {slides.map((slide, i) => (
              <li
                key={i}
                className="rounded-lg border p-2.5 text-xs"
                style={{ borderColor: CHROME.line, background: CHROME.paper }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold" style={{ color: CHROME.muted }}>
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
                      className="rounded border px-1.5 py-0.5 text-[11px] text-rose-600"
                      style={{ borderColor: CHROME.roseLine, background: CHROME.surface }}
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
                </div>
              </li>
            ))}
          </ol>
        ) : null}
        <button
          type="button"
          onClick={addSlide}
          disabled={slides.length >= 8}
          className={`${KIT.ghostButton} mt-2 w-fit disabled:opacity-40`}
        >
          + Add slide
        </button>
      </InspectorGroup>
      </div>
    </InspectorBody>
  );
}