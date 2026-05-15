"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createClient } from "@/lib/supabase/client";
import { createTranslator } from "@/i18n/messages";
import { PhotoCropperDialog } from "./photo-cropper-dialog";
import { PhotoLightbox } from "@/components/media/photo-lightbox";

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
  /** Parent asset id when this row is a crop derivative. Enables Revert. */
  sourceMediaAssetId?: string | null;
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
  onUploadFile: (file: File, variantKind: string, sourceMediaAssetId?: string | null) => Promise<{ ok: boolean; error?: string; asset?: MediaAsset }>;
  /** Optional — when provided, the lightbox shows a "Revert to original"
   *  button on crop derivatives (assets with sourceMediaAssetId set). */
  onRevertCrop?: (croppedMediaAssetId: string) => Promise<{ ok: boolean; error?: string; sourceMediaAssetId?: string | null }>;
  /** Optional — when provided, shows the Google Drive import UI (legacy single-shot). */
  onImportFromDrive?: (driveUrl: string) => Promise<{ ok: boolean; error?: string; assets?: Array<{ id: string; publicUrl: string }> }>;
  /** Progressive Drive import — list files first, then import one at a time for real progress. */
  onListDriveFiles?: (driveUrl: string) => Promise<{ ok: boolean; error?: string; fileIds?: string[] }>;
  onImportDriveFile?: (fileId: string, sortOrder: number) => Promise<{ ok: boolean; error?: string; asset?: { id: string; publicUrl: string } }>;
  /** Optional — when provided, drag-to-reorder is enabled and persisted on drop. */
  onReorderAssets?: (orderedIds: string[]) => Promise<{ ok: boolean; error?: string }>;
  /** Optional — ID of the asset currently set as avatar. Used to show badge. */
  currentAvatarAssetId?: string | null;
  /** Optional — ID of the asset currently set as hero/cover. Used to show badge. */
  currentHeroAssetId?: string | null;
  locale?: string;
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
  | { kind: "busy"; action: PhotoActionKind }
  | { kind: "ok"; action: PhotoActionKind }
  | { kind: "error"; action: PhotoActionKind; message: string };

type PhotoActionKind = "avatar" | "hero" | "portfolio" | "delete";

function withCount(template: string, count: number): string {
  return template
    .replace("{count}", String(count))
    .replaceAll("{plural}", count === 1 ? "" : "s");
}

function galleryActionLabel(t: (key: string) => string, action: PhotoActionKind): string {
  return t(`admin.talent.edit.mediaGallery.actions.${action}`);
}

// ─── Injected styles ─────────────────────────────────────────────────────────

const INJECTED_STYLES = `
@keyframes tulala-spin {
  to { transform: rotate(360deg); }
}
@keyframes drive-shimmer {
  from { opacity: 0.5; }
  to { opacity: 1; }
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
  bottom: 5px;
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
  right: 5px;
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
  onRevertCrop,
  onImportFromDrive,
  onListDriveFiles,
  onImportDriveFile,
  onReorderAssets,
  currentAvatarAssetId,
  currentHeroAssetId,
  locale = "en",
}: MediaGalleryDrawerProps) {
  const t = useMemo(() => createTranslator(locale), [locale]);
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
    | { kind: "listing" }
    | { kind: "importing"; completed: number; total: number }
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
    if (!confirm(withCount(t("admin.talent.edit.mediaGallery.bulkDeleteConfirm"), selectedIds.size))) return;
    const ids = Array.from(selectedIds);
    // Delete one at a time using existing onDeleteAsset
    const results = await Promise.all(ids.map((id) => onDeleteAsset(id)));
    const failed = ids.filter((_, i) => !results[i].ok);
    const succeeded = ids.filter((_, i) => results[i].ok);
    if (succeeded.length > 0) {
      onAssetsChange(assets.filter((a) => !succeeded.includes(a.id)));
    }
    setSelectedIds(new Set(failed));
  }, [selectedIds, assets, onAssetsChange, onDeleteAsset, t]);

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
        errors.push(res.error ?? t("admin.talent.edit.mediaGallery.uploadFailed"));
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
  }, [assets, onAssetsChange, onUploadFile, t]);

  // ── Per-photo actions ───────────────────────────────────────────────────────

  const handleSetAvatar = useCallback(async (asset: MediaAsset) => {
    setPhotoStatus(asset.id, { kind: "busy", action: "avatar" });
    const res = await onSetAvatar(asset.id);
    if (res.ok) {
      setPhotoStatus(asset.id, { kind: "ok", action: "avatar" });
      clearPhotoStatusLater(asset.id);
    } else {
      setPhotoStatus(asset.id, { kind: "error", action: "avatar", message: res.error ?? t("admin.talent.edit.mediaGallery.actionFailed") });
    }
  }, [onSetAvatar, setPhotoStatus, clearPhotoStatusLater, t]);

  const handleSetHero = useCallback(async (asset: MediaAsset) => {
    setPhotoStatus(asset.id, { kind: "busy", action: "hero" });
    const res = await onSetHero(asset.id);
    if (res.ok) {
      setPhotoStatus(asset.id, { kind: "ok", action: "hero" });
      clearPhotoStatusLater(asset.id);
    } else {
      setPhotoStatus(asset.id, { kind: "error", action: "hero", message: res.error ?? t("admin.talent.edit.mediaGallery.actionFailed") });
    }
  }, [onSetHero, setPhotoStatus, clearPhotoStatusLater, t]);

  const handleAddToPortfolio = useCallback(async (asset: MediaAsset) => {
    setPhotoStatus(asset.id, { kind: "busy", action: "portfolio" });
    const res = await onAddToPortfolio(asset.url, 0, 0);
    if (res.ok) {
      setPhotoStatus(asset.id, { kind: "ok", action: "portfolio" });
      clearPhotoStatusLater(asset.id);
    } else {
      setPhotoStatus(asset.id, { kind: "error", action: "portfolio", message: res.error ?? t("admin.talent.edit.mediaGallery.actionFailed") });
    }
  }, [onAddToPortfolio, setPhotoStatus, clearPhotoStatusLater, t]);

  const handleDelete = useCallback(async (asset: MediaAsset) => {
    if (!confirm(t("admin.talent.edit.mediaGallery.deleteConfirm"))) return;
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
      setPhotoStatus(asset.id, { kind: "error", action: "delete", message: res.error ?? t("admin.talent.edit.mediaGallery.deleteFailed") });
    }
  }, [assets, onAssetsChange, onDeleteAsset, lightboxAsset, setPhotoStatus, t]);

  // ── Crop confirm ────────────────────────────────────────────────────────────

  const handleCropConfirm = useCallback(async (blob: Blob) => {
    if (!cropTarget) return;
    const { asset, cropAspect } = cropTarget;
    // Map aspect → target role. 1:1 → profile (variantKind=card). 16:9 (any
    // wide ratio) → cover (variantKind=hero). "free" → just a new gallery
    // photo, no auto-promote.
    const role: "profile" | "cover" | "gallery" =
      cropAspect === 1     ? "profile" :
      cropAspect === "free" ? "gallery" :
      "cover";
    const variantKind = role === "profile" ? "card" : role === "cover" ? "hero" : "gallery";

    // Upload the cropped blob as a new asset. Pass the source asset id so
    // the new row records crop lineage — that's what enables "Revert to
    // original" later.
    const file = new File([blob], `crop-${role}.webp`, { type: "image/webp" });
    const res = await onUploadFile(file, variantKind, asset.id);
    if (!res.ok || !res.asset) throw new Error(res.error ?? t("admin.talent.edit.mediaGallery.uploadFailed"));

    // Profile/cover crops auto-promote so the new variant is visible in the
    // slot immediately. Free crops just appear in the gallery.
    if (role === "profile") {
      const r = await onSetAvatar(res.asset.id);
      if (!r.ok) throw new Error(r.error ?? t("admin.talent.edit.mediaGallery.couldNotSetAvatar"));
    } else if (role === "cover") {
      const r = await onSetHero(res.asset.id);
      if (!r.ok) throw new Error(r.error ?? t("admin.talent.edit.mediaGallery.couldNotSetHero"));
    }

    onAssetsChange([...assets, res.asset]);
  }, [cropTarget, onUploadFile, onSetAvatar, onSetHero, assets, onAssetsChange, t]);

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
    if (!driveUrl.trim()) return;

    // Progressive mode: list files first, then import one by one
    if (onListDriveFiles && onImportDriveFile) {
      setDriveStatus({ kind: "listing" });
      const listed = await onListDriveFiles(driveUrl.trim());
      if (!listed.ok || !listed.fileIds?.length) {
        setDriveStatus({ kind: "error", message: listed.error ?? t("admin.talent.edit.mediaGallery.noImagesFound") });
        return;
      }
      const total = listed.fileIds.length;
      setDriveStatus({ kind: "importing", completed: 0, total });

      const baseOrder = assets.length;
      const newAssets: MediaAsset[] = [];
      let failCount = 0;

      for (let i = 0; i < listed.fileIds.length; i++) {
        const res = await onImportDriveFile(listed.fileIds[i]!, baseOrder + i);
        if (res.ok && res.asset) {
          const a: MediaAsset = { id: res.asset.id, url: res.asset.publicUrl, variantKind: "gallery", sortOrder: baseOrder + i };
          newAssets.push(a);
          onAssetsChange([...assets, ...newAssets]);
        } else {
          failCount++;
        }
        setDriveStatus({ kind: "importing", completed: i + 1, total });
      }

      const imported = newAssets.length;
      if (imported === 0) {
        setDriveStatus({
          kind: "error",
          message: withCount(t("admin.talent.edit.mediaGallery.importFailedFiles"), failCount),
        });
        return;
      }
      setDriveStatus({ kind: "ok", count: imported });
      setDriveUrl("");
      setShowDriveInput(false);
      setTimeout(() => setDriveStatus({ kind: "idle" }), 3500);
      return;
    }

    // Legacy single-shot fallback
    if (!onImportFromDrive) return;
    setDriveStatus({ kind: "importing", completed: 0, total: 0 });
    const res = await onImportFromDrive(driveUrl.trim());
    if (!res.ok || !res.assets) {
      setDriveStatus({ kind: "error", message: res.error ?? t("admin.talent.edit.mediaGallery.importFailed") });
      return;
    }
    const newAssets: MediaAsset[] = res.assets.map((a, i) => ({
      id: a.id, url: a.publicUrl, variantKind: "gallery", sortOrder: assets.length + i,
    }));
    onAssetsChange([...assets, ...newAssets]);
    setDriveStatus({ kind: "ok", count: newAssets.length });
    setDriveUrl("");
    setShowDriveInput(false);
    setTimeout(() => setDriveStatus({ kind: "idle" }), 3000);
  }, [onListDriveFiles, onImportDriveFile, onImportFromDrive, driveUrl, assets, onAssetsChange, t]);

  if (!open) return null;

  const focusLabel = focusSlot === "avatar"
    ? t("admin.talent.edit.mediaGallery.focusAvatar")
    : focusSlot === "hero"
      ? t("admin.talent.edit.mediaGallery.focusHero")
      : null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: INJECTED_STYLES }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("admin.talent.edit.mediaGallery.dialogLabel")}
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
                {t("admin.talent.edit.mediaGallery.title")}
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
                  {reorderStatus === "saving" && t("admin.talent.edit.mediaGallery.savingOrder")}
                  {reorderStatus === "saved" && t("admin.talent.edit.mediaGallery.orderSaved")}
                  {reorderStatus === "error" && t("admin.talent.edit.mediaGallery.reorderFailed")}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label={t("admin.talent.edit.mediaGallery.closeAria")}
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
                ? withCount(t("admin.talent.edit.mediaGallery.uploadProgress"), uploadStatus.count)
                : t("admin.talent.edit.mediaGallery.uploadButton")}
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
                {withCount(t("admin.talent.edit.mediaGallery.uploaded"), uploadStatus.count)}
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
                    {t("admin.talent.edit.mediaGallery.importDrive")}
                  </button>
                ) : (
                  <div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="url"
                        value={driveUrl}
                        onChange={(e) => setDriveUrl(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") void handleDriveImport(); }}
                        placeholder={t("admin.talent.edit.mediaGallery.drivePlaceholder")}
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
                        disabled={driveStatus.kind === "importing" || driveStatus.kind === "listing" || !driveUrl.trim()}
                        style={{
                          fontFamily: F, fontSize: 12, fontWeight: 600,
                          padding: "7px 12px", borderRadius: 7, cursor: "pointer",
                          background: C.accent, color: "#fff", border: "none",
                          opacity: (driveStatus.kind === "importing" || driveStatus.kind === "listing" || !driveUrl.trim()) ? 0.5 : 1,
                        }}
                      >
                        {driveStatus.kind === "listing" ? t("admin.talent.edit.mediaGallery.finding") : driveStatus.kind === "importing" ? t("admin.talent.edit.mediaGallery.importing") : t("admin.talent.edit.mediaGallery.import")}
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
                      {t("admin.talent.edit.mediaGallery.driveShareHint")}
                    </div>
                    {driveStatus.kind === "listing" && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontFamily: F, fontSize: 12, color: C.inkMuted, marginBottom: 5 }}>
                          {t("admin.talent.edit.mediaGallery.findingPhotos")}
                        </div>
                        <div style={{ height: 5, borderRadius: 3, background: C.border, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: "40%", borderRadius: 3, background: C.accent, animation: "drive-shimmer 1.2s ease-in-out infinite alternate" }} />
                        </div>
                      </div>
                    )}
                    {driveStatus.kind === "importing" && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: F, fontSize: 12, color: C.inkMuted, marginBottom: 5 }}>
                          <span>
                            {driveStatus.total > 0
                              ? withCount(
                                  t("admin.talent.edit.mediaGallery.driveUploadProgress")
                                    .replace("{completed}", String(driveStatus.completed))
                                    .replace("{total}", String(driveStatus.total)),
                                  driveStatus.total,
                                )
                              : t("admin.talent.edit.mediaGallery.uploading")}
                          </span>
                          {driveStatus.total > 0 && (
                            <span style={{ color: C.accent, fontWeight: 600 }}>
                              {Math.round((driveStatus.completed / driveStatus.total) * 100)}%
                            </span>
                          )}
                        </div>
                        <div style={{ height: 5, borderRadius: 3, background: C.border, overflow: "hidden" }}>
                          <div style={{
                            height: "100%",
                            borderRadius: 3,
                            background: C.accent,
                            transition: "width 300ms ease",
                            width: driveStatus.total > 0
                              ? `${Math.round((driveStatus.completed / driveStatus.total) * 100)}%`
                              : "10%",
                          }} />
                        </div>
                      </div>
                    )}
                    {driveStatus.kind === "ok" && (
                      <div style={{ marginTop: 6, padding: "5px 10px", background: C.successSoft, border: `1px solid rgba(46,125,91,0.25)`, borderRadius: 6, fontFamily: F, fontSize: 12, color: C.success }}>
                        {withCount(t("admin.talent.edit.mediaGallery.imported"), driveStatus.count)}
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
                {t("admin.talent.edit.mediaGallery.empty")}
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
                          t={t}
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
                {withCount(t("admin.talent.edit.mediaGallery.selected"), selectedIds.size)}
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
                {t("admin.talent.edit.mediaGallery.deleteSelected")}
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
                {t("admin.talent.edit.mediaGallery.deselectAll")}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox — shared PhotoLightbox component (see web/src/components/media/photo-lightbox.tsx) */}
      {lightboxAsset && (
        <PhotoLightbox
          asset={lightboxAsset}
          allAssets={assets}
          isAvatar={lightboxAsset.id === currentAvatarAssetId}
          isHero={lightboxAsset.id === currentHeroAssetId}
          onClose={() => setLightboxAsset(null)}
          // Look up our typed MediaAsset by id — PhotoLightbox emits the
          // generic PhotoLightboxAsset shape, but our state is MediaAsset.
          onNavigate={(next) => {
            const found = assets.find((a) => a.id === next.id);
            if (found) setLightboxAsset(found);
          }}
          onCropAt={(aspect) => {
            setCropTarget({ asset: lightboxAsset, cropAspect: aspect });
            setLightboxAsset(null);
          }}
          onSetAvatar={async () => {
            // Promote without recropping — uses the underlying server action
            // that flips variant_kind=card on the existing storage_path.
            const r = await onSetAvatar(lightboxAsset.id);
            if (r.ok) {
              setLightboxAsset(null);
            }
          }}
          onSetHero={async () => {
            const r = await onSetHero(lightboxAsset.id);
            if (r.ok) {
              setLightboxAsset(null);
            }
          }}
          onDelete={async () => {
            const r = await onDeleteAsset(lightboxAsset.id);
            if (r.ok) {
              onAssetsChange(assets.filter((a) => a.id !== lightboxAsset.id));
              setLightboxAsset(null);
            }
          }}
          onRevertCrop={onRevertCrop ? async () => {
            if (!lightboxAsset.sourceMediaAssetId) return;
            const r = await onRevertCrop(lightboxAsset.id);
            if (r.ok) {
              // Soft-deleted on the server. Drop from local state and try to
              // navigate to the source if it's in the list, otherwise close.
              const next = assets.filter((a) => a.id !== lightboxAsset.id);
              onAssetsChange(next);
              const sourceId = r.sourceMediaAssetId ?? lightboxAsset.sourceMediaAssetId;
              const source = sourceId ? next.find((a) => a.id === sourceId) : null;
              if (source) setLightboxAsset(source);
              else setLightboxAsset(null);
            }
          } : undefined}
          t={t}
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
          locale={locale}
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
  t: (key: string) => string;
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
          title={props.t("admin.talent.edit.mediaGallery.dragToReorder")}
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
          aria-label={props.t("admin.talent.edit.mediaGallery.selectPhoto")}
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
  isAvatar,
  isHero,
  onClickPhoto,
  onSetAvatar,
  onSetHero,
  onAddToPortfolio,
  onDelete,
  t,
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
          aria-label={t("admin.talent.edit.mediaGallery.viewPhoto")}
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
            aria-label={t("admin.talent.edit.mediaGallery.setAvatar")}
          >
            ★
            <span className="mgd-tooltip">{t("admin.talent.edit.mediaGallery.setAvatar")}</span>
          </button>
          <button
            type="button"
            className="mgd-overlay-btn"
            onClick={onSetHero}
            disabled={isBusy}
            aria-label={t("admin.talent.edit.mediaGallery.setCover")}
          >
            ▦
            <span className="mgd-tooltip">{t("admin.talent.edit.mediaGallery.setCover")}</span>
          </button>
          <button
            type="button"
            className="mgd-overlay-btn"
            onClick={onAddToPortfolio}
            disabled={isBusy}
            aria-label={t("admin.talent.edit.mediaGallery.addPortfolio")}
          >
            ⊕
            <span className="mgd-tooltip">{t("admin.talent.edit.mediaGallery.addPortfolio")}</span>
          </button>
          <button
            type="button"
            className="mgd-overlay-btn"
            onClick={onDelete}
            disabled={isBusy}
            aria-label={t("admin.talent.edit.mediaGallery.delete")}
            style={{ background: "rgba(192,57,43,0.45)" }}
          >
            🗑
            <span className="mgd-tooltip">{t("admin.talent.edit.mediaGallery.delete")}</span>
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
            title={asset.uploadError ?? t("admin.talent.edit.mediaGallery.uploadFailed")}
          >
            ✕
          </div>
        )}

        {/* Single-slot status/role pill (top-left) — matches admin Media page.
            Priority: Rejected > Review > Profile > Cover. Avatar holds both
            roles simultaneously rarely; when it does, Profile wins (most
            prominent on talent cards in lists). */}
        {(() => {
          const pill =
            asset.approvalState === "rejected" ? { bg: "rgba(192,57,43,0.94)", label: "Rejected" } :
            asset.approvalState === "pending"  ? { bg: "rgba(212,151,12,0.94)", label: t("admin.talent.edit.mediaGallery.pendingBadge") } :
            isAvatar                            ? { bg: "rgba(15,79,62,0.94)",  label: t("admin.talent.edit.mediaGallery.avatarBadge") } :
            isHero                              ? { bg: "rgba(78,52,114,0.94)", label: t("admin.talent.edit.mediaGallery.coverBadge") } :
            null;
          return pill ? (
            <div style={{
              position: "absolute", top: 5, left: 5,
              background: pill.bg, color: "#fff",
              fontFamily: F, fontSize: 9.5, fontWeight: 700,
              padding: "2px 7px", borderRadius: 5, letterSpacing: 0.3,
              boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
              pointerEvents: "none",
            }}>{pill.label}</div>
          ) : null;
        })()}
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
          {status.kind === "busy" && `${galleryActionLabel(t, status.action)}…`}
          {status.kind === "ok" && `${galleryActionLabel(t, status.action)} ✓`}
          {status.kind === "error" && status.message}
        </div>
      )}
    </div>
  );
}

