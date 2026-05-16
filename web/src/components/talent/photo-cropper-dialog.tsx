"use client";

import React, { useCallback, useMemo, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";
import { createTranslator } from "@/i18n/messages";

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
  locale?: string;
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

// Canonical aspect tokens — kept here so admin Media + talent drawer stay
// aligned and the dialog can offer in-place switching without callers
// having to wire each ratio. Profile = 1:1 square headshot. Cover = 16:9
// full-width banner (used for the talent profile page hero). Free = no
// constraint.
const ASPECT_PROFILE = 1;
const ASPECT_COVER = 16 / 9;

type AspectPreset = "profile" | "cover" | "free";
function presetFromAspect(a: 1 | number | "free"): AspectPreset {
  if (a === "free") return "free";
  if (a === ASPECT_PROFILE) return "profile";
  // Anything else treats as cover; if a caller passes a one-off, we still
  // render the picker so the user can switch.
  return "cover";
}
function aspectFromPreset(p: AspectPreset): number | undefined {
  if (p === "profile") return ASPECT_PROFILE;
  if (p === "cover") return ASPECT_COVER;
  return undefined;
}

export function PhotoCropperDialog({
  open,
  onOpenChange,
  sourceUrl,
  aspect,
  onCropConfirm,
  locale = "en",
}: PhotoCropperDialogProps) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  // Internal aspect — initialised from the prop on open, then user can
  // switch with the chip picker without closing.
  const [preset, setPreset] = useState<AspectPreset>(() => presetFromAspect(aspect));
  type Status = "idle" | "processing" | "error";
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Re-sync when caller re-opens with a different initial aspect
  React.useEffect(() => {
    if (open) {
      setPreset(presetFromAspect(aspect));
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    }
  }, [open, aspect]);

  // react-easy-crop v5 only fires `onCropComplete` on a clean drag-STOP
  // (mouseup caught by its document listener) or on mount. When the
  // controlled `crop` prop changes mid-drag it instead fires ONLY
  // `onCropAreaChange` (see componentDidUpdate → emitCropAreaChange in
  // react-easy-crop). Wiring this handler to BOTH callbacks guarantees
  // `croppedAreaPixels` always tracks the live crop region — otherwise a
  // missed stop event (release outside window, touch-cancel, programmatic
  // pan) silently saves the default centered crop instead of what the
  // user positioned. Do not remove the onCropAreaChange wiring.
  const syncCroppedArea = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const resolvedAspect = aspectFromPreset(preset);

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
      setErrorMsg(err instanceof Error ? err.message : t("admin.talent.edit.cropper.cropFailed"));
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("admin.talent.edit.cropper.dialogLabel")}
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
          width: "min(960px, 96vw)",
          maxHeight: "94vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(11,11,13,0.28)",
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
            gap: 14, flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontFamily: F, fontSize: 15, fontWeight: 600, color: C.ink }}>
              {t("admin.talent.edit.cropper.title")}
            </div>
            <div style={{ fontFamily: F, fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
              {preset === "profile"
                ? `${t("admin.talent.edit.cropper.squareAvatar")} · 1:1`
                : preset === "free"
                  ? t("admin.talent.edit.cropper.freeCrop")
                  : `${t("admin.talent.edit.cropper.portraitHero")} · 16:9`}
            </div>
          </div>

          {/* Aspect chips — switch ratio without closing the dialog */}
          <div style={{ display: "flex", gap: 4, padding: 3, background: "rgba(11,11,13,0.06)", borderRadius: 9 }}>
            {([
              { key: "profile", label: "Profile", sub: "1:1" },
              { key: "cover",   label: "Cover",   sub: "16:9" },
              { key: "free",    label: "Free",    sub: "" },
            ] as { key: AspectPreset; label: string; sub: string }[]).map((opt) => {
              const active = preset === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => { setPreset(opt.key); setCrop({ x: 0, y: 0 }); setZoom(1); }}
                  style={{
                    fontFamily: F, fontSize: 12, fontWeight: 600,
                    padding: "6px 12px", borderRadius: 7, border: "none",
                    background: active ? "#fff" : "transparent",
                    color: active ? C.ink : C.inkMuted,
                    boxShadow: active ? "0 1px 4px rgba(11,11,13,0.08)" : "none",
                    cursor: "pointer", display: "inline-flex", alignItems: "baseline", gap: 5,
                  }}
                >
                  {opt.label}
                  {opt.sub && <span style={{ fontSize: 10.5, opacity: 0.55, fontWeight: 500 }}>{opt.sub}</span>}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label={t("admin.talent.edit.cropper.cancel")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 22,
              color: C.inkMuted,
              padding: "2px 6px",
              borderRadius: 6,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Cropper area — taller for easier drag/zoom; checker pattern hint
            via the dark backdrop helps see the crop boundary against any
            source image. */}
        <div style={{ position: "relative", height: "min(64vh, 620px)", minHeight: 400, background: "#1a1a1a" }}>
          <Cropper
            image={sourceUrl}
            crop={crop}
            zoom={zoom}
            aspect={resolvedAspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={syncCroppedArea}
            onCropAreaChange={syncCroppedArea}
            objectFit="contain"
            showGrid={true}
            zoomSpeed={0.8}
            minZoom={0.5}
            maxZoom={4}
            restrictPosition={false}
          />
        </div>

        {/* Zoom slider */}
        <div style={{ padding: "12px 18px 10px", borderTop: `1px solid ${C.border}` }}>
          <label
            style={{ fontFamily: F, fontSize: 11.5, color: C.inkMuted, display: "flex", justifyContent: "space-between", marginBottom: 6 }}
          >
            <span>{t("admin.talent.edit.cropper.zoom")}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{zoom.toFixed(2)}×</span>
          </label>
          <input
            type="range"
            min={0.5}
            max={4}
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
            {t("admin.talent.edit.cropper.cancel")}
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
            {status === "processing" ? t("admin.talent.edit.cropper.applying") : t("admin.talent.edit.cropper.useCrop")}
          </button>
        </div>
      </div>
      <style>{`@keyframes tulala-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
