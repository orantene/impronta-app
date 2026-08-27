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
  MEDIA_DOCUMENT_MAX_BYTES,
  MEDIA_VIDEO_MAX_BYTES,
} from "@/lib/site-admin/media/validation";
import {
  createUploadItems,
  DEFAULT_UPLOAD_CONCURRENCY,
  patchUploadItem,
  prepareUploadFiles,
  revokeUploadItemUrls,
  classifyUploadKind,
  type UploadKind,
  runUploadPool,
  summarizeUploadItems,
  type MediaUploadItem,
  type NoUploadExtra,
  type PrepareRejection,
  type ZipLoader,
} from "./media-upload-engine";

export type {
  MediaUploadItem,
  MediaUploadStatus,
  PrepareRejection,
  UploadKind,
} from "./media-upload-engine";

/**
 * Default per-kind caps for every surface on this hook, tied to the SERVER
 * constants so client refusal and server 413 can never disagree. Image is
 * capped on the raw pick (in-browser compression shrinks it before the PUT),
 * so it stays deliberately generous.
 */
export const DEFAULT_UPLOAD_MAX_BYTES: Partial<Record<UploadKind, number>> = {
  image: 30 * 1024 * 1024,
  video: MEDIA_VIDEO_MAX_BYTES,
  document: MEDIA_DOCUMENT_MAX_BYTES,
};

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
  /**
   * Kinds this surface accepts. Omit for images only.
   *
   * Set it wherever the surface advertises more than images — an `accept`
   * attribute or a Videos/Documents tab is a promise, and the engine drops
   * (with a reported rejection) every kind not listed here.
   */
  allowKinds?: readonly UploadKind[];
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
   * Whole-batch progress, 0–100, or null when idle / before any byte totals
   * are known. Bytes actually sent over every item that reported a total,
   * with settled items counted as complete — so it never runs backwards when
   * a fast small file finishes before a big one reports in.
   */
  progressPct: number | null;
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

export function useMediaUpload<Extra = NoUploadExtra>(
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
        allowKinds: opts.allowKinds,
        maxBytesByKind: DEFAULT_UPLOAD_MAX_BYTES,
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

  let progressPct: number | null = null;
  if (uploading && items.length > 0) {
    let sent = 0;
    let total = 0;
    for (const it of items) {
      if (it.status === "ready" || it.status === "error") {
        // Settled: count as its own full weight (use bytesTotal when known,
        // else the raw file size) so the bar keeps moving monotonically.
        const w = it.bytesTotal ?? it.file.size;
        sent += w;
        total += w;
      } else {
        const w = it.bytesTotal ?? it.file.size;
        total += w;
        sent += Math.min(it.bytesSent, w);
      }
    }
    if (total > 0) progressPct = Math.min(100, Math.round((sent / total) * 100));
  }

  return {
    items,
    uploading,
    summary: summarizeUploadItems(items),
    progressPct,
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

/**
 * MEDIA-1 — infer the upload kind from a chosen file.
 *
 * Delegates to the engine's classifier so the gate that decides whether a file
 * is allowed through and the switch that picks its server lane can never drift
 * apart. Kept exported: callers outside the hook import it by this name.
 */
export function detectUploadKind(file: File): UploadKind {
  // The gate returns null for anything no lane takes; by the time a file
  // reaches a transport it has already passed that gate, so the remaining
  // job is only to name a lane. "image" is the historical default.
  return classifyUploadKind(file) ?? "image";
}
