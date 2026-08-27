"use client";

/**
 * media-picker-drawer.tsx — the picker's DRAWER CHROME, and nothing else.
 *
 * 2026-08-16 (library unification, seam 2). This file used to be 797 lines: a
 * drawer, a library, a filter bar, a tile renderer, an alt/tag editor and an
 * upload client, all in one component reading a hard-capped 60-item endpoint.
 * The library is now `<MediaLibrary>` (components/media-library/), shared with
 * every other surface that browses assets, and what is left here is the drawer
 * that hosts it plus the two upload transports (staff signed-pipeline vs
 * talent-self) that the ownership model requires be different.
 *
 * The public API is DELIBERATELY UNCHANGED — `MediaField` (seam 4),
 * `MediaPicker` (sections/shared) and `ZodSchemaForm` call sites keep working
 * without edits, and `MediaPickerDialog`'s "Replace image" alias is folded in
 * as the `title` prop it always was.
 *
 * PRESERVED BEHAVIOUR worth naming, because it was hard-won:
 *  • Talent scope reads /api/talent/media/library and renders locked-but-
 *    visible tiles with their reason plus the request-release door. A photo
 *    that quietly is not there is the "I save and nothing changes" class.
 *  • Talent uploads compress first and POST to the talent endpoint (the
 *    /api/admin routes are staff-only), including the localized plan-quota
 *    refusal and the soft 80% notice.
 *  • The plan-quota line renders BEFORE anything refuses, talent scope only.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ImageIcon } from "lucide-react";

import { RequestReleaseButton } from "./media-picker-request-release";
import { describeRejections } from "@/components/media-library/rejection-copy";
import { useT } from "@/i18n/use-t";
import { compressImage } from "@/lib/client/image-compress";
import {
  useMediaUpload,
  type UploadKind,
  type MediaUploadTransport,
} from "@/lib/media/use-media-upload";
import { TalentMediaQuotaLine } from "@/components/talent/media-quota-line";
import { advanceMediaQuota, type MediaQuotaSnapshot } from "@/lib/media/quota-line";

import { Button, Drawer, DrawerBody, DrawerHead, PortaledOverlay, SaveChip } from "./kit";
import { useBuilderMediaScope } from "./builder-media-scope";
import { MediaLibrary } from "@/components/media-library/media-library";
import { LibraryNotice } from "@/components/media-library/media-library-kit";
import { useMediaLibrary } from "@/components/media-library/use-media-library";
import type { MediaLibraryKindFilter } from "@/lib/media/library-item";
import {
  activateSelection,
  addToSelection,
  EMPTY_SELECTION,
  type MediaSelectionState,
} from "@/components/media-library/selection";
import type { MediaLibraryWireItem } from "@/lib/media/library-wire";

/**
 * `t()` returns the KEY itself when a catalog has no entry, so a bare
 * `t(key) || fallback` never reaches the fallback. Compare against the key to
 * tell "missing" from "translated", and fall back to the server's own
 * plain-language English rather than showing a raw dotted key to a talent.
 */
function translateOr(
  t: (key: string) => string,
  key: string,
  fallback: string | null | undefined,
): string {
  const translated = t(key);
  if (translated && translated !== key) return translated;
  return fallback ?? translated;
}

/** File-input accept lists, by surface. Talents stay image-only. */
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
const STAFF_ACCEPT = [
  IMAGE_ACCEPT,
  "video/mp4,video/quicktime,video/webm",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain,text/csv",
].join(",");

export interface MediaPickedItem {
  id: string;
  publicUrl: string;
  width: number | null;
  height: number | null;
  alt?: string | null;
}

/** Upload accept list for a picker opened by a video-only field. */
const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm";

/** The engine-side twin of the `uploadAccept` ternary at the mount below. */
function pickerAllowKinds(
  kind: MediaLibraryKindFilter | undefined,
  isTalentScope: boolean,
): readonly UploadKind[] {
  if (kind === "video") return ["video"];
  if (isTalentScope) return ["image"];
  return ["image", "video", "document"];
}

interface MediaPickerDrawerProps {
  tenantId: string;
  open: boolean;
  title?: string;
  multi?: boolean;
  /**
   * Restrict the drawer to one asset kind. Seeds the library's kind lane AND
   * narrows the upload accept list, so a video-only field never offers a photo
   * upload that the field would then be unable to use. Omitted = the historical
   * "everything" behaviour.
   */
  kind?: MediaLibraryKindFilter;
  onPick: (publicUrl: string) => void;
  onPickItem?: (item: MediaPickedItem) => void;
  onMultiPick?: (publicUrls: string[]) => void;
  onClose: () => void;
}

const TITLE_ID = "media-picker-drawer-title";

export function MediaPickerDrawer({
  tenantId,
  open,
  title = "Media library",
  multi = false,
  kind,
  onPick,
  onPickItem,
  onMultiPick,
  onClose,
}: MediaPickerDrawerProps) {
  // On a Talent Max surface, the picker shows the TALENT's own portfolio +
  // uploads (talent-self endpoint) instead of the staff-only agency library.
  const { talentProfileId } = useBuilderMediaScope();
  const isTalentScope = !!talentProfileId;
  const t = useT();

  const library = useMediaLibrary({
    source: talentProfileId
      ? { kind: "talent", talentProfileId }
      : { kind: "tenant", tenantId },
    active: open,
    initialKind: kind,
  });

  /** Multi-select pending set. The model itself lives in `selection.ts`. */
  const [selection, setSelection] = useState<MediaSelectionState>(EMPTY_SELECTION);
  const [uploadError, setUploadError] = useState<string | null>(null);
  /** Soft 80% plan-quota warning. Not an error: the upload went through. */
  const [quotaNotice, setQuotaNotice] = useState<string | null>(null);
  const [quota, setQuota] = useState<MediaQuotaSnapshot | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // The library payload carries plan usage (B13) — no extra fetch.
  useEffect(() => {
    if (library.quota) setQuota(library.quota as MediaQuotaSnapshot);
  }, [library.quota]);

  const handleClose = useCallback(() => {
    setSelection(EMPTY_SELECTION);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  const pickItem = useCallback(
    (item: MediaLibraryWireItem) => {
      onPick(item.publicUrl);
      onPickItem?.({
        id: item.id,
        publicUrl: item.publicUrl,
        width: item.width,
        height: item.height,
        alt: item.alt ?? null,
      });
      handleClose();
    },
    [handleClose, onPick, onPickItem],
  );

  const onActivate = useCallback(
    (item: MediaLibraryWireItem) => {
      // Single-select commits immediately and holds no state, so it is
      // resolved OUTSIDE the updater — `pickItem` closes the drawer, and a
      // state updater is not a place to run effects.
      if (!multi) {
        const outcome = activateSelection("single", EMPTY_SELECTION, item);
        if (outcome.kind === "commit") pickItem(item);
        return;
      }
      setSelection((prev) => {
        const outcome = activateSelection("multi", prev, item);
        return outcome.kind === "pending" ? outcome.state : prev;
      });
    },
    [multi, pickItem],
  );

  /**
   * Talent-self transport. The agency signed-upload + /api/admin routes are
   * staff-only, so this lane is a plain multipart POST to the talent endpoint
   * — and it is the one upload failure in the app with a LOCALIZED refusal
   * (plan quota), which is exactly why it rides `useMediaUpload`'s `custom`
   * purpose rather than one of the built-in ones.
   *
   * Compress FIRST: raw phone photos (5-15 MB) blow both Vercel's ~4.5 MB
   * request-body cap and the route's own limit.
   */
  const talentTransport = useCallback<MediaUploadTransport>(
    async ({ file, onProgress }) => {
      onProgress({ phase: "compressing" });
      const compressed = await compressImage(file);
      const form = new FormData();
      form.set("talentProfileId", talentProfileId!);
      form.set("file", compressed.file, compressed.file.name || file.name);
      onProgress({ phase: "uploading", bytesTotal: compressed.file.size });
      const res = await fetch("/api/talent/media/upload", {
        method: "POST",
        body: form,
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        if (body.errorCode === "limit_reached") {
          setQuotaNotice(null);
          return {
            ok: false,
            error: translateOr(t, "dashboard.mediaPicker.quotaLimitReached", body.error),
          };
        }
        return { ok: false, error: body.error ?? `HTTP ${res.status}` };
      }
      setQuotaNotice(
        body.quotaWarning
          ? translateOr(
              t,
              "dashboard.mediaPicker.quotaApproachingLimit",
              body.quotaWarning,
            ).replace("{count}", String(body.quotaRemaining ?? 0))
          : null,
      );
      setQuota(advanceMediaQuota); // the photo that just landed counts
      return { ok: true, registered: body.item, publicUrl: body.item?.publicUrl };
    },
    [t, talentProfileId],
  );

  /**
   * The shared engine (seam 3). This drawer used to upload strictly serially
   * in a bare `for` loop with a single boolean `uploading` flag: a 20-file
   * drop took 20 round trips end to end, and the first failure aborted the
   * rest of the batch. The pool runs four at a time and isolates failures.
   */
  const uploader = useMediaUpload({
    purpose: isTalentScope
      ? { kind: "custom", transport: talentTransport }
      : { kind: "cms", tenantId },
    // Mirror `uploadAccept` below exactly. These two are the same promise made
    // twice — the attribute filters the OS dialog, this clears the engine — and
    // when only the attribute said "video" the picker took the file and threw
    // it away without a word.
    allowKinds: pickerAllowKinds(kind, isTalentScope),
    onRejections: (rejections) => setUploadError(describeRejections(rejections, t)),
    onItemReady: (staged) => {
      const item = staged.registered as MediaLibraryWireItem | undefined;
      if (!item) return;
      library.prependItem(item);
      if (multi) setSelection((prev) => addToSelection(prev, item));
    },
  });

  const handleUpload = useCallback(
    async (files: File[]) => {
      setUploadError(null);
      const finished = await uploader.upload(files);
      const failed = finished.filter((it) => it.status === "error");
      if (failed.length > 0) {
        setUploadError(
          failed
            .map((it) => `${it.file.name}: ${it.errorMsg ?? "failed"}`)
            .join(" · ")
            .slice(0, 200),
        );
      }
      // Single-select: a drop of one file is a pick. A drop of several with
      // nowhere to put them stays in the grid rather than picking at random.
      const ready = finished.filter((it) => it.status === "ready");
      if (!multi && files.length === 1 && ready.length === 1) {
        const item = ready[0]!.registered as MediaLibraryWireItem | undefined;
        if (item) pickItem(item);
      }
      uploader.reset();
    },
    [multi, pickItem, uploader],
  );

  const uploading = uploader.uploading;

  const lockNoteFor = useCallback(
    (item: MediaLibraryWireItem): string | null => {
      const lock = library.lockByAssetId.get(item.id);
      if (!lock) return null;
      const workspace = lock.ownerName ?? t("dashboard.mediaPickerLock.aWorkspace");
      const key =
        lock.reason === "master_profile_off"
          ? "dashboard.mediaPickerLock.masterOff"
          : "dashboard.mediaPickerLock.ownedByWorkspace";
      return t(key).replace("{workspace}", workspace);
    },
    [library.lockByAssetId, t],
  );

  const saveAlt = useCallback(
    async (item: MediaLibraryWireItem, alt: string) => {
      setSaveError(null);
      try {
        const res = await fetch(
          isTalentScope ? "/api/talent/media/library" : "/api/admin/media/library",
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              isTalentScope
                ? { talentProfileId, id: item.id, alt }
                : { tenantId, id: item.id, alt },
            ),
          },
        );
        const body = await res.json();
        if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        library.patchItem(item.id, { alt: body.item?.alt ?? alt });
      } catch (e) {
        setSaveError(String(e).slice(0, 200));
      }
    },
    [isTalentScope, library, talentProfileId, tenantId],
  );

  const saveTags = useCallback(
    async (item: MediaLibraryWireItem, tags: string[]) => {
      setSaveError(null);
      try {
        const res = await fetch("/api/admin/media/library", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId, id: item.id, tags }),
        });
        const body = await res.json();
        if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        library.patchItem(item.id, { tags: body.item?.tags ?? tags });
      } catch (e) {
        setSaveError(String(e).slice(0, 200));
      }
    },
    [library, tenantId],
  );

  if (!open) return null;

  const chip = uploading ? (
    <SaveChip
      status="saving"
      label={
        uploader.progressPct != null
          ? `${t("dashboard.mediaLibrary.uploading")} ${uploader.progressPct}%`
          : t("dashboard.mediaLibrary.uploading")
      }
    />
  ) : library.error || uploadError || saveError ? (
    <SaveChip status="error" label="Needs attention" />
  ) : (
    <SaveChip status="count" label={`${library.totalCount} assets`} />
  );

  return (
    // PORTALED. Every inspector-hosted trigger (`MediaField`, the image
    // node's Replace) renders this drawer INSIDE the inspector panel, and that
    // panel is a `FloatingPanelShell`: it carries a drag `transform` and
    // `overflow: hidden`. Per spec the transform makes it the containing block
    // for `position: fixed` descendants, so the drawer re-anchored to the
    // 380px panel and was then clipped by its overflow — live QA measured the
    // 960px drawer painting only between x=980 and x=1300.
    //
    // This predates the rebuild (the old 760px drawer was clipped the same
    // way); it is fixed here because this is the component being rebuilt.
    // `PortaledOverlay` is the kit's existing answer and its own doc names
    // this exact trap.
    <PortaledOverlay>
      <div
        className="fixed inset-0 z-[119] bg-[#242942]/30 backdrop-blur-[1px]"
        aria-hidden
        onClick={handleClose}
      />
      <Drawer
        kind="assets"
        // Wider than the old 760: the grid is 4 columns now and it is browsing
        // a whole library, not a 60-item sample.
        width={960}
        ariaLabelledBy={TITLE_ID}
        open
        zIndex={120}
        testId="media-picker-drawer"
        modal
        onRequestClose={handleClose}
      >
        <DrawerHead
          titleId={TITLE_ID}
          title={title}
          icon={<ImageIcon className="size-3.5" />}
          saveChip={chip}
          meta={
            multi
              ? `${selection.ids.length} selected`
              : isTalentScope
                ? "Your photos"
                : "Workspace media library"
          }
          onClose={handleClose}
        />
        <DrawerBody>
          <MediaLibrary
            library={library}
            variant={isTalentScope ? "talent" : "staff"}
            selectionMode={multi ? "multi" : "single"}
            selectedIds={selection.ids}
            onActivate={onActivate}
            lockNoteFor={lockNoteFor}
            renderLockAction={(item) =>
              isTalentScope && library.lockByAssetId.has(item.id) ? (
                <RequestReleaseButton
                  label={t("dashboard.mediaPickerLock.requestRelease")}
                />
              ) : null
            }
            onSaveAlt={saveAlt}
            onSaveTags={isTalentScope ? undefined : saveTags}
            onUpload={handleUpload}
            uploading={uploading}
            uploadProgressPct={uploader.progressPct}
            uploadHint={
              kind === "video"
                ? t("dashboard.mediaLibrary.uploadHintVideo")
                : isTalentScope
                  ? undefined
                  : t("dashboard.mediaLibrary.uploadHintAssets")
            }
            uploadAccept={
              kind === "video"
                ? VIDEO_ACCEPT
                : isTalentScope
                  ? IMAGE_ACCEPT
                  : STAFF_ACCEPT
            }
            header={
              <div className="grid gap-2">
                {/* B13 — the plan's photo count, BEFORE anything refuses.
                    Talent scope only: the cap is per talent, so staff see
                    nothing rather than a made-up one. */}
                {isTalentScope ? <TalentMediaQuotaLine quota={quota} /> : null}
                {uploadError || saveError ? (
                  <LibraryNotice tone="error">
                    {uploadError ?? saveError}
                  </LibraryNotice>
                ) : quotaNotice ? (
                  <LibraryNotice>{quotaNotice}</LibraryNotice>
                ) : null}
                {multi ? (
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleClose}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={selection.urls.length === 0}
                      onClick={() => {
                        if (selection.urls.length > 0) onMultiPick?.([...selection.urls]);
                        handleClose();
                      }}
                    >
                      Add {selection.ids.length || ""}
                    </Button>
                  </div>
                ) : null}
              </div>
            }
          />
        </DrawerBody>
      </Drawer>
    </PortaledOverlay>
  );
}
