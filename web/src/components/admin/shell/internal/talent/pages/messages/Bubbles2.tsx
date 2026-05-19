"use client";

import { useState } from "react";
import { PrimaryButton, SecondaryButton } from "../../../primitives";
import { COLORS, FONTS, useAdminShell } from "../../../state";
import { VoiceNoteBubble } from "./Bubbles";
import { type Msg } from "../../shared/client-conversations-1";
import { type MsgStage } from "../../shared/conversations-1";



export function ContentMessageBody({ msg, fromYou, isFirstOfGroup = true }: { msg: Msg; fromYou: boolean; isFirstOfGroup?: boolean }) {
  // Premium bubble palette:
  //   You    — ink with very subtle inner sheen (linear gradient)
  //   Other  — pure white with thin 1px borderSoft + soft shadow
  // Border-radius is uniform on the side AWAY from sender; tail-corner
  // (4px) only on the first-in-group, otherwise also rounded for
  // grouped consecutive messages.
  const youBg = `linear-gradient(180deg, ${COLORS.ink} 0%, #1a1a1d 100%)`;
  const otherBg = "#fff";
  const fg = fromYou ? "#fff" : COLORS.ink;
  const border = fromYou ? "none" : `1px solid ${COLORS.borderSoft}`;
  const shadow = fromYou
    ? "0 1px 1px rgba(11,11,13,0.20)"
    : "0 1px 2px rgba(11,11,13,0.04)";
  const radius = fromYou
    ? (isFirstOfGroup ? "18px 18px 6px 18px" : "18px 18px 18px 18px")
    : (isFirstOfGroup ? "18px 18px 18px 6px" : "18px 18px 18px 18px");

  if (msg.kind === "text") {
    return (
      <div
        style={{
          background: fromYou ? youBg : otherBg,
          color: fg,
          border,
          borderRadius: radius,
          padding: "10px 15px",
          fontSize: 13.5,
          lineHeight: 1.5,
          boxShadow: shadow,
          letterSpacing: 0.05,
        }}
      >
        {msg.body}
      </div>
    );
  }
  const bg = fromYou ? COLORS.ink : "#fff";
  if (msg.kind === "image") {
    return (
      <div
        style={{
          background: bg,
          color: fg,
          border,
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: msg.count === 1 ? "1fr" : "repeat(2, 1fr)",
            gap: 2,
          }}
        >
          {(() => {
            // Premium-feeling thumbnail mocks — pseudo-randomised gradient
            // mood blocks per index so a 4-up grid feels like distinct
            // images, not a wall of identical placeholders. Real product
            // would render <img> with blurhash; this is the prototype-grade
            // proxy that doesn't rely on emoji.
            const moods = [
              ["#3a4a5a", "#7a8d9a"],
              ["#a08070", "#c9b39a"],
              ["#5a6e58", "#a9b89a"],
              ["#2a2f3c", "#5a5e72"],
              ["#a0584a", "#c08a72"],
              ["#3e3a52", "#7a6a8e"],
            ];
            return Array.from({ length: Math.min(msg.count, 4) }).map((_, i) => {
              const [a, b] = moods[i % moods.length]!;
              const lastVisible = i === Math.min(msg.count, 4) - 1 && msg.count > 4;
              return (
                <div
                  key={i}
                  style={{
                    aspectRatio: "4 / 3",
                    background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)`,
                    position: "relative",
                    overflow: "hidden",
                  }}
                  aria-label={`Photo ${i + 1}`}
                >
                  {/* Subtle texture overlay so it reads as photo, not flat block */}
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "radial-gradient(120% 80% at 30% 20%, rgba(255,255,255,0.18) 0%, transparent 50%), radial-gradient(80% 60% at 80% 90%, rgba(0,0,0,0.18) 0%, transparent 60%)",
                  }} />
                  {lastVisible && (
                    <div style={{
                      position: "absolute", inset: 0,
                      background: "rgba(0,0,0,0.45)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#fff", fontSize: 16, fontWeight: 600,
                      fontFamily: FONTS.body, letterSpacing: 0.2,
                    }}>
                      +{msg.count - 3}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
        {msg.caption && (
          <div style={{ padding: "7px 14px", fontSize: 12.5, color: fg }}>{msg.caption}</div>
        )}
      </div>
    );
  }
  if (msg.kind === "file") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          background: bg,
          color: fg,
          border,
          borderRadius: 12,
          minWidth: 220,
        }}
      >
        <span style={{ fontSize: 22 }}>📄</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500 }}>{msg.filename}</div>
          <div style={{ fontSize: 10.5, opacity: 0.7, marginTop: 1 }}>
            {msg.sizeKB} KB · PDF
          </div>
        </div>
        <span style={{ fontSize: 11, opacity: 0.7 }}>↓</span>
      </div>
    );
  }
  if (msg.kind === "voice") {
    return <VoiceNoteBubble msg={msg} fromYou={fromYou} bg={bg} fg={fg} border={border} />;
  }
  if (msg.kind === "location") {
    return (
      <a
        href={`https://maps.google.com/?q=${encodeURIComponent(msg.label)}`}
        target="_blank"
        rel="noreferrer"
        style={{
          display: "block",
          background: bg,
          color: fg,
          border,
          borderRadius: 12,
          overflow: "hidden",
          textDecoration: "none",
          minWidth: 240,
        }}
      >
        <div
          style={{
            aspectRatio: "5 / 2",
            background: `linear-gradient(135deg, ${COLORS.indigoSoft}, rgba(91,107,160,0.20))`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 28,
          }}
        >
          📍
        </div>
        <div style={{ padding: "8px 12px" }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: fromYou ? "#fff" : COLORS.ink }}>
            {msg.label}
          </div>
          <div style={{ fontSize: 10.5, opacity: 0.7, marginTop: 2 }}>Tap to open in Maps</div>
        </div>
      </a>
    );
  }
  return null;
}


export function ReadReceiptRow({ msg, fromYou }: { msg: Msg; fromYou: boolean }) {
  if (!fromYou || !("ts" in msg)) return null;
  const readBy = "readBy" in msg ? msg.readBy : undefined;
  const isRead = !!(readBy && readBy.length > 0);
  const checkmark = isRead ? "✓✓" : "✓";
  const checkColor = isRead ? COLORS.green : COLORS.inkDim;
  // Mock read-time — in real product this is when the recipient opened
  // the thread. For prototype, derive a plausible time string from the
  // sent ts so it reads consistently. e.g. "Read at 4:32pm"
  const readAtLabel = isRead
    ? `Read by ${readBy?.[0] ?? "client"}${readBy && readBy.length > 1 ? ` +${readBy.length - 1}` : ""} · ${msg.ts}`
    : `Sent · ${msg.ts}`;
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, marginTop: 3, fontSize: 10.5, color: COLORS.inkMuted }}>
      <span>{msg.ts}</span>
      <span
        title={readAtLabel}
        aria-label={readAtLabel}
        style={{ color: checkColor, fontFamily: "monospace", cursor: "help" }}
      >
        {checkmark}
      </span>
    </div>
  );
}


export function ActionMessage({ msg, fromYou, stage }: { msg: Msg; fromYou: boolean; stage: MsgStage }) {
  const { toast, openDrawer } = useAdminShell();
  // Hoist all action-card state here to satisfy Rules of Hooks.
  const [rateVal, setRateVal] = useState((msg as { resolved?: string }).resolved ?? "");
  const [rateSubmitted, setRateSubmitted] = useState(false);
  const [transportChosen, setTransportChosen] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<"pending" | "confirmed" | "issues">("pending");
  const [calState, setCalState] = useState<"pending" | "added" | "declined">("pending");

  if (msg.kind === "action-rate") {
    const submitted = !!msg.resolved || rateSubmitted;
    const val = rateVal;
    const setVal = setRateVal;
    return (
      <div
        style={{
          background: "#fff",
          border: `1px solid ${submitted ? "rgba(46,125,91,0.30)" : "rgba(194,106,69,0.30)"}`,
          borderLeft: `3px solid ${submitted ? COLORS.green : COLORS.coral}`,
          borderRadius: 14,
          padding: "14px 16px",
          maxWidth: 380,
          fontFamily: FONTS.body,
          boxShadow: "0 1px 3px rgba(11,11,13,0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 16 }}>💸</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: submitted ? COLORS.green : COLORS.ink }}>
            {submitted ? "Rate sent to coordinator" : "What's your rate for this?"}
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginBottom: 10, lineHeight: 1.5 }}>
          1 day, full usage (web + social, 12 months, EU). Lunch + transport included.
          {!submitted && " Your reply goes private to the coordinator first — they negotiate with the client."}
        </div>
        {submitted ? (
          <>
            <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.green }}>€{val} / day</div>
            <div style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: `1px solid ${COLORS.borderSoft}`,
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 10.5,
              color: COLORS.inkMuted,
            }}>
              <span style={{ color: COLORS.green, fontFamily: "monospace" }}>✓✓</span>
              <span>Sent · Viewed by coordinator · Awaiting decision</span>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 8,
                padding: "0 10px",
                flex: 1,
              }}
            >
              <span style={{ fontSize: 13, color: COLORS.inkMuted, marginRight: 6 }}>€</span>
              <input
                type="text"
                placeholder="1,800"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  fontFamily: FONTS.body,
                  fontSize: 13,
                  padding: "8px 0",
                  color: COLORS.ink,
                }}
              />
              <span style={{ fontSize: 11, color: COLORS.inkMuted }}>/day</span>
            </div>
            <PrimaryButton size="sm" onClick={() => { setRateSubmitted(true); }}>
              Send
            </PrimaryButton>
          </div>
        )}
      </div>
    );
  }
  if (msg.kind === "action-transport") {
    return (
      <div style={{ background: "#fff", border: `1px solid ${transportChosen ? "rgba(46,125,91,0.30)" : "rgba(194,106,69,0.30)"}`, borderLeft: `3px solid ${transportChosen ? COLORS.green : COLORS.coral}`, borderRadius: 14, padding: "12px 14px", maxWidth: 380, fontFamily: FONTS.body }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 16 }}>🚖</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: transportChosen ? COLORS.green : COLORS.ink }}>
            {transportChosen ? `Transport confirmed · ${transportChosen}` : "Confirm your transport"}
          </span>
        </div>
        {!transportChosen && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {msg.options.map((opt) => (
              <button
                key={opt}
                onClick={() => setTransportChosen(opt)}
                style={{
                  background: "rgba(11,11,13,0.04)",
                  border: `1px solid ${COLORS.borderSoft}`,
                  borderRadius: 999,
                  padding: "5px 11px",
                  cursor: "pointer",
                  fontFamily: FONTS.body,
                  fontSize: 12,
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (msg.kind === "action-confirm") {
    const confirmBorderColor = confirmState === "confirmed" ? "rgba(46,125,91,0.30)" : confirmState === "issues" ? "rgba(176,52,52,0.30)" : "rgba(194,106,69,0.30)";
    const confirmAccent = confirmState === "confirmed" ? COLORS.green : confirmState === "issues" ? "#b03434" : COLORS.coral;
    return (
      <div style={{ background: "#fff", border: `1px solid ${confirmBorderColor}`, borderLeft: `3px solid ${confirmAccent}`, borderRadius: 14, padding: "12px 14px", maxWidth: 360, fontFamily: FONTS.body }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: confirmState === "pending" ? COLORS.ink : confirmAccent, marginBottom: confirmState === "pending" ? 10 : 0 }}>
          {confirmState === "confirmed" ? `✓ ${msg.label} — confirmed` : confirmState === "issues" ? `⚠ ${msg.label} — issues flagged` : msg.label}
        </div>
        {confirmState === "pending" && (
          <div style={{ display: "flex", gap: 8 }}>
            <PrimaryButton size="sm" onClick={() => setConfirmState("confirmed")}>Confirm</PrimaryButton>
            <SecondaryButton size="sm" onClick={() => setConfirmState("issues")}>Has issues</SecondaryButton>
          </div>
        )}
      </div>
    );
  }
  if (msg.kind === "calendar-invite") {
    // Mock conflict detection — Bvlgari hold (May 18-20) overlaps with
    // a fictional Mango shoot (May 18-19). The real implementation would
    // query the calendar surface; this static check is enough for the
    // prototype to demonstrate the conflict-warning UX.
    const hasConflict = msg.date.includes("18") && msg.title.toLowerCase().includes("bvlgari");
    return (
      <div style={{ background: "#fff", border: `1px solid ${hasConflict ? "rgba(176,52,52,0.30)" : COLORS.borderSoft}`, borderRadius: 14, padding: "12px 14px", maxWidth: 320, fontFamily: FONTS.body }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.indigo, marginBottom: 4 }}>
          📅 Calendar invite
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.ink }}>{msg.title}</div>
        <div style={{ fontSize: 12, color: COLORS.inkMuted, marginTop: 2 }}>{msg.date}</div>
        {hasConflict && (
          <div style={{
            marginTop: 8,
            padding: "6px 8px",
            background: "rgba(176,52,52,0.06)",
            border: "1px solid rgba(176,52,52,0.20)",
            borderRadius: 8,
            display: "flex",
            alignItems: "flex-start",
            gap: 6,
            fontSize: 11.5,
            color: "#902a2a",
            lineHeight: 1.4,
          }}>
            <span aria-hidden style={{ fontSize: 12 }}>⚠</span>
            <span><strong>Conflicts with Mango (May 18–19)</strong> · already on hold</span>
          </div>
        )}
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {calState === "pending" ? (
            <>
              <PrimaryButton size="sm" onClick={() => setCalState("added")}>Add</PrimaryButton>
              <SecondaryButton size="sm" onClick={() => setCalState("declined")}>Decline</SecondaryButton>
            </>
          ) : calState === "added" ? (
            <div style={{ fontSize: 12, color: COLORS.green, fontWeight: 600 }}>✓ Added to your calendar</div>
          ) : (
            <div style={{ fontSize: 12, color: COLORS.inkMuted }}>Declined</div>
          )}
        </div>
      </div>
    );
  }
  if (msg.kind === "contract-sign") {
    return (
      <div style={{ background: "#fff", border: `1px solid ${msg.resolved ? "rgba(46,125,91,0.30)" : COLORS.borderSoft}`, borderRadius: 14, padding: "12px 14px", maxWidth: 360, fontFamily: FONTS.body }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 16 }}>📑</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>{msg.resolved ? "Contract signed" : "Sign contract"}</span>
          {msg.resolved && <span style={{ color: COLORS.green, fontSize: 11, fontWeight: 600 }}>✓</span>}
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginBottom: 8 }}>{msg.filename}</div>
        {!msg.resolved && (
          <div>
            <PrimaryButton
              size="sm"
              onClick={() => toast("e-Signature is rolling out next sprint — your coordinator will share a signed PDF in the meantime.")}
            >
              Review & sign
            </PrimaryButton>
            <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 5 }}>e-Signature coming soon</div>
          </div>
        )}
      </div>
    );
  }
  if (msg.kind === "polaroid-request") {
    return (
      <div style={{ background: "#fff", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 14, padding: "12px 14px", maxWidth: 360, fontFamily: FONTS.body }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 16 }}>📸</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>
            Polaroids requested {msg.resolved ? `· ${msg.resolved} sent` : ""}
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginBottom: 8 }}>
          Recent, unretouched, full-body + face. 5 minimum.
        </div>
        {msg.resolved ? (
          <div style={{ fontSize: 12, color: COLORS.green, fontWeight: 600 }}>✓ {msg.resolved} polaroids delivered</div>
        ) : (
          <PrimaryButton size="sm" onClick={() => openDrawer("talent-photo-edit", { focusSlot: "gallery" })}>Upload polaroids</PrimaryButton>
        )}
      </div>
    );
  }
  if (msg.kind === "payment-receipt") {
    return (
      <div style={{ background: "rgba(46,125,91,0.06)", border: `1px solid rgba(46,125,91,0.25)`, borderRadius: 14, padding: "12px 14px", maxWidth: 320, fontFamily: FONTS.body }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.green, marginBottom: 4 }}>
          ✓ Paid
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, color: COLORS.ink, fontFamily: FONTS.display, letterSpacing: -0.2 }}>
          {msg.amount}
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 2 }}>via {msg.method} · {msg.ts}</div>
      </div>
    );
  }
  return null;
}


export function TypingIndicator({ name }: { name: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0 0 6px", fontFamily: FONTS.body, fontSize: 11, color: COLORS.inkMuted }}>
      <span style={{ display: "inline-flex", gap: 3 }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: COLORS.inkMuted,
              animation: `tulala-typing 1.2s infinite ease-in-out ${i * 0.15}s`,
              display: "inline-block",
            }}
          />
        ))}
      </span>
      {name} is typing…
      <style>{`
        @keyframes tulala-typing {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-2px); }
        }
      `}</style>
    </div>
  );
}
