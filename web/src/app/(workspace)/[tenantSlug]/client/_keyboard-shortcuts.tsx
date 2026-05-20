"use client";

// D9 polish — global keyboard shortcuts for the client surface.
//
// Mounts once at the layout level. Renders nothing visible. Listens
// for keydown events; ignores them when focus is in any text input
// (so typing in a search box never accidentally fires `g d`).
//
// Shortcuts (Gmail-style "g" prefix for navigation):
//   /            focus the search input on /discover (or jump there)
//   ?            toggle help overlay
//   g d          go to /client/discover
//   g f          go to /client/favorites
//   g s          go to /client/shortlists
//   g p          go to /client/pitches
//   g i          go to /client/inquiries
//   g b          go to /client/bookings
//   g m          go to /client/messages
//   g t          go to /client/today
//   Esc          close help overlay (when open)
//
// Labels are passed from the (server) layout so locale-aware copy
// renders without needing to load i18n on the client.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type KeyboardShortcutLabels = {
  title: string;
  close: string;
  rows: Record<
    "search" | "toggleHelp" | "discover" | "favorites" | "shortlists" |
    "pitches" | "inquiries" | "bookings" | "messages" | "today" | "esc",
    string
  >;
};

const DEFAULT_LABELS: KeyboardShortcutLabels = {
  title: "Keyboard shortcuts",
  close: "Close",
  rows: {
    search: "Focus search (or jump to Discover)",
    toggleHelp: "Toggle this help",
    discover: "Discover",
    favorites: "Favorites",
    shortlists: "Shortlists",
    pitches: "Pitches",
    inquiries: "Inquiries",
    bookings: "Bookings",
    messages: "Messages",
    today: "Today",
    esc: "Close this help",
  },
};

const NAV_MAP: Record<string, string> = {
  d: "discover",
  f: "favorites",
  s: "shortlists",
  p: "pitches",
  i: "inquiries",
  b: "bookings",
  m: "messages",
  t: "today",
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function ClientKeyboardShortcuts({
  tenantSlug,
  labels = DEFAULT_LABELS,
}: {
  tenantSlug: string;
  labels?: KeyboardShortcutLabels;
}) {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  // `g` prefix mode — last keydown was an unmodified `g`. Cleared after
  // a short window (700ms) or on next keystroke.
  const [gMode, setGMode] = useState<boolean>(false);

  useEffect(() => {
    if (!gMode) return;
    const t = setTimeout(() => setGMode(false), 700);
    return () => clearTimeout(t);
  }, [gMode]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Never interfere with modifier combos (⌘K etc.)
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      // Esc closes help even when typing? No — typing target check above
      // already let typing through. So this only matches non-typing Esc.
      if (e.key === "Escape" && helpOpen) {
        setHelpOpen(false);
        e.preventDefault();
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }

      if (e.key === "/") {
        e.preventDefault();
        const search = document.querySelector<HTMLInputElement>(
          'input[type="search"]',
        );
        if (search) {
          search.focus();
          search.select();
        } else {
          router.push(`/${tenantSlug}/client/discover`);
        }
        return;
      }

      if (e.key === "g" && !e.shiftKey) {
        setGMode(true);
        return;
      }

      if (gMode) {
        const target = NAV_MAP[e.key.toLowerCase()];
        if (target) {
          e.preventDefault();
          setGMode(false);
          router.push(`/${tenantSlug}/client/${target}`);
        } else {
          setGMode(false);
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router, tenantSlug, gMode, helpOpen]);

  if (!helpOpen) return null;
  return <HelpOverlay onClose={() => setHelpOpen(false)} labels={labels} />;
}

function HelpOverlay({
  onClose,
  labels,
}: {
  onClose: () => void;
  labels: KeyboardShortcutLabels;
}) {
  const rows: Array<[string, string]> = [
    ["/", labels.rows.search],
    ["?", labels.rows.toggleHelp],
    ["g d", labels.rows.discover],
    ["g f", labels.rows.favorites],
    ["g s", labels.rows.shortlists],
    ["g p", labels.rows.pitches],
    ["g i", labels.rows.inquiries],
    ["g b", labels.rows.bookings],
    ["g m", labels.rows.messages],
    ["g t", labels.rows.today],
    ["Esc", labels.rows.esc],
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(11,11,13,0.45)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: '"Inter", system-ui, sans-serif',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 14,
          maxWidth: 420,
          width: "calc(100% - 32px)",
          padding: 24,
          boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0B0B0D" }}>
            {labels.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={labels.close}
            style={{
              width: 28, height: 28, borderRadius: 7, border: "none",
              background: "rgba(11,11,13,0.06)", cursor: "pointer",
              fontSize: 14, color: "rgba(11,11,13,0.55)",
            }}
          >
            ×
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {rows.map(([key, label]) => (
            <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
              <kbd style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: 11.5,
                padding: "2px 8px",
                borderRadius: 5,
                background: "rgba(11,11,13,0.06)",
                color: "#0B0B0D",
                border: "1px solid rgba(24,24,27,0.10)",
                minWidth: 44,
                textAlign: "center",
              }}>
                {key}
              </kbd>
              <span style={{ color: "rgba(11,11,13,0.65)", marginLeft: 16, flex: 1 }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
