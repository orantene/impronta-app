"use client";

/**
 * useMediaUpload — the ONE upload engine for every media surface.
 *
 * The pure part (staging model, file preparation, bounded pool) lives in
 * `./media-upload-engine`; this is the React shell that owns the item list and
 * drives a purpose-appropriate transport over it.
 *
 * PURPOSES
 * ────────
 *  • `talent-staging` — Media page bulk drop. Signed staging PUT, then the
 *    legacy FormData action as a fallback. Nothing is assigned to a talent
 *    here: the batch lands in the parking lot and the assign modal commits it.
 *  • `cms`            — tenant CMS library (picker drawer, page builder).
 *    Signed init/PUT/register, then the legacy multipart route as a fallback.
 *  • `branding`       — workspace brand imagery (Settings → Brand identity).
 *    Signed branding PUT. No legacy fallback exists for this lane and never
 *    did; a failure is reported at the row.
 *  • `custom`         — the caller supplies its own `transport`. Used by the
 *    picker drawer's talent-self lane, which is a different endpoint with a
 *    localized plan-quota refusal the generic lanes know nothing about.
 *
 * PROGRESS IS REAL NOW. Every built-in transport threads `onProgress` into the
 * signed helpers, which thread a reporter into `putToSignedUrl`, which uses
 * XHR when a reporter is present. `item.bytesSent` / `item.bytesTotal` are
 * therefore actual numbers, not the permanently-undefined fields they were
 * from the day `SignedUploadProgress` was declared.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { SignedUploadProgress } from "@/lib/client/signed-upload-core";
import {
  createUploadItems,
  DEFAULT_UPLOAD_CONCURRENCY,
  patchUploadItem,
  prepareUploadFiles,
  revokeUploadItemUrls,
  runUploadPool,
  summarizeUploadItems,
  type MediaUploadItem,
  type PrepareRejection,
  type ZipLoader,
} from "./media-upload-engine";

export type { MediaUploadItem, MediaUploadStatus, PrepareRejection } from "./media-upload-engine";

/** What a transport reports back. `registered` is the purpose's own payload. */
export type MediaUploadTransportResult =
  | {
      ok: true;
      storagePath?: string;
      publicUrl?: string;
      registered?: unknown;
    }
  | { ok: false; error: string };

export type MediaUploadTransport = (ctx: {
  file: File;
  onProgress: (p: SignedUploadProgress) => void;
}) => Promise<MediaUploadTransportResult>;

export type MediaUploadPurpose =
  | { kind: "talent-staging" }
  | { kind: "cms"; tenantId: string }
  | { kind: "branding" }
  | { kind: "custom"; transport: MediaUploadTransport };

export interface UseMediaUploadOptions<Extra> {
  purpose: MediaUploadPurpose;
  /** Per-item state the surface owns (e.g. the Media page's `talentId`). */
  makeExtra?: (file: File, index: number) => Extra;
  concurrency?: number;
  /** Media page only — the other surfaces have no zip affordance. */
  allowZip?: boolean;
  /** Test seam for zip extraction. */
  loadZip?: ZipLoader;
  /** Fires per successful item, in completion order, before the batch ends. */
  onItemReady?: (item: MediaUploadItem<Extra>) => void;
  /** Fires once per `upload()` with everything prepare() held back. */
  onRejections?: (rejections: PrepareRejection[]) => void;
}

export interface UseMediaUpload<Extra> {
  items: Array<MediaUploadItem<Extra>>;
  /** True from the first queued file until the last worker settles. */
  uploading: boolean;
  summary: { total: number; inFlight: number; ready: number; errors: number };
  /**
   * Prepare + stage + run a batch. Resolves with the finished item list (the
   * same objects the `items` state ends on), so a caller that needs the
   * outcome does not have to race a state update to read it.
   */
  upload: (files: File[] | FileList) => Promise<Array<MediaUploadItem<Extra>>>;
  /** Edit one item's surface-owned state mid-flight (e.g. reassign a talent). */
  patch: (id: string, patch: Partial<MediaUploadItem<Extra>>) => void;
  /** Drop the batch and free its object URLs. */
  reset: () => void;
}

export function useMediaUpload<Extra = Record<string, never>>(
  options: UseMediaUploadOptions<Extra>,
): UseMediaUpload<Extra> {
  const [items, setItems] = useState<Array<MediaUploadItem<Extra>>>([]);
  const [uploading, setUploading] = useState(false);

  // The batch runs off a ref so the workers read the LIVE list rather than the
  // list captured when `upload()` was called — the Media page's assign modal
  // edits `talentId` while bytes are still moving, and a stale closure would
  // hand `confirmStaging` the pre-edit values.
  //
  // Options are captured the same way: a caller that inlines `makeExtra` (all
  // of them do) must not give `upload` a new identity on every render.
  //
  // Both are written in an EFFECT, not during render (`react-hooks/refs`).
  // That is safe here because nothing reads them during render — only the
  // async pool and the callbacks below do, and effects have flushed by then.
  const itemsRef = useRef(items);
  const optionsRef = useRef(options);
  useEffect(() => {
    itemsRef.current = items;
    optionsRef.current = options;
  });

  // Free object URLs if the surface unmounts mid-batch. Without this a user
  // who closes the drawer during a 200-photo drop keeps every decoded bitmap
  // alive until the tab dies.
  useEffect(() => {
    return () => revokeUploadItemUrls(itemsRef.current);
  }, []);

  const patch = useCallback((id: string, next: Partial<MediaUploadItem<Extra>>) => {
    setItems((prev) => patchUploadItem(prev, id, next));
  }, []);

  const reset = useCallback(() => {
    setItems((prev) => {
      revokeUploadItemUrls(prev);
      return [];
    });
  }, []);

  const upload = useCallback(
    async (input: File[] | FileList): Promise<Array<MediaUploadItem<Extra>>> => {
      const opts = optionsRef.current;
      const prepared = await prepareUploadFiles(input, {
        allowZip: opts.allowZip,
        loadZip: opts.loadZip,
      });
      if (prepared.rejections.length > 0) opts.onRejections?.(prepared.rejections);
      if (prepared.aborted || prepared.files.length === 0) return [];

      const makeExtra =
        opts.makeExtra ?? ((() => ({}) as Extra) as (f: File, i: number) => Extra);
      const batch = createUploadItems<Extra>(prepared.files, makeExtra);
      setItems(batch);
      setUploading(true);

      const transport = resolveTransport(opts.purpose);

      /**
       * The authoritative outcome per item, recorded synchronously as each
       * worker settles.
       *
       * `upload()` must NOT resolve with `itemsRef.current`: that ref is
       * written from an effect, and the last worker's `patch` has not
       * necessarily re-rendered (let alone flushed its effect) by the time the
       * pool's promise resolves. A caller reading the ref would see the
       * second-to-last item's state and, on the Media page, commit a staging
       * list that was still filling in. This map has no such race.
       */
      const outcomes = new Map<string, Partial<MediaUploadItem<Extra>>>();

      const runOne = async (staged: MediaUploadItem<Extra>) => {
        patch(staged.id, { status: "compressing" } as Partial<MediaUploadItem<Extra>>);
        const result = await transport({
          file: staged.file,
          onProgress: (p) => {
            // One place maps transport phases onto item status, so every
            // surface reports the same vocabulary for the same moment.
            const next: Partial<MediaUploadItem<Extra>> = {
              status: p.phase === "compressing" ? "compressing" : p.phase,
            } as Partial<MediaUploadItem<Extra>>;
            if (p.bytesTotal != null) {
              (next as { bytesTotal?: number | null }).bytesTotal = p.bytesTotal;
            }
            if (p.bytesSent != null) {
              (next as { bytesSent?: number }).bytesSent = p.bytesSent;
            }
            patch(staged.id, next);
          },
        });

        if (!result.ok) {
          const failed = {
            status: "error",
            errorMsg: result.error,
          } as Partial<MediaUploadItem<Extra>>;
          outcomes.set(staged.id, failed);
          patch(staged.id, failed);
          return;
        }
        const done = {
          status: "ready",
          storagePath: result.storagePath,
          publicUrl: result.publicUrl,
          registered: result.registered,
        } as Partial<MediaUploadItem<Extra>>;
        outcomes.set(staged.id, done);
        patch(staged.id, done);
        // Surface state (the Media page's `talentId`) may already have been
        // edited while this file was in flight — prefer the live item.
        const live = itemsRef.current.find((it) => it.id === staged.id) ?? staged;
        opts.onItemReady?.({ ...live, ...done });
      };

      await runUploadPool(batch, runOne, opts.concurrency ?? DEFAULT_UPLOAD_CONCURRENCY);
      setUploading(false);

      // Merge: batch identity + any live surface edits + the settled outcome.
      return batch.map((staged) => {
        const live = itemsRef.current.find((it) => it.id === staged.id) ?? staged;
        return { ...live, ...(outcomes.get(staged.id) ?? {}) };
      });
    },
    [patch],
  );

  return {
    items,
    uploading,
    summary: summarizeUploadItems(items),
    upload,
    patch,
    reset,
  };
}

// ── Built-in transports ─────────────────────────────────────────────────

function resolveTransport(purpose: MediaUploadPurpose): MediaUploadTransport {
  switch (purpose.kind) {
    case "custom":
      return purpose.transport;
    case "branding":
      return brandingTransport;
    case "cms":
      return cmsTransport(purpose.tenantId);
    case "talent-staging":
    default:
      return stagingTransport;
  }
}

/** Media page bulk drop: signed staging PUT → legacy FormData action. */
const stagingTransport: MediaUploadTransport = async ({ file, onProgress }) => {
  const { uploadStagingMedia } = await import("@/lib/client/signed-upload");
  const result = await uploadStagingMedia({ file, onProgress });
  if (result.ok) {
    return {
      ok: true,
      storagePath: result.storagePath,
      publicUrl: result.publicUrl,
      registered: result.meta,
    };
  }
  // Auth / config / quota failures are decisions, not transport hiccups —
  // the legacy action would fail identically and the user needs the reason.
  if (!result.fallbackToLegacy) return { ok: false, error: result.error };

  onProgress({ phase: "uploading" });
  const { actionUploadToStagingStorage } = await import(
    "@/app/(workspace)/[tenantSlug]/admin/media/actions"
  );
  const fd = new FormData();
  // THE legacy fallback the rule grandfathers. Reached only when the signed
  // lane reported `fallbackToLegacy` (no canvas API, PUT threw); the action
  // does the server-side resize. Moved here verbatim from media-page.tsx,
  // which carried the same grandfathered suppression before seam 3.
  // eslint-disable-next-line ratchet/no-raw-file-formdata
  fd.append("file", file);
  try {
    const legacy = await actionUploadToStagingStorage(fd);
    if (!legacy.ok) return { ok: false, error: legacy.error };
    return {
      ok: true,
      storagePath: legacy.data.storagePath,
      publicUrl: legacy.data.publicUrl,
      registered: legacy.data.meta,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

/** CMS library: signed init/PUT/register → legacy multipart route. */
function cmsTransport(tenantId: string): MediaUploadTransport {
  return async ({ file, onProgress }) => {
    const { uploadCmsMedia } = await import("@/lib/client/signed-upload");
    const kind = detectUploadKind(file);
    const fast = await uploadCmsMedia({ file, tenantId, kind, onProgress });
    if (fast.ok) {
      return {
        ok: true,
        publicUrl: fast.item.publicUrl,
        storagePath: fast.item.storagePath,
        registered: fast.item,
      };
    }
    if (!fast.fallbackToLegacy) return { ok: false, error: fast.error };

    onProgress({ phase: "uploading" });
    const form = new FormData();
    form.set("tenantId", tenantId);
    form.set("kind", kind);
    // Same legacy fallback, CMS lane. Moved verbatim from
    // media-picker-drawer.tsx, which carried the same suppression.
    // eslint-disable-next-line ratchet/no-raw-file-formdata
    form.set("file", file);
    try {
      const res = await fetch("/api/admin/media/upload", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        return { ok: false, error: body?.error ?? `HTTP ${res.status}` };
      }
      return {
        ok: true,
        publicUrl: body.item?.publicUrl,
        storagePath: body.item?.storagePath,
        registered: body.item,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  };
}

/** Brand imagery. No legacy lane exists for this purpose. */
const brandingTransport: MediaUploadTransport = async ({ file, onProgress }) => {
  const { uploadBrandingMedia } = await import("@/lib/client/signed-upload");
  const result = await uploadBrandingMedia({ file, onProgress });
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    publicUrl: result.asset.publicUrl,
    registered: result.asset,
  };
};

/** MEDIA-1 — infer the upload kind from a chosen file's MIME / extension. */
export function detectUploadKind(file: File): "image" | "video" | "document" {
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  if (
    mime === "application/pdf" ||
    mime.startsWith("application/vnd.") ||
    mime === "application/msword" ||
    mime === "text/plain" ||
    mime === "text/csv"
  ) {
    return "document";
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (["mp4", "mov", "webm", "avi", "mkv", "m4v"].includes(ext)) return "video";
  if (["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv"].includes(ext)) {
    return "document";
  }
  return "image";
}
