"use client";

import React, { useCallback, useRef, useState } from "react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createClient } from "@/lib/supabase/client";
import { PhotoCropperDialog } from "./photo-cropper-dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MediaAsset {
  id: string;
  url: string;
  variantKind: string;
  sortOrder: number;
  /** Upload progress state — only present for in-flight uploads */
  uploadState?: "uploading" | "error";
  /** Error message for failed uploads */
  uploadError?: string;
  /** Approval state from the server */
  approvalState?: "pending" | "approved" | "rejected";
}

export interface MediaGalleryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  talentId: string;
  tenantSlug: string;
  assets: MediaAsset[];
  onAssetsChange: (assets: MediaAsset[]) => void;
  /** Which slot to highlight when opened. */
  focusSlot?: "avatar" | "hero" | "gallery";
  // Server action wrappers — caller provides these so we don't import server actions directly
  onSetAvatar: (mediaAssetId: string) => Promise<{ ok: boolean; error?: string }>;
  onSetHero: (mediaAssetId: string) => Promise<{ ok: boolean; error?: string }>;
  onAddToPortfolio: (storagePath: string, width: number, height: number) => Promise<{ ok: boolean; error?: string; id?: string }>;
  onDeleteAsset: (mediaAssetId: string) => Promise<{ ok: boolean; error?: string }>;
  onUploadFile: (file: File, variantKind: string) => Promise<{ ok: boolean; error?: string; asset?: MediaAsset }>;
  /** Optional — when provided, shows the Google Drive import UI. */
  onImportFromDrive?: (driveUrl: string) => Promise<{ ok: boolean; error?: string; assets?: Array<{ id: string; publicUrl: string }> }>;
  /** Optional — when provided, drag-to-reorder is enabled and persisted on drop. */
  onReorderAssets?: (orderedIds: string[]) => Promise<{ ok: boolean; error?: string }>;
  /** Optional — ID of the asset currently set as avatar. Used to show badge. */
  currentAvatarAssetId?: string | null;
  /** Optional — ID of the asset currently set as hero/cover. Used to show badge. */
  currentHeroAssetId?: string | null;
}

// ─── Design tokens ───────────────────────────────────────────────────────────

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.62)",
  inkDim: "rgba(11,11,13,0.38)",
  border: "rgba(24,24,27,0.10)",
  surface: "#FAFAF7",
  card: "#ffffff",
  accent: "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.08)",
  error: "#c0392b",
  errorSoft: "rgba(192,57,43,0.08)",
  success: "#2E7D5B",
  successSoft: "rgba(46,125,91,0.08)",
  overlay: "rgba(11,11,13,0.56)",
  overlay2: "rgba(11,11,13,0.80)",
} as const;

const F = '"Inter", system-ui, sans-serif';

// ─── Per-photo action state ───────────────────────────────────────────────────

type PhotoActionStatus =
  | { kind: "idle" }
  | { kind: "busy"; action: string }
  | { kind: "ok"; action: string }
  | { kind: "error"; action: string; message: string };

// ─── Injected styles ─────────────────────────────────────────────────────────

const INJECTED_STYLES = `
@keyframes tulala-spin {
  to { transform: rotate(360deg); }
}
.mgd-card {
  position: relative;
}
.mgd-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  opacity: 0;
  transition: opacity 150ms ease;
  border-radius: 8px;
  pointer-events: none;
}
.mgd-card:hover .mgd-overlay {
  opacity: 1;
  pointer-events: auto;
}
.mgd-drag-handle {
  position: absolute;
  top: 5px;
  left: 5px;
  z-index: 3;
  opacity: 0;
  transition: opacity 150ms ease;
  background: rgba(0,0,0,0.45);
  border-radius: 4px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 11px;
  user-select: none;
  touch-action: none;
  cursor: grab;
}
.mgd-card:hover .mgd-drag-handle {
  opacity: 1;
}
.mgd-checkbox-wrap {
  position: absolute;
  top: 5px;
  left: 5px;
  z-index: 4;
  opacity: 0;
  transition: opacity 150ms ease;
}
.mgd-checkbox-wrap.bulk-visible {
  opacity: 1;
}
.mgd-card:hover .mgd-checkbox-wrap {
  opacity: 1;
}
.mgd-overlay-btn {
  background: rgba(255,255,255,0.18);
  border: none;
  border-radius: 6px;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #fff;
  font-size: 14px;
  transition: background 120ms;
  padding: 0;
  position: relative;
}
.mgd-overlay-btn:hover {
  background: rgba(255,255,255,0.30);
}
.mgd-overlay-btn:hover .mgd-tooltip {
  opacity: 1;
  transform: translateY(0);
  pointer-events: none;
}
.mgd-tooltip {
  position: absolute;
  bottom: calc(100% + 5px);
  left: 50%;
  transform: translateX(-50%) translateY(4px);
  white-space: nowrap;
  background: rgba(0,0,0,0.82);
  color: #fff;
  font-size: 10px;
  font-family: "Inter", system-ui, sans-serif;
  font-weight: 500;
  padding: 3px 7px;
  border-radius: 4px;
  opacity: 0;
  transition: opacity 120ms, transform 120ms;
  pointer-events: none;
}
`;

// ─── Component ────────────────────────────────────────────────────────────────

export function MediaGalleryDrawer({
  open,
  onOpenChange,
  talentId,
  assets,
  onAssetsChange,
  focusSlot,
  onSetAvatar,
  onSetHero,
  onAddToPortfolio,
  onDeleteAsset,
  onUploadFile,
  onImportFromDrive,
  onReorderAssets,
  currentAvatarAssetId,
  currentHeroAssetId,
}: MediaGalleryDrawerProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadStatus, setUploadStatus] = useState<
    | { kind: "idle" }
    | { kind: "uploading"; count: number }
    | { kind: "ok"; count: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [showDriveInput, setShowDriveInput] = useState(false);
  const [driveUrl, setDriveUrl] = useState("");
  const [driveStatus, setDriveStatus] = useState<
    | { kind: "idle" }
    | { kind: "importing" }
    | { kind: "ok"; count: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const [photoStatuses, setPhotoStatuses] = useState<Record<string, PhotoActionStatus>>({});
  const [lightboxAsset, setLightboxAsset] = useState<MediaAsset | null>(null);
  const [cropTarget, setCropTarget] = useState<{ asset: MediaAsset; cropAspect: 1 | number | "free" } | null>(null);

  // ── Change 5: reorder save status ──────────────────────────────────────────
  const [reorderStatus, setReorderStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // ── Change 7: bulk select ───────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const isBulkMode = selectedIds.size > 0;

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleBulkDelete = useCallback(async () => {
    if (!selectedIds.size) return;
    if (!confirm(`Delete ${selectedIds.size} photo${selectedIds.size > 1 ? "s" : ""}? This can't be undone.`)) return;
    const ids = Array.from(selectedIds);
    // Delete one at a time using existing onDeleteAsset
    const results = await Promise.all(ids.map((id) => onDeleteAsset(id)));
    const failed = ids.filter((_, i) => !results[i].ok);
    const succeeded = ids.filter((_, i) => results[i].ok);
    if (succeeded.length > 0) {
      onAssetsChange(assets.filter((a) => !succeeded.includes(a.id)));
    }
    setSelectedIds(new Set(failed));
  }, [selectedIds, assets, onAssetsChange, onDeleteAsset]);

  const setPhotoStatus = useCallback((id: string, s: PhotoActionStatus) => {
    setPhotoStatuses((prev) => ({ ...prev, [id]: s }));
  }, []);

  const clearPhotoStatusLater = useCallback((id: string, delay = 2500) => {
    setTimeout(() => setPhotoStatuses((prev) => ({ ...prev, [id]: { kind: "idle" } })), delay);
  }, []);

  // ── Upload handler ──────────────────────────────────────────────────────────

  const handleFilePick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;

    setUploadStatus({ kind: "uploading", count: files.length });

    const results: MediaAsset[] = [];
    const errors: string[] = [];

    for (const file of files) {
      const res = await onUploadFile(file, "gallery");
      if (res.ok && res.asset) {
        results.push(res.asset);
      } else {
        errors.push(res.error ?? "Upload failed.");
      }
    }

    if (errors.length > 0) {
      setUploadStatus({ kind: "error", message: errors.join(" · ") });
    } else {
      setUploadStatus({ kind: "ok", count: results.length });
      setTimeout(() => setUploadStatus({ kind: "idle" }), 2500);
    }

    if (results.length > 0) {
      onAssetsChange([...assets, ...results]);
    }
  }, [assets, onAssetsChange, onUploadFile]);

  // ── Per-photo actions ───────────────────────────────────────────────────────

  const handleSetAvatar = useCallback(async (asset: MediaAsset) => {
    setPhotoStatus(asset.id, { kind: "busy", action: "avatar" });
    const res = await onSetAvatar(asset.id);
    if (res.ok) {
      setPhotoStatus(asset.id, { kind: "ok", action: "avatar" });
      clearPhotoStatusLater(asset.id);
    } else {
      setPhotoStatus(asset.id, { kind: "error", action: "avatar", message: res.error ?? "Failed." });
    }
  }, [onSetAvatar, setPhotoStatus, clearPhotoStatusLater]);

  const handleSetHero = useCallback(async (asset: MediaAsset) => {
    setPhotoStatus(asset.id, { kind: "busy", action: "hero" });
    const res = await onSetHero(asset.id);
    if (res.ok) {
      setPhotoStatus(asset.id, { kind: "ok", action: "hero" });
      clearPhotoStatusLater(asset.id);
    } else {
      setPhotoStatus(asset.id, { kind: "error", action: "hero", message: res.error ?? "Failed." });
    }
  }, [onSetHero, setPhotoStatus, clearPhotoStatusLater]);

  const handleAddToPortfolio = useCallback(async (asset: MediaAsset) => {
    setPhotoStatus(asset.id, { kind: "busy", action: "portfolio" });
    const res = await onAddToPortfolio(asset.url, 0, 0);
    if (res.ok) {
      setPhotoStatus(asset.id, { kind: "ok", action: "portfolio" });
      clearPhotoStatusLater(asset.id);
    } else {
      setPhotoStatus(asset.id, { kind: "error", action: "portfolio", message: res.error ?? "Failed." });
    }
  }, [onAddToPortfolio, setPhotoStatus, clearPhotoStatusLater]);

  const handleDelete = useCallback(async (asset: MediaAsset) => {
    if (!confirm(`Delete this photo? This can't be undone.`)) return;
    setPhotoStatus(asset.id, { kind: "busy", action: "delete" });
    const res = await onDeleteAsset(asset.id);
    if (res.ok) {
      onAssetsChange(assets.filter((a) => a.id !== asset.id));
      setPhotoStatuses((prev) => {
        const next = { ...prev };
        delete next[asset.id];
        return next;
      });
      if (lightboxAsset?.id === asset.id) setLightboxAsset(null);
    } else {
      setPhotoStatus(asset.id, { kind: "error", action: "delete", message: res.error ?? "Delete failed." });
    }
  }, [assets, onAssetsChange, onDeleteAsset, lightboxAsset, setPhotoStatus]);

  // ── Crop confirm ────────────────────────────────────────────────────────────

  const handleCropConfirm = useCallback(async (blob: Blob) => {
    if (!cropTarget) return;
    const { asset, cropAspect } = cropTarget;
    const isAvatar = cropAspect === 1;

    // Upload the cropped blob as a new asset.
    const file = new File([blob], `crop-${isAvatar ? "avatar" : "hero"}.webp`, { type: "image/webp" });
    const variantKind = isAvatar ? "card" : "hero";
    const res = await onUploadFile(file, variantKind);
    if (!res.ok || !res.asset) throw new Error(res.error ?? "Upload failed.");

    // Then assign it as avatar or hero.
    if (isAvatar) {
      const r = await onSetAvatar(res.asset.id);
      if (!r.ok) throw new Error(r.error ?? "Could not set as avatar.");
    } else {
      const r = await onSetHero(res.asset.id);
      if (!r.ok) throw new Error(r.error ?? "Could not set as hero.");
    }

    onAssetsChange([...assets, res.asset]);
  }, [cropTarget, onUploadFile, onSetAvatar, onSetHero, assets, onAssetsChange]);

  // ── Change 5: handleDragEnd with reorder status ─────────────────────────────

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    // Disable drag in bulk mode
    if (isBulkMode) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = assets.findIndex((a) => a.id === active.id);
    const newIndex = assets.findIndex((a) => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(assets, oldIndex, newIndex);
    onAssetsChange(reordered);
    if (onReorderAssets) {
      setReorderStatus("saving");
      void onReorderAssets(reordered.map((a) => a.id)).then((res) => {
        if (res.ok) {
          setReorderStatus("saved");
          setTimeout(() => setReorderStatus("idle"), 2000);
        } else {
          setReorderStatus("error");
          setTimeout(() => setReorderStatus("idle"), 3000);
        }
      });
    }
  }, [assets, onAssetsChange, onReorderAssets, isBulkMode]);

  const handleDriveImport = useCallback(async () => {
    if (!onImportFromDrive || !driveUrl.trim()) return;
    setDriveStatus({ kind: "importing" });
    const res = await onImportFromDrive(driveUrl.trim());
    if (!res.ok || !res.assets) {
      setDriveStatus({ kind: "error", message: res.error ?? "Import failed." });
      return;
    }
    const newAssets: MediaAsset[] = res.assets.map((a, i) => ({
      id: a.id,
      url: a.publicUrl,
      variantKind: "gallery",
      sortOrder: assets.length + i,
    }));
    onAssetsChange([...assets, ...newAssets]);
    setDriveStatus({ kind: "ok", count: newAssets.length });
    setDriveUrl("");
    setShowDriveInput(false);
    setTimeout(() => setDriveStatus({ kind: "idle" }), 3000);
  }, [onImportFromDrive, driveUrl, assets, onAssetsChange]);

  if (!open) return null;

  const focusLabel = focusSlot === "avatar"
    ? "Select a photo to use as your avatar (1:1)"
    : focusSlot === "hero"
      ? "Select a photo to use as your hero (4:5)"
      : null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: INJECTED_STYLES }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Photo gallery"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9000,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "flex-end",
          background: C.overlay,
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onOpenChange(false);
        }}
      >
        <div
          style={{
            background: C.surface,
            width: "min(680px, 100vw)",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            boxShadow: "-8px 0 40px rgba(11,11,13,0.14)",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "16px 20px 14px",
              borderBottom: `1px solid ${C.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0,
            }}
          >
            <div>
              <div style={{ fontFamily: F, fontSize: 16, fontWeight: 700, color: C.ink }}>
                Photo gallery
              </div>
              {focusLabel && (
                <div style={{ fontFamily: F, fontSize: 12, color: C.accent, marginTop: 2, fontWeight: 500 }}>
                  {focusLabel}
                </div>
              )}
              {/* Change 5: reorder status */}
              {reorderStatus !== "idle" && (
                <div style={{
                  fontFamily: F, fontSize: 11, fontWeight: 500, marginTop: 3,
                  color: reorderStatus === "saved" ? C.success : reorderStatus === "error" ? C.error : C.inkMuted,
                }}>
                  {reorderStatus === "saving" && "Saving order…"}
                  {reorderStatus === "saved" && "✓ Order saved"}
                  {reorderStatus === "error" && "⚠ Reorder failed"}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 22,
                color: C.inkMuted,
                padding: "2px 8px",
                borderRadius: 6,
              }}
            >
              ×
            </button>
          </div>

          {/* Upload area */}
          <div style={{ padding: "14px 20px 10px", flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadStatus.kind === "uploading"}
              style={{
                width: "100%",
                padding: "14px 16px",
                background: C.accentSoft,
                border: `1.5px dashed rgba(15,79,62,0.3)`,
                borderRadius: 10,
                fontFamily: F,
                fontSize: 13,
                fontWeight: 500,
                color: C.accent,
                cursor: uploadStatus.kind === "uploading" ? "wait" : "pointer",
                textAlign: "center",
                opacity: uploadStatus.kind === "uploading" ? 0.7 : 1,
              }}
            >
              {uploadStatus.kind === "uploading"
                ? `Uploading ${uploadStatus.count} photo${uploadStatus.count > 1 ? "s" : ""}…`
                : "+ Upload photos (select multiple)"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={handleFilePick}
            />

            {/* Upload status */}
            {uploadStatus.kind === "ok" && (
              <div style={{
                marginTop: 8, padding: "7px 12px",
                background: C.successSoft, border: `1px solid rgba(46,125,91,0.25)`,
                borderRadius: 8, fontFamily: F, fontSize: 12, color: C.success,
              }}>
                {uploadStatus.count} photo{uploadStatus.count > 1 ? "s" : ""} uploaded.
              </div>
            )}
            {uploadStatus.kind === "error" && (
              <div style={{
                marginTop: 8, padding: "7px 12px",
                background: C.errorSoft, border: `1px solid rgba(192,57,43,0.25)`,
                borderRadius: 8, fontFamily: F, fontSize: 12, color: C.error,
              }}>
                {uploadStatus.message}
              </div>
            )}

            {/* Google Drive import */}
            {onImportFromDrive && (
              <div style={{ marginTop: 10 }}>
                {!showDriveInput ? (
                  <button
                    type="button"
                    onClick={() => setShowDriveInput(true)}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      fontFamily: F, fontSize: 12, color: C.inkMuted,
                      padding: "2px 0", display: "flex", alignItems: "center", gap: 5,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                      <path d="M9 18c-4.51 2-5-2-7-2" />
                    </svg>
                    Import from Google Drive
                  </button>
                ) : (
                  <div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="url"
                        value={driveUrl}
                        onChange={(e) => setDriveUrl(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") void handleDriveImport(); }}
                        placeholder="Paste Drive file or folder link…"
                        autoFocus
                        style={{
                          flex: 1, fontFamily: F, fontSize: 12,
                          padding: "7px 10px", borderRadius: 7,
                          border: `1px solid ${C.border}`, outline: "none",
                          background: C.card, color: C.ink,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => void handleDriveImport()}
                        disabled={driveStatus.kind === "importing" || !driveUrl.trim()}
                        style={{
                          fontFamily: F, fontSize: 12, fontWeight: 600,
                          padding: "7px 12px", borderRadius: 7, cursor: "pointer",
                          background: C.accent, color: "#fff", border: "none",
                          opacity: (driveStatus.kind === "importing" || !driveUrl.trim()) ? 0.5 : 1,
                        }}
                      >
                        {driveStatus.kind === "importing" ? "Importing…" : "Import"}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowDriveInput(false); setDriveUrl(""); setDriveStatus({ kind: "idle" }); }}
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          fontFamily: F, fontSize: 18, color: C.inkMuted, padding: "2px 4px",
                        }}
                      >×</button>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 11, color: C.inkDim }}>
                      Works with any file or folder shared as "Anyone with the link"
                    </div>
                    {driveStatus.kind === "ok" && (
                      <div style={{ marginTop: 6, padding: "5px 10px", background: C.successSoft, border: `1px solid rgba(46,125,91,0.25)`, borderRadius: 6, fontFamily: F, fontSize: 12, color: C.success }}>
                        {driveStatus.count} photo{driveStatus.count > 1 ? "s" : ""} imported.
                      </div>
                    )}
                    {driveStatus.kind === "error" && (
                      <div style={{ marginTop: 6, padding: "5px 10px", background: C.errorSoft, border: `1px solid rgba(192,57,43,0.25)`, borderRadius: 6, fontFamily: F, fontSize: 12, color: C.error }}>
                        {driveStatus.message}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Grid */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "4px 20px 20px",
              paddingBottom: isBulkMode ? 72 : 20,
            }}
          >
            {assets.length === 0 ? (
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", height: 200,
                fontFamily: F, fontSize: 13, color: C.inkMuted, textAlign: "center",
              }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
                No photos yet. Upload some above.
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={assets.map((a) => a.id)} strategy={rectSortingStrategy}>
                  {/* Change 1: compact 5-6 col responsive grid */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                    gap: 10,
                  }}>
                    {assets.map((asset) => {
                      const pStatus = photoStatuses[asset.id] ?? { kind: "idle" };
                      const isBusy = pStatus.kind === "busy";
                      const isAvatar = currentAvatarAssetId != null && asset.id === currentAvatarAssetId;
                      const isHero = currentHeroAssetId != null && asset.id === currentHeroAssetId;
                      const isSelected = selectedIds.has(asset.id);
                      return (
                        <SortablePhotoCard
                          key={asset.id}
                          asset={asset}
                          status={pStatus}
                          isBusy={isBusy}
                          focusSlot={focusSlot}
                          isAvatar={isAvatar}
                          isHero={isHero}
                          isBulkMode={isBulkMode}
                          isSelected={isSelected}
                          onToggleSelect={() => toggleSelect(asset.id)}
                          onClickPhoto={() => setLightboxAsset(asset)}
                          onSetAvatar={() => handleSetAvatar(asset)}
                          onSetHero={() => handleSetHero(asset)}
                          onAddToPortfolio={() => handleAddToPortfolio(asset)}
                          onDelete={() => handleDelete(asset)}
                        />
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

          {/* Change 7: bulk select sticky bar */}
          {isBulkMode && (
            <div style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              background: C.card,
              borderTop: `1px solid ${C.border}`,
              padding: "12px 20px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              boxShadow: "0 -4px 16px rgba(11,11,13,0.08)",
              zIndex: 10,
            }}>
              <span style={{ fontFamily: F, fontSize: 13, fontWeight: 600, color: C.ink, flex: 1 }}>
                {selectedIds.size} selected
              </span>
              <button
                type="button"
                onClick={handleBulkDelete}
                style={{
                  fontFamily: F, fontSize: 12, fontWeight: 600,
                  padding: "7px 14px", borderRadius: 7,
                  background: C.error, color: "#fff", border: "none",
                  cursor: "pointer",
                }}
              >
                Delete selected
              </button>
              <button
                type="button"
                onClick={clearSelection}
                style={{
                  fontFamily: F, fontSize: 12, color: C.inkMuted,
                  background: "none", border: "none", cursor: "pointer",
                  textDecoration: "underline", padding: 0,
                }}
              >
                Deselect all
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxAsset && (
        <Lightbox
          asset={lightboxAsset}
          onClose={() => setLightboxAsset(null)}
          onCropForAvatar={() => {
            setCropTarget({ asset: lightboxAsset, cropAspect: 1 });
            setLightboxAsset(null);
          }}
          onCropForHero={() => {
            setCropTarget({ asset: lightboxAsset, cropAspect: 4 / 5 });
            setLightboxAsset(null);
          }}
        />
      )}

      {/* Crop dialog */}
      {cropTarget && (
        <PhotoCropperDialog
          open={true}
          onOpenChange={(o) => { if (!o) setCropTarget(null); }}
          sourceUrl={cropTarget.asset.url}
          aspect={cropTarget.cropAspect}
          onCropConfirm={handleCropConfirm}
        />
      )}
    </>
  );
}

// ─── SortablePhotoCard ────────────────────────────────────────────────────────

type PhotoCardProps = {
  asset: MediaAsset;
  status: PhotoActionStatus;
  isBusy: boolean;
  focusSlot?: "avatar" | "hero" | "gallery";
  isAvatar: boolean;
  isHero: boolean;
  isBulkMode: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onClickPhoto: () => void;
  onSetAvatar: () => void;
  onSetHero: () => void;
  onAddToPortfolio: () => void;
  onDelete: () => void;
};

function SortablePhotoCard(props: PhotoCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.asset.id });
  return (
    <div
      ref={setNodeRef}
      className="mgd-card"
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.45 : 1, position: "relative" }}
      {...attributes}
    >
      {/* Drag handle — hidden in bulk mode */}
      {!props.isBulkMode && (
        <div
          {...listeners}
          title="Drag to reorder"
          className="mgd-drag-handle"
        >
          ⠿
        </div>
      )}

      {/* Checkbox — shown on hover, always visible in bulk mode */}
      <div className={`mgd-checkbox-wrap${props.isBulkMode ? " bulk-visible" : ""}`}>
        <input
          type="checkbox"
          checked={props.isSelected}
          onChange={props.onToggleSelect}
          aria-label="Select photo"
          style={{
            width: 16,
            height: 16,
            cursor: "pointer",
            accentColor: C.accent,
          }}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      <PhotoCard {...props} />
    </div>
  );
}

// ─── PhotoCard ────────────────────────────────────────────────────────────────

function PhotoCard({
  asset,
  status,
  isBusy,
  focusSlot,
  isAvatar,
  isHero,
  onClickPhoto,
  onSetAvatar,
  onSetHero,
  onAddToPortfolio,
  onDelete,
}: PhotoCardProps) {
  // Change 6: approval state border
  const approvalBorder = asset.approvalState === "pending"
    ? "2px solid #D4A017"
    : asset.approvalState === "rejected"
      ? "2px solid #c0392b"
      : `1px solid rgba(24,24,27,0.08)`;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Thumbnail + overlay container */}
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "3 / 4",
          borderRadius: 8,
          overflow: "hidden",
          border: approvalBorder,
          background: "#f0f0ee",
        }}
      >
        {/* Clickable image */}
        <button
          type="button"
          onClick={onClickPhoto}
          style={{
            position: "absolute",
            inset: 0,
            padding: 0,
            background: "none",
            border: "none",
            cursor: "pointer",
            display: "block",
            width: "100%",
            height: "100%",
          }}
          aria-label="View photo"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={asset.url}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </button>

        {/* Change 2: hover overlay with icon buttons */}
        <div className="mgd-overlay" aria-hidden="true">
          <button
            type="button"
            className="mgd-overlay-btn"
            onClick={onSetAvatar}
            disabled={isBusy}
            aria-label="Set as avatar"
          >
            ★
            <span className="mgd-tooltip">Set as avatar</span>
          </button>
          <button
            type="button"
            className="mgd-overlay-btn"
            onClick={onSetHero}
            disabled={isBusy}
            aria-label="Set as cover photo"
          >
            ▦
            <span className="mgd-tooltip">Set as cover photo</span>
          </button>
          <button
            type="button"
            className="mgd-overlay-btn"
            onClick={onAddToPortfolio}
            disabled={isBusy}
            aria-label="Add to portfolio"
          >
            ⊕
            <span className="mgd-tooltip">Add to portfolio</span>
          </button>
          <button
            type="button"
            className="mgd-overlay-btn"
            onClick={onDelete}
            disabled={isBusy}
            aria-label="Delete"
            style={{ background: "rgba(192,57,43,0.45)" }}
          >
            🗑
            <span className="mgd-tooltip">Delete</span>
          </button>
        </div>

        {/* Change 4: upload progress spinner */}
        {(asset.uploadState === "uploading" || isBusy) && (
          <div style={{
            position: "absolute", inset: 0,
            background: "rgba(11,11,13,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "none",
          }}>
            <span style={{
              width: 20, height: 20, borderRadius: "50%",
              border: "2.5px solid rgba(255,255,255,0.3)",
              borderTopColor: "#fff",
              animation: "tulala-spin 0.7s linear infinite",
              display: "inline-block",
            }} />
          </div>
        )}

        {/* Change 4: upload error badge */}
        {asset.uploadState === "error" && (
          <div style={{
            position: "absolute", top: 5, right: 5,
            background: C.error, color: "#fff",
            borderRadius: "50%", width: 18, height: 18,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, fontFamily: F,
          }}
            title={asset.uploadError ?? "Upload failed"}
          >
            ✕
          </div>
        )}

        {/* Focus slot hint */}
        {focusSlot && focusSlot !== "gallery" && (
          <div style={{
            position: "absolute", bottom: 4, left: 4,
            background: "rgba(15,79,62,0.85)", color: "#fff",
            fontFamily: F, fontSize: 9, fontWeight: 700,
            padding: "2px 5px", borderRadius: 4, letterSpacing: 0.3,
            pointerEvents: "none",
          }}>
            {focusSlot === "avatar" ? "Set as avatar" : "Set as hero"}
          </div>
        )}

        {/* Change 3: role badges top-right */}
        <div style={{
          position: "absolute", top: 5, right: 5,
          display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end",
          pointerEvents: "none",
        }}>
          {isAvatar && (
            <span style={{
              background: "#2E7D5B", color: "#fff",
              fontFamily: F, fontSize: 9, fontWeight: 700,
              padding: "2px 6px", borderRadius: 4, letterSpacing: 0.3,
            }}>
              Avatar
            </span>
          )}
          {isHero && (
            <span style={{
              background: "#1A5E9E", color: "#fff",
              fontFamily: F, fontSize: 9, fontWeight: 700,
              padding: "2px 6px", borderRadius: 4, letterSpacing: 0.3,
            }}>
              Cover
            </span>
          )}
          {asset.approvalState === "pending" && (
            <span style={{
              background: "#8A6F1A", color: "#fff",
              fontFamily: F, fontSize: 9, fontWeight: 700,
              padding: "2px 6px", borderRadius: 4, letterSpacing: 0.3,
            }}>
              Pending
            </span>
          )}
        </div>
      </div>

      {/* Status strip (busy/ok/error feedback for avatar/hero/portfolio actions) */}
      {status.kind !== "idle" && (
        <div style={{
          marginTop: 4,
          padding: "3px 6px",
          borderRadius: 6,
          fontFamily: F,
          fontSize: 10,
          fontWeight: 500,
          background: status.kind === "error"
            ? "rgba(192,57,43,0.08)"
            : status.kind === "ok"
              ? "rgba(46,125,91,0.08)"
              : "rgba(15,79,62,0.06)",
          color: status.kind === "error"
            ? "#c0392b"
            : status.kind === "ok"
              ? "#2E7D5B"
              : "#0F4F3E",
          border: `1px solid ${status.kind === "error" ? "rgba(192,57,43,0.2)" : status.kind === "ok" ? "rgba(46,125,91,0.2)" : "rgba(15,79,62,0.15)"}`,
        }}>
          {status.kind === "busy" && `${status.action}…`}
          {status.kind === "ok" && `${status.action} ✓`}
          {status.kind === "error" && status.message}
        </div>
      )}
    </div>
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({
  asset,
  onClose,
  onCropForAvatar,
  onCropForHero,
}: {
  asset: MediaAsset;
  onClose: () => void;
  onCropForAvatar: () => void;
  onCropForHero: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo preview"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9500,
        background: C.overlay2,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Close */}
      <button
        type="button"
        onClick={onClose}
        style={{
          position: "absolute", top: 16, right: 20,
          background: "rgba(255,255,255,0.12)", border: "none",
          color: "#fff", fontSize: 22, cursor: "pointer",
          borderRadius: 8, padding: "2px 10px",
        }}
      >
        ×
      </button>

      {/* Image */}
      <div style={{
        maxWidth: "80vw", maxHeight: "70vh",
        borderRadius: 10, overflow: "hidden",
        boxShadow: "0 12px 48px rgba(0,0,0,0.5)",
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={asset.url}
          alt=""
          style={{ display: "block", maxWidth: "80vw", maxHeight: "70vh", objectFit: "contain" }}
        />
      </div>

      {/* Crop actions */}
      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button
          type="button"
          onClick={onCropForAvatar}
          style={{
            fontFamily: F, fontSize: 13, fontWeight: 600,
            padding: "9px 18px",
            background: "#fff", border: "none", borderRadius: 8,
            cursor: "pointer", color: C.ink,
          }}
        >
          Crop for avatar (1:1)
        </button>
        <button
          type="button"
          onClick={onCropForHero}
          style={{
            fontFamily: F, fontSize: 13, fontWeight: 600,
            padding: "9px 18px",
            background: "#fff", border: "none", borderRadius: 8,
            cursor: "pointer", color: C.ink,
          }}
        >
          Crop for hero (4:5)
        </button>
      </div>
    </div>
  );
}
