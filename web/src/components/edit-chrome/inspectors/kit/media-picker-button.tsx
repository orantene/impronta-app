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

import { useState } from "react";

import { MediaPicker } from "@/lib/site-admin/sections/shared/MediaPicker";

interface MediaPickerButtonProps {
  tenantId: string;
  /** Current image URL (null or empty → empty state). */
  value: string | null | undefined;
  onChange: (next: string | null) => void;
  /** Label shown in the empty state tile. */
  emptyLabel?: string;
  /** Aspect ratio for the thumbnail. Defaults to 16/9. */
  aspect?: "16/9" | "4/5" | "1/1" | "21/9";
}

export function MediaPickerButton({
  tenantId,
  value,
  onChange,
  emptyLabel = "Add image",
  aspect = "16/9",
}: MediaPickerButtonProps) {
  const [urlMode, setUrlMode] = useState<boolean>(false);
  const has = Boolean(value && value.trim());

  if (!has) {
    return (
      <div className="flex flex-col gap-2">
        <div
          className="flex items-center justify-center rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-2"
          style={{ aspectRatio: aspect }}
        >
          <div className="flex flex-col items-center gap-2 text-zinc-500">
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
            onPick={(url) => onChange(url)}
          />
          <button
            type="button"
            onClick={() => setUrlMode((v) => !v)}
            className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900"
          >
            {urlMode ? "Hide URL" : "Paste URL"}
          </button>
        </div>
        {urlMode ? (
          <input
            type="url"
            placeholder="https://…"
            className="w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
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
        className="relative overflow-hidden rounded-md border border-zinc-200 bg-zinc-900"
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
            onPick={(url) => onChange(url)}
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-medium text-zinc-800 transition hover:bg-white"
            title="Clear image"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
