"use client";

import {
  useCallback, useEffect, useMemo, useRef, useState, type CSSProperties,
} from "react";
import { useQueuedRouterRefresh } from "@/lib/ui/use-queued-router-refresh";
import {
  COLORS, FONTS, meetsPlan, useAdminShell,
} from "./state";
import { PrimaryButton, SecondaryButton } from "./primitives";
import {
  actionDeleteMediaAssets,
  actionUploadToStagingStorage,
  actionUploadAndAssignMedia,
  actionBulkAssignStagedMedia,
  actionCleanupStagedObjects,
  actionLoadRosterTalents,
  actionSetApprovalState,
  actionReassignMediaToTalent,
  actionSetAsCardPhoto,
  actionSetAsHeroPhoto,
  actionRevertCropToSource,
  actionImportFromGoogleDrive,
  actionListDriveFolder,
  actionGetMediaCount,
  type RosterTalentOption,
  type StagedMediaMeta,
} from "@/app/(workspace)/[tenantSlug]/admin/media/actions";
import { PhotoCropperDialog } from "@/components/talent/photo-cropper-dialog";
import { PhotoLightbox } from "@/components/media/photo-lightbox";
import {
  actionCreateMediaFolder,
  actionRenameMediaFolder,
  actionDeleteMediaFolder,
  actionAddAssetsToFolder,
  actionRemoveAssetsFromFolder,
  actionCreateFolderShareLink,
  actionRevokeFolderShareLink,
  actionSetAssetTags,
  actionSetAssetNote,
  actionGetAssetActivity,
} from "@/app/(workspace)/[tenantSlug]/admin/media/folder-actions";
import { loadAgencyBrandingSettings } from "@/lib/server-actions/admin-workspace-settings";
import type {
  WorkspaceMediaPhoto as BridgeMediaPhoto,
  WorkspaceMediaFolder as BridgeMediaFolder,
} from "@/app/(workspace)/[tenantSlug]/_data-bridge-media";

// ─── Types ────────────────────────────────────────────────────────────────────
//
// MediaPhoto is the bridge type so the page and server can't drift apart
// silently (this drift is exactly what was causing tags / filename /
// dimensions to vanish before — page added fields the bridge didn't return).

type MediaPhoto = BridgeMediaPhoto;
type MediaFolder = BridgeMediaFolder;

type ActiveView =
  | { kind: "all" }
  | { kind: "folder"; folderId: string }
  | { kind: "by-talent" }
  | { kind: "by-kind" }
  | { kind: "pending" }
  | { kind: "analytics" };

type StagingItem = {
  id: string;
  file: File;
  blobUrl: string;
  status: "queued" | "uploading" | "ready" | "error";
  storagePath?: string;
  publicUrl?: string;
  meta?: StagedMediaMeta;
  errorMsg?: string;
  talentId: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDim(w: number | null, h: number | null) {
  if (!w || !h) return "—";
  return `${w} × ${h}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const VARIANT_LABELS: Record<string, string> = {
  card: "Profile", hero: "Cover", gallery: "Gallery",
  lightbox: "Lightbox", polaroid: "Polaroid", reel: "Reel",
  public_watermarked: "Public WM", watermarked: "Watermarked",
};

// Card pill colors per variant/status — single slot, priority order.
// "Profile" = 1:1 headshot (variantKind=card)
// "Cover"   = 16:9 banner  (variantKind=hero)
const PILL_STYLES = {
  rejected: { bg: "rgba(192,57,43,0.94)", fg: "#fff", label: "Rejected" },
  pending:  { bg: "rgba(212,151,12,0.94)", fg: "#fff", label: "Review" },
  profile:  { bg: "rgba(15,79,62,0.94)",  fg: "#fff", label: "Profile" },
  cover:    { bg: "rgba(78,52,114,0.94)", fg: "#fff", label: "Cover" },
} as const;

const FOLDER_PALETTE = [
  "#EF5350", "#EC407A", "#AB47BC", "#7E57C2",
  "#42A5F5", "#26C6DA", "#26A69A", "#66BB6A",
  "#FFCA28", "#FFA726", "#8D6E63", "#78909C",
];

function DotSwatch({ color }: { color: string }) {
  return <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, display: "inline-block" }} />;
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function MediaSidebar({
  view, setView, photos, folders, onNewFolder, settings,
}: {
  view: ActiveView;
  setView: (v: ActiveView) => void;
  photos: MediaPhoto[];
  folders: MediaFolder[];
  onNewFolder: () => void;
  settings: { showFolders: boolean; showPending: boolean; showAnalytics: boolean; showByTalent: boolean; showByKind: boolean };
}) {
  const pendingCount = photos.filter((p) => p.approvalState === "pending").length;

  const isActive = (v: ActiveView) => {
    if (v.kind !== view.kind) return false;
    if (v.kind === "folder" && view.kind === "folder") return v.folderId === (view as { folderId: string }).folderId;
    return true;
  };

  const NavRow = ({ label, v, badge, dot }: { label: string; v: ActiveView; badge?: number; dot?: string }) => {
    const active = isActive(v);
    return (
      <button type="button" onClick={() => setView(v)} style={{
        display: "flex", alignItems: "center", gap: 7,
        width: "100%", padding: "6px 9px", borderRadius: 7, border: "none",
        background: active ? `${COLORS.fill}14` : "transparent",
        color: active ? COLORS.fill : COLORS.ink,
        fontFamily: FONTS.body, fontSize: 12.5, fontWeight: active ? 600 : 500,
        cursor: "pointer", textAlign: "left",
      }}>
        {dot && <DotSwatch color={dot} />}
        <span style={{ flex: 1 }}>{label}</span>
        {badge != null && badge > 0 && (
          <span style={{
            background: active ? COLORS.fill : COLORS.amber,
            color: "#fff", borderRadius: 999, fontSize: 9, fontWeight: 800, padding: "1px 5px",
          }}>{badge}</span>
        )}
      </button>
    );
  };

  const SectionLabel = ({ text }: { text: string }) => (
    <div style={{
      padding: "10px 9px 3px", fontFamily: FONTS.body, fontSize: 10,
      fontWeight: 700, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: 0.7,
    }}>{text}</div>
  );

  return (
    <div style={{
      width: 196, flexShrink: 0, borderRight: `1px solid ${COLORS.borderSoft}`,
      padding: "14px 7px 24px", display: "flex", flexDirection: "column",
      overflowY: "auto", gap: 1,
    }}>
      <NavRow label={`All (${photos.length})`} v={{ kind: "all" }} />
      {settings.showPending && <NavRow label="Pending review" v={{ kind: "pending" }} badge={pendingCount} />}

      {settings.showFolders && (
        <>
          <SectionLabel text="Folders" />
          {folders.map((f) => (
            <NavRow
              key={f.id}
              label={f.name}
              v={{ kind: "folder", folderId: f.id }}
              dot={f.color ?? FOLDER_PALETTE[0]}
            />
          ))}
          <button type="button" onClick={onNewFolder} style={{
            display: "flex", alignItems: "center", gap: 6, width: "100%",
            padding: "5px 9px", borderRadius: 7, border: "none",
            background: "transparent", color: COLORS.inkMuted,
            fontFamily: FONTS.body, fontSize: 12, cursor: "pointer", textAlign: "left",
          }}>
            <span style={{ fontSize: 15, lineHeight: 1 }}>+</span>
            New folder
          </button>
        </>
      )}

      {(settings.showByTalent || settings.showByKind) && <SectionLabel text="Group by" />}
      {settings.showByTalent && <NavRow label="By talent" v={{ kind: "by-talent" }} />}
      {settings.showByKind && <NavRow label="By kind" v={{ kind: "by-kind" }} />}

      {settings.showAnalytics && (
        <>
          <SectionLabel text="More" />
          <NavRow label="Analytics" v={{ kind: "analytics" }} />
        </>
      )}
    </div>
  );
}

// ─── Folder Modal ─────────────────────────────────────────────────────────────

function FolderModal({
  folder, onClose, onSaved,
}: {
  folder?: MediaFolder;
  onClose: () => void;
  onSaved: () => void;
}) {
  const queueRouterRefresh = useQueuedRouterRefresh();
  const [name, setName] = useState(folder?.name ?? "");
  const [color, setColor] = useState(folder?.color ?? FOLDER_PALETTE[0]!);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(folder?.shareToken ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/folder/${folder.shareToken}` : null);
  const [shareLoading, setShareLoading] = useState(false);

  const save = async () => {
    setErr(null);
    if (!name.trim()) { setErr("Name is required."); return; }
    setBusy(true);
    if (folder) {
      const r = await actionRenameMediaFolder(folder.id, name, color);
      if (!r.ok) { setErr(r.error); setBusy(false); return; }
    } else {
      const r = await actionCreateMediaFolder(name, color);
      if (!r.ok) { setErr(r.error); setBusy(false); return; }
    }
    setBusy(false);
    queueRouterRefresh();
    onSaved();
    onClose();
  };

  const createShareLink = async () => {
    if (!folder) return;
    setShareLoading(true);
    const r = await actionCreateFolderShareLink(folder.id, 30);
    setShareLoading(false);
    if (r.ok) {
      // Prefer the absolute URL when the server could build one; otherwise
      // build it from the current origin so the clipboard gets a real URL.
      const isAbsolute = r.data.shareUrl.startsWith("http");
      const absolute = isAbsolute
        ? r.data.shareUrl
        : typeof window !== "undefined"
          ? `${window.location.origin}${r.data.sharePath}`
          : r.data.shareUrl;
      setShareUrl(absolute);
    }
  };

  const revokeShareLink = async () => {
    if (!folder) return;
    setShareLoading(true);
    await actionRevokeFolderShareLink(folder.id);
    setShareLoading(false);
    setShareUrl(null);
    queueRouterRefresh();
  };

  const deleteFolder = async () => {
    if (!folder) return;
    if (!confirm(`Delete "${folder.name}"? Photos stay, only the folder is removed.`)) return;
    setBusy(true);
    const r = await actionDeleteMediaFolder(folder.id);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    queueRouterRefresh();
    onSaved();
    onClose();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9100,
      background: "rgba(11,11,13,0.45)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 24,
    }} onClick={() => !busy && onClose()}>
      <div style={{
        background: "#fff", borderRadius: 14, width: "min(420px, 95vw)",
        boxShadow: "0 24px 64px rgba(11,11,13,0.25)", fontFamily: FONTS.body,
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "20px 22px 16px", borderBottom: `1px solid ${COLORS.borderSoft}` }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.ink }}>
            {folder ? "Edit folder" : "New folder"}
          </div>
        </div>

        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
          {err && (
            <div style={{ padding: "7px 12px", borderRadius: 8, background: "rgba(192,57,43,0.07)", border: "1px solid rgba(192,57,43,0.2)", fontSize: 12.5, color: "#c0392b" }}>
              {err}
            </div>
          )}

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.ink, marginBottom: 5 }}>Folder name</div>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
              placeholder="e.g. Press kit, Runway 2026…"
              maxLength={80}
              style={{
                width: "100%", boxSizing: "border-box", padding: "8px 12px",
                borderRadius: 8, border: `1px solid ${COLORS.border}`,
                fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink,
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.ink, marginBottom: 8 }}>Color</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {FOLDER_PALETTE.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} style={{
                  width: 22, height: 22, borderRadius: "50%", background: c, border: "none",
                  cursor: "pointer", outline: color === c ? `3px solid ${COLORS.ink}` : "none",
                  outlineOffset: 2,
                }} />
              ))}
            </div>
          </div>

          {/* Share link section (edit mode only) */}
          {folder && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.ink, marginBottom: 6 }}>Share link</div>
              {shareUrl ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <input readOnly value={shareUrl} onClick={(e) => (e.target as HTMLInputElement).select()}
                    style={{
                      width: "100%", boxSizing: "border-box", padding: "6px 10px",
                      borderRadius: 7, border: `1px solid ${COLORS.border}`,
                      fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted,
                    }} />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button"
                      onClick={() => void navigator.clipboard.writeText(shareUrl)}
                      style={{ flex: 1, padding: "5px 0", borderRadius: 7, border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.ink, fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      Copy
                    </button>
                    <button type="button" disabled={shareLoading} onClick={() => void revokeShareLink()}
                      style={{ flex: 1, padding: "5px 0", borderRadius: 7, border: "1px solid rgba(192,57,43,0.3)", background: "transparent", color: "#c0392b", fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      Revoke
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" disabled={shareLoading} onClick={() => void createShareLink()}
                  style={{
                    padding: "7px 14px", borderRadius: 7, border: `1px solid ${COLORS.border}`,
                    background: "transparent", color: COLORS.ink, fontFamily: FONTS.body,
                    fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                  }}>
                  {shareLoading ? "Creating…" : "Create share link (30 days)"}
                </button>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: "12px 22px 18px", borderTop: `1px solid ${COLORS.borderSoft}`, display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
          {folder && (
            <button type="button" disabled={busy} onClick={() => void deleteFolder()} style={{
              padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(192,57,43,0.3)",
              background: "transparent", color: "#c0392b", fontFamily: FONTS.body,
              fontSize: 12.5, fontWeight: 600, cursor: "pointer",
            }}>Delete</button>
          )}
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <button type="button" disabled={busy} onClick={onClose} style={{
              padding: "7px 18px", borderRadius: 8, border: `1px solid ${COLORS.border}`,
              background: "transparent", color: COLORS.inkMuted, fontFamily: FONTS.body, fontSize: 13, cursor: "pointer",
            }}>Cancel</button>
            <button type="button" disabled={busy || !name.trim()} onClick={() => void save()} style={{
              padding: "7px 18px", borderRadius: 8, border: "none",
              background: COLORS.fill, color: "#fff", fontFamily: FONTS.body,
              fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: busy ? 0.7 : 1,
            }}>
              {busy ? "Saving…" : folder ? "Save" : "Create folder"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Unified Lightbox + Detail rail ──────────────────────────────────────────
//
// One surface for viewing AND editing a photo. Image left, scrollable rail
// right with all the actions the old PhotoDetailDrawer + Lightbox had,
// merged into a single experience. ← → navigates, Esc closes, Y/N approves.

function MediaLightbox({
  photo, allPhotos, folders, wsLogoUrl, wsWatermarkEnabled,
  onClose, onRefresh, toast,
}: {
  photo: MediaPhoto;
  allPhotos: MediaPhoto[];
  folders: MediaFolder[];
  wsLogoUrl: string | null;
  wsWatermarkEnabled: boolean;
  onClose: () => void;
  onRefresh: () => void;
  toast: (msg: string) => void;
}) {
  const queueRouterRefresh = useQueuedRouterRefresh();
  const initialIdx = allPhotos.findIndex((p) => p.id === photo.id);
  const [currentIdx, setCurrentIdx] = useState(Math.max(0, initialIdx));

  // Keep currentIdx safe across allPhotos shrinking (e.g. after a delete).
  const safeIdx = Math.max(0, Math.min(allPhotos.length - 1, currentIdx));
  const current = allPhotos[safeIdx] ?? photo;

  const [showWm, setShowWm] = useState(true);
  const [copied, setCopied] = useState(false);

  // Track viewport — on narrow screens, stack the rail BELOW the image
  // instead of beside it. matchMedia + a resize listener keeps it live.
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 820px)");
    const sync = () => setIsNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Per-photo edit/busy state — resets when navigating to a new photo
  const [tags, setTags] = useState<string[]>(current.tags);
  const [tagInput, setTagInput] = useState("");
  const [note, setNote] = useState(current.note ?? "");
  const [savingTags, setSavingTags] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [folderBusy, setFolderBusy] = useState(false);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [setCardBusy, setSetCardBusy] = useState(false);
  const [setHeroBusy, setSetHeroBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [cropMode, setCropMode] = useState<"profile" | "cover" | "free" | null>(null);
  const [cropBusy, setCropBusy] = useState(false);
  const [revertBusy, setRevertBusy] = useState(false);
  const [activity, setActivity] = useState<Array<{ id: string; kind: string; payload: unknown; createdAt: string }>>([]);
  const [activityLoaded, setActivityLoaded] = useState(false);

  // Reset local edit state on photo change
  useEffect(() => {
    setTags(current.tags);
    setTagInput("");
    setNote(current.note ?? "");
    setActivity([]);
    setActivityLoaded(false);
    setCropMode(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id]);

  // Re-sync local state when bridge data refreshes after a mutation
  useEffect(() => {
    if (!savingTags) setTags(current.tags);
  }, [current.tags]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!savingNote) setNote(current.note ?? "");
  }, [current.note]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lazy-load activity feed for current photo
  useEffect(() => {
    if (!activityLoaded) {
      void actionGetAssetActivity(current.id).then((r) => {
        if (r.ok) setActivity(r.data);
        setActivityLoaded(true);
      });
    }
  }, [current.id, activityLoaded]);

  const go = useCallback((delta: number) => {
    setCurrentIdx((i) => Math.max(0, Math.min(allPhotos.length - 1, i + delta)));
  }, [allPhotos.length]);

  const setApproval = useCallback(async (state: "approved" | "rejected") => {
    setApprovalBusy(true);
    await actionSetApprovalState([current.id], state);
    setApprovalBusy(false);
    queueRouterRefresh();
    onRefresh();
  }, [current.id, queueRouterRefresh, onRefresh]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      // Don't capture shortcuts while typing or while the cropper owns the screen
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (cropMode !== null) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
      if (current.approvalState === "pending") {
        if (e.key === "y" || e.key === "Y") { e.preventDefault(); void setApproval("approved"); }
        if (e.key === "n" || e.key === "N") { e.preventDefault(); void setApproval("rejected"); }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, go, current.approvalState, setApproval, cropMode]);

  const wmActive = showWm && wsWatermarkEnabled && wsLogoUrl;
  const inFolder = (folderId: string) => current.folderIds.includes(folderId);

  const toggleFolder = async (folderId: string) => {
    setFolderBusy(true);
    if (inFolder(folderId)) {
      await actionRemoveAssetsFromFolder(folderId, [current.id]);
    } else {
      await actionAddAssetsToFolder(folderId, [current.id]);
    }
    setFolderBusy(false);
    queueRouterRefresh();
    onRefresh();
  };

  const saveTags = async (nextTags: string[]) => {
    setSavingTags(true);
    await actionSetAssetTags(current.id, nextTags);
    setSavingTags(false);
    queueRouterRefresh();
  };

  const addTag = () => {
    const clean = tagInput.trim().toLowerCase();
    if (!clean || tags.includes(clean)) { setTagInput(""); return; }
    const next = [...tags, clean];
    setTags(next);
    setTagInput("");
    void saveTags(next);
  };

  const removeTag = (t: string) => {
    const next = tags.filter((x) => x !== t);
    setTags(next);
    void saveTags(next);
  };

  const saveNote = async () => {
    setSavingNote(true);
    await actionSetAssetNote(current.id, note);
    setSavingNote(false);
    queueRouterRefresh();
  };

  // "Set as profile" = promote to variantKind=card (1:1 headshot)
  const setAsProfile = async () => {
    setSetCardBusy(true);
    const r = await actionSetAsCardPhoto(current.id, current.talentProfileId);
    setSetCardBusy(false);
    if (!r.ok) { toast(r.error || "Could not set as profile."); return; }
    toast(`Set as ${current.talentName}'s profile photo`);
    queueRouterRefresh();
    onRefresh();
  };

  // "Set as cover" = promote to variantKind=hero (16:9 banner)
  const setAsCover = async () => {
    setSetHeroBusy(true);
    const r = await actionSetAsHeroPhoto(current.id, current.talentProfileId);
    setSetHeroBusy(false);
    if (!r.ok) { toast(r.error || "Could not set as cover."); return; }
    toast(`Set as ${current.talentName}'s cover photo`);
    queueRouterRefresh();
    onRefresh();
  };

  // Cropper confirm handler — uploads the cropped blob as a new media asset
  // for this talent, sets variantKind based on which crop mode was chosen,
  // and links it to the source via source_media_asset_id (enables Revert).
  const handleCropConfirm = async (blob: Blob) => {
    if (!cropMode) return;
    setCropBusy(true);
    setCropMode(null); // close dialog immediately

    const variantKind: "card" | "hero" | "gallery" =
      cropMode === "profile" ? "card" :
      cropMode === "cover"   ? "hero" :
      "gallery";

    const filename = `crop-${cropMode}-${Date.now()}.webp`;
    const file = new File([blob], filename, { type: "image/webp" });
    const fd = new FormData();
    fd.append("file", file);

    const res = await actionUploadAndAssignMedia(
      fd,
      current.talentProfileId,
      variantKind,
      { cropOf: current.id, cropMode },
      current.id,
    );
    setCropBusy(false);
    if (!res.ok) { toast(res.error || "Crop upload failed."); return; }
    const label = cropMode === "profile" ? "profile photo" : cropMode === "cover" ? "cover photo" : "cropped photo";
    toast(`New ${label} saved`);
    queueRouterRefresh();
    onRefresh();
  };

  // Revert: delete this crop, leave source intact. The lightbox's safeIdx
  // clamp will land us on the next photo automatically.
  const revertToOriginal = async () => {
    if (!current.sourceMediaAssetId) return;
    if (!confirm("Revert to original? The cropped version will be removed.")) return;
    setRevertBusy(true);
    const r = await actionRevertCropToSource(current.id);
    setRevertBusy(false);
    if (!r.ok) { toast(r.error || "Revert failed."); return; }
    toast("Reverted to original");
    queueRouterRefresh();
    onRefresh();
  };

  const deletePhoto = async () => {
    if (!confirm("Delete this photo? This cannot be undone.")) return;
    setDeleteBusy(true);
    const r = await actionDeleteMediaAssets([current.id]);
    setDeleteBusy(false);
    if (!r.ok) return;
    queueRouterRefresh();
    onRefresh();
    if (allPhotos.length <= 1) onClose();
  };

  // ── Styled primitives ──────────────────────────────────────────────────────
  const railBtn: CSSProperties = {
    padding: "6px 10px", borderRadius: 7,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.06)", color: "#fff",
    fontFamily: FONTS.body, fontSize: 12, fontWeight: 600,
    cursor: "pointer", textDecoration: "none",
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
  };
  const railBtnPrimary: CSSProperties = {
    ...railBtn,
    background: "rgba(255,255,255,0.94)",
    color: "#0f0f12",
    border: "1px solid rgba(255,255,255,0.94)",
  };
  const railBtnDanger: CSSProperties = {
    ...railBtn,
    background: "rgba(192,57,43,0.16)",
    color: "rgba(255,135,120,0.95)",
    border: "1px solid rgba(192,57,43,0.4)",
  };
  const railInput: CSSProperties = {
    fontFamily: FONTS.body, fontSize: 12.5, padding: "7px 10px",
    borderRadius: 7, border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.05)", color: "#fff",
    width: "100%", boxSizing: "border-box", outline: "none",
  };
  const sectionLabel: CSSProperties = {
    fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 700,
    color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.7,
    marginBottom: 8,
  };
  const MetaRow = ({ label, value }: { label: string; value: string }) => (
    <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
      <div style={{ fontFamily: FONTS.body, fontSize: 11, color: "rgba(255,255,255,0.5)", width: 78, flexShrink: 0 }}>{label}</div>
      <div style={{ fontFamily: FONTS.body, fontSize: 12, color: "rgba(255,255,255,0.92)", flex: 1, wordBreak: "break-all" }}>{value}</div>
    </div>
  );

  // Admin-only header content: talent name + variant label + approval marker.
  // Replaces the default pill + previewLabel that the shared component
  // would otherwise render.
  const adminHeaderContent = (
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{
        fontFamily: FONTS.body, fontSize: 14, fontWeight: 700, color: "#fff",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {current.talentName}
      </div>
      <div style={{
        fontFamily: FONTS.body, fontSize: 11.5, color: "rgba(255,255,255,0.5)", marginTop: 2,
      }}>
        {VARIANT_LABELS[current.variantKind] ?? current.variantKind}
        {current.approvalState === "pending" && <span style={{ marginLeft: 6, color: "#f0b350" }}>· Review</span>}
        {current.approvalState === "rejected" && <span style={{ marginLeft: 6, color: "#e07566" }}>· Rejected</span>}
      </div>
    </div>
  );

  // Workspace watermark logo overlay on the image. Talent surfaces don't
  // have this; it's a workspace-branding preview.
  const adminImageOverlay = wmActive ? (
    <div style={{ position: "absolute", bottom: "4%", right: "4%", width: "13%", opacity: 0.72, pointerEvents: "none" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={wsLogoUrl!} alt="" style={{ width: "100%", height: "auto", objectFit: "contain", filter: "brightness(0) invert(1)" }} />
    </div>
  ) : null;

  // Admin-only PRIORITY sections — surfaces above the built-in
  // promote/crop chrome. Reserved for the highest-priority workflow:
  // pending-review approval shouldn't be buried.
  const adminTopSections = current.approvalState === "pending" ? (
    <div style={{ display: "flex", gap: 7 }}>
      <button type="button" disabled={approvalBusy} onClick={() => void setApproval("approved")}
        style={{
          flex: 1, padding: "9px 0", borderRadius: 7, border: "1px solid rgba(46,160,67,0.45)",
          background: "rgba(46,160,67,0.16)", color: "rgba(140,220,150,1)",
          fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
          opacity: approvalBusy ? 0.6 : 1,
        }}>
        ✓  Approve <span style={{ opacity: 0.5, fontWeight: 500 }}>Y</span>
      </button>
      <button type="button" disabled={approvalBusy} onClick={() => void setApproval("rejected")}
        style={{
          flex: 1, padding: "9px 0", borderRadius: 7, border: "1px solid rgba(192,57,43,0.45)",
          background: "rgba(192,57,43,0.14)", color: "rgba(255,140,125,1)",
          fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
          opacity: approvalBusy ? 0.6 : 1,
        }}>
        ✕  Reject <span style={{ opacity: 0.5, fontWeight: 500 }}>N</span>
      </button>
    </div>
  ) : null;

  // Admin-only rail sections — watermark toggle, metadata, tags, folders,
  // note, activity. Injected between Open/Copy URL and the Delete row at
  // the bottom of the rail.
  const adminExtraSections = (
    <>
      {/* Crop saving spinner — surfaces only while a crop upload is in
          flight (the cropper dialog itself shows progress, but the
          parent surface confirms the save here too). */}
      {cropBusy && (
        <div style={{ fontFamily: FONTS.body, fontSize: 10.5, color: "rgba(255,255,255,0.55)", textAlign: "center" }}>
          Saving crop…
        </div>
      )}

      {/* Watermark preview toggle */}
      {wsWatermarkEnabled && wsLogoUrl && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={sectionLabel as CSSProperties}>Watermark preview</div>
          <div style={{ display: "flex", borderRadius: 7, overflow: "hidden", border: "1px solid rgba(255,255,255,0.16)" }}>
            {(["Off", "On"] as const).map((label) => {
              const active = label === "On" ? showWm : !showWm;
              return (
                <button key={label} type="button" onClick={() => setShowWm(label === "On")}
                  style={{
                    padding: "4px 10px", border: "none", fontFamily: FONTS.body,
                    fontSize: 11, fontWeight: 600, cursor: "pointer",
                    background: active ? "rgba(255,255,255,0.18)" : "transparent",
                    color: active ? "#fff" : "rgba(255,255,255,0.45)",
                  }}>{label}</button>
              );
            })}
          </div>
        </div>
      )}

      {/* Metadata */}
      <div>
        <div style={sectionLabel as CSSProperties}>Details</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <MetaRow label="Status" value={current.approvalState} />
          <MetaRow label="Uploaded" value={fmtDate(current.createdAt)} />
          <MetaRow label="Dimensions" value={formatDim(current.width, current.height)} />
          <MetaRow label="Size" value={formatBytes(current.fileSizeBytes)} />
          {current.originalFilename && <MetaRow label="Filename" value={current.originalFilename} />}
          {current.mimeType && <MetaRow label="Type" value={current.mimeType} />}
        </div>
      </div>

      {/* Tags */}
      <div>
        <div style={sectionLabel as CSSProperties}>Tags</div>
        {tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
            {tags.map((tag) => (
              <span key={tag} style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "3px 9px", borderRadius: 999,
                background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.12)",
                fontFamily: FONTS.body, fontSize: 11.5, color: "rgba(255,255,255,0.9)",
              }}>
                {tag}
                <button type="button" onClick={() => removeTag(tag)} aria-label={`Remove ${tag}`} style={{
                  background: "none", border: "none", color: "rgba(255,255,255,0.55)",
                  cursor: "pointer", fontSize: 12, lineHeight: 1, padding: 0,
                }}>×</button>
              </span>
            ))}
          </div>
        )}
        <input value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
          placeholder="Add tag and press Enter…"
          style={railInput} />
        {savingTags && <div style={{ fontFamily: FONTS.body, fontSize: 10.5, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Saving…</div>}
      </div>

      {/* Folders */}
      {folders.length > 0 && (
        <div>
          <div style={sectionLabel as CSSProperties}>Folders</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {folders.map((f) => {
              const checked = inFolder(f.id);
              return (
                <label key={f.id} style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
                  <input type="checkbox" checked={checked} disabled={folderBusy}
                    onChange={() => void toggleFolder(f.id)}
                    style={{ accentColor: COLORS.fill, cursor: "pointer" }} />
                  <DotSwatch color={f.color ?? FOLDER_PALETTE[0]!} />
                  <span style={{ fontFamily: FONTS.body, fontSize: 12.5, color: "rgba(255,255,255,0.9)" }}>{f.name}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Note */}
      <div>
        <div style={sectionLabel as CSSProperties}>Note</div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note about this photo…" rows={3}
          style={{ ...railInput, resize: "vertical", lineHeight: 1.5 }} />
        <button type="button" onClick={() => void saveNote()} disabled={savingNote || note === (current.note ?? "")}
          style={{
            ...railBtn, marginTop: 6,
            opacity: (savingNote || note === (current.note ?? "")) ? 0.5 : 1,
          }}>
          {savingNote ? "Saving…" : "Save note"}
        </button>
      </div>

      {/* Activity */}
      {activityLoaded && activity.length > 0 && (
        <div>
          <div style={sectionLabel as CSSProperties}>Activity</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {activity.slice(0, 8).map((a) => (
              <div key={a.id} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.25)", marginTop: 6, flexShrink: 0 }} />
                <div>
                  <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: "rgba(255,255,255,0.88)" }}>{a.kind.replace(/_/g, " ")}</div>
                  <div style={{ fontFamily: FONTS.body, fontSize: 10.5, color: "rgba(255,255,255,0.4)" }}>{fmtDate(a.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      <PhotoLightbox
        asset={{
          id: current.id,
          url: current.url,
          variantKind: current.variantKind,
          approvalState: current.approvalState,
          sourceMediaAssetId: current.sourceMediaAssetId,
        }}
        allAssets={allPhotos.map((p) => ({
          id: p.id,
          url: p.url,
          variantKind: p.variantKind,
          approvalState: p.approvalState,
          sourceMediaAssetId: p.sourceMediaAssetId,
        }))}
        isAvatar={current.variantKind === "card"}
        isHero={current.variantKind === "hero"}
        onClose={onClose}
        onNavigate={(next) => {
          const i = allPhotos.findIndex((p) => p.id === next.id);
          if (i >= 0) setCurrentIdx(i);
        }}
        onSetAvatar={current.variantKind !== "card" ? setAsProfile : undefined}
        onSetHero={current.variantKind !== "hero" ? setAsCover : undefined}
        onCropAt={(aspect) => {
          if (cropBusy) return;
          setCropMode(aspect === 1 ? "profile" : aspect === "free" ? "free" : "cover");
        }}
        onDelete={deletePhoto}
        onRevertCrop={current.sourceMediaAssetId ? revertToOriginal : undefined}
        labels={{
          setAsProfile: "Use as profile",
          setAsCover: "Use as cover",
        }}
        headerContent={adminHeaderContent}
        imageOverlay={adminImageOverlay}
        topSections={adminTopSections}
        extraSections={adminExtraSections}
        // Admin has its own keyboard handler (adds Y/N approval shortcuts
        // and respects the cropMode guard). Tell PhotoLightbox to stand
        // down so Esc / ← → don't double-fire.
        disableKeyboard
      />

      {/* Cropper — opens on top of the lightbox when a Crop button is pressed.
          Aspect mirrors the chosen target role. On confirm we upload+register
          the crop. */}
      <PhotoCropperDialog
        open={cropMode !== null}
        onOpenChange={(o) => { if (!o) setCropMode(null); }}
        sourceUrl={current.url}
        aspect={cropMode === "profile" ? 1 : cropMode === "cover" ? 16 / 9 : "free"}
        onCropConfirm={handleCropConfirm}
      />
    </>
  );
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

function UploadModal({
  mode, stagingItems, stagingSelected, assignTalents,
  stagingBulkTalentId, assignTalentId, assignBusy,
  onSelectAll, onClearSel, onToggleItem, onBulkTalentChange, onBulkAssign,
  onItemTalentChange, onConfirm, onCancel, onReassign, onAssignTalentChange,
  selCount,
}: {
  mode: "upload" | "reassign";
  stagingItems: StagingItem[];
  stagingSelected: Set<string>;
  assignTalents: RosterTalentOption[];
  stagingBulkTalentId: string;
  assignTalentId: string;
  assignBusy: boolean;
  selCount: number;
  onSelectAll: () => void;
  onClearSel: () => void;
  onToggleItem: (id: string) => void;
  onBulkTalentChange: (id: string) => void;
  onBulkAssign: () => void;
  onItemTalentChange: (itemId: string, talentId: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onReassign: () => void;
  onAssignTalentChange: (id: string) => void;
}) {
  const inFlight = stagingItems.filter((it) => it.status === "uploading" || it.status === "queued").length;
  const ready = stagingItems.filter((it) => it.status === "ready").length;
  const errors = stagingItems.filter((it) => it.status === "error").length;

  const fsel: CSSProperties = {
    fontFamily: FONTS.body, fontSize: 12, padding: "4px 9px",
    borderRadius: 7, border: `1px solid ${COLORS.border}`,
    background: "#fff", color: COLORS.ink, cursor: "pointer",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9200,
      background: "rgba(11,11,13,0.5)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 20,
    }} onClick={() => !assignBusy && mode === "reassign" && onCancel()}>
      <div style={{
        background: "#fff", borderRadius: 16,
        width: mode === "upload" ? "min(800px, 96vw)" : 360,
        maxHeight: "88vh", display: "flex", flexDirection: "column",
        boxShadow: "0 24px 64px rgba(11,11,13,0.28)", fontFamily: FONTS.body,
      }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: "18px 22px 14px", borderBottom: `1px solid ${COLORS.borderSoft}` }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.ink, marginBottom: mode === "upload" ? 8 : 0 }}>
            {mode === "upload"
              ? `Upload ${stagingItems.length} photo${stagingItems.length !== 1 ? "s" : ""}`
              : `Move ${selCount} photo${selCount !== 1 ? "s" : ""} to talent`}
          </div>
          {mode === "upload" && (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ flex: 1, height: 3, borderRadius: 99, background: COLORS.borderSoft, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 99, background: COLORS.fill, width: `${stagingItems.length > 0 ? (ready / stagingItems.length) * 100 : 0}%`, transition: "width 300ms" }} />
              </div>
              <div style={{ fontSize: 11.5, color: COLORS.inkMuted, whiteSpace: "nowrap" }}>
                {inFlight > 0 ? `${ready}/${stagingItems.length} uploaded…` : errors > 0 ? `${errors} failed` : `${ready} ready`}
              </div>
            </div>
          )}
        </div>

        {/* Reassign: talent picker */}
        {mode === "reassign" && (
          <div style={{ padding: "18px 22px" }}>
            <div style={{ fontSize: 12.5, color: COLORS.inkMuted, marginBottom: 12, lineHeight: 1.5 }}>
              Photos will be re-assigned and appear under the new talent.
            </div>
            <select value={assignTalentId} onChange={(e) => onAssignTalentChange(e.target.value)}
              disabled={assignBusy} size={Math.min(assignTalents.length, 6)}
              style={{ width: "100%", borderRadius: 8, border: `1px solid ${COLORS.border}`, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink }}>
              {assignTalents.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}

        {/* Upload: bulk assign bar */}
        {mode === "upload" && (
          <div style={{ padding: "8px 22px", borderBottom: `1px solid ${COLORS.borderSoft}`, display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" onClick={onSelectAll}
              style={{ fontSize: 11.5, fontWeight: 600, color: COLORS.inkMuted, background: "none", border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: FONTS.body }}>
              Select all
            </button>
            {stagingSelected.size > 0 && (
              <>
                <button type="button" onClick={onClearSel}
                  style={{ fontSize: 11.5, fontWeight: 600, color: COLORS.inkMuted, background: "none", border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: FONTS.body }}>
                  Clear
                </button>
                <span style={{ fontSize: 11.5, color: COLORS.inkMuted }}>{stagingSelected.size} →</span>
                <select value={stagingBulkTalentId} onChange={(e) => onBulkTalentChange(e.target.value)} style={{ ...fsel }}>
                  {assignTalents.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button type="button" onClick={onBulkAssign}
                  style={{ fontSize: 12, fontWeight: 600, color: "#fff", background: COLORS.fill, border: "none", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: FONTS.body }}>
                  Assign
                </button>
              </>
            )}
          </div>
        )}

        {/* Upload: thumbnail grid */}
        {mode === "upload" && (
          <div style={{ flex: 1, overflow: "auto", padding: "14px 22px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8 }}>
              {stagingItems.map((item) => {
                const sel = stagingSelected.has(item.id);
                return (
                  <div key={item.id}
                    onClick={() => onToggleItem(item.id)}
                    style={{ cursor: "pointer", borderRadius: 8, overflow: "hidden", border: sel ? `2px solid ${COLORS.fill}` : `1px solid ${COLORS.borderSoft}`, background: COLORS.surfaceAlt }}>
                    <div style={{ position: "relative", aspectRatio: "1" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.blobUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      {item.status === "uploading" && (
                        <div style={{ position: "absolute", inset: 0, background: "rgba(11,11,13,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <div style={{ width: 18, height: 18, border: "2px solid rgba(255,255,255,0.35)", borderTopColor: "#fff", borderRadius: "50%" }} />
                        </div>
                      )}
                      {item.status === "error" && (
                        <div style={{ position: "absolute", inset: 0, background: "rgba(192,57,43,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: "#fff" }}>ERR</div>
                        </div>
                      )}
                      {item.status === "ready" && sel && (
                        <div style={{ position: "absolute", top: 4, right: 4, width: 16, height: 16, background: COLORS.fill, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ color: "#fff", fontSize: 9 }}>✓</span>
                        </div>
                      )}
                    </div>
                    <div style={{ padding: "3px 5px" }}>
                      <select value={item.talentId} onClick={(e) => e.stopPropagation()}
                        onChange={(e) => { e.stopPropagation(); onItemTalentChange(item.id, e.target.value); }}
                        style={{ width: "100%", fontSize: 10, fontFamily: FONTS.body, border: "none", background: "transparent", color: COLORS.ink, cursor: "pointer", padding: 0 }}>
                        {assignTalents.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: "12px 22px 16px", borderTop: `1px solid ${COLORS.borderSoft}`, display: "flex", gap: 9, justifyContent: "flex-end", alignItems: "center" }}>
          <button type="button" disabled={assignBusy} onClick={onCancel}
            style={{ padding: "7px 18px", borderRadius: 8, border: `1px solid ${COLORS.border}`, fontFamily: FONTS.body, fontSize: 13, fontWeight: 500, background: "transparent", color: COLORS.inkMuted, cursor: "pointer" }}>
            Cancel
          </button>
          <button type="button"
            disabled={assignBusy || (mode === "upload"
              ? ready === 0 || inFlight > 0
              : !assignTalentId)}
            onClick={() => mode === "upload" ? onConfirm() : onReassign()}
            style={{ padding: "7px 18px", borderRadius: 8, border: "none", fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, background: COLORS.fill, color: "#fff", cursor: "pointer", opacity: assignBusy ? 0.7 : 1 }}>
            {assignBusy ? "Saving…"
              : mode === "upload"
                ? `Save ${ready} photo${ready !== 1 ? "s" : ""}`
                : "Move to talent"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Analytics View ───────────────────────────────────────────────────────────

function AnalyticsView({ photos, folders }: { photos: MediaPhoto[]; folders: MediaFolder[] }) {
  const byTalent = useMemo(() => {
    const map = new Map<string, { count: number; pending: number; bytes: number }>();
    for (const p of photos) {
      const cur = map.get(p.talentName) ?? { count: 0, pending: 0, bytes: 0 };
      map.set(p.talentName, {
        count: cur.count + 1,
        pending: cur.pending + (p.approvalState === "pending" ? 1 : 0),
        bytes: cur.bytes + (p.fileSizeBytes ?? 0),
      });
    }
    return Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count);
  }, [photos]);

  const totalBytes = photos.reduce((s, p) => s + (p.fileSizeBytes ?? 0), 0);
  const byKind = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of photos) map.set(p.variantKind, (map.get(p.variantKind) ?? 0) + 1);
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [photos]);

  const StatCard = ({ label, value, sub }: { label: string; value: string | number; sub?: string }) => (
    <div style={{ padding: "16px 18px", borderRadius: 12, border: `1px solid ${COLORS.borderSoft}`, background: "#fff" }}>
      <div style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: FONTS.body, fontSize: 22, fontWeight: 700, color: COLORS.ink }}>{value}</div>
      {sub && <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ padding: "24px 28px", overflowY: "auto", flex: 1 }}>
      <div style={{ fontFamily: FONTS.body, fontSize: 18, fontWeight: 700, color: COLORS.ink, marginBottom: 20 }}>Analytics</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 28 }}>
        <StatCard label="Total photos" value={photos.length} />
        <StatCard label="Total storage" value={formatBytes(totalBytes)} />
        <StatCard label="Folders" value={folders.length} />
        <StatCard label="Pending review" value={photos.filter((p) => p.approvalState === "pending").length} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div>
          <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 700, color: COLORS.ink, marginBottom: 12 }}>By talent</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {byTalent.slice(0, 10).map(([name, stats]) => (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                <div style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted, whiteSpace: "nowrap" }}>{stats.count} · {formatBytes(stats.bytes)}</div>
                {stats.pending > 0 && <span style={{ background: COLORS.amber, color: "#fff", borderRadius: 999, fontSize: 9, fontWeight: 800, padding: "1px 5px" }}>{stats.pending}</span>}
              </div>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 700, color: COLORS.ink, marginBottom: 12 }}>By variant kind</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {byKind.map(([kind, count]) => (
              <div key={kind} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink }}>{VARIANT_LABELS[kind] ?? kind}</div>
                <div style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted }}>{count}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Photo Card ───────────────────────────────────────────────────────────────

function PhotoCard({
  photo, selected, keyboardFocused, wsLogoUrl, wsWatermarkEnabled,
  onToggle, onOpen,
}: {
  photo: MediaPhoto;
  selected: boolean;
  keyboardFocused?: boolean;
  wsLogoUrl: string | null;
  wsWatermarkEnabled: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const showWm = wsWatermarkEnabled && wsLogoUrl && !photo.hasOverride;
  const showWmOverride = photo.hasOverride && wsLogoUrl;

  // Single-slot pill, priority: rejected > pending > profile (card) > cover (hero)
  const pill =
    photo.approvalState === "rejected" ? PILL_STYLES.rejected :
    photo.approvalState === "pending"  ? PILL_STYLES.pending :
    photo.variantKind === "card"       ? PILL_STYLES.profile :
    photo.variantKind === "hero"       ? PILL_STYLES.cover :
    null;

  return (
    <div
      onClick={onOpen}
      style={{
        borderRadius: 11, overflow: "hidden", position: "relative",
        border: selected ? `2px solid ${COLORS.fill}` : keyboardFocused ? `2px solid ${COLORS.amber}` : `2px solid transparent`,
        boxShadow: selected ? `0 0 0 2px ${COLORS.fill}22` : keyboardFocused ? `0 0 0 3px ${COLORS.amber}30` : "0 1px 4px rgba(11,11,13,0.07)",
        cursor: "pointer", background: "#fff",
        transition: "border 0.1s, box-shadow 0.1s",
      }}
    >
      {/* Image */}
      <div style={{ width: "100%", aspectRatio: "3/4", position: "relative", overflow: "hidden", background: COLORS.surfaceAlt }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.thumbUrl} alt={photo.talentName} loading="lazy"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />

        {/* Workspace-default watermark overlay (preview only — gated by user toggle) */}
        {(showWm || showWmOverride) && wsLogoUrl && (
          <div style={{ position: "absolute", bottom: "5%", right: "5%", width: "24%", opacity: 0.75, pointerEvents: "none" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={wsLogoUrl} alt="" style={{ width: "100%", height: "auto", objectFit: "contain", filter: "brightness(0) invert(1)" }} />
          </div>
        )}

        {/* Single status/variant pill (top-left) */}
        {pill && (
          <div style={{
            position: "absolute", top: 6, left: 6,
            background: pill.bg, color: pill.fg, borderRadius: 5,
            fontFamily: FONTS.body, fontSize: 9.5, fontWeight: 700,
            padding: "2px 7px", letterSpacing: 0.3,
            boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
          }}>{pill.label}</div>
        )}

        {/* Per-image watermark override dot — subtle indicator next to pill */}
        {showWmOverride && (
          <div title="Custom watermark" style={{
            position: "absolute", top: pill ? 11 : 8, left: pill ? 78 : 8,
            width: 8, height: 8, borderRadius: "50%",
            background: "rgba(46,107,82,0.96)",
            border: "1.5px solid #fff",
            boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
          }} />
        )}

        {/* Tags chips */}
        {photo.tags.length > 0 && (
          <div style={{ position: "absolute", bottom: 6, left: 6, display: "flex", gap: 3, maxWidth: "70%" }}>
            {photo.tags.slice(0, 2).map((t) => (
              <span key={t} style={{
                padding: "1px 6px", borderRadius: 99,
                background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
                fontFamily: FONTS.body, fontSize: 8.5, fontWeight: 600, color: "#fff",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>{t}</span>
            ))}
          </div>
        )}

        {/* Hover zoom hint (bottom-right) — clicking the card already opens
            it, but a visible affordance helps signal "this is previewable." */}
        <div className="photo-zoom-hint" style={{
          position: "absolute", bottom: 6, right: 6,
          background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
          border: "1px solid rgba(255,255,255,0.18)",
          color: "rgba(255,255,255,0.92)", borderRadius: 6,
          fontFamily: FONTS.body, fontSize: 9.5, fontWeight: 600,
          padding: "2px 6px", opacity: 0, transition: "opacity 0.12s",
          pointerEvents: "none",
        }}>⤢ Open</div>

        {/* Checkbox — always visible, isolated click target */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          aria-label={selected ? "Deselect photo" : "Select photo"}
          style={{
            position: "absolute", top: 6, right: 6,
            width: 22, height: 22, borderRadius: 6,
            border: `2px solid ${selected ? COLORS.fill : "rgba(255,255,255,0.85)"}`,
            background: selected ? COLORS.fill : "rgba(0,0,0,0.32)",
            display: "flex", alignItems: "center", justifyContent: "center",
            backdropFilter: "blur(4px)", transition: "all 0.1s",
            padding: 0, cursor: "pointer",
          }}
        >
          {selected && <span style={{ color: "#fff", fontSize: 12, lineHeight: 1, fontWeight: 700 }}>✓</span>}
        </button>
      </div>

      {/* Footer — talent name only */}
      <div style={{ padding: "7px 9px 9px" }}>
        <div style={{
          fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 600, color: COLORS.ink,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{photo.talentName}</div>
      </div>

      <style jsx>{`
        div:hover :global(.photo-zoom-hint) { opacity: 1; }
      `}</style>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const MEDIA_SETTINGS_DEFAULT = {
  showFolders: true,
  // Watermark UI is parked — the visual preview overlay confuses the grid
  // more than it helps and the editor needs a rebuild. Forcing off until we
  // come back to it; the toggle is also hidden from the Settings popup
  // below so users can't accidentally turn it back on.
  showWatermark: false,
  showPending: true,
  showAnalytics: true,
  showByTalent: true,
  showByKind: true,
  showDriveImport: true,
} as const;
type MediaSettingsShape = { -readonly [K in keyof typeof MEDIA_SETTINGS_DEFAULT]: boolean };
const MEDIA_SETTINGS_STORAGE_KEY = "media-page.settings.v1";

export function WorkspaceMediaPage() {
  const {
    state, openDrawer, openUpgrade,
    bridgeMediaPhotos, bridgeMediaFolders,
    bridgeMediaErrored, bridgeMediaTotalCount,
    tenantSlug, toast,
  } = useAdminShell();
  const queueRouterRefresh = useQueuedRouterRefresh();
  const isAgency = meetsPlan(state.plan, "agency");

  // ── Branding settings ────────────────────────────────────────────
  // Page is Agency-gated below, so we can load branding unconditionally
  // once a tenant slug is available.
  const [_wsWatermarkConfigured, setWsWatermarkConfigured] = useState(false);
  const [wsLogoUrl, setWsLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!tenantSlug) return;
    void loadAgencyBrandingSettings().then((r) => {
      if (r.ok) {
        setWsWatermarkConfigured(r.data.watermarkPreset?.enabled ?? false);
        setWsLogoUrl(r.data.logoUrl);
      }
    });
  }, [tenantSlug]);

  // ── Media settings popup + upload menu ───────────────────────────
  const [showSettings, setShowSettings] = useState(false);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const [mediaSettings, setMediaSettings] = useState<MediaSettingsShape>(MEDIA_SETTINGS_DEFAULT);
  // Hydrate once from localStorage on mount. SSR-safe.
  // showWatermark is force-pinned to false regardless of stored value —
  // the visual preview is parked. Remove this override when the feature
  // gets rebuilt.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(MEDIA_SETTINGS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<MediaSettingsShape>;
      setMediaSettings({ ...MEDIA_SETTINGS_DEFAULT, ...parsed, showWatermark: false });
    } catch {
      // Ignore — fall back to defaults.
    }
  }, []);
  const toggleSetting = (key: keyof MediaSettingsShape) => {
    setMediaSettings((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (typeof window !== "undefined") {
        try { window.localStorage.setItem(MEDIA_SETTINGS_STORAGE_KEY, JSON.stringify(next)); } catch { /* quota */ }
      }
      return next;
    });
  };
  // Two separate signals:
  // - wsWatermarkConfigured = workspace has a watermark preset enabled
  //   (drives whether "Apply WM" and override badges can be used at all).
  // - wsWatermarkPreviewVisible = whether to render the preview overlay on
  //   this page (the user's settings toggle for visual noise).
  const wsWatermarkConfigured = _wsWatermarkConfigured;
  const wsWatermarkPreviewVisible = wsWatermarkConfigured && mediaSettings.showWatermark;
  // Legacy alias preserved for the existing render paths — points at the
  // preview signal, which is what every existing call site means today.
  const wsWatermarkEnabled = wsWatermarkPreviewVisible;

  // ── View / filter state ──────────────────────────────────────────
  const [view, setView] = useState<ActiveView>({ kind: "all" });
  const [filterTalent, setFilterTalent] = useState("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "approved" | "pending" | "rejected">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "talent">("newest");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ── Pagination / lazy-load state ─────────────────────────────────
  const [expandedTalentGroups, setExpandedTalentGroups] = useState<Set<string>>(new Set());
  const [allViewLimit, setAllViewLimit] = useState(18);

  // Reset pagination when view changes
  useEffect(() => { setAllViewLimit(18); setExpandedTalentGroups(new Set()); }, [view.kind]);

  // IntersectionObserver via callback ref — attaches as soon as the sentinel
  // mounts and detaches when it unmounts. Ref-in-deps doesn't react in
  // React; this does.
  const observerRef = useRef<IntersectionObserver | null>(null);
  const allViewSentinelRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (!node) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setAllViewLimit((n) => n + 18); },
      { rootMargin: "200px" },
    );
    obs.observe(node);
    observerRef.current = obs;
  }, []);

  // ── Unified lightbox+detail surface ──────────────────────────────
  // One state for the open photo. The MediaLightbox component below is
  // both viewer (image left) and editor (rail right).
  const [lightboxPhoto, setLightboxPhoto] = useState<MediaPhoto | null>(null);

  // ── Pending review: keyboard-driven focus ────────────────────────
  // focusedPendingIdx tracks which card is "active" in the pending view
  // for Y/N keyboard approval. Resets when leaving pending view.
  const [focusedPendingIdx, setFocusedPendingIdx] = useState(0);

  // ── Upload flow ──────────────────────────────────────────────────
  const uploadFileRef = useRef<HTMLInputElement | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [stagingItems, setStagingItems] = useState<StagingItem[]>([]);
  const [stagingSelected, setStagingSelected] = useState<Set<string>>(new Set());
  const [stagingBulkTalentId, setStagingBulkTalentId] = useState("");
  const [assignMode, setAssignMode] = useState<"upload" | "reassign">("upload");
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignTalents, setAssignTalents] = useState<RosterTalentOption[]>([]);
  const [assignTalentId, setAssignTalentId] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);

  // ── Drive import panel ───────────────────────────────────────────
  const [showDrivePanel, setShowDrivePanel] = useState(false);
  const [drivePanelUrl, setDrivePanelUrl] = useState("");
  const [drivePanelTalentId, setDrivePanelTalentId] = useState("");
  const [drivePanelStatus, setDrivePanelStatus] = useState<
    | { kind: "idle" }
    | { kind: "loading-talents" }
    | { kind: "listing" }
    | { kind: "confirmed"; fileIds: string[]; total: number; truncated: boolean }
    | { kind: "importing"; total: number; done: number }
    | { kind: "ok"; count: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  // Block page unload while import is in flight
  useEffect(() => {
    if (drivePanelStatus.kind !== "importing") return;
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [drivePanelStatus.kind]);

  const openDrivePanel = useCallback(async () => {
    setShowDrivePanel(true);
    setDrivePanelStatus({ kind: "idle" });
    setDrivePanelUrl("");
    if (assignTalents.length === 0) {
      setDrivePanelStatus({ kind: "loading-talents" });
      const result = await actionLoadRosterTalents();
      if (result.ok && result.data.length > 0) {
        setAssignTalents(result.data);
        setDrivePanelTalentId(result.data[0].id);
      }
      setDrivePanelStatus({ kind: "idle" });
    } else if (!drivePanelTalentId) {
      setDrivePanelTalentId(assignTalents[0].id);
    }
  }, [assignTalents, drivePanelTalentId]);

  // Phase 1 — list file IDs, show count before committing to download
  const handleDriveCheck = useCallback(async () => {
    if (!drivePanelUrl.trim() || !drivePanelTalentId) return;
    setDrivePanelStatus({ kind: "listing" });
    const res = await actionListDriveFolder(drivePanelUrl.trim());
    if (!res.ok) { setDrivePanelStatus({ kind: "error", message: res.error ?? "Could not read folder." }); return; }
    setDrivePanelStatus({ kind: "confirmed", fileIds: res.data.fileIds, total: res.data.count, truncated: res.data.truncated });
  }, [drivePanelUrl, drivePanelTalentId]);

  // Phase 2 — download + upload with live polling. Threads the fileIds
  // resolved at Check straight into Import so the two never disagree.
  const handleDriveImport = useCallback(async (fileIds: string[], total: number) => {
    if (!drivePanelTalentId) return;
    setDrivePanelStatus({ kind: "importing", total, done: 0 });

    const importPromise = actionImportFromGoogleDrive(
      drivePanelUrl.trim(),
      drivePanelTalentId,
      fileIds,
    );

    // Best-effort progress: poll the tenant media count and report deltas.
    // Concurrent uploads from elsewhere will overshoot — we clamp to total
    // to keep the bar honest.
    const baseline = await actionGetMediaCount();
    const baseCount = baseline.ok ? (baseline.data?.count ?? 0) : 0;
    const interval = setInterval(async () => {
      const cur = await actionGetMediaCount();
      if (cur.ok) {
        const done = Math.max(0, (cur.data?.count ?? baseCount) - baseCount);
        setDrivePanelStatus((prev) =>
          prev.kind === "importing" ? { kind: "importing", total, done: Math.min(done, total) } : prev,
        );
      }
    }, 2000);

    const res = await importPromise;
    clearInterval(interval);

    if (!res.ok) { setDrivePanelStatus({ kind: "error", message: res.error ?? "Import failed." }); return; }
    setDrivePanelStatus({ kind: "ok", count: res.data.assets.length });
    setDrivePanelUrl("");
    setTimeout(() => { setShowDrivePanel(false); setDrivePanelStatus({ kind: "idle" }); queueRouterRefresh(); }, 2500);
  }, [drivePanelUrl, drivePanelTalentId, queueRouterRefresh]);

  // ── Folder modal ─────────────────────────────────────────────────
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<MediaFolder | undefined>(undefined);

  // ── Mutation state ───────────────────────────────────────────────
  const [isDeleting, setIsDeleting] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  // ── Keyboard help overlay ────────────────────────────────────────
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);

  // ── Data mapping ─────────────────────────────────────────────────
  // The page type is the bridge type now (MediaPhoto = BridgeMediaPhoto) so
  // we just pass the array through. No per-field mapping = no drift.
  const photos: MediaPhoto[] = useMemo(
    () => bridgeMediaPhotos ?? [],
    [bridgeMediaPhotos],
  );

  const folders: MediaFolder[] = useMemo(() => bridgeMediaFolders ?? [], [bridgeMediaFolders]);

  // ── Filtering / sorting ──────────────────────────────────────────
  const allTalentNames = useMemo(() => Array.from(new Set(photos.map((p) => p.talentName))).sort(), [photos]);

  const filtered = useMemo(() => {
    let list = photos.filter((p) => {
      if (view.kind === "folder") {
        const folderId = (view as { folderId: string }).folderId;
        if (!p.folderIds.includes(folderId)) return false;
      }
      if (view.kind === "pending" && p.approvalState !== "pending") return false;
      if (filterTalent !== "all" && p.talentName !== filterTalent) return false;
      if (filterStatus !== "all" && p.approvalState !== filterStatus) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        if (!p.talentName.toLowerCase().includes(q) && !p.tags.some((t) => t.includes(q)) && !(p.originalFilename ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
    if (sortOrder === "oldest") list = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    else if (sortOrder === "talent") list = [...list].sort((a, b) => a.talentName.localeCompare(b.talentName));
    else list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return list;
  }, [photos, view, filterTalent, filterStatus, searchQuery, sortOrder]);

  const groupedByTalent = useMemo(() => {
    const map = new Map<string, MediaPhoto[]>();
    for (const p of filtered) {
      const arr = map.get(p.talentName) ?? [];
      arr.push(p);
      map.set(p.talentName, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const groupedByKind = useMemo(() => {
    const map = new Map<string, MediaPhoto[]>();
    for (const p of filtered) {
      const arr = map.get(p.variantKind) ?? [];
      arr.push(p);
      map.set(p.variantKind, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  // ── Keyboard shortcuts ───────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (lightboxPhoto || showAssignModal) return;
      if (e.key === "Escape") { setSelected(new Set()); setShowShortcutHelp(false); }
      if (e.key === "?") { setShowShortcutHelp((v) => !v); }
      if ((e.metaKey || e.ctrlKey) && e.key === "a") { e.preventDefault(); setSelected(new Set(filtered.map((p) => p.id))); }

      // Y / N / Arrow shortcuts in pending review mode
      if (view.kind === "pending") {
        const focusedPhoto = filtered[focusedPendingIdx];
        if (!focusedPhoto) return;

        // After approve/reject the photo leaves the pending list. The row
        // at the old index is now what *was* the next photo, so we keep the
        // index but clamp it to the post-mutation list length.
        const advance = () => {
          setFocusedPendingIdx((i) => Math.max(0, Math.min(filtered.length - 2, i)));
        };

        if (e.key === "y" || e.key === "Y") {
          e.preventDefault();
          void actionSetApprovalState([focusedPhoto.id], "approved").then(() => {
            advance();
            queueRouterRefresh();
          });
        }
        if (e.key === "n" || e.key === "N") {
          e.preventDefault();
          void actionSetApprovalState([focusedPhoto.id], "rejected").then(() => {
            advance();
            queueRouterRefresh();
          });
        }
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          setFocusedPendingIdx((i) => Math.min(filtered.length - 1, i + 1));
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          setFocusedPendingIdx((i) => Math.max(0, i - 1));
        }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, view, focusedPendingIdx, filtered, lightboxPhoto, showAssignModal]);

  // Selection helpers
  const toggleOne = (id: string) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const allSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const toggleAll = () => allSelected ? setSelected(new Set()) : setSelected(new Set(filtered.map((p) => p.id)));
  const selCount = selected.size;

  // ── File processing ──────────────────────────────────────────────
  const processFiles = useCallback(async (files: FileList | File[]) => {
    setUploadError(null);
    const rawFiles = Array.from(files);
    const zips = rawFiles.filter((f) => f.name.toLowerCase().endsWith(".zip"));
    // Reject SVG client-side too — server rejects, but failing here means
    // the user gets one clear "not supported" message instead of N upload errors.
    const isAllowedImage = (f: File) =>
      f.type.startsWith("image/") &&
      f.type !== "image/svg+xml" &&
      !f.name.toLowerCase().endsWith(".svg");
    let imageFiles = rawFiles.filter((f) => isAllowedImage(f) && !f.name.toLowerCase().endsWith(".zip"));
    const blocked = rawFiles.filter((f) =>
      !f.name.toLowerCase().endsWith(".zip")
      && (f.type === "image/svg+xml" || f.name.toLowerCase().endsWith(".svg")),
    );
    if (blocked.length > 0) {
      setUploadError(`SVG files aren’t supported for security reasons. Skipping ${blocked.length} file${blocked.length === 1 ? "" : "s"}.`);
    }

    if (zips.length > 0) {
      const ZIP_IMAGE_CAP = 100;
      try {
        const JSZip = (await import("jszip")).default;
        let anyTruncated = false;
        for (const zip of zips) {
          if (zip.size > 500 * 1024 * 1024) { setUploadError("ZIP must be under 500 MB."); return; }
          const z = await JSZip.loadAsync(zip);
          // Allow common raster formats only. SVG deliberately excluded.
          const IMAGE_EXTS = /\.(jpe?g|png|webp|gif|heic|avif)$/i;
          const extracted: File[] = [];
          let totalEligible = 0;
          for (const [name, entry] of Object.entries(z.files)) {
            if (entry.dir || !IMAGE_EXTS.test(name)) continue;
            totalEligible += 1;
            if (extracted.length >= ZIP_IMAGE_CAP) continue;
            const blob = await entry.async("blob");
            const mime = name.match(/\.png$/i) ? "image/png" : name.match(/\.webp$/i) ? "image/webp" : "image/jpeg";
            extracted.push(new File([blob], name.split("/").pop() ?? name, { type: mime }));
          }
          if (totalEligible > ZIP_IMAGE_CAP) anyTruncated = true;
          imageFiles = [...imageFiles, ...extracted];
        }
        if (anyTruncated) {
          setUploadError(`ZIPs contained more than ${ZIP_IMAGE_CAP} images — only the first ${ZIP_IMAGE_CAP} were extracted. Split into multiple ZIPs and upload again for the rest.`);
        }
      } catch { setUploadError("Could not read ZIP file."); return; }
    }

    if (imageFiles.length === 0) return;
    if (imageFiles.length > 200) { setUploadError("Max 200 images per batch."); return; }

    const result = await actionLoadRosterTalents();
    if (!result.ok || result.data.length === 0) { setUploadError("No talent on roster to assign to."); return; }
    const talents = result.data;
    setAssignTalents(talents);
    const defaultTalentId = talents[0]?.id ?? "";
    setStagingBulkTalentId(defaultTalentId);

    const items: StagingItem[] = imageFiles.map((file) => ({
      id: Math.random().toString(36).slice(2),
      file, blobUrl: URL.createObjectURL(file),
      status: "queued" as const,
      talentId: defaultTalentId,
    }));
    setStagingItems(items);
    setStagingSelected(new Set());
    setAssignMode("upload");
    setShowAssignModal(true);

    const CONCURRENCY = 4;
    let active = 0;
    const queue = [...items];
    await new Promise<void>((resolve) => {
      const tryNext = () => {
        if (queue.length === 0 && active === 0) { resolve(); return; }
        while (active < CONCURRENCY && queue.length > 0) {
          const item = queue.shift()!;
          active++;
          setStagingItems((prev) => prev.map((it) => it.id === item.id ? { ...it, status: "uploading" } : it));
          const fd = new FormData();
          fd.append("file", item.file);
          actionUploadToStagingStorage(fd).then((res) => {
            setStagingItems((prev) => prev.map((it) => it.id === item.id
              ? res.ok ? { ...it, status: "ready", storagePath: res.data.storagePath, publicUrl: res.data.publicUrl, meta: res.data.meta } : { ...it, status: "error", errorMsg: res.error }
              : it));
            active--; tryNext();
          }).catch(() => {
            setStagingItems((prev) => prev.map((it) => it.id === item.id ? { ...it, status: "error", errorMsg: "Upload failed" } : it));
            active--; tryNext();
          });
        }
      };
      tryNext();
    });
  }, []);

  const confirmStaging = async () => {
    const ready = stagingItems.filter((it) => it.status === "ready" && it.storagePath);
    if (ready.length === 0) return;
    setAssignBusy(true);
    const assignments = ready.map((it) => ({
      storagePath: it.storagePath!,
      talentProfileId: it.talentId,
      meta: it.meta,
    }));
    const res = await actionBulkAssignStagedMedia(assignments);
    setAssignBusy(false);
    if (!res.ok) { setUploadError(res.error); return; }
    stagingItems.forEach((it) => URL.revokeObjectURL(it.blobUrl));
    setStagingItems([]);
    setShowAssignModal(false);
    queueRouterRefresh();
  };

  const cancelStaging = () => {
    // Free the local blob URLs first so the dialog tears down immediately.
    stagingItems.forEach((it) => URL.revokeObjectURL(it.blobUrl));
    // Fire-and-forget storage cleanup so the user isn't kept waiting.
    const orphaned = stagingItems
      .filter((it) => it.status === "ready" && it.storagePath)
      .map((it) => it.storagePath!);
    if (orphaned.length > 0) {
      void actionCleanupStagedObjects(orphaned);
    }
    setStagingItems([]);
    setShowAssignModal(false);
  };

  const runReassign = async () => {
    if (!assignTalentId || selected.size === 0) return;
    setAssignBusy(true);
    const res = await actionReassignMediaToTalent(Array.from(selected), assignTalentId);
    setAssignBusy(false);
    setShowAssignModal(false);
    if (!res.ok) { setUploadError(res.error); return; }
    setSelected(new Set());
    queueRouterRefresh();
  };

  const openReassignModal = async () => {
    if (selected.size === 0) return;
    const result = await actionLoadRosterTalents();
    if (!result.ok || result.data.length === 0) { setUploadError("No talent on roster."); return; }
    setAssignTalents(result.data);
    setAssignTalentId(result.data[0]?.id ?? "");
    setAssignMode("reassign");
    setShowAssignModal(true);
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} photo${selected.size > 1 ? "s" : ""}? This cannot be undone.`)) return;
    setIsDeleting(true);
    const res = await actionDeleteMediaAssets(Array.from(selected));
    setIsDeleting(false);
    if (!res.ok) { setUploadError(res.error); return; }
    setSelected(new Set());
    queueRouterRefresh();
  };

  const handleApproveSelected = async () => {
    if (selected.size === 0) return;
    setIsApproving(true);
    await actionSetApprovalState(Array.from(selected), "approved");
    setIsApproving(false);
    setSelected(new Set());
    queueRouterRefresh();
  };

  const handleRejectSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Reject ${selected.size} photo${selected.size > 1 ? "s" : ""}?`)) return;
    setIsApproving(true);
    await actionSetApprovalState(Array.from(selected), "rejected");
    setIsApproving(false);
    setSelected(new Set());
    queueRouterRefresh();
  };

  const addSelectedToFolder = async (folderId: string) => {
    if (selected.size === 0) return;
    await actionAddAssetsToFolder(folderId, Array.from(selected));
    setSelected(new Set());
    queueRouterRefresh();
  };

  const setSelectedAsCardPhoto = async (photo: MediaPhoto) => {
    const res = await actionSetAsCardPhoto(photo.id, photo.talentProfileId);
    if (!res.ok) { setUploadError(res.error); return; }
    toast(`Set as ${photo.talentName}’s card photo`);
    setSelected(new Set());
    queueRouterRefresh();
  };

  const selHasPending = selCount > 0 && Array.from(selected).some((id) => photos.find((p) => p.id === id)?.approvalState === "pending");
  const currentFolder = view.kind === "folder" ? folders.find((f) => f.id === (view as { folderId: string }).folderId) : undefined;

  const isLiveMode = bridgeMediaPhotos !== null;

  // ── Upgrade gate ─────────────────────────────────────────────────
  if (!isAgency) {
    return (
      <div style={{ padding: "48px 28px", maxWidth: 560, margin: "0 auto" }}>
        <div style={{ marginBottom: 8 }}>
          <h1 style={{ fontFamily: FONTS.body, fontSize: 22, fontWeight: 700, color: COLORS.ink, margin: 0 }}>Media</h1>
          <p style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.inkMuted, marginTop: 4, marginBottom: 0 }}>Your workspace photo library — every photo across every talent, with watermark control and usage tracking.</p>
        </div>
        <div style={{ marginTop: 32, padding: 28, borderRadius: 16, border: `1px solid ${COLORS.borderSoft}`, background: "#fff", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 36 }}>🖼️</div>
          <div>
            <div style={{ fontFamily: FONTS.body, fontSize: 16, fontWeight: 700, color: COLORS.ink, marginBottom: 6 }}>Branded media gallery — Agency plan</div>
            <div style={{ fontFamily: FONTS.body, fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.6, marginBottom: 16 }}>
              Every photo your agency controls — folders, tags, watermarks, bulk actions, and analytics.
            </div>
            <ul style={{ padding: 0, margin: "0 0 20px 0", listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
              {["Workspace-wide photo inventory", "Folders + tags for organisation", "Logo watermark — position · opacity", "Bulk approve / reject / reassign", "Usage analytics per talent"].map((item) => (
                <li key={item} style={{ display: "flex", gap: 8, fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink }}>
                  <span style={{ color: COLORS.success }}>✓</span>{item}
                </li>
              ))}
            </ul>
          </div>
          <PrimaryButton onClick={() => openUpgrade({ feature: "Branded media gallery", why: "See every photo your agency controls.", requiredPlan: "agency", unlocks: ["Workspace-wide photo inventory", "Folders + tags", "Logo watermark", "Bulk actions", "Analytics"] })}>
            Upgrade to Agency
          </PrimaryButton>
        </div>
      </div>
    );
  }

  // ── Grid content ─────────────────────────────────────────────────
  const filterSel: CSSProperties = {
    fontFamily: FONTS.body, fontSize: 12, padding: "5px 9px",
    borderRadius: 7, border: `1px solid ${COLORS.border}`, background: "#fff",
    color: COLORS.ink, cursor: "pointer",
  };

  const renderGrid = () => {
    if (view.kind === "analytics") return <AnalyticsView photos={photos} folders={folders} />;

    const showGroupedByTalent = view.kind === "by-talent";
    const showGroupedByKind = view.kind === "by-kind";
    const useGrouped = showGroupedByTalent || showGroupedByKind;
    const groups = showGroupedByTalent ? groupedByTalent : showGroupedByKind ? groupedByKind.map(([kind, ph]) => [VARIANT_LABELS[kind] ?? kind, ph] as [string, MediaPhoto[]]) : [];

    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {/* Filter bar */}
        {true && (
          <div style={{ padding: "12px 20px 10px", borderBottom: `1px solid ${COLORS.borderSoft}`, display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
            <input type="search" value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSelected(new Set()); }}
              placeholder="Search name, tag, filename…"
              style={{ ...filterSel, minWidth: 160 }} />
            {view.kind !== "by-talent" && (
              <select value={filterTalent} onChange={(e) => { setFilterTalent(e.target.value); setSelected(new Set()); }} style={filterSel}>
                <option value="all">All talent</option>
                {allTalentNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            )}
            {view.kind !== "pending" && (
              <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value as typeof filterStatus); setSelected(new Set()); }} style={filterSel}>
                <option value="all">All statuses</option>
                <option value="approved">Approved</option>
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
              </select>
            )}
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)} style={filterSel}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="talent">Talent A–Z</option>
            </select>
            {(filterTalent !== "all" || filterStatus !== "all" || searchQuery) && (
              <button type="button" onClick={() => { setFilterTalent("all"); setFilterStatus("all"); setSearchQuery(""); setSelected(new Set()); }}
                style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted, background: "none", border: "none", cursor: "pointer" }}>
                × Clear
              </button>
            )}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              {/* Folder quick-add when in folder view */}
              {view.kind === "folder" && currentFolder && (
                <button type="button" onClick={() => { setEditingFolder(currentFolder); setShowFolderModal(true); }}
                  style={{ ...filterSel, fontWeight: 600 }}>
                  ⚙ {currentFolder.name}
                </button>
              )}
              <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ accentColor: COLORS.fill, cursor: "pointer" }} />
                <span style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted }}>All ({filtered.length})</span>
              </label>
            </div>
          </div>
        )}

        {/* Pending review: keyboard hint bar */}
        {view.kind === "pending" && filtered.length > 0 && selCount === 0 && (
          <div style={{
            padding: "7px 20px", background: "rgba(255,193,7,0.08)", borderBottom: `1px solid ${COLORS.borderSoft}`,
            display: "flex", alignItems: "center", gap: 12, fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted,
          }}>
            <span style={{ color: COLORS.amber, fontWeight: 700 }}>{filtered.length} pending</span>
            <span>·</span>
            <span><kbd style={{ padding: "1px 5px", borderRadius: 4, border: `1px solid ${COLORS.border}`, fontFamily: "monospace", fontSize: 10.5 }}>Y</kbd> Approve</span>
            <span><kbd style={{ padding: "1px 5px", borderRadius: 4, border: `1px solid ${COLORS.border}`, fontFamily: "monospace", fontSize: 10.5 }}>N</kbd> Reject</span>
            <span><kbd style={{ padding: "1px 5px", borderRadius: 4, border: `1px solid ${COLORS.border}`, fontFamily: "monospace", fontSize: 10.5 }}>←→</kbd> Navigate</span>
            <span style={{ marginLeft: "auto" }}>
              Focused: {focusedPendingIdx + 1} / {filtered.length}
            </span>
          </div>
        )}

        {/* Bulk bar */}
        {selCount > 0 && (() => {
          const firstSelected = filtered.find((p) => selected.has(p.id)) ?? null;
          const isSingle = selCount === 1;
          const BulkBtn = ({ label, icon, onClick, danger, disabled }: { label: string; icon: string; onClick: () => void; danger?: boolean; disabled?: boolean }) => (
            <button
              type="button"
              onClick={onClick}
              disabled={disabled}
              title={label}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: danger ? "rgba(192,57,43,0.75)" : "rgba(255,255,255,0.13)",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "#fff", padding: "5px 11px", borderRadius: 7,
                cursor: disabled ? "not-allowed" : "pointer",
                fontFamily: FONTS.body, fontSize: 12, fontWeight: 600,
                opacity: disabled ? 0.45 : 1, whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = danger ? "rgba(192,57,43,0.95)" : "rgba(255,255,255,0.22)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = danger ? "rgba(192,57,43,0.75)" : "rgba(255,255,255,0.13)"; }}
            >
              <span style={{ fontSize: 13 }}>{icon}</span>
              {label}
            </button>
          );
          const Sep = () => <div style={{ width: 1, height: 22, background: "rgba(255,255,255,0.18)", flexShrink: 0 }} />;
          return (
            <div style={{
              padding: "8px 16px", background: "#1a1e2e", color: "#fff",
              display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
              fontFamily: FONTS.body, fontSize: 12,
              borderBottom: `1px solid rgba(255,255,255,0.08)`,
            }}>
              {/* Count */}
              <span style={{ fontWeight: 700, fontSize: 13, marginRight: 4, whiteSpace: "nowrap" }}>
                {selCount} selected
              </span>
              <Sep />

              {/* Per-photo action — single select only. Bulk-only path: open
                  the unified surface for the one selected photo (kept here so
                  bulk-mode users can edit details without losing selection). */}
              <BulkBtn
                icon="⭐"
                label="Set as profile"
                disabled={!isSingle || !firstSelected || firstSelected.variantKind === "card"}
                onClick={() => { if (firstSelected) void setSelectedAsCardPhoto(firstSelected); }}
              />
              <Sep />

              {/* Organise — Watermark is gated on configuration, not on the
                  preview-visibility toggle, so the user can still apply
                  watermarks when they've hidden the on-page overlay. */}
              {wsWatermarkConfigured && <BulkBtn icon="🔖" label="Watermark…" onClick={() => openDrawer("watermark-editor", { selectedIds: Array.from(selected) })} />}
              <BulkBtn icon="📂" label="Move to talent…" onClick={() => void openReassignModal()} />
              {folders.length > 0 && (
                <div style={{ position: "relative" }}>
                  <BulkBtn icon="🗂" label="Add to folder…" onClick={() => setFolderMenuOpen((v) => !v)} />
                  {folderMenuOpen && (
                    <>
                      <div onClick={() => setFolderMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 89 }} />
                      <div style={{
                        position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 90,
                        background: "#1f2333", border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 10, boxShadow: "0 12px 32px -8px rgba(0,0,0,0.4)",
                        minWidth: 200, maxHeight: 320, overflowY: "auto",
                        padding: "5px 0", fontFamily: FONTS.body,
                      }}>
                        {folders.map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => { void addSelectedToFolder(f.id); setFolderMenuOpen(false); }}
                            style={{
                              width: "100%", display: "flex", alignItems: "center", gap: 9,
                              padding: "7px 14px", background: "transparent", border: "none",
                              color: "#fff", fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 500,
                              cursor: "pointer", textAlign: "left",
                            }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                          >
                            <DotSwatch color={f.color ?? FOLDER_PALETTE[0]!} />
                            <span>{f.name}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
              <Sep />

              {/* Review */}
              {selHasPending && (
                <>
                  <BulkBtn icon="✅" label={isApproving ? "…" : "Approve"} disabled={isApproving} onClick={() => void handleApproveSelected()} />
                  <BulkBtn icon="🚫" label="Reject" disabled={isApproving} onClick={() => void handleRejectSelected()} />
                  <Sep />
                </>
              )}

              {/* Destructive */}
              <BulkBtn icon="🗑" label={isDeleting ? "Deleting…" : `Delete ${selCount}`} danger disabled={isDeleting} onClick={() => void handleDeleteSelected()} />

              {/* Dismiss */}
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                title="Clear selection"
                style={{ marginLeft: "auto", background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "0 2px" }}
              >×</button>
            </div>
          );
        })()}

        {/* Grid / grouped content */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px 20px 32px" }}>
          {useGrouped ? (
            groups.map(([groupName, groupPhotos]) => {
              const ROW_SIZE = 6;
              const isExpanded = expandedTalentGroups.has(groupName);
              const isByTalent = showGroupedByTalent;
              const visiblePhotos = isByTalent && !isExpanded ? groupPhotos.slice(0, ROW_SIZE) : groupPhotos;
              const hiddenCount = groupPhotos.length - visiblePhotos.length;
              return (
                <div key={groupName} style={{ marginBottom: 28 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 700, color: COLORS.ink }}>{groupName}</div>
                    <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted }}>{groupPhotos.length} photo{groupPhotos.length !== 1 ? "s" : ""}</div>
                    <div style={{ flex: 1, height: 1, background: COLORS.borderSoft }} />
                    {isByTalent && groupPhotos.length > ROW_SIZE && (
                      <button
                        type="button"
                        onClick={() => setExpandedTalentGroups((prev) => {
                          const next = new Set(prev);
                          if (isExpanded) next.delete(groupName); else next.add(groupName);
                          return next;
                        })}
                        style={{
                          fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 600,
                          color: COLORS.fill, background: "none", border: "none",
                          cursor: "pointer", padding: "0 2px", whiteSpace: "nowrap",
                        }}
                      >
                        {isExpanded ? "Show less ↑" : `See ${hiddenCount} more →`}
                      </button>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: isByTalent ? "repeat(6, 1fr)" : "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
                    {visiblePhotos.map((photo) => (
                      <PhotoCard
                        key={photo.id}
                        photo={photo}
                        selected={selected.has(photo.id)}
                        wsLogoUrl={wsLogoUrl}
                        wsWatermarkEnabled={wsWatermarkEnabled}
                        onToggle={() => toggleOne(photo.id)}
                        onOpen={() => setLightboxPhoto(photo)}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          ) : filtered.length === 0 ? (
            <div style={{
              padding: 56, textAlign: "center",
              fontFamily: FONTS.body, fontSize: 13, color: COLORS.inkMuted,
              border: `1px dashed ${COLORS.border}`, borderRadius: 12,
            }}>
              {view.kind === "folder"
                ? "No photos in this folder yet. Select photos and use '+ Folder…' to add them."
                : view.kind === "pending"
                  ? "No photos pending review."
                  : isLiveMode
                    ? "No photos match. Try clearing filters or uploading."
                    : "No photos yet — drop images or click Upload."}
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: 11 }}>
                {filtered.slice(0, allViewLimit).map((photo, photoIdx) => (
                  <PhotoCard
                    key={photo.id}
                    photo={photo}
                    selected={selected.has(photo.id)}
                    keyboardFocused={view.kind === "pending" && photoIdx === focusedPendingIdx}
                    wsLogoUrl={wsLogoUrl}
                    wsWatermarkEnabled={wsWatermarkEnabled}
                    onToggle={() => { toggleOne(photo.id); if (view.kind === "pending") setFocusedPendingIdx(photoIdx); }}
                    onOpen={() => { if (view.kind === "pending") setFocusedPendingIdx(photoIdx); setLightboxPhoto(photo); }}
                  />
                ))}
              </div>
              {/* Sentinel: triggers auto-load when scrolled into view */}
              {allViewLimit < filtered.length && (
                <div ref={allViewSentinelRef} style={{ height: 1, marginTop: 20 }} />
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragOver(false); void processFiles(e.dataTransfer.files); }}
    >
      {/* Hidden file input */}
      <input ref={uploadFileRef} type="file" accept="image/*,.zip" multiple hidden
        onChange={(e) => { void processFiles(e.target.files ?? []); e.target.value = ""; }} />

      {/* Drag-drop overlay */}
      {isDragOver && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 9999,
          background: `${COLORS.fill}12`, border: `3px dashed ${COLORS.fill}`,
          borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none",
        }}>
          <div style={{ fontFamily: FONTS.body, fontSize: 18, fontWeight: 700, color: COLORS.fill }}>Drop photos here</div>
        </div>
      )}

      {/* Page header */}
      <div style={{ padding: "20px 20px 0 20px", borderBottom: `1px solid ${COLORS.borderSoft}` }}>
        {bridgeMediaErrored && (
          <div style={{ marginBottom: 10, padding: "8px 13px", borderRadius: 8, background: "rgba(192,57,43,0.06)", border: "1px solid rgba(192,57,43,0.18)", fontFamily: FONTS.body, fontSize: 12.5, color: "#c0392b" }}>
            We couldn’t load your media library. Try refreshing — if it keeps failing the bridge query is broken.
          </div>
        )}
        {/* Bridge cap banner — totalCount now comes from a dedicated post-
            join count query, so this comparison is finally honest. */}
        {bridgeMediaTotalCount != null && bridgeMediaTotalCount > photos.length && (
          <div style={{ marginBottom: 10, padding: "8px 13px", borderRadius: 8, background: "rgba(255,193,7,0.08)", border: "1px solid rgba(255,193,7,0.22)", fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink }}>
            Showing <strong>{photos.length.toLocaleString()}</strong> of <strong>{bridgeMediaTotalCount.toLocaleString()}</strong> photos. Use filters or folders to narrow what you see.
          </div>
        )}
        {uploadError && (
          <div style={{ marginBottom: 10, padding: "8px 13px", borderRadius: 8, background: "rgba(192,57,43,0.06)", border: "1px solid rgba(192,57,43,0.18)", fontFamily: FONTS.body, fontSize: 12.5, color: "#c0392b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{uploadError}</span>
            <button type="button" onClick={() => setUploadError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#c0392b", fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", paddingBottom: 14 }}>
          <div>
            <h1 style={{ fontFamily: FONTS.body, fontSize: 20, fontWeight: 700, color: COLORS.ink, margin: 0 }}>Media</h1>
            <p style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.inkMuted, marginTop: 2, marginBottom: 0 }}>
              {photos.length} photo{photos.length !== 1 ? "s" : ""} · {folders.length} folder{folders.length !== 1 ? "s" : ""}
              {mediaSettings.showWatermark && wsWatermarkEnabled && wsLogoUrl && <span style={{ marginLeft: 8, color: COLORS.success }}>· Watermark on</span>}
            </p>
          </div>
          <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", position: "relative" }}>
            {/* Settings gear */}
            <div style={{ position: "relative" }}>
              <SecondaryButton size="sm" onClick={() => setShowSettings((v) => !v)}>⚙ Settings</SecondaryButton>
              {showSettings && (
                <>
                  {/* backdrop */}
                  <div onClick={() => setShowSettings(false)} style={{ position: "fixed", inset: 0, zIndex: 89 }} />
                  {/* popup */}
                  <div style={{
                    position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 90,
                    background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
                    borderRadius: 12, boxShadow: "0 8px 32px -8px rgba(11,11,13,0.22)",
                    width: 240, padding: "6px 0",
                    fontFamily: FONTS.body,
                  }}>
                    <div style={{ padding: "6px 14px 8px", fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: COLORS.inkDim }}>
                      Media features
                    </div>
                    {([
                      ["showFolders",    "Folders"],
                      // Watermark toggle parked — see MEDIA_SETTINGS_DEFAULT.
                      ["showPending",    "Pending review"],
                      ["showAnalytics",  "Analytics"],
                      ["showByTalent",   "Group by talent"],
                      ["showByKind",     "Group by kind"],
                      ["showDriveImport","Drive import"],
                    ] as [keyof typeof mediaSettings, string][]).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleSetting(key)}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "8px 14px", background: "transparent", border: "none",
                          cursor: "pointer", fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink,
                          textAlign: "left",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = COLORS.surfaceAlt; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                      >
                        <span>{label}</span>
                        {/* toggle pill */}
                        <span style={{
                          width: 34, height: 20, borderRadius: 10, flexShrink: 0,
                          background: mediaSettings[key] ? COLORS.fill : COLORS.borderSoft,
                          display: "inline-flex", alignItems: "center",
                          padding: "0 3px", transition: "background .15s",
                        }}>
                          <span style={{
                            width: 14, height: 14, borderRadius: "50%", background: "#fff",
                            transform: mediaSettings[key] ? "translateX(14px)" : "translateX(0)",
                            transition: "transform .15s",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
                          }} />
                        </span>
                      </button>
                    ))}
                    {/* Watermark config shortcut */}
                    {mediaSettings.showWatermark && (
                      <>
                        <div style={{ height: 1, background: COLORS.borderSoft, margin: "4px 0" }} />
                        <button
                          type="button"
                          onClick={() => { setShowSettings(false); openDrawer("branding"); }}
                          style={{
                            width: "100%", padding: "8px 14px", background: "transparent", border: "none",
                            cursor: "pointer", fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.inkMuted,
                            textAlign: "left", display: "flex", alignItems: "center", gap: 6,
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = COLORS.surfaceAlt; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                        >
                          <span>↗</span> Configure watermark
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
            {/* Upload dropdown */}
            <div style={{ position: "relative" }}>
              <PrimaryButton size="sm" onClick={() => setShowUploadMenu((v) => !v)} disabled={assignBusy}>
                + Upload ▾
              </PrimaryButton>
              {showUploadMenu && (
                <>
                  <div onClick={() => setShowUploadMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 89 }} />
                  <div style={{
                    position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 90,
                    background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
                    borderRadius: 12, boxShadow: "0 8px 32px -8px rgba(11,11,13,0.22)",
                    width: 220, padding: "6px 0", fontFamily: FONTS.body,
                  }}>
                    {([
                      { icon: "📁", label: "From computer", sub: "JPG, PNG, WEBP, ZIP", action: () => { setShowUploadMenu(false); uploadFileRef.current?.click(); } },
                      { icon: "⬛", label: "Drag & drop", sub: "Drop anywhere on this page", action: () => { setShowUploadMenu(false); toast("Drop images anywhere on the page"); } },
                      ...(mediaSettings.showDriveImport ? [{ icon: "🟢", label: "Google Drive", sub: "Import from a shared folder", action: () => { setShowUploadMenu(false); void openDrivePanel(); } }] : []),
                    ] as { icon: string; label: string; sub: string; action: () => void }[]).map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={item.action}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", gap: 10,
                          padding: "9px 14px", background: "transparent", border: "none",
                          cursor: "pointer", textAlign: "left",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = COLORS.surfaceAlt; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                      >
                        <span style={{ fontSize: 18, lineHeight: 1 }}>{item.icon}</span>
                        <div>
                          <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{item.label}</div>
                          <div style={{ fontFamily: FONTS.body, fontSize: 11, color: COLORS.inkMuted, marginTop: 1 }}>{item.sub}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Drive import inline panel */}
        {showDrivePanel && (
          <div style={{ padding: "12px 20px", background: "rgba(15,79,62,0.04)", borderBottom: `1px solid ${COLORS.borderSoft}`, display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Phase 1 row: URL + talent + Check */}
            {(drivePanelStatus.kind === "idle" || drivePanelStatus.kind === "loading-talents" || drivePanelStatus.kind === "listing" || drivePanelStatus.kind === "error") && (
              <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="url"
                  value={drivePanelUrl}
                  onChange={(e) => setDrivePanelUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleDriveCheck(); }}
                  placeholder="Paste Drive file or folder link…"
                  autoFocus
                  style={{ flex: 1, minWidth: 200, fontFamily: FONTS.body, fontSize: 12, padding: "6px 10px", borderRadius: 7, border: `1px solid ${COLORS.border}`, background: "#fff", color: COLORS.ink, outline: "none" }}
                />
                {assignTalents.length > 0 && (
                  <select value={drivePanelTalentId} onChange={(e) => setDrivePanelTalentId(e.target.value)}
                    style={{ fontFamily: FONTS.body, fontSize: 12, padding: "6px 9px", borderRadius: 7, border: `1px solid ${COLORS.border}`, background: "#fff", color: COLORS.ink, cursor: "pointer" }}>
                    {assignTalents.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
                <button type="button" onClick={() => void handleDriveCheck()}
                  disabled={drivePanelStatus.kind === "listing" || !drivePanelUrl.trim() || !drivePanelTalentId}
                  style={{ fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 7, background: COLORS.fill, color: "#fff", border: "none", cursor: "pointer",
                    opacity: (drivePanelStatus.kind === "listing" || !drivePanelUrl.trim() || !drivePanelTalentId) ? 0.5 : 1 }}>
                  {drivePanelStatus.kind === "listing" ? "Checking…" : "Check"}
                </button>
                <button type="button" onClick={() => setShowDrivePanel(false)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.inkMuted, fontSize: 18, lineHeight: 1, padding: "2px 4px" }}>×</button>
              </div>
            )}

            {/* Phase 2 row: confirm count + Import button */}
            {drivePanelStatus.kind === "confirmed" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink }}>
                    Found <strong>{drivePanelStatus.total}</strong> photo{drivePanelStatus.total !== 1 ? "s" : ""} in that folder
                  </div>
                  <button type="button"
                    onClick={() => void handleDriveImport(drivePanelStatus.fileIds, drivePanelStatus.total)}
                    style={{ fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 7, background: COLORS.fill, color: "#fff", border: "none", cursor: "pointer" }}>
                    Import {drivePanelStatus.total} photo{drivePanelStatus.total !== 1 ? "s" : ""}
                  </button>
                  <button type="button" onClick={() => setDrivePanelStatus({ kind: "idle" })}
                    style={{ background: "none", border: "none", cursor: "pointer", fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted }}>Cancel</button>
                </div>
                {drivePanelStatus.truncated && (
                  <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.amber }}>
                    Folder is very large — only the first {drivePanelStatus.total} images are listed. Move excess into a sub-folder and re-run.
                  </div>
                )}
              </div>
            )}

            {/* Importing progress row */}
            {drivePanelStatus.kind === "importing" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink }}>
                    Importing… <strong>{drivePanelStatus.done}</strong> / {drivePanelStatus.total} photos
                  </div>
                  <div style={{ fontFamily: FONTS.body, fontSize: 11, color: COLORS.inkMuted }}>Safe to leave — import continues server-side</div>
                </div>
                <div style={{ height: 4, borderRadius: 4, background: COLORS.borderSoft, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 4, background: COLORS.fill, width: `${drivePanelStatus.total > 0 ? Math.round((drivePanelStatus.done / drivePanelStatus.total) * 100) : 0}%`, transition: "width 0.4s ease" }} />
                </div>
              </div>
            )}

            {drivePanelStatus.kind === "loading-talents" && (
              <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted }}>Loading roster…</div>
            )}
            {drivePanelStatus.kind === "error" && (
              <div style={{ fontFamily: FONTS.body, fontSize: 12, color: "#c0392b", padding: "5px 10px", background: "rgba(192,57,43,0.07)", borderRadius: 6, border: "1px solid rgba(192,57,43,0.2)" }}>
                {drivePanelStatus.message}
              </div>
            )}
            {drivePanelStatus.kind === "ok" && (
              <div style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.success, padding: "5px 10px", background: "rgba(46,125,91,0.07)", borderRadius: 6, border: "1px solid rgba(46,125,91,0.2)" }}>
                {drivePanelStatus.count} photo{drivePanelStatus.count !== 1 ? "s" : ""} imported.
              </div>
            )}
            {(drivePanelStatus.kind === "idle" || drivePanelStatus.kind === "error") && (
              <div style={{ fontFamily: FONTS.body, fontSize: 11, color: COLORS.inkMuted }}>
                Works with any file or folder shared as "Anyone with the link"
              </div>
            )}
          </div>
        )}
      </div>

      {/* Two-panel body */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
        {/* Sidebar */}
        <MediaSidebar
          view={view} setView={(v) => { setView(v); setSelected(new Set()); setFocusedPendingIdx(0); }}
          photos={photos} folders={folders}
          onNewFolder={() => { setEditingFolder(undefined); setShowFolderModal(true); }}
          settings={mediaSettings}
        />

        {/* Main content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
          {renderGrid()}
        </div>
      </div>

      {/* Unified detail-lightbox (image left, scrollable rail right) */}
      {lightboxPhoto && (
        <MediaLightbox
          photo={lightboxPhoto}
          allPhotos={filtered}
          folders={folders}
          wsLogoUrl={wsLogoUrl}
          wsWatermarkEnabled={wsWatermarkEnabled}
          onClose={() => setLightboxPhoto(null)}
          onRefresh={() => queueRouterRefresh()}
          toast={toast}
        />
      )}

      {/* Upload / Reassign modal */}
      {showAssignModal && (
        <UploadModal
          mode={assignMode}
          stagingItems={stagingItems}
          stagingSelected={stagingSelected}
          assignTalents={assignTalents}
          stagingBulkTalentId={stagingBulkTalentId}
          assignTalentId={assignTalentId}
          assignBusy={assignBusy}
          selCount={selCount}
          onSelectAll={() => setStagingSelected(new Set(stagingItems.map((it) => it.id)))}
          onClearSel={() => setStagingSelected(new Set())}
          onToggleItem={(id) => setStagingSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
          onBulkTalentChange={(id) => setStagingBulkTalentId(id)}
          onBulkAssign={() => setStagingItems((prev) => prev.map((it) => stagingSelected.has(it.id) ? { ...it, talentId: stagingBulkTalentId } : it))}
          onItemTalentChange={(itemId, talentId) => setStagingItems((prev) => prev.map((it) => it.id === itemId ? { ...it, talentId } : it))}
          onConfirm={() => void confirmStaging()}
          onCancel={cancelStaging}
          onReassign={() => void runReassign()}
          onAssignTalentChange={(id) => setAssignTalentId(id)}
        />
      )}

      {/* Folder modal */}
      {showFolderModal && (
        <FolderModal
          folder={editingFolder}
          onClose={() => setShowFolderModal(false)}
          onSaved={() => setShowFolderModal(false)}
        />
      )}

      {/* Keyboard shortcut help overlay */}
      {showShortcutHelp && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9500,
          background: "rgba(11,11,13,0.55)", display: "flex",
          alignItems: "center", justifyContent: "center", padding: 24,
        }} onClick={() => setShowShortcutHelp(false)}>
          <div style={{
            background: "#fff", borderRadius: 16, width: "min(480px, 95vw)",
            boxShadow: "0 24px 64px rgba(11,11,13,0.24)", fontFamily: FONTS.body,
            padding: "24px 28px 28px",
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.ink }}>Keyboard shortcuts</div>
              <button type="button" onClick={() => setShowShortcutHelp(false)}
                style={{ background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
            {[
              { label: "General", rows: [
                ["Click", "Open photo (preview + edit)"],
                ["Esc", "Clear selection / close"],
                ["⌘A", "Select all visible"],
                ["?", "Toggle this help"],
              ]},
              { label: "Pending review", rows: [
                ["Y", "Approve focused photo"],
                ["N", "Reject focused photo"],
                ["← →", "Navigate between photos"],
              ]},
              { label: "When a photo is open", rows: [
                ["← →", "Previous / next photo"],
                ["Y / N", "Approve / Reject (if pending)"],
                ["Esc", "Close"],
              ]},
            ].map(({ label, rows }) => (
              <div key={label} style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>{label}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(rows as [string, string][]).map(([key, desc]) => (
                    <div key={key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <kbd style={{
                        display: "inline-block", padding: "3px 8px", borderRadius: 5,
                        border: `1px solid ${COLORS.border}`, background: COLORS.surfaceAlt,
                        fontFamily: "monospace", fontSize: 11.5, color: COLORS.ink, minWidth: 52, textAlign: "center",
                      }}>{key}</kbd>
                      <span style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.inkMuted }}>{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ marginTop: 8, fontFamily: FONTS.body, fontSize: 11, color: COLORS.inkMuted }}>
              Press <kbd style={{ padding: "1px 5px", borderRadius: 4, border: `1px solid ${COLORS.border}`, fontFamily: "monospace", fontSize: 10 }}>?</kbd> again to close
            </div>
          </div>
        </div>
      )}

      {/* Help hint */}
      <button type="button" onClick={() => setShowShortcutHelp(true)} style={{
        position: "fixed", bottom: 20, right: 20, zIndex: 100,
        width: 32, height: 32, borderRadius: "50%",
        border: `1px solid ${COLORS.border}`, background: "#fff",
        color: COLORS.inkMuted, fontFamily: FONTS.body, fontSize: 14, fontWeight: 700,
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 2px 8px rgba(11,11,13,0.10)",
      }}>?</button>
    </div>
  );
}
