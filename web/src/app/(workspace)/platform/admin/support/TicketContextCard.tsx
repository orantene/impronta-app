"use client";

import Link from "next/link";
import { useT } from "@/i18n/use-t";
import { HQ, HQ_F, PlanChip } from "../tenants/hq-kit";
import type { HqTicketContext } from "@/lib/support/load-hq";
import type { SupportTicketRow } from "@/lib/support/support-types";

function waHref(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits.replace(/^\+/, "")}`;
}

export function TicketContextCard({
  ticket,
  context,
  onOpenPast,
  viewingNow = false,
}: {
  ticket: SupportTicketRow;
  context: HqTicketContext;
  onOpenPast: (id: string) => void;
  viewingNow?: boolean;
}) {
  const t = useT();
  const wa = ticket.contactPhone ? waHref(ticket.contactPhone) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16, overflow: "auto" }}>
      <section>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: HQ.inkDim, marginBottom: 8 }}>
          {t("dashboard.platform.support.contextWorkspace")}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: HQ.ink }}>
            {context.tenantName ?? t("dashboard.platform.support.noWorkspace")}
          </span>
          {context.planTier ? <PlanChip plan={context.planTier} /> : null}
        </div>
        {context.tenantSlug ? (
          <Link
            href={`/platform/admin/tenants`}
            style={{ fontSize: 12, color: HQ.green, marginTop: 6, display: "inline-block" }}
          >
            {t("dashboard.platform.support.openTenant")}
          </Link>
        ) : null}
      </section>

      <section>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: HQ.inkDim, marginBottom: 8 }}>
          {t("dashboard.platform.support.contextRequester")}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: HQ.ink, display: "flex", alignItems: "center", gap: 8 }}>
          {context.requesterName ?? t("dashboard.platform.support.unknownRequester")}
          {viewingNow ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 500, color: HQ.green }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: HQ.green }} />
              {t("dashboard.platform.support.viewingNow")}
            </span>
          ) : null}
        </div>
        <div style={{ fontSize: 12, color: HQ.inkMuted, marginTop: 4 }}>
          {ticket.surface} {context.requesterEmail ? `· ${context.requesterEmail}` : ""}
        </div>
        {ticket.surface === "guest" && ticket.requesterUserId ? (
          <div style={{ fontSize: 11, color: HQ.green, marginTop: 4 }}>
            {t("dashboard.platform.support.guestClaimed")}
          </div>
        ) : null}
        {ticket.surface === "guest" &&
        !ticket.contactEmail &&
        (ticket.escalatedAt || ticket.handledBy === "human" || ticket.waitingOn === "support") ? (
          <div
            style={{
              marginTop: 8,
              padding: "6px 8px",
              borderRadius: 6,
              background: "rgba(194,106,69,0.18)",
              color: "#C26A45",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
            }}
          >
            {t("dashboard.platform.support.noReplyChannel")}
          </div>
        ) : null}
        {context.requesterCreatedAt ? (
          <div style={{ fontSize: 11, color: HQ.inkDim, marginTop: 4, fontFamily: HQ_F }}>
            {t("dashboard.platform.support.memberSince")} {context.requesterCreatedAt.slice(0, 10)}
          </div>
        ) : null}
      </section>

      <section>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: HQ.inkDim, marginBottom: 8 }}>
          {t("dashboard.platform.support.contextContact")}
        </div>
        {ticket.contactPhone ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <a href={`tel:${ticket.contactPhone}`} style={{ color: HQ.ink, fontSize: 13 }}>
              {ticket.contactPhone}
            </a>
            {wa ? (
              <a href={wa} target="_blank" rel="noreferrer" style={{ color: HQ.green, fontSize: 12 }}>
                {t("dashboard.platform.support.whatsapp")}
              </a>
            ) : null}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: HQ.inkDim }}>{t("dashboard.platform.support.noPhone")}</div>
        )}
        {ticket.callbackRequested ? (
          <div style={{ color: "#C26A45", fontSize: 12, marginTop: 8 }}>
            {t("dashboard.platform.support.callbackRequested")}
            {ticket.callbackPref ? ` · ${ticket.callbackPref}` : ""}
          </div>
        ) : null}
        {ticket.surface === "guest" ? (
          <div style={{ marginTop: 10, fontSize: 12, color: HQ.inkMuted }}>
            {ticket.originSurfaceSlug ? (
              <div>
                {t("dashboard.platform.support.guestOrigin")} {ticket.originSurfaceSlug}
              </div>
            ) : null}
            {typeof ticket.metadata.locale === "string" ? (
              <div>{t("dashboard.platform.support.locale")} {ticket.metadata.locale}</div>
            ) : null}
            {typeof ticket.metadata.lead_id === "string" ? (
              <div>
                {t("dashboard.platform.support.guestMatchedLead")} {ticket.metadata.lead_id}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: HQ.inkDim, marginBottom: 8 }}>
          {t("dashboard.platform.support.contextAudit")}
        </div>
        {context.auditEvents.length === 0 ? (
          <div style={{ fontSize: 12, color: HQ.inkDim }}>{t("dashboard.platform.support.noAudit")}</div>
        ) : (
          context.auditEvents.map((ev, i) => (
            <div key={`${ev.action}-${i}`} style={{ fontSize: 12, color: HQ.inkMuted, marginBottom: 6 }}>
              {ev.summary || ev.action}
            </div>
          ))
        )}
      </section>

      <section>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: HQ.inkDim, marginBottom: 8 }}>
          {t("dashboard.platform.support.contextPast")}
        </div>
        {context.pastTickets.length === 0 ? (
          <div style={{ fontSize: 12, color: HQ.inkDim }}>{t("dashboard.platform.support.noPast")}</div>
        ) : (
          context.pastTickets.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => onOpenPast(row.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                background: "transparent",
                border: "none",
                color: HQ.ink,
                fontSize: 12,
                padding: "6px 0",
                cursor: "pointer",
              }}
            >
              #{row.ticketNumber} · {row.subject || t("dashboard.adminSupport.untitled")}
            </button>
          ))
        )}
      </section>
    </div>
  );
}
