"use client";

import { useState } from "react";
import { Icon, scrollBehavior } from "../../../primitives";
import { COLORS, FONTS, TRANSITION } from "../../../state";
import { SendButtonWithSchedule } from "./Bubbles";
import { type Conversation } from "../../shared/conversations-1";



export function Composer({
  conv,
  isLocked,
  onSendMessage,
  onAfterSend,
}: {
  conv: Conversation;
  isLocked: boolean;
  onSendMessage?: (body: string) => void;
  onAfterSend?: () => void;
}) {
  const [text, setText] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  // @mention (#33) — show a small autocomplete popup when the user
  // types "@". Stub with mock teammates; real version queries the API.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const MENTION_NAMES = ["Marta Reyes", "Kai Lin", "Tomás Navarro", "Lina Park"];
  const mentionMatches = mentionQuery !== null
    ? MENTION_NAMES.filter((n) => n.toLowerCase().startsWith(mentionQuery.toLowerCase()))
    : [];
  // Smart replies are now opt-in via a ✨ toggle in the composer row,
  // not forced. Real-estate-respecting per design feedback.
  const [smartOpen, setSmartOpen] = useState(false);

  // Smart-reply chips — context-aware (mock)
  const smartReplies = isLocked
    ? ["Confirmed", "On my way 🚖", "Running 5 min late"]
    : conv.stage === "inquiry"
      ? ["Yes, available", "Need more info", "Send rate via 💸 above"]
      : ["Holding 👍", "Sounds good", "Will confirm later today"];

  // Quick-quote chips — when on inquiry/hold stages, prefilled rate
  // suggestions from the talent's recent history. The chip inserts a
  // rate sentence into the input, the talent edits as needed before
  // sending. Mocked from a static "history" so the prototype shows the
  // pattern without wiring a real rates API.
  const quickQuotes = (conv.stage === "inquiry" || conv.stage === "hold")
    ? [
        { rate: "€1,200/day", note: `Last with ${conv.client}` },
        { rate: "€950/day", note: "Last editorial" },
        { rate: "€1,800/day", note: "Top this month" },
      ]
    : [];
  const sendNow = () => {
    const body = text.trim();
    if (!body) return;
    onSendMessage?.(body);
    setText("");
    onAfterSend?.();
  };

  return (
    <div
      style={{
        borderTop: `1px solid ${COLORS.borderSoft}`,
        padding: "10px 14px 12px",
        background: "#fff",
        position: "relative",
      }}
    >
      {/* Smart-reply chips — only visible when toggled on. Tap a chip
          to insert it into the input; tap again to refine. Hidden by
          default so the composer doesn't take extra real estate.
          On rate-relevant stages, quick-quote chips appear above the
          smart-replies — preset rates from talent history. */}
      {smartOpen && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginBottom: 8,
            animation: "tulala-smart-fade .18s ease",
          }}
        >
          <style>{`@keyframes tulala-smart-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          {quickQuotes.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, fontWeight: 700, alignSelf: "center", marginRight: 2 }} className="text-admin-ink-muted">Quick quote</span>
              {quickQuotes.map((q) => (
                <button
                  key={q.rate}
                  type="button"
                  onClick={() => { setText(`My rate is ${q.rate}, full usage included.`); setSmartOpen(false); }}
                  title={q.note}
                  style={{
                    background: "rgba(15,79,62,0.06)",
                    border: "1px solid rgba(15,79,62,0.18)",
                    borderRadius: 999,
                    padding: "4px 10px",
                    cursor: "pointer",
                    fontFamily: FONTS.body,
                    fontSize: 11.5,
                    color: COLORS.accent,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <span className="font-semibold">{q.rate}</span>
                  <span style={{ opacity: 0.7, fontSize: 10.5 }}>· {q.note}</span>
                </button>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontWeight: 700, alignSelf: "center", marginRight: 2 }} className="text-admin-ink-muted">Quick reply</span>
          {smartReplies.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => { setText(r); setSmartOpen(false); }}
              style={{
                background: "rgba(11,11,13,0.04)",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 999,
                padding: "4px 10px",
                cursor: "pointer",
                fontFamily: FONTS.body,
                fontSize: 11.5,
                color: COLORS.ink,
              }}
            >
              {r}
            </button>
          ))}
          </div>
        </div>
      )}

      {/* @mention popup (#33) */}
      {mentionMatches.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 14,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(11,11,13,0.14)",
            padding: 4,
            zIndex: 30,
            fontFamily: FONTS.body,
            minWidth: 180,
          }}
        >
          {mentionMatches.map((name) => (
            <button
              key={name}
              type="button"
              role="menuitem"
              onClick={() => {
                const cursor = text.lastIndexOf("@");
                setText(text.slice(0, cursor) + `@${name} `);
                setMentionQuery(null);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "7px 10px",
                background: "transparent",
                border: "none",
                borderRadius: 7,
                cursor: "pointer",
                textAlign: "left",
                fontFamily: FONTS.body,
                fontSize: 13,
                color: COLORS.ink,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.accentSoft)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ width: 24, height: 24, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }} className="bg-admin-surface-alt text-admin-ink">
                {name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
              </span>
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Composer row — premium pill shape with subtle inner shadow */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 999,
          padding: "5px 6px 5px 8px",
          boxShadow: "inset 0 1px 2px rgba(11,11,13,0.025)",
        }}
      >
        {/* Attach trigger */}
        <button
          type="button"
          onClick={() => setAttachOpen((v) => !v)}
          aria-label="Attach"
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: COLORS.inkMuted,
          }}
        >
          <Icon name="plus" size={14} stroke={2} />
        </button>
        {/* Smart-reply toggle — ✨ icon. Active state when chips visible. */}
        <button
          type="button"
          onClick={() => setSmartOpen((v) => !v)}
          aria-label={smartOpen ? "Hide smart replies" : "Show smart replies"}
          aria-pressed={smartOpen}
          title="Smart replies (AI suggestions)"
          style={{
            width: 30,
            height: 30,
            borderRadius: 999,
            border: smartOpen ? `1px solid ${COLORS.accentDeep}` : "none",
            background: smartOpen ? COLORS.accentSoft : "transparent",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
          }}
        >
          ✨
        </button>
        <textarea
          rows={1}
          placeholder={isLocked ? "Locked thread — only chat allowed" : "Message…"}
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            setText(v);
            // @mention detection (#33) — find "@word" at cursor
            const cursor = e.target.selectionStart ?? v.length;
            const before = v.slice(0, cursor);
            const match = before.match(/@(\w*)$/);
            setMentionQuery(match ? match[1]! : null);
            // Auto-grow up to ~5 rows then scroll. Reset before measuring.
            const el = e.currentTarget;
            el.style.height = "auto";
            const max = 5 * 20; // ~5 lines of 20px line-height
            el.style.height = Math.min(el.scrollHeight, max) + "px";
          }}
          onFocus={(e) => {
            // Mobile keyboard avoidance — bring composer above keyboard.
            // Defer slightly so the keyboard is in view before scroll.
            setTimeout(() => {
              try { e.target.scrollIntoView({ block: "end", behavior: scrollBehavior() }); } catch { /* noop */ }
            }, 250);
          }}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter inserts a newline (chat convention)
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (text.trim()) {
                sendNow();
                e.currentTarget.style.height = "auto";
              }
            }
          }}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            resize: "none",
            fontFamily: FONTS.body,
            fontSize: 13,
            lineHeight: "20px",
            color: COLORS.ink,
            padding: "8px 0",
            maxHeight: 100,
            overflowY: "auto",
          }}
        />
        {/* Voice + send */}
        <button
          type="button"
          aria-label="Voice note"
          title="Voice notes coming soon"
          disabled
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            border: "none",
            background: "transparent",
            cursor: "not-allowed",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: COLORS.inkMuted,
            opacity: 0.45,
          }}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </button>
        <SendButtonWithSchedule
          disabled={!text.trim()}
          onSend={sendNow}
        />
      </div>

      {/* Attach menu — popover above composer on desktop, slides up
          as a bottom sheet on mobile (CSS overrides at <720px). */}
      {attachOpen && (
        <div
          data-tulala-attach-menu
          style={{
            position: "absolute",
            bottom: "calc(100% + 4px)",
            left: 14,
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            boxShadow: "0 6px 24px rgba(11,11,13,0.10)",
            padding: 6,
            display: "grid",
            gridTemplateColumns: "repeat(3, 90px)",
            gap: 4,
            fontFamily: FONTS.body,
            zIndex: 20,
          }}
        >
          {[
            { icon: "📷", label: "Photo" },
            { icon: "📄", label: "File" },
            { icon: "📍", label: "Location" },
            { icon: "🎙️", label: "Voice" },
            { icon: "📅", label: "Calendar" },
            { icon: "💸", label: "Quote rate" },
          ].map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => setAttachOpen(false)}
              disabled
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                padding: "10px 6px",
                background: "transparent",
                opacity: 0.38,
                cursor: "not-allowed",
                border: "none",
                borderRadius: 8,
                fontFamily: FONTS.body,
                fontSize: 11,
                color: COLORS.inkMuted,
                transition: `background ${TRANSITION.micro}`,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.04)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ fontSize: 20 }}>{a.icon}</span>
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
