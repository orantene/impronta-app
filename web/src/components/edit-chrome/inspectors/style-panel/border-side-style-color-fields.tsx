"use client";

/**
 * Per-side border STYLE and COLOR. Width already has Each-side controls that
 * write the CSS shorthand; these two do the same for `borderStyle` and
 * `borderColor` so a card can carry a dashed top rule in a different color
 * without customCss.
 *
 * Honesty: a value the grammar cannot own stands the controls down and shows
 * the stored string verbatim (no silent snap). A composed value past the
 * save-side zod cap is not emitted.
 */

import { useState } from "react";

import { CHROME } from "../../kit/tokens";
import { ColorSwatchButton } from "../color-swatch-button";
import { useInspectorT } from "../kit/use-inspector-t";
import {
  BUILDER_BORDER_STYLE_KEYWORDS,
  composeBorderSideColors,
  composeBorderSideStyles,
  parseBorderSideColors,
  parseBorderSideStyles,
  type BorderSideColors,
  type BorderSideStyles,
  type BuilderBorderStyleKeyword,
} from "@/lib/site-admin/builder-node/border-shorthand";

const SIDE_KEYS = [
  ["top", "T"],
  ["right", "R"],
  ["bottom", "B"],
  ["left", "L"],
] as const;

const STYLE_CHOICES: ReadonlyArray<BuilderBorderStyleKeyword> = [
  "none",
  "solid",
  "dashed",
  "dotted",
  "double",
];

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

function SideHeader({
  title,
  open,
  onToggle,
  linked,
  onLink,
  showLink,
  dataToggle,
  dataLink,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  linked: boolean;
  onLink: () => void;
  showLink: boolean;
  dataToggle: string;
  dataLink: string;
}) {
  const { t } = useInspectorT();
  return (
    <div className="flex items-center justify-between">
      <button
        type="button"
        {...{ [dataToggle]: "" }}
        className="cursor-pointer text-[10px] font-semibold"
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          color: CHROME.muted,
          outline: "none",
        }}
        aria-expanded={open}
        onClick={onToggle}
      >
        {title} {open ? "▾" : "›"}
      </button>
      {open && showLink ? (
        <LinkToggle
          linked={linked}
          dataAttr={dataLink}
          onToggle={onLink}
          label={linked ? t("Linked") : t("Per side")}
        />
      ) : null}
    </div>
  );
}

export function BorderStyleSidesField({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (next: string | undefined) => void;
}) {
  const { t } = useInspectorT();
  const [open, setOpen] = useState(false);
  const [linked, setLinked] = useState(false);
  const parsed = parseBorderSideStyles(value);
  const isForeign = Boolean(value && value.trim()) && parsed === null;
  const sides: BorderSideStyles =
    parsed ?? { top: "solid", right: "solid", bottom: "solid", left: "solid" };

  function setSide(key: keyof BorderSideStyles, next: BuilderBorderStyleKeyword) {
    const nextSides = linked
      ? { top: next, right: next, bottom: next, left: next }
      : { ...sides, [key]: next };
    const composed = composeBorderSideStyles(nextSides);
    if (composed === null) return;
    onChange(composed);
  }

  return (
    <div className="flex flex-col gap-1.5" data-builder-border-style-sides="">
      <SideHeader
        title={t("Each side style")}
        open={open}
        onToggle={() => setOpen((v) => !v)}
        linked={linked}
        onLink={() => setLinked((v) => !v)}
        showLink={!isForeign}
        dataToggle="data-builder-border-style-sides-toggle"
        dataLink="data-builder-border-style-sides-link"
      />
      {open ? (
        isForeign ? (
          <span
            className="text-[10px] leading-tight"
            data-builder-border-style-sides-foreign=""
            style={{ color: CHROME.muted }}
          >
            {t("Custom border style, kept exactly as written:")} {value}
          </span>
        ) : (
          <div className="grid grid-cols-4 gap-1.5">
            {SIDE_KEYS.map(([key, short]) => (
              <label key={key} className="flex flex-col items-center gap-1">
                <span className="text-[10px] font-semibold" style={{ color: CHROME.muted }}>
                  {short}
                </span>
                <select
                  data-builder-border-style-side={key}
                  value={sides[key]}
                  onChange={(e) =>
                    setSide(key, e.target.value as BuilderBorderStyleKeyword)
                  }
                  style={{
                    height: 28,
                    width: "100%",
                    fontSize: 11,
                    textAlign: "center",
                    background: CHROME.surface2,
                    border: `1px solid ${CHROME.controlBorder}`,
                    borderRadius: 7,
                    color: CHROME.ink,
                    outline: "none",
                  }}
                >
                  {STYLE_CHOICES.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                  {!STYLE_CHOICES.includes(sides[key]) &&
                  (BUILDER_BORDER_STYLE_KEYWORDS as readonly string[]).includes(
                    sides[key],
                  ) ? (
                    <option value={sides[key]}>{sides[key]}</option>
                  ) : null}
                </select>
              </label>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

export function BorderColorSidesField({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (next: string | undefined) => void;
}) {
  const { t } = useInspectorT();
  const [open, setOpen] = useState(false);
  const [linked, setLinked] = useState(false);
  const [overCap, setOverCap] = useState(false);
  const parsed = parseBorderSideColors(value);
  const isForeign = Boolean(value && value.trim()) && parsed === null;
  const sides: BorderSideColors =
    parsed ?? { top: "#111111", right: "#111111", bottom: "#111111", left: "#111111" };

  function setSide(key: keyof BorderSideColors, raw: string) {
    const term = raw.trim() || "#111111";
    const nextSides = linked
      ? { top: term, right: term, bottom: term, left: term }
      : { ...sides, [key]: term };
    const composed = composeBorderSideColors(nextSides);
    if (composed === null) {
      setOverCap(true);
      return;
    }
    setOverCap(false);
    onChange(composed);
  }

  return (
    <div className="flex flex-col gap-1.5" data-builder-border-color-sides="">
      <SideHeader
        title={t("Each side color")}
        open={open}
        onToggle={() => setOpen((v) => !v)}
        linked={linked}
        onLink={() => setLinked((v) => !v)}
        showLink={!isForeign}
        dataToggle="data-builder-border-color-sides-toggle"
        dataLink="data-builder-border-color-sides-link"
      />
      {open ? (
        isForeign ? (
          <span
            className="text-[10px] leading-tight"
            data-builder-border-color-sides-foreign=""
            style={{ color: CHROME.muted }}
          >
            {t("Custom border color, kept exactly as written:")} {value}
          </span>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-1.5">
              {SIDE_KEYS.map(([key, short]) => (
                <label key={key} className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-semibold" style={{ color: CHROME.muted }}>
                    {short}
                  </span>
                  {/* builder-2027 1I — ONE colour surface. Was an OS
                      `<input type="color">`; per-side border colours are a
                      compare-as-you-go gesture, and the OS picker covers the
                      canvas you are comparing against. */}
                  <ColorSwatchButton
                    color={
                      /^#[0-9a-fA-F]{6}$/.test(sides[key]) ? sides[key] : "#111111"
                    }
                    dataAttr={["data-builder-border-color-side", key]}
                    onChange={(next) => setSide(key, next)}
                    ariaLabel={`${short} border color`}
                  />
                </label>
              ))}
            </div>
            {overCap ? (
              <span
                className="text-[10px] leading-tight"
                data-builder-border-color-sides-overcap=""
                style={{ color: CHROME.rose }}
              >
                {t("That combination is too long to save. Use simpler colors.")}
              </span>
            ) : null}
          </>
        )
      ) : null}
    </div>
  );
}
