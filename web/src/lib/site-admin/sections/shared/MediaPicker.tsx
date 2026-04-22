"use client";

/**
 * Shared media picker for section editors.
 *
 * V1: a button that opens a dialog listing the current tenant's approved
 * media_assets. Clicking a tile returns its public URL to the caller (via
 * `onPick`). No upload UI in v1 — agencies with their own imagery upload
 * via the talent-media manager today; a dedicated uploader lands next.
 *
 * Tenant scope: the caller passes `tenantId`. The /api/admin/media/library
 * route verifies it matches the caller's server-resolved tenant scope, so
 * a bad tenantId in props still returns 403 instead of leaking content.
 */

import { useEffect, useState } from "react";
import { ImageIcon, X } from "lucide-react";

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
  /** Called with the picked public URL. */
  onPick: (publicUrl: string) => void;
  /** Shown inside the trigger button. */
  label?: string;
  /** Disable the trigger. */
  disabled?: boolean;
}

export function MediaPicker({
  tenantId,
  onPick,
  label = "Browse library",
  disabled,
}: MediaPickerProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || items !== null || loading) return;
    let cancelled = false;
    async function load() {
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
        if (!cancelled) setItems(body.items as MediaItem[]);
      } catch (e) {
        if (!cancelled) setError(String(e).slice(0, 200));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, items, loading, tenantId]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
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
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="flex h-[80vh] w-[min(100%,960px)] flex-col overflow-hidden rounded-lg border border-border/60 bg-background shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-border/50 px-5 py-3">
              <div>
                <h2 className="text-base font-semibold">Media library</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Approved imagery for this workspace. Click a tile to pick
                  its URL.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
                aria-label="Close media library"
              >
                <X className="size-3.5" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : error ? (
                <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : items && items.length > 0 ? (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {items.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onPick(m.publicUrl);
                          setOpen(false);
                        }}
                        className="group/tile flex w-full flex-col gap-1 overflow-hidden rounded-lg border border-border/60 bg-muted/10 p-1 text-left transition hover:border-foreground/40 hover:bg-muted/20"
                      >
                        <span
                          className="aspect-[3/4] w-full overflow-hidden rounded-md bg-muted/30 bg-cover bg-center"
                          style={{ backgroundImage: `url(${m.publicUrl})` }}
                          aria-hidden
                        />
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
                  ))}
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
