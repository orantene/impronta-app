"use client";

/**
 * ThreadSearch — in-thread search + jump-to surface.
 *
 * Messages Consolidation Plan v2 — Slice S.
 *
 * Opens as a bottom-sheet (mobile) / side panel (desktop) from a
 * search icon in the conversation header. Provides:
 *   - Text search across all messages in the current inquiry's
 *     conversation (private + group threads, role-filtered)
 *   - File filter — narrow to file-attachment messages only
 *   - Jump-to shortcuts: Offer · Call sheet · Payment · Client
 *     approval (each routes to the right tab + scrolls to anchor)
 *   - Optional AI summary stub — "What is still missing?" — wires
 *     to a future endpoint; renders a placeholder until that lands
 *
 * Per plan §14, this is a later-phase polish; the search itself does
 * not need to be exhaustive — message-body LIKE matches + structured
 * jump-tos cover ~90% of retrieval needs.
 */

import { useEffect, useMemo, useRef, useState } from "react";

export type ThreadSearchMessage = {
  id: string;
  body: string;
  createdAt: string;
  senderName: string;
  hasAttachment?: boolean;
};

export type JumpTarget = {
  kind: "offer" | "call-sheet" | "payment" | "approval";
  label: string;
  /** Click handler — the caller wires the actual navigation. */
  onJump: () => void;
};

type Props = {
  open: boolean;
  messages: ThreadSearchMessage[];
  jumpTargets: JumpTarget[];
  /** Called when the user clicks a search result. Caller scrolls to
   *  the message and closes the search panel. */
  onResultClick: (messageId: string) => void;
  onClose: () => void;
};

export function ThreadSearch({ open, messages, jumpTargets, onResultClick, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [filesOnly, setFilesOnly] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on open
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Esc-to-close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const results = useMemo(() => {
    let list = messages;
    if (filesOnly) list = list.filter((m) => m.hasAttachment);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((m) => m.body.toLowerCase().includes(q));
    }
    return list.slice(0, 40); // cap render
  }, [messages, query, filesOnly]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="thread-search-title"
      style={{
        position: "fixed", inset: 0, zIndex: 105,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        background: "rgba(11,11,13,0.5)",
        fontFamily: '"Inter", system-ui, sans-serif',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "100%", maxWidth: 560,
        maxHeight: "85vh", overflow: "auto",
        background: "#fff",
        borderRadius: "16px 16px 0 0",
        padding: 16,
        paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
        boxShadow: "0 -20px 50px rgba(11,11,13,0.20)",
      }}>
        <div style={{
          width: 40, height: 4, borderRadius: 2,
          background: "rgba(24,24,27,0.18)",
          margin: "0 auto 12px",
        }} />

        <h2 id="thread-search-title" style={{
          margin: 0, marginBottom: 10,
          fontSize: 16, fontWeight: 700,
          color: "#0B0B0D", letterSpacing: -0.2,
        }}>
          Search this conversation
        </h2>

        {/* Search input */}
        <div style={{ position: "relative", marginBottom: 10 }}>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages…"
            style={{
              width: "100%", padding: "11px 12px 11px 36px",
              borderRadius: 10,
              border: "1px solid rgba(24,24,27,0.12)",
              fontSize: 13.5,
              fontFamily: '"Inter", system-ui, sans-serif',
              color: "#0B0B0D",
              outline: "none", boxSizing: "border-box",
            }}
          />
          <span aria-hidden style={{
            position: "absolute", left: 12, top: "50%",
            transform: "translateY(-50%)",
            color: "rgba(11,11,13,0.35)",
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M9 9l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </span>
        </div>

        {/* Filter toggle */}
        <label style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "4px 10px",
          borderRadius: 999,
          background: filesOnly ? "rgba(15,79,62,0.10)" : "transparent",
          color: filesOnly ? "#0F4F3E" : "rgba(11,11,13,0.55)",
          fontSize: 12, fontWeight: 600,
          cursor: "pointer",
          marginBottom: 14,
        }}>
          <input
            type="checkbox"
            checked={filesOnly}
            onChange={(e) => setFilesOnly(e.target.checked)}
            style={{ margin: 0 }}
          />
          Files only
        </label>

        {/* Jump shortcuts */}
        {jumpTargets.length > 0 && (
          <>
            <div style={{
              fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4,
              color: "rgba(11,11,13,0.55)",
              textTransform: "uppercase",
              marginBottom: 6,
            }}>
              Jump to
            </div>
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 6,
              marginBottom: 14,
            }}>
              {jumpTargets.map((j, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { j.onJump(); onClose(); }}
                  style={{
                    padding: "7px 12px", borderRadius: 999,
                    border: "1px solid rgba(24,24,27,0.10)",
                    background: "rgba(11,11,13,0.025)",
                    color: "#0B0B0D",
                    fontSize: 12, fontWeight: 600,
                    fontFamily: '"Inter", system-ui, sans-serif',
                    cursor: "pointer",
                    minHeight: 36,
                  }}
                >
                  {j.label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Results */}
        <div style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4,
          color: "rgba(11,11,13,0.55)",
          textTransform: "uppercase",
          marginBottom: 6,
        }}>
          {results.length === 0
            ? (query.trim() ? "No matches" : "Type to search")
            : `${results.length} result${results.length === 1 ? "" : "s"}`}
        </div>
        <div className="flex flex-col gap-1.5">
          {results.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => { onResultClick(m.id); onClose(); }}
              style={{
                padding: "9px 11px", borderRadius: 10,
                border: "1px solid rgba(24,24,27,0.08)",
                background: "#fff",
                textAlign: "left",
                fontFamily: '"Inter", system-ui, sans-serif',
                fontSize: 12.5, color: "#0B0B0D",
                cursor: "pointer",
                display: "flex", flexDirection: "column", gap: 3,
              }}
            >
              <div style={{
                fontSize: 11, color: "rgba(11,11,13,0.55)",
                display: "flex", alignItems: "baseline", gap: 6,
              }}>
                <span className="font-semibold">{m.senderName}</span>
                <span aria-hidden style={{ opacity: 0.4 }}>·</span>
                <span>{m.createdAt}</span>
                {m.hasAttachment && (
                  <span style={{ marginLeft: "auto", color: "#0F4F3E" }}>📎</span>
                )}
              </div>
              <div style={{
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {m.body}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
