"use client";

/**
 * InquiryWorkspaceDrawer — the shared messaging-first inquiry surface.
 *
 * This drawer is the prototype's reflection of the real `admin-inquiry-workspace-v3`
 * pattern (`web/src/app/(dashboard)/admin/inquiries/[id]/workspace-v3/*`):
 *
 *   ┌─────────────────────────────────────┐
 *   │  Header: status strip + chips       │
 *   │─────────────────────────────────────│
 *   │  [Client thread] [Group thread]     │   ← thread switcher
 *   │ ─────────────────  ─────────────────│
 *   │   Messages                  Rail    │   ← split-view
 *   │   ▾ Composer            ▾ panels    │
 *   └─────────────────────────────────────┘
 *
 * The same component is rendered by all three surfaces. Visibility is gated
 * by a `pov` prop:
 *   - admin   → sees both threads, all rail panels, can send messages
 *   - client  → sees ONLY the private thread + summary/offer/booking
 *   - talent  → sees ONLY the group thread + their own line item + booking
 */

import { useMemo, useState } from "react";
import {
  AGENCY_RELIABILITY,
  COLORS,
  FONTS,
  INQUIRY_STAGE_META,
  PAYOUT_RECEIVER_KIND_LABEL,
  PAYOUT_STATUS_META,
  REQUIREMENT_ROLE_META,
  RICH_INQUIRIES,
  describeSource,
  getPaymentSummary,
  getRichInquiry,
  useProto,
  type AgencyReliability,
  type Offer,
  type RichInquiry,
  type ThreadMessage,
  type ThreadType,
} from "./_state";
import {
  Avatar,
  Bullet,
  CapsLabel,
  ClientTrustChip,
  Divider,
  GhostButton,
  Icon,
  PaymentStatusChip,
  PayoutStatusChip,
  PrimaryButton,
  SecondaryButton,
  StatDot,
  DrawerShell,
} from "./_primitives";

// ─── Public entry point ───────────────────────────────────────────

export type InquiryWorkspacePov = "admin" | "client" | "talent";

export function InquiryWorkspaceDrawer() {
  const { state, closeDrawer } = useProto();
  const open = state.drawer.drawerId === "inquiry-workspace";
  const inquiryId = (state.drawer.payload?.inquiryId as string) ?? "RI-201";
  const povRaw = state.drawer.payload?.pov as InquiryWorkspacePov | undefined;
  const pov: InquiryWorkspacePov = povRaw ?? povFromSurface(state.surface);
  const inquiry = getRichInquiry(inquiryId) ?? RICH_INQUIRIES[0];

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      defaultSize="half"
      width={760}
      title={`${inquiry.clientName} · ${inquiry.brief}`}
      description={`${inquiry.id} · with ${inquiry.agencyName}${inquiry.date ? ` · ${inquiry.date}` : ""} · ${describeSource(inquiry.source).short}`}
      toolbar={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {pov !== "client" ? (
            <ClientTrustChip level={inquiry.clientTrust} compact />
          ) : null}
          <InquiryStatusChip inquiry={inquiry} />
        </span>
      }
    >
      <WorkspaceBody inquiry={inquiry} pov={pov} />
    </DrawerShell>
  );
}

function povFromSurface(surface: string): InquiryWorkspacePov {
  if (surface === "client") return "client";
  if (surface === "talent") return "talent";
  return "admin";
}

// ─── Body ────────────────────────────────────────────────────────

function WorkspaceBody({ inquiry, pov }: { inquiry: RichInquiry; pov: InquiryWorkspacePov }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
      <StatusStrip inquiry={inquiry} pov={pov} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 320px",
          gap: 16,
          flex: 1,
          minHeight: 0,
        }}
      >
        <MessagingPanel inquiry={inquiry} pov={pov} />
        <Rail inquiry={inquiry} pov={pov} />
      </div>
    </div>
  );
}

// ─── Status strip (sits between header and split view) ───────────

function StatusStrip({ inquiry, pov }: { inquiry: RichInquiry; pov: InquiryWorkspacePov }) {
  const meta = INQUIRY_STAGE_META[inquiry.stage];
  const nextLabel =
    inquiry.nextActionBy === "client"
      ? "Waiting on client"
      : inquiry.nextActionBy === "coordinator"
        ? "Waiting on coordinator"
        : inquiry.nextActionBy === "talent"
          ? "Waiting on talent"
          : inquiry.nextActionBy === "ops"
            ? "Waiting on ops"
            : "No-one — fully resolved";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "10px 14px",
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        fontFamily: FONTS.body,
      }}
    >
      <StatDot tone={meta.tone === "red" ? "red" : meta.tone} size={8} />
      <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
        {meta.label}
      </span>
      <span style={{ fontSize: 12, color: COLORS.inkMuted }}>{meta.description}</span>
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: 11.5, color: COLORS.inkMuted }}>{nextLabel}</span>
      {pov === "admin" && inquiry.coordinator && (
        <>
          <Bullet />
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11.5,
              color: COLORS.inkMuted,
            }}
          >
            <Avatar initials={inquiry.coordinator.initials} size={18} />
            {inquiry.coordinator.name}
          </span>
        </>
      )}
    </div>
  );
}

function InquiryStatusChip({ inquiry }: { inquiry: RichInquiry }) {
  const meta = INQUIRY_STAGE_META[inquiry.stage];
  const bgMap: Record<string, string> = {
    ink: "rgba(11,11,13,0.06)",
    amber: "rgba(82,96,109,0.12)",
    green: "rgba(46,125,91,0.10)",
    dim: "rgba(11,11,13,0.04)",
    red: "rgba(176,48,58,0.10)",
  };
  const fgMap: Record<string, string> = {
    ink: COLORS.ink,
    amber: "#3A4651",
    green: "#1F5C42",
    dim: COLORS.inkMuted,
    red: "#7A2026",
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: bgMap[meta.tone],
        color: fgMap[meta.tone],
        padding: "3px 10px",
        borderRadius: 999,
        fontFamily: FONTS.body,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.4,
        textTransform: "uppercase",
      }}
    >
      {meta.label}
    </span>
  );
}

// ─── Messaging (thread switcher + stream + composer) ─────────────

function MessagingPanel({ inquiry, pov }: { inquiry: RichInquiry; pov: InquiryWorkspacePov }) {
  // Talent only sees group; client only sees private; admin sees both.
  const visible: ThreadType[] = useMemo(() => {
    if (pov === "client") return ["private"];
    if (pov === "talent") return ["group"];
    return ["private", "group"];
  }, [pov]);

  const [active, setActive] = useState<ThreadType>(
    visible.includes("private") ? "private" : "group",
  );
  const [draft, setDraft] = useState("");
  const { toast } = useProto();

  const messages = inquiry.messages.filter((m) => m.threadType === active);

  const labels: Record<ThreadType, string> = {
    private: pov === "admin" ? "Client thread" : "With your coordinator",
    group: pov === "admin" ? "Talent group" : "Booking team",
  };

  const unread: Record<ThreadType, number> = {
    private: inquiry.unreadPrivate,
    group: inquiry.unreadGroup,
  };

  const send = () => {
    if (!draft.trim()) return;
    toast(`Message sent in ${active === "private" ? "client" : "group"} thread`);
    setDraft("");
  };

  return (
    <section
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {/* Thread switcher */}
      {visible.length > 1 && (
        <div
          style={{
            display: "flex",
            borderBottom: `1px solid ${COLORS.borderSoft}`,
            padding: "0 6px",
            gap: 0,
          }}
        >
          {visible.map((t) => {
            const isActive = active === t;
            return (
              <button
                key={t}
                onClick={() => setActive(t)}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "12px 14px",
                  fontFamily: FONTS.body,
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? COLORS.ink : COLORS.inkMuted,
                  letterSpacing: 0.1,
                  cursor: "pointer",
                  borderBottom: isActive ? `2px solid ${COLORS.ink}` : "2px solid transparent",
                  position: "relative",
                  marginBottom: -1,
                }}
              >
                {labels[t]}
                {unread[t] > 0 && (
                  <span
                    style={{
                      display: "inline-flex",
                      marginLeft: 8,
                      padding: "0 6px",
                      minWidth: 16,
                      height: 16,
                      borderRadius: 999,
                      background: COLORS.amber,
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 700,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {unread[t]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {visible.length === 1 && (
        <div
          style={{
            padding: "12px 16px",
            borderBottom: `1px solid ${COLORS.borderSoft}`,
            fontFamily: FONTS.body,
            fontSize: 12.5,
            color: COLORS.inkMuted,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Icon name="mail" size={12} />
          {labels[active]}
          {pov === "client" && (
            <>
              <Bullet />
              <span style={{ fontSize: 11.5, color: COLORS.inkDim }}>
                Direct line to your coordinator. Talent and other clients don't see this.
              </span>
            </>
          )}
          {pov === "talent" && (
            <>
              <Bullet />
              <span style={{ fontSize: 11.5, color: COLORS.inkDim }}>
                You and the other booked talent. The client doesn't see this.
              </span>
            </>
          )}
        </div>
      )}

      {/* Stream */}
      <div
        style={{
          flex: 1,
          minHeight: 320,
          overflowY: "auto",
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              color: COLORS.inkMuted,
              fontFamily: FONTS.body,
              fontSize: 13,
              textAlign: "center",
              padding: "40px 20px",
              gap: 6,
            }}
          >
            <Icon name="mail" size={20} color={COLORS.inkDim} />
            No messages here yet — write the first one.
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} pov={pov} />
        ))}
      </div>

      {/* Composer */}
      <div
        style={{
          borderTop: `1px solid ${COLORS.borderSoft}`,
          padding: 14,
          background: "rgba(11,11,13,0.015)",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              active === "private"
                ? pov === "client"
                  ? "Send your coordinator a note…"
                  : "Reply to the client…"
                : pov === "talent"
                  ? "Reply to the booking team…"
                  : "Message the booked talent…"
            }
            rows={2}
            style={{
              flex: 1,
              padding: "9px 12px",
              fontFamily: FONTS.body,
              fontSize: 13.5,
              color: COLORS.ink,
              background: "#fff",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              outline: "none",
              resize: "none",
              lineHeight: 1.55,
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
          />
          <PrimaryButton onClick={send}>Send</PrimaryButton>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 6,
            fontFamily: FONTS.body,
            fontSize: 11,
            color: COLORS.inkDim,
          }}
        >
          <span>⌘ ↵ to send</span>
          <Bullet />
          <span>
            Type <kbd
              style={{
                fontFamily: FONTS.mono,
                fontSize: 10.5,
                padding: "1px 5px",
                borderRadius: 4,
                background: "rgba(11,11,13,0.06)",
                color: COLORS.ink,
              }}
            >/</kbd> for snippets
          </span>
          <Bullet />
          <span>{active === "private" ? "Visible to client + coordinator" : "Visible to coordinator + booked talent"}</span>
        </div>
      </div>
    </section>
  );
}

function MessageBubble({ message, pov }: { message: ThreadMessage; pov: InquiryWorkspacePov }) {
  const isYou = Boolean(message.isYou);
  // T7: Coordinator messages get a distinct visual treatment in group thread
  const isCoordinator = message.senderRole === "coordinator" || message.senderRole === "admin";
  const isSystem = message.senderRole === "system";

  if (isSystem) {
    return (
      <div style={{ textAlign: "center", fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkDim, padding: "4px 0" }}>
        {message.body}
      </div>
    );
  }

  // Coordinator bubbles: cream tint + COORDINATOR chip when not the viewer's own message
  const bubbleBg =
    isYou ? COLORS.ink
    : isCoordinator && !isYou ? "rgba(82,96,109,0.06)"
    : "#fff";
  const bubbleBorder =
    isYou ? "none"
    : isCoordinator ? `1px solid rgba(82,96,109,0.20)`
    : `1px solid ${COLORS.borderSoft}`;

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        flexDirection: isYou ? "row-reverse" : "row",
      }}
    >
      <Avatar initials={message.senderInitials} size={28} tone={isYou ? "ink" : isCoordinator ? "warm" : "neutral"} />
      <div style={{ maxWidth: "82%", display: "flex", flexDirection: "column", alignItems: isYou ? "flex-end" : "flex-start" }}>
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            fontFamily: FONTS.body,
            fontSize: 11.5,
            color: COLORS.inkMuted,
            flexDirection: isYou ? "row-reverse" : "row",
          }}
        >
          <span style={{ color: COLORS.ink, fontWeight: 500 }}>
            {isYou ? "You" : message.senderName}
          </span>
          {/* T7: Coordinator chip — clearly labels who has authority in the thread */}
          {isCoordinator && !isYou && pov === "talent" && (
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: "#3A4651",
              background: "rgba(82,96,109,0.12)",
              padding: "2px 6px",
              borderRadius: 4,
            }}>
              Coordinator
            </span>
          )}
          <Bullet />
          <span>{message.ts}</span>
        </div>
        <div
          style={{
            marginTop: 4,
            padding: "9px 13px",
            background: bubbleBg,
            color: isYou ? "#fff" : COLORS.ink,
            border: bubbleBorder,
            borderRadius: 12,
            fontFamily: FONTS.body,
            fontSize: 13.5,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
          }}
        >
          {message.body}
        </div>
      </div>
    </div>
  );
}

// ─── Rail (right side) ─────────────────────────────────────────────

function Rail({ inquiry, pov }: { inquiry: RichInquiry; pov: InquiryWorkspacePov }) {
  return (
    <aside
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        overflowY: "auto",
        minHeight: 0,
        paddingBottom: 4,
      }}
    >
      <SummaryPanel inquiry={inquiry} />
      {pov === "admin" && <CoordinatorPanel inquiry={inquiry} />}
      <RequirementGroupsPanel inquiry={inquiry} pov={pov} />
      <OfferPanel inquiry={inquiry} pov={pov} />
      {(inquiry.bookingId || inquiry.stage === "approved") && (
        <BookingPanel inquiry={inquiry} pov={pov} />
      )}
      <PaymentPanel inquiry={inquiry} pov={pov} />
      <ActivityPanel inquiry={inquiry} />
    </aside>
  );
}

function RailCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <CapsLabel>{title}</CapsLabel>
        {action}
      </div>
      {children}
    </section>
  );
}

function SummaryPanel({ inquiry }: { inquiry: RichInquiry }) {
  return (
    <RailCard title="Summary">
      <KvCompact label="Brief" value={inquiry.brief} />
      <KvCompact label="Date" value={inquiry.date ?? "TBC"} />
      <KvCompact label="Location" value={inquiry.location ?? "TBC"} />
      <KvCompact label="Agency" value={inquiry.agencyName} />
      <KvCompact label="Inquiry ID" value={inquiry.id} mono />
    </RailCard>
  );
}

function KvCompact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "5px 0" }}>
      <span
        style={{
          fontFamily: FONTS.body,
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: COLORS.inkMuted,
          minWidth: 64,
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: mono ? FONTS.mono : FONTS.body,
          fontSize: mono ? 11.5 : 13,
          color: COLORS.ink,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function CoordinatorPanel({ inquiry }: { inquiry: RichInquiry }) {
  const { toast } = useProto();
  return (
    <RailCard
      title="Coordinator"
      action={
        <button
          onClick={() => toast("Coordinator picker — coming soon")}
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            color: COLORS.inkMuted,
            fontFamily: FONTS.body,
            fontSize: 11.5,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Reassign
        </button>
      }
    >
      {inquiry.coordinator ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar initials={inquiry.coordinator.initials} size={32} tone="ink" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 500, color: COLORS.ink }}>
              {inquiry.coordinator.name}
            </div>
            <div style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted, marginTop: 1 }}>
              {inquiry.coordinator.acceptedAt
                ? `Accepted ${inquiry.coordinator.acceptedAt}`
                : "Awaiting accept"}
            </div>
          </div>
          {inquiry.coordinator.isPrimary && (
            <span
              style={{
                padding: "2px 7px",
                background: "rgba(11,11,13,0.05)",
                color: COLORS.ink,
                fontSize: 10,
                fontWeight: 600,
                borderRadius: 999,
                fontFamily: FONTS.body,
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}
            >
              Primary
            </span>
          )}
        </div>
      ) : (
        <div style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.inkMuted }}>
          No coordinator assigned.{" "}
          <button
            type="button"
            onClick={() => toast("Coordinator picker — coming soon")}
            style={{
              color: COLORS.ink,
              fontWeight: 500,
              background: "transparent",
              border: 0,
              padding: 0,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "inherit",
              textDecoration: "underline",
            }}
          >
            Assign one →
          </button>
        </div>
      )}

      {/* C20 — Agency track record */}
      {(() => {
        const rel = AGENCY_RELIABILITY.find((a) => a.agencyName === inquiry.agencyName);
        if (!rel) return null;
        return (
          <div
            style={{
              marginTop: 12,
              paddingTop: 10,
              borderTop: `1px solid ${COLORS.borderSoft}`,
            }}
          >
            <div
              style={{
                fontFamily: FONTS.body,
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                color: COLORS.inkMuted,
                marginBottom: 8,
              }}
            >
              {rel.agencyName} track record
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {[
                { label: "Bookings", value: rel.bookingsCompleted.toString() },
                { label: "On time", value: `${rel.onTimeRate}%` },
                { label: "Cancellations", value: rel.cancellations.toString() },
                { label: "Repeats", value: rel.repeatBookings.toString() },
              ].map((s) => (
                <div
                  key={s.label}
                  style={{
                    padding: "6px 8px",
                    background: "rgba(11,11,13,0.03)",
                    borderRadius: 6,
                    border: `1px solid ${COLORS.borderSoft}`,
                  }}
                >
                  <div
                    style={{
                      fontFamily: FONTS.body,
                      fontSize: 10.5,
                      color: COLORS.inkMuted,
                      marginBottom: 2,
                    }}
                  >
                    {s.label}
                  </div>
                  <div
                    style={{
                      fontFamily: FONTS.body,
                      fontSize: 15,
                      fontWeight: 600,
                      color:
                        s.label === "Cancellations" && rel.cancellations > 0
                          ? "#B0303A"
                          : s.label === "On time" && rel.onTimeRate === 100
                            ? "#2E7D5B"
                            : COLORS.ink,
                    }}
                  >
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </RailCard>
  );
}

function RequirementGroupsPanel({ inquiry, pov }: { inquiry: RichInquiry; pov: InquiryWorkspacePov }) {
  const { toast } = useProto();
  return (
    <RailCard title="Roster">
      {inquiry.requirementGroups.map((g, i) => (
        <div key={g.id} style={{ marginTop: i === 0 ? 0 : 14 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 6,
              fontFamily: FONTS.body,
            }}
          >
            <span style={{ fontSize: 12.5, fontWeight: 500, color: COLORS.ink }}>
              {REQUIREMENT_ROLE_META[g.role].pluralLabel}
            </span>
            <span style={{ fontSize: 11.5, color: COLORS.inkMuted }}>
              {g.approved}/{g.needed} approved
            </span>
          </div>
          {/* progress */}
          <div style={{ height: 4, background: "rgba(11,11,13,0.06)", borderRadius: 999, overflow: "hidden", marginBottom: 8 }}>
            <div
              style={{
                width: `${g.needed === 0 ? 0 : Math.round((g.approved / g.needed) * 100)}%`,
                height: "100%",
                background: g.approved >= g.needed ? COLORS.green : COLORS.ink,
              }}
            />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {g.talents.map((t, ti) => (
              <span
                key={ti}
                title={`${t.name} · ${t.status}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "3px 7px 3px 4px",
                  background:
                    t.status === "accepted"
                      ? "rgba(46,125,91,0.10)"
                      : t.status === "declined"
                        ? "rgba(176,48,58,0.08)"
                        : "rgba(11,11,13,0.04)",
                  borderRadius: 999,
                  fontFamily: FONTS.body,
                  fontSize: 11,
                  color: t.status === "accepted" ? "#1F5C42" : t.status === "declined" ? "#7A2026" : COLORS.inkMuted,
                }}
              >
                <span style={{ fontSize: 13 }}>{t.thumb}</span>
                {t.name}
              </span>
            ))}
          </div>
        </div>
      ))}
      {pov === "admin" && (
        <div style={{ marginTop: 12 }}>
          <GhostButton onClick={() => toast("Add talent picker — coming soon")} size="sm">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Icon name="plus" size={11} stroke={2} /> Add talent
            </span>
          </GhostButton>
        </div>
      )}
    </RailCard>
  );
}

function OfferPanel({ inquiry, pov }: { inquiry: RichInquiry; pov: InquiryWorkspacePov }) {
  const { toast } = useProto();
  if (!inquiry.offer) {
    return (
      <RailCard
        title="Offer"
        action={
          pov === "admin" ? (
            <button
              onClick={() => toast("Offer composer — coming soon")}
              style={{
                background: "transparent",
                border: "none",
                color: COLORS.ink,
                fontFamily: FONTS.body,
                fontSize: 11.5,
                fontWeight: 600,
                cursor: "pointer",
                padding: 0,
              }}
            >
              Build offer →
            </button>
          ) : null
        }
      >
        <div style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.inkMuted }}>
          {pov === "admin"
            ? "No offer drafted yet. Build one once the lineup is locked."
            : "The agency hasn't sent an offer yet — they'll let you know."}
        </div>
      </RailCard>
    );
  }
  return (
    <RailCard
      title={`Offer · v${inquiry.offer.version}`}
      action={
        <span style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.inkMuted }}>
          {inquiry.offer.sentAt ? `sent ${inquiry.offer.sentAt}` : "draft"}
        </span>
      }
    >
      <OfferInner offer={inquiry.offer} pov={pov} />
    </RailCard>
  );
}

function OfferInner({ offer, pov }: { offer: Offer; pov: InquiryWorkspacePov }) {
  const { toast, openDrawer, state } = useProto();
  const currentInquiryId = state.drawer.payload?.inquiryId;
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontFamily: FONTS.display,
            fontSize: 22,
            fontWeight: 500,
            color: COLORS.ink,
            letterSpacing: -0.3,
          }}
        >
          {offer.total}
        </span>
        <ApprovalChip status={offer.clientApproval} who="Client" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {offer.lineItems.map((li, i) => {
          const showLineCtAs = pov === "client" && offer.clientApproval === "pending" && li.status === "pending";
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 10px",
                background:
                  li.status === "accepted"
                    ? "rgba(46,125,91,0.05)"
                    : li.status === "declined"
                      ? "rgba(176,48,58,0.05)"
                      : "rgba(11,11,13,0.02)",
                borderRadius: 8,
                fontFamily: FONTS.body,
                fontSize: 12.5,
              }}
            >
              <span style={{ fontSize: 14 }}>{li.thumb}</span>
              <span style={{ flex: 1, color: COLORS.ink }}>{li.talentName}</span>
              <span style={{ color: COLORS.ink, fontWeight: 500 }}>{li.fee}</span>
              {showLineCtAs ? (
                <div style={{ display: "flex", gap: 5 }}>
                  <button
                    onClick={() => toast(`Declined ${li.talentName} — coordinator notified`)}
                    style={{
                      padding: "3px 8px",
                      borderRadius: 6,
                      background: "rgba(176,48,58,0.08)",
                      border: "none",
                      color: "#7A2026",
                      fontFamily: FONTS.body,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      letterSpacing: 0.3,
                    }}
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => toast(`${li.talentName} approved`)}
                    style={{
                      padding: "3px 8px",
                      borderRadius: 6,
                      background: "rgba(46,125,91,0.12)",
                      border: "none",
                      color: "#1F5C42",
                      fontFamily: FONTS.body,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      letterSpacing: 0.3,
                    }}
                  >
                    Approve
                  </button>
                </div>
              ) : (
                <ApprovalChip status={li.status} compact />
              )}
            </div>
          );
        })}
      </div>

      {/* C19 — Version history trail */}
      {offer.history && offer.history.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.borderSoft}` }}>
          <div
            style={{
              fontFamily: FONTS.body,
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              color: COLORS.inkMuted,
              marginBottom: 8,
            }}
          >
            Version history
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {offer.history.map((h) => (
              <div
                key={h.version}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  fontFamily: FONTS.body,
                  fontSize: 12,
                  color: COLORS.inkMuted,
                  padding: "4px 0",
                  borderBottom: `1px dashed ${COLORS.borderSoft}`,
                }}
              >
                <span
                  style={{
                    fontWeight: 700,
                    color: COLORS.inkDim,
                    fontSize: 10.5,
                    letterSpacing: 0.3,
                    flexShrink: 0,
                  }}
                >
                  v{h.version}
                </span>
                <span style={{ fontWeight: 600, color: COLORS.ink, flexShrink: 0 }}>{h.total}</span>
                <span style={{ flex: 1, fontSize: 11.5 }}>{h.note}</span>
                <span style={{ flexShrink: 0, fontSize: 11, color: COLORS.inkDim }}>{h.sentAt}</span>
              </div>
            ))}
            {/* Current version */}
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                fontFamily: FONTS.body,
                fontSize: 12,
                padding: "4px 0",
              }}
            >
              <span
                style={{
                  fontWeight: 700,
                  color: COLORS.ink,
                  fontSize: 10.5,
                  letterSpacing: 0.3,
                  flexShrink: 0,
                }}
              >
                v{offer.version} ←
              </span>
              <span style={{ fontWeight: 600, color: COLORS.ink, flexShrink: 0 }}>{offer.total}</span>
              <span style={{ flex: 1, fontSize: 11.5, color: COLORS.inkMuted }}>current</span>
              <span style={{ flexShrink: 0, fontSize: 11, color: COLORS.inkDim }}>{offer.sentAt ?? "draft"}</span>
            </div>
          </div>
        </div>
      )}

      {/* Per-POV CTAs */}
      {pov === "client" && offer.clientApproval === "pending" && (
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          <SecondaryButton size="sm" onClick={() => toast("Offer declined — coordinator notified")}>Decline</SecondaryButton>
          <PrimaryButton size="sm" onClick={() => toast("Offer approved — booking will be created when all parties accept")}>
            Approve offer
          </PrimaryButton>
        </div>
      )}
      {pov === "talent" && offer.lineItems.some((l) => l.status === "pending") && (
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          <SecondaryButton size="sm" onClick={() => toast("Your line declined — coordinator notified")}>Decline my line</SecondaryButton>
          <PrimaryButton size="sm" onClick={() => toast("Your line approved")}>Approve my line</PrimaryButton>
        </div>
      )}
      {pov === "admin" && (
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          <SecondaryButton size="sm" onClick={() => toast("Offer revision composer — coming soon — note: revising resets all approvals")}>Revise</SecondaryButton>
          <SecondaryButton
            size="sm"
            onClick={() => openDrawer("inquiry-workspace", { inquiryId: currentInquiryId, pov: "client" })}
          >
            Preview as client
          </SecondaryButton>
        </div>
      )}
    </>
  );
}

function ApprovalChip({
  status,
  who,
  compact,
}: {
  status: "pending" | "accepted" | "rejected" | "declined" | "superseded";
  who?: string;
  compact?: boolean;
}) {
  const tone =
    status === "accepted"
      ? "green"
      : status === "rejected" || status === "declined"
        ? "red"
        : status === "superseded"
          ? "dim"
          : "amber";
  const color = tone === "green" ? "#1F5C42" : tone === "red" ? "#7A2026" : tone === "dim" ? COLORS.inkMuted : "#3A4651";
  const bg =
    tone === "green"
      ? "rgba(46,125,91,0.10)"
      : tone === "red"
        ? "rgba(176,48,58,0.10)"
        : tone === "dim"
          ? "rgba(11,11,13,0.04)"
          : "rgba(82,96,109,0.12)";
  const label =
    status === "accepted"
      ? "Approved"
      : status === "rejected" || status === "declined"
        ? "Declined"
        : status === "superseded"
          ? "Old version"
          : "Pending";
  return (
    <span
      style={{
        display: "inline-flex",
        padding: compact ? "1px 7px" : "3px 9px",
        background: bg,
        color,
        borderRadius: 999,
        fontFamily: FONTS.body,
        fontSize: compact ? 10 : 11,
        fontWeight: 600,
        letterSpacing: 0.3,
        textTransform: "uppercase",
      }}
    >
      {who ? `${who} · ${label}` : label}
    </span>
  );
}

function BookingPanel({ inquiry, pov }: { inquiry: RichInquiry; pov: InquiryWorkspacePov }) {
  const { toast } = useProto();
  if (inquiry.bookingId) {
    return (
      <RailCard title="Booking">
        <KvCompact label="ID" value={inquiry.bookingId} mono />
        <KvCompact label="Date" value={inquiry.date ?? "TBC"} />
        <KvCompact label="Location" value={inquiry.location ?? "TBC"} />
        <div style={{ marginTop: 10 }}>
          <SecondaryButton size="sm" onClick={() => toast("Booking detail — coming soon")}>Open booking →</SecondaryButton>
        </div>
      </RailCard>
    );
  }
  return (
    <RailCard title="Convert to booking">
      <div style={{ fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.5 }}>
        All parties have approved. Convert to a booking to lock the dates, generate the contract, and notify the talent.
      </div>
      {pov === "admin" && (
        <div style={{ marginTop: 10 }}>
          <PrimaryButton size="sm" onClick={() => toast("Booking conversion fires the convertToBooking engine action in production")}>
            Convert to booking
          </PrimaryButton>
        </div>
      )}
    </RailCard>
  );
}

/**
 * PaymentPanel — surfaces the per-booking payment summary inside the
 * Rail. Becomes visible once an inquiry has a payment summary fixture
 * (i.e. once an offer is being settled). Three states:
 *
 *  · No summary → silent (return null) so the panel doesn't flicker
 *    in for early-stage inquiries.
 *  · Summary, no receiver → "Pick a receiver" CTA → opens
 *    `payout-receiver-picker` drawer.
 *  · Summary with receiver → totals + receiver chip + "View detail"
 *    button → opens `payment-detail` drawer.
 */
function PaymentPanel({ inquiry, pov }: { inquiry: RichInquiry; pov: InquiryWorkspacePov }) {
  const { openDrawer } = useProto();
  const summary = getPaymentSummary(inquiry.id);
  if (!summary) return null;

  const receiver = summary.receiver;
  const receiverMeta = receiver ? PAYOUT_STATUS_META[receiver.status] : null;
  const canPick = pov === "admin";

  return (
    <RailCard
      title="Payment"
      action={
        <button
          onClick={() => openDrawer("payment-detail", { id: paymentRowIdFor(inquiry.id) })}
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            color: COLORS.inkMuted,
            fontFamily: FONTS.body,
            fontSize: 11.5,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          View detail
        </button>
      }
    >
      <div style={{ marginBottom: 10 }}>
        <PaymentStatusChip status={summary.status} />
      </div>
      <KvCompact label="Total" value={summary.total} />
      <KvCompact label="Fee" value={`${summary.platformFee} on ${summary.pricedOnPlan}`} />
      <KvCompact label="Net" value={summary.netPayout} />
      <Divider />
      <div style={{ marginTop: 10 }}>
        <CapsLabel>Receiver</CapsLabel>
        {receiver && receiverMeta ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 0 4px",
            }}
          >
            <Avatar initials={receiver.initials} size={28} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>
                {receiver.displayName}
              </div>
              <div style={{ fontFamily: FONTS.body, fontSize: 11, color: COLORS.inkMuted, marginTop: 1 }}>
                {PAYOUT_RECEIVER_KIND_LABEL[receiver.kind]}
              </div>
            </div>
            <PayoutStatusChip status={receiver.status} />
          </div>
        ) : (
          <div
            style={{
              padding: "10px 0 4px",
              fontFamily: FONTS.body,
              fontSize: 12,
              color: COLORS.inkMuted,
              lineHeight: 1.5,
            }}
          >
            No receiver set yet. Payment cannot be requested until one is selected.
          </div>
        )}
        {canPick && (
          <div style={{ marginTop: 8 }}>
            <SecondaryButton
              size="sm"
              onClick={() => openDrawer("payout-receiver-picker", { inquiryId: inquiry.id })}
            >
              {receiver ? "Change receiver" : "Pick receiver"}
            </SecondaryButton>
          </div>
        )}
      </div>
      {summary.downstreamNote && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 10px",
            background: "rgba(11,11,13,0.03)",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 8,
            fontFamily: FONTS.body,
            fontSize: 11.5,
            color: COLORS.inkMuted,
            lineHeight: 1.5,
          }}
        >
          {summary.downstreamNote}
        </div>
      )}
    </RailCard>
  );
}

/**
 * Map an inquiry id back to its workspace-payments row id. The fixtures
 * use BK-205 ↔ wp1, BK-203 ↔ wp2, RI-202 ↔ wp3 — keep the picker honest
 * by routing to the right row id when available; otherwise fall back to
 * the inquiry id (the detail drawer will safely default to the first
 * row if the lookup misses).
 */
function paymentRowIdFor(inquiryId: string): string {
  // BK ids are derived from inquiry ids in the fixtures (RI-XYZ → BK-XYZ)
  const refByInquiry: Record<string, string> = {
    "RI-205": "wp1", // BK-205 (Net-a-Porter)
    "RI-203": "wp2", // BK-203 (Bvlgari)
    "RI-202": "wp3", // RI-202 (Vogue Italia)
  };
  return refByInquiry[inquiryId] ?? inquiryId;
}

function ActivityPanel({ inquiry }: { inquiry: RichInquiry }) {
  const events: { ts: string; label: string }[] = [
    inquiry.bookingId
      ? { ts: "Today", label: `Booking ${inquiry.bookingId} created` }
      : null,
    inquiry.offer && inquiry.offer.clientApproval === "accepted"
      ? { ts: "Today", label: "Client approved offer v" + inquiry.offer.version }
      : null,
    inquiry.offer
      ? { ts: inquiry.offer.sentAt ?? "—", label: `Offer v${inquiry.offer.version} sent` }
      : null,
    inquiry.coordinator
      ? { ts: inquiry.coordinator.acceptedAt ?? "—", label: `${inquiry.coordinator.name} accepted as coordinator` }
      : null,
    { ts: `${inquiry.ageDays}d ago`, label: "Inquiry submitted" },
  ].filter(Boolean) as { ts: string; label: string }[];

  return (
    <RailCard title="Activity">
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        {events.slice(0, 5).map((e, i) => (
          <li
            key={i}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              fontFamily: FONTS.body,
              fontSize: 12,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: i === 0 ? COLORS.ink : COLORS.inkDim,
                flexShrink: 0,
                marginTop: 6,
              }}
            />
            <span style={{ flex: 1, color: COLORS.ink }}>{e.label}</span>
            <span style={{ color: COLORS.inkMuted, flexShrink: 0 }}>{e.ts}</span>
          </li>
        ))}
      </ul>
    </RailCard>
  );
}

// ─── Helpers exported for surfaces ────────────────────────────────────

export function inquiryStageLabel(stage: RichInquiry["stage"]): string {
  return INQUIRY_STAGE_META[stage].label;
}
