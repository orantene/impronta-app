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
 * The public API is DELIBERATELY UNCHANGED — `MediaPickerButton`,
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
import { useT } from "@/i18n/use-t";
import { uploadCmsMedia } from "@/lib/client/signed-upload";
import { compressImage } from "@/lib/client/image-compress";
import { TalentMediaQuotaLine } from "@/components/talent/media-quota-line";
import { advanceMediaQuota, type MediaQuotaSnapshot } from "@/lib/media/quota-line";

import { Button, Drawer, DrawerBody, DrawerHead, PortaledOverlay, SaveChip } from "./kit";
import { useBuilderMediaScope } from "./builder-media-scope";
import { MediaLibrary } from "@/components/media-library/media-library";
import { LibraryNotice } from "@/components/media-library/media-library-kit";
import { useMediaLibrary } from "@/components/media-library/use-media-library";
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

/** MEDIA-1 — infer the upload kind from a chosen file's MIME / extension. */
function detectUploadKind(file: File): "image" | "video" | "document" {
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

interface MediaPickerDrawerProps {
  tenantId: string;
  open: boolean;
  title?: string;
  multi?: boolean;
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
  });

  /** Multi-select pending set. The model itself lives in `selection.ts`. */
  const [selection, setSelection] = useState<MediaSelectionState>(EMPTY_SELECTION);
  const [uploading, setUploading] = useState(false);
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

  async function uploadOne(file: File): Promise<MediaLibraryWireItem> {
    if (isTalentScope) {
      // Talent-self upload — the agency signed-upload + /api/admin routes are
      // staff-only. Compress FIRST: raw phone photos (5-15 MB) blow both
      // Vercel's ~4.5 MB request-body cap and the route's own limit.
      const compressed = await compressImage(file);
      const form = new FormData();
      form.set("talentProfileId", talentProfileId!);
      form.set("file", compressed.file, compressed.file.name || file.name);
      const res = await fetch("/api/talent/media/upload", {
        method: "POST",
        body: form,
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        // A plan-quota refusal is the one upload failure with a localized
        // message: the talent should read this in their own language.
        if (body.errorCode === "limit_reached") {
          setQuotaNotice(null);
          throw new Error(
            translateOr(t, "dashboard.mediaPicker.quotaLimitReached", body.error),
          );
        }
        throw new Error(body.error ?? `HTTP ${res.status}`);
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
      return body.item as MediaLibraryWireItem;
    }

    // MEDIA-1 — route by the file's kind so staff can add video/doc assets.
    const uploadKind = detectUploadKind(file);
    const fast = await uploadCmsMedia({ file, tenantId, kind: uploadKind });
    if (fast.ok) return fast.item as MediaLibraryWireItem;
    if (!fast.fallbackToLegacy) throw new Error(fast.error);

    const form = new FormData();
    form.set("tenantId", tenantId);
    form.set("kind", uploadKind);
    form.set("file", file);
    const res = await fetch("/api/admin/media/upload", {
      method: "POST",
      body: form,
    });
    const body = await res.json();
    if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    return body.item as MediaLibraryWireItem;
  }

  async function handleUpload(files: File[]) {
    setUploading(true);
    setUploadError(null);
    let last: MediaLibraryWireItem | null = null;
    try {
      for (const file of files) {
        const item = await uploadOne(file);
        library.prependItem(item);
        last = item;
        if (multi) setSelection((prev) => addToSelection(prev, item));
      }
      // Single-select: a drop of one file is a pick. A drop of several with
      // nowhere to put them stays in the grid rather than picking at random.
      if (!multi && last && files.length === 1) pickItem(last);
    } catch (e) {
      setUploadError(String(e).slice(0, 200));
    } finally {
      setUploading(false);
    }
  }

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
        const res = await fetch("/api/admin/media/library", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId, id: item.id, alt }),
        });
        const body = await res.json();
        if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        library.patchItem(item.id, { alt: body.item?.alt ?? alt });
      } catch (e) {
        setSaveError(String(e).slice(0, 200));
      }
    },
    [library, tenantId],
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
    <SaveChip status="saving" label="Uploading" />
  ) : library.error || uploadError || saveError ? (
    <SaveChip status="error" label="Needs attention" />
  ) : (
    <SaveChip status="count" label={`${library.totalCount} assets`} />
  );

  return (
    // PORTALED. Every inspector-hosted trigger (`MediaPickerButton`, the image
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
            // Talents can't save alt text — the PATCH endpoint is staff-only
            // (would 401). Passing no handler renders alt read-only instead of
            // an editable field that errors on blur.
            onSaveAlt={isTalentScope ? undefined : saveAlt}
            onSaveTags={isTalentScope ? undefined : saveTags}
            onUpload={handleUpload}
            uploading={uploading}
            uploadAccept={isTalentScope ? IMAGE_ACCEPT : STAFF_ACCEPT}
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
