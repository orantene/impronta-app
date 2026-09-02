"use client";

import type { CSSProperties } from "react";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { SupportAgentAvatar } from "./SupportAgentAvatar";
import { SUPPORT_AGENT_VARS } from "@/lib/support/support-persona";
import { Icon } from "@/components/admin/shell/internal/primitives";
import { COLORS, FONTS } from "./support-tokens";
import type { SupportTicketRow } from "@/lib/support/support-types";

export function SupportThreadStatusLine({
  ticket,
  inkMuted,
  hqOnline = false,
}: {
  ticket: SupportTicketRow | null;
  inkMuted?: string;
  hqOnline?: boolean;
}) {
  const t = useT();
  const muted = inkMuted ?? COLORS.inkMuted;
  if (!ticket) return null;

  const row: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    color: muted,
    minWidth: 0,
  };

  if (ticket.status === "open" && hqOnline) {
    return (
      <div style={row}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.success, flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {interpolate(t("dashboard.adminSupport.oranOnline"), SUPPORT_AGENT_VARS)}
        </span>
      </div>
    );
  }

  if (ticket.status === "resolved") {
    return (
      <div style={row}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.success, flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {t("dashboard.adminSupport.statusResolved")}
        </span>
      </div>
    );
  }
  if (ticket.status === "closed") {
    return (
      <div style={row}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.inkDim, flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {t("dashboard.adminSupport.statusClosed")}
        </span>
      </div>
    );
  }
  if (ticket.handledBy === "human") {
    return (
      <div style={row}>
        <span
          style={{
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: COLORS.brandSoft,
            color: "#0F4F3E",
            fontSize: 8,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          OT
        </span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {interpolate(t("dashboard.adminSupport.humanReplyEta"), SUPPORT_AGENT_VARS)}
        </span>
      </div>
    );
  }
  return (
    <div style={row}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: COLORS.royal, flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {t("dashboard.adminSupport.aiHandling")}
      </span>
    </div>
  );
}

export function SupportThreadHeader({
  ticket,
  onBack,
  hqOnline = false,
}: {
  ticket: SupportTicketRow | null;
  onBack: () => void;
  hqOnline?: boolean;
}) {
  const t = useT();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px 8px 6px",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
      }}
    >
      <button
        type="button"
        onClick={onBack}
        aria-label={t("dashboard.adminSupport.tabTickets")}
        style={{
          width: 44,
          height: 44,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: COLORS.ink,
          flexShrink: 0,
        }}
      >
        <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}>
          <Icon name="chevron-right" size={16} />
        </span>
      </button>
      {/*
        The face, next to the subject. A support thread that shows only text
        reads as a form submission; a face reads as a person on the other end,
        which is the entire difference the customer feels.
      */}
      <SupportAgentAvatar size={30} online={ticket?.status === "open" && hqOnline === true} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 13.5,
            fontWeight: 600,
            color: COLORS.ink,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {ticket?.subject || t("dashboard.adminSupport.untitled")}
        </div>
        <SupportThreadStatusLine ticket={ticket} hqOnline={hqOnline} />
      </div>
    </div>
  );
}
