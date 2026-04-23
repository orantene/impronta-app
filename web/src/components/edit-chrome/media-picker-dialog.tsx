"use client";

/**
 * MediaPickerDialog — headless-open variant of the shared MediaPicker.
 *
 * The shared picker owns its own trigger button, which is the right shape
 * for inspector forms but not for canvas-initiated flows like "click image →
 * replace". This variant takes an explicit `open` boolean and fires
 * `onPick(url)` / `onClose()` — no trigger. Library fetch + upload logic is
 * duplicated (rather than refactored out of MediaPicker) because the source
 * component is in wide use by section editors and we don't want to risk a
 * coordinated regression.
 */

import { useCallback, useEffect, useRef, useState } from "react";

interface MediaItem {
  id: string;
  publicUrl: string;
  storagePath: string;
  variantKind: string;
  width: number | null;
  height: number | null;
  createdAt: string;
}

interface Props {
  tenantId: string;
  open: boolean;
  onPick: (publicUrl: string) => void;
  onClose: () => void;
}

export function MediaPickerDialog({ tenantId, open, onPick, onClose }: Props) {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/media/library?tenantId=${encodeURIComponent(tenantId)}`,
        { cache: "no-store" },
      );
      const body = await res.json();
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setItems(body.items as MediaItem[]);
    } catch (e) {
      setError(String(e).slice(0, 200));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!open) return;
    if (items !== null || loading) return;
    void loadLibrary();
  }, [open, items, loading, loadLibrary]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleFileChosen(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.set("tenantId", tenantId);
      form.set("file", file);
      const res = await fetch("/api/admin/media/upload", {
        method: "POST",
        body: form,
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const item = body.item as MediaItem;
      setItems((prev) => [item, ...(prev ?? [])]);
      onPick(item.publicUrl);
    } catch (e) {
      setUploadError(String(e).slice(0, 200));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (!open) return null;

  return (
    <div
      data-edit-overlay="media-picker"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
      role="dialog"
      aria-label="Media library"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-[80vh] w-[min(100%,960px)] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-zinc-100 px-5 py-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Replace image
            </div>
            <h2 className="text-base font-semibold tracking-tight text-zinc-900">
              Media library
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileChosen(file);
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60"
            >
              {uploading ? "Uploading…" : "Upload"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              Cancel
            </button>
          </div>
        </div>

        {uploadError ? (
          <p className="border-b border-red-100 bg-red-50 px-5 py-2 text-xs text-red-700">
            Upload failed — {uploadError}
          </p>
        ) : null}

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : items && items.length > 0 ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {items.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => onPick(m.publicUrl)}
                    className="flex w-full flex-col gap-1 overflow-hidden rounded-lg border border-zinc-200 bg-white p-1 text-left transition hover:border-zinc-900 hover:shadow-md"
                  >
                    <span
                      className="aspect-[3/4] w-full overflow-hidden rounded-md bg-zinc-100 bg-cover bg-center"
                      style={{ backgroundImage: `url(${m.publicUrl})` }}
                      aria-hidden
                    />
                    <span className="px-1 pb-1 text-[10px] text-zinc-500">
                      {m.variantKind}
                      {m.width && m.height ? (
                        <>
                          {" "}
                          · {m.width}×{m.height}
                        </>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-md border border-dashed border-zinc-200 bg-zinc-50 p-8 text-center">
              <p className="text-sm font-medium text-zinc-700">No media yet</p>
              <p className="mt-1 text-xs text-zinc-500">
                Upload an image to start.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
