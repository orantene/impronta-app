"use client";

/**
 * GuestJourneyProgress — front-door brief rail under the dock header.
 *
 * Four (or N) segment ticks + a plain-language next-fact label, matching
 * `docs/design/front-door-brief.html` `.segs` / `#railLabel`. Pure chrome:
 * the parent owns the step list and label; this never invents progress.
 */

import type { Translator } from "@/i18n/interpolate";

import { FONT, type Palette } from "./mini-chat-styles";

export type JourneySeg = {
  readonly id: string;
  readonly on: boolean;
  readonly label: string;
};

export type GuestJourneyProgressProps = {
  segs: readonly JourneySeg[];
  railLabel: string;
  accent: string;
  C: Palette;
  t: Translator;
  /** Opens the details sheet (same job as the brief rail click). */
  onOpenDetails?: (() => void) | null;
};

export function GuestJourneyProgress({
  segs,
  railLabel,
  accent,
  C,
  t,
  onOpenDetails = null,
}: GuestJourneyProgressProps) {
  if (segs.length === 0) return null;

  const body = (
    <>
      <div
        className="guest-journey-segs"
        aria-hidden
        style={{ display: "flex", gap: 4, flex: 1, minWidth: 0 }}
      >
        {segs.map((seg) => (
          <i
            key={seg.id}
            title={seg.label}
            style={{
              display: "block",
              height: 4,
              flex: 1,
              borderRadius: 99,
              background: seg.on ? accent : C.surfaceCool,
            }}
          />
        ))}
      </div>
      <small
        style={{
          color: C.inkMuted,
          fontSize: 12,
          whiteSpace: "nowrap",
          fontFamily: FONT,
          fontWeight: 500,
        }}
      >
        {railLabel}
      </small>
    </>
  );

  const wrapStyle = {
    margin: "8px 16px 4px",
    padding: 0,
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "transparent",
    border: "none",
    width: "calc(100% - 32px)",
    boxSizing: "border-box",
    flexShrink: 0,
  } as const;

  if (onOpenDetails) {
    return (
      <button
        type="button"
        onClick={onOpenDetails}
        aria-label={t("public.guestChat.detailsHeaderAria")}
        style={{ ...wrapStyle, cursor: "pointer", textAlign: "left" }}
      >
        {body}
      </button>
    );
  }

  return (
    <div role="status" aria-label={railLabel} style={wrapStyle}>
      {body}
    </div>
  );
}
