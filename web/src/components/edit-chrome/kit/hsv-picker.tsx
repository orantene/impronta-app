"use client";

/**
 * HsvPicker — a small, self-contained, in-app HSV color surface.
 *
 * Replaces the OS `<input type="color">` chrome so color-picking NEVER leaves
 * the branded surface (W3-T5). Two controls:
 *   1. a saturation/value square (x = saturation, y = value/brightness), and
 *   2. a hue strip (0–360°).
 *
 * Works in HEX end-to-end (`value` in, `onChange(hex)` out) so it drops in
 * wherever the native picker lived. Pointer-drag + keyboard (arrow keys on the
 * square nudge S/V; arrows on the hue strip nudge hue) so it is reachable
 * without a mouse. No external dependency — pure React + a tiny color-math
 * helper kept local to this file.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";

import { CHROME, CHROME_RADII } from "./tokens";

// ── Color math (hex ⇄ hsv) ────────────────────────────────────────────────────

export interface Hsv {
  /** 0–360 */
  h: number;
  /** 0–100 */
  s: number;
  /** 0–100 */
  v: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function normaliseHex6(input: string): string | null {
  const t = input.trim();
  if (/^#[0-9a-f]{6}$/i.test(t)) return t.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(t)) {
    const [, a, b, c] = t;
    return `#${a}${a}${b}${b}${c}${c}`.toLowerCase();
  }
  return null;
}

export function hexToHsv(hex: string): Hsv {
  const safe = normaliseHex6(hex) ?? "#000000";
  const r = parseInt(safe.slice(1, 3), 16) / 255;
  const g = parseInt(safe.slice(3, 5), 16) / 255;
  const b = parseInt(safe.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s: s * 100, v: max * 100 };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const sat = clamp(s, 0, 100) / 100;
  const val = clamp(v, 0, 100) / 100;
  const c = val * sat;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh >= 0 && hh < 1) [r, g, b] = [c, x, 0];
  else if (hh < 2) [r, g, b] = [x, c, 0];
  else if (hh < 3) [r, g, b] = [0, c, x];
  else if (hh < 4) [r, g, b] = [0, x, c];
  else if (hh < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = val - c;
  const to255 = (n: number) => Math.round((n + m) * 255);
  const hex = (n: number) => to255(n).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

// ── Component ──────────────────────────────────────────────────────────────────

interface HsvPickerProps {
  /** Current color as any hex form ("#fff" / "#ffffff"); non-hex → black. */
  value: string;
  /** Fires the resolved 6-char hex on every change. */
  onChange: (hex: string) => void;
  /** Surface height in px (the SV square). Default 140. */
  height?: number;
}

export function HsvPicker({
  value,
  onChange,
  height = 140,
}: HsvPickerProps): ReactElement {
  // Keep HSV in local state so a fully-desaturated or zero-value color doesn't
  // collapse the hue/saturation the user just dialed (hex round-trip is lossy
  // for H at S=0 / V=0). Re-sync from `value` only when it diverges from what we
  // would emit (an external change), never on our own emits.
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const lastEmitted = useRef<string>(hsvToHex(hsv));

  useEffect(() => {
    const incoming = normaliseHex6(value);
    if (!incoming) return;
    if (incoming.toLowerCase() === lastEmitted.current.toLowerCase()) return;
    setHsv(hexToHsv(incoming));
    lastEmitted.current = incoming;
  }, [value]);

  const emit = useCallback(
    (next: Hsv) => {
      setHsv(next);
      const hex = hsvToHex(next);
      lastEmitted.current = hex;
      onChange(hex);
    },
    [onChange],
  );

  // ── SV square pointer + keyboard ────────────────────────────────────────────
  const squareRef = useRef<HTMLDivElement | null>(null);
  const draggingSquare = useRef(false);

  const applySquareFromEvent = useCallback(
    (clientX: number, clientY: number) => {
      const el = squareRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const s = clamp((clientX - rect.left) / rect.width, 0, 1) * 100;
      const v = (1 - clamp((clientY - rect.top) / rect.height, 0, 1)) * 100;
      emit({ ...hsv, s, v });
    },
    [emit, hsv],
  );

  const onSquarePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      draggingSquare.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      applySquareFromEvent(e.clientX, e.clientY);
    },
    [applySquareFromEvent],
  );

  const onSquarePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingSquare.current) return;
      applySquareFromEvent(e.clientX, e.clientY);
    },
    [applySquareFromEvent],
  );

  const onSquarePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      draggingSquare.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* capture may already be gone */
      }
    },
    [],
  );

  const onSquareKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 10 : 2;
      let { s, v } = hsv;
      if (e.key === "ArrowLeft") s -= step;
      else if (e.key === "ArrowRight") s += step;
      else if (e.key === "ArrowUp") v += step;
      else if (e.key === "ArrowDown") v -= step;
      else return;
      e.preventDefault();
      emit({ ...hsv, s: clamp(s, 0, 100), v: clamp(v, 0, 100) });
    },
    [emit, hsv],
  );

  // ── Hue strip pointer + keyboard ────────────────────────────────────────────
  const hueRef = useRef<HTMLDivElement | null>(null);
  const draggingHue = useRef(false);

  const applyHueFromEvent = useCallback(
    (clientX: number) => {
      const el = hueRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const h = clamp((clientX - rect.left) / rect.width, 0, 1) * 360;
      emit({ ...hsv, h });
    },
    [emit, hsv],
  );

  const onHuePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      draggingHue.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      applyHueFromEvent(e.clientX);
    },
    [applyHueFromEvent],
  );

  const onHuePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingHue.current) return;
      applyHueFromEvent(e.clientX);
    },
    [applyHueFromEvent],
  );

  const onHuePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      draggingHue.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* capture may already be gone */
      }
    },
    [],
  );

  const onHueKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 15 : 4;
      let h = hsv.h;
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") h -= step;
      else if (e.key === "ArrowRight" || e.key === "ArrowUp") h += step;
      else return;
      e.preventDefault();
      emit({ ...hsv, h: ((h % 360) + 360) % 360 });
    },
    [emit, hsv],
  );

  const hueColor = hsvToHex({ h: hsv.h, s: 100, v: 100 });
  const thumbHex = hsvToHex(hsv);

  const squareThumbStyle: CSSProperties = {
    position: "absolute",
    left: `${hsv.s}%`,
    top: `${100 - hsv.v}%`,
    width: 12,
    height: 12,
    transform: "translate(-50%, -50%)",
    borderRadius: "50%",
    border: "2px solid #fff",
    boxShadow: "0 0 0 1px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.4)",
    background: thumbHex,
    pointerEvents: "none",
  };

  const hueThumbStyle: CSSProperties = {
    position: "absolute",
    left: `${(hsv.h / 360) * 100}%`,
    top: "50%",
    width: 12,
    height: 12,
    transform: "translate(-50%, -50%)",
    borderRadius: "50%",
    border: "2px solid #fff",
    boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
    background: hueColor,
    pointerEvents: "none",
  };

  return (
    <div data-builder-hsv-picker="" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Saturation / Value square */}
      <div
        ref={squareRef}
        role="slider"
        tabIndex={0}
        aria-label="Saturation and brightness"
        aria-valuetext={`saturation ${Math.round(hsv.s)}%, brightness ${Math.round(hsv.v)}%`}
        onPointerDown={onSquarePointerDown}
        onPointerMove={onSquarePointerMove}
        onPointerUp={onSquarePointerUp}
        onKeyDown={onSquareKeyDown}
        style={{
          position: "relative",
          width: "100%",
          height,
          borderRadius: CHROME_RADII.sm,
          border: `1px solid ${CHROME.line}`,
          cursor: "crosshair",
          touchAction: "none",
          // White → hue (left→right saturation), overlaid with transparent →
          // black (top→bottom value). This is the canonical HSV square.
          backgroundColor: hueColor,
          backgroundImage:
            "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
        }}
      >
        <span style={squareThumbStyle} aria-hidden />
      </div>

      {/* Hue strip */}
      <div
        ref={hueRef}
        role="slider"
        tabIndex={0}
        aria-label="Hue"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        onPointerDown={onHuePointerDown}
        onPointerMove={onHuePointerMove}
        onPointerUp={onHuePointerUp}
        onKeyDown={onHueKeyDown}
        style={{
          position: "relative",
          width: "100%",
          height: 12,
          borderRadius: 999,
          border: `1px solid ${CHROME.line}`,
          cursor: "ew-resize",
          touchAction: "none",
          backgroundImage:
            "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
        }}
      >
        <span style={hueThumbStyle} aria-hidden />
      </div>
    </div>
  );
}
