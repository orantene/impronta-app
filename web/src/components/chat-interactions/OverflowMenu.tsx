"use client";

/**
 * OverflowMenu — three-dot button that opens a column of actions for
 * the current thread or message.
 *
 * Placeholder slots for: Logs · Activity · Report a problem · Mute ·
 * Copy link · Archive · Export PDF.
 *
 * Each item accepts an `onClick` (when wired) or stays as a "Coming
 * soon" tap that surfaces a toast. Tap-target ≥44px on mobile.
 *
 * Messages Consolidation Plan v2 — Slice extension.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

export type OverflowMenuItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  /** When set, this item is wired. When null/undefined, it shows a
   *  "Coming soon" subhint and the click surfaces a toast. */
  onClick?: () => void;
  /** Optional one-line subhint shown below the label. */
  hint?: string;
  /** Danger items render in coral (e.g. Report / Archive). */
  danger?: boolean;
  /** Separator above this item — visually groups danger or "Coming
   *  soon" items at the bottom. */
  divider?: boolean;
};

export type OverflowMenuProps = {
  /** Items rendered in order. Pass the placeholder default set or
   *  override per surface. */
  items?: OverflowMenuItem[];
  /** Toast callback for "Coming soon" items. */
  toast?: (text: string) => void;
  /** Visual size — "sm" for inside chat bubbles, "md" for thread
   *  header. */
  size?: "sm" | "md";
  /** Label for the trigger button (a11y). */
  ariaLabel?: string;
};

/** Default placeholder action set — every Messages surface gets these
 *  unless overridden. Keeps the menu consistent across roles. */
export const DEFAULT_OVERFLOW_ITEMS: OverflowMenuItem[] = [
  { id: "logs", label: "Logs", hint: "Coming soon — engine event log" },
  { id: "activity", label: "Activity", hint: "Coming soon — audit + activity feed" },
  { id: "copy-link", label: "Copy link to thread", hint: "Coming soon" },
  { id: "mute", label: "Mute notifications", hint: "Coming soon" },
  { id: "export-pdf", label: "Export thread as PDF", hint: "Coming soon" },
  { id: "report", label: "Report a problem", hint: "Coming soon", danger: true, divider: true },
];

export function OverflowMenu({
  items = DEFAULT_OVERFLOW_ITEMS,
  toast,
  size = "md",
  ariaLabel = "More actions",
}: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Click-outside close
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const triggerSize = size === "sm" ? 24 : 32;
  const triggerHitbox = 44; // tap-target floor

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          width: triggerHitbox, height: triggerHitbox,
          padding: 0,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "rgba(11,11,13,0.55)",
          borderRadius: 8,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          // Visual circle inside the larger hitbox
        }}
      >
        <span aria-hidden style={{
          width: triggerSize, height: triggerSize,
          borderRadius: triggerSize / 2,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width={size === "sm" ? 12 : 14} height={size === "sm" ? 12 : 14} viewBox="0 0 14 14" fill="none">
            <circle cx="3" cy="7" r="1.2" fill="currentColor"/>
            <circle cx="7" cy="7" r="1.2" fill="currentColor"/>
            <circle cx="11" cy="7" r="1.2" fill="currentColor"/>
          </svg>
        </span>
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            background: "#fff",
            border: "1px solid rgba(24,24,27,0.10)",
            borderRadius: 10,
            boxShadow: "0 12px 32px rgba(11,11,13,0.14)",
            minWidth: 220,
            zIndex: 80,
            padding: 4,
            display: "flex",
            flexDirection: "column",
            fontFamily: '"Inter", system-ui, sans-serif',
          }}
        >
          {items.map((item) => (
            <div key={item.id}>
              {item.divider && (
                <div aria-hidden style={{
                  height: 1, margin: "4px 6px",
                  background: "rgba(24,24,27,0.06)",
                }} />
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  if (item.onClick) {
                    item.onClick();
                  } else {
                    toast?.(`${item.label} — coming soon`);
                  }
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "9px 12px",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  borderRadius: 6,
                  fontFamily: '"Inter", system-ui, sans-serif',
                  display: "flex", flexDirection: "column", gap: 2,
                  minHeight: 44,
                  color: item.danger ? "#A33A3A" : "#0B0B0D",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(11,11,13,0.04)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                }}
              >
                <span style={{
                  fontSize: 13,
                  fontWeight: 600,
                  display: "inline-flex", alignItems: "center", gap: 8,
                }}>
                  {item.icon}
                  {item.label}
                </span>
                {item.hint && (
                  <span style={{
                    fontSize: 11,
                    color: "rgba(11,11,13,0.45)",
                  }}>{item.hint}</span>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
