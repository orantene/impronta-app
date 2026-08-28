"use client";

/**
 * Per-corner radius + per-side border width controls.
 *
 * "16px on the top corners only" and "a hairline rule on the top edge only"
 * were both expressible (the schema stores free CSS shorthand for
 * `borderRadius`, and the renderer emits `borderWidth` as `border-width`, so
 * 1-4 value shorthands work) but reachable only by hand-typing the shorthand.
 * These controls write that same shorthand from four labelled inputs with a
 * link/unlink toggle.
 *
 * Honesty rules (pinned by visual-effect-wiring.test.tsx):
 *  - Rendering never emits a patch.
 *  - A value the grammar cannot own (elliptical `16px / 8px`, calc(), a theme
 *    token) makes the controls stand down: the group shows the value verbatim
 *    with a note instead of snapping it to whatever the parser salvaged.
 *  - `borderWidth` has a 16-char save cap; a composed value past it is NOT
 *    emitted — the control warns instead (a doomed patch is silently dropped
 *    by save-side validation, the worst failure mode this panel knows).
 */

import { useState } from "react";
import { CHROME } from "../../kit/tokens";
import { NumberUnit, type LengthValue } from "../../kit/number-unit";
import { useInspectorT } from "../kit/use-inspector-t";
import { parseCssLength } from "./length-utils";
import {
  composeBorderSideWidths,
  composeCornerRadius,
  parseBorderSideWidths,
  parseCornerRadius,
  type BorderSideWidths,
  type CornerRadiusParts,
} from "./visual-effect-models";

const CORNER_KEYS = [
  ["topLeft", "TL"],
  ["topRight", "TR"],
  ["bottomLeft", "BL"],
  ["bottomRight", "BR"],
] as const;

const SIDE_KEYS = [
  ["top", "T"],
  ["right", "R"],
  ["bottom", "B"],
  ["left", "L"],
] as const;

function formatLengthValue(v: LengthValue | null): string {
  if (!v) return "0";
  return v.value === 0 ? "0" : `${v.value}${v.unit}`;
}

function LinkToggle({
  linked,
  dataAttr,
  onToggle,
  label,
}: {
  linked: boolean;
  dataAttr: string;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      {...{ [dataAttr]: linked ? "linked" : "unlinked" }}
      className="cursor-pointer rounded text-[10px] font-semibold"
      style={{
        height: 20,
        padding: "0 7px",
        background: linked ? CHROME.ink : CHROME.surface2,
        color: linked ? "#fff" : CHROME.ink,
        border: `1px solid ${linked ? CHROME.ink : CHROME.controlBorder}`,
        outline: "none",
      }}
      aria-pressed={linked}
      onClick={onToggle}
    >
      {label}
    </button>
  );
}

// ── Per-corner border radius ────────────────────────────────────────────────

export function CornerRadiusField({
  value,
  onChange,
}: {
  /** The stored borderRadius string for the active tier. */
  value: string | undefined;
  onChange: (next: string | undefined) => void;
}) {
  const { t } = useInspectorT();
  const [open, setOpen] = useState(false);
  const [linked, setLinked] = useState(true);
  const parsed = parseCornerRadius(value);
  const isForeign = Boolean(value && value.trim()) && parsed === null;
  const corners: CornerRadiusParts =
    parsed ?? { topLeft: "0", topRight: "0", bottomRight: "0", bottomLeft: "0" };

  function setCorner(key: keyof CornerRadiusParts, next: LengthValue | null) {
    const term = formatLengthValue(next);
    const nextCorners = linked
      ? { topLeft: term, topRight: term, bottomRight: term, bottomLeft: term }
      : { ...corners, [key]: term };
    const composed = composeCornerRadius(nextCorners);
    onChange(composed === "0" ? undefined : composed);
  }

  return (
    <div className="flex flex-col gap-1.5" data-builder-corner-radius="">
      <div className="flex items-center justify-between">
        <button
          type="button"
          data-builder-corner-radius-toggle=""
          className="cursor-pointer text-[10px] font-semibold"
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            color: CHROME.muted,
            outline: "none",
          }}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {t("Each corner")} {open ? "▾" : "›"}
        </button>
        {open && !isForeign ? (
          <LinkToggle
            linked={linked}
            dataAttr="data-builder-corner-radius-link"
            onToggle={() => setLinked((v) => !v)}
            label={linked ? t("Linked") : t("Per corner")}
          />
        ) : null}
      </div>
      {open ? (
        isForeign ? (
          <span
            className="text-[10px] leading-tight"
            data-builder-corner-radius-foreign=""
            style={{ color: CHROME.muted }}
          >
            {t("Custom radius, kept exactly as written:")} {value}
          </span>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {CORNER_KEYS.map(([key, short]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span
                  className="w-5 shrink-0 text-[10px] font-semibold"
                  style={{ color: CHROME.muted }}
                >
                  {short}
                </span>
                <div data-builder-corner-input={key} style={{ flex: 1, minWidth: 0 }}>
                  <NumberUnit
                    units={["px", "rem", "%"]}
                    defaultUnit="px"
                    min={0}
                    showButtons={false}
                    placeholder="0"
                    value={parseCssLength(corners[key])}
                    onChange={(next) => setCorner(key, next)}
                  />
                </div>
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

// ── Per-side border width ───────────────────────────────────────────────────

export function BorderSidesField({
  value,
  onChange,
}: {
  /** The stored borderWidth string for the active tier. */
  value: string | undefined;
  onChange: (next: string | undefined) => void;
}) {
  const { t } = useInspectorT();
  const [open, setOpen] = useState(false);
  const [linked, setLinked] = useState(false);
  const [overCap, setOverCap] = useState(false);
  const parsed = parseBorderSideWidths(value);
  const isForeign = Boolean(value && value.trim()) && parsed === null;
  const sides: BorderSideWidths = parsed ?? { top: 0, right: 0, bottom: 0, left: 0 };

  function setSide(key: keyof BorderSideWidths, raw: string) {
    const n = Math.max(0, Math.round(Number(raw) || 0));
    const nextSides = linked
      ? { top: n, right: n, bottom: n, left: n }
      : { ...sides, [key]: n };
    const composed = composeBorderSideWidths(nextSides);
    if (composed === null) {
      setOverCap(true);
      return;
    }
    setOverCap(false);
    onChange(composed === "0" ? undefined : composed);
  }

  return (
    <div className="flex flex-col gap-1.5" data-builder-border-sides="">
      <div className="flex items-center justify-between">
        <button
          type="button"
          data-builder-border-sides-toggle=""
          className="cursor-pointer text-[10px] font-semibold"
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            color: CHROME.muted,
            outline: "none",
          }}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {t("Each side")} {open ? "▾" : "›"}
        </button>
        {open && !isForeign ? (
          <LinkToggle
            linked={linked}
            dataAttr="data-builder-border-sides-link"
            onToggle={() => setLinked((v) => !v)}
            label={linked ? t("Linked") : t("Per side")}
          />
        ) : null}
      </div>
      {open ? (
        isForeign ? (
          <span
            className="text-[10px] leading-tight"
            data-builder-border-sides-foreign=""
            style={{ color: CHROME.muted }}
          >
            {t("Custom border width, kept exactly as written:")} {value}
          </span>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-1.5">
              {SIDE_KEYS.map(([key, short]) => (
                <div key={key} className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-semibold" style={{ color: CHROME.muted }}>
                    {short}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    data-builder-border-side={key}
                    style={{
                      height: 28,
                      width: "100%",
                      fontSize: 12,
                      textAlign: "center",
                      background: CHROME.surface2,
                      border: `1px solid ${CHROME.controlBorder}`,
                      borderRadius: 7,
                      color: CHROME.ink,
                      outline: "none",
                    }}
                    value={sides[key]}
                    onChange={(e) => setSide(key, e.target.value)}
                  />
                </div>
              ))}
            </div>
            {overCap ? (
              <span
                className="text-[10px] leading-tight"
                data-builder-border-sides-overcap=""
                style={{ color: CHROME.rose }}
              >
                {t("That combination is too long to save. Use smaller widths.")}
              </span>
            ) : null}
          </>
        )
      ) : null}
    </div>
  );
}
