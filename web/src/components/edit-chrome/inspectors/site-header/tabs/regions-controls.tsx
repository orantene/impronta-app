"use client";

/**
 * WF-6 — the small shared controls of the header Arrange tab.
 *
 * Extracted from `RegionsTab.tsx` rather than left inline: the tab plus its
 * zone list, its row settings and these primitives came to roughly 1,070
 * lines, past the repo's 800-line `max-lines` cap. Splitting on the seams the
 * file already had (vocabulary / zones / row settings / controls) keeps each
 * module reviewable in one screen instead of buying a suppression.
 */

import { useState } from "react";

import { CHROME } from "../../../kit";
import { useEditorLocale } from "../../../use-editor-locale";

export function TextRow({
  label,
  hint,
  value,
  maxLength,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  maxLength: number;
  onChange: (next: string) => void;
}) {
  const { t } = useEditorLocale();
  const [draft, setDraft] = useState(value);
  return (
    <label className="flex flex-col gap-1">
      <span
        className="text-[11.5px] font-semibold"
        style={{ color: CHROME.text }}
      >
        {t(label)}
      </span>
      <input
        type="text"
        value={draft}
        maxLength={maxLength}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim() !== value) onChange(draft.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(value);
            e.currentTarget.blur();
          }
        }}
        className="w-full rounded-md px-2 py-1 text-[12px]"
        style={{
          background: CHROME.surface,
          border: `1px solid ${CHROME.lineStrong}`,
          color: CHROME.text,
        }}
      />
      <span className="text-[10.5px] leading-snug" style={{ color: CHROME.muted }}>
        {t(hint)}
      </span>
    </label>
  );
}

export function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-6 shrink-0 items-center justify-center rounded transition-colors duration-150 hover:bg-white disabled:pointer-events-none disabled:opacity-30"
      style={{ color: CHROME.muted }}
    >
      {children}
    </button>
  );
}

export function DragGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="9" cy="5" r="2" />
      <circle cx="15" cy="5" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="9" cy="19" r="2" />
      <circle cx="15" cy="19" r="2" />
    </svg>
  );
}

export function ChevronGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function ArrowGlyph({ up }: { up?: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={up ? { transform: "rotate(180deg)" } : undefined}
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="6 13 12 19 18 13" />
    </svg>
  );
}

export function CloseGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden
    >
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}