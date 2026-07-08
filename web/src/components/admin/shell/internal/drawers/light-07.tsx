"use client";

import React, { useState, useEffect, useRef, useMemo, useId, useTransition, useCallback, startTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ActivityCategory,
  ActivityFeedItem,
  Avatar,
  BatchedNotif,
  COLORS,
  CapsLabel,
  DrawerShell,
  EmptyState,
  FONTS,
  GhostButton,
  Icon,
  MY_ACTIONS,
  MyAction,
  NOTIFICATIONS,
  NotificationItem,
  RICH_INQUIRIES,
  SecondaryButton,
  StageBadgeMini,
  StatDot,
  TRANSITION,
  batchNotifications,
  useAdminShell
} from "./drawer-shared";
import { formatRecentActivity, groupRecentActivityByDay } from "../state";
import { useDashboardText } from "../dashboard-i18n";

// Phase 1d (remediation §4): 6 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

export function TodayPulseDrawer() {
  const { state, closeDrawer, openDrawer, effectiveMessagesInquiries } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  // Phase 3.12 — use bridge inquiries when available, fall back to mock.
  const richInqs = effectiveMessagesInquiries/* trust the bridge — context handles empty-vs-mock */;
  const items = [
    ...richInqs
      .filter((i) => ["submitted", "coordination", "offer_pending", "approved"].includes(i.stage)
        && (!i.coordinator || i.stage === "approved" || i.nextActionBy === "coordinator"))
      .map((i) => ({
        id: i.id,
        title: `${i.clientName} · ${!i.coordinator ? tt("needs a coordinator") : i.stage === "approved" ? tt("ready to book") : tt("awaiting your reply")}`,
        sub: [i.offer?.total ? `${i.offer.total} ${tt("offer")}` : null, `${i.ageDays}${tt("d waiting")}`].filter(Boolean).join(" · "),
        tone: "amber" as const,
        ageDays: i.ageDays,
        action: () => openDrawer("inquiry-workspace", { inquiryId: i.id }),
      })),
    ...richInqs
      .filter((i) => i.stage === "draft")
      .map((i) => ({
        id: i.id,
        title: `${i.clientName} · ${tt("draft never sent")}`,
        sub: i.brief && i.brief !== i.clientName ? i.brief : `${tt("Draft · started")} ${i.ageDays}${tt("d ago")}`,
        tone: "dim" as const,
        ageDays: i.ageDays,
        action: () => openDrawer("inquiry-workspace", { inquiryId: i.id }),
      })),
  ]
    .sort((a, b) => b.ageDays - a.ageDays); // oldest-waiting first (matches the copy)

  return (
    <DrawerShell
      open onClose={closeDrawer}
      title={tt("Today's pulse")}
      description={tt("What needs you, ranked by what's been waiting longest.")}
      width={560}
      footer={<SecondaryButton onClick={closeDrawer}>{tt("Close")}</SecondaryButton>}
    >
      <div className="flex flex-col gap-2">
        {items.length === 0 && (
          <EmptyState icon="sparkle" title={tt("All clear")} body={tt("Nothing needs your attention right now.")} compact />
        )}
        {items.map((it) => (
          <button
            key={`${it.id}-${it.title}`}
            onClick={it.action}
            style={{
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              padding: 12,
              cursor: "pointer",
              fontFamily: FONTS.body,
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              gap: 12,
              transition: `border-color ${TRANSITION.micro}`,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(11,11,13,0.18)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.borderSoft)}
          >
            <StatDot tone={it.tone} />
            <div className="flex-1 min-w-0">
              <div className="text-admin-ink text-admin-13 font-semibold">{it.title}</div>
              <div style={{ fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">{it.sub}</div>
            </div>
            <Icon name="chevron-right" size={13} color={COLORS.inkDim} />
          </button>
        ))}
      </div>
    </DrawerShell>
  );
}

export function PipelineDrawer() {
  const { state, closeDrawer, openDrawer, effectiveMessagesInquiries } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  // Phase 3.12 — use bridge RichInquiry data, mapped to the shape this drawer expects.
  const richSource = effectiveMessagesInquiries/* trust the bridge — context handles empty-vs-mock */;
  const inquiries = richSource.map((i) => ({
    id: i.id,
    client: i.clientName,
    brief: i.brief,
    stage:
      i.stage === "draft" ? "draft" :
      i.stage === "offer_pending" || i.stage === "approved" ? "awaiting-client" :
      i.stage === "booked" ? "confirmed" :
      i.stage,
    amount: i.offer?.total,
    ageDays: i.ageDays,
  }));
  const cols: { id: string; label: string; stages: string[]; tone: "dim" | "amber" | "green" }[] = [
    { id: "drafts", label: tt("Drafts & holds"), stages: ["draft", "hold"], tone: "dim" },
    { id: "awaiting", label: tt("Awaiting client"), stages: ["awaiting-client"], tone: "amber" },
    { id: "confirmed", label: tt("Confirmed"), stages: ["confirmed"], tone: "green" },
  ];
  return (
    <DrawerShell
      open onClose={closeDrawer}
      title={tt("Pipeline")}
      description={tt("Where every inquiry is right now.")}
      width={620}
      footer={<SecondaryButton onClick={closeDrawer}>{tt("Close")}</SecondaryButton>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {cols.map((col) => {
          const items = inquiries.filter((i) => col.stages.includes(i.stage));
          return (
            <section key={col.id}>
              <div className="flex items-center gap-2 mb-2">
                <StatDot tone={col.tone} />
                <CapsLabel>{col.label}</CapsLabel>
                <span style={{ fontFamily: FONTS.body, fontSize: 11 }} className="text-admin-ink-dim">
                  · {items.length}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {items.map((iq) => (
                  <button
                    key={iq.id}
                    onClick={() => openDrawer("inquiry-peek", { id: iq.id })}
                    style={{
                      background: "#fff",
                      border: `1px solid ${COLORS.borderSoft}`,
                      borderRadius: 9,
                      padding: "10px 12px",
                      cursor: "pointer",
                      fontFamily: FONTS.body,
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-admin-ink text-admin-12h font-semibold">{iq.client}</div>
                      <div style={{ fontSize: 11.5, marginTop: 1 }} className="text-admin-ink-muted">{iq.brief}</div>
                    </div>
                    {iq.amount && (
                      <span className="text-admin-ink-muted text-xs font-medium">
                        {iq.amount}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </DrawerShell>
  );
}

export function PipelineFilterDrawer({ filter }: { filter: "drafts" | "awaiting" | "confirmed" | "archived" }) {
  const { state, closeDrawer, openDrawer, effectiveMessagesInquiries, effectiveBookings } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const meta = {
    drafts: { title: tt("Drafts & holds"), desc: tt("Inquiries you started but haven't sent."), stages: ["draft", "hold"] },
    awaiting: { title: tt("Awaiting client"), desc: tt("Offers sent. Waiting on confirmation."), stages: ["awaiting-client"] },
    confirmed: { title: tt("Confirmed bookings"), desc: tt("Booked. Calendar locked."), stages: ["confirmed"] },
    archived: { title: tt("Archived"), desc: tt("Past or canceled work."), stages: ["archived"] },
  }[filter];
  // "confirmed" uses live bookings; other filters now read real bridge
  // inquiries (same mapping as the Pipeline kanban), not the per-plan mock.
  const mappedInquiries = effectiveMessagesInquiries.map((i) => ({
    id: i.id,
    client: i.clientName,
    brief: i.brief,
    date: "",
    stage:
      i.stage === "draft" ? "draft" :
      i.stage === "offer_pending" || i.stage === "approved" ? "awaiting-client" :
      i.stage === "booked" ? "confirmed" :
      i.stage === "rejected" || i.stage === "expired" ? "archived" :
      i.stage,
    amount: i.offer?.total,
  }));
  const items = filter === "confirmed" && effectiveBookings.length > 0
    ? effectiveBookings.map((b) => ({
        id: b.id,
        client: b.contact_name,
        brief: b.company ?? b.contact_name,
        date: b.event_date ?? "",
        stage: "confirmed",
        amount: b.grossRevenueCents
          ? new Intl.NumberFormat("en-US", { style: "currency", currency: b.currencyCode ?? "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(b.grossRevenueCents / 100)
          : undefined,
      }))
    : mappedInquiries.filter((i) => meta.stages.includes(i.stage));

  return (
    <DrawerShell
      open onClose={closeDrawer}
      title={meta.title}
      description={meta.desc}
      width={560}
      footer={<SecondaryButton onClick={closeDrawer}>{tt("Close")}</SecondaryButton>}
    >
      <div className="flex flex-col gap-2">
        {items.length === 0 ? (
          <EmptyState
            compact
            icon="calendar"
            title={tt("Nothing here yet")}
            body={tt("Inquiries matching this stage will appear here as they progress through the pipeline.")}
          />
        ) : items.map((iq) => (
          <button
            key={iq.id}
            onClick={() => openDrawer("inquiry-peek", { id: iq.id })}
            style={{
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              padding: 12,
              cursor: "pointer",
              fontFamily: FONTS.body,
              textAlign: "left",
            }}
          >
            <div className="text-admin-ink text-admin-13 font-semibold">{iq.client}</div>
            <div style={{ fontSize: 12, marginTop: 2 }} className="text-admin-ink-muted">{iq.brief}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
              <StageBadgeMini stage={iq.stage} />
              {iq.amount && (
                <span className="text-admin-ink-muted text-admin-11h">{iq.amount}</span>
              )}
              {iq.date && (
                <span className="text-admin-ink-muted text-admin-11h">· {iq.date}</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// Notifications & activity feeds
// ════════════════════════════════════════════════════════════════════

// WS-11.2 — notification batching types

export function NotificationsDrawer() {
  const { closeDrawer, openDrawer, toast, bridgeUserNotifications, bridgeTenantIdentity } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const [marking, setMarking] = useState(false);
  const handleMarkAllRead = useCallback(async () => {
    const tenantId = bridgeTenantIdentity?.tenantId;
    if (!tenantId) {
      toast(tt("Workspace context not loaded yet. Try again in a moment."));
      return;
    }
    setMarking(true);
    try {
      const { markAllNotificationsRead } = await import("@/lib/notifications/actions");
      const res = await markAllNotificationsRead(tenantId);
      if (res.ok) {
        toast(res.count === 0
          ? tt("All notifications already read.")
          : (copy.isSpanish ? `${res.count} marcadas como leídas.` : `Marked ${res.count} as read.`));
      } else {
        toast(tt("Couldn't mark all read. Try again."));
      }
    } finally {
      setMarking(false);
    }
  }, [bridgeTenantIdentity?.tenantId, toast, copy, tt]);
  const [filter, setFilter] = useState<"all" | "unread" | "action">("all");
  // WS-11.2 — track which batches are expanded
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());

  const KIND_ICON: Record<NotificationItem["kind"], "mail" | "user" | "calendar" | "credit" | "check" | "bolt" | "bell"> = {
    message: "mail", offer: "bolt", booking: "calendar", payment: "credit",
    approval: "check", system: "bell", profile: "user",
  };

  // English source labels for the notification-kind tag; rendered via tt().
  const KIND_LABEL: Record<NotificationItem["kind"], string> = {
    message: "Message", offer: "Offer", booking: "Booking", payment: "Payment",
    approval: "Approval", system: "System", profile: "Profile",
  };

  const ACTION_KINDS: NotificationItem["kind"][] = ["message", "offer", "approval", "profile"];

  // B.2 — when bridge data is present, use real notifications. When null,
  // fall back to the demo NOTIFICATIONS constant so standalone/mock mode
  // still renders something meaningful.
  const items = useMemo<NotificationItem[]>(() => {
    if (bridgeUserNotifications !== null) {
      return bridgeUserNotifications
        .filter((n) => n.surface === "workspace")
        .map((n) => ({
          id: n.id,
          kind: n.kind as NotificationItem["kind"],
          inquiryId: n.originInquiryId ?? undefined,
          title: n.title,
          body: n.body ?? "",
          ts: n.ts,
          read: n.read,
          actorName: "",
          actorInitials: n.actorInitials ?? "·",
          surface: "workspace" as const,
          targetDrawer: (n.targetDrawer ?? "notifications") as NotificationItem["targetDrawer"],
          targetPayload: n.originInquiryId ? { inquiryId: n.originInquiryId } : undefined,
        }));
    }
    return NOTIFICATIONS.filter((n) => n.surface === "workspace");
  }, [bridgeUserNotifications]);
  const filtered = items.filter((n) => {
    if (filter === "unread") return !n.read;
    if (filter === "action") return ACTION_KINDS.includes(n.kind) && !n.read;
    return true;
  });
  const batched = batchNotifications(filtered);
  const unreadCount = items.filter((n) => !n.read).length;
  const actionCount = items.filter((n) => ACTION_KINDS.includes(n.kind) && !n.read).length;

  const toggleBatch = (id: string) =>
    setExpandedBatches((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const renderSingleItem = (n: NotificationItem, compact?: boolean) => (
    <button
      key={n.id}
      onClick={() => {
        // F.15 — mark this notification read on click (fire-and-forget).
        if (!n.read && bridgeUserNotifications !== null) {
          import("@/lib/notifications/actions").then((m) => m.markNotificationRead(n.id)).catch(() => {});
        }
        openDrawer(n.targetDrawer, n.targetPayload);
      }}
      style={{
        background: !n.read ? "#fff" : "rgba(11,11,13,0.015)",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: compact ? 8 : 10,
        padding: compact ? "8px 10px" : 12,
        cursor: "pointer",
        fontFamily: FONTS.body,
        textAlign: "left",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        width: "100%",
      }}
    >
      <Avatar initials={n.actorInitials} size={compact ? 22 : 28} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span style={{ fontSize: compact ? 11.5 : 13, fontWeight: 600 }} className="text-admin-ink">{n.title}</span>
          {!n.read && (
            <span
              aria-label={tt("Unread")}
              style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.accent, flexShrink: 0 }}
            />
          )}
        </div>
        <div style={{ fontSize: compact ? 11 : 12, marginTop: 2, lineHeight: 1.5 }} className="text-admin-ink-muted">
          {n.body}
        </div>
        {!compact && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
            <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 4 }} className="text-admin-ink-dim">
              <Icon name={KIND_ICON[n.kind]} size={10} stroke={1.8} />
              {tt(KIND_LABEL[n.kind])}
            </span>
            <span className="text-admin-ink-dim text-admin-11">{n.ts}</span>
          </div>
        )}
      </div>
    </button>
  );

  const renderBatchItem = (b: BatchedNotif) => {
    const isExpanded = expandedBatches.has(b.id);
    return (
      <div
        key={b.id}
        style={{
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {/* Batch summary row */}
        <button
          type="button"
          onClick={() => toggleBatch(b.id)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
            fontFamily: FONTS.body,
          }}
        >
          {/* Stacked avatar indicators */}
          <div style={{ position: "relative", width: 36, height: 28, flexShrink: 0 }}>
            {b.actors.slice(0, 2).map((actor, i) => (
              <span
                key={actor}
                style={{
                  position: "absolute",
                  left: i * 10,
                  top: 0,
                  display: "inline-flex",
                  width: 26, height: 26,
                  borderRadius: "50%",
                  background: COLORS.accent,
                  color: "#fff",
                  fontSize: 9,
                  fontWeight: 700,
                  alignItems: "center",
                  justifyContent: "center",
                  border: "2px solid #fff",
                }}
              >
                {actor.split(" ").map((w) => w[0]).join("").slice(0, 2)}
              </span>
            ))}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-admin-ink text-admin-13 font-semibold">{b.summary}</span>
              <span style={{ display: "inline-flex", padding: "1px 6px", minWidth: 18, height: 18, borderRadius: 999, color: "#fff", fontSize: 10, fontWeight: 700, alignItems: "center", justifyContent: "center" }} className="bg-admin-accent">
                {b.count}
              </span>
            </div>
            <div style={{ fontSize: 11, marginTop: 2 }} className="text-admin-ink-muted">
              {b.ts} · {isExpanded ? tt("tap to collapse") : tt("tap to expand")}
            </div>
          </div>

          {/* Expand / collapse chevron */}
          <span
            aria-hidden
            style={{
              fontSize: 11,
              color: COLORS.inkMuted,
              transition: `transform ${TRANSITION.sm}`,
              transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
              display: "inline-block",
              flexShrink: 0,
            }}
          >
            ▾
          </span>
        </button>

        {/* Jump to thread CTA */}
        {!isExpanded && (
          <button
            type="button"
            onClick={() => openDrawer(b.targetDrawer, b.targetPayload)}
            style={{
              display: "block",
              width: "100%",
              padding: "6px 12px",
              borderTop: `1px solid ${COLORS.borderSoft}`,
              background: "rgba(31,92,66,0.04)",
              border: "none",
              cursor: "pointer",
              fontFamily: FONTS.body,
              fontSize: 11.5,
              fontWeight: 600,
              color: COLORS.accent,
              textAlign: "left",
            }}
          >
            {tt("Open thread")} →
          </button>
        )}

        {/* Expanded individual items */}
        {isExpanded && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "4px 8px 8px", borderTop: `1px solid ${COLORS.borderSoft}` }} className="bg-admin-surface-alt">
            {b.items.map((n) => renderSingleItem(n, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <DrawerShell
      open onClose={closeDrawer}
      title={tt("Notifications")}
      // Honest framing — this surface is still on prototype fixture data
      // (NOTIFICATIONS const); the live event/read backend lands in a later
      // phase.  See `project_trust_the_loop_audit.md` deferred-work section.
      description={tt("Demo · prototype data. Live notifications land in a later phase.")}
      toolbar={
        <GhostButton size="sm" onClick={() => openDrawer("notifications-prefs")}>
          {tt("Preferences")}
        </GhostButton>
      }
      footer={
        <>
          <GhostButton onClick={() => openDrawer("my-activity")}>{tt("Your activity")}</GhostButton>
          <GhostButton onClick={handleMarkAllRead} disabled={marking}>
            {marking ? tt("Marking…") : tt("Mark all read")}
          </GhostButton>
          <SecondaryButton onClick={closeDrawer}>{tt("Close")}</SecondaryButton>
        </>
      }
    >
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {(
          [
            { id: "all",    label: `${tt("All")} · ${items.length}` },
            { id: "unread", label: `${tt("Unread")} · ${unreadCount}` },
            { id: "action", label: `${tt("Needs action")} · ${actionCount}` },
          ] as const
        ).map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              style={{
                padding: "5px 11px",
                background: active ? COLORS.fill : "rgba(11,11,13,0.04)",
                color: active ? "#fff" : COLORS.ink,
                border: "none",
                borderRadius: 999,
                cursor: "pointer",
                fontFamily: FONTS.body,
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-2">
        {batched.length === 0 && (
          <EmptyState
            compact
            icon="info"
            title={filter === "action" ? tt("All clear") : tt("Nothing here")}
            body={filter === "action"
              ? tt("No items need your attention right now.")
              : tt("Switch to a different filter to see other notifications.")}
          />
        )}
        {batched.map((item) =>
          item.kind === "batch"
            ? renderBatchItem(item)
            : renderSingleItem(item as NotificationItem)
        )}
      </div>
    </DrawerShell>
  );
}


export function ActivityFeedDrawer({ kind }: { kind: "team" | "talent" }) {
  const { closeDrawer, bridgeRecentActivity } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  type FeedItem = { actor: string; action: string; target: string; timestamp: string; iconName: "mail" | "check" | "user" | "team" | "settings" | "calendar" };
  // Real workspace activity (inquiry_events). null = mock mode → demo below.
  const liveTeam = useMemo(
    () => (bridgeRecentActivity ?? []).map((it) => formatRecentActivity(it)),
    [bridgeRecentActivity],
  );
  if (kind === "team" && bridgeRecentActivity != null) {
    const groups = groupRecentActivityByDay(liveTeam);
    return (
      <DrawerShell
        open onClose={closeDrawer}
        title={tt("Recent activity")}
        description={tt("Every offer, approval, roster change, and booking across your workspace.")}
        footer={<SecondaryButton onClick={closeDrawer}>{tt("Close")}</SecondaryButton>}
      >
        {liveTeam.length === 0 ? (
          <EmptyState
            icon="sparkle"
            title={tt("No activity yet")}
            body={tt("Offers, approvals, roster changes, and bookings will appear here as your team works through inquiries.")}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {groups.map((group) => (
              <div key={group.bucket}>
                <div className="pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-admin-ink-dim">
                  {group.bucket}
                </div>
                <div className="divide-y divide-admin-border-soft">
                  {group.items.map((it) => (
                    <ActivityFeedItem
                      key={it.id}
                      actor={it.actor}
                      action={it.action}
                      target={it.target}
                      timestamp={it.timestamp}
                      iconName={it.iconName}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </DrawerShell>
    );
  }

  // Standalone/mock fallback (team) + talent feed (no live loader yet).
  const teamItems: FeedItem[] = [
    { actor: "Sara Bianchi",  action: "sent an offer to",         target: "Vogue Italia",                timestamp: "1h ago",   iconName: "mail"     },
    { actor: "Daniel Ferrer", action: "added",                    target: "Tomás Navarro to roster",      timestamp: "3h ago",   iconName: "user"     },
    { actor: "You",           action: "approved",                 target: "Lina Park's profile changes", timestamp: "yesterday", iconName: "check"    },
    { actor: "Andrés Lopez",  action: "joined the team as",       target: "Editor",                      timestamp: "yesterday", iconName: "team"     },
    { actor: "Mira Soto",     action: "reviewed",                 target: "Pages section",               timestamp: "2d ago",   iconName: "settings" },
  ];
  const talentItems: FeedItem[] = [
    { actor: "Lina Park",    action: "submitted",              target: "profile changes for review", timestamp: "1h ago",    iconName: "user"     },
    { actor: "Kai Lin",      action: "accepted booking with",  target: "Bvlgari",                   timestamp: "3h ago",    iconName: "check"    },
    { actor: "Marta Reyes",  action: "updated",                target: "travel availability",       timestamp: "yesterday", iconName: "calendar" },
  ];
  const items = kind === "team" ? teamItems : talentItems;

  return (
    <DrawerShell
      open onClose={closeDrawer}
      title={kind === "team" ? tt("Team activity") : tt("Talent activity")}
      description={kind === "team" ? tt("What teammates and clients did recently.") : tt("Updates from talent on your roster.")}
      footer={<SecondaryButton onClick={closeDrawer}>{tt("Close")}</SecondaryButton>}
    >
      <div className="flex flex-col">
        {items.map((it, idx) => (
          <div key={idx} style={{ borderTop: idx > 0 ? `1px solid ${COLORS.borderSoft}` : "none" }}>
            <ActivityFeedItem
              actor={it.actor}
              action={it.action}
              target={it.target}
              timestamp={it.timestamp}
              iconName={it.iconName}
            />
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// WS-11.7 — MyActivityDrawer — "Things you did" history
// ════════════════════════════════════════════════════════════════════


export function MyActivityDrawer() {
  const { closeDrawer } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const [category, setCategory] = useState<ActivityCategory>("all");

  const CAT_OPTIONS: { key: ActivityCategory; label: string }[] = [
    { key: "all", label: tt("All") }, { key: "message", label: tt("Messages") },
    { key: "inquiry", label: tt("Inquiries") }, { key: "booking", label: tt("Bookings") },
    { key: "roster", label: tt("Roster") }, { key: "settings", label: tt("Settings") },
  ];

  const CAT_COLOR: Record<MyAction["category"], string> = {
    message: "rgba(79,70,229,0.12)", inquiry: "rgba(31,92,66,0.1)", booking: "rgba(46,125,91,0.1)",
    roster: "rgba(217,119,6,0.1)", settings: "rgba(11,11,13,0.06)",
  };
  const CAT_FG: Record<MyAction["category"], string> = {
    message: "rgba(79,70,229,0.9)", inquiry: COLORS.accent, booking: "#1A6040",
    roster: "#92400E", settings: COLORS.inkMuted,
  };

  const filtered = MY_ACTIONS.filter((a) => category === "all" || a.category === category);

  return (
    <DrawerShell
      open onClose={closeDrawer}
      title={tt("Your activity")}
      description={tt("A log of actions you took, across messages, inquiries, bookings, and roster changes.")}
      footer={<SecondaryButton onClick={closeDrawer}>{tt("Close")}</SecondaryButton>}
    >
      {/* Category filter */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 14 }}>
        {CAT_OPTIONS.map((opt) => {
          const active = category === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => setCategory(opt.key)}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                border: active ? `1.5px solid ${COLORS.accent}` : `1px solid ${COLORS.border}`,
                background: active ? COLORS.fill : "transparent",
                color: active ? "#fff" : COLORS.inkMuted,
                fontFamily: FONTS.body,
                fontSize: 11.5,
                fontWeight: active ? 600 : 500,
                cursor: "pointer",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col">
        {filtered.map((action, idx) => {
          // Map MyAction.icon → ActivityFeedItem iconName (drop "plus" → "bolt")
          type AFIName = "mail" | "check" | "bolt" | "calendar" | "settings" | "user" | "archive" | "alert";
          const iconName: AFIName = action.icon === "plus" ? "bolt" : (action.icon as AFIName);
          return (
            <div key={action.id} style={{ borderTop: idx > 0 ? `1px solid ${COLORS.borderSoft}` : "none" }}>
              <ActivityFeedItem
                iconName={iconName}
                actor={tt("You")}
                action={action.label}
                target=""
                timestamp={action.sub ? `${action.sub} · ${action.ts}` : action.ts}
              />
            </div>
          );
        })}

        {filtered.length === 0 && (
          <EmptyState
            icon="info"
            title={category === "all"
              ? tt("No actions yet")
              : `${tt("No")} ${(CAT_OPTIONS.find((o) => o.key === category)?.label ?? category).toLowerCase()} ${tt("actions yet")}`}
            body={tt("Actions will appear here as the inquiry moves through the pipeline.")}
            compact
          />
        )}
      </div>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// Site-related drawers (lighter content but real-feeling)
// ════════════════════════════════════════════════════════════════════

