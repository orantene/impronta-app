"use client";

/**
 * Phone-only "more" menu for the builder top bar. Under 640px the secondary
 * controls (undo, redo, revisions, comments, preview) leave the bar so the
 * account chip, ES/EN toggle and Publish never overlap; they live here.
 */
import { useEffect, useState } from "react";
import type { ReactElement } from "react";

import { CHROME, PortaledOverlay } from "./kit";
import { useEditorLocale } from "./use-editor-locale";

export interface TopbarOverflowItem {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}

export function TopbarOverflowMenu({ items }: { items: TopbarOverflowItem[] }): ReactElement {
  const { t } = useEditorLocale();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <span className="hidden shrink-0 max-[640px]:inline-flex" data-topbar-overflow>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("More actions")}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[10px] border-none bg-transparent"
        style={{ color: CHROME.text, cursor: "pointer", fontSize: 20, lineHeight: 1 }}
      >
        <span aria-hidden>⋯</span>
      </button>
      {open ? (
        <PortaledOverlay>
          <div className="fixed inset-0 z-[205]" onClick={() => setOpen(false)} data-topbar-overflow-scrim>
            <div
              role="menu"
              onClick={(e) => e.stopPropagation()}
              className="absolute right-3 top-[60px] flex min-w-[220px] flex-col rounded-[12px] p-1.5 shadow-lg"
              style={{ background: CHROME.surface, border: `1px solid ${CHROME.line}` }}
            >
              {items.map((it) => (
                <button
                  key={it.label}
                  type="button"
                  role="menuitem"
                  disabled={it.disabled}
                  onClick={() => {
                    setOpen(false);
                    it.onClick?.();
                  }}
                  className="min-h-11 rounded-[8px] border-none bg-transparent px-3 text-left disabled:opacity-40"
                  style={{ color: CHROME.ink, fontSize: 14, cursor: it.disabled ? "default" : "pointer" }}
                >
                  {it.label}
                </button>
              ))}
            </div>
          </div>
        </PortaledOverlay>
      ) : null}
    </span>
  );
}
