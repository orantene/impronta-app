"use client";

/**
 * MediaField — the ONE image-field control (media rebuild, seam 4).
 *
 * WHAT IT REPLACES
 * ────────────────
 * `MediaPickerButton` inlined the same `<MediaPicker>` trigger block FOUR
 * times, once per layout branch (row+value, row+empty, tile+empty, tile+value).
 * Every one of them repeated the same six lines of pick plumbing, so any change
 * to pick semantics was a four-place edit — and predictably the four drifted:
 * `variant="row"` shipped without a Clear button at all until the D3 fix.
 *
 * Separately, `brand-quick-panel.tsx` and `site-header/tabs/BrandTab.tsx` each
 * carried a byte-identical hack to make a picker look like a clickable tile:
 * an `[&>button]:absolute [&>button]:inset-0 …` arbitrary-selector cascade
 * reaching INTO `MediaPicker` to erase the button it renders. Two copies of a
 * hack that depends on a child component's internal markup is two things that
 * silently break the day that markup changes. The `cover` layout below is that
 * affordance built on purpose, once, with a real button.
 *
 * THE TWO INVARIANTS THIS COMPONENT EXISTS TO HOLD
 * ────────────────────────────────────────────────
 *  • D1 — url + mediaId + alt MOVE AS ONE UNIT. Never a URL write without its
 *    id, never an id write without its URL. The old two-callback API
 *    (`onChange(url)` plus an optional `onPickItem(item)`) let a call site wire
 *    one and forget the other, and several did: the picked URL landed while
 *    `mediaId` kept pointing at the previous asset. There is one callback here
 *    and it carries the whole value.
 *  • D3 — CLEAR ALWAYS RENDERS, ON EVERY LAYOUT, and the handler must actually
 *    accept it. `onChange(null)` is a real signal, not an absence of one. The
 *    regression tests in `media-field.test.ts` pin both halves.
 *
 * DROP-ON-THUMBNAIL. The thumbnail itself is an upload target: drop a file and
 * it rides `useMediaUpload` (seam 3) with real per-file byte progress, then
 * sets the field. Previously the only way to get a new image into a field was
 * open drawer → find the upload control → upload → pick.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilmIcon, ImageIcon } from "lucide-react";

import { useT } from "@/i18n/use-t";
import { MediaPickerDrawer } from "@/components/edit-chrome/media-picker-drawer";
import { useMediaUpload } from "@/lib/media/use-media-upload";

import { KIT } from "./tokens";

// ── Value model ─────────────────────────────────────────────────────────

/**
 * The unit a media field reads and writes. `url` is the only required member:
 * a pasted URL is a legitimate value that has no library row behind it, so
 * `mediaId` is nullable by design rather than by accident.
 */
export interface MediaFieldValue {
  url: string;
  mediaId?: string | null;
  alt?: string | null;
}

/**
 * Build a value from a library pick. Exported and used by the component so the
 * "these three move together" rule is one function, not a convention.
 */
export function mediaValueFromPick(item: {
  id: string;
  publicUrl: string;
  alt?: string | null;
}): MediaFieldValue {
  return { url: item.publicUrl, mediaId: item.id, alt: item.alt ?? null };
}

/** Build a value from a pasted / typed URL. No library row, so no mediaId. */
export function mediaValueFromUrl(url: string): MediaFieldValue | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  return { url: trimmed, mediaId: null, alt: null };
}

/** True when a value is actually set. `{ url: "" }` is NOT set — that is what
 *  a cleared required-`src` field looks like on the wire (see D3). */
export function hasMediaValue(v: MediaFieldValue | null | undefined): v is MediaFieldValue {
  return Boolean(v && typeof v.url === "string" && v.url.trim());
}

/** Normalize whatever a call site holds into the field's value shape. */
export function toMediaValue(
  url: string | null | undefined,
  mediaId?: string | null,
  alt?: string | null,
): MediaFieldValue | null {
  if (!url || !url.trim()) return null;
  return { url, mediaId: mediaId ?? null, alt: alt ?? null };
}

export function filenameFromUrl(url: string): string {
  try {
    const path = new URL(url, "https://placeholder.local").pathname;
    const base = path.split("/").filter(Boolean).pop() ?? "image";
    return decodeURIComponent(base.split("?")[0] ?? base);
  } catch {
    const tail = url.split("/").filter(Boolean).pop() ?? "image";
    return tail.split("?")[0] ?? tail;
  }
}

// ── Component ───────────────────────────────────────────────────────────

export type MediaFieldLayout = "row" | "tile" | "cover";

export interface MediaFieldProps {
  tenantId: string;
  value: MediaFieldValue | null | undefined;
  /** ONE callback. `null` is Clear and callers must handle it (D3). */
  onChange: (next: MediaFieldValue | null) => void;
  layout?: MediaFieldLayout;
  /** Label in the empty state. */
  emptyLabel?: string;
  /** Thumbnail aspect. Ignored by `row` (always square) . */
  aspect?: "16/9" | "4/5" | "1/1" | "21/9";
  /** `cover` only — the word the hover scrim shows over a set value. */
  coverReplaceLabel?: string;
  /** Offer the "Paste URL" escape hatch. Off for id-keyed fields (logos),
   *  where a bare URL has no asset row and the consumer stores an id. */
  allowUrlPaste?: boolean;
  /** Turn off drop-to-upload (e.g. a surface whose scope cannot upload). */
  allowDrop?: boolean;
  disabled?: boolean;
  /** Drawer title. */
  pickerTitle?: string;
  /**
   * Which asset kind this field holds. `"video"` opens the picker already
   * filtered to video, narrows the upload accept list to the video MIME types
   * the signed pipeline accepts, and previews the value with a muted `<video>`
   * instead of an `<img>` (an `<img>` pointed at an mp4 renders a torn-image
   * icon, which reads as "the upload failed"). Default `"image"` is the
   * historical behaviour, byte-for-byte.
   */
  kind?: "image" | "video";
}

export function MediaField({
  tenantId,
  value,
  onChange,
  layout = "tile",
  emptyLabel = "Add image",
  aspect = "16/9",
  coverReplaceLabel,
  allowUrlPaste = true,
  allowDrop = true,
  disabled = false,
  pickerTitle,
  kind = "image",
}: MediaFieldProps) {
  const t = useT();
  const isVideo = kind === "video";
  const [open, setOpen] = useState(false);
  const [urlMode, setUrlMode] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [dimensions, setDimensions] = useState<string | null>(null);
  const dropCounter = useRef(0);

  const has = hasMediaValue(value);
  const url = has ? value.url : "";
  const filename = useMemo(() => (has ? filenameFromUrl(url) : null), [has, url]);

  // ONE place resolves a pick into a value. Every layout routes through it, so
  // a change to pick semantics is a one-line edit rather than the four-place
  // edit MediaPickerButton required.
  const commitPick = useCallback(
    (item: { id: string; publicUrl: string; alt?: string | null }) => {
      onChange(mediaValueFromPick(item));
      setOpen(false);
    },
    [onChange],
  );

  const clear = useCallback(() => onChange(null), [onChange]);

  // Drop-to-upload. Same engine the Media page and the picker drawer use.
  const upload = useMediaUpload({
    purpose: { kind: "cms", tenantId },
    concurrency: 1, // a field holds one image; a serial bar reads honestly
    onItemReady: (item) => {
      const registered = item.registered as
        | { id?: string; publicUrl?: string; alt?: string | null }
        | undefined;
      if (registered?.id && registered.publicUrl) {
        onChange(mediaValueFromPick({
          id: registered.id,
          publicUrl: registered.publicUrl,
          alt: registered.alt ?? null,
        }));
      }
    },
  });

  const inFlight = upload.items.find(
    (it) => it.status !== "ready" && it.status !== "error",
  );
  const failed = upload.items.find((it) => it.status === "error");
  const pct =
    inFlight && inFlight.bytesTotal
      ? Math.min(100, Math.round((inFlight.bytesSent / inFlight.bytesTotal) * 100))
      : null;

  useEffect(() => {
    // The probe is an `Image()` decode, so it can only ever answer for an
    // image. Asking it about an mp4 would just fire onerror and pin the row to
    // "Loading dimensions" forever.
    if (!has || layout !== "row" || isVideo) {
      setDimensions(null);
      return;
    }
    const img = new Image();
    img.onload = () => setDimensions(`${img.naturalWidth} × ${img.naturalHeight}`);
    img.onerror = () => setDimensions(null);
    img.src = url;
  }, [has, url, layout, isVideo]);

  const dropHandlers = allowDrop && !disabled
    ? {
        onDragEnter: (e: React.DragEvent) => {
          e.preventDefault();
          dropCounter.current += 1;
          setDragOver(true);
        },
        onDragOver: (e: React.DragEvent) => e.preventDefault(),
        onDragLeave: () => {
          // Counter, not a bare flag: dragging over a child fires leave on the
          // parent and the highlight would flicker off mid-drag.
          dropCounter.current = Math.max(0, dropCounter.current - 1);
          if (dropCounter.current === 0) setDragOver(false);
        },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          dropCounter.current = 0;
          setDragOver(false);
          const files = Array.from(e.dataTransfer?.files ?? []);
          if (files.length > 0) void upload.upload(files.slice(0, 1));
        },
      }
    : {};

  const dropRing = dragOver ? "ring-2 ring-violet-500 ring-offset-1" : "";

  const progressStrip = inFlight ? (
    <div className="absolute inset-x-0 bottom-0 z-40 bg-stone-900/80 px-2 py-1">
      <div className="flex items-center justify-between gap-2 text-[10px] font-medium text-white">
        <span className="truncate">{inFlight.file.name}</span>
        <span className="shrink-0 tabular-nums">
          {pct != null ? `${pct}%` : t("dashboard.mediaField.uploading")}
        </span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/25">
        <div
          className="h-full rounded-full bg-white [transition:width_150ms_linear]"
          style={{ width: `${pct ?? 8}%` }}
        />
      </div>
    </div>
  ) : null;

  const uploadError = failed ? (
    <p className="text-[11px] leading-snug text-rose-600">
      {failed.errorMsg ?? t("dashboard.mediaField.uploadFailed")}
    </p>
  ) : null;

  const drawer = (
    <MediaPickerDrawer
      tenantId={tenantId}
      open={open}
      title={pickerTitle ?? t("dashboard.mediaField.pickerTitle")}
      kind={isVideo ? "video" : undefined}
      onPick={() => {
        // Superseded by onPickItem — the drawer calls both, and taking the URL
        // here would be exactly the "src without its mediaId" write D1 forbids.
      }}
      onPickItem={commitPick}
      onClose={() => setOpen(false)}
    />
  );

  /**
   * The set value, rendered. ONE helper for all three layouts so the image and
   * video branches can never drift the way the four inlined `MediaPickerButton`
   * copies did (see the module doc). The video preview is muted and
   * control-less on purpose: this is a thumbnail, not a player.
   */
  const valuePreview = (className: string, fit: "cover" | "contain") =>
    isVideo ? (
      <video
        src={url}
        className={className}
        style={{ objectFit: fit }}
        muted
        playsInline
        preload="metadata"
        aria-hidden="true"
      />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element -- operator-facing inspector thumbnail of an arbitrary tenant/CDN URL; the optimizer would 400 on unlisted hosts.
      <img
        src={url}
        alt=""
        className={className}
        style={{ objectFit: fit }}
        onError={(e) => {
          // Graceful degrade: a 404'd URL still shows the operator what is set.
          (e.currentTarget as HTMLImageElement).style.opacity = "0.3";
        }}
      />
    );

  const openButton = (label: string, className: string) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setOpen(true)}
      className={className}
    >
      {label}
    </button>
  );

  const clearButton = (className: string, title: string) => (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        clear();
      }}
      className={className}
      aria-label={title}
      title={title}
      data-testid="media-field-clear"
    >
      {title}
    </button>
  );

  // ── cover: full-bleed clickable tile (logo slots) ─────────────────────
  if (layout === "cover") {
    return (
      <>
        <div
          className={`group relative overflow-hidden rounded-lg border border-stone-200 bg-stone-50 ${dropRing}`}
          style={{ aspectRatio: aspect === "16/9" ? "16/9" : aspect }}
          {...dropHandlers}
        >
          {has ? (
            valuePreview("size-full p-2", "contain")
          ) : (
            <div className="flex size-full items-center justify-center text-[10px] font-semibold uppercase tracking-[0.08em] text-stone-400">
              {emptyLabel}
            </div>
          )}

          {/* The whole tile is ONE real button — no reaching into a child's
              markup with `[&>button]` to fake it. */}
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen(true)}
            className="absolute inset-0 z-20 flex cursor-pointer items-center justify-center bg-stone-900/55 text-[10px] font-semibold uppercase tracking-[0.1em] text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none"
          >
            {has
              ? (coverReplaceLabel ?? t("dashboard.mediaField.replace"))
              : t("dashboard.mediaField.add")}
          </button>

          {/* Clear renders whenever there is a value — D3, on every layout. */}
          {has
            ? clearButtonIcon(
                clear,
                disabled,
                t("dashboard.mediaField.clear"),
              )
            : null}
          {progressStrip}
        </div>
        {uploadError}
        {drawer}
      </>
    );
  }

  // ── row: compact thumbnail + name + dimensions ────────────────────────
  if (layout === "row") {
    if (!has) {
      return (
        <>
          <div className={`flex flex-col gap-2 rounded-lg ${dropRing}`} {...dropHandlers}>
            {openButton(emptyLabel, `${KIT.ghostButton} w-full justify-center`)}
            {allowUrlPaste ? urlPasteRow(urlMode, setUrlMode, onChange, t) : null}
            {inFlight ? inlineProgress(inFlight.file.name, pct, t) : null}
            {uploadError}
          </div>
          {drawer}
        </>
      );
    }
    return (
      <>
        <div
          className={`relative flex items-center gap-3 rounded-lg border px-3 py-2.5 ${dropRing}`}
          style={{ borderColor: "#e7e5e4", background: "#fafafa" }}
          {...dropHandlers}
        >
          <div className="size-11 shrink-0 overflow-hidden rounded-md border border-stone-200 bg-stone-100">
            {valuePreview("size-full", "cover")}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium text-stone-800">
              {filename ?? (isVideo ? "video" : "image")}
            </p>
            <p className="text-[11px] text-stone-500">
              {inFlight
                ? `${t("dashboard.mediaField.uploading")}${pct != null ? ` ${pct}%` : ""}`
                : isVideo
                  ? // No dimension probe on the video lane (see the effect above),
                    // so name the kind rather than leave the line empty.
                    t("dashboard.mediaField.videoSelected")
                  : (dimensions ?? t("dashboard.mediaField.loadingDimensions"))}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {openButton(
              t("dashboard.mediaField.replace"),
              "rounded-md border px-2 py-1 text-[11px] font-medium text-stone-600 transition hover:bg-white hover:text-stone-800 border-[#e7e5e4]",
            )}
            {clearButton(
              "rounded-md border px-2 py-1 text-[11px] font-medium text-stone-600 transition hover:bg-white hover:text-stone-800 border-[#e7e5e4]",
              t("dashboard.mediaField.clear"),
            )}
          </div>
          {progressStrip}
        </div>
        {uploadError}
        {drawer}
      </>
    );
  }

  // ── tile: large preview with overlay actions (default) ────────────────
  if (!has) {
    return (
      <>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen(true)}
            className={`flex w-full items-center justify-center rounded-md border border-dashed p-2 transition ${
              dragOver ? "border-violet-500 bg-violet-50" : "border-stone-300 bg-stone-50"
            }`}
            style={{ aspectRatio: aspect }}
            {...dropHandlers}
          >
            <span className="flex flex-col items-center gap-2 text-stone-500">
              {isVideo ? (
                <FilmIcon className="size-5" aria-hidden />
              ) : (
                <ImageIcon className="size-5" aria-hidden />
              )}
              <span className="text-[11px] font-medium">
                {dragOver ? t("dashboard.mediaField.dropToUpload") : emptyLabel}
              </span>
            </span>
          </button>
          {inFlight ? inlineProgress(inFlight.file.name, pct, t) : null}
          {uploadError}
          {allowUrlPaste ? urlPasteRow(urlMode, setUrlMode, onChange, t) : null}
        </div>
        {drawer}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <div
          className={`relative overflow-hidden rounded-md border border-stone-200 bg-stone-100 ${dropRing}`}
          style={{ aspectRatio: aspect }}
          {...dropHandlers}
        >
          {valuePreview("h-full w-full", "cover")}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5">
            {openButton(
              t("dashboard.mediaField.change"),
              "rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-medium text-stone-800 transition hover:bg-white",
            )}
            {clearButton(
              "rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-medium text-stone-800 transition hover:bg-white",
              t("dashboard.mediaField.clear"),
            )}
          </div>
          {progressStrip}
        </div>
        {uploadError}
      </div>
      {drawer}
    </>
  );
}

// ── small render helpers (kept out of the branches above) ───────────────

function clearButtonIcon(onClear: () => void, disabled: boolean, title: string) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={title}
      title={title}
      data-testid="media-field-clear"
      onClick={(e) => {
        e.stopPropagation();
        onClear();
      }}
      className="absolute right-1 top-1 z-30 inline-flex size-5 items-center justify-center rounded-full bg-stone-900/85 text-white opacity-0 shadow-md transition-opacity hover:bg-rose-600 group-hover:opacity-100 focus-visible:opacity-100"
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}

function inlineProgress(
  name: string,
  pct: number | null,
  t: (k: string) => string,
) {
  return (
    <div className="rounded-md border border-stone-200 bg-white px-2 py-1.5">
      <div className="flex items-center justify-between gap-2 text-[10.5px] text-stone-600">
        <span className="truncate">{name}</span>
        <span className="shrink-0 tabular-nums">
          {pct != null ? `${pct}%` : t("dashboard.mediaField.uploading")}
        </span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-stone-200">
        <div
          className="h-full rounded-full bg-violet-600 [transition:width_150ms_linear]"
          style={{ width: `${pct ?? 8}%` }}
        />
      </div>
    </div>
  );
}

function urlPasteRow(
  urlMode: boolean,
  setUrlMode: (f: (v: boolean) => boolean) => void,
  onChange: (v: MediaFieldValue | null) => void,
  t: (k: string) => string,
) {
  return (
    <>
      <button
        type="button"
        onClick={() => setUrlMode((v) => !v)}
        className="self-start rounded-lg border border-[#e5e0d5] bg-[#faf9f6] px-2.5 py-1 text-[11px] font-medium text-stone-600 transition hover:border-stone-300 hover:bg-white hover:text-stone-800"
      >
        {urlMode ? t("dashboard.mediaField.hideUrl") : t("dashboard.mediaField.pasteUrl")}
      </button>
      {urlMode ? (
        <input
          type="url"
          placeholder="https://…"
          className={KIT.input}
          onBlur={(e) => {
            const next = mediaValueFromUrl(e.target.value);
            if (next) onChange(next);
          }}
        />
      ) : null}
    </>
  );
}
