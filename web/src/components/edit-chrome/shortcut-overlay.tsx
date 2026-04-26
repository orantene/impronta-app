"use client";

/**
 * ShortcutOverlay — keyboard reference modal (Phase 10).
 *
 * Implements builder-experience.html surface §26 (Keyboard shortcuts
 * overlay). Last reconciled: 2026-04-25.
 *
 * Toggled by the `?` global keybind (or via the command palette /
 * topbar Help affordance). Reads from the centralised `SHORTCUTS`
 * registry in `kit/shortcuts.ts` so chips never drift between the
 * palette result rows and this reference list — adding or moving a
 * keybind happens in exactly one place.
 *
 * Behaviour:
 *   - Centred modal, paper-tinted card on a translucent ink scrim.
 *   - Backdrop click + Escape both dismiss. The Escape branch in
 *     `edit-shell.tsx` defers to the overlay before its drawer-close
 *     pass so closing this doesn't accidentally also dismiss a drawer.
 *   - Renders one section per `ShortcutCategory` with a heading and a
 *     keybind table; sections with no entries are hidden.
 *   - Footer prints the `⌘` / `Ctrl` mapping note once instead of
 *     dual-printing the modifier glyph throughout.
 *
 * Like the command palette, the overlay is a true modal — it doesn't
 * mutex with the right-side drawers, so an operator can peek at
 * "what was the keybind for X" mid-drawer without losing context.
 */

import { useEffect } from "react";

import {
  SHORTCUTS,
  SHORTCUT_CATEGORY_LABELS,
  type ShortcutCategory,
} from "./kit/shortcuts";
import { KbdSequence } from "./kit/kbd";
import { CHROME, CHROME_RADII, CHROME_SHADOWS } from "./kit/tokens";

interface ShortcutOverlayProps {
  open: boolean;
  onClose: () => void;
}

const CATEGORY_ORDER: ReadonlyArray<ShortcutCategory> = [
  "search",
  "navigation",
  "drawers",
  "editing",
  "history",
  "selection",
];

export function ShortcutOverlay({ open, onClose }: ShortcutOverlayProps) {
  // Escape close lives both here (when focus is within the overlay) and
  // in edit-shell.tsx (so background focus still dismisses). Two layers
  // of safety net so a stray click anywhere can't strand the modal.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Bucket once per render so empty categories drop out gracefully.
  const buckets: Record<ShortcutCategory, typeof SHORTCUTS> = {
    search: [],
    navigation: [],
    drawers: [],
    editing: [],
    history: [],
    selection: [],
  };
  for (const s of SHORTCUTS) {
    buckets[s.category] = [...buckets[s.category], s];
  }

  return (
    <div
      data-edit-overlay="shortcut-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcut-overlay-title"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 130,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "rgba(11, 11, 13, 0.42)",
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 100%)",
          maxHeight: "calc(100vh - 96px)",
          overflowY: "auto",
          background: CHROME.paper,
          border: `1px solid ${CHROME.lineMid}`,
          borderRadius: CHROME_RADII.lg,
          boxShadow: CHROME_SHADOWS.popover,
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: `1px solid ${CHROME.line}`,
          }}
        >
          <div>
            <h2
              id="shortcut-overlay-title"
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 600,
                color: CHROME.ink,
                letterSpacing: "-0.005em",
              }}
            >
              Keyboard shortcuts
            </h2>
            <p
              style={{
                margin: "2px 0 0",
                fontSize: 12,
                color: CHROME.muted,
              }}
            >
              Every keybind in the editor, in one place.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
            title="Close (Esc)"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              border: `1px solid ${CHROME.line}`,
              borderRadius: CHROME_RADII.sm,
              background: CHROME.surface,
              color: CHROME.muted,
              cursor: "pointer",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div style={{ padding: 20, display: "grid", gap: 20 }}>
          {CATEGORY_ORDER.map((cat) => {
            const entries = buckets[cat];
            if (entries.length === 0) return null;
            return (
              <section key={cat}>
                <h3
                  style={{
                    margin: "0 0 8px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: CHROME.muted,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {SHORTCUT_CATEGORY_LABELS[cat]}
                </h3>
                <ul
                  style={{
                    margin: 0,
                    padding: 0,
                    listStyle: "none",
                    background: CHROME.surface,
                    border: `1px solid ${CHROME.line}`,
                    borderRadius: CHROME_RADII.md,
                    overflow: "hidden",
                  }}
                >
                  {entries.map((s, i) => (
                    <li
                      key={s.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "10px 12px",
                        borderTop:
                          i === 0 ? "none" : `1px solid ${CHROME.line}`,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: CHROME.ink,
                            lineHeight: 1.3,
                          }}
                        >
                          {s.label}
                        </div>
                        {s.description ? (
                          <div
                            style={{
                              marginTop: 2,
                              fontSize: 11.5,
                              color: CHROME.muted,
                              lineHeight: 1.35,
                            }}
                          >
                            {s.description}
                          </div>
                        ) : null}
                      </div>
                      <KbdSequence keys={s.keys} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <footer
          style={{
            padding: "12px 20px",
            borderTop: `1px solid ${CHROME.line}`,
            fontSize: 11.5,
            color: CHROME.muted,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span>
            On Windows / Linux, <strong style={{ color: CHROME.text2 }}>⌘</strong>{" "}
            maps to{" "}
            <strong style={{ color: CHROME.text2 }}>Ctrl</strong>.
          </span>
          <span>
            Press <KbdSequence keys={["Esc"]} /> to close.
          </span>
        </footer>
      </div>
    </div>
  );
}
