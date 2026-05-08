"use client";

import React, { useCallback, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PhotoCropperDialog } from "./photo-cropper-dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MediaAsset {
  id: string;
  url: string;
  variantKind: string;
  sortOrder: number;
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
}: MediaGalleryDrawerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadStatus, setUploadStatus] = useState<
    | { kind: "idle" }
    | { kind: "uploading"; count: number }
    | { kind: "ok"; count: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const [photoStatuses, setPhotoStatuses] = useState<Record<string, PhotoActionStatus>>({});
  const [lightboxAsset, setLightboxAsset] = useState<MediaAsset | null>(null);
  const [cropTarget, setCropTarget] = useState<{ asset: MediaAsset; cropAspect: 1 | number | "free" } | null>(null);

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

  if (!open) return null;

  const focusLabel = focusSlot === "avatar"
    ? "Select a photo to use as your avatar (1:1)"
    : focusSlot === "hero"
      ? "Select a photo to use as your hero (4:5)"
      : null;

  return (
    <>
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
            width: "min(600px, 100vw)",
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
          </div>

          {/* Grid */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "4px 20px 20px",
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
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                gap: 12,
              }}>
                {assets.map((asset) => {
                  const pStatus = photoStatuses[asset.id] ?? { kind: "idle" };
                  const isBusy = pStatus.kind === "busy";
                  return (
                    <PhotoCard
                      key={asset.id}
                      asset={asset}
                      status={pStatus}
                      isBusy={isBusy}
                      focusSlot={focusSlot}
                      onClickPhoto={() => setLightboxAsset(asset)}
                      onSetAvatar={() => handleSetAvatar(asset)}
                      onSetHero={() => handleSetHero(asset)}
                      onAddToPortfolio={() => handleAddToPortfolio(asset)}
                      onDelete={() => handleDelete(asset)}
                    />
                  );
                })}
              </div>
            )}
          </div>
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

// ─── PhotoCard ────────────────────────────────────────────────────────────────

function PhotoCard({
  asset,
  status,
  isBusy,
  focusSlot,
  onClickPhoto,
  onSetAvatar,
  onSetHero,
  onAddToPortfolio,
  onDelete,
}: {
  asset: MediaAsset;
  status: PhotoActionStatus;
  isBusy: boolean;
  focusSlot?: "avatar" | "hero" | "gallery";
  onClickPhoto: () => void;
  onSetAvatar: () => void;
  onSetHero: () => void;
  onAddToPortfolio: () => void;
  onDelete: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Thumbnail */}
      <button
        type="button"
        onClick={onClickPhoto}
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "3 / 4",
          borderRadius: 8,
          overflow: "hidden",
          border: `1px solid rgba(24,24,27,0.08)`,
          cursor: "pointer",
          background: "#f0f0ee",
          padding: 0,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={asset.url}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        {isBusy && (
          <div style={{
            position: "absolute", inset: 0,
            background: "rgba(11,11,13,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
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
        {focusSlot && focusSlot !== "gallery" && (
          <div style={{
            position: "absolute", bottom: 4, left: 4,
            background: "rgba(15,79,62,0.85)", color: "#fff",
            fontFamily: F, fontSize: 9, fontWeight: 700,
            padding: "2px 5px", borderRadius: 4, letterSpacing: 0.3,
          }}>
            {focusSlot === "avatar" ? "Set as avatar" : "Set as hero"}
          </div>
        )}
      </button>

      {/* Status strip */}
      {status.kind !== "idle" && (
        <div style={{
          padding: "4px 6px",
          borderRadius: 6,
          fontFamily: F,
          fontSize: 10.5,
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

      {/* Actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <ActionButton onClick={onSetAvatar} disabled={isBusy} label="Set as avatar" />
        <ActionButton onClick={onSetHero} disabled={isBusy} label="Set as hero" />
        <ActionButton onClick={onAddToPortfolio} disabled={isBusy} label="Add to portfolio" />
        <ActionButton onClick={onDelete} disabled={isBusy} label="Delete" danger />
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  label,
  danger,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: F,
        fontSize: 11,
        fontWeight: 500,
        padding: "4px 8px",
        background: danger ? "transparent" : "rgba(11,11,13,0.04)",
        border: `1px solid ${danger ? "rgba(192,57,43,0.2)" : "rgba(24,24,27,0.10)"}`,
        borderRadius: 6,
        cursor: disabled ? "wait" : "pointer",
        color: danger ? "#c0392b" : C.ink,
        textAlign: "left",
        opacity: disabled ? 0.5 : 1,
        width: "100%",
      }}
    >
      {label}
    </button>
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
