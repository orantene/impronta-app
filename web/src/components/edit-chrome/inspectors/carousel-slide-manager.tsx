"use client";

/**
 * CarouselSlideManager — the slide list the slider inspector never had.
 *
 * Owner bug, verbatim: "the slider components.. so bad, one slide pass i cant
 * catch the second or third one. need a way that is clean and modern manage
 * slider, same as the UX ui design we do now, consistent."
 *
 * Before this, a carousel's slides existed ONLY as canvas children. To reach
 * slide 3 you had to click it on the canvas — but the hero runs a real
 * autoplay, and inactive slides are `inert` + `opacity:0` while still stacked
 * `position:absolute;inset:0` over each other. So the only clickable slide was
 * whichever one autoplay happened to be showing, and it kept changing.
 *
 * Two halves fix it, and both are needed:
 *   1. `carousel-edit-bridge` stops autoplay on the editor canvas and lets the
 *      inspector PIN which slide the canvas shows.
 *   2. This list, which is the thing the operator actually drives: thumbnail +
 *      name per slide, click a row to show that slide AND select it, drag to
 *      reorder, duplicate, and a two-click remove.
 *
 * Consistency, not a new language: the drag handle + row shape come from
 * `NavigationTab` (the chrome's list-row pattern) and every colour, radius,
 * and font size comes from `field-kit/tokens` — the cool light palette #1199
 * adopted, never the retiring parchment.
 */

import { useState } from "react";

import type { BuilderNode } from "@/lib/site-admin/builder-node";
import { resolveLayerDisplayName } from "@/lib/site-admin/builder-node/freeform-layer-name";
import {
  setCarouselSlide,
  useCarouselPinnedSlide,
} from "@/lib/site-admin/builder-node/carousel-edit-bridge";
import { DraggableList, type DragHandleProps } from "./kit";
import { useInspectorT } from "./kit/use-inspector-t";
import { FIELD_KIT } from "./field-kit";
import {
  buildCarouselSlideModels,
  pinAfterRemoval,
  singleMoveFromReorder,
  type CarouselSlideModel,
} from "./carousel-slide-model";

export interface CarouselSlideManagerProps {
  /** The carousel node whose children are the slides. */
  nodeId: string;
  slides: readonly BuilderNode[];
  /** Select a slide node so the Content/Style panels target it. */
  onSelect: (nodeId: string) => void;
  /** Append a new slide (the caller decides the kind). */
  onAdd: () => void | Promise<void>;
  onDuplicate: (nodeId: string) => void | Promise<void>;
  onRemove: (nodeId: string) => void | Promise<void>;
  /** Move a slide to an absolute index among its siblings. */
  onMoveToIndex: (nodeId: string, toIndex: number) => void | Promise<void>;
}

export function CarouselSlideManager({
  nodeId,
  slides,
  onSelect,
  onAdd,
  onDuplicate,
  onRemove,
  onMoveToIndex,
}: CarouselSlideManagerProps) {
  const { t } = useInspectorT();
  const pinned = useCarouselPinnedSlide(nodeId);
  // Two-click destructive remove, the chrome's standard: the trash arms the
  // row, a second click commits. Same shape as the canvas chip's `confirmRemove`
  // (selection-layer.tsx) — never a `window.confirm`, never a one-click delete.
  const [armedRemoveId, setArmedRemoveId] = useState<string | null>(null);

  const models = buildCarouselSlideModels(
    slides,
    (node) => resolveLayerDisplayName(node),
    (position) => t("Slide {n}").replace("{n}", String(position)),
  );
  // No pin yet → the carousel is on its own slide 0, so highlight row 1 rather
  // than highlighting nothing (an empty highlight reads as "the list does not
  // know what the canvas is doing").
  const activeIndex = Math.min(Math.max(pinned ?? 0, 0), Math.max(models.length - 1, 0));

  function showSlide(index: number, slideNodeId: string) {
    setCarouselSlide(nodeId, index);
    onSelect(slideNodeId);
    setArmedRemoveId(null);
  }

  /**
   * Step the shown slide by one.
   *
   * The row list alone is awkward past a handful of slides: the operator has
   * to find the next row rather than just asking for the next slide, and on a
   * ten-slide hero the list is a scroller. Prev/next is the same action the
   * canvas arrows perform, available without leaving the panel. Wraps, because
   * the list is a ring and a dead arrow at the end reads as a broken control.
   */
  function step(delta: -1 | 1) {
    if (models.length === 0) return;
    const next = (activeIndex + delta + models.length) % models.length;
    const target = models[next];
    if (target) showSlide(next, target.nodeId);
  }

  function handleReorder(next: CarouselSlideModel[]) {
    const move = singleMoveFromReorder(
      models.map((m) => m.nodeId),
      next.map((m) => m.nodeId),
    );
    if (!move) return;
    // Follow the slide the operator just dragged, so the canvas keeps showing
    // the thing they are manipulating instead of jumping to whatever slid into
    // the old position.
    setCarouselSlide(nodeId, move.toIndex);
    void onMoveToIndex(move.nodeId, move.toIndex);
  }

  function handleRemove(index: number, slideNodeId: string) {
    setCarouselSlide(nodeId, pinAfterRemoval(activeIndex, index, models.length));
    setArmedRemoveId(null);
    void onRemove(slideNodeId);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: FIELD_KIT.gap.control }}>
      {/* WHICH SLIDE AM I ON — stated in words at the top of the list, not
       *  inferred from which row happens to be tinted. Paired with the two
       *  steppers so "show me the next one" is one click from anywhere in the
       *  panel, however long the list is. */}
      {models.length > 1 ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: FIELD_KIT.gap.tight,
          }}
        >
          <span
            aria-live="polite"
            style={{ fontSize: FIELD_KIT.font.caption, color: FIELD_KIT.muted }}
          >
            {t("Showing slide {n} of {total}")
              .replace("{n}", String(activeIndex + 1))
              .replace("{total}", String(models.length))}
          </span>
          <span style={{ display: "inline-flex", gap: FIELD_KIT.gap.tight }}>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label={t("Show the previous slide")}
              title={t("Show the previous slide")}
              style={stepButtonStyle}
            >
              <ChevronGlyph direction="left" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label={t("Show the next slide")}
              title={t("Show the next slide")}
              style={stepButtonStyle}
            >
              <ChevronGlyph direction="right" />
            </button>
          </span>
        </div>
      ) : null}
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
          {t("No slides yet. Add one to start the slider.")}
        </p>
      ) : (
        <DraggableList<CarouselSlideModel>
          items={models}
          keyOf={(slide) => slide.nodeId}
          onReorder={handleReorder}
        >
          {(slide, index, handleProps) => (
            <SlideRow
              slide={slide}
              active={index === activeIndex}
              armed={armedRemoveId === slide.nodeId}
              handleProps={handleProps}
              onShow={() => showSlide(index, slide.nodeId)}
              onDuplicate={() => void onDuplicate(slide.nodeId)}
              onArmRemove={() => setArmedRemoveId(slide.nodeId)}
              onCancelRemove={() => setArmedRemoveId(null)}
              onConfirmRemove={() => handleRemove(index, slide.nodeId)}
            />
          )}
        </DraggableList>
      )}
      <button
        type="button"
        onClick={() => void onAdd()}
        style={{
          alignSelf: "flex-start",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          height: FIELD_KIT.size.control,
          padding: "0 10px",
          borderRadius: FIELD_KIT.radius.chip,
          border: `1px solid ${FIELD_KIT.border}`,
          background: FIELD_KIT.surface,
          color: FIELD_KIT.ink,
          fontSize: FIELD_KIT.font.label,
          fontWeight: FIELD_KIT.weight.label,
          cursor: "pointer",
        }}
      >
        <PlusGlyph />
        {t("Add slide")}
      </button>
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
  slide: CarouselSlideModel;
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
      data-carousel-slide-row=""
      data-carousel-slide-active={active ? "true" : undefined}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 6px",
        borderRadius: FIELD_KIT.radius.tile,
        background: active ? FIELD_KIT.accentFill : FIELD_KIT.surface,
        border: `1px solid ${active ? FIELD_KIT.accent : FIELD_KIT.border}`,
        // A tint plus a border tint is easy to miss in a list of six rows on a
        // white panel. The solid accent spine is the unmistakable part; the
        // tint alone was the gap.
        boxShadow: active ? `inset 3px 0 0 0 ${FIELD_KIT.accent}` : undefined,
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

      {/* The row itself is the "show this slide" control. Selecting the node
       *  and pinning the canvas are ONE action, because an operator who clicks
       *  a slide in this list means both. */}
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
        <SlideThumbnail slide={slide} />
        {/* The ordinal, always visible. Without it the only way to know you
         *  are looking at slide 4 is to count rows. */}
        <span
          aria-hidden
          style={{
            flexShrink: 0,
            minWidth: 14,
            textAlign: "right",
            fontSize: FIELD_KIT.font.caption,
            fontWeight: FIELD_KIT.weight.label,
            fontVariantNumeric: "tabular-nums",
            color: active ? FIELD_KIT.accent : FIELD_KIT.muted,
          }}
        >
          {slide.position}
        </span>
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
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: FIELD_KIT.font.caption,
              color: active ? FIELD_KIT.accent : FIELD_KIT.muted,
            }}
          >
            {active ? <EyeGlyph /> : null}
            {active
              ? t("Showing on canvas")
              : slide.isEmpty
                ? t("Empty slide")
                : t("Click to show")}
          </span>
        </span>
      </button>

      {armed ? (
        <>
          <button
            type="button"
            onClick={onConfirmRemove}
            style={destructiveButtonStyle}
          >
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
            aria-label={t("Duplicate slide")}
            title={t("Duplicate slide")}
            style={iconButtonStyle}
          >
            <CopyGlyph />
          </button>
          <button
            type="button"
            onClick={onArmRemove}
            aria-label={t("Remove slide")}
            title={t("Remove slide")}
            style={iconButtonStyle}
          >
            <TrashGlyph />
          </button>
        </>
      )}
    </div>
  );
}

function SlideThumbnail({ slide }: { slide: CarouselSlideModel }) {
  const box = {
    width: 40,
    height: 28,
    flexShrink: 0,
    borderRadius: FIELD_KIT.radius.chip,
    border: `1px solid ${FIELD_KIT.border}`,
    background: FIELD_KIT.surfaceRecessed,
    overflow: "hidden" as const,
  };
  if (!slide.thumbnailUrl) {
    return <span aria-hidden style={box} />;
  }
  return (
    <span style={box}>
      {/* A plain <img>, deliberately. The optimizer refuses paths it has no
       *  `localPatterns` rule for and never follows a redirect, which is how
       *  every gated photo broke in #1172; the canvas already paints this exact
       *  URL, so the browser can too. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={slide.thumbnailUrl}
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

const stepButtonStyle = {
  ...iconButtonStyle,
  border: `1px solid ${FIELD_KIT.border}`,
  color: FIELD_KIT.ink,
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

function ChevronGlyph({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {direction === "left" ? (
        <polyline points="15 5 8 12 15 19" />
      ) : (
        <polyline points="9 5 16 12 9 19" />
      )}
    </svg>
  );
}

/** Marks the one row whose slide is on the canvas right now. */
function EyeGlyph() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PlusGlyph() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
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
