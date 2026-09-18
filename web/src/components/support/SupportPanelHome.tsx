"use client";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { SUPPORT_AGENT_VARS } from "@/lib/support/support-persona";
import { Icon } from "@/components/admin/shell/internal/primitives";
import { COLORS, FONTS } from "./support-tokens";
import { ReplayConsent } from "./ReplayConsent";
import { relTime } from "./support-rel-time";
import { GuideHotspot } from "./GuideHotspot";
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
  helperMode = false,
  onOpenGuideArticle,
  onSeeAllTickets,
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
  /** Helper mode (plan §3, drawer target icon) — see GuideHotspot. */
  helperMode?: boolean;
  onOpenGuideArticle?: (nodeId: string) => void;
  onSeeAllTickets?: () => void;
}) {
  const t = useT();
  const unreadCount = recent.filter((r) => r.unread && r.status === "open").length;
  const noop = () => {};
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16, minHeight: "100%" }}>
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
            style={{ border: "none", background: "transparent", cursor: "pointer", color: COLORS.royalDeep, padding: 6, margin: -6, display: "flex" }}
          >
            <Icon name="x" size={13} color={COLORS.royalDeep} />
          </button>
        </div>
      ) : null}

      {/* The three ways in (B-002 mockup). "Start live chat" is the human
          path: it opens a thread with the support agent directly. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <GuideHotspot id="support.live-chat" label={interpolate(t("dashboard.adminSupport.helperReadAbout"), { what: t("dashboard.adminSupport.cardLiveChat") })} active={helperMode} onOpen={onOpenGuideArticle ?? noop}>
          <ActionCard icon="send" title={t("dashboard.adminSupport.cardLiveChat")} sub={t("dashboard.adminSupport.cardLiveChatSub")} primary onClick={onMessageOran} />
        </GuideHotspot>
        <GuideHotspot id="support.start-ticket" label={interpolate(t("dashboard.adminSupport.helperReadAbout"), { what: t("dashboard.adminSupport.cardTicket") })} active={helperMode} onOpen={onOpenGuideArticle ?? noop}>
          <ActionCard icon="ticket" title={t("dashboard.adminSupport.cardTicket")} sub={t("dashboard.adminSupport.cardTicketSub")} onClick={onStartTicket} />
        </GuideHotspot>
        <ActionCard icon="sparkle" title={t("dashboard.adminSupport.cardIdea")} sub={t("dashboard.adminSupport.cardIdeaSub")} onClick={onAskFeature} />
      </div>

      {/* AI ask: kept (it works and escalates to a human); below the cards
          so the three doors read first, as in the mockup. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 12,
          padding: "6px 6px 6px 12px",
        }}
      >
        <Icon name="sparkle" size={15} color={COLORS.inkDim} />
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
          style={{ flex: 1, border: "none", outline: "none", fontSize: 13, fontFamily: FONTS.body, background: "transparent", color: COLORS.ink }}
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!ask.trim() || sending}
          aria-label={t("dashboard.adminSupport.send")}
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            border: "none",
            background: ask.trim() ? COLORS.ink : COLORS.surfaceAlt,
            cursor: ask.trim() ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="send" size={13} color={ask.trim() ? "#fff" : COLORS.inkDim} />
        </button>
      </div>
      {error ? (
        <div role="alert" style={{ fontSize: 12, color: COLORS.critical }}>
          {error}
        </div>
      ) : null}
      {replayEnabled ? <ReplayConsent checked={attachReplay} onChange={setAttachReplay} /> : null}

      {recent.length > 0 ? (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: COLORS.inkDim, textTransform: "uppercase" }}>
              {t("dashboard.adminSupport.yourTickets")}
            </span>
            {unreadCount > 0 ? (
              <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.coralDeep, background: COLORS.coralSoft, padding: "1px 6px", borderRadius: 6 }}>
                {interpolate(t("dashboard.adminSupport.newReplies"), { n: String(unreadCount) })}
              </span>
            ) : null}
            <button
              type="button"
              onClick={onSeeAllTickets ?? noop}
              style={{ marginLeft: "auto", border: "none", background: "transparent", fontSize: 12, color: COLORS.inkMuted, cursor: "pointer", padding: 0 }}
            >
              {t("dashboard.adminSupport.seeAll")}
            </button>
          </div>
          {recent.map((row) => (
            <TicketRow key={row.id} row={row} onOpen={() => onOpenTicket(row.id)} />
          ))}
        </div>
      ) : null}

      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: COLORS.inkDim }}>
        <Icon name="book" size={14} color={COLORS.inkDim} />
        <span>{interpolate(t("dashboard.adminSupport.guideHint"), { guide: t("dashboard.adminSupport.tabGuide") })}</span>
      </div>
    </div>
  );
}

function ActionCard({
  icon,
  title,
  sub,
  primary,
  onClick,
}: {
  icon: "send" | "ticket" | "sparkle";
  title: string;
  sub: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "12px 14px",
        borderRadius: 12,
        background: COLORS.card,
        border: `1px solid ${primary ? COLORS.borderStrong : COLORS.border}`,
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          background: primary ? COLORS.accentSoft : COLORS.surfaceAlt,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={17} color={primary ? COLORS.accent : COLORS.ink} stroke={1.8} />
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.ink }}>{title}</span>
        <span style={{ fontSize: 12, color: COLORS.inkMuted }}>{sub}</span>
      </span>
      <Icon name="chevron-right" size={15} color={COLORS.inkDim} />
    </button>
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

