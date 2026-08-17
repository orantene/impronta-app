"use client";

/**
 * BackgroundSlideshowManager — the image list behind a container's rotating
 * background.
 *
 * CONSISTENCY IS THE REQUIREMENT, NOT A NICE-TO-HAVE. The owner asked for one
 * editing language across the whole builder, so this is deliberately the SAME
 * list as `CarouselSlideManager`: the same drag handle, the same row shape and
 * thumbnail box, the same click-the-row-to-show-it action, the same two-click
 * remove, the same `FIELD_KIT` tokens. A second, differently-shaped slide list
 * two panels away is exactly the complaint that produced #1203.
 *
 * AND THE SAME EDIT-MODE MACHINERY. The rotation would otherwise run on the
 * editor canvas and image 2 would slide away mid-click — the original bug,
 * reappearing in a new feature. `carousel-edit-bridge` was generalised (a pin
 * CHANNEL) instead of copied, so pinning here and pinning a carousel are one
 * mechanism with one refcount and one "leaving edit mode drops every pin" rule.
 *
 * WHAT IS NOT SHARED is the data: a carousel slide is a BuilderNode child, a
 * background slide is a plain `{url, id}` in one node's props. That is why the
 * derivations live in `background-slide-model.ts` rather than in
 * `carousel-slide-model.ts`, which only lends this file `pinAfterRemoval`.
 */

import { useState } from "react";

import type { BackgroundSlideProps } from "@/lib/site-admin/builder-node/background-media";
import { BACKGROUND_SLIDESHOW_MAX_SLIDES } from "@/lib/site-admin/builder-node/background-media";
import {
  setPinnedSlide,
  usePinnedSlide,
} from "@/lib/site-admin/builder-node/carousel-edit-bridge";

import { DraggableList, type DragHandleProps } from "./kit";
import { MediaField, filenameFromUrl, toMediaValue } from "./kit";
import { useInspectorT } from "./kit/use-inspector-t";
import { FIELD_KIT } from "./field-kit";
import { pinAfterRemoval } from "./carousel-slide-model";
import {
  appendBackgroundSlide,
  buildBackgroundSlideModels,
  duplicateBackgroundSlideAt,
  patchBackgroundSlideAt,
  pinAfterReorder,
  removeBackgroundSlideAt,
  reorderBackgroundSlides,
  type BackgroundSlideModel,
} from "./background-slide-model";

export function BackgroundSlideshowManager({
  nodeId,
  tenantId,
  slides,
  onChange,
}: {
  /** The container whose background this is — also the pin key. */
  nodeId: string;
  tenantId: string;
  slides: readonly BackgroundSlideProps[];
  onChange: (next: BackgroundSlideProps[]) => void;
}) {
  const { t } = useInspectorT();
  const pinned = usePinnedSlide("background", nodeId);
  const [armedRemoveKey, setArmedRemoveKey] = useState<string | null>(null);

  const models = buildBackgroundSlideModels(
    slides,
    (position) => t("Image {n}").replace("{n}", String(position)),
    filenameFromUrl,
  );
  // No pin yet → the canvas is showing image 1, so highlight row 1 rather than
  // highlighting nothing (which reads as "the list does not know what the
  // canvas is doing").
  const activeIndex = Math.min(Math.max(pinned ?? 0, 0), Math.max(models.length - 1, 0));
  const atCap = slides.length >= BACKGROUND_SLIDESHOW_MAX_SLIDES;

  function show(index: number) {
    setPinnedSlide("background", nodeId, index);
    setArmedRemoveKey(null);
  }

  function handleReorder(next: BackgroundSlideModel[]) {
    const order = next.map((m) => m.key);
    const movedKey = models[activeIndex]?.key;
    onChange(reorderBackgroundSlides(slides, order));
    // Follow the image the operator was working against, so the canvas keeps
    // showing it rather than jumping to whatever slid into the old row.
    if (movedKey) {
      setPinnedSlide("background", nodeId, pinAfterReorder(order, movedKey, activeIndex));
    }
  }

  function handleRemove(index: number) {
    setPinnedSlide("background", nodeId, pinAfterRemoval(activeIndex, index, models.length));
    setArmedRemoveKey(null);
    onChange(removeBackgroundSlideAt(slides, index));
  }

  function handleDuplicate(index: number) {
    onChange(duplicateBackgroundSlideAt(slides, index));
    show(index + 1);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: FIELD_KIT.gap.control }}>
      {models.length === 0 ? (
        <p
          style={{
            margin: 0,
            padding: "14px 12px",
            borderRadius: FIELD_KIT.radius.tile,
            border: `1px dashed ${FIELD_KIT.border}`,
            color: FIELD_KIT.muted,
            fontSize: FIELD_KIT.font.caption,
            lineHeight: 1.5,
            textAlign: "center",
          }}
        >
          {t("No images yet. Add two or more to start the slideshow.")}
        </p>
      ) : (
        <DraggableList<BackgroundSlideModel>
          items={models}
          keyOf={(slide) => slide.key}
          onReorder={handleReorder}
        >
          {(slide, index, handleProps) => (
            <SlideRow
              slide={slide}
              active={index === activeIndex}
              armed={armedRemoveKey === slide.key}
              handleProps={handleProps}
              onShow={() => show(index)}
              onDuplicate={() => handleDuplicate(index)}
              onArmRemove={() => setArmedRemoveKey(slide.key)}
              onCancelRemove={() => setArmedRemoveKey(null)}
              onConfirmRemove={() => handleRemove(index)}
            />
          )}
        </DraggableList>
      )}

      {/* Replace the picture on the row the operator is working against. The
       *  list is the navigation, this is the edit — the same split the carousel
       *  has between its slide list and the Content panel. */}
      {models.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label
            style={{
              fontSize: FIELD_KIT.font.label,
              fontWeight: FIELD_KIT.weight.label,
              color: FIELD_KIT.ink,
            }}
          >
            {t("Selected image")}
          </label>
          <MediaField
            tenantId={tenantId}
            value={toMediaValue(
              slides[activeIndex]?.url,
              slides[activeIndex]?.mediaId ?? null,
            )}
            onChange={(next) => {
              // `next === null` is a real Clear signal (MediaField invariant
              // D3); url + mediaId move together (D1).
              onChange(
                patchBackgroundSlideAt(slides, activeIndex, {
                  url: next?.url ?? "",
                  mediaId: next?.mediaId ?? null,
                }),
              );
            }}
            emptyLabel={t("Choose image")}
            aspect="16/9"
            layout="row"
            pickerTitle={t("Choose a background image")}
          />
        </div>
      ) : null}

      {atCap ? (
        <p
          style={{
            margin: 0,
            fontSize: FIELD_KIT.font.caption,
            color: FIELD_KIT.muted,
          }}
        >
          {t("That is the maximum number of images for one background.")}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label
            style={{
              fontSize: FIELD_KIT.font.label,
              fontWeight: FIELD_KIT.weight.label,
              color: FIELD_KIT.ink,
            }}
          >
            {t("Add image")}
          </label>
          {/* A picker that never holds a value: choosing appends a row and the
           *  field resets itself, which is the only shape that lets one control
           *  add many images without a placeholder row appearing first. */}
          <MediaField
            tenantId={tenantId}
            value={null}
            onChange={(next) => {
              if (!next?.url) return;
              onChange(
                appendBackgroundSlide(slides, {
                  url: next.url,
                  mediaId: next.mediaId ?? null,
                }),
              );
              show(slides.length);
            }}
            emptyLabel={t("Add image")}
            aspect="16/9"
            layout="row"
            pickerTitle={t("Choose a background image")}
          />
        </div>
      )}
    </div>
  );
}

// ── row ────────────────────────────────────────────────────────────────────

function SlideRow({
  slide,
  active,
  armed,
  handleProps,
  onShow,
  onDuplicate,
  onArmRemove,
  onCancelRemove,
  onConfirmRemove,
}: {
  slide: BackgroundSlideModel;
  active: boolean;
  armed: boolean;
  handleProps: DragHandleProps;
  onShow: () => void;
  onDuplicate: () => void;
  onArmRemove: () => void;
  onCancelRemove: () => void;
  onConfirmRemove: () => void;
}) {
  const { t } = useInspectorT();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 6px",
        borderRadius: FIELD_KIT.radius.tile,
        background: active ? FIELD_KIT.accentFill : FIELD_KIT.surface,
        border: `1px solid ${active ? FIELD_KIT.accent : FIELD_KIT.border}`,
      }}
    >
      <button
        type="button"
        aria-label={t("Drag to reorder")}
        title={t("Drag to reorder")}
        {...handleProps}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 20,
          height: 24,
          flexShrink: 0,
          border: 0,
          background: "transparent",
          color: FIELD_KIT.muted,
          cursor: "grab",
        }}
      >
        <DragGlyph />
      </button>

      <button
        type="button"
        onClick={onShow}
        aria-current={active ? "true" : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flex: 1,
          minWidth: 0,
          padding: 0,
          border: 0,
          background: "transparent",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <SlideThumbnail url={slide.url} />
        <span style={{ display: "flex", flexDirection: "column", minWidth: 0, gap: 1 }}>
          <span
            style={{
              fontSize: FIELD_KIT.font.value,
              fontWeight: FIELD_KIT.weight.label,
              color: FIELD_KIT.ink,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {slide.label}
          </span>
          <span style={{ fontSize: FIELD_KIT.font.caption, color: FIELD_KIT.muted }}>
            {active
              ? t("Showing on canvas")
              : slide.url
                ? t("Image {n}").replace("{n}", String(slide.position))
                : t("No image chosen")}
          </span>
        </span>
      </button>

      {armed ? (
        <>
          <button type="button" onClick={onConfirmRemove} style={destructiveButtonStyle}>
            {t("Remove?")}
          </button>
          <button type="button" onClick={onCancelRemove} style={quietButtonStyle}>
            {t("Keep")}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onDuplicate}
            aria-label={t("Duplicate image")}
            title={t("Duplicate image")}
            style={iconButtonStyle}
          >
            <CopyGlyph />
          </button>
          <button
            type="button"
            onClick={onArmRemove}
            aria-label={t("Remove image")}
            title={t("Remove image")}
            style={iconButtonStyle}
          >
            <TrashGlyph />
          </button>
        </>
      )}
    </div>
  );
}

function SlideThumbnail({ url }: { url: string }) {
  const box = {
    width: 40,
    height: 28,
    flexShrink: 0,
    borderRadius: FIELD_KIT.radius.chip,
    border: `1px solid ${FIELD_KIT.border}`,
    background: FIELD_KIT.surfaceRecessed,
    overflow: "hidden" as const,
  };
  if (!url) return <span aria-hidden style={box} />;
  return (
    <span style={box}>
      {/* A plain <img>, deliberately — same reasoning as the carousel slide
       *  list: the optimizer refuses paths it has no `localPatterns` rule for
       *  and never follows a redirect (#1172). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
    </span>
  );
}

// ── styles + glyphs ────────────────────────────────────────────────────────

const iconButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 24,
  height: 24,
  flexShrink: 0,
  borderRadius: FIELD_KIT.radius.chip,
  border: 0,
  background: "transparent",
  color: FIELD_KIT.muted,
  cursor: "pointer",
} as const;

const destructiveButtonStyle = {
  height: 24,
  padding: "0 8px",
  flexShrink: 0,
  borderRadius: FIELD_KIT.radius.chip,
  border: `1px solid ${FIELD_KIT.border}`,
  background: FIELD_KIT.surface,
  color: FIELD_KIT.ink,
  fontSize: FIELD_KIT.font.caption,
  fontWeight: FIELD_KIT.weight.label,
  cursor: "pointer",
} as const;

const quietButtonStyle = {
  ...destructiveButtonStyle,
  border: 0,
  color: FIELD_KIT.muted,
} as const;

function DragGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="9" cy="5" r="2" />
      <circle cx="15" cy="5" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="9" cy="19" r="2" />
      <circle cx="15" cy="19" r="2" />
    </svg>
  );
}

function CopyGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function TrashGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}
