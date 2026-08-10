"use client";

/**
 * BrandingMediaManager — the "Brand images" library inside Settings →
 * Brand identity.
 *
 * Workspace-owned brand imagery only (media_assets purpose='branding') —
 * never talent photos. Uploads ride the signed pipeline
 * (uploadBrandingMedia) and auto-file into the per-tenant Branding folder,
 * so the same images appear on the Media page (Brand & site lane / Branding
 * folder) and in the website builder's image picker.
 *
 * Every async op shows explicit state at the element it affects (uploading
 * rows, per-tile busy, persistent error text) — no silent waits.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  actionDeleteBrandingMediaAsset,
  actionListBrandingMedia,
  actionSetBrandImageRole,
  type BrandingMediaAsset,
} from "@/lib/server-actions/admin-branding-media";
import { uploadBrandingMedia } from "@/lib/client/signed-upload";
import { PhotoCropperDialog } from "@/components/talent/photo-cropper-dialog";

const C = {
  border: "rgba(24,24,27,0.10)",
  borderSoft: "rgba(24,24,27,0.06)",
  surfaceAlt: "#F2F2EE",
  red: "#B0303A",
} as const;
const F = '"Inter", system-ui, sans-serif';

type UploadEntry = {
  key: string;
  name: string;
  phase: "compressing" | "uploading" | "registering" | "error";
  error?: string;
};

export function BrandingMediaManager({
  tt = (s) => s,
  refreshToken = 0,
  onWordmarkChanged,
  onFaviconChanged,
}: {
  tt?: (s: string) => string;
  /** Bump to force a reload (e.g. after the favicon slot uploads). */
  refreshToken?: number;
  onWordmarkChanged?: (url: string) => void;
  onFaviconChanged?: (url: string) => void;
}) {
  const [assets, setAssets] = useState<BrandingMediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadEntry[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tileError, setTileError] = useState<{ id: string; message: string } | null>(null);
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
  const [cropAsset, setCropAsset] = useState<BrandingMediaAsset | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const reload = useCallback(async () => {
    const result = await actionListBrandingMedia();
    if (result.ok) {
      setAssets(result.data.assets);
      setLoadError(null);
    } else {
      setLoadError(result.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload, refreshToken]);

  // ── Upload ──────────────────────────────────────────────────────────

  const handleFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith("image/"));
      if (images.length === 0) return;
      for (const file of images) {
        const key = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setUploads((prev) => [...prev, { key, name: file.name, phase: "compressing" }]);
        const result = await uploadBrandingMedia({
          file,
          onProgress: (p) =>
            setUploads((prev) =>
              prev.map((u) => (u.key === key ? { ...u, phase: p.phase } : u)),
            ),
        });
        if (result.ok) {
          setUploads((prev) => prev.filter((u) => u.key !== key));
          setAssets((prev) => [result.asset, ...prev]);
        } else {
          // Persist the failure at the row — never drop a failed entry
          // silently.
          setUploads((prev) =>
            prev.map((u) =>
              u.key === key ? { ...u, phase: "error", error: result.error } : u,
            ),
          );
        }
      }
    },
    [],
  );

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    void handleFiles(files);
  };

  // ── Per-tile actions ────────────────────────────────────────────────

  const setRole = async (asset: BrandingMediaAsset, role: "wordmark" | "favicon") => {
    setBusyId(asset.id);
    setTileError(null);
    const result = await actionSetBrandImageRole(asset.id, role);
    setBusyId(null);
    if (!result.ok) {
      setTileError({ id: asset.id, message: result.error });
      return;
    }
    setAssets((prev) =>
      prev.map((a) =>
        a.id === asset.id
          ? { ...a, role }
          : a.role === role
            ? { ...a, role: null }
            : a,
      ),
    );
    if (role === "wordmark") onWordmarkChanged?.(result.data.publicUrl);
    else onFaviconChanged?.(result.data.publicUrl);
  };

  const deleteAsset = async (asset: BrandingMediaAsset) => {
    if (armedDeleteId !== asset.id) {
      setArmedDeleteId(asset.id);
      window.setTimeout(() => setArmedDeleteId((cur) => (cur === asset.id ? null : cur)), 3000);
      return;
    }
    setArmedDeleteId(null);
    setBusyId(asset.id);
    setTileError(null);
    const result = await actionDeleteBrandingMediaAsset(asset.id);
    setBusyId(null);
    if (!result.ok) {
      setTileError({ id: asset.id, message: result.error });
      return;
    }
    setAssets((prev) => prev.filter((a) => a.id !== asset.id));
  };

  const confirmCrop = async (blob: Blob) => {
    const source = cropAsset;
    if (!source) return;
    const file = new File([blob], `crop-${Date.now()}.webp`, { type: "image/webp" });
    await handleFiles([file]);
    // Provenance: handleFiles registers without the source link (shared
    // path). Acceptable — crops list as new brand images either way.
    void source;
  };

  // ── Render ──────────────────────────────────────────────────────────

  const tileBtn: React.CSSProperties = {
    padding: "3px 8px", borderRadius: 999, border: "none", cursor: "pointer",
    fontFamily: F, fontSize: 10.5, fontWeight: 700,
    background: "rgba(255,255,255,0.92)", color: "#0B0B0D",
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void handleFiles(Array.from(e.dataTransfer.files ?? []));
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 10 }}>
        <div style={{ fontFamily: F, fontSize: 11.5, lineHeight: 1.5 }} className="text-admin-ink-muted">
          {tt("Logos, campaign and site imagery. Stored in Media → Branding and available in the website builder's image picker.")}
        </div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="cursor-pointer rounded-full border-[1.5px] border-[#18181b1a] bg-transparent px-3.5 py-[5px] text-xs font-semibold text-[#0B0B0D] transition-colors hover:border-[#4D4855]"
          style={{ flexShrink: 0 }}
        >
          {tt("Upload images")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          style={{ display: "none" }}
          onChange={onPick}
        />
      </div>

      {/* In-flight + failed uploads — persistent until resolved/dismissed. */}
      {uploads.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
          {uploads.map((u) => (
            <div key={u.key} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
              borderRadius: 8, border: `1px solid ${u.phase === "error" ? "rgba(176,48,58,0.35)" : C.borderSoft}`,
              background: u.phase === "error" ? "rgba(176,48,58,0.06)" : C.surfaceAlt,
              fontFamily: F, fontSize: 11.5,
            }}>
              <span style={{ flexShrink: 0 }}>{u.phase === "error" ? "⚠" : "⏳"}</span>
              <span className="text-admin-ink" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</span>
              <span className="text-admin-ink-muted" style={{ marginLeft: "auto", flexShrink: 0 }}>
                {u.phase === "compressing" && tt("Compressing…")}
                {u.phase === "uploading" && tt("Uploading…")}
                {u.phase === "registering" && tt("Saving…")}
                {u.phase === "error" && (u.error ?? tt("Upload failed"))}
              </span>
              {u.phase === "error" && (
                <button
                  type="button"
                  onClick={() => setUploads((prev) => prev.filter((x) => x.key !== u.key))}
                  style={{ border: "none", background: "transparent", cursor: "pointer", fontFamily: F, fontSize: 11, fontWeight: 700 }}
                  className="text-admin-ink-muted"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 22, textAlign: "center", fontFamily: F, fontSize: 12 }} className="text-admin-ink-muted">
          {tt("Loading brand images…")}
        </div>
      ) : loadError ? (
        <div style={{ padding: 14, borderRadius: 10, border: "1px solid rgba(176,48,58,0.35)", background: "rgba(176,48,58,0.06)", fontFamily: F, fontSize: 12 }} className="text-admin-ink">
          ⚠ {loadError}
        </div>
      ) : assets.length === 0 ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          style={{
            width: "100%", padding: "26px 16px", borderRadius: 10,
            border: `1.5px dashed ${dragOver ? "#0F4F3E" : C.border}`,
            background: dragOver ? "rgba(15,79,62,0.05)" : "#fff",
            cursor: "pointer", fontFamily: F, fontSize: 12.5, textAlign: "center",
          }}
          className="text-admin-ink-muted"
        >
          {tt("Drop images here or click to upload your first brand images.")}
        </button>
      ) : (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))", gap: 8,
          outline: dragOver ? "2px dashed #0F4F3E" : "none", outlineOffset: 4, borderRadius: 8,
        }}>
          {assets.map((asset) => {
            const busy = busyId === asset.id;
            const armed = armedDeleteId === asset.id;
            return (
              <div key={asset.id} style={{ position: "relative" }}>
                <div
                  className="branding-media-tile"
                  style={{
                    position: "relative", borderRadius: 10, overflow: "hidden",
                    border: `1px solid ${C.borderSoft}`, background: "#fff",
                    aspectRatio: "1 / 1", opacity: busy ? 0.55 : 1,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={asset.publicUrl}
                    alt={asset.originalFilename ?? "brand image"}
                    loading="lazy"
                    style={{ width: "100%", height: "100%", objectFit: "contain", padding: 6, background: "repeating-conic-gradient(#f6f6f3 0% 25%, #ffffff 0% 50%) 0 0 / 16px 16px" }}
                  />
                  {asset.role && (
                    <span style={{
                      position: "absolute", top: 6, left: 6, padding: "2px 7px", borderRadius: 999,
                      background: "rgba(15,79,62,0.94)", color: "#fff",
                      fontFamily: F, fontSize: 9.5, fontWeight: 800, letterSpacing: 0.3,
                    }}>
                      {asset.role === "wordmark" ? tt("Wordmark") : tt("Favicon")}
                    </span>
                  )}
                  {busy && (
                    <span style={{
                      position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: F, fontSize: 11, fontWeight: 700, background: "rgba(255,255,255,0.55)",
                    }} className="text-admin-ink">
                      {tt("Working…")}
                    </span>
                  )}
                  {/* Hover actions */}
                  {!busy && (
                    <div
                      className="branding-media-tile-actions"
                      style={{
                        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center", gap: 5,
                        background: "rgba(11,11,13,0.45)", opacity: 0, transition: "opacity 0.12s",
                      }}
                    >
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "center", padding: "0 6px" }}>
                        {asset.role !== "wordmark" && (
                          <button type="button" style={tileBtn} onClick={() => void setRole(asset, "wordmark")}>{tt("Wordmark")}</button>
                        )}
                        {asset.role !== "favicon" && (
                          <button type="button" style={tileBtn} onClick={() => void setRole(asset, "favicon")}>{tt("Favicon")}</button>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 5, justifyContent: "center" }}>
                        <button type="button" style={tileBtn} onClick={() => setCropAsset(asset)}>{tt("Crop")}</button>
                        <button
                          type="button"
                          style={{ ...tileBtn, background: armed ? C.red : "rgba(255,255,255,0.92)", color: armed ? "#fff" : C.red }}
                          onClick={() => void deleteAsset(asset)}
                        >
                          {armed ? tt("Sure?") : tt("Delete")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {tileError?.id === asset.id && (
                  <div style={{ marginTop: 3, fontFamily: F, fontSize: 10.5, lineHeight: 1.4, color: C.red }}>
                    ⚠ {tileError.message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <PhotoCropperDialog
        open={cropAsset !== null}
        onOpenChange={(o) => { if (!o) setCropAsset(null); }}
        sourceUrl={cropAsset?.publicUrl ?? ""}
        aspect="free"
        onCropConfirm={confirmCrop}
      />

      <style jsx>{`
        .branding-media-tile:hover :global(.branding-media-tile-actions) {
          opacity: 1 !important;
        }
      `}</style>
    </div>
  );
}
