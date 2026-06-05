"use client";

/**
 * AssetsDrawer — engaged-state media library (Phase 7).
 *
 * Implements builder-experience.html surface §13 (Assets — workspace media
 * library). Last reconciled: 2026-04-25.
 *
 * Lives in the right-side drawer family alongside Publish, Page Settings,
 * Revisions, Theme, Schedule, and Comments. Same chrome (paper-tinted body,
 * white cards float on top, pill-tab nav, footer with primary action).
 * Mutexed via `EditContext.showExclusiveRightRailDrawer` — opening Assets
 * closes whichever drawer was up.
 *
 * Five tabs:
 *   - All        — every approved asset for the tenant, newest first
 *   - Images     — rasters + svgs (variantKind "original" with image/* MIME guard
 *                  via storagePath extension)
 *   - Videos     — placeholder until a video upload route lands
 *   - Documents  — placeholder until a doc upload route lands
 *   - Brand      — assets tagged in metadata as `source: "brand"` or owned by
 *                  a brand-kit talent profile (today: empty by default — the
 *                  brand kit story is M11 territory and lights this up later)
 *
 * Today's media_assets table only stores image originals, so Videos /
 * Documents intentionally surface a calm "coming soon" empty state rather
 * than fake their content. The drawer is laid out for the eventual world
 * so the operator's mental model is right; the data just hasn't shipped yet.
 *
 * Data fetch:
 *   - On open, parallel-fires `loadAssetsLibraryAction` + `scanAssetUsageAction`.
 *     Both are typed wrappers over server-side reads; no /api hop.
 *   - Re-fetches every open so a publish / upload that happened in another
 *     tab is reflected without a hard refresh.
 *   - Search filters in-memory across name, storage path, source hint —
 *     fast feedback on keystroke for libraries up to 60 items (the cap).
 *
 * Multi-select:
 *   - Toggle in the head right-tools group flips a checkbox onto every
 *     tile. Batch action bar floats above the footer with selection count
 *     + Cancel + (today) Copy URLs (Phase 7 v1; later: bulk delete + tag).
 *
 * Usage badge:
 *   - Per tile: subtle "Used in N" chip when the section scanner found
 *     references. Click jumps the canvas to the first referenced section.
 *
 * Upload:
 *   - Footer "Upload" button reuses the existing /api/admin/media/upload
 *     route (multipart, tenant-scoped). Optimistic prepend on success so
 *     the new tile shows up immediately; usage badge reflects 0 until the
 *     scanner re-runs, which is correct.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import {
  CHROME,
  CHROME_RADII,
  CHROME_SHADOWS,
  Drawer,
  DrawerBody,
  DrawerFoot,
  DrawerHead,
  DrawerSkeletonGrid,
  DrawerTab,
  DrawerTabs,
} from "./kit";
import { useEditContext } from "./edit-context";

import {
  loadAssetsLibraryAction,
  scanAssetUsageAction,
  type AssetUsage,
} from "@/lib/site-admin/edit-mode/assets-actions";
import type { MediaLibraryItem } from "@/lib/site-admin/media/types";
import { uploadCmsMedia } from "@/lib/client/signed-upload";
import { ImageCropModal } from "./image-crop";

// ── tabs ─────────────────────────────────────────────────────────────────

type TabKey = "all" | "images" | "videos" | "documents" | "brand";

interface TabSpec {
  key: TabKey;
  label: string;
  /**
   * Today's media_assets table only carries image originals. Videos and
   * Documents are laid out for the eventual world so the operator's
   * mental model lines up; they show an empty state until the upload
   * routes land.
   */
  comingSoon?: boolean;
}

const TABS: ReadonlyArray<TabSpec> = [
  { key: "all", label: "All" },
  { key: "images", label: "Images" },
  { key: "videos", label: "Videos", comingSoon: true },
  { key: "documents", label: "Documents", comingSoon: true },
  { key: "brand", label: "Brand" },
];

// ── helpers ───────────────────────────────────────────────────────────────

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "svg",
  "avif",
  "heic",
  "heif",
]);

function extensionOf(path: string): string | null {
  const i = path.lastIndexOf(".");
  if (i === -1 || i === path.length - 1) return null;
  return path.slice(i + 1).toLowerCase();
}

function isImageItem(item: MediaLibraryItem): boolean {
  const ext = extensionOf(item.storagePath);
  return ext !== null && IMAGE_EXTENSIONS.has(ext);
}

function isBrandItem(item: MediaLibraryItem): boolean {
  // M11 brand-kit lights this up properly. For Phase 7 we lean on metadata
  // hints exposed by `inferSourceHint` in the media-library reader: any
  // asset whose source/seeded_by mentions `brand` lands here.
  if (!item.sourceHint) return false;
  return /brand/i.test(item.sourceHint);
}

function fileNameOf(item: MediaLibraryItem): string {
  const path = item.storagePath;
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

function bytesLabel(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function dimensionsLabel(item: MediaLibraryItem): string | null {
  if (item.width == null || item.height == null) return null;
  return `${item.width}×${item.height}`;
}

function relativeAge(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const delta = Math.max(0, Date.now() - then);
  const sec = Math.round(delta / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  return `${mo}mo ago`;
}

// ── icons ─────────────────────────────────────────────────────────────────

function FolderIcon(): ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function SearchIcon(): ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function CheckIcon(): ReactElement {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function UploadIcon(): ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function CropIcon(): ReactElement {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M2 6h14a2 2 0 0 1 2 2v14" />
    </svg>
  );
}

function ClockIcon(): ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

// ── component ─────────────────────────────────────────────────────────────

export function AssetsDrawer(): ReactElement | null {
  const { assetsOpen, closeAssets, tenantId } = useEditContext();

  const [items, setItems] = useState<MediaLibraryItem[] | null>(null);
  const [usage, setUsage] = useState<Record<string, AssetUsage>>({});
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"idle" | "loading">("idle");

  const [tab, setTab] = useState<TabKey>("all");
  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copiedToast, setCopiedToast] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // In-editor crop: the image asset currently open in the crop modal, plus
  // a busy flag while its cropped variant uploads. Crop produces a NEW asset
  // through the existing upload pipeline (handleFileChosen below).
  const [cropTarget, setCropTarget] = useState<MediaLibraryItem | null>(null);
  const [cropSaving, setCropSaving] = useState(false);
  const [cropError, setCropError] = useState<string | null>(null);

  // Lazy-fetch on open. Re-fetch every open so a publish from another
  // surface (or an upload from the section media picker) shows up here
  // without a hard refresh.
  useEffect(() => {
    if (!assetsOpen) {
      setSelecting(false);
      setSelected(new Set());
      setQuery("");
      setUploadError(null);
      setCopiedToast(null);
      setCropTarget(null);
      setCropSaving(false);
      setCropError(null);
      return;
    }
    let cancelled = false;
    setBusy("loading");
    setLoadError(null);
    (async () => {
      const [libRes, usageRes] = await Promise.all([
        loadAssetsLibraryAction(),
        scanAssetUsageAction(),
      ]);
      if (cancelled) return;
      if (!libRes.ok) {
        setItems([]);
        setUsage({});
        setLoadError(libRes.error);
        setBusy("idle");
        return;
      }
      setItems(libRes.snapshot.items);
      setFetchedAt(libRes.snapshot.fetchedAt);
      setUsage(usageRes.ok ? usageRes.usage : {});
      setBusy("idle");
    })();
    return () => {
      cancelled = true;
    };
  }, [assetsOpen]);

  // Filter pipeline: tab → search.
  const filtered = useMemo<MediaLibraryItem[]>(() => {
    if (!items) return [];
    let pool: MediaLibraryItem[];
    if (tab === "all") pool = items;
    else if (tab === "images") pool = items.filter(isImageItem);
    else if (tab === "brand") pool = items.filter(isBrandItem);
    else pool = []; // videos / documents — placeholder

    const q = query.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter((it) => {
      const haystack = [
        fileNameOf(it).toLowerCase(),
        it.storagePath.toLowerCase(),
        it.sourceHint?.toLowerCase() ?? "",
        it.variantKind.toLowerCase(),
      ].join(" ");
      return haystack.includes(q);
    });
  }, [items, tab, query]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCopySelected = useCallback(async () => {
    if (!items || selected.size === 0) return;
    const urls = items
      .filter((it) => selected.has(it.id))
      .map((it) => it.publicUrl)
      .join("\n");
    try {
      await navigator.clipboard.writeText(urls);
      setCopiedToast(`Copied ${selected.size} URL${selected.size === 1 ? "" : "s"}`);
      setTimeout(() => setCopiedToast(null), 1600);
    } catch {
      setCopiedToast("Copy failed");
      setTimeout(() => setCopiedToast(null), 1600);
    }
  }, [items, selected]);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChosen = useCallback(
    async (file: File, kindOverride?: "image" | "video" | "document"): Promise<boolean> => {
      setUploading(true);
      setUploadError(null);
      const uploadKind =
        kindOverride ??
        (tab === "videos" ? "video" : tab === "documents" ? "document" : "image");
      // Client-side size + MIME validation. Server also validates, but
      // a pre-check saves a round-trip and gives the operator an
      // instant error. The `accept` attribute on the hidden file input
      // only filters the OS dialog; drag-and-drop or programmatic
      // uploads bypass it.
      //
      // Image cap bumped from 10 MB → 30 MB: the upload now compresses
      // in-browser before going over the wire (see lib/client/
      // signed-upload.ts), so the raw input can be a full-res phone
      // dump and we still PUT ~150 KB.
      const MAX_BYTES_BY_KIND: Record<string, number> = {
        image: 30 * 1024 * 1024,
        video: 100 * 1024 * 1024,
        document: 25 * 1024 * 1024,
      };
      const MIME_PREFIX_BY_KIND: Record<string, string[]> = {
        image: ["image/"],
        video: ["video/"],
        document: ["application/pdf", "application/msword", "application/vnd."],
      };
      const maxBytes = MAX_BYTES_BY_KIND[uploadKind] ?? 10 * 1024 * 1024;
      if (file.size > maxBytes) {
        setUploadError(
          `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max for ${uploadKind} is ${maxBytes / 1024 / 1024} MB.`,
        );
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return false;
      }
      const allowedPrefixes = MIME_PREFIX_BY_KIND[uploadKind] ?? ["image/"];
      if (!allowedPrefixes.some((prefix) => file.type.startsWith(prefix))) {
        setUploadError(
          `File type ${file.type || "(unknown)"} isn't supported for ${uploadKind}.`,
        );
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return false;
      }
      let uploadOk = false;
      try {
        // Signed-upload pipeline first (compress in browser → PUT direct
        // to Supabase → register endpoint inserts the row). Legacy
        // /api/admin/media/upload stays as fallback for browsers /
        // files the new path can't handle. See lib/client/signed-upload.ts.
        let raw: Partial<MediaLibraryItem> & {
          id?: string;
          publicUrl?: string;
          storagePath?: string;
        };
        const fast = await uploadCmsMedia({ file, tenantId, kind: uploadKind });
        if (fast.ok) {
          raw = fast.item as typeof raw;
        } else if (!fast.fallbackToLegacy) {
          throw new Error(fast.error);
        } else {
          const form = new FormData();
          form.set("tenantId", tenantId);
          form.set("file", file);
          // Tab discriminator drives MIME whitelist + bucket subdirectory
          // + media_assets.purpose on the server side (Phase 8 — videos +
          // documents now share the upload route).
          form.set("kind", uploadKind);
          const res = await fetch("/api/admin/media/upload", {
            method: "POST",
            body: form,
          });
          const body = await res.json();
          if (!res.ok || !body.ok) {
            throw new Error(body.error ?? `HTTP ${res.status}`);
          }
          // The upload route returns `item` shaped close enough to
          // MediaLibraryItem; normalize defensively so optimistic prepend
          // never falls through with NaN cells.
          raw = body.item as typeof raw;
        }
        if (!raw.id || !raw.publicUrl || !raw.storagePath) {
          setUploadError("Upload didn't return a usable asset — try again.");
          return false;
        }
        const item: MediaLibraryItem = {
          id: raw.id,
          tenantId,
          ownerTalentProfileId: raw.ownerTalentProfileId ?? null,
          variantKind: raw.variantKind ?? "original",
          storagePath: raw.storagePath,
          publicUrl: raw.publicUrl,
          width: raw.width ?? null,
          height: raw.height ?? null,
          fileSize: raw.fileSize ?? file.size,
          mime: raw.mime ?? null,
          alt: raw.alt ?? null,
          createdAt: raw.createdAt ?? new Date().toISOString(),
          sourceHint: raw.sourceHint ?? null,
          folderIds: raw.folderIds ?? [],
        };
        setItems((prev) => (prev ? [item, ...prev] : [item]));
        // The new asset isn't referenced anywhere yet — record an explicit
        // zero so the badge code doesn't read stale "undefined" until the
        // next scan.
        setUsage((prev) => ({
          ...prev,
          [item.id]: { assetId: item.id, refCount: 0, sectionIds: [] },
        }));
        uploadOk = true;
      } catch (e) {
        setUploadError(
          e instanceof Error ? e.message.slice(0, 200) : "Couldn't upload — try again.",
        );
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
      return uploadOk;
    },
    [tenantId, tab],
  );

  // Crop save: the modal hands back a freshly-cropped File. Route it through
  // the same upload pipeline (always "image" kind) so it lands as a new asset
  // and optimistically prepends to the grid. Keep the modal open on failure
  // so the operator can retry; close it on success.
  const handleCropSave = useCallback(
    async (file: File) => {
      setCropSaving(true);
      setCropError(null);
      const ok = await handleFileChosen(file, "image");
      setCropSaving(false);
      if (ok) {
        setCropTarget(null);
      } else {
        // handleFileChosen wrote the reason into uploadError; mirror it into
        // the modal-scoped error so it shows inside the crop dialog.
        setCropError("Couldn't save the cropped image — try again.");
      }
    },
    [handleFileChosen],
  );

  // Counts for tab badges. We compute against the full library regardless of
  // search so the operator sees the true library shape; search just filters
  // what's currently visible inside the active tab.
  const counts = useMemo(() => {
    if (!items) return { all: 0, images: 0, videos: 0, documents: 0, brand: 0 };
    return {
      all: items.length,
      images: items.filter(isImageItem).length,
      videos: 0,
      documents: 0,
      brand: items.filter(isBrandItem).length,
    };
  }, [items]);

  if (!assetsOpen) return null;

  const lastSyncLabel = fetchedAt ? `Synced ${relativeAge(fetchedAt)}` : null;
  const totalLabel =
    items === null
      ? "Loading…"
      : `${items.length} asset${items.length === 1 ? "" : "s"} · ${tab === "all" ? "all" : "filtered"}`;

  return (
    <Drawer
      kind="assets"
      open={assetsOpen}
      zIndex={87}
      ariaLabelledBy="assets-drawer-title"
    >
      <DrawerHead
        titleId="assets-drawer-title"
        title="Asset library"
        icon={<FolderIcon />}
        meta={
          <span>
            {totalLabel}
            {lastSyncLabel ? (
              <>
                <span style={{ color: CHROME.muted2 }}> · </span>
                <span className="inline-flex items-center gap-1">
                  <ClockIcon />
                  {lastSyncLabel}
                </span>
              </>
            ) : null}
          </span>
        }
        onClose={uploading ? undefined : closeAssets}
      />

      <DrawerTabs>
        {TABS.map((t) => {
          const count = counts[t.key];
          return (
            <DrawerTab
              key={t.key}
              active={tab === t.key}
              onClick={() => setTab(t.key)}
            >
              <span>{t.label}</span>
              <span
                aria-hidden
                style={{
                  marginLeft: 6,
                  fontSize: 10,
                  fontWeight: 600,
                  color: tab === t.key ? CHROME.muted : CHROME.muted2,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {t.comingSoon ? "—" : count}
              </span>
            </DrawerTab>
          );
        })}
      </DrawerTabs>

      <div className="px-[18px] pt-3">
        <SearchInput value={query} onChange={setQuery} disabled={busy === "loading"} />
      </div>

      <DrawerBody>
        {loadError ? (
          <ErrorBanner>{loadError}</ErrorBanner>
        ) : busy === "loading" && items === null ? (
          <DrawerSkeletonGrid />
        ) : filtered.length === 0 ? (
          <EmptyState
            tab={tab}
            hasItems={(items?.length ?? 0) > 0}
            query={query}
          />
        ) : (
          <AssetGrid
            items={filtered}
            usage={usage}
            selecting={selecting}
            selected={selected}
            onToggleSelect={toggleSelect}
            onCrop={(item) => {
              setCropError(null);
              setCropTarget(item);
            }}
          />
        )}
        {uploadError ? (
          <div className="mt-3">
            <ErrorBanner>{uploadError}</ErrorBanner>
          </div>
        ) : null}
      </DrawerBody>

      <DrawerFoot
        start={
          selecting ? (
            <span style={{ fontSize: 11, color: CHROME.text2, fontWeight: 600 }}>
              {selected.size} selected
              {copiedToast ? (
                <span
                  style={{ marginLeft: 10, color: CHROME.green, fontWeight: 500 }}
                >
                  · {copiedToast}
                </span>
              ) : null}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setSelecting(true)}
              disabled={busy === "loading" || (items?.length ?? 0) === 0}
              style={ghostBtnStyle(
                busy === "loading" || (items?.length ?? 0) === 0,
              )}
              onMouseEnter={(e) => {
                if (!e.currentTarget.disabled) e.currentTarget.style.background = "rgba(42,49,71,0.06)";
              }}
              onMouseLeave={(e) => { e.currentTarget.style.background = CHROME.surface; }}
            >
              Select
            </button>
          )
        }
        end={
          selecting ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setSelecting(false);
                  setSelected(new Set());
                  setCopiedToast(null);
                }}
                style={ghostBtnStyle(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCopySelected()}
                disabled={selected.size === 0}
                style={primaryBtnStyle(selected.size === 0)}
              >
                Copy URLs
              </button>
            </>
          ) : (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={
                  tab === "videos"
                    ? "video/mp4,video/quicktime,video/webm,video/x-msvideo,video/x-matroska"
                    : tab === "documents"
                      ? ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv"
                      : "image/*"
                }
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFileChosen(f);
                }}
                hidden
              />
              <button
                type="button"
                onClick={handleUploadClick}
                disabled={uploading}
                style={primaryBtnStyle(uploading)}
                onMouseEnter={(e) => {
                  if (!e.currentTarget.disabled) e.currentTarget.style.background = "#344569";
                }}
                onMouseLeave={(e) => {
                  if (!e.currentTarget.disabled) e.currentTarget.style.background = CHROME.accent;
                }}
              >
                <span className="inline-flex items-center gap-1.5">
                  <UploadIcon />
                  {uploading ? "Uploading…" : "Upload"}
                </span>
              </button>
            </>
          )
        }
      />

      {cropTarget ? (
        <ImageCropModal
          src={cropTarget.publicUrl}
          name={fileNameOf(cropTarget)}
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

// ── search input ──────────────────────────────────────────────────────────

function SearchInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className="flex items-center gap-2"
      style={{
        height: 32,
        padding: "0 10px",
        background: CHROME.surface,
        border: `1px solid ${CHROME.line}`,
        borderRadius: 7,
        boxShadow: CHROME_SHADOWS.inputInset,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{ color: CHROME.muted2, display: "inline-flex" }} aria-hidden>
        <SearchIcon />
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by name, path, or tag"
        disabled={disabled}
        className="min-w-0 flex-1 border-none bg-transparent outline-none"
        style={{
          fontSize: 12,
          color: CHROME.text,
        }}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="cursor-pointer rounded-[4px] border-none px-1 text-[11px] font-medium"
          style={{
            background: "transparent",
            color: CHROME.muted,
            transition: "background 110ms ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(42,49,71,0.06)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          aria-label="Clear search"
          title="Clear"
        >
          Clear
        </button>
      ) : null}
    </label>
  );
}

// ── grid ──────────────────────────────────────────────────────────────────

function AssetGrid({
  items,
  usage,
  selecting,
  selected,
  onToggleSelect,
  onCrop,
}: {
  items: MediaLibraryItem[];
  usage: Record<string, AssetUsage>;
  selecting: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onCrop: (item: MediaLibraryItem) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: 10,
      }}
    >
      {items.map((item) => (
        <AssetTile
          key={item.id}
          item={item}
          usage={usage[item.id]}
          selecting={selecting}
          selected={selected.has(item.id)}
          onToggle={() => onToggleSelect(item.id)}
          onCrop={() => onCrop(item)}
        />
      ))}
    </div>
  );
}

function AssetTile({
  item,
  usage,
  selecting,
  selected,
  onToggle,
  onCrop,
}: {
  item: MediaLibraryItem;
  usage: AssetUsage | undefined;
  selecting: boolean;
  selected: boolean;
  onToggle: () => void;
  onCrop: () => void;
}) {
  const refCount = usage?.refCount ?? 0;
  const dim = dimensionsLabel(item);
  const bytes = bytesLabel(item.fileSize);
  const name = fileNameOf(item);
  // Only raster images are crop-able — SVGs are vector and a canvas crop
  // would rasterize them, which isn't what the operator wants.
  const ext = extensionOf(item.storagePath);
  const canCrop = !selecting && isImageItem(item) && ext !== "svg";

  return (
    <div
      role={selecting ? "checkbox" : "group"}
      aria-checked={selecting ? selected : undefined}
      tabIndex={selecting ? 0 : -1}
      onClick={selecting ? onToggle : undefined}
      onKeyDown={(e) => {
        if (selecting && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onToggle();
        }
      }}
      style={{
        position: "relative",
        background: CHROME.surface,
        border: `1px solid ${selected ? CHROME.blueLine : CHROME.line}`,
        borderRadius: CHROME_RADII.md,
        overflow: "hidden",
        boxShadow: selected
          ? `0 0 0 2px ${CHROME.blue}, ${CHROME_SHADOWS.card}`
          : CHROME_SHADOWS.card,
        cursor: selecting ? "pointer" : "default",
        transition: "box-shadow 120ms ease, border-color 120ms ease",
      }}
    >
      <div
        style={{
          aspectRatio: "1 / 1",
          background:
            "repeating-conic-gradient(rgba(0,0,0,0.03) 0% 25%, rgba(0,0,0,0.06) 0% 50%) 50% / 16px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.publicUrl}
          alt={name}
          loading="lazy"
          decoding="async"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      </div>

      {/* Crop affordance — raster images only, hidden during multi-select.
          Launches the in-editor crop modal; the cropped result lands as a
          new asset via the existing upload pipeline. */}
      {canCrop ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCrop();
          }}
          title="Crop this image"
          aria-label="Crop image"
          style={{
            position: "absolute",
            bottom: 6,
            right: 6,
            height: 24,
            padding: "0 8px",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 10.5,
            fontWeight: 600,
            color: CHROME.text2,
            background: "rgba(255,255,255,0.92)",
            border: `1px solid ${CHROME.line}`,
            borderRadius: 6,
            cursor: "pointer",
            backdropFilter: "blur(8px)",
            boxShadow: "0 1px 2px rgba(0,0,0,0.10)",
            transition: "background 120ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#ffffff";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.92)";
          }}
        >
          <CropIcon />
          Crop
        </button>
      ) : null}

      {/* Top-right usage badge — surfaces the scanner's signal so the
          operator can spot stale assets at a glance. */}
      {refCount > 0 ? (
        <span
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            padding: "2px 6px",
            fontSize: 10,
            fontWeight: 600,
            background: CHROME.greenBg,
            color: CHROME.green,
            border: `1px solid ${CHROME.greenLine}`,
            borderRadius: 6,
            backdropFilter: "blur(8px)",
            boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
          }}
          title={`Referenced by ${refCount} section${refCount === 1 ? "" : "s"}`}
        >
          Used · {refCount}
        </span>
      ) : (
        <span
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            padding: "2px 6px",
            fontSize: 10,
            fontWeight: 600,
            background: "rgba(255,255,255,0.85)",
            color: CHROME.muted,
            border: `1px solid ${CHROME.line}`,
            borderRadius: 6,
            backdropFilter: "blur(8px)",
          }}
          title="Not yet referenced"
        >
          Unused
        </span>
      )}

      {/* Top-left checkbox during multi-select */}
      {selecting ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 6,
            left: 6,
            width: 18,
            height: 18,
            borderRadius: 5,
            background: selected ? CHROME.blue : "rgba(255,255,255,0.92)",
            border: `1px solid ${selected ? CHROME.blue : CHROME.lineMid}`,
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 1px 2px rgba(0,0,0,0.10)",
            transition: "background 120ms ease, border-color 120ms ease",
          }}
        >
          {selected ? <CheckIcon /> : null}
        </span>
      ) : null}

      <div
        style={{
          padding: "8px 9px 9px",
          borderTop: `1px solid ${CHROME.line}`,
          background: CHROME.surface2,
        }}
      >
        <div
          className="truncate"
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: CHROME.ink,
            letterSpacing: "-0.005em",
          }}
          title={name}
        >
          {name}
        </div>
        <div
          style={{
            marginTop: 2,
            fontSize: 10.5,
            color: CHROME.muted,
            display: "flex",
            gap: 6,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {dim ? <span>{dim}</span> : null}
          {dim ? (
            <span aria-hidden style={{ color: CHROME.muted3 }}>·</span>
          ) : null}
          <span>{bytes}</span>
        </div>
      </div>
    </div>
  );
}

// ── empty / coming soon ───────────────────────────────────────────────────

function EmptyState({
  tab,
  hasItems,
  query,
}: {
  tab: TabKey;
  hasItems: boolean;
  query: string;
}) {
  if (query) {
    return (
      <Calm
        title="No matches"
        body={`Nothing in the ${tab === "all" ? "library" : tab} matches "${query}". Clear search to see everything.`}
      />
    );
  }
  if (!hasItems) {
    return (
      <Calm
        title="No assets yet"
        body="Upload an image to start the library. Anything used by a section will show up here automatically."
      />
    );
  }
  if (tab === "brand") {
    return (
      <Calm
        title="No brand assets"
        body="Mark assets as brand-kit material in the workspace settings to surface them here. Coming with the M11 brand kit."
      />
    );
  }
  return (
    <Calm
      title="Empty for now"
      body="Switch tabs or upload a new asset to fill this view."
    />
  );
}

// Phase 8 — ComingSoonState retired. Videos + documents now upload via the
// same /api/admin/media/upload route with a `kind` discriminator. The
// videos/documents tabs render the real EmptyState + grid like images do.

function Calm({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        padding: "28px 18px",
        background: CHROME.surface,
        border: `1px dashed ${CHROME.lineMid}`,
        borderRadius: 12,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 13.5,
          fontWeight: 600,
          color: CHROME.ink,
          letterSpacing: "-0.01em",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 12, color: CHROME.muted, lineHeight: 1.45 }}>
        {body}
      </div>
    </div>
  );
}

// SkeletonGrid removed — replaced by shared DrawerSkeletonGrid from "./kit".

// ── error banner ──────────────────────────────────────────────────────────

function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-md px-3 py-2 text-[11px]"
      style={{
        background: CHROME.roseBg,
        border: `1px solid ${CHROME.roseLine}`,
        color: CHROME.rose,
      }}
      role="alert"
      aria-live="assertive"
    >
      {children}
    </div>
  );
}

// ── button styles ─────────────────────────────────────────────────────────

function ghostBtnStyle(disabled: boolean) {
  return {
    height: 30,
    padding: "0 12px",
    fontSize: 12,
    fontWeight: 500,
    color: disabled ? CHROME.muted2 : CHROME.text2,
    background: CHROME.surface,
    border: `1px solid ${CHROME.lineMid}`,
    borderRadius: 7,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  } as const;
}

function primaryBtnStyle(disabled: boolean) {
  return {
    height: 30,
    padding: "0 14px",
    fontSize: 12,
    fontWeight: 600,
    color: "#fff",
    background: disabled ? CHROME.muted2 : CHROME.accent,
    border: "none",
    borderRadius: 7,
    cursor: disabled ? "not-allowed" : "pointer",
    boxShadow: disabled ? "none" : "0 1px 2px rgba(0,0,0,0.10)",
  } as const;
}
