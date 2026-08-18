"use client";

/**
 * ShortcutOverlay — keyboard reference modal (Phase 10).
 *
 * Implements builder-experience.html surface §26 (Keyboard shortcuts
 * overlay). Last reconciled: 2026-05.
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
 * Opening a right-rail drawer clears centred modals (`dismissCompetingEditorChrome`),
 * including this overlay — operators can hit `?` again while a drawer stays open.
 */

import { useEffect } from "react";

import {
  filterVisibleShortcuts,
  SHORTCUTS,
  SHORTCUT_CATEGORY_LABELS,
  type ShortcutCategory,
} from "./kit/shortcuts";
import { KbdSequence } from "./kit/kbd";
import { CHROME, CHROME_RADII, CHROME_SHADOWS } from "./kit/tokens";
import { useEditContext } from "./edit-context";
import { useEditorLocale } from "./use-editor-locale";
import { useModalFocusTrap } from "./modal-focus-trap";
import { useAdvancedMode } from "./advanced-mode";

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
  const { t } = useEditorLocale();
  const { canEditSiteShell, pageSlug } = useEditContext();
  const { advanced, toggle: toggleAdvanced } = useAdvancedMode();
  const dialogRef = useModalFocusTrap(open, onClose);
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
  const visibleShortcuts = filterVisibleShortcuts(SHORTCUTS, {
    canEditSiteShell,
    homepageEditing: !pageSlug,
  });
  for (const s of visibleShortcuts) {
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
        ref={dialogRef}
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
              {t("Keyboard shortcuts")}
            </h2>
            <p
              style={{
                margin: "2px 0 0",
                fontSize: 12,
                color: CHROME.muted,
              }}
            >
              {t("Every keybind in the editor, in one place.")}
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
          {/* W2-C4 — the single home for the Advanced toggle. Default (OFF) keeps
              the editor minimal: Layout · Content · Style tabs, Desktop · Tablet
              · Mobile viewports, no reusable style presets / linked classes.
              Turning it ON returns Data + Motion tabs, Wide + Compact + custom
              viewport widths, and the advanced style controls. Nothing is ever
              removed from the data model — only the editing surface changes. */}
          <section>
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
              Editor mode
            </h3>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "12px 14px",
                background: CHROME.surface,
                border: `1px solid ${CHROME.line}`,
                borderRadius: CHROME_RADII.md,
              }}
            >
              <div className="min-w-0">
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: CHROME.ink,
                    lineHeight: 1.3,
                  }}
                >
                  Advanced tools
                </div>
                <div
                  style={{
                    marginTop: 2,
                    fontSize: 11.5,
                    color: CHROME.muted,
                    lineHeight: 1.35,
                  }}
                >
                  {advanced
                    ? "Data + Motion tabs, Wide / Compact / custom viewports, and reusable style presets & linked classes are shown."
                    : "Off keeps the editor minimal. Turn on for Data + Motion tabs, extra screen sizes, and advanced style controls."}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={advanced}
                aria-label="Advanced tools"
                onClick={toggleAdvanced}
                title="Show power-user tools (Data + Motion tabs, extra viewports, style presets & classes)"
                style={{
                  position: "relative",
                  flexShrink: 0,
                  width: 42,
                  height: 24,
                  borderRadius: 999,
                  border: `1px solid ${advanced ? CHROME.accent : CHROME.line}`,
                  background: advanced ? CHROME.accent : CHROME.surface2,
                  cursor: "pointer",
                  transition: "background 120ms ease, border-color 120ms ease",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: 2,
                    left: advanced ? 20 : 2,
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    background: "#fff",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
                    transition: "left 120ms ease",
                  }}
                />
              </button>
            </div>
          </section>
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
                  {t(SHORTCUT_CATEGORY_LABELS[cat])}
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
                      <div className="min-w-0">
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: CHROME.ink,
                            lineHeight: 1.3,
                          }}
                        >
                          {t(s.label)}
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
                            {t(s.description)}
                          </div>
                        ) : null}
                      </div>
                      {s.keys.length > 0 ? (
                        <KbdSequence keys={s.keys} />
                      ) : (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            color: CHROME.muted,
                            whiteSpace: "nowrap",
                          }}
                          title="Run from the command palette"
                        >
                          ⌘K
                        </span>
                      )}
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
