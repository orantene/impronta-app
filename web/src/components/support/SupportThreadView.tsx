"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useT } from "@/i18n/use-t";
import { Icon } from "@/components/admin/shell/internal/primitives";
import { COLORS, FONTS, RADIUS } from "./support-tokens";
import type { SupportMessageRow, SupportTicketRow } from "@/lib/support/support-types";
import type { SupportContract } from "./support-contract";

export type SupportThreadTone = "light" | "hq";

function dayKey(ts: string): string {
  return ts.slice(0, 10);
}

function TypingDots({ color }: { color: string }) {
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
            animation: `tulala-support-dot 1s ease-in-out ${i * 0.15}s infinite`,
          }}
        />
      ))}
    </span>
  );
}

export function SupportCardRenderer({
  payload,
  onAction,
  tone,
}: {
  payload: Record<string, unknown>;
  onAction?: (action: string) => void;
  tone: SupportThreadTone;
}) {
  const t = useT();
  const kind = typeof payload.kind === "string" ? payload.kind : "generic";
  const ink = tone === "hq" ? "#F5F2EB" : COLORS.ink;
  const muted = tone === "hq" ? "rgba(245,242,235,0.62)" : COLORS.inkMuted;
  const cardBg = tone === "hq" ? "rgba(255,255,255,0.04)" : COLORS.card;
  const border = tone === "hq" ? "rgba(255,255,255,0.10)" : COLORS.border;

  return (
    <div
      style={{
        background: cardBg,
        border: `1px solid ${border}`,
        borderRadius: RADIUS.lg,
        padding: "14px 16px",
        maxWidth: "86%",
        margin: "8px auto",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: ink, marginBottom: 6 }}>
        {typeof payload.title === "string"
          ? payload.title
          : kind === "offer-human"
            ? t("dashboard.adminSupport.offerHumanTitle")
            : t("dashboard.adminSupport.cardTitle")}
      </div>
      {typeof payload.description === "string" ? (
        <div style={{ fontSize: 12.5, color: muted, lineHeight: 1.45, marginBottom: 10 }}>
          {payload.description}
        </div>
      ) : kind === "offer-human" ? (
        <div style={{ fontSize: 12.5, color: muted, lineHeight: 1.45, marginBottom: 10 }}>
          {t("dashboard.adminSupport.offerHumanBody")}
        </div>
      ) : null}
      {kind === "callback" || kind === "auto-close" || kind === "offer-human" ? (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() =>
              onAction?.(
                kind === "callback" ? "add-phone" : kind === "auto-close" ? "keep-open" : "talk-human",
              )
            }
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
            {kind === "callback"
              ? t("dashboard.adminSupport.addNumber")
              : kind === "auto-close"
                ? t("dashboard.adminSupport.keepOpen")
                : t("dashboard.adminSupport.talkToHuman")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function SupportThreadView({
  ticket,
  messages,
  tone = "light",
  thinking = false,
  onRate,
  onRequestHuman,
  onCardAction,
}: {
  ticket: SupportTicketRow | null;
  messages: SupportMessageRow[];
  tone?: SupportThreadTone;
  thinking?: boolean;
  onRate?: (rating: number) => void;
  onRequestHuman?: () => void;
  onCardAction?: (action: string) => void;
  contract?: SupportContract;
}) {
  const t = useT();
  const [acked, setAcked] = useState<Record<string, boolean>>({});
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
                />
              );
            }
            if (m.authorKind === "system" || m.messageKind === "system") {
              const resolved = /resolv/i.test(m.body);
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
                      background: resolved ? COLORS.success : COLORS.coral,
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
                      {acked[m.id] ? null : (
                        <>
                          <span style={{ fontSize: 11, color: COLORS.royal }}>{t("dashboard.adminSupport.didThisHelp")}</span>
                          <button
                            type="button"
                            onClick={() => setAcked((prev) => ({ ...prev, [m.id]: true }))}
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
          <TypingDots color={COLORS.royal} />
        </div>
      ) : null}
      {ticket?.status === "resolved" && onRate && ticket.satisfactionRating == null ? (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "12px 0" }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={t("dashboard.adminSupport.rateAria")}
              onClick={() => onRate(n)}
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                border: `1px solid ${COLORS.success}`,
                background: COLORS.successSoft,
                color: COLORS.successDeep,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {n}
            </button>
          ))}
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
