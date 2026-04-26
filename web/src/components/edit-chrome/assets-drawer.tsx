"use client";

/**
 * AssetsDrawer — engaged-state media library (Phase 7).
 *
 * Implements builder-experience.html surface §13 (Assets — workspace media
 * library). Last reconciled: 2026-04-25.
 *
 * Lives in the right-side drawer family alongside Publish, Page Settings,
 * Revisions, and Theme. Same chrome (paper-tinted body, white cards float
 * on top, pill-tab nav, footer with primary action). Mutexes with the
 * other four — opening Assets dismisses whichever was up.
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
  DrawerTab,
  DrawerTabs,
} from "./kit";
import { useEditContext } from "./edit-context";

import {
  loadAssetsLibraryAction,
  scanAssetUsageAction,
  type AssetUsage,
} from "@/lib/site-admin/edit-mode/assets-actions";
import type { MediaLibraryItem } from "@/lib/site-admin/server/media-library";

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
    async (file: File) => {
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
        // The upload route returns `item` shaped close enough to
        // MediaLibraryItem; normalize defensively so optimistic prepend
        // never falls through with NaN cells.
        const raw = body.item as Partial<MediaLibraryItem> & {
          id?: string;
          publicUrl?: string;
          storagePath?: string;
        };
        if (!raw.id || !raw.publicUrl || !raw.storagePath) return;
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
          createdAt: raw.createdAt ?? new Date().toISOString(),
          sourceHint: raw.sourceHint ?? null,
        };
        setItems((prev) => (prev ? [item, ...prev] : [item]));
        // The new asset isn't referenced anywhere yet — record an explicit
        // zero so the badge code doesn't read stale "undefined" until the
        // next scan.
        setUsage((prev) => ({
          ...prev,
          [item.id]: { assetId: item.id, refCount: 0, sectionIds: [] },
        }));
      } catch (e) {
        setUploadError(e instanceof Error ? e.message.slice(0, 200) : "Upload failed.");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [tenantId],
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
    <Drawer kind="assets" open={assetsOpen} zIndex={87}>
      <DrawerHead
        eyebrow="Library"
        title="Assets"
        titleStyle="display"
        icon={<FolderIcon />}
        meta={
          <span>
            {totalLabel}
            {lastSyncLabel ? (
              <>
                <span style={{ color: CHROME.muted2 }}> · </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
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

      <DrawerBody padding="14px 14px 24px">
        {loadError ? (
          <ErrorBanner>{loadError}</ErrorBanner>
        ) : busy === "loading" && items === null ? (
          <SkeletonGrid />
        ) : tab === "videos" || tab === "documents" ? (
          <ComingSoonState kind={tab} />
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
                accept="image/*"
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
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <UploadIcon />
                  {uploading ? "Uploading…" : "Upload"}
                </span>
              </button>
            </>
          )
        }
      />
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
          }}
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
}: {
  items: MediaLibraryItem[];
  usage: Record<string, AssetUsage>;
  selecting: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
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
}: {
  item: MediaLibraryItem;
  usage: AssetUsage | undefined;
  selecting: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const refCount = usage?.refCount ?? 0;
  const dim = dimensionsLabel(item);
  const bytes = bytesLabel(item.fileSize);
  const name = fileNameOf(item);

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

function ComingSoonState({ kind }: { kind: "videos" | "documents" }) {
  const label = kind === "videos" ? "Video" : "Document";
  return (
    <Calm
      title={`${label} uploads coming soon`}
      body={`The library is laid out for ${label.toLowerCase()}s, but their upload route ships in a later milestone. Use Images today.`}
    />
  );
}

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

// ── skeleton ──────────────────────────────────────────────────────────────

function SkeletonGrid() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: 10,
      }}
    >
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            aspectRatio: "1 / 1.18",
            background: CHROME.surface,
            border: `1px solid ${CHROME.line}`,
            borderRadius: 10,
            opacity: 0.55,
          }}
        />
      ))}
    </div>
  );
}

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
    background: disabled ? CHROME.muted2 : CHROME.ink,
    border: "none",
    borderRadius: 7,
    cursor: disabled ? "not-allowed" : "pointer",
    boxShadow: disabled ? "none" : "0 1px 2px rgba(0,0,0,0.10)",
  } as const;
}
