"use client";

/**
 * MediaPickerButton — thumbnail + "Change" / "Clear" affordance.
 *
 * Wraps the existing workspace media picker so every panel that takes an
 * image (hero backdrop, cta_banner background, category_grid tile image,
 * eventually gallery_strip items) renders a consistent premium input
 * rather than a raw URL textbox. Empty state is an upload-shaped tile
 * that reads as "pick an image" — active state shows the current image
 * with overlay actions.
 *
 * The picker itself still lives in `sections/shared/MediaPicker` — this
 * primitive is purely the trigger + thumbnail presentation.
 */

import { useEffect, useMemo, useState } from "react";

import {
  MediaPicker,
  type MediaPickedItem,
} from "@/lib/site-admin/sections/shared/MediaPicker";

import { KIT } from "./tokens";

interface MediaPickerButtonProps {
  tenantId: string;
  /** Current image URL (null or empty → empty state). */
  value: string | null | undefined;
  onChange: (next: string | null) => void;
  onPickItem?: (item: MediaPickedItem) => void;
  /** Label shown in the empty state tile. */
  emptyLabel?: string;
  /** Aspect ratio for the thumbnail. Defaults to 16/9. */
  aspect?: "16/9" | "4/5" | "1/1" | "21/9";
  /**
   * `tile` — large preview with overlay actions (default).
   * `row` — compact thumbnail + filename + dimensions + Replace (mockup).
   */
  variant?: "tile" | "row";
}

function filenameFromUrl(url: string): string {
  try {
    const path = new URL(url, "https://placeholder.local").pathname;
    const base = path.split("/").filter(Boolean).pop() ?? "image";
    return decodeURIComponent(base.split("?")[0] ?? base);
  } catch {
    const tail = url.split("/").filter(Boolean).pop() ?? "image";
    return tail.split("?")[0] ?? tail;
  }
}

export function MediaPickerButton({
  tenantId,
  value,
  onChange,
  onPickItem,
  emptyLabel = "Add image",
  aspect = "16/9",
  variant = "tile",
}: MediaPickerButtonProps) {
  const [urlMode, setUrlMode] = useState<boolean>(false);
  const [dimensions, setDimensions] = useState<string | null>(null);
  const has = Boolean(value && value.trim());
  const filename = useMemo(
    () => (has && value ? filenameFromUrl(value) : null),
    [has, value],
  );

  useEffect(() => {
    if (!has || !value || variant !== "row") {
      setDimensions(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      setDimensions(`${img.naturalWidth} × ${img.naturalHeight}`);
    };
    img.onerror = () => setDimensions(null);
    img.src = value;
  }, [has, value, variant]);

  if (variant === "row" && has && value) {
    return (
      <div
        className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
        style={{ borderColor: "#e7e5e4", background: "#fafafa" }}
      >
        <div
          className="size-11 shrink-0 overflow-hidden rounded-md border border-stone-200 bg-stone-100"
          style={{ aspectRatio: "1/1" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="size-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-stone-800">
            {filename ?? "image"}
          </p>
          <p className="text-[11px] text-stone-500">
            {dimensions ?? "Loading dimensions…"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <MediaPicker
            tenantId={tenantId}
            label="Replace"
            onPick={(url) => {
              if (!onPickItem) onChange(url);
            }}
            onPickItem={(item) => {
              if (onPickItem) onPickItem(item);
              else onChange(item.publicUrl);
            }}
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-md border px-2 py-1 text-[11px] font-medium text-stone-600 transition hover:bg-white hover:text-stone-800"
            style={{ borderColor: "#e7e5e4" }}
            title="Clear image"
          >
            Clear
          </button>
        </div>
      </div>
    );
  }

  if (variant === "row" && !has) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          className={`${KIT.ghostButton} w-full justify-center`}
          onClick={() => setUrlMode(true)}
        >
          {emptyLabel}
        </button>
        <MediaPicker
          tenantId={tenantId}
          label="Pick from library"
          onPick={(url) => {
            if (!onPickItem) onChange(url);
          }}
          onPickItem={(item) => {
            if (onPickItem) onPickItem(item);
            else onChange(item.publicUrl);
          }}
        />
        {urlMode ? (
          <input
            type="url"
            placeholder="https://…"
            className={KIT.input}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v) onChange(v);
            }}
          />
        ) : null}
      </div>
    );
  }

  if (!has) {
    return (
      <div className="flex flex-col gap-2">
        <div
          className="flex items-center justify-center rounded-md border border-dashed border-stone-300 bg-stone-50 p-2"
          style={{ aspectRatio: aspect }}
        >
          <div className="flex flex-col items-center gap-2 text-stone-500">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="M21 15l-5-5-11 11" />
            </svg>
            <span className="text-[11px] font-medium">{emptyLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MediaPicker
            tenantId={tenantId}
            label="Pick from library"
            onPick={(url) => {
              if (!onPickItem) onChange(url);
            }}
            onPickItem={(item) => {
              if (onPickItem) onPickItem(item);
              else onChange(item.publicUrl);
            }}
          />
          <button
            type="button"
            onClick={() => setUrlMode((v) => !v)}
            className="rounded-lg border border-[#e5e0d5] bg-[#faf9f6] px-2.5 py-1 text-[11px] font-medium text-stone-600 transition hover:bg-white hover:text-stone-800 hover:border-stone-300"
          >
            {urlMode ? "Hide URL" : "Paste URL"}
          </button>
        </div>
        {urlMode ? (
          <input
            type="url"
            placeholder="https://…"
            className="w-full rounded-lg border border-[#e5e0d5] bg-[#faf9f6] px-2.5 py-1.5 text-xs text-stone-800 placeholder:text-stone-500 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400/15 transition-colors"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v) onChange(v);
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative overflow-hidden rounded-md border border-stone-200 bg-stone-100"
        style={{ aspectRatio: aspect }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={value!}
          alt=""
          className="h-full w-full object-cover"
          onError={(e) => {
            // Graceful degrade: if the URL 404s, still let operator see what's set.
            (e.currentTarget as HTMLImageElement).style.opacity = "0.3";
          }}
        />
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5">
          <MediaPicker
            tenantId={tenantId}
            label="Change"
            onPick={(url) => {
              if (!onPickItem) onChange(url);
            }}
            onPickItem={(item) => {
              if (onPickItem) onPickItem(item);
              else onChange(item.publicUrl);
            }}
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-medium text-stone-800 transition hover:bg-white"
            title="Clear image"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
