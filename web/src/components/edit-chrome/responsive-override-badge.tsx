"use client";

/**
 * The selection chip's per-device override badge.
 *
 * Per-breakpoint values are the one kind of state in the builder that is
 * genuinely invisible: the phone canvas shows the phone value, the desktop
 * canvas shows the desktop value, and nothing on either screen says the two
 * have parted company. Six months later someone edits desktop, the phone does
 * not follow, and the editor looks broken. That confusion is the actual cost
 * of shipping device-scoped drags, so the badge ships in the same commit.
 *
 * It answers two questions in the place the operator is already looking (the
 * selection chip, beside the block name):
 *
 *   1. "Where does my next drag land?" — the badge is present on every
 *      non-desktop canvas, quiet and grey, reading "Phone only" / "Tablet
 *      only". Nothing is overridden yet; the drag will create one.
 *   2. "What has already parted from desktop?" — once the block carries
 *      overrides the badge lights blue with a count, and its tooltip names
 *      every property. One click arms, a second click clears them back to
 *      INHERITING from desktop (not to a default — see
 *      `clearResponsiveOverrides`).
 *
 * Two-step arm/confirm rather than a one-click reset: this button can discard
 * real authoring work, and it sits a few pixels from the block name in a chip
 * the operator clicks constantly. Same idiom the Style panel's "Reset
 * {viewport}" already uses, so the gesture is not a new thing to learn.
 *
 * Extracted rather than inlined because `selection-layer.tsx` is under a
 * line-count ratchet with no headroom.
 */

import { useEffect, useState } from "react";

import { CHROME } from "./kit/tokens";
import {
  RESPONSIVE_BUCKET_LABEL,
  responsiveOverrideKeys,
  type ResponsiveStyleBucket,
} from "./responsive-canvas-style";
import { CANVAS_CHROME_RADIUS } from "./selection-layer-canvas-tokens";
import { useEditorLocale } from "./use-editor-locale";

/**
 * Plain-language names for the properties a canvas handle or the Style panel
 * can scope per device. Unlisted keys fall back to the raw key: a tooltip
 * reading `gridTemplateColumns` is worse than a translated one and far better
 * than a silently shorter list.
 */
const PROPERTY_LABEL: Record<string, string> = {
  aspectRatio: "Shape",
  backgroundImage: "Background image",
  bottom: "Position",
  fontSize: "Text size",
  gap: "Spacing between",
  height: "Height",
  left: "Position",
  lineHeight: "Line height",
  marginBottomFree: "Outer spacing",
  marginLeftFree: "Outer spacing",
  marginRightFree: "Outer spacing",
  marginTopFree: "Outer spacing",
  maxHeight: "Max height",
  maxWidth: "Max width",
  minHeight: "Min height",
  minWidth: "Min width",
  objectFit: "Image fill",
  objectPosition: "Image framing",
  paddingBottom: "Inner spacing",
  paddingLeft: "Inner spacing",
  paddingRight: "Inner spacing",
  paddingTop: "Inner spacing",
  position: "Position mode",
  rotate: "Rotation",
  top: "Position",
  translate: "Position",
  width: "Width",
};

function describeKeys(keys: readonly string[], t: (s: string) => string): string {
  const seen: string[] = [];
  for (const key of keys) {
    const label = t(PROPERTY_LABEL[key] ?? key);
    if (!seen.includes(label)) seen.push(label);
  }
  return seen.join(", ");
}

export function ResponsiveOverrideBadge({
  style,
  bucket,
  onReset,
}: {
  /** The selected node's `props.style` (or undefined). */
  readonly style: Record<string, unknown> | undefined;
  /** `null` on the desktop canvas — the badge renders nothing there. */
  readonly bucket: ResponsiveStyleBucket;
  /** Clear every override on `bucket`, back to inheriting from desktop. */
  readonly onReset: () => void;
}) {
  const { t } = useEditorLocale();
  const [armed, setArmed] = useState(false);
  const keys = responsiveOverrideKeys(style, bucket);
  const count = keys.length;

  // Disarm whenever the selection, the device, or the override set changes —
  // an armed "Reset" must never carry over onto a different block.
  useEffect(() => {
    setArmed(false);
  }, [bucket, count]);

  if (bucket == null) return null;
  const deviceLabel = t(RESPONSIVE_BUCKET_LABEL[bucket]);
  const active = count > 0;
  const label = active
    ? `${deviceLabel} ${count}`
    : t("{device} only").replace("{device}", deviceLabel);
  const title = active
    ? t(
        "{count} set for {device} only: {props}. Click twice to reset them back to the desktop values.",
      )
        .replace("{count}", String(count))
        .replace("{device}", deviceLabel)
        .replace("{props}", describeKeys(keys, t))
    : t(
        "Edits you make here apply to {device} only. Desktop keeps its own values.",
      ).replace("{device}", deviceLabel);

  return (
    <button
      type="button"
      data-responsive-override-badge={bucket}
      data-responsive-override-count={count}
      aria-label={title}
      title={title}
      disabled={!active}
      onClick={() => {
        if (!active) return;
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onReset();
      }}
      onBlur={() => setArmed(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: 18,
        padding: "0 7px",
        marginLeft: 2,
        border: "none",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
        cursor: active ? "pointer" : "default",
        borderRadius: CANVAS_CHROME_RADIUS,
        flexShrink: 0,
        color: armed ? CHROME.rose : active ? CHROME.blue : CHROME.muted,
        background: armed
          ? CHROME.roseBg
          : active
            ? CHROME.blueBg
            : "transparent",
        boxShadow: `inset 0 0 0 1px ${
          armed ? CHROME.roseLine : active ? CHROME.blueLine : CHROME.line
        }`,
      }}
    >
      {/* A phone outline: the badge has to read as "device-scoped" at 10px,
          and the word alone does not carry that at a glance. */}
      <svg
        width="8"
        height="11"
        viewBox="0 0 8 11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        aria-hidden
      >
        <rect x="0.6" y="0.6" width="6.8" height="9.8" rx="1.4" />
        <path d="M3 8.6h2" />
      </svg>
      {armed ? t("Reset?") : label}
    </button>
  );
}
