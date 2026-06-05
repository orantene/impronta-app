"use client";

/**
 * ImageCropModal — in-editor crop UI for an existing image asset
 * (builder-100 §5.6). Operator picks an image tile, drags a crop rectangle
 * with aspect presets (free / 1:1 / 4:3 / 16:9), and Saves.
 *
 * Reuses the existing upload path: load src into an off-DOM <img>
 * (crossOrigin="anonymous" so the canvas stays untainted — Supabase public
 * URLs serve permissive CORS; a tainted canvas surfaces an error on Save) →
 * draw the selected source-pixel rect into a canvas → canvas.toBlob → File →
 * hand back to the drawer, which runs it through `uploadCmsMedia` like a fresh
 * upload. The crop lands as a NEW asset (non-destructive). Chrome matches the
 * drawer family; portalled above the drawer (zIndex 95 > Drawer's 87).
 *
 * Deferred (noted in the drawer): persisting crop coords on the asset row
 * (no crop-coords column today) and a zoom/pan control.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";

import { CHROME, CHROME_RADII, CHROME_SHADOWS } from "./kit";

// ── aspect presets ──────────────────────────────────────────────────────

type AspectKey = "free" | "1:1" | "4:3" | "16:9";

interface AspectSpec {
  key: AspectKey;
  label: string;
  /** width / height; null = free. */
  ratio: number | null;
}

const ASPECTS: ReadonlyArray<AspectSpec> = [
  { key: "free", label: "Free", ratio: null },
  { key: "1:1", label: "1:1", ratio: 1 },
  { key: "4:3", label: "4:3", ratio: 4 / 3 },
  { key: "16:9", label: "16:9", ratio: 16 / 9 },
];

// ── geometry ─────────────────────────────────────────────────────────────

/** Crop rect in *display* (CSS-pixel) space, relative to the rendered image. */
interface Rect { x: number; y: number; w: number; h: number }

type DragMode =
  | { kind: "none" }
  | { kind: "move"; startX: number; startY: number; orig: Rect }
  | {
      kind: "resize";
      handle: Handle;
      startX: number;
      startY: number;
      orig: Rect;
    };

type Handle = "nw" | "ne" | "sw" | "se";

const HANDLES: ReadonlyArray<Handle> = ["nw", "ne", "sw", "se"];
const MIN_SIZE = 24; // min crop edge in display px

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Center an aspect-locked (or free) rect inside the displayed image box. */
function defaultRect(boxW: number, boxH: number, ratio: number | null): Rect {
  const inset = 0.84; // start at ~84% of the frame
  const maxW = boxW * inset;
  const maxH = boxH * inset;
  if (ratio == null) {
    return { x: (boxW - maxW) / 2, y: (boxH - maxH) / 2, w: maxW, h: maxH };
  }
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

/** Re-fit a rect to a new ratio, keeping its center, clamped to the box. */
function applyRatio(rect: Rect, boxW: number, boxH: number, ratio: number): Rect {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  let w = rect.w;
  let h = w / ratio;
  if (h > boxH) {
    h = boxH;
    w = h * ratio;
  }
  if (w > boxW) {
    w = boxW;
    h = w / ratio;
  }
  let x = cx - w / 2;
  let y = cy - h / 2;
  x = clamp(x, 0, boxW - w);
  y = clamp(y, 0, boxH - h);
  return { x, y, w, h };
}

// ── component ─────────────────────────────────────────────────────────────

export interface ImageCropModalProps {
  /** Public URL of the source image to crop. */
  src: string;
  /** Display name (drives the output filename). */
  name: string;
  /** True while the parent is uploading the produced file. */
  saving?: boolean;
  /** Surfaces an upload / crop error from the parent. */
  error?: string | null;
  /** Produce the cropped File; parent runs it through the upload pipeline. */
  onSave: (file: File) => void;
  onClose: () => void;
}

export function ImageCropModal({
  src,
  name,
  saving = false,
  error = null,
  onSave,
  onClose,
}: ImageCropModalProps): ReactElement | null {
  const [mounted, setMounted] = useState(false);
  const [aspect, setAspect] = useState<AspectKey>("free");
  const [imgState, setImgState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  /** Natural (source) pixel dimensions. */
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  /** Displayed image box size in CSS px (after object-fit:contain). */
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const imgElRef = useRef<HTMLImageElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragMode>({ kind: "none" });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Escape to close (unless saving).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  // Measure the rendered image box once it lays out (and on resize), so the
  // crop rect lives in display space and maps cleanly back to source pixels.
  const measure = useCallback(() => {
    const el = imgElRef.current;
    if (!el || !natural) return;
    const frame = frameRef.current;
    if (!frame) return;
    const fw = frame.clientWidth;
    const fh = frame.clientHeight;
    // object-fit: contain math.
    const scale = Math.min(fw / natural.w, fh / natural.h);
    const w = natural.w * scale;
    const h = natural.h * scale;
    setBox((prev) =>
      prev && prev.w === w && prev.h === h ? prev : { w, h },
    );
  }, [natural]);

  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  // Initialize the rect when the box first becomes known.
  useEffect(() => {
    if (!box) return;
    setRect((prev) =>
      prev ? prev : defaultRect(box.w, box.h, ASPECTS.find((a) => a.key === aspect)?.ratio ?? null),
    );
  }, [box, aspect]);

  const handleImgLoad = useCallback(() => {
    const el = imgElRef.current;
    if (!el) return;
    if (!el.naturalWidth || !el.naturalHeight) {
      setImgState("error");
      return;
    }
    setNatural({ w: el.naturalWidth, h: el.naturalHeight });
    setImgState("ready");
  }, []);

  const handleImgError = useCallback(() => {
    setImgState("error");
  }, []);

  // Switching aspect re-fits the current rect.
  const chooseAspect = useCallback(
    (key: AspectKey) => {
      setAspect(key);
      const ratio = ASPECTS.find((a) => a.key === key)?.ratio ?? null;
      setRect((prev) => {
        if (!box) return prev;
        if (ratio == null) return prev ?? defaultRect(box.w, box.h, null);
        const base = prev ?? defaultRect(box.w, box.h, ratio);
        return applyRatio(base, box.w, box.h, ratio);
      });
    },
    [box],
  );

  // ── drag handlers (move + corner resize) ──────────────────────────────

  const ratioOf = ASPECTS.find((a) => a.key === aspect)?.ratio ?? null;

  const onPointerDownMove = useCallback(
    (e: React.PointerEvent) => {
      if (!rect) return;
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      dragRef.current = {
        kind: "move",
        startX: e.clientX,
        startY: e.clientY,
        orig: rect,
      };
    },
    [rect],
  );

  const onPointerDownResize = useCallback(
    (handle: Handle) => (e: React.PointerEvent) => {
      if (!rect) return;
      e.preventDefault();
      e.stopPropagation();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      dragRef.current = {
        kind: "resize",
        handle,
        startX: e.clientX,
        startY: e.clientY,
        orig: rect,
      };
    },
    [rect],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (drag.kind === "none" || !box) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;

      if (drag.kind === "move") {
        const x = clamp(drag.orig.x + dx, 0, box.w - drag.orig.w);
        const y = clamp(drag.orig.y + dy, 0, box.h - drag.orig.h);
        setRect({ ...drag.orig, x, y });
        return;
      }

      // resize — anchor the opposite corner.
      const o = drag.orig;
      const right = o.x + o.w;
      const bottom = o.y + o.h;
      let nx = o.x;
      let ny = o.y;
      let nw = o.w;
      let nh = o.h;

      const west = drag.handle === "nw" || drag.handle === "sw";
      const north = drag.handle === "nw" || drag.handle === "ne";

      if (west) {
        nx = clamp(o.x + dx, 0, right - MIN_SIZE);
        nw = right - nx;
      } else {
        nw = clamp(o.w + dx, MIN_SIZE, box.w - o.x);
      }
      if (north) {
        ny = clamp(o.y + dy, 0, bottom - MIN_SIZE);
        nh = bottom - ny;
      } else {
        nh = clamp(o.h + dy, MIN_SIZE, box.h - o.y);
      }

      if (ratioOf != null) {
        // Lock to ratio: drive height from width, then re-anchor.
        nh = nw / ratioOf;
        // If height overflows, drive width from clamped height instead.
        const maxH = north ? bottom : box.h - o.y;
        if (nh > maxH) {
          nh = maxH;
          nw = nh * ratioOf;
        }
        const maxW = west ? right : box.w - o.x;
        if (nw > maxW) {
          nw = maxW;
          nh = nw / ratioOf;
        }
        if (west) nx = right - nw;
        if (north) ny = bottom - nh;
      }

      setRect({ x: nx, y: ny, w: nw, h: nh });
    },
    [box, ratioOf],
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = { kind: "none" };
  }, []);

  // ── save (canvas crop → File) ─────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setLocalError(null);
    const el = imgElRef.current;
    if (!el || !natural || !box || !rect) return;
    // Map display-space rect → source pixels.
    const scaleX = natural.w / box.w;
    const scaleY = natural.h / box.h;
    const sx = Math.round(rect.x * scaleX);
    const sy = Math.round(rect.y * scaleY);
    const sw = Math.max(1, Math.round(rect.w * scaleX));
    const sh = Math.max(1, Math.round(rect.h * scaleY));

    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setLocalError("Couldn't create a canvas to crop with.");
      return;
    }
    try {
      ctx.drawImage(el, sx, sy, sw, sh, 0, 0, sw, sh);
    } catch {
      setLocalError("Couldn't read the image pixels (cross-origin).");
      return;
    }

    const blob = await new Promise<Blob | null>((resolve) => {
      // PNG keeps transparency + avoids double-lossy (uploadCmsMedia
      // compresses again to web JPEG/webp where appropriate).
      try {
        canvas.toBlob((b) => resolve(b), "image/png");
      } catch {
        resolve(null);
      }
    });
    if (!blob) {
      setLocalError("Couldn't produce a cropped image. The source may be cross-origin protected.");
      return;
    }

    const base = name.replace(/\.[^.]+$/, "") || "image";
    const file = new File([blob], `${base}-cropped.png`, { type: "image/png" });
    onSave(file);
  }, [natural, box, rect, name, onSave]);

  if (!mounted) return null;

  const shownError = error ?? localError;

  const body = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Crop image"
      style={overlayStyle}
      onClick={saving ? undefined : onClose}
    >
      <div
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* head */}
        <div style={headStyle}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: CHROME.ink, letterSpacing: "-0.01em" }}>
              Crop image
            </div>
            <div className="truncate" style={{ fontSize: 11, color: CHROME.muted, marginTop: 2, maxWidth: 360 }} title={name}>
              {name}
              {natural ? (
                <span style={{ color: CHROME.muted2 }}> · {natural.w}×{natural.h}</span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={saving ? undefined : onClose}
            disabled={saving}
            aria-label="Close"
            style={closeBtnStyle(saving)}
          >
            <CloseIcon />
          </button>
        </div>

        {/* aspect presets */}
        <div style={presetRowStyle}>
          {ASPECTS.map((a) => {
            const active = aspect === a.key;
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => chooseAspect(a.key)}
                disabled={imgState !== "ready"}
                style={presetBtnStyle(active, imgState !== "ready")}
              >
                {a.label}
              </button>
            );
          })}
        </div>

        {/* stage */}
        <div ref={frameRef} style={stageStyle}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgElRef}
            src={src}
            alt={name}
            crossOrigin="anonymous"
            onLoad={handleImgLoad}
            onError={handleImgError}
            draggable={false}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              width: box ? box.w : "auto",
              height: box ? box.h : "auto",
              objectFit: "contain",
              userSelect: "none",
              display: imgState === "ready" ? "block" : "none",
            }}
          />

          {imgState === "loading" ? (
            <div style={stageMsgStyle}>Loading image…</div>
          ) : null}
          {imgState === "error" ? (
            <div style={{ ...stageMsgStyle, color: CHROME.rose }}>
              Couldn&apos;t load this image to crop.
            </div>
          ) : null}

          {/* crop overlay — absolutely positioned over the centered image box */}
          {imgState === "ready" && box && rect ? (
            <div
              style={{
                position: "absolute",
                width: box.w,
                height: box.h,
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                touchAction: "none",
              }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {/* dark scrim outside the crop rect (4 bands) */}
              <Scrim box={box} rect={rect} />

              {/* crop rect */}
              <div
                onPointerDown={onPointerDownMove}
                style={{
                  position: "absolute",
                  left: rect.x,
                  top: rect.y,
                  width: rect.w,
                  height: rect.h,
                  border: `1px solid ${CHROME.surface}`,
                  boxShadow: `0 0 0 1px rgba(0,0,0,0.35)`,
                  cursor: "move",
                  touchAction: "none",
                }}
              >
                {/* rule-of-thirds guides */}
                <Thirds />
                {/* corner handles */}
                {HANDLES.map((h) => (
                  <span
                    key={h}
                    onPointerDown={onPointerDownResize(h)}
                    style={handleStyle(h)}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* error */}
        {shownError ? (
          <div style={{ padding: "0 16px" }}>
            <div role="alert" style={errBannerStyle}>
              {shownError}
            </div>
          </div>
        ) : null}

        {/* foot */}
        <div style={footStyle}>
          <div style={{ fontSize: 11, color: CHROME.muted2 }}>
            Saves a new cropped asset · original kept
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={ghostBtnStyle(saving)}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || imgState !== "ready" || !rect}
              style={primaryBtnStyle(saving || imgState !== "ready" || !rect)}
            >
              {saving ? "Saving…" : "Save crop"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}

// ── overlay sub-pieces ──────────────────────────────────────────────────

function Scrim({ box, rect }: { box: { w: number; h: number }; rect: Rect }) {
  const band: CSSProperties = {
    position: "absolute",
    background: "rgba(10,10,12,0.46)",
    pointerEvents: "none",
  };
  return (
    <>
      {/* top */}
      <div style={{ ...band, left: 0, top: 0, width: box.w, height: rect.y }} />
      {/* bottom */}
      <div
        style={{
          ...band,
          left: 0,
          top: rect.y + rect.h,
          width: box.w,
          height: Math.max(0, box.h - (rect.y + rect.h)),
        }}
      />
      {/* left */}
      <div style={{ ...band, left: 0, top: rect.y, width: rect.x, height: rect.h }} />
      {/* right */}
      <div
        style={{
          ...band,
          left: rect.x + rect.w,
          top: rect.y,
          width: Math.max(0, box.w - (rect.x + rect.w)),
          height: rect.h,
        }}
      />
    </>
  );
}

function Thirds() {
  const line: CSSProperties = {
    position: "absolute",
    background: "rgba(255,255,255,0.32)",
    pointerEvents: "none",
  };
  return (
    <>
      <div style={{ ...line, left: "33.333%", top: 0, width: 1, height: "100%" }} />
      <div style={{ ...line, left: "66.666%", top: 0, width: 1, height: "100%" }} />
      <div style={{ ...line, top: "33.333%", left: 0, height: 1, width: "100%" }} />
      <div style={{ ...line, top: "66.666%", left: 0, height: 1, width: "100%" }} />
    </>
  );
}

function handleStyle(h: Handle): CSSProperties {
  const size = 12;
  const off = -(size / 2);
  const pos: CSSProperties = {};
  if (h === "nw") {
    pos.left = off;
    pos.top = off;
    pos.cursor = "nwse-resize";
  } else if (h === "ne") {
    pos.right = off;
    pos.top = off;
    pos.cursor = "nesw-resize";
  } else if (h === "sw") {
    pos.left = off;
    pos.bottom = off;
    pos.cursor = "nesw-resize";
  } else {
    pos.right = off;
    pos.bottom = off;
    pos.cursor = "nwse-resize";
  }
  return {
    position: "absolute",
    width: size,
    height: size,
    background: CHROME.surface,
    border: `1.5px solid ${CHROME.accent}`,
    borderRadius: 3,
    boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
    touchAction: "none",
    ...pos,
  };
}

function CloseIcon(): ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ── styles ───────────────────────────────────────────────────────────────

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 95,
  background: "rgba(14,14,18,0.52)",
  backdropFilter: "blur(2px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

const panelStyle: CSSProperties = {
  width: "min(640px, 100%)",
  maxHeight: "calc(100vh - 48px)",
  display: "flex",
  flexDirection: "column",
  background: CHROME.paper,
  border: `1px solid ${CHROME.line}`,
  borderRadius: CHROME_RADII.lg,
  boxShadow: CHROME_SHADOWS.card,
  overflow: "hidden",
};

const headStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  padding: "14px 16px 10px",
  borderBottom: `1px solid ${CHROME.line}`,
  background: CHROME.surface,
};

const presetRowStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  padding: "10px 16px",
  background: CHROME.surface,
  borderBottom: `1px solid ${CHROME.line}`,
};

const stageStyle: CSSProperties = {
  position: "relative",
  flex: 1,
  minHeight: 280,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background:
    "repeating-conic-gradient(rgba(0,0,0,0.04) 0% 25%, rgba(0,0,0,0.08) 0% 50%) 50% / 20px 20px",
  padding: 16,
  overflow: "hidden",
};

const stageMsgStyle: CSSProperties = {
  position: "absolute",
  fontSize: 12,
  fontWeight: 500,
  color: CHROME.muted,
};

const footStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "12px 16px",
  borderTop: `1px solid ${CHROME.line}`,
  background: CHROME.surface,
};

const errBannerStyle: CSSProperties = {
  margin: "10px 0 0",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 11,
  background: CHROME.roseBg,
  border: `1px solid ${CHROME.roseLine}`,
  color: CHROME.rose,
};

function closeBtnStyle(disabled: boolean): CSSProperties {
  return {
    width: 28,
    height: 28,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: CHROME.muted,
    background: "transparent",
    border: `1px solid ${CHROME.line}`,
    borderRadius: 7,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}

function presetBtnStyle(active: boolean, disabled: boolean): CSSProperties {
  return {
    height: 28,
    padding: "0 12px",
    fontSize: 11.5,
    fontWeight: 600,
    color: active ? "#fff" : CHROME.text2,
    background: active ? CHROME.accent : CHROME.surface,
    border: `1px solid ${active ? CHROME.accent : CHROME.lineMid}`,
    borderRadius: 7,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    fontVariantNumeric: "tabular-nums",
  };
}

function ghostBtnStyle(disabled: boolean): CSSProperties {
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
  };
}

function primaryBtnStyle(disabled: boolean): CSSProperties {
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
  };
}
