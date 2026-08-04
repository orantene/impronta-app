"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  FileText,
  FolderOpen,
  ImageIcon,
  Loader2,
  Play,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { uploadCmsMedia } from "@/lib/client/signed-upload";
import { compressImage } from "@/lib/client/image-compress";

import {
  CHROME,
  Drawer,
  DrawerBody,
  DrawerHead,
  DrawerSkeletonGrid,
  SaveChip,
} from "./kit";
import { KIT } from "./inspectors/kit/tokens";
import { useBuilderMediaScope } from "./builder-media-scope";
import {
  AlbumButton,
  detectUploadKind,
  IMAGE_ACCEPT,
  KindButton,
  MediaThumb,
  pickerKind,
  SourceButton,
  STAFF_ACCEPT,
  StatePanel,
  StatusNotice,
  TagEditor,
  type MediaPickerAssetKind,
  type MediaPickerFolder,
  type MediaPickerItem,
} from "./media-picker-kit";

// Re-export so existing importers of the picker types keep working.
export type { MediaPickerAssetKind, MediaPickerFolder, MediaPickerItem };

/** Talent picker source filter (only used when on a Talent Max surface). */
type TalentSource = "all" | "portfolio" | "mine";

/** MEDIA-1 — library kind filter (staff/agency surfaces). */
type KindFilter = "all" | MediaPickerAssetKind;

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

  const [items, setItems] = useState<MediaPickerItem[] | null>(null);
  const [folders, setFolders] = useState<MediaPickerFolder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [portfolioAssetIds, setPortfolioAssetIds] = useState<string[]>([]);
  const [talentSource, setTalentSource] = useState<TalentSource>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pending, setPending] = useState<string[]>([]);
  const [altDrafts, setAltDrafts] = useState<Record<string, string>>({});
  const [savingAltId, setSavingAltId] = useState<string | null>(null);
  const [altError, setAltError] = useState<string | null>(null);
  // MEDIA-1 central tag manager — per-item draft + a new-tag input buffer.
  const [tagInputs, setTagInputs] = useState<Record<string, string>>({});
  const [savingTagId, setSavingTagId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = talentProfileId
        ? `/api/talent/media/library?talentProfileId=${encodeURIComponent(talentProfileId)}`
        : `/api/admin/media/library?tenantId=${encodeURIComponent(tenantId)}`;
      const res = await fetch(endpoint, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const loaded = (body.items as MediaPickerItem[]) ?? [];
      setItems(loaded);
      setFolders((body.folders ?? []) as MediaPickerFolder[]);
      setPortfolioAssetIds((body.portfolioAssetIds ?? []) as string[]);
      setAltDrafts(
        Object.fromEntries(loaded.map((item) => [item.id, item.alt ?? ""])),
      );
      setTagInputs(Object.fromEntries(loaded.map((item) => [item.id, ""])));
    } catch (e) {
      setError(String(e).slice(0, 200));
    } finally {
      setLoading(false);
    }
  }, [tenantId, talentProfileId]);

  useEffect(() => {
    if (!open || items !== null || loading) return;
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
      let item: MediaPickerItem;
      if (isTalentScope) {
        // Talent-self upload — the agency signed-upload + /api/admin routes are
        // staff-only. POST to the talent endpoint, which owns the row to this
        // talent so it lands in "My uploads". Compress FIRST: raw phone photos
        // (5-15 MB) blow both Vercel's ~4.5 MB request-body cap and the
        // route's 5 MB limit; post-compression bytes are ~150 KB.
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
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        item = body.item as MediaPickerItem;
      } else {
        // MEDIA-1 — route by the file's kind so staff can add video/doc assets,
        // not just images. The shared signed pipeline + legacy fallback both
        // accept the `kind` discriminant.
        const uploadKind = detectUploadKind(file);
        const fast = await uploadCmsMedia({ file, tenantId, kind: uploadKind });
        if (fast.ok) {
          item = fast.item as MediaPickerItem;
        } else if (!fast.fallbackToLegacy) {
          throw new Error(fast.error);
        } else {
          const form = new FormData();
          form.set("tenantId", tenantId);
          form.set("kind", uploadKind);
          form.set("file", file);
          const res = await fetch("/api/admin/media/upload", {
            method: "POST",
            body: form,
          });
          const body = await res.json();
          if (!res.ok || !body.ok) {
            throw new Error(body.error ?? `HTTP ${res.status}`);
          }
          item = body.item as MediaPickerItem;
        }
      }
      setActiveFolderId("all");
      setKindFilter("all");
      setItems((prev) => [item, ...(prev ?? [])]);
      setAltDrafts((prev) => ({ ...prev, [item.id]: item.alt ?? "" }));
      setTagInputs((prev) => ({ ...prev, [item.id]: "" }));
      if (multi) {
        setPending((prev) =>
          prev.includes(item.publicUrl) ? prev : [...prev, item.publicUrl],
        );
      } else {
        pickItem(item);
      }
    } catch (e) {
      setUploadError(String(e).slice(0, 200));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleClose() {
    setPending([]);
    onClose();
  }

  function pickItem(item: MediaPickerItem) {
    onPick(item.publicUrl);
    onPickItem?.({
      id: item.id,
      publicUrl: item.publicUrl,
      width: item.width,
      height: item.height,
      alt: item.alt ?? null,
    });
    handleClose();
  }

  function togglePending(url: string) {
    setPending((prev) =>
      prev.includes(url) ? prev.filter((value) => value !== url) : [...prev, url],
    );
  }

  function confirmMulti() {
    if (pending.length > 0) onMultiPick?.(pending);
    handleClose();
  }

  async function commitAlt(item: MediaPickerItem) {
    const nextAlt = (altDrafts[item.id] ?? "").trim();
    if (nextAlt === (item.alt ?? "")) return;
    setSavingAltId(item.id);
    setAltError(null);
    try {
      const res = await fetch("/api/admin/media/library", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, id: item.id, alt: nextAlt }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const updated = body.item as MediaPickerItem;
      setItems((prev) =>
        (prev ?? []).map((candidate) =>
          candidate.id === updated.id ? { ...candidate, alt: updated.alt } : candidate,
        ),
      );
      setAltDrafts((prev) => ({ ...prev, [updated.id]: updated.alt ?? "" }));
    } catch (e) {
      setAltError(String(e).slice(0, 200));
    } finally {
      setSavingAltId(null);
    }
  }

  // MEDIA-1 — persist the full tag list for one asset (central tag manager).
  async function commitTags(item: MediaPickerItem, nextTags: string[]) {
    setSavingTagId(item.id);
    setAltError(null);
    try {
      const res = await fetch("/api/admin/media/library", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, id: item.id, tags: nextTags }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const updated = body.item as MediaPickerItem;
      setItems((prev) =>
        (prev ?? []).map((candidate) =>
          candidate.id === updated.id
            ? { ...candidate, tags: updated.tags ?? [] }
            : candidate,
        ),
      );
    } catch (e) {
      setAltError(String(e).slice(0, 200));
    } finally {
      setSavingTagId(null);
    }
  }

  function addTag(item: MediaPickerItem) {
    const raw = (tagInputs[item.id] ?? "").trim().toLowerCase();
    if (!raw) return;
    const existing = item.tags ?? [];
    if (existing.includes(raw)) {
      setTagInputs((prev) => ({ ...prev, [item.id]: "" }));
      return;
    }
    setTagInputs((prev) => ({ ...prev, [item.id]: "" }));
    void commitTags(item, [...existing, raw]);
  }

  function removeTag(item: MediaPickerItem, tag: string) {
    void commitTags(item, (item.tags ?? []).filter((value) => value !== tag));
  }

  if (!open) return null;

  const portfolioSet = new Set(portfolioAssetIds);
  const isPortfolio = (item: MediaPickerItem) => portfolioSet.has(item.id);

  const matchesKind = (item: MediaPickerItem) =>
    kindFilter === "all" || pickerKind(item) === kindFilter;

  const visibleItems = isTalentScope
    ? (items ?? []).filter((item) =>
        talentSource === "all"
          ? true
          : talentSource === "portfolio"
            ? isPortfolio(item)
            : !isPortfolio(item),
      )
    : (activeFolderId === "all"
        ? items ?? []
        : (items ?? []).filter((item) => item.folderIds?.includes(activeFolderId))
      ).filter(matchesKind);
  const activeFolder =
    activeFolderId === "all"
      ? null
      : folders.find((folder) => folder.id === activeFolderId) ?? null;

  const portfolioCount = (items ?? []).filter(isPortfolio).length;
  const mineCount = (items ?? []).length - portfolioCount;

  // MEDIA-1 — kind counts for the staff/agency library filter row.
  const kindCounts = {
    all: (items ?? []).length,
    image: (items ?? []).filter((item) => pickerKind(item) === "image").length,
    video: (items ?? []).filter((item) => pickerKind(item) === "video").length,
    document: (items ?? []).filter((item) => pickerKind(item) === "document")
      .length,
  } as const;
  const hasNonImage = kindCounts.video > 0 || kindCounts.document > 0;

  const chip = uploading ? (
    <SaveChip status="saving" label="Uploading" />
  ) : savingAltId ? (
    <SaveChip status="saving" label="Saving alt" />
  ) : error || uploadError || altError ? (
    <SaveChip status="error" label="Needs attention" />
  ) : (
    <SaveChip status="count" label={`${visibleItems?.length ?? 0} assets`} />
  );

  return (
    <>
      <div
        className="fixed inset-0 z-[119] bg-[#242942]/30 backdrop-blur-[1px]"
        aria-hidden
        onClick={handleClose}
      />
      <Drawer
        kind="assets"
        ariaLabelledBy={TITLE_ID}
        width={760}
        open
        zIndex={120}
        testId="media-picker-drawer"
        modal
        onRequestClose={handleClose}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={isTalentScope ? IMAGE_ACCEPT : STAFF_ACCEPT}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFileChosen(file);
          }}
        />
        <DrawerHead
          titleId={TITLE_ID}
          title={title}
          icon={<ImageIcon className="size-3.5" />}
          saveChip={chip}
          meta={
            multi
              ? `${pending.length} selected`
              : activeFolder
                ? activeFolder.name
                : isTalentScope
                  ? "Your photos"
                  : "Tenant media library"
          }
          onClose={handleClose}
        />
        <DrawerBody>
          <div className="mb-3 flex items-center justify-between gap-2">
            <Button
              type="button"
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              title={isTalentScope ? "Upload a photo" : "Upload image"}
            >
              {uploading ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Upload className="mr-1.5 size-3.5" />
              )}
              {uploading ? "Uploading" : "Upload"}
            </Button>
            {multi ? (
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleClose}>
                  <X className="mr-1.5 size-3.5" />
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={pending.length === 0}
                  onClick={confirmMulti}
                >
                  <Check className="mr-1.5 size-3.5" />
                  Add {pending.length || ""}
                </Button>
              </div>
            ) : null}
          </div>

          {isTalentScope ? (
            <div
              className="mb-3 flex gap-2 overflow-x-auto pb-1"
              aria-label="Photo source"
              data-talent-media-source
            >
              <SourceButton
                active={talentSource === "all"}
                label="All my photos"
                count={items?.length ?? 0}
                onClick={() => setTalentSource("all")}
              />
              <SourceButton
                active={talentSource === "portfolio"}
                label="My portfolio"
                hint="On your profile"
                count={portfolioCount}
                onClick={() => setTalentSource("portfolio")}
              />
              <SourceButton
                active={talentSource === "mine"}
                label="My uploads"
                hint="Your media"
                count={mineCount}
                onClick={() => setTalentSource("mine")}
              />
            </div>
          ) : null}

          {!isTalentScope && hasNonImage ? (
            <div
              className="mb-3 flex gap-2 overflow-x-auto pb-1"
              aria-label="Media kind"
              data-media-kind-filter
            >
              <KindButton
                active={kindFilter === "all"}
                label="All assets"
                count={kindCounts.all}
                onClick={() => setKindFilter("all")}
              />
              <KindButton
                active={kindFilter === "image"}
                label="Images"
                icon={<ImageIcon className="size-3" />}
                count={kindCounts.image}
                onClick={() => setKindFilter("image")}
              />
              <KindButton
                active={kindFilter === "video"}
                label="Videos"
                icon={<Play className="size-3" />}
                count={kindCounts.video}
                onClick={() => setKindFilter("video")}
              />
              <KindButton
                active={kindFilter === "document"}
                label="Documents"
                icon={<FileText className="size-3" />}
                count={kindCounts.document}
                onClick={() => setKindFilter("document")}
              />
            </div>
          ) : null}

          {!isTalentScope && folders.length > 0 ? (
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1" aria-label="Media albums">
              <AlbumButton
                active={activeFolderId === "all"}
                label="All photos"
                count={items?.length ?? 0}
                onClick={() => setActiveFolderId("all")}
              />
              {folders.map((folder) => (
                <AlbumButton
                  key={folder.id}
                  active={activeFolderId === folder.id}
                  color={folder.color}
                  label={folder.name}
                  count={
                    (items ?? []).filter((item) => item.folderIds?.includes(folder.id)).length
                  }
                  onClick={() => setActiveFolderId(folder.id)}
                />
              ))}
            </div>
          ) : null}

          {uploadError || altError ? (
            <StatusNotice message={uploadError ?? altError ?? ""} />
          ) : null}

          {loading ? (
            // W3-T7: content-shaped grid skeleton (matches the 2–3 col tile
            // grid) instead of a centered spinner, so the library doesn't flash
            // empty while the asset list loads.
            <DrawerSkeletonGrid rows={6} />
          ) : error ? (
            <StatePanel
              icon={<AlertCircle className="size-4" />}
              title="Could not load assets"
              detail={error}
              action={
                <Button type="button" size="sm" variant="outline" onClick={loadLibrary}>
                  Retry
                </Button>
              }
            />
          ) : visibleItems && visibleItems.length > 0 ? (
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {visibleItems.map((item) => {
                const selected = multi && pending.includes(item.publicUrl);
                const kind = pickerKind(item);
                return (
                  <li key={item.id}>
                    <div
                      className="overflow-hidden rounded-lg border bg-white shadow-sm"
                      style={{
                        borderColor: selected ? CHROME.accent : CHROME.lineStrong,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (multi) togglePending(item.publicUrl);
                          else pickItem(item);
                        }}
                        className="relative block w-full bg-stone-100 text-left"
                        data-asset-kind={kind}
                      >
                        <MediaThumb item={item} kind={kind} />
                        {kind !== "image" ? (
                          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[#242942]/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm">
                            {kind === "video" ? (
                              <Play className="size-2.5" />
                            ) : (
                              <FileText className="size-2.5" />
                            )}
                            {kind}
                          </span>
                        ) : null}
                        {isTalentScope ? (
                          <span
                            className="absolute left-2 top-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm"
                            style={
                              isPortfolio(item)
                                ? { background: CHROME.accent, color: "#ffffff" }
                                : { background: "rgba(255,255,255,0.92)", color: "#3f3f46" }
                            }
                          >
                            {isPortfolio(item) ? "Portfolio" : "Mine"}
                          </span>
                        ) : null}
                        {selected ? (
                          <span className="absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-full bg-violet-600 text-white shadow">
                            <Check className="size-3.5" />
                          </span>
                        ) : null}
                      </button>
                      <div className="grid gap-2 p-2">
                        {isTalentScope ? (
                          // Talents can't save alt text — the PATCH endpoint is
                          // staff-only (would 401). Show it read-only instead of
                          // an editable field that errors on blur.
                          item.alt ? (
                            <p className="truncate text-[11px] text-stone-600" title={item.alt}>
                              {item.alt}
                            </p>
                          ) : null
                        ) : (
                          <>
                            <input
                              className={KIT.input}
                              value={altDrafts[item.id] ?? ""}
                              placeholder="Alt text"
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => {
                                setAltDrafts((prev) => ({
                                  ...prev,
                                  [item.id]: event.currentTarget.value,
                                }));
                              }}
                              onBlur={() => {
                                void commitAlt(item);
                              }}
                              onKeyDown={(event) => {
                                if (event.key !== "Enter") return;
                                event.preventDefault();
                                event.currentTarget.blur();
                              }}
                            />
                            <TagEditor
                              item={item}
                              value={tagInputs[item.id] ?? ""}
                              saving={savingTagId === item.id}
                              onChange={(value) =>
                                setTagInputs((prev) => ({ ...prev, [item.id]: value }))
                              }
                              onAdd={() => addTag(item)}
                              onRemove={(tag) => removeTag(item, tag)}
                            />
                          </>
                        )}
                        <p className="truncate text-[10.5px] text-stone-500">
                          {kind === "image" && item.width && item.height
                            ? `${item.width}x${item.height}`
                            : kind}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : activeFolder ? (
            <StatePanel
              icon={<FolderOpen className="size-4" />}
              title="No images in this album"
            />
          ) : isTalentScope ? (
            <StatePanel
              icon={<ImageIcon className="size-4" />}
              title={
                talentSource === "portfolio"
                  ? "No portfolio photos yet"
                  : talentSource === "mine"
                    ? "No uploads yet"
                    : "No photos yet"
              }
              detail="Use Upload above to add a photo, or add photos to your profile and they'll appear here too."
            />
          ) : (
            <StatePanel
              icon={<ImageIcon className="size-4" />}
              title="No assets yet"
              action={
                <Button
                  type="button"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-1.5 size-3.5" />
                  Upload
                </Button>
              }
            />
          )}
        </DrawerBody>
      </Drawer>
    </>
  );
}
