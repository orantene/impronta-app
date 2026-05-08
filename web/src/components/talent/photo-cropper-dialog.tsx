"use client";

import React, { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CropData {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PhotoCropperDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceUrl: string;
  aspect: 1 | number | "free";
  onCropConfirm: (blob: Blob, cropData: CropData) => Promise<void>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getCroppedBlob(
  imageSrc: string,
  pixelCrop: Area,
): Promise<Blob> {
  const img = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable.");
  ctx.drawImage(
    img,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height,
  );
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not generate image blob."));
      },
      "image/webp",
      0.9,
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.62)",
  border: "rgba(24,24,27,0.10)",
  surface: "#FAFAF7",
  accent: "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.08)",
  error: "#c0392b",
  errorSoft: "rgba(192,57,43,0.08)",
  overlay: "rgba(11,11,13,0.56)",
} as const;

const F = '"Inter", system-ui, sans-serif';

// ─── Component ────────────────────────────────────────────────────────────────

export function PhotoCropperDialog({
  open,
  onOpenChange,
  sourceUrl,
  aspect,
  onCropConfirm,
}: PhotoCropperDialogProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  type Status = "idle" | "processing" | "error";
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const resolvedAspect = aspect === "free" ? undefined : aspect;

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setStatus("processing");
    setErrorMsg(null);
    try {
      const blob = await getCroppedBlob(sourceUrl, croppedAreaPixels);
      await onCropConfirm(blob, {
        x: croppedAreaPixels.x,
        y: croppedAreaPixels.y,
        width: croppedAreaPixels.width,
        height: croppedAreaPixels.height,
      });
      setStatus("idle");
      onOpenChange(false);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Crop failed. Try again.");
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Crop photo"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: C.overlay,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div
        style={{
          background: C.surface,
          borderRadius: 14,
          width: "min(520px, 94vw)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(11,11,13,0.22)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 18px 12px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontFamily: F, fontSize: 15, fontWeight: 600, color: C.ink }}>
              Crop photo
            </div>
            <div style={{ fontFamily: F, fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
              {aspect === 1 ? "1:1 square — avatar" : aspect === "free" ? "Free crop" : "4:5 portrait — hero"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 20,
              color: C.inkMuted,
              padding: "2px 6px",
              borderRadius: 6,
            }}
          >
            ×
          </button>
        </div>

        {/* Cropper area */}
        <div style={{ position: "relative", height: 340, background: "#1a1a1a" }}>
          <Cropper
            image={sourceUrl}
            crop={crop}
            zoom={zoom}
            aspect={resolvedAspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        {/* Zoom slider */}
        <div style={{ padding: "12px 18px 10px", borderTop: `1px solid ${C.border}` }}>
          <label
            style={{ fontFamily: F, fontSize: 11.5, color: C.inkMuted, display: "block", marginBottom: 6 }}
          >
            Zoom
          </label>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ width: "100%", accentColor: C.accent }}
          />
        </div>

        {/* Error state */}
        {status === "error" && errorMsg && (
          <div
            style={{
              margin: "0 18px 10px",
              padding: "8px 12px",
              background: C.errorSoft,
              border: `1px solid ${C.error}`,
              borderRadius: 8,
              fontFamily: F,
              fontSize: 12.5,
              color: C.error,
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            padding: "10px 18px 14px",
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            borderTop: `1px solid ${C.border}`,
          }}
        >
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={status === "processing"}
            style={{
              fontFamily: F,
              fontSize: 13,
              fontWeight: 500,
              padding: "8px 16px",
              background: "transparent",
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              cursor: "pointer",
              color: C.ink,
              opacity: status === "processing" ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={status === "processing" || !croppedAreaPixels}
            style={{
              fontFamily: F,
              fontSize: 13,
              fontWeight: 600,
              padding: "8px 18px",
              background: C.accent,
              border: "none",
              borderRadius: 8,
              cursor: status === "processing" ? "wait" : "pointer",
              color: "#fff",
              opacity: status === "processing" || !croppedAreaPixels ? 0.6 : 1,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {status === "processing" && (
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,0.3)",
                  borderTopColor: "#fff",
                  animation: "tulala-spin 0.7s linear infinite",
                  display: "inline-block",
                }}
              />
            )}
            {status === "processing" ? "Applying…" : "Use crop"}
          </button>
        </div>
      </div>
      <style>{`@keyframes tulala-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
