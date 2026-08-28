"use client";

import { useState } from "react";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { COLORS, RADIUS } from "./support-tokens";
import { acceptLiveShareFromCard } from "@/lib/support/replay/LiveShareHost";
import { declineLiveViewAction } from "@/lib/support/replay/live-actions";
import {
  approveProposedActionAction,
  declineProposedActionAction,
} from "@/lib/support/proposed-actions/actions";

export type SupportThreadTone = "light" | "hq";

export function SupportCardRenderer({
  payload,
  onAction,
  tone,
  liveShareAvailable = true,
}: {
  payload: Record<string, unknown>;
  onAction?: (action: string) => void;
  tone: SupportThreadTone;
  liveShareAvailable?: boolean;
}) {
  const t = useT();
  const [liveDone, setLiveDone] = useState(false);
  const kind = typeof payload.kind === "string" ? payload.kind : "generic";
  const ink = tone === "hq" ? "#F5F2EB" : COLORS.ink;
  const muted = tone === "hq" ? "rgba(245,242,235,0.62)" : COLORS.inkMuted;
  const cardBg = tone === "hq" ? "rgba(255,255,255,0.04)" : COLORS.card;
  const border = tone === "hq" ? "rgba(255,255,255,0.10)" : COLORS.border;
  const ticketId = typeof payload.ticketId === "string" ? payload.ticketId : null;
  const actionId = typeof payload.actionId === "string" ? payload.actionId : null;
  const [fixDone, setFixDone] = useState(false);
  const showLiveActions =
    kind === "live-view" && tone !== "hq" && !liveDone && ticketId && liveShareAvailable;
  const showFixActions = kind === "proposed-action" && tone !== "hq" && !fixDone && actionId;

  if (kind === "handoff" && tone === "hq") {
    return (
      <div style={{ textAlign: "center", fontSize: 11, color: muted, margin: "8px 0" }}>
        {t("dashboard.adminSupport.handoffHq")}
      </div>
    );
  }

  if (kind === "handoff") {
    const hasPhone = payload.hasPhone === true;
    return (
      <div
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 12,
          padding: "14px 16px",
          maxWidth: "86%",
          margin: "8px auto",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: ink, marginBottom: 6 }}>
          {t("dashboard.adminSupport.handoffTitle")}
        </div>
        <div style={{ fontSize: 12.5, color: muted, lineHeight: 1.45, marginBottom: hasPhone ? 0 : 10 }}>
          {t("dashboard.adminSupport.handoffBody")}
        </div>
        {!hasPhone && tone !== "hq" ? (
          <button
            type="button"
            onClick={() => onAction?.("add-phone")}
            style={{
              border: "none",
              background: COLORS.fill,
              color: "#fff",
              borderRadius: 8,
              padding: "7px 12px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <PhoneGlyph />
            {t("dashboard.adminSupport.addNumber")}
          </button>
        ) : null}
      </div>
    );
  }

  if (kind === "callback-confirmed") {
    const phone = typeof payload.phone === "string" ? payload.phone : "";
    return (
      <div
        style={{
          background: cardBg,
          border: `1px solid ${border}`,
          borderRadius: 12,
          padding: "14px 16px",
          maxWidth: "86%",
          margin: "8px auto",
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
        }}
      >
        <span style={{ color: COLORS.brand, marginTop: 2 }}>
          <PhoneGlyph />
        </span>
        <div style={{ fontSize: 13, color: ink, lineHeight: 1.45 }}>
          {interpolate(t("dashboard.adminSupport.callbackConfirmed"), { phone })}
        </div>
      </div>
    );
  }

  if (kind === "issue-fixed") {
    const note = typeof payload.note === "string" && payload.note.trim() ? payload.note.trim() : null;
    return (
      <div
        style={{
          background: COLORS.successSoft,
          border: "1px solid rgba(46,125,91,0.25)",
          borderRadius: 12,
          padding: "14px 16px",
          maxWidth: "86%",
          margin: "8px auto",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="9" stroke={COLORS.success} strokeWidth="1.8" />
            <path d="M8 12.5l2.5 2.5L16 9" stroke={COLORS.success} strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.successDeep }}>
            {t("dashboard.adminSupport.fixedTitle")}
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: muted, lineHeight: 1.45 }}>
          {note || t("dashboard.adminSupport.fixedBody")}
        </div>
      </div>
    );
  }

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
      {kind === "callback" || kind === "auto-close" || kind === "offer-human" || showLiveActions ? (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              if (showLiveActions && ticketId) {
                void acceptLiveShareFromCard(ticketId);
                setLiveDone(true);
                return;
              }
              onAction?.(
                kind === "callback" ? "add-phone" : kind === "auto-close" ? "keep-open" : "talk-human",
              );
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
            {kind === "callback"
              ? t("dashboard.adminSupport.addNumber")
              : kind === "auto-close"
                ? t("dashboard.adminSupport.keepOpen")
                : kind === "live-view"
                  ? t("dashboard.adminSupport.acceptLiveView")
                  : t("dashboard.adminSupport.talkToHuman")}
          </button>
          {showLiveActions && ticketId ? (
            <button
              type="button"
              onClick={() => {
                void declineLiveViewAction({ ticketId });
                setLiveDone(true);
              }}
              style={{
                border: `1px solid ${border}`,
                background: "transparent",
                color: ink,
                borderRadius: 8,
                padding: "7px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {t("dashboard.adminSupport.declineLiveView")}
            </button>
          ) : null}
        </div>
      ) : null}
      {kind === "proposed-action" ? (
        <>
          {payload.preview != null ? (
            <div
              style={{
                background: tone === "hq" ? "rgba(255,255,255,0.04)" : COLORS.surface,
                border: `1px solid ${border}`,
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 12,
                color: ink,
                marginBottom: 10,
                whiteSpace: "pre-wrap",
              }}
            >
              {typeof payload.preview === "string"
                ? payload.preview
                : JSON.stringify(payload.preview, null, 2)}
            </div>
          ) : null}
          {showFixActions && actionId ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => {
                  void approveProposedActionAction({ actionId });
                  setFixDone(true);
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
                {t("dashboard.adminSupport.approveAndApply")}
              </button>
              <button
                type="button"
                onClick={() => {
                  void declineProposedActionAction({ actionId });
                  setFixDone(true);
                }}
                style={{
                  border: `1px solid ${border}`,
                  background: "transparent",
                  color: ink,
                  borderRadius: 8,
                  padding: "7px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {t("dashboard.adminSupport.declineFix")}
              </button>
              <span style={{ marginLeft: "auto", fontSize: 10.5, color: muted }}>
                {t("dashboard.adminSupport.appliedChangeLogged")}
              </span>
            </div>
          ) : (
            <div style={{ fontSize: 10.5, color: muted }}>{t("dashboard.adminSupport.appliedChangeLogged")}</div>
          )}
        </>
      ) : null}
    </div>
  );
}

function PhoneGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6.6 10.8c1.4 2.7 3.9 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.2 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.3 1.1L6.6 10.8z"
        fill="currentColor"
      />
    </svg>
  );
}
