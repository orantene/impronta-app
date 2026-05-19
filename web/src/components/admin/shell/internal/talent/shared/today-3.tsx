"use client";

import { useState, type ReactNode } from "react";
import { TALENT_RATE_FOR_CONV } from "../../messages";
import { Avatar, Bullet, ClientTrustChip, Icon } from "../../primitives";
import { COLORS, FONTS, TRANSITION, useAdminShell, type TalentRequest } from "../../state";
import { DateBlock, KindChip, clientInitialsLocal } from "./today-1";
import { SectionHeader } from "./today-2";



/** Inline clickable name in the hero headline — underlined on hover.
 *  Teaches the user that names are entry points to their detail drawer. */
export function HeroNameLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: "transparent",
        border: "none",
        padding: 0,
        font: "inherit",
        color: COLORS.ink,
        cursor: "pointer",
        textDecoration: hover ? "underline" : "none",
        textDecorationThickness: 1,
        textUnderlineOffset: 4,
        textDecorationColor: COLORS.coral,
      }}
    >
      {children}
    </button>
  );
}


export function HeroStat({
  label,
  value,
  caption,
  captionTone,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  caption?: string;
  /** Caption tint — `success` for positive deltas, default ink-dim. */
  captionTone?: "success" | "indigo" | "coral" | "default";
  tone: "success" | "indigo" | "ink";
  onClick?: () => void;
}) {
  const fg =
    tone === "success" ? COLORS.green : tone === "indigo" ? COLORS.indigo : COLORS.ink;
  const captionColor =
    captionTone === "success"
      ? COLORS.green
      : captionTone === "indigo"
        ? COLORS.indigo
        : captionTone === "coral"
          ? COLORS.coral
          : COLORS.inkDim;
  const inner = (
    <>
      <div
        style={{
          fontFamily: FONTS.body,
          fontSize: 10.5,
          fontWeight: 600,
                    color: COLORS.inkMuted,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span
          style={{
            fontFamily: FONTS.display,
            fontSize: 18,
            fontWeight: 500,
            color: fg,
            letterSpacing: -0.2,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>
        {caption && (
          <span
            style={{
              fontFamily: FONTS.body,
              fontSize: 11.5,
              color: captionColor,
              fontWeight: captionTone === "success" ? 500 : 400,
            }}
          >
            {caption}
          </span>
        )}
      </div>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 1,
          minWidth: 0,
          background: "transparent",
          border: "none",
          padding: 0,
          textAlign: "left",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {inner}
      </button>
    );
  }
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        minWidth: 0,
      }}
    >
      {inner}
    </div>
  );
}


export function HeroStatDivider() {
  return (
    <span
      aria-hidden
      data-tulala-stat-divider
      style={{
        width: 1,
        height: 28,
        background: COLORS.borderSoft,
        margin: "0 14px",
        flexShrink: 0,
      }}
    />
  );
}


/**
 * Single-grain "Needs reply" list. Coral edge to mark action-needed.
 * All rows here require the talent's reply — no in-progress pipeline,
 * no completed updates, no analytics. One section, one job.
 */
export function NeedsReplySection({
  conversations,
  onOpenInMessages,
  onSeeAll,
}: {
  conversations: import("../../talent").Conversation[];
  /** Pin a conversation + route to messages shell. Single canonical action. */
  onOpenInMessages: (convId: string) => void;
  onSeeAll: () => void;
}) {
  // Subtitle counts the kinds of action-needed: inquiry rows ask for
  // a quote, hold rows ask for a confirmation. Same buckets the
  // messages shell uses, so the talent reads the same words on both
  // surfaces.
  const inquiryCount = conversations.filter((c) => c.stage === "inquiry").length;
  const holdCount = conversations.filter((c) => c.stage === "hold").length;
  const subtitleParts = [
    inquiryCount > 0 && `${inquiryCount} ${inquiryCount === 1 ? "offer" : "offers"}`,
    holdCount > 0 && `${holdCount} ${holdCount === 1 ? "hold" : "holds"}`,
  ].filter(Boolean).join(" · ");
  return (
    <section
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        padding: "16px 18px",
        marginBottom: 12,
      }}
    >
      <SectionHeader
        title="Needs your reply"
        subtitle={subtitleParts || `${conversations.length} waiting · sorted by urgency`}
        actionLabel="Open inbox →"
        onAction={onSeeAll}
      />
      <div style={{ marginTop: 4 }}>
        {conversations.map((c) => (
          <ConversationReplyRow
            key={c.id}
            conv={c}
            onOpen={() => onOpenInMessages(c.id)}
          />
        ))}
      </div>
    </section>
  );
}


// ── ConversationReplyRow ──
// One row of "Needs your reply", driven directly by a Conversation.
// Mirrors RequestRow visually (avatar · client+brief · kind chip · date ·
// amount · age · hover Reply) but routes every click into the messages
// shell with the conversation pinned. The talent never has to "find"
// the thread — they're already in it the moment they click.
function ConversationReplyRow({
  conv,
  onOpen,
}: {
  conv: import("../../talent").Conversation;
  onOpen: () => void;
}) {
  const [hover, setHover] = useState(false);
  // Stage → kind chip styling. inquiry = quote requested (coral),
  // hold = client deciding (amber). Same tone vocabulary as the
  // messages shell so the chip means the same thing on both surfaces.
  const km =
    conv.stage === "inquiry" ? { label: "Offer", tone: "coral" as const }
    : conv.stage === "hold" ? { label: "Hold", tone: "amber" as const }
    : { label: "Open", tone: "ink" as const };
  // Take-home rate the talent earns on this job (talent POV). Looked
  // up from the same TALENT_RATE_FOR_CONV map the messages shell uses.
  const rate = TALENT_RATE_FOR_CONV[conv.id];
  // Age coloring escalates over time — same thresholds as the
  // existing RequestRow so the urgency cue feels consistent.
  const ageHrs = conv.lastMessage.ageHrs;
  const ageLbl = ageHrs < 24 ? `${ageHrs}h ago` : `${Math.floor(ageHrs / 24)}d ago`;
  const ageColor = ageHrs >= 24 ? COLORS.coralDeep : ageHrs >= 12 ? COLORS.coral : COLORS.inkDim;
  const ageWeight = ageHrs >= 24 ? 700 : ageHrs >= 12 ? 500 : 400;
  return (
    <button
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 0",
        borderTop: `1px solid ${COLORS.borderSoft}`,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        transition: `background ${TRANSITION.micro}`,
      }}
    >
      <Avatar
        size={36}
        tone="auto"
        hashSeed={conv.client}
        initials={clientInitialsLocal(conv.client)}
      />
      <div className="flex-1 min-w-0">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: FONTS.body,
            fontSize: 13.5,
            fontWeight: 500,
            color: COLORS.ink,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {conv.client}
          <Bullet />
          <span style={{ color: COLORS.inkMuted, fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis" }}>
            {conv.brief}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 2,
            fontSize: 11.5,
          }}
        >
          <KindChip label={km.label} tone={km.tone} />
          <span style={{ color: COLORS.inkMuted }}>
            {conv.date}
            {conv.date && rate && " · "}
            {rate && (
              <span style={{ color: COLORS.ink, fontWeight: 500 }}>{rate}</span>
            )}
          </span>
        </div>
      </div>
      {hover && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "5px 10px",
            borderRadius: 7,
            background: COLORS.coralSoft,
            color: COLORS.coralDeep,
            fontFamily: FONTS.body,
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: -0.05,
          }}
        >
          Reply →
        </span>
      )}
      <span
        style={{
          fontFamily: FONTS.body,
          fontSize: 11.5,
          color: ageColor,
          fontWeight: ageWeight,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {ageLbl}
      </span>
      <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
    </button>
  );
}


function RequestRow({
  request,
  compact = false,
}: {
  request: TalentRequest;
  /**
   * Compact mode for high-density surfaces (Talent Today). Drops:
   *   - ClientTrustChip (already-vetted context — noise on Today)
   *   - "via {agency}" prefix (single-agency talent — redundant)
   * Adds:
   *   - Coral-escalated timestamp when age > 12h (urgency cue)
   *   - Hover "Reply" button (per-row primary affordance)
   *   - Date block on the left (Calendar event-row pattern)
   */
  compact?: boolean;
}) {
  const { openDrawer } = useAdminShell();
  const [hover, setHover] = useState(false);
  const kindMeta: Record<TalentRequest["kind"], { label: string; tone: "coral" | "indigo" | "amber" | "ink" }> = {
    offer: { label: "Offer", tone: "coral" },
    hold: { label: "Hold", tone: "coral" },
    casting: { label: "Casting", tone: "indigo" },
    request: { label: "Request", tone: "ink" },
  };
  const km = kindMeta[request.kind];
  // Parse the request date for the date block. Handles "Tue · May 6",
  // "May 18–20", "Apr 30" formats.
  const dateMatch = request.date?.match(/([A-Za-z]+)\s+(\d{1,2})/);
  const month = dateMatch?.[1]?.toUpperCase();
  const day = dateMatch?.[2];
  // Timestamp urgency: 0–12h neutral, 12–24h coral, >24h coral bold.
  // Pressure rises with time.
  const ageLabel =
    request.ageHrs < 24 ? `${request.ageHrs}h ago` : `${Math.floor(request.ageHrs / 24)}d ago`;
  const ageColor =
    request.ageHrs >= 24
      ? COLORS.coralDeep
      : request.ageHrs >= 12
        ? COLORS.coral
        : COLORS.inkDim;
  const ageWeight = request.ageHrs >= 24 ? 700 : request.ageHrs >= 12 ? 500 : 400;
  return (
    <button
      onClick={() => openDrawer("talent-offer-detail", { id: request.id })}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 0",
        borderTop: `1px solid ${COLORS.borderSoft}`,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        transition: `background ${TRANSITION.micro}`,
      }}
    >
      {/* Client avatar on the left — same pattern as "Inquiries you're
          in" + Recent earnings. Brand identity is what the talent scans
          for; date / kind move to the second meta line. Falls back to the
          KindChip-leading layout when not in compact mode (legacy use
          on other surfaces). */}
      {compact ? (
        <Avatar
          size={36}
          tone="auto"
          hashSeed={request.client}
          initials={clientInitialsLocal(request.client)}
        />
      ) : (
        <KindChip label={km.label} tone={km.tone} />
      )}
      <div className="flex-1 min-w-0">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: FONTS.body,
            fontSize: 13.5,
            fontWeight: 500,
            color: COLORS.ink,
          }}
        >
          {request.client}
          {!compact && <ClientTrustChip level={request.clientTrust} compact />}
          <Bullet />
          <span style={{ color: COLORS.inkMuted, fontWeight: 400 }}>{request.brief}</span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 2,
            fontSize: 11.5,
          }}
        >
          {compact && <KindChip label={km.label} tone={km.tone} />}
          <span style={{ color: COLORS.inkMuted }}>
            {!compact && (
              <>
                via {request.agency}
                {(request.date || request.amount) && " · "}
              </>
            )}
            {request.date}
            {request.date && request.amount && " · "}
            {request.amount && (
              <span style={{ color: COLORS.ink, fontWeight: 500 }}>{request.amount}</span>
            )}
          </span>
        </div>
      </div>
      {/* Hover Reply button — per-row primary affordance.
          Click opens the offer detail drawer (same target as the row), but
          the explicit "Reply" label teaches the action. After ~5 exposures
          the user reaches for it directly instead of scanning. */}
      {compact && hover && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "5px 10px",
            borderRadius: 7,
            background: COLORS.coralSoft,
            color: COLORS.coralDeep,
            fontFamily: FONTS.body,
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: -0.05,
          }}
        >
          Reply →
        </span>
      )}
      <span
        style={{
          fontFamily: FONTS.body,
          fontSize: 11.5,
          color: ageColor,
          fontWeight: ageWeight,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {ageLabel}
      </span>
      <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
    </button>
  );
}


// ── ConversationCalendarRow ──
// Conversation-driven sibling of BookingRow. Used by Today's "Next on
// the calendar" feed when the row data comes from MOCK_CONVERSATIONS.
// Click → pin conversation + pin "logistics" tab → land on the call
// sheet inside the messages shell.
export function ConversationCalendarRow({
  conv,
  onOpen,
}: {
  conv: import("../../talent").Conversation;
  onOpen: () => void;
}) {
  // Parse the conversation's date label into a date-block. Handles:
  //   "Wed, May 14"  →  MAY 14
  //   "May 14–15"    →  MAY 14
  //   "Sat, Jun 21"  →  JUN 21
  //   "Jul 4–5"      →  JUL  4
  // Falls back to "—" if the format isn't recognized.
  const dateMatch = conv.date?.match(/([A-Za-z]+)\s+(\d{1,2})/);
  const month = dateMatch?.[1]?.toUpperCase() ?? "—";
  const day = dateMatch?.[2] ?? "—";
  // Take-home rate is the most-scanned numeric for talent on a booked
  // job. Same source as the messages shell so they always agree.
  const rate = TALENT_RATE_FOR_CONV[conv.id] ?? "—";
  // Pull the call time + a short location label from the pinned info
  // on the conversation. Both surface in the inline meta strip.
  const callTime = conv.pinned?.callTime ?? null;
  const locShort = conv.location ? conv.location.split(" · ")[0] : null;
  return (
    <button
      onClick={onOpen}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 0",
        borderTop: `1px solid ${COLORS.borderSoft}`,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        fontFamily: FONTS.body,
        transition: `background ${TRANSITION.micro}`,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.02)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <DateBlock day={day} month={month} />
      <div className="flex-1 min-w-0">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13.5,
            fontWeight: 500,
            color: COLORS.ink,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          <span>{conv.client}</span>
          <span style={{ color: COLORS.inkDim }}>·</span>
          <span style={{ color: COLORS.inkMuted, fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis" }}>
            {conv.brief}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 2,
            fontSize: 11.5,
          }}
        >
          <KindChip label="Booked" tone="success" />
          <span style={{ color: COLORS.inkMuted }}>
            {[locShort, callTime ? `call ${callTime}` : null].filter(Boolean).join(" · ")}
          </span>
        </div>
      </div>
      {rate !== "—" && (
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: COLORS.ink,
            fontVariantNumeric: "tabular-nums",
            flexShrink: 0,
          }}
        >
          {rate}
        </span>
      )}
      <Icon name="chevron-right" size={13} color={COLORS.inkDim} />
    </button>
  );
}
