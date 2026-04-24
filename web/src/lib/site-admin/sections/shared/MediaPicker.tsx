"use client";

/**
 * Shared media picker for section editors.
 *
 * Dialog that lists the current tenant's approved media_assets with
 * thumbnails + sizes. Click a tile → caller receives its public URL.
 * Upload button on the dialog toolbar sends the selected file through
 * POST /api/admin/media/upload, prepends the new item to the list, and
 * auto-picks it so the admin's next click is on the section field.
 *
 * Tenant scope: the caller passes `tenantId`. Both /list and /upload
 * verify it matches the caller's server-resolved scope, so a bad
 * tenantId in props returns 403 instead of leaking or landing content.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ImageIcon, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";

interface MediaItem {
  id: string;
  publicUrl: string;
  storagePath: string;
  variantKind: string;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface MediaPickerProps {
  tenantId: string;
  /**
   * Called with the picked public URL (single-select mode).
   * Still required for backward compat; ignored in multi mode if
   * `onMultiPick` is provided.
   */
  onPick: (publicUrl: string) => void;
  /** Shown inside the trigger button. */
  label?: string;
  /** Disable the trigger. */
  disabled?: boolean;
  /**
   * When true the modal stays open and lets the operator select multiple
   * assets. "Add N images" button in the header confirms and calls
   * `onMultiPick` with the ordered URL array.
   */
  multi?: boolean;
  /** Required when `multi` is true. Called with all selected URLs on confirm. */
  onMultiPick?: (publicUrls: string[]) => void;
}

export function MediaPicker({
  tenantId,
  onPick,
  label = "Browse library",
  disabled,
  multi = false,
  onMultiPick,
}: MediaPickerProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Multi-select pending set — URLs selected but not yet confirmed.
  const [pending, setPending] = useState<string[]>([]);

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
    if (!open || items !== null || loading) return;
    void loadLibrary();
  }, [open, items, loading, loadLibrary]);

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
      // Prepend immediately so the uploaded tile is first + highlighted.
      setItems((prev) => [item, ...(prev ?? [])]);
      if (multi) {
        // In multi mode: add to pending set so the operator can confirm in bulk.
        setPending((prev) =>
          prev.includes(item.publicUrl) ? prev : [...prev, item.publicUrl],
        );
      } else {
        // Single mode: auto-pick and close — most common flow is
        // "upload + use it here" in one motion.
        onPick(item.publicUrl);
        setOpen(false);
      }
    } catch (e) {
      setUploadError(String(e).slice(0, 200));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleClose() {
    setOpen(false);
    setPending([]);
  }

  function confirmMulti() {
    if (onMultiPick && pending.length > 0) {
      onMultiPick(pending);
    }
    handleClose();
  }

  function togglePending(url: string) {
    setPending((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url],
    );
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <ImageIcon className="mr-1.5 size-3.5" />
        {label}
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-label="Media library"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div className="flex h-[80vh] w-[min(100%,960px)] flex-col overflow-hidden rounded-lg border border-border/60 bg-background shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-border/50 px-5 py-3">
              <div>
                <h2 className="text-base font-semibold">
                  {multi ? "Pick images" : "Media library"}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {multi
                    ? `Click tiles to select · ${pending.length} selected`
                    : "Upload new imagery or pick from this workspace's library."}
                </p>
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
                <Button
                  type="button"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload an image from your computer"
                >
                  <Upload className="mr-1.5 size-3.5" />
                  {uploading ? "Uploading…" : "Upload"}
                </Button>
                {multi ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleClose}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending.length === 0}
                      onClick={confirmMulti}
                    >
                      Add {pending.length || ""}{" "}
                      {pending.length === 1 ? "image" : "images"}
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleClose}
                    aria-label="Close media library"
                  >
                    <X className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>

            {uploadError ? (
              <p className="border-b border-destructive/40 bg-destructive/10 px-5 py-2 text-sm text-destructive">
                Upload failed — {uploadError}
              </p>
            ) : null}

            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : error ? (
                <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : items && items.length > 0 ? (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {items.map((m) => {
                    const selected = multi && pending.includes(m.publicUrl);
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => {
                            if (multi) {
                              togglePending(m.publicUrl);
                            } else {
                              onPick(m.publicUrl);
                              setOpen(false);
                            }
                          }}
                          className={`group/tile relative flex w-full flex-col gap-1 overflow-hidden rounded-lg border bg-muted/10 p-1 text-left transition hover:bg-muted/20 ${
                            selected
                              ? "border-foreground shadow-[0_0_0_2px] shadow-foreground/60"
                              : "border-border/60 hover:border-foreground/40"
                          }`}
                        >
                          <span
                            className="aspect-[3/4] w-full overflow-hidden rounded-md bg-muted/30 bg-cover bg-center"
                            style={{ backgroundImage: `url(${m.publicUrl})` }}
                            aria-hidden
                          />
                          {/* Multi-select checkmark */}
                          {multi ? (
                            <span
                              className={`absolute right-2 top-2 flex size-5 items-center justify-center rounded-full border-2 transition ${
                                selected
                                  ? "border-foreground bg-foreground text-background"
                                  : "border-border/60 bg-background/80"
                              }`}
                              aria-hidden
                            >
                              {selected ? (
                                <svg
                                  width="10"
                                  height="10"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              ) : null}
                            </span>
                          ) : null}
                          <span className="px-1 pb-1 text-[10px] text-muted-foreground">
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
                    );
                  })}
                </ul>
              ) : (
                <div className="rounded-md border border-dashed border-border/60 bg-muted/10 p-8 text-center">
                  <p className="text-sm font-medium">No media yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Upload imagery via the Talent media manager (or a future
                    dedicated uploader) and it will appear here.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
