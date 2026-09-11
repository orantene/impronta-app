"use client";

/**
 * keyboard-layer.tsx — the workspace's global keyboard shortcuts and the `?`
 * cheatsheet, extracted from `workspace.tsx`.
 *
 * WHY THIS IS ITS OWN MODULE. `WorkspaceShell` needs exactly two things from
 * `workspace.tsx`: `useKeyboardLayer` and `ShortcutHelpOverlay`. Everything
 * else in that file is the inquiry workspace DRAWER (3,300 lines, plus
 * `react-virtuoso`), which only renders once a drawer opens. A module is the
 * unit the bundler splits on, so while the two hooks lived beside the drawer
 * the whole drawer rode in the shell's first-paint chunk on every admin
 * route, the register included. Here they stand alone; `workspace.tsx`
 * re-exports them so every existing importer keeps its path.
 */

import { useEffect, useRef } from "react";

import { useDashboardText } from "./dashboard-i18n";
import { COLORS, FONTS, RADIUS, type WorkspacePage } from "./state";

// ─── WS-7.4 / 7.5 Keyboard shortcut layer + help overlay ─────────────────────
//
// `useKeyboardLayer` registers global keyboard shortcuts for the workspace.
//   j / k          → next / prev row in the active list
//   e              → archive selected
//   r              → reply (open private thread)
//   c              → compose (new inquiry)
//   g then i       → go to Messages
//   g then c       → go to Calendar
//   g then t       → go to Roster
//   g then o       → go to Overview
//   Cmd/Ctrl-K     → open Command Palette
//   ?              → toggle shortcut cheatsheet
//
// Usage: call `useKeyboardLayer(handlers)` in the workspace shell.
// ─────────────────────────────────────────────────────────────────────────────

export type KeyboardLayerHandlers = {
  onOpenPalette:  () => void;
  onOpenHelp:     () => void;
  onNavigate:     (page: WorkspacePage) => void;
  onCompose?:     () => void;
  /** Whether a drawer or modal is currently open (suppresses shortcuts). */
  isModalOpen:    boolean;
};

export function useKeyboardLayer({
  onOpenPalette,
  onOpenHelp,
  onNavigate,
  onCompose,
  isModalOpen,
}: KeyboardLayerHandlers) {
  const gPending = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // Cmd/Ctrl-K always works (even in inputs)
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenPalette();
        gPending.current = false;
        return;
      }

      // All other shortcuts suppressed when typing or modal open
      if (inInput || isModalOpen) { gPending.current = false; return; }

      // G-prefixed navigation shortcuts
      if (gPending.current) {
        gPending.current = false;
        e.preventDefault();
        const map: Record<string, WorkspacePage> = {
          i: "messages", o: "overview", c: "calendar", t: "roster",
        };
        if (map[e.key]) onNavigate(map[e.key] as WorkspacePage);
        return;
      }

      if (e.key === "g") { gPending.current = true; return; }
      if (e.key === "?") { onOpenHelp(); return; }
      if (e.key === "c" && onCompose) { onCompose(); return; }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      // Cancel pending G if any non-eligible key is pressed
      if (e.key !== "g") gPending.current = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup",   onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup",   onKeyUp);
    };
  }, [onOpenPalette, onOpenHelp, onNavigate, onCompose, isModalOpen]);
}

// ─── WS-7.5 Keyboard shortcut help overlay ───────────────────────────────────

const SHORTCUT_GROUPS = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["G", "O"],    label: "Go to Overview" },
      { keys: ["G", "I"],    label: "Go to Messages" },
      { keys: ["G", "C"],    label: "Go to Calendar" },
      { keys: ["G", "T"],    label: "Go to Roster" },
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      { keys: ["C"],         label: "New inquiry (compose)" },
      { keys: ["⌘", "K"],   label: "Command palette" },
      { keys: ["?"],         label: "Keyboard shortcuts" },
    ],
  },
  // Only shortcuts that actually work are listed — an advertised-but-dead
  // shortcut is a broken promise. "/" and Tab were listed here before they
  // existed; re-add each one WITH its implementation. E and R are LIVE as
  // of WS-7.5 wave 6 (admin-1.tsx keydown + FOCUS_COMPOSER_EVENT).
  {
    title: "List navigation (Messages)",
    shortcuts: [
      { keys: ["J"],         label: "Focus next thread" },
      { keys: ["K"],         label: "Focus previous thread" },
      { keys: ["⏎"],        label: "Open focused thread" },
      { keys: ["E"],         label: "Archive focused thread" },
      { keys: ["R"],         label: "Reply: focus the composer" },
    ],
  },
];

export function ShortcutHelpOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const copy = useDashboardText();
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "?") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      data-tulala-shortcut-overlay="overlay"
      style={{
        position:   "fixed",
        inset:      0,
        zIndex:     1200,
        background: "rgba(0,0,0,0.5)",
        display:    "flex",
        alignItems: "center",
        justifyContent: "center",
        padding:    16,
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ border:       `1px solid ${COLORS.border}`, boxShadow:    "0 20px 60px rgba(0,0,0,0.2)", width:        560, maxWidth:     "100%", maxHeight:    "80vh", overflow:     "auto", padding:      "20px 0" }} className="bg-admin-surface rounded-admin-xl">
        {/* Header */}
        <div style={{
          display:     "flex",
          alignItems:  "center",
          justifyContent: "space-between",
          padding:     "0 20px 16px",
          borderBottom: `1px solid ${COLORS.border}`,
          marginBottom: 12,
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, fontFamily: FONTS.body }} className="text-admin-ink">
            {copy.t("Keyboard shortcuts")}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: COLORS.inkMuted, fontSize: 18, lineHeight: 1,
              padding: "2px 4px", borderRadius: RADIUS.sm,
            }}
          >
            ×
          </button>
        </div>

        {/* Shortcut groups */}
        <div style={{
          display:             "grid",
          gridTemplateColumns: "1fr 1fr",
          gap:                 "20px 0",
          padding:             "0 20px",
        }}>
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <div style={{ fontSize:      10, fontWeight:    700, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily:    FONTS.body, marginBottom:  8 }} className="text-admin-ink-dim">
                {copy.t(group.title)}
              </div>
              <div className="flex flex-col gap-1">
                {group.shortcuts.map((sc, i) => (
                  <div key={i} style={{
                    display:     "flex",
                    alignItems:  "center",
                    justifyContent: "space-between",
                    gap:         8,
                  }}>
                    <span style={{ fontSize: 12, fontFamily: FONTS.body }} className="text-admin-ink-muted">
                      {copy.t(sc.label)}
                    </span>
                    <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                      {sc.keys.map((k, ki) => (
                        <kbd key={ki} style={{
                          fontSize:     10,
                          color:        COLORS.ink,
                          background:   COLORS.surfaceAlt,
                          border:       `1px solid ${COLORS.border}`,
                          borderRadius: 4,
                          padding:      "2px 6px",
                          fontFamily:   FONTS.mono,
                          minWidth:     22,
                          textAlign:    "center",
                        }}>
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div style={{ marginTop:   16, padding:     "12px 20px 0", borderTop:   `1px solid ${COLORS.border}`, fontSize:    11, fontFamily:  FONTS.body, textAlign:   "center" }} className="text-admin-ink-muted">
          Press <kbd style={{ fontSize: 10, padding: "1px 5px", background: COLORS.surfaceAlt, border: `1px solid ${COLORS.border}`, borderRadius: 3 }}>?</kbd> or <kbd style={{ fontSize: 10, padding: "1px 5px", background: COLORS.surfaceAlt, border: `1px solid ${COLORS.border}`, borderRadius: 3 }}>esc</kbd> to close
        </div>
      </div>
    </div>
  );
}

