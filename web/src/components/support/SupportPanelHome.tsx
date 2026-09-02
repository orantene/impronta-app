"use client";

import { useState } from "react";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { SUPPORT_AGENT_VARS } from "@/lib/support/support-persona";
import { Icon } from "@/components/admin/shell/internal/primitives";
import { COLORS, FONTS } from "./support-tokens";
import { ReplayConsent } from "./ReplayConsent";
import { relTime } from "./support-rel-time";
import type { SupportTicketSummary } from "@/lib/support/support-types";

export function HomeView({
  ideaSent,
  onDismissIdeaSent,
  firstName,
  ask,
  setAsk,
  onSubmit,
  sending,
  error,
  recent,
  onOpenTicket,
  onStartTicket,
  onAskFeature,
  onMessageOran,
  replayEnabled,
  attachReplay,
  setAttachReplay,
}: {
  ideaSent: number | null;
  onDismissIdeaSent: () => void;
  firstName: string;
  ask: string;
  setAsk: (v: string) => void;
  onSubmit: () => void;
  sending: boolean;
  error: string | null;
  recent: SupportTicketSummary[];
  onOpenTicket: (id: string) => void;
  onStartTicket: () => void;
  onAskFeature: () => void;
  onMessageOran: () => void;
  replayEnabled: boolean;
  attachReplay: boolean;
  setAttachReplay: (v: boolean) => void;
}) {
  const t = useT();
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontFamily: FONTS.display, fontSize: 19, fontWeight: 600, color: COLORS.ink }}>
          {interpolate(t("dashboard.adminSupport.greeting"), { name: firstName })}
        </div>
        <div style={{ fontSize: 13, color: COLORS.inkMuted, marginTop: 4 }}>
          {t("dashboard.adminSupport.subline")}
        </div>
      </div>
      {ideaSent != null ? (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: COLORS.royalSoft,
            border: "1px solid rgba(95,75,139,0.25)",
            borderRadius: 12,
            padding: "10px 12px",
          }}
        >
          <Icon name="sparkle" size={14} color={COLORS.royal} />
          <span style={{ flex: 1, fontSize: 12.5, color: COLORS.royalDeep, lineHeight: 1.4 }}>
            {interpolate(interpolate(t("dashboard.adminSupport.ideaThanks"), SUPPORT_AGENT_VARS), { n: String(ideaSent) })}
          </span>
          <button
            type="button"
            onClick={onDismissIdeaSent}
            aria-label={t("dashboard.adminSupport.close")}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: COLORS.royalDeep,
              padding: 6,
              margin: -6,
              display: "flex",
            }}
          >
            <Icon name="x" size={13} color={COLORS.royalDeep} />
          </button>
        </div>
      ) : null}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: COLORS.card,
          border: "1px solid rgba(95,75,139,0.35)",
          borderRadius: 14,
          padding: "8px 10px 8px 12px",
        }}
      >
        <Icon name="sparkle" size={16} color={COLORS.royal} />
        <input
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder={t("dashboard.adminSupport.askPlaceholder")}
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            fontSize: 13.5,
            fontFamily: FONTS.body,
            background: "transparent",
            color: COLORS.ink,
          }}
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!ask.trim() || sending}
          aria-label={t("dashboard.adminSupport.send")}
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            border: "none",
            background: ask.trim() ? COLORS.fill : COLORS.surfaceAlt,
            color: "#fff",
            cursor: ask.trim() ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="send" size={14} color={ask.trim() ? "#fff" : COLORS.inkDim} />
        </button>
      </div>
      {error ? (
        <div role="alert" style={{ fontSize: 12, color: COLORS.critical }}>
          {error}
        </div>
      ) : null}
      {replayEnabled ? (
        <ReplayConsent checked={attachReplay} onChange={setAttachReplay} />
      ) : null}
      {recent.length > 0 ? (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: COLORS.inkDim, marginBottom: 8 }}>
            {t("dashboard.adminSupport.recent")}
          </div>
          {recent.map((row) => (
            <TicketRow key={row.id} row={row} onOpen={() => onOpenTicket(row.id)} />
          ))}
        </div>
      ) : null}
      <button
        type="button"
        onClick={onStartTicket}
        style={{
          border: `1px solid ${COLORS.border}`,
          background: COLORS.card,
          borderRadius: 10,
          padding: "10px 12px",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          color: COLORS.ink,
        }}
      >
        {t("dashboard.adminSupport.startTicket")}
      </button>
      {/* Idea intake: a peer CTA, not a menu item — the owner wants these. */}
      <button
        type="button"
        onClick={onAskFeature}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          border: `1px solid rgba(95,75,139,0.35)`,
          background: COLORS.royalSoft,
          borderRadius: 10,
          padding: "10px 12px",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          color: COLORS.royalDeep,
        }}
      >
        <Icon name="sparkle" size={14} color={COLORS.royal} />
        {t("dashboard.adminSupport.askFeature")}
      </button>
      <button
        type="button"
        onClick={onMessageOran}
        style={{ border: "none", background: "transparent", color: COLORS.royal, fontSize: 12.5, cursor: "pointer" }}
      >
        {interpolate(t("dashboard.adminSupport.messageOran"), SUPPORT_AGENT_VARS)}
      </button>
    </div>
  );
}

export function TicketRow({ row, onOpen }: { row: SupportTicketSummary; onOpen: () => void }) {
  const t = useT();
  const waitingYou = row.status === "open" && row.waitingOn === "requester";
  const withSupport = row.status === "open" && row.waitingOn === "support";
  const label = waitingYou
    ? t("dashboard.adminSupport.statusWaitingYou")
    : withSupport
      ? t("dashboard.adminSupport.statusWithSupport")
      : t("dashboard.adminSupport.statusResolved");
  const pillBg = waitingYou ? COLORS.coralSoft : row.status !== "open" ? COLORS.successSoft : COLORS.surfaceAlt;
  const pillFg = waitingYou ? COLORS.coralDeep : row.status !== "open" ? COLORS.successDeep : COLORS.inkMuted;
  return (
    <button
      type="button"
      onClick={onOpen}
      data-tulala-support-ticket-row=""
      style={{
        display: "flex",
        width: "100%",
        textAlign: "left",
        gap: 10,
        padding: "10px 4px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        alignItems: "center",
      }}
    >
      {row.unread ? (
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.coral, flexShrink: 0 }} />
      ) : (
        <span style={{ width: 8, height: 8, flexShrink: 0 }} />
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: COLORS.ink }}>{row.subject || t("dashboard.adminSupport.untitled")}</span>
        <span style={{ display: "block", fontSize: 12, color: COLORS.inkDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.lastMessagePreview}
        </span>
      </span>
      <span style={{ fontSize: 10.5, color: COLORS.inkDim, flexShrink: 0, whiteSpace: "nowrap" }}>
        {relTime(row.lastMessageAt)}
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          background: pillBg,
          color: pillFg,
          borderRadius: 999,
          padding: "3px 8px",
          flexShrink: 0,
        }}
      >
        {label}
      </span>
    </button>
  );
}

