"use client";

/**
 * SaveChip — colour-coded status pill used in drawer headers and the
 * top-bar status indicator.
 *
 * Five states map to the editor's autosave / publish lifecycle:
 *   - "saved"     green · last save committed
 *   - "saving"    blue + pulsing dot · save in flight
 *   - "dirty"     amber · unsaved changes
 *   - "error"     rose · last save failed
 *   - "count"     violet · neutral count badge ("3 selected", "Mobile draft")
 *
 * Visual rules from mockup `.savechip`:
 *   - 999px radius, 1px border, 10.5px font, weight 700
 *   - tiny 5×5 status dot to the left
 *   - "saving" dot has a 1.4s pulse animation
 *
 * The pulse keyframes live here as a `<style>` block so the chip stays
 * portable — no global CSS dependency.
 */

import type { ReactNode } from "react";

import { CHROME } from "./tokens";

export type SaveChipStatus = "saved" | "saving" | "dirty" | "error" | "count";

interface SaveChipProps {
  status: SaveChipStatus;
  /** Override the default label per status. */
  label?: ReactNode;
  /** Optional title attribute for tooltip. */
  title?: string;
  className?: string;
}

const PULSE_ID = "save-chip-pulse";

export function SaveChip({ status, label, title, className }: SaveChipProps) {
  const palette = paletteForStatus(status);
  const text = label ?? defaultLabel(status);
  return (
    <>
      {/* Inject the pulse keyframes once. Idempotent — multiple chips on
          the same page just render multiple <style> tags with the same id. */}
      <style id={PULSE_ID}>{KEYFRAMES}</style>
      <span
        className={`inline-flex items-center gap-1.5 ${className ?? ""}`}
        title={title}
        style={{
          background: palette.bg,
          color: palette.fg,
          border: `1px solid ${palette.line}`,
          borderRadius: 999,
          padding: "3px 9px 3px 7px",
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: "-0.005em",
          whiteSpace: "nowrap",
        }}
      >
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: palette.fg,
            animation: status === "saving" ? `${PULSE_ID} 1.4s ease-in-out infinite` : undefined,
          }}
        />
        {text}
      </span>
    </>
  );
}

function defaultLabel(status: SaveChipStatus): string {
  switch (status) {
    case "saved":
      return "Saved";
    case "saving":
      return "Saving";
    case "dirty":
      return "Unsaved";
    case "error":
      return "Save failed";
    case "count":
      return "—";
  }
}

function paletteForStatus(status: SaveChipStatus): {
  bg: string;
  fg: string;
  line: string;
} {
  switch (status) {
    case "saved":
      return { bg: CHROME.greenBg, fg: CHROME.green, line: CHROME.greenLine };
    case "saving":
      return { bg: CHROME.blueBg, fg: CHROME.blue, line: CHROME.blueLine };
    case "dirty":
      return { bg: CHROME.amberBg, fg: CHROME.amber, line: CHROME.amberLine };
    case "error":
      return { bg: CHROME.roseBg, fg: CHROME.rose, line: CHROME.roseLine };
    case "count":
      return { bg: CHROME.violetBg, fg: CHROME.violet, line: CHROME.violetLine };
  }
}

const KEYFRAMES = `
@keyframes ${PULSE_ID} {
  0%, 100% { opacity: 0.5; transform: scale(0.9); }
  50%      { opacity: 1;   transform: scale(1.1); }
}
`;
