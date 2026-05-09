"use client";

import {
  useCallback, useEffect, useMemo, useRef, useState, type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import {
  COLORS, FONTS, meetsPlan, useProto,
} from "./_state";
import { PrimaryButton, SecondaryButton } from "./_primitives";
import {
  actionDeleteMediaAssets,
  actionUploadToStagingStorage,
  actionBulkAssignStagedMedia,
  actionLoadRosterTalents,
  actionSetApprovalState,
  actionReassignMediaToTalent,
  actionSetAsCardPhoto,
  actionImportFromGoogleDrive,
  actionListDriveFolder,
  actionGetMediaCount,
  type RosterTalentOption,
} from "@/app/(workspace)/[tenantSlug]/admin/media/actions";
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

type MediaPhoto = {
  id: string;
  talentProfileId: string;
  talentName: string;
  url: string;
  thumbUrl: string;
  variantKind: string;
  approvalState: "approved" | "pending" | "rejected";
  hasOverride: boolean;
  watermarkOverride: unknown | null;
  tags: string[];
  folderIds: string[];
  width: number | null;
  height: number | null;
  fileSizeBytes: number | null;
  mimeType: string | null;
  originalFilename: string | null;
  note: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

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
  card: "Profile card", hero: "Hero", gallery: "Gallery",
  lightbox: "Lightbox", polaroid: "Polaroid", reel: "Reel",
  public_watermarked: "Public WM", watermarked: "Watermarked",
};

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
  view, setView, photos, folders, onNewFolder,
}: {
  view: ActiveView;
  setView: (v: ActiveView) => void;
  photos: MediaPhoto[];
  folders: MediaFolder[];
  onNewFolder: () => void;
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
      <NavRow label="Pending review" v={{ kind: "pending" }} badge={pendingCount} />

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

      <SectionLabel text="Group by" />
      <NavRow label="By talent" v={{ kind: "by-talent" }} />
      <NavRow label="By kind" v={{ kind: "by-kind" }} />

      <SectionLabel text="More" />
      <NavRow label="Analytics" v={{ kind: "analytics" }} />
    </div>
  );
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────

function PhotoDetailDrawer({
  photo, folders, wsLogoUrl, wsWatermarkEnabled,
  onClose, onRefresh,
}: {
  photo: MediaPhoto;
  folders: MediaFolder[];
  wsLogoUrl: string | null;
  wsWatermarkEnabled: boolean;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const router = useRouter();
  const [tags, setTags] = useState<string[]>(photo.tags);
  const [tagInput, setTagInput] = useState("");
  const [savingTags, setSavingTags] = useState(false);
  const [note, setNote] = useState(photo.note ?? "");
  const [savingNote, setSavingNote] = useState(false);
  const [folderBusy, setFolderBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copyDone, setCopyDone] = useState(false);
  const [activity, setActivity] = useState<Array<{ id: string; kind: string; payload: unknown; createdAt: string }>>([]);
  const [activityLoaded, setActivityLoaded] = useState(false);

  // Re-sync local edit state when bridge data refreshes (after mutations)
  useEffect(() => {
    if (!savingTags) setTags(photo.tags);
  }, [photo.tags]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!savingNote) setNote(photo.note ?? "");
  }, [photo.note]); // eslint-disable-line react-hooks/exhaustive-deps
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [showWm, setShowWm] = useState(false);

  // Reset activity when switching to a different photo
  useEffect(() => {
    setActivity([]);
    setActivityLoaded(false);
  }, [photo.id]);

  useEffect(() => {
    if (!activityLoaded) {
      void actionGetAssetActivity(photo.id).then((r) => {
        if (r.ok) setActivity(r.data);
        setActivityLoaded(true);
      });
    }
  }, [photo.id, activityLoaded]);

  const inFolder = (folderId: string) => photo.folderIds.includes(folderId);

  const toggleFolder = async (folderId: string) => {
    setFolderBusy(true);
    if (inFolder(folderId)) {
      await actionRemoveAssetsFromFolder(folderId, [photo.id]);
    } else {
      await actionAddAssetsToFolder(folderId, [photo.id]);
    }
    setFolderBusy(false);
    router.refresh();
    onRefresh();
  };

  const saveTags = async () => {
    setSavingTags(true);
    await actionSetAssetTags(photo.id, tags);
    setSavingTags(false);
    router.refresh();
  };

  const addTag = () => {
    const clean = tagInput.trim().toLowerCase();
    if (!clean || tags.includes(clean)) { setTagInput(""); return; }
    const next = [...tags, clean];
    setTags(next);
    setTagInput("");
  };

  const removeTag = (t: string) => setTags((prev) => prev.filter((x) => x !== t));

  const saveNote = async () => {
    setSavingNote(true);
    await actionSetAssetNote(photo.id, note);
    setSavingNote(false);
    router.refresh();
  };

  const setApproval = async (state: "approved" | "rejected") => {
    setApprovalBusy(true);
    await actionSetApprovalState([photo.id], state);
    setApprovalBusy(false);
    router.refresh();
    onRefresh();
  };

  const MetaRow = ({ label, value }: { label: string; value: string }) => (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
      <div style={{ fontFamily: FONTS.body, fontSize: 11, color: COLORS.inkMuted, width: 80, flexShrink: 0 }}>{label}</div>
      <div style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.ink, flex: 1, wordBreak: "break-all" }}>{value}</div>
    </div>
  );

  const inputBase: CSSProperties = {
    fontFamily: FONTS.body, fontSize: 12.5, padding: "6px 10px",
    borderRadius: 7, border: `1px solid ${COLORS.border}`, color: COLORS.ink,
    background: "#fff", width: "100%", boxSizing: "border-box",
  };

  return (
    <div style={{
      width: 320, borderLeft: `1px solid ${COLORS.borderSoft}`,
      display: "flex", flexDirection: "column", background: "#fff",
      overflowY: "auto",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 16px 10px", borderBottom: `1px solid ${COLORS.borderSoft}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 700, color: COLORS.ink }}>
          Photo detail
        </div>
        <button type="button" onClick={onClose} style={{
          background: "none", border: "none", color: COLORS.inkMuted,
          cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "2px 4px",
        }}>×</button>
      </div>

      {/* Photo preview */}
      <div style={{ position: "relative", background: COLORS.surfaceAlt }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.url} alt={photo.talentName} style={{
          width: "100%", aspectRatio: "4/3", objectFit: "cover", display: "block",
        }} />
        {showWm && wsWatermarkEnabled && wsLogoUrl && (
          <div style={{ position: "absolute", bottom: "5%", right: "5%", width: "20%", opacity: 0.75, pointerEvents: "none" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={wsLogoUrl} alt="" style={{ width: "100%", height: "auto", objectFit: "contain", filter: "brightness(0) invert(1)" }} />
          </div>
        )}
        {/* WM toggle */}
        {wsWatermarkEnabled && wsLogoUrl && (
          <button type="button" onClick={() => setShowWm((v) => !v)} style={{
            position: "absolute", bottom: 8, left: 8,
            padding: "3px 8px", borderRadius: 5, border: "none",
            background: showWm ? "rgba(46,107,82,0.9)" : "rgba(0,0,0,0.45)",
            color: "#fff", fontFamily: FONTS.body, fontSize: 10, fontWeight: 700, cursor: "pointer",
          }}>
            {showWm ? "WM on" : "WM off"}
          </button>
        )}
      </div>

      {/* Actions row */}
      <div style={{ padding: "10px 12px", display: "flex", gap: 6, borderBottom: `1px solid ${COLORS.borderSoft}` }}>
        <a href={photo.url} target="_blank" rel="noopener noreferrer" style={{
          flex: 1, padding: "6px 0", borderRadius: 7, border: `1px solid ${COLORS.border}`,
          color: COLORS.ink, fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 600,
          textAlign: "center", textDecoration: "none",
        }}>Open ↗</a>
        <button type="button" onClick={() => {
          void navigator.clipboard.writeText(photo.url).then(() => {
            setCopyDone(true); setTimeout(() => setCopyDone(false), 1600);
          });
        }} style={{
          flex: 1, padding: "6px 0", borderRadius: 7, border: `1px solid ${COLORS.border}`,
          background: "none", color: COLORS.ink, fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
        }}>
          {copyDone ? "Copied!" : "Copy URL"}
        </button>
        {/* Approve / reject */}
        {photo.approvalState === "pending" && (
          <>
            <button type="button" disabled={approvalBusy} onClick={() => void setApproval("approved")} style={{
              padding: "6px 10px", borderRadius: 7, border: "none",
              background: "rgba(46,160,67,0.12)", color: "rgba(46,160,67,1)",
              fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
            }}>✓</button>
            <button type="button" disabled={approvalBusy} onClick={() => void setApproval("rejected")} style={{
              padding: "6px 10px", borderRadius: 7, border: "none",
              background: "rgba(192,57,43,0.1)", color: "#c0392b",
              fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
            }}>✕</button>
          </>
        )}
      </div>

      {/* Metadata */}
      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, borderBottom: `1px solid ${COLORS.borderSoft}` }}>
        <div style={{ fontFamily: FONTS.body, fontSize: 11, fontWeight: 700, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 }}>
          Metadata
        </div>
        <MetaRow label="Talent" value={photo.talentName} />
        <MetaRow label="Kind" value={VARIANT_LABELS[photo.variantKind] ?? photo.variantKind} />
        <MetaRow label="Status" value={photo.approvalState} />
        <MetaRow label="Uploaded" value={fmtDate(photo.createdAt)} />
        <MetaRow label="Dimensions" value={formatDim(photo.width, photo.height)} />
        <MetaRow label="Size" value={formatBytes(photo.fileSizeBytes)} />
        {photo.originalFilename && <MetaRow label="Filename" value={photo.originalFilename} />}
        {photo.mimeType && <MetaRow label="Type" value={photo.mimeType} />}
      </div>

      {/* Tags */}
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${COLORS.borderSoft}` }}>
        <div style={{ fontFamily: FONTS.body, fontSize: 11, fontWeight: 700, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
          Tags
        </div>
        {tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
            {tags.map((t) => (
              <span key={t} style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 8px", borderRadius: 999, background: COLORS.surfaceAlt,
                border: `1px solid ${COLORS.border}`, fontFamily: FONTS.body, fontSize: 11, color: COLORS.ink,
              }}>
                {t}
                <button type="button" onClick={() => removeTag(t)} style={{
                  background: "none", border: "none", color: COLORS.inkMuted, cursor: "pointer",
                  fontSize: 12, lineHeight: 1, padding: 0,
                }}>×</button>
              </span>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
            placeholder="Add tag…"
            style={{ ...inputBase, flex: 1 }}
          />
          <button type="button" onClick={() => { addTag(); void saveTags(); }} disabled={savingTags} style={{
            padding: "6px 12px", borderRadius: 7, border: "none", background: COLORS.fill,
            color: "#fff", fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
          }}>
            {savingTags ? "…" : "Save"}
          </button>
        </div>
      </div>

      {/* Folders */}
      {folders.length > 0 && (
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${COLORS.borderSoft}` }}>
          <div style={{ fontFamily: FONTS.body, fontSize: 11, fontWeight: 700, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
            Folders
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {folders.map((f) => {
              const checked = inFolder(f.id);
              return (
                <label key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={checked} disabled={folderBusy}
                    onChange={() => void toggleFolder(f.id)}
                    style={{ accentColor: COLORS.fill, cursor: "pointer" }} />
                  <DotSwatch color={f.color ?? FOLDER_PALETTE[0]} />
                  <span style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.ink }}>{f.name}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Note */}
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${COLORS.borderSoft}` }}>
        <div style={{ fontFamily: FONTS.body, fontSize: 11, fontWeight: 700, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
          Note
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note about this photo…"
          rows={3}
          style={{
            ...inputBase, resize: "vertical", lineHeight: 1.5,
          }}
        />
        <button type="button" onClick={() => void saveNote()} disabled={savingNote}
          style={{
            marginTop: 6, padding: "5px 12px", borderRadius: 7, border: `1px solid ${COLORS.border}`,
            background: "#fff", color: COLORS.ink, fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
          }}>
          {savingNote ? "Saving…" : "Save note"}
        </button>
      </div>

      {/* Activity */}
      {activityLoaded && activity.length > 0 && (
        <div style={{ padding: "14px 16px" }}>
          <div style={{ fontFamily: FONTS.body, fontSize: 11, fontWeight: 700, color: COLORS.inkMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
            Activity
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {activity.slice(0, 8).map((a) => (
              <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.border, marginTop: 5, flexShrink: 0 }} />
                <div>
                  <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.ink }}>{a.kind.replace(/_/g, " ")}</div>
                  <div style={{ fontFamily: FONTS.body, fontSize: 10.5, color: COLORS.inkMuted }}>{fmtDate(a.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
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
  const router = useRouter();
  const [name, setName] = useState(folder?.name ?? "");
  const [color, setColor] = useState(folder?.color ?? FOLDER_PALETTE[0]!);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(folder?.shareToken ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/${folder.shareToken}` : null);
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
    router.refresh();
    onSaved();
    onClose();
  };

  const createShareLink = async () => {
    if (!folder) return;
    setShareLoading(true);
    const r = await actionCreateFolderShareLink(folder.id, 30);
    setShareLoading(false);
    if (r.ok) setShareUrl(r.data.shareUrl);
  };

  const revokeShareLink = async () => {
    if (!folder) return;
    setShareLoading(true);
    await actionRevokeFolderShareLink(folder.id);
    setShareLoading(false);
    setShareUrl(null);
    router.refresh();
  };

  const deleteFolder = async () => {
    if (!folder) return;
    if (!confirm(`Delete "${folder.name}"? Photos stay, only the folder is removed.`)) return;
    setBusy(true);
    const r = await actionDeleteMediaFolder(folder.id);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    router.refresh();
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

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function MediaLightbox({
  photo, allPhotos, wsLogoUrl, wsWatermarkEnabled,
  onClose, onSetCard,
}: {
  photo: MediaPhoto;
  allPhotos: MediaPhoto[];
  wsLogoUrl: string | null;
  wsWatermarkEnabled: boolean;
  onClose: () => void;
  onSetCard: (photoId: string, talentId: string) => void;
}) {
  const idx = allPhotos.findIndex((p) => p.id === photo.id);
  const [currentIdx, setCurrentIdx] = useState(idx);
  const current = allPhotos[currentIdx] ?? photo;
  const [showWm, setShowWm] = useState(true);
  const [copied, setCopied] = useState(false);
  const [settingCard, setSettingCard] = useState(false);

  const wmActive = showWm && wsWatermarkEnabled && wsLogoUrl;

  const go = useCallback((delta: number) => {
    setCurrentIdx((i) => Math.max(0, Math.min(allPhotos.length - 1, i + delta)));
  }, [allPhotos.length]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, go]);

  const btnStyle: CSSProperties = {
    padding: "5px 12px", borderRadius: 7,
    border: "1px solid rgba(255,255,255,0.22)",
    background: "rgba(255,255,255,0.1)", color: "#fff",
    fontFamily: FONTS.body, fontSize: 12, fontWeight: 500, cursor: "pointer",
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9990,
        background: "rgba(9,9,11,0.93)", backdropFilter: "blur(10px)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      {/* Top bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 18px", gap: 8,
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontFamily: FONTS.body, fontSize: 13, color: "rgba(255,255,255,0.65)" }}>
          {current.talentName}
          {current.approvalState === "pending" && <span style={{ marginLeft: 8, color: COLORS.amber }}>· Pending</span>}
          <span style={{ marginLeft: 8, opacity: 0.4 }}>{currentIdx + 1} / {allPhotos.length}</span>
        </div>
        <div style={{ display: "flex", gap: 5, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {wsWatermarkEnabled && wsLogoUrl && (
            <div style={{ display: "flex", borderRadius: 7, overflow: "hidden", border: "1px solid rgba(255,255,255,0.2)" }}>
              {(["Off", "On"] as const).map((label) => {
                const active = label === "On" ? showWm : !showWm;
                return (
                  <button key={label} type="button" onClick={() => setShowWm(label === "On")}
                    style={{ padding: "4px 10px", border: "none", fontFamily: FONTS.body, fontSize: 11, fontWeight: 600, cursor: "pointer", background: active ? "rgba(255,255,255,0.2)" : "transparent", color: active ? "#fff" : "rgba(255,255,255,0.5)" }}>
                    WM {label}
                  </button>
                );
              })}
            </div>
          )}
          <button type="button" onClick={() => { void navigator.clipboard.writeText(current.url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }); }} style={btnStyle}>
            {copied ? "Copied!" : "Copy URL"}
          </button>
          <a href={current.url} target="_blank" rel="noopener noreferrer"
            style={{ ...btnStyle, textDecoration: "none" }}
            onClick={(e) => e.stopPropagation()}>
            Open ↗
          </a>
          <button type="button" disabled={settingCard} onClick={async (e) => {
            e.stopPropagation();
            setSettingCard(true);
            await actionSetAsCardPhoto(current.id, current.talentProfileId);
            setSettingCard(false);
            onSetCard(current.id, current.talentProfileId);
          }} style={{ ...btnStyle, opacity: settingCard ? 0.6 : 1 }}>
            {settingCard ? "Setting…" : "Set as card"}
          </button>
          <button type="button" onClick={onClose} style={btnStyle}>Esc</button>
        </div>
      </div>

      {/* Prev */}
      {currentIdx > 0 && (
        <button type="button" onClick={(e) => { e.stopPropagation(); go(-1); }}
          style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", width: 42, height: 42, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.07)", color: "#fff", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          ‹
        </button>
      )}

      {/* Photo */}
      <div style={{ position: "relative", maxWidth: "88vw", maxHeight: "80vh" }} onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current.url} alt={current.talentName}
          style={{ maxWidth: "88vw", maxHeight: "80vh", objectFit: "contain", borderRadius: 10, display: "block" }} />
        {wmActive && (
          <div style={{ position: "absolute", bottom: "4%", right: "4%", width: "13%", opacity: 0.72, pointerEvents: "none" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={wsLogoUrl!} alt="" style={{ width: "100%", height: "auto", objectFit: "contain", filter: "brightness(0) invert(1)" }} />
          </div>
        )}
      </div>

      {/* Tags + note strip */}
      {(current.tags.length > 0 || current.note) && (
        <div style={{
          position: "absolute", bottom: 36, left: "50%", transform: "translateX(-50%)",
          display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "center",
        }} onClick={(e) => e.stopPropagation()}>
          {current.tags.map((t) => (
            <span key={t} style={{
              padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.14)",
              fontFamily: FONTS.body, fontSize: 10.5, color: "rgba(255,255,255,0.8)",
            }}>{t}</span>
          ))}
          {current.note && (
            <span style={{ padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.10)", fontFamily: FONTS.body, fontSize: 10.5, color: "rgba(255,255,255,0.65)", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {current.note}
            </span>
          )}
        </div>
      )}

      {/* Next */}
      {currentIdx < allPhotos.length - 1 && (
        <button type="button" onClick={(e) => { e.stopPropagation(); go(1); }}
          style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", width: 42, height: 42, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.07)", color: "#fff", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          ›
        </button>
      )}
      <div style={{ position: "absolute", bottom: 12, fontFamily: FONTS.body, fontSize: 10.5, color: "rgba(255,255,255,0.28)" }}>
        ← → navigate · Esc close
      </div>
    </div>
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
  onToggle, onOpenLightbox, onOpenDetail,
}: {
  photo: MediaPhoto;
  selected: boolean;
  keyboardFocused?: boolean;
  wsLogoUrl: string | null;
  wsWatermarkEnabled: boolean;
  onToggle: () => void;
  onOpenLightbox: () => void;
  onOpenDetail: () => void;
}) {
  const showWm = wsWatermarkEnabled && wsLogoUrl && !photo.hasOverride;
  const showWmOverride = photo.hasOverride && wsLogoUrl;

  return (
    <div
      onClick={onToggle}
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

        {/* WM overlay */}
        {(showWm || showWmOverride) && wsLogoUrl && (
          <div style={{ position: "absolute", bottom: "5%", right: "5%", width: "24%", opacity: 0.75, pointerEvents: "none" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={wsLogoUrl} alt="" style={{ width: "100%", height: "auto", objectFit: "contain", filter: "brightness(0) invert(1)" }} />
          </div>
        )}

        {/* Badges */}
        {showWmOverride && (
          <div style={{ position: "absolute", top: 5, left: 5, background: "rgba(46,107,82,0.92)", color: "#fff", borderRadius: 4, fontFamily: FONTS.body, fontSize: 8, fontWeight: 700, padding: "2px 5px" }}>WM</div>
        )}
        {photo.approvalState === "pending" && (
          <div style={{ position: "absolute", top: showWmOverride ? 22 : 5, left: 5, background: COLORS.amber, color: "#fff", borderRadius: 4, fontFamily: FONTS.body, fontSize: 8, fontWeight: 700, padding: "2px 5px" }}>PENDING</div>
        )}
        {photo.approvalState === "rejected" && (
          <div style={{ position: "absolute", top: 5, left: 5, background: "rgba(192,57,43,0.92)", color: "#fff", borderRadius: 4, fontFamily: FONTS.body, fontSize: 8, fontWeight: 700, padding: "2px 5px" }}>REJECTED</div>
        )}
        {photo.tags.length > 0 && (
          <div style={{ position: "absolute", bottom: 5, left: 5, display: "flex", gap: 3 }}>
            {photo.tags.slice(0, 2).map((t) => (
              <span key={t} style={{ padding: "1px 5px", borderRadius: 99, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", fontFamily: FONTS.body, fontSize: 7.5, fontWeight: 600, color: "#fff" }}>{t}</span>
            ))}
          </div>
        )}

        {/* Full-size preview button */}
        <button type="button" onClick={(e) => { e.stopPropagation(); onOpenLightbox(); }}
          style={{
            position: "absolute", bottom: 5, right: 5,
            background: "rgba(0,0,0,0.42)", backdropFilter: "blur(4px)",
            border: "none", color: "rgba(255,255,255,0.85)", borderRadius: 5,
            fontFamily: FONTS.body, fontSize: 9, fontWeight: 600,
            padding: "2px 5px", cursor: "pointer", opacity: 0, transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
        >↗</button>

        {/* Checkbox */}
        <div style={{
          position: "absolute", top: 5, right: 5, width: 17, height: 17, borderRadius: 5,
          border: `2px solid ${selected ? COLORS.fill : "rgba(255,255,255,0.7)"}`,
          background: selected ? COLORS.fill : "rgba(255,255,255,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(4px)", transition: "all 0.1s",
        }}>
          {selected && <span style={{ color: "#fff", fontSize: 10, lineHeight: 1 }}>✓</span>}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: "6px 8px 8px" }}>
        <div style={{ fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 600, color: COLORS.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {photo.talentName}
        </div>
        <div style={{ fontFamily: FONTS.body, fontSize: 10, color: COLORS.inkMuted, marginTop: 1 }}>
          {VARIANT_LABELS[photo.variantKind] ?? photo.variantKind}
        </div>
        <button type="button" onClick={(e) => { e.stopPropagation(); onOpenDetail(); }}
          style={{
            marginTop: 5, width: "100%", padding: "3px 0", borderRadius: 5,
            border: `1px solid ${COLORS.borderSoft}`, background: "transparent",
            color: COLORS.inkMuted, fontFamily: FONTS.body, fontSize: 9.5, cursor: "pointer",
          }}>
          Details
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function WorkspaceMediaPage() {
  const { state, openDrawer, openUpgrade, bridgeMediaPhotos, bridgeMediaFolders, tenantSlug, toast } = useProto();
  const router = useRouter();
  const isAgency = meetsPlan(state.plan, "agency");
  const isStudio = meetsPlan(state.plan, "studio");

  // ── Branding settings ────────────────────────────────────────────
  const [wsWatermarkEnabled, setWsWatermarkEnabled] = useState(false);
  const [wsLogoUrl, setWsLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!tenantSlug || !isStudio) return;
    void loadAgencyBrandingSettings().then((r) => {
      if (r.ok) {
        setWsWatermarkEnabled(r.data.watermarkPreset?.enabled ?? false);
        setWsLogoUrl(r.data.logoUrl);
      }
    });
  }, [tenantSlug, isStudio]);

  // ── View / filter state ──────────────────────────────────────────
  const [view, setView] = useState<ActiveView>({ kind: "all" });
  const [filterTalent, setFilterTalent] = useState("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "approved" | "pending" | "rejected">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "talent">("newest");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ── Lightbox + detail drawer ─────────────────────────────────────
  const [lightboxPhoto, setLightboxPhoto] = useState<MediaPhoto | null>(null);
  const [detailPhoto, setDetailPhoto] = useState<MediaPhoto | null>(null);

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
    | { kind: "confirmed"; fileIds: string[]; total: number }
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
    setDrivePanelStatus({ kind: "confirmed", fileIds: res.data.fileIds, total: res.data.count });
  }, [drivePanelUrl, drivePanelTalentId]);

  // Phase 2 — download + upload with live polling
  const handleDriveImport = useCallback(async (fileIds: string[], total: number) => {
    if (!drivePanelTalentId) return;
    setDrivePanelStatus({ kind: "importing", total, done: 0 });

    // Kick off the actual import (fire-and-forget the server action result;
    // we track progress via polling so the UI stays live)
    const importPromise = actionImportFromGoogleDrive(drivePanelUrl.trim(), drivePanelTalentId);

    // Poll media count every 2 s to show live progress
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
    setTimeout(() => { setShowDrivePanel(false); setDrivePanelStatus({ kind: "idle" }); router.refresh(); }, 2500);
  }, [drivePanelUrl, drivePanelTalentId, router]);

  // ── Folder modal ─────────────────────────────────────────────────
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<MediaFolder | undefined>(undefined);

  // ── Mutation state ───────────────────────────────────────────────
  const [isDeleting, setIsDeleting] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  // ── Keyboard help overlay ────────────────────────────────────────
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);

  // ── Data mapping ─────────────────────────────────────────────────
  const photos: MediaPhoto[] = useMemo(() => {
    if (!bridgeMediaPhotos) return [];
    return bridgeMediaPhotos.map((p) => ({
      id: p.id,
      talentProfileId: p.talentProfileId,
      talentName: p.talentName,
      url: p.url,
      thumbUrl: p.thumbUrl,
      variantKind: p.variantKind,
      approvalState: p.approvalState,
      hasOverride: p.hasOverride,
      watermarkOverride: p.watermarkOverride,
      tags: p.tags,
      folderIds: p.folderIds,
      width: p.width,
      height: p.height,
      fileSizeBytes: p.fileSizeBytes,
      mimeType: p.mimeType,
      originalFilename: p.originalFilename,
      note: p.note,
      metadata: p.metadata,
      createdAt: p.createdAt,
    }));
  }, [bridgeMediaPhotos]);

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
      if (e.key === "Escape") { setSelected(new Set()); setDetailPhoto(null); setShowShortcutHelp(false); }
      if (e.key === "?") { setShowShortcutHelp((v) => !v); }
      if ((e.metaKey || e.ctrlKey) && e.key === "a") { e.preventDefault(); setSelected(new Set(filtered.map((p) => p.id))); }

      // Y / N / Arrow shortcuts in pending review mode
      if (view.kind === "pending") {
        const focusedPhoto = filtered[focusedPendingIdx];
        if (!focusedPhoto) return;

        if (e.key === "y" || e.key === "Y") {
          e.preventDefault();
          void actionSetApprovalState([focusedPhoto.id], "approved").then(() => {
            setFocusedPendingIdx((i) => Math.max(0, i));
            router.refresh();
          });
        }
        if (e.key === "n" || e.key === "N") {
          e.preventDefault();
          void actionSetApprovalState([focusedPhoto.id], "rejected").then(() => {
            setFocusedPendingIdx((i) => Math.max(0, i));
            router.refresh();
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

  // ── Live-sync detail drawer ──────────────────────────────────────
  // After router.refresh() updates bridge data, derive the current photo
  // from the photos array so the drawer always shows fresh metadata.
  const detailPhotoLive = useMemo(
    () => detailPhoto ? (photos.find((p) => p.id === detailPhoto.id) ?? detailPhoto) : null,
    [detailPhoto, photos],
  );

  // Selection helpers
  const toggleOne = (id: string) => setSelected((prev) => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
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
    let imageFiles = rawFiles.filter((f) => f.type.startsWith("image/") && !f.name.toLowerCase().endsWith(".zip"));

    if (zips.length > 0) {
      try {
        const JSZip = (await import("jszip")).default;
        for (const zip of zips) {
          if (zip.size > 500 * 1024 * 1024) { setUploadError("ZIP must be under 500 MB."); return; }
          const z = await JSZip.loadAsync(zip);
          const IMAGE_EXTS = /\.(jpe?g|png|webp|gif|heic|avif)$/i;
          const extracted: File[] = [];
          for (const [name, entry] of Object.entries(z.files)) {
            if (entry.dir || !IMAGE_EXTS.test(name)) continue;
            const blob = await entry.async("blob");
            const mime = name.match(/\.png$/i) ? "image/png" : name.match(/\.webp$/i) ? "image/webp" : "image/jpeg";
            extracted.push(new File([blob], name.split("/").pop() ?? name, { type: mime }));
            if (extracted.length >= 100) break;
          }
          imageFiles = [...imageFiles, ...extracted];
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
              ? res.ok ? { ...it, status: "ready", storagePath: res.data.storagePath, publicUrl: res.data.publicUrl } : { ...it, status: "error", errorMsg: res.error }
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
    const assignments = ready.map((it) => ({ storagePath: it.storagePath!, talentProfileId: it.talentId }));
    const res = await actionBulkAssignStagedMedia(assignments);
    setAssignBusy(false);
    if (!res.ok) { setUploadError(res.error); return; }
    stagingItems.forEach((it) => URL.revokeObjectURL(it.blobUrl));
    setStagingItems([]);
    setShowAssignModal(false);
    router.refresh();
  };

  const cancelStaging = () => {
    stagingItems.forEach((it) => URL.revokeObjectURL(it.blobUrl));
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
    router.refresh();
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
    router.refresh();
  };

  const handleApproveSelected = async () => {
    if (selected.size === 0) return;
    setIsApproving(true);
    await actionSetApprovalState(Array.from(selected), "approved");
    setIsApproving(false);
    setSelected(new Set());
    router.refresh();
  };

  const handleRejectSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Reject ${selected.size} photo${selected.size > 1 ? "s" : ""}?`)) return;
    setIsApproving(true);
    await actionSetApprovalState(Array.from(selected), "rejected");
    setIsApproving(false);
    setSelected(new Set());
    router.refresh();
  };

  const addSelectedToFolder = async (folderId: string) => {
    if (selected.size === 0) return;
    await actionAddAssetsToFolder(folderId, Array.from(selected));
    setSelected(new Set());
    router.refresh();
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
        {selCount > 0 && (
          <div style={{
            padding: "8px 20px", background: COLORS.fill, color: "#fff",
            display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap",
            fontFamily: FONTS.body, fontSize: 12,
          }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>{selCount} selected</span>
            {selHasPending && (
              <>
                <button type="button" disabled={isApproving} onClick={() => void handleApproveSelected()}
                  style={{ background: "rgba(46,160,67,0.9)", border: "none", color: "#fff", padding: "4px 11px", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
                  {isApproving ? "…" : "Approve"}
                </button>
                <button type="button" disabled={isApproving} onClick={() => void handleRejectSelected()}
                  style={{ background: "rgba(192,57,43,0.55)", border: "none", color: "#fff", padding: "4px 11px", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
                  Reject
                </button>
              </>
            )}
            <button type="button" onClick={() => openDrawer("watermark-editor", { selectedIds: Array.from(selected) })}
              style={{ background: "rgba(255,255,255,0.18)", border: "none", color: "#fff", padding: "4px 11px", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
              Apply WM
            </button>
            <button type="button" onClick={() => void openReassignModal()}
              style={{ background: "rgba(255,255,255,0.18)", border: "none", color: "#fff", padding: "4px 11px", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
              Move to…
            </button>
            {/* Add to folder */}
            {folders.length > 0 && (
              <select onChange={(e) => { if (e.target.value) { void addSelectedToFolder(e.target.value); e.target.value = ""; } }}
                style={{ background: "rgba(255,255,255,0.18)", border: "none", color: "#fff", padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontFamily: FONTS.body, fontSize: 12, fontWeight: 600 }}>
                <option value="">+ Folder…</option>
                {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            )}
            <button type="button" disabled={isDeleting} onClick={() => void handleDeleteSelected()}
              style={{ background: "rgba(192,57,43,0.7)", border: "none", color: "#fff", padding: "4px 11px", borderRadius: 6, cursor: isDeleting ? "not-allowed" : "pointer", fontWeight: 600, opacity: isDeleting ? 0.6 : 1 }}>
              {isDeleting ? "Deleting…" : `Delete ${selCount}`}
            </button>
            <button type="button" onClick={() => setSelected(new Set())}
              style={{ marginLeft: "auto", background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
        )}

        {/* Grid / grouped content */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px 20px 32px" }}>
          {useGrouped ? (
            groups.map(([groupName, groupPhotos]) => (
              <div key={groupName} style={{ marginBottom: 28 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 700, color: COLORS.ink }}>{groupName}</div>
                  <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted }}>{groupPhotos.length} photo{groupPhotos.length !== 1 ? "s" : ""}</div>
                  <div style={{ flex: 1, height: 1, background: COLORS.borderSoft }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
                  {groupPhotos.map((photo) => (
                    <PhotoCard
                      key={photo.id}
                      photo={photo}
                      selected={selected.has(photo.id)}
                      wsLogoUrl={wsLogoUrl}
                      wsWatermarkEnabled={wsWatermarkEnabled}
                      onToggle={() => toggleOne(photo.id)}
                      onOpenLightbox={() => setLightboxPhoto(photo)}
                      onOpenDetail={() => setDetailPhoto(photo)}
                    />
                  ))}
                </div>
              </div>
            ))
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: 11 }}>
              {filtered.map((photo, photoIdx) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  selected={selected.has(photo.id)}
                  keyboardFocused={view.kind === "pending" && photoIdx === focusedPendingIdx}
                  wsLogoUrl={wsLogoUrl}
                  wsWatermarkEnabled={wsWatermarkEnabled}
                  onToggle={() => { toggleOne(photo.id); if (view.kind === "pending") setFocusedPendingIdx(photoIdx); }}
                  onOpenLightbox={() => setLightboxPhoto(photo)}
                  onOpenDetail={() => setDetailPhoto(photo)}
                />
              ))}
            </div>
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
              {wsWatermarkEnabled && wsLogoUrl && <span style={{ marginLeft: 8, color: COLORS.success }}>· Watermark on</span>}
            </p>
          </div>
          <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
            <SecondaryButton size="sm" onClick={() => openDrawer("branding")}>⚙ Watermark</SecondaryButton>
            <SecondaryButton size="sm" onClick={() => void openDrivePanel()}>Drive import</SecondaryButton>
            <PrimaryButton size="sm" onClick={() => uploadFileRef.current?.click()} disabled={assignBusy}>+ Upload</PrimaryButton>
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
          view={view} setView={(v) => { setView(v); setSelected(new Set()); setDetailPhoto(null); setFocusedPendingIdx(0); }}
          photos={photos} folders={folders}
          onNewFolder={() => { setEditingFolder(undefined); setShowFolderModal(true); }}
        />

        {/* Main content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
          {renderGrid()}
        </div>

        {/* Detail drawer */}
        {detailPhotoLive && (
          <PhotoDetailDrawer
            photo={detailPhotoLive}
            folders={folders}
            wsLogoUrl={wsLogoUrl}
            wsWatermarkEnabled={wsWatermarkEnabled}
            onClose={() => setDetailPhoto(null)}
            onRefresh={() => router.refresh()}
          />
        )}
      </div>

      {/* Lightbox */}
      {lightboxPhoto && (
        <MediaLightbox
          photo={lightboxPhoto}
          allPhotos={filtered}
          wsLogoUrl={wsLogoUrl}
          wsWatermarkEnabled={wsWatermarkEnabled}
          onClose={() => setLightboxPhoto(null)}
          onSetCard={(photoId, talentId) => { toast("Set as card photo"); router.refresh(); }}
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
          onToggleItem={(id) => setStagingSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
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
                ["Esc", "Clear selection / close"],
                ["⌘A", "Select all visible"],
                ["?", "Toggle this help"],
              ]},
              { label: "Pending review", rows: [
                ["Y", "Approve focused photo"],
                ["N", "Reject focused photo"],
                ["← →", "Navigate between photos"],
              ]},
              { label: "Lightbox", rows: [
                ["← →", "Previous / next photo"],
                ["Esc", "Close lightbox"],
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
