"use client";

// ============================================================================
// HeightDualControl.tsx — the single "Height" field's editor control.
//
// One canonical stored value: centimetres (an integer). Two inputs: cm and
// ft/in, converting live in BOTH directions. The ft/in inputs are never
// persisted on their own — typing feet/inches just recomputes cm. This is
// what let us collapse the old dual "Height (cm)" + "Height (ft/in) range"
// fields into one field (the range field, physical.height_imperial, is now
// deprecated; see migration 20260611032342).
//
// Extracted from FieldEditor.tsx so that file stays under the 800-line cap.
// Self-contained: own minimal palette (mirrors FieldEditor's T/F tokens) so it
// composes without a circular import.
// ============================================================================

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cmToFtIn, ftInToCm, HEIGHT_CM_FIELD_KEY } from "@/lib/fields/height-convert";

export { HEIGHT_CM_FIELD_KEY };

const INK_MUTED = "#5A5A60";
const INK_DIM = "rgba(11,11,13,0.38)";
const FONT = "Inter, system-ui, sans-serif";

export function HeightDualControl({
  cm,
  onCm,
  onCommit,
  inputStyle,
}: {
  /** Numeric string of the canonical cm value ("" when empty). */
  cm: string;
  /** Update the draft cm string (also clears any prior error in the parent). */
  onCm: (next: string) => void;
  /** Commit the current draft as the canonical cm number (or null). */
  onCommit: () => void;
  inputStyle: CSSProperties;
}) {
  const [ft, setFt] = useState("");
  const [inch, setInch] = useState("");
  // When the ft/in inputs drive cm, the resulting `cm` prop change is
  // self-originated — we must NOT resync ft/in from it (that would clobber the
  // digits being typed). This ref flags that one upcoming cm change as
  // self-originated so the sync effect skips it. Keeps the effect's dep array
  // honest (only [cm]) without suppressing react-hooks/exhaustive-deps.
  const selfOriginated = useRef(false);

  // Resync ft/in whenever cm changes from an EXTERNAL source (the cm input or
  // the initial load). Self-originated cm changes (from pushFromFtIn) are
  // skipped via the ref above.
  useEffect(() => {
    if (selfOriginated.current) {
      selfOriginated.current = false;
      return;
    }
    const n = cm === "" ? null : Number(cm);
    if (n === null || !Number.isFinite(n)) {
      setFt("");
      setInch("");
      return;
    }
    const r = cmToFtIn(n);
    setFt(String(r.ft));
    setInch(String(r.inch));
  }, [cm]);

  const pushFromFtIn = (nextFt: string, nextIn: string) => {
    setFt(nextFt);
    setInch(nextIn);
    selfOriginated.current = true;
    if (nextFt === "" && nextIn === "") {
      onCm("");
      return;
    }
    onCm(String(ftInToCm(Number(nextFt || 0), Number(nextIn || 0))));
  };

  const suffix: CSSProperties = {
    position: "absolute",
    right: 9,
    top: "50%",
    transform: "translateY(-50%)",
    fontSize: 11,
    color: INK_MUTED,
    fontFamily: FONT,
    fontWeight: 600,
    pointerEvents: "none",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {/* Centimetres — the canonical value. */}
      <div style={{ position: "relative", flex: "1 1 120px", minWidth: 108 }}>
        <input
          type="number"
          inputMode="numeric"
          value={cm}
          onChange={(e) => onCm(e.target.value)}
          onBlur={onCommit}
          placeholder="Height"
          aria-label="Height in centimetres"
          style={{ ...inputStyle, paddingRight: 34 }}
        />
        <span style={suffix}>cm</span>
      </div>
      <span style={{ color: INK_DIM, fontFamily: FONT, fontSize: 12, fontWeight: 600 }}>=</span>
      {/* Feet / inches — converted live, never stored on their own. */}
      <div style={{ position: "relative", flex: "0 0 76px" }}>
        <input
          type="number"
          inputMode="numeric"
          value={ft}
          onChange={(e) => pushFromFtIn(e.target.value, inch)}
          onBlur={onCommit}
          placeholder="ft"
          aria-label="Height — feet"
          style={{ ...inputStyle, paddingRight: 24, textAlign: "center" }}
        />
        <span style={suffix}>ft</span>
      </div>
      <div style={{ position: "relative", flex: "0 0 76px" }}>
        <input
          type="number"
          inputMode="numeric"
          value={inch}
          onChange={(e) => pushFromFtIn(ft, e.target.value)}
          onBlur={onCommit}
          placeholder="in"
          aria-label="Height — inches"
          style={{ ...inputStyle, paddingRight: 24, textAlign: "center" }}
        />
        <span style={suffix}>in</span>
      </div>
    </div>
  );
}
