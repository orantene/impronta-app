"use client";

/**
 * add-gallery-cards.tsx — the Add Gallery's CARD layer.
 *
 * Extracted from `add-gallery-panel.tsx` (2026-08-16) when the shell-variant
 * work pushed that file past the 800-line `max-lines` cap. The split is along a
 * real seam rather than at a convenient line number: everything here renders ONE
 * catalog item and owns no panel state, while everything left in the panel owns
 * the catalog fetch, the tab/category/search state and the insert-vs-apply
 * decision. `GalleryCard` is the whole surface between them.
 *
 * Nothing about the cards changed in the move except the two additions the
 * shell work required, both documented at their definitions:
 *   - `GalleryCardPreview`, which finally reads `item.previewImageUrl`; and
 *   - the `armed` state, the two-click confirm for a destructive shell replace.
 */

import { useRef } from "react";

import {
  isAddGalleryItemAvailable,
  type AddGalleryItem,
  type AddGalleryTab,
} from "@/lib/site-admin/add-gallery";
import {
  armAddGalleryPointerDrag,
  clearAddGalleryDrag,
} from "@/lib/site-admin/add-gallery/drag";
import { usePointerDrag } from "../use-pointer-drag";
import { emitPalettePointerDrag } from "../element-library-insert-picker";
import { CHROME } from "../kit";
import { AddGalleryCardInfo } from "./add-gallery-card-info";
import {
  GalleryCardCopy,
  GalleryStatusBadge,
  useGalleryCardState,
} from "./add-gallery-card-meta";
import { AddGalleryIcon } from "./add-gallery-icons";
import { GalleryPreviewTrigger } from "./add-gallery-preview-modal";
import { AddGallerySectionPreview } from "./add-gallery-section-previews";
import { useEditorLocale } from "../use-editor-locale";

function useGalleryCardPointerDrag(
  item: AddGalleryItem,
  enabled: boolean,
) {
  const droppedRef = useRef(false);
  const { getHandleProps } = usePointerDrag<AddGalleryItem>({
    // Cards don't reorder among themselves — the canvas is the drop target, so
    // the hook's local row lookup is unused. The canvas drop is driven by the
    // palette pointer-drag channel (emitPalettePointerDrag) below.
    rowSelector: "[data-add-gallery-item]",
    onDragStart: (dragItem) => {
      droppedRef.current = false;
      armAddGalleryPointerDrag(dragItem);
    },
    onDragMove: ({ clientX, clientY }) => {
      emitPalettePointerDrag({ type: "move", clientX, clientY });
    },
    onDrop: ({ clientX, clientY }) => {
      droppedRef.current = true;
      emitPalettePointerDrag({ type: "drop", clientX, clientY });
    },
    onDragEnd: () => {
      // The canvas commits on the "drop" phase and clears the payload; only
      // emit a cancel (and clear) when the gesture ended WITHOUT a drop.
      if (!droppedRef.current) {
        emitPalettePointerDrag({ type: "cancel" });
        clearAddGalleryDrag();
      }
    },
  });
  if (!enabled) return null;
  return getHandleProps(item);
}

function ElementCard({
  item,
  onInsert,
  onPreview,
  pending,
}: {
  item: AddGalleryItem;
  onInsert: (item: AddGalleryItem) => void;
  onPreview: (item: AddGalleryItem) => void;
  pending: boolean;
}) {
  const { comingSoon, advanced, incompatible, draggable, label, shortDescription, infoTooltip } =
    useGalleryCardState(item);
  const dragProps = useGalleryCardPointerDrag(item, draggable && !pending);

  return (
    <button
      type="button"
      disabled={pending || comingSoon}
      onPointerDown={dragProps?.onPointerDown}
      onClick={() => onInsert(item)}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-[12px] border text-center transition-[border-color,box-shadow] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40 disabled:cursor-not-allowed"
      style={{
        borderColor: incompatible ? CHROME.rose : CHROME.line,
        background: CHROME.surface,
        minHeight: 108,
        boxShadow: incompatible ? `0 0 0 1px ${CHROME.roseBg}` : undefined,
        ...(dragProps?.style ?? null),
      }}
      onMouseEnter={(e) => {
        if (comingSoon || incompatible) return;
        e.currentTarget.style.borderColor = "rgba(124, 58, 237, 0.45)";
        e.currentTarget.style.boxShadow =
          "0 4px 14px -8px rgba(124, 58, 237, 0.35)";
      }}
      onMouseLeave={(e) => {
        if (incompatible) return;
        e.currentTarget.style.borderColor = CHROME.line;
        e.currentTarget.style.boxShadow = "none";
      }}
      data-add-gallery-item={item.id}
      data-freeform-incompatible={incompatible ? "true" : undefined}
    >
      <GalleryPreviewTrigger item={item} onPreview={onPreview} />
      {infoTooltip ? (
        <AddGalleryCardInfo tooltip={infoTooltip} rightOffset={32} />
      ) : null}
      <div className="flex min-h-[48px] flex-1 items-center justify-center px-[8px] pt-[10px]">
        <AddGalleryIcon name={item.icon} size="xl" tone="accent" />
      </div>
      <div className="px-[8px] pb-[10px] pt-[4px]">
        <GalleryCardCopy label={label} description={shortDescription} />
      </div>
      {comingSoon ? (
        <span className="absolute left-[8px] top-[8px]">
          <GalleryStatusBadge variant="soon" />
        </span>
      ) : incompatible ? (
        <span className="absolute left-[8px] top-[8px]">
          <GalleryStatusBadge variant="incompatible" />
        </span>
      ) : advanced ? (
        <span className="absolute left-[8px] top-[8px]">
          <GalleryStatusBadge variant="advanced" />
        </span>
      ) : null}
    </button>
  );
}

/**
 * The 96px preview strip on a template card.
 *
 * A DB template that carries a real thumbnail renders the image; everything
 * else keeps the generated SVG wireframe. This is the consumer side of the
 * `previewImageUrl` wiring — the field has existed on `AddGalleryItem` since
 * WS4 and, until now, no component read it, so `previewType: "image-card"` was
 * computed and then ignored.
 *
 * Plain `<img>`, not `next/image`: the URL is either a repo-served static file
 * or an arbitrary https CDN URL that the optimizer's `remotePatterns` would
 * reject at request time (a 400 in place of the thumbnail). The images are
 * small and already sized for a 96px strip, so the optimizer buys nothing here.
 */
function GalleryCardPreview({ item }: { item: AddGalleryItem }) {
  const previewUrl = item.previewImageUrl;
  if (!previewUrl) return <AddGallerySectionPreview itemId={item.id} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- see doc comment: static/remote thumbnail, optimizer would 400 on unlisted hosts.
    <img
      src={previewUrl}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      className="size-full object-cover"
      // A broken thumbnail must not leave a torn-image icon in a premium
      // gallery: hide the element and let the tinted strip stand alone.
      onError={(event) => {
        event.currentTarget.style.display = "none";
      }}
    />
  );
}

function SectionCard({
  item,
  onInsert,
  onPreview,
  pending,
  armed = false,
}: {
  item: AddGalleryItem;
  onInsert: (item: AddGalleryItem) => void;
  onPreview: (item: AddGalleryItem) => void;
  pending: boolean;
  /**
   * Shell tab only — this card is one click away from REPLACING the landmark.
   * Rendered as a loud, unmistakable state: an amber-free rose treatment plus
   * an explicit "Click again to replace" strip over the preview. A quiet
   * confirm is worse than none, because it reads as a normal selected state.
   */
  armed?: boolean;
}) {
  const { comingSoon, advanced, connected, incompatible, draggable, label, shortDescription, infoTooltip } =
    useGalleryCardState(item);
  // A shell card must never drag: dragging routes to the canvas INSERT path,
  // which would nest a header inside a header. Click-to-replace is the only
  // gesture it supports.
  const isShellVariant = item.tab === "shell";
  const dragProps = useGalleryCardPointerDrag(
    item,
    draggable && !pending && !isShellVariant,
  );

  return (
    <button
      type="button"
      disabled={pending || comingSoon}
      onPointerDown={dragProps?.onPointerDown}
      onClick={() => onInsert(item)}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-[12px] border text-left transition-[border-color,box-shadow] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40 disabled:cursor-not-allowed"
      style={{
        borderColor: armed
          ? "rgb(225 29 72)"
          : incompatible
            ? CHROME.rose
            : CHROME.line,
        background: CHROME.surface,
        minHeight: 156,
        boxShadow: armed
          ? "0 0 0 3px rgba(225, 29, 72, 0.18)"
          : incompatible
            ? `0 0 0 1px ${CHROME.roseBg}`
            : undefined,
        ...(dragProps?.style ?? null),
      }}
      onMouseEnter={(e) => {
        if (comingSoon || armed || incompatible) return;
        e.currentTarget.style.borderColor = "rgba(124, 58, 237, 0.45)";
        e.currentTarget.style.boxShadow =
          "0 6px 18px -10px rgba(124, 58, 237, 0.4)";
      }}
      onMouseLeave={(e) => {
        if (armed || incompatible) return;
        e.currentTarget.style.borderColor = CHROME.line;
        e.currentTarget.style.boxShadow = "none";
      }}
      data-add-gallery-item={item.id}
      data-shell-variant-armed={armed ? "true" : undefined}
      data-freeform-incompatible={incompatible ? "true" : undefined}
    >
      <GalleryPreviewTrigger item={item} onPreview={onPreview} />
      {infoTooltip ? (
        <AddGalleryCardInfo tooltip={infoTooltip} rightOffset={32} />
      ) : null}
      <div
        className="relative h-[96px] w-full shrink-0 overflow-hidden"
        style={{
          background:
            "linear-gradient(180deg, #f5f3ff 0%, #ede9fe 55%, #faf5ff 100%)",
        }}
      >
        <GalleryCardPreview item={item} />
        {armed ? <ShellVariantArmedOverlay /> : null}
        {connected ? (
          <span className="absolute left-[8px] top-[8px]">
            <GalleryStatusBadge variant="connected" />
          </span>
        ) : null}
        {comingSoon ? (
          <span className="absolute right-[8px] top-[8px]">
            <GalleryStatusBadge variant="soon" />
          </span>
        ) : incompatible ? (
          <span className="absolute right-[8px] top-[8px]">
            <GalleryStatusBadge variant="incompatible" />
          </span>
        ) : advanced ? (
          <span className="absolute right-[8px] top-[8px]">
            <GalleryStatusBadge variant="advanced" />
          </span>
        ) : null}
      </div>
      <div className="px-[10px] pb-[10px] pt-[8px]">
        <GalleryCardCopy
          label={label}
          description={shortDescription}
          align="left"
        />
      </div>
    </button>
  );
}

function ConnectedCard({
  item,
  onInsert,
  onPreview,
  pending,
}: {
  item: AddGalleryItem;
  onInsert: (item: AddGalleryItem) => void;
  onPreview: (item: AddGalleryItem) => void;
  pending: boolean;
}) {
  const { comingSoon, advanced, incompatible, draggable, label, shortDescription, infoTooltip } =
    useGalleryCardState(item);
  const dragProps = useGalleryCardPointerDrag(item, draggable && !pending);

  return (
    <button
      type="button"
      disabled={pending || comingSoon}
      onPointerDown={dragProps?.onPointerDown}
      onClick={() => onInsert(item)}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-[12px] border text-left transition-[border-color,box-shadow] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/40 disabled:cursor-not-allowed"
      style={{
        borderColor: incompatible ? CHROME.rose : CHROME.line,
        background: CHROME.surface,
        minHeight: 112,
        boxShadow: incompatible ? `0 0 0 1px ${CHROME.roseBg}` : undefined,
        ...(dragProps?.style ?? null),
      }}
      onMouseEnter={(e) => {
        if (comingSoon || incompatible) return;
        e.currentTarget.style.borderColor = "rgba(124, 58, 237, 0.45)";
        e.currentTarget.style.boxShadow =
          "0 4px 14px -8px rgba(124, 58, 237, 0.35)";
      }}
      onMouseLeave={(e) => {
        if (incompatible) return;
        e.currentTarget.style.borderColor = CHROME.line;
        e.currentTarget.style.boxShadow = "none";
      }}
      data-add-gallery-item={item.id}
      data-freeform-incompatible={incompatible ? "true" : undefined}
    >
      <GalleryPreviewTrigger item={item} onPreview={onPreview} />
      {infoTooltip ? (
        <AddGalleryCardInfo tooltip={infoTooltip} rightOffset={32} />
      ) : null}
      <div className="flex gap-[10px] px-[10px] pt-[10px]">
        <div
          className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[10px]"
          style={{
            background: "rgba(124, 58, 237, 0.08)",
          }}
        >
          <AddGalleryIcon name={item.icon} size="lg" tone="accent" />
        </div>
        <div className="min-w-0 flex-1 pr-[16px]">
          <div className="flex items-start gap-[6px]">
            <span
              className="min-w-0 flex-1 text-[12px] font-semibold leading-tight"
              style={{ color: CHROME.ink }}
            >
              {label}
            </span>
            <GalleryStatusBadge variant="connected" className="mt-[1px]" />
          </div>
          {item.connectedSource ? (
            <span
              className="mt-[3px] block line-clamp-1 text-[9px] font-medium"
              style={{ color: CHROME.muted }}
            >
              Source: {item.connectedSource}
            </span>
          ) : null}
          <span
            className="mt-[2px] block line-clamp-1 text-[10px] leading-snug"
            style={{ color: CHROME.muted }}
          >
            {shortDescription}
          </span>
        </div>
      </div>
      <div className="h-[10px]" aria-hidden />
      {comingSoon ? (
        <span className="absolute left-[8px] top-[8px]">
          <GalleryStatusBadge variant="soon" />
        </span>
      ) : incompatible ? (
        <span className="absolute left-[8px] top-[8px]">
          <GalleryStatusBadge variant="incompatible" />
        </span>
      ) : advanced ? (
        <span className="absolute left-[8px] top-[8px]">
          <GalleryStatusBadge variant="advanced" />
        </span>
      ) : null}
    </button>
  );
}

/**
 * The "click again to replace" strip shown over an armed shell-variant card.
 *
 * Deliberately covers the preview rather than sitting beside it: the operator's
 * eye is already on the thumbnail they just clicked, and the whole point of the
 * two-click pattern is that the second click cannot be made absent-mindedly.
 * Rose, not the chrome's amber — amber is the "heads up" colour here and this
 * is destructive.
 */
function ShellVariantArmedOverlay() {
  const { t } = useEditorLocale();
  return (
    <span
      className="absolute inset-0 flex flex-col items-center justify-center gap-[3px] px-[10px] text-center"
      style={{ background: "rgba(225, 29, 72, 0.92)" }}
      aria-hidden
    >
      <span className="text-[12px] font-semibold leading-tight text-white">
        {t("Click again to replace")}
      </span>
      <span className="text-[10.5px] leading-snug text-white/85">
        {t("This swaps out what's there now.")}
      </span>
    </span>
  );
}

export function GalleryCard(props: {
  item: AddGalleryItem;
  tab: AddGalleryTab;
  onInsert: (item: AddGalleryItem) => void;
  onPreview: (item: AddGalleryItem) => void;
  pending: boolean;
  armed?: boolean;
}) {
  // WS-A A7 — shell templates use the richer template-card look like sections.
  if (props.tab === "sections" || props.tab === "page_templates" || props.tab === "shell") {
    return <SectionCard {...props} />;
  }
  if (props.tab === "connected") {
    return <ConnectedCard {...props} />;
  }
  // layout and elements both use the icon-card grid
  return <ElementCard {...props} />;
}
