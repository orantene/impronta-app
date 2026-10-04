"use client";

/**
 * Lab Exit — topbar exit for the `"lab"` header variant.
 *
 * Extracted from `topbar.tsx` (size ratchet). Calls a JS callback instead of
 * the storefront exit form. Always awaits `flushBuilderTreeSave` before
 * `onExit` — talent Exit hard-navs away, and the 750ms autosave window has no
 * keepalive fallback for the talent-page adapter (same contract as
 * TalentBackLink / ExitForm).
 */

import { useRef } from "react";

import { CHROME } from "./kit/tokens";
import { useMaybeEditContext } from "./edit-context";
import { useEditorLocale } from "./use-editor-locale";
import { TB_ICON_PX } from "./topbar-icon-button";

const TB_CONTROL_H = 40;
const TB_FONT_PX = 14;

export function LabExitButton({
  onExit,
  exitLabel,
}: {
  onExit?: () => void;
  exitLabel?: string;
}) {
  const editCtx = useMaybeEditContext();
  const { t } = useEditorLocale();
  // Default "Exit" goes through editor i18n ("Salir" in es). Callers that pass
  // a custom label (lab/theme surfaces) keep it verbatim — those strings are
  // already localized at the call site.
  const label = exitLabel && exitLabel !== "Exit" ? exitLabel : t("Exit");
  const exitingRef = useRef(false);
  const handleClick = () => {
    if (!onExit || exitingRef.current) return;
    const go = () => {
      exitingRef.current = false;
      onExit();
    };
    if (!editCtx) {
      go();
      return;
    }
    exitingRef.current = true;
    void editCtx.flushBuilderTreeSave().catch(() => undefined).finally(go);
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      title={label}
      className="inline-flex shrink-0 cursor-pointer items-center gap-[8px] rounded-[10px] border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/45 disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        height: TB_CONTROL_H,
        padding: "0 12px",
        fontSize: TB_FONT_PX,
        fontWeight: 500,
        letterSpacing: "-0.005em",
        color: CHROME.text,
        background: "transparent",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = CHROME.paper2;
        e.currentTarget.style.color = CHROME.ink;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = CHROME.text;
      }}
    >
      <svg
        width={TB_ICON_PX}
        height={TB_ICON_PX}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </svg>
      {label}
    </button>
  );
}
