"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useSyncExternalStore } from "react";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { Icon } from "@/components/admin/shell/internal/primitives";
import { COLORS, FONTS } from "./support-tokens";
import type { SupportMessageRow, SupportTicketRow } from "@/lib/support/support-types";
import { resolveSupportTicketAction } from "@/lib/support/actions";
import { SupportCardRenderer, type SupportThreadTone } from "./SupportCardRenderer";

export type { SupportThreadTone };

function dayKey(ts: string): string {
  return ts.slice(0, 10);
}

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return () => undefined;
      }
      const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

function TypingDots({ color }: { color: string }) {
  const reduce = useReducedMotion();
  return (
    <span aria-hidden style={{ display: "inline-flex", gap: 4, alignItems: "center", height: 16 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: color,
            opacity: reduce ? 0.35 + i * 0.25 : 1,
            animation: reduce ? "none" : `tulala-support-dot 1s ease-in-out ${i * 0.15}s infinite`,
          }}
        />
      ))}
    </span>
  );
}

function ThinkingStages() {
  const t = useT();
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (reduce) {
      setStep(2);
      return;
    }
    const id = window.setInterval(() => {
      setStep((n) => {
        const next = Math.min(2, n + 1);
        // Stop ticking once the last stage holds.
        if (next === 2) window.clearInterval(id);
        return next;
      });
    }, 2500);
    return () => window.clearInterval(id);
  }, [reduce]);
  const key = step === 0 ? "thinking1" : step === 1 ? "thinking2" : "thinking3";
  return (
    <span
      style={{
        fontSize: 12,
        color: COLORS.royal,
        ...(reduce ? {} : { transition: "opacity 200ms ease" }),
      }}
    >
      {t(`dashboard.adminSupport.${key}`)}
    </span>
  );
}


export function SupportThreadView({
  ticket,
  messages,
  tone = "light",
  thinking = false,
  liveShareAvailable = true,
  allowAddPhone = true,
  onRate,
  onRequestHuman,
  onCardAction,
  onResolved,
}: {
  ticket: SupportTicketRow | null;
  messages: SupportMessageRow[];
  tone?: SupportThreadTone;
  thinking?: boolean;
  liveShareAvailable?: boolean;
  allowAddPhone?: boolean;
  onRate?: (rating: number, comment?: string) => void;
  onRequestHuman?: () => void;
  onCardAction?: (action: string) => void;
  /** Local echo after a successful requester resolve (rating row must not wait on realtime). */
  onResolved?: () => void;
}) {
  const t = useT();
  const [acked, setAcked] = useState<Record<string, boolean>>({});
  const [confirmHelpful, setConfirmHelpful] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [pickedRating, setPickedRating] = useState<number | null>(null);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingThanks, setRatingThanks] = useState(false);
  const grouped = useMemo(() => {
    const out: Array<{ day: string; items: SupportMessageRow[] }> = [];
    for (const m of messages) {
      if (m.deletedAt) continue;
      const k = dayKey(m.createdAt);
      const last = out[out.length - 1];
      if (!last || last.day !== k) out.push({ day: k, items: [m] });
      else last.items.push(m);
    }
    return out;
  }, [messages]);

  const isHq = tone === "hq";
  const ink = isHq ? "#F5F2EB" : COLORS.ink;
  const muted = isHq ? "rgba(245,242,235,0.62)" : COLORS.inkDim;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 16px 8px" }}>
      {grouped.map((g) => (
        <div key={g.day}>
          <div
            style={{
              textAlign: "center",
              fontSize: 11,
              color: muted,
              margin: "10px 0 8px",
              fontFamily: FONTS.body,
            }}
          >
            {g.day}
          </div>
          {g.items.map((m) => {
            if (m.messageKind === "card" && m.cardPayload) {
              return (
                <SupportCardRenderer
                  key={m.id}
                  payload={m.cardPayload}
                  onAction={onCardAction}
                  tone={tone}
                  liveShareAvailable={liveShareAvailable}
                  allowAddPhone={allowAddPhone}
                />
              );
            }
            if (m.authorKind === "system" || m.messageKind === "system") {
              return (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    fontSize: 11,
                    color: muted,
                    margin: "8px 0",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: COLORS.coral,
                    }}
                  />
                  {m.body}
                </div>
              );
            }
            if (m.authorKind === "ai") {
              const confidence =
                typeof m.aiMeta?.confidence === "number" ? m.aiMeta.confidence : null;
              return (
                <div
                  key={m.id}
                  style={{
                    background: COLORS.royalSoft,
                    borderRadius: 16,
                    padding: "12px 14px",
                    maxWidth: "86%",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      color: COLORS.royal,
                      marginBottom: 6,
                    }}
                  >
                    {t("dashboard.adminSupport.aiEyebrow")}
                    {isHq && confidence != null
                      ? ` · ${Math.round(confidence * 100)}%`
                      : ""}
                  </div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.5, color: COLORS.ink, whiteSpace: "pre-wrap" }}>
                    {m.body}
                  </div>
                  {!isHq ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10, alignItems: "center" }}>
                      {acked[m.id] ? null : confirmHelpful === m.id ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: COLORS.royal }}>
                            {t("dashboard.adminSupport.helpedConfirm")}
                          </span>
                          <button
                            type="button"
                            disabled={resolving || !ticket}
                            onClick={() => {
                              if (!ticket) return;
                              setResolving(true);
                              void resolveSupportTicketAction({ ticketId: ticket.id }).then((r) => {
                                setResolving(false);
                                if (r.ok) {
                                  setAcked((prev) => ({ ...prev, [m.id]: true }));
                                  // Local echo: the rating row keys off ticket
                                  // status, which must not depend on realtime
                                  // being up to appear.
                                  onResolved?.();
                                }
                              });
                            }}
                            style={{
                              border: "none",
                              background: COLORS.fill,
                              color: "#fff",
                              borderRadius: 8,
                              padding: "7px 12px",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {t("dashboard.adminSupport.markResolved")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAcked((prev) => ({ ...prev, [m.id]: true }));
                              setConfirmHelpful(null);
                            }}
                            style={ghostBtn}
                          >
                            {t("dashboard.adminSupport.keepItOpen")}
                          </button>
                        </div>
                      ) : (
                        <>
                          <span style={{ fontSize: 11, color: COLORS.royal }}>{t("dashboard.adminSupport.didThisHelp")}</span>
                          <button
                            type="button"
                            onClick={() => setConfirmHelpful(m.id)}
                            style={ghostBtn}
                          >
                            {t("dashboard.adminSupport.yesHelped")}
                          </button>
                          <button type="button" onClick={onRequestHuman} style={ghostBtn}>
                            {t("dashboard.adminSupport.noHelped")}
                          </button>
                        </>
                      )}
                      <button type="button" onClick={onRequestHuman} style={ghostBtn}>
                        {t("dashboard.adminSupport.talkToHuman")}
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            }
            if (m.messageKind === "note") {
              if (!isHq) return null;
              return (
                <div
                  key={m.id}
                  style={{
                    marginLeft: "auto",
                    maxWidth: "78%",
                    border: "1px dashed #E5B567",
                    borderRadius: 12,
                    padding: "10px 12px",
                    color: "#E5B567",
                    fontSize: 13,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.body}
                </div>
              );
            }
            const mine = m.authorKind === "requester";
            if (isHq) {
              if (mine) {
                return (
                  <div
                    key={m.id}
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      borderRadius: 12,
                      padding: "10px 12px",
                      maxWidth: "78%",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.08em",
                        color: muted,
                        marginBottom: 4,
                        fontWeight: 700,
                      }}
                    >
                      {t("dashboard.adminSupport.requesterEyebrow")}
                    </div>
                    <div style={{ fontSize: 13.5, color: ink, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                      {m.body}
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={m.id}
                  style={{
                    marginLeft: "auto",
                    background: "#F5F2EB",
                    color: "#0B0B0D",
                    borderRadius: "16px 16px 6px 16px",
                    padding: "10px 12px",
                    maxWidth: "78%",
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.body}
                </div>
              );
            }
            if (mine) {
              return (
                <div
                  key={m.id}
                  style={{
                    marginLeft: "auto",
                    background: COLORS.fill,
                    color: "#fff",
                    borderRadius: "16px 16px 6px 16px",
                    padding: "10px 12px",
                    maxWidth: "78%",
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.body}
                </div>
              );
            }
            return (
              <div key={m.id} style={{ display: "flex", gap: 8, maxWidth: "86%" }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: COLORS.fill,
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  OT
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.08em",
                      color: COLORS.inkDim,
                      fontWeight: 700,
                      marginBottom: 4,
                    }}
                  >
                    {t("dashboard.adminSupport.staffEyebrow")}
                  </div>
                  <div
                    style={{
                      background: COLORS.card,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 12,
                      padding: "10px 12px",
                      fontSize: 13.5,
                      lineHeight: 1.5,
                      color: COLORS.ink,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {m.body}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {thinking ? (
        <div style={{ background: COLORS.royalSoft, borderRadius: 16, padding: "12px 14px", maxWidth: "70%" }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: COLORS.royal,
              marginBottom: 6,
            }}
          >
            {t("dashboard.adminSupport.aiEyebrow")}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <TypingDots color={COLORS.royal} />
            <ThinkingStages />
          </div>
        </div>
      ) : null}
      {ratingThanks ? (
        <div style={{ textAlign: "center", fontSize: 12, color: COLORS.success, padding: "8px 0" }}>
          {t("dashboard.adminSupport.ratingThanks")}
        </div>
      ) : ticket?.status === "resolved" && onRate && ticket.satisfactionRating == null ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "12px 0" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={interpolate(t("dashboard.adminSupport.rateAriaN"), { n: String(n) })}
                aria-pressed={pickedRating === n}
                onClick={() => setPickedRating(n)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  border: `1px solid ${COLORS.success}`,
                  background: pickedRating != null && n <= pickedRating ? COLORS.success : COLORS.successSoft,
                  color: pickedRating != null && n <= pickedRating ? "#fff" : COLORS.successDeep,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {n}
              </button>
            ))}
          </div>
          {pickedRating != null ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 280 }}>
              <input
                value={ratingComment}
                onChange={(e) => setRatingComment(e.target.value)}
                placeholder={t("dashboard.adminSupport.ratingCommentPlaceholder")}
                maxLength={500}
                style={{
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 12.5,
                  fontFamily: FONTS.body,
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                <button
                  type="button"
                  onClick={() => {
                    onRate(pickedRating, ratingComment.trim() || undefined);
                    setRatingThanks(true);
                  }}
                  style={{
                    border: "none",
                    background: COLORS.fill,
                    color: "#fff",
                    borderRadius: 8,
                    padding: "7px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {t("dashboard.adminSupport.send")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onRate(pickedRating);
                    setRatingThanks(true);
                  }}
                  style={ghostBtn}
                >
                  {t("dashboard.adminSupport.ratingSkip")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {ticket?.handledBy === "ai" && onRequestHuman ? (
        <button type="button" onClick={onRequestHuman} style={{ ...ghostBtn, alignSelf: "center" }}>
          <Icon name="life-buoy" size={12} color={COLORS.royal} />
          {t("dashboard.adminSupport.talkToHuman")}
        </button>
      ) : null}
      <style>{`@keyframes tulala-support-dot{0%,80%,100%{opacity:.3}40%{opacity:1}}`}</style>
    </div>
  );
}

const ghostBtn: CSSProperties = {
  border: "none",
  background: "transparent",
  color: COLORS.royal,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};
