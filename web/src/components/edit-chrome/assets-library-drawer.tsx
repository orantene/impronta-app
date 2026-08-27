"use client";

/**
 * assets-library-drawer.tsx — the left rail's "Assets" surface, rebuilt on the
 * ONE shared media library.
 *
 * WHAT THIS REPLACES
 * ──────────────────
 * `assets-drawer.tsx` (1,244 lines, deleted in the same commit) was the media
 * library the page builder shipped BEFORE the 2026-08-16 unification. It read
 * `loadAssetsLibraryAction` → `listTenantMediaLibrary`, which is `.limit(60)`,
 * and then filtered that array in the browser behind five hard-coded tabs. On
 * the largest tenant (~1,900 assets) that made ~97% of the library unreachable,
 * captioned what it did show with raw UUID storage filenames, and had no
 * folders, no talent filter, no ownership lane and no drag-and-drop upload.
 *
 * Meanwhile every PICKER field already opened `<MediaLibrary>`, which has all
 * of that. Two library UIs shipped side by side and the worse one was the more
 * discoverable — the left rail is where an operator goes to "look at my media".
 * So the ENTRY POINT is unchanged (same ⌘L, same `panel=assets` deep link, same
 * dock button, same floating/dockable "assets" panel id) and only what opens
 * changed.
 *
 * BROWSE, NOT PICK. `selectionMode="none"`: there is no field waiting for a
 * URL here, so a tile click opens the detail rail instead of committing a pick.
 *
 * THE TWO CAPABILITIES CARRIED OVER FROM THE OLD DRAWER
 *   • Crop — was a hover chip on every raster tile. It is now an action in the
 *     shared detail rail (`media-library-detail.tsx`), so every surface that
 *     mounts the library with an `onCrop` handler gets it. The modal and the
 *     "cropped result uploads as a NEW asset" pipeline below are the old
 *     drawer's, unchanged.
 *   • Copy URL — was buried behind the old multi-select mode. Also in the
 *     detail rail now, one click, no mode.
 *   • Usage badges — see `useAssetUsage` below. The old scanner was
 *     O(sections × WHOLE library) and only survivable because of the 60-asset
 *     cap; it is re-implemented per visible page.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { FolderOpen } from "lucide-react";

import { Drawer, DrawerBody, DrawerHead, SaveChip } from "./kit";
import { CHROME, CHROME_RADII } from "./kit/tokens";
import { useEditContext } from "./edit-context";
import { ImageCropModal } from "./image-crop";
import { useT } from "@/i18n/use-t";
import { MediaLibrary } from "@/components/media-library/media-library";
import { LibraryNotice } from "@/components/media-library/media-library-kit";
import { useMediaLibrary } from "@/components/media-library/use-media-library";
import { useMediaUpload } from "@/lib/media/use-media-upload";
import { describeRejections } from "@/components/media-library/rejection-copy";
import { scanAssetUsageAction } from "@/lib/site-admin/edit-mode/assets-actions";
import type { MediaLibraryWireItem } from "@/lib/media/library-wire";

const TITLE_ID = "assets-drawer-title";


/** Staff lane accepts everything the CMS upload route accepts. */
const STAFF_ACCEPT = [
  "image/jpeg,image/png,image/webp,image/gif,image/avif,image/svg+xml",
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

/**
 * "Used in N sections" / "Unused", scanned ONE VISIBLE PAGE AT A TIME.
 *
 * The retired drawer fired a single no-argument scan that walked the whole
 * library against every section. Ported naively over a library that now pages
 * past 60 assets, that is a quadratic request that grows with the tenant. This
 * asks only about assets the operator can actually see, remembers every answer
 * for the life of the drawer, and never asks about the same asset twice — so
 * paging costs one bounded request per page and idle scrolling costs nothing.
 *
 * An asset with no answer yet (in flight, or the scan failed) gets NO badge
 * rather than an "Unused" one. "Unused" is a claim an operator may delete on.
 */
function useAssetUsage(items: ReadonlyArray<MediaLibraryWireItem>, active: boolean) {
  const [usage, setUsage] = useState<Record<string, number>>({});
  const askedRef = useRef<Set<string>>(new Set());

  // A closed drawer forgets its answers: sections change while it is shut, and
  // a stale "Unused" is the dangerous direction to be wrong in.
  useEffect(() => {
    if (active) return;
    askedRef.current = new Set();
    setUsage({});
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const pending = items.filter((item) => !askedRef.current.has(item.id));
    if (pending.length === 0) return;
    for (const item of pending) askedRef.current.add(item.id);
    let cancelled = false;
    void (async () => {
      const res = await scanAssetUsageAction(
        pending.map((item) => ({ id: item.id, storagePath: item.storagePath })),
      );
      if (cancelled || !res.ok) return;
      setUsage((prev) => ({ ...prev, ...res.usage }));
    })();
    return () => {
      cancelled = true;
    };
  }, [active, items]);

  /** A just-uploaded asset is referenced by nothing — say so without a scan. */
  const markUnused = useCallback((id: string) => {
    askedRef.current.add(id);
    setUsage((prev) => ({ ...prev, [id]: 0 }));
  }, []);

  return { usage, markUnused };
}

export function AssetsLibraryDrawer() {
  const { assetsOpen, closeAssets, tenantId } = useEditContext();
  const t = useT();

  const library = useMediaLibrary({
    source: { kind: "tenant", tenantId },
    active: assetsOpen,
  });

  const { usage, markUnused } = useAssetUsage(library.items, assetsOpen);

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Brief "Uploaded" confirmation. The old behaviour ended an upload by
  // silently reverting the chip to the asset count, which is how "did it
  // finish or did it die?" became a support question.
  const [justUploaded, setJustUploaded] = useState(false);
  useEffect(() => {
    if (!justUploaded) return;
    const timer = setTimeout(() => setJustUploaded(false), 2500);
    return () => clearTimeout(timer);
  }, [justUploaded]);

  // In-editor crop. The cropped result goes through the SAME upload pipeline
  // as any other file and lands as a NEW asset — the original is never
  // overwritten, which is the behaviour the old drawer had and the one an
  // operator expects from a library.
  const [cropTarget, setCropTarget] = useState<MediaLibraryWireItem | null>(null);
  const [cropSaving, setCropSaving] = useState(false);
  const [cropError, setCropError] = useState<string | null>(null);

  const uploader = useMediaUpload({
    purpose: { kind: "cms", tenantId },
    // STAFF_ACCEPT advertises video and documents and the CMS transport has a
    // lane for both, so the engine must clear them. Without this the drawer
    // takes a video, drops it in `prepareUploadFiles`, and reports nothing.
    allowKinds: ["image", "video", "document"],
    onRejections: (rejections) => setUploadError(describeRejections(rejections, t)),
    onItemReady: (staged) => {
      const item = staged.registered as MediaLibraryWireItem | undefined;
      if (!item) return;
      library.prependItem(item);
      markUnused(item.id);
    },
  });

  const handleUpload = useCallback(
    async (files: File[]): Promise<boolean> => {
      setUploadError(null);
      const finished = await uploader.upload(files);
      const failed = finished.filter((it) => it.status === "error");
      if (finished.length > 0 && failed.length === 0) setJustUploaded(true);
      if (failed.length > 0) {
        setUploadError(
          failed
            .map((it) => `${it.file.name}: ${it.errorMsg ?? "failed"}`)
            .join(" · ")
            .slice(0, 200),
        );
      }
      uploader.reset();
      return failed.length === 0;
    },
    [uploader],
  );

  const handleCropSave = useCallback(
    async (file: File) => {
      setCropSaving(true);
      setCropError(null);
      const ok = await handleUpload([file]);
      setCropSaving(false);
      if (ok) setCropTarget(null);
      else setCropError(t("dashboard.mediaLibrary.cropSaveFailed"));
    },
    [handleUpload, t],
  );

  const saveField = useCallback(
    async (item: MediaLibraryWireItem, patch: { alt?: string; tags?: string[] }) => {
      setSaveError(null);
      try {
        const res = await fetch("/api/admin/media/library", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId, id: item.id, ...patch }),
        });
        const body = await res.json();
        if (!res.ok || !body.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        library.patchItem(item.id, {
          ...(patch.alt !== undefined ? { alt: body.item?.alt ?? patch.alt } : {}),
          ...(patch.tags !== undefined ? { tags: body.item?.tags ?? patch.tags } : {}),
        });
      } catch (e) {
        setSaveError(String(e).slice(0, 200));
      }
    },
    [library, tenantId],
  );

  const saveAlt = useCallback(
    (item: MediaLibraryWireItem, alt: string) => saveField(item, { alt }),
    [saveField],
  );
  const saveTags = useCallback(
    (item: MediaLibraryWireItem, tags: string[]) => saveField(item, { tags }),
    [saveField],
  );

  const renderTileBadge = useCallback(
    (item: MediaLibraryWireItem) => {
      const count = usage[item.id];
      if (count === undefined) return null;
      return <UsageBadge count={count} t={t} />;
    },
    [t, usage],
  );

  if (!assetsOpen) return null;

  const uploading = uploader.uploading;
  const chip = uploading ? (
    <SaveChip
      status="saving"
      label={
        uploader.progressPct != null
          ? `${t("dashboard.mediaLibrary.uploading")} ${uploader.progressPct}%`
          : t("dashboard.mediaLibrary.uploading")
      }
    />
  ) : justUploaded ? (
    <SaveChip status="saved" label={t("dashboard.mediaLibrary.uploadedChip")} />
  ) : library.error || uploadError || saveError ? (
    <SaveChip status="error" label={t("dashboard.mediaLibrary.needsAttention")} />
  ) : (
    <SaveChip
      status="count"
      label={t("dashboard.mediaLibrary.assetCount").replace(
        "{count}",
        String(library.totalCount),
      )}
    />
  );

  return (
    <Drawer
      kind="assets"
      open={assetsOpen}
      zIndex={87}
      ariaLabelledBy={TITLE_ID}
      testId="assets-drawer"
      onRequestClose={uploading ? undefined : closeAssets}
      floating
      floatLabel="Assets"
      floatPanelId="assets"
    >
      <DrawerHead
        titleId={TITLE_ID}
        title={t("dashboard.mediaLibrary.assetsTitle")}
        icon={<FolderOpen className="size-3.5" />}
        saveChip={chip}
        meta={t("dashboard.mediaLibrary.assetsMeta")}
        onClose={uploading ? undefined : closeAssets}
      />
      <DrawerBody>
        <MediaLibrary
          library={library}
          variant="staff"
          selectionMode="none"
          selectedIds={[]}
          // Browse mode: the library itself opens the detail rail on activate.
          onActivate={() => {}}
          lockNoteFor={() => null}
          onSaveAlt={saveAlt}
          onSaveTags={saveTags}
          onCrop={(item) => {
            setCropError(null);
            setCropTarget(item);
          }}
          renderTileBadge={renderTileBadge}
          onUpload={async (files) => {
            await handleUpload(files);
          }}
          uploading={uploading}
          uploadProgressPct={uploader.progressPct}
          uploadHint={t("dashboard.mediaLibrary.uploadHintAssets")}
          uploadAccept={STAFF_ACCEPT}
          header={
            uploadError || saveError ? (
              <LibraryNotice tone="error">{uploadError ?? saveError}</LibraryNotice>
            ) : null
          }
        />
      </DrawerBody>

      {cropTarget ? (
        <ImageCropModal
          src={cropTarget.publicUrl}
          name={cropTarget.originalFilename ?? cropTarget.storagePath}
          saving={cropSaving}
          error={cropError}
          onSave={(file) => void handleCropSave(file)}
          onClose={() => {
            if (cropSaving) return;
            setCropTarget(null);
            setCropError(null);
          }}
        />
      ) : null}
    </Drawer>
  );
}

function UsageBadge({ count, t }: { count: number; t: (key: string) => string }) {
  const used = count > 0;
  const label = used
    ? t("dashboard.mediaLibrary.usedBadge").replace("{count}", String(count))
    : t("dashboard.mediaLibrary.unusedBadge");
  return (
    <span
      title={
        used
          ? t("dashboard.mediaLibrary.usedBadgeTitle").replace("{count}", String(count))
          : t("dashboard.mediaLibrary.unusedBadgeTitle")
      }
      style={{
        display: "inline-block",
        padding: "1px 5px",
        fontSize: 9.5,
        fontWeight: 600,
        borderRadius: CHROME_RADII.sm,
        background: used ? CHROME.greenBg : "rgba(255,255,255,0.88)",
        color: used ? CHROME.green : CHROME.muted,
        border: `1px solid ${used ? CHROME.greenLine : CHROME.line}`,
        backdropFilter: "blur(8px)",
      }}
    >
      {label}
    </span>
  );
}
