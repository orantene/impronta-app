"use client";

import { useEffect, useRef, useState } from "react";
import { DemoBadge as FixtureBadge } from "@/components/demo-badge";
import { isFixtureInquiryId } from "@/lib/fixtures/is-fixture-id";
import { pinNextConversation as pinNextConversationP } from "../messages";
import { Avatar, Bullet, ClientTrustChip, EmptyState, FloatingFab, GhostButton, Icon, SwipeableRow, useKeyboardListNav } from "../primitives";
import { COLORS, FONTS, INQUIRY_STAGE_META, RADIUS, RICH_INQUIRIES, Z, useAdminShell } from "../state";
import type { RichInquiry } from "../state";
import { LoadMore, QuickReplyButtons, SavedViewsBar, downloadCsv } from "../wave2";
import { useQuickCreateActionsFiltered } from "./WorkspaceTopbar";
import { MessagesShell } from "./pages-dynamic";
import { PageHeader } from "./pages-shared";


// ════════════════════════════════════════════════════════════════════
// INBOX (#8 — unified)
// ════════════════════════════════════════════════════════════════════
/**
 * Single-pane view that joins inquiry threads + 1:1 messages +
 * notifications, grouped by entity. Replaces the fragmented
 * inquiry/messages/notifications drawers as the default mental model.
 *
 * Mock implementation: builds rows from RICH_INQUIRIES with their unread
 * counts and last-activity timestamps. In production this would read from
 * a unified `events` view.
 */
// ════════════════════════════════════════════════════════════════════
// WORKSPACE MESSAGES — WhatsApp-style 3-pane (list + inline conversation)
// ════════════════════════════════════════════════════════════════════
// Aligns with TalentMessagesPage. List on the left, full inquiry workspace
// (private/group tabs + rail) inline on the right. No drawer-on-click.
//
// Mobile: single-pane stack (list ↔ thread) — toggled via [data-mobile-pane].

export function WorkspaceMessagesPage() {
  return <MessagesShell pov="admin" />;
}

export function UnifiedInboxPage() {
  const { openDrawer, setPage, toast } = useAdminShell();
  // Route inquiry clicks through the new MessagesShell instead of the
  // legacy drawer.
  const goToInquiryMessages = (inquiryId: string) => {
    pinNextConversationP(inquiryId);
    setPage("messages");
  };
  // Use RICH_INQUIRIES so we have nextActionBy / unread / lastActivityHrs.
  const inquiries = RICH_INQUIRIES;
  // WS-3.3 — "by-stage" adds pipeline columns view within Messages
  const [filter, setFilter] = useState<"needs-me" | "all" | "unread" | "by-stage">("needs-me");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"recent" | "oldest" | "client">("recent");
  const [pagesShown, setPagesShown] = useState(1);
  const PAGE_SIZE = 8;

  const isOpen = (s: typeof inquiries[number]["stage"]) =>
    s !== "rejected" && s !== "expired";

  const matched = inquiries
    .filter((i) => isOpen(i.stage))
    .filter((i) => {
      if (filter === "needs-me") return i.nextActionBy === "coordinator";
      if (filter === "unread") return i.unreadGroup > 0;
      return true;
    })
    .filter((i) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        i.clientName.toLowerCase().includes(q) || i.brief.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sort === "client") return a.clientName.localeCompare(b.clientName);
      if (sort === "oldest") return b.lastActivityHrs - a.lastActivityHrs;
      return a.lastActivityHrs - b.lastActivityHrs;
    });

  const rows = matched.slice(0, PAGE_SIZE * pagesShown);

  // Reset pagination when filter / search changes.
  useEffect(() => {
    setPagesShown(1);
  }, [filter, search, sort]);

  // Saved-views payload — capture the active filter; restore on click.
  type InboxView = { filter: typeof filter; sort: typeof sort };
  const onApplyView = (v: InboxView) => {
    setFilter(v.filter);
    setSort(v.sort);
  };

  // Keyboard nav refs — populated on render.
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  useKeyboardListNav({
    rows: rowRefs.current,
    onActivate: (idx) => {
      const inq = rows[idx];
      if (inq) openDrawer("inquiry-workspace", { inquiryId: inq.id });
    },
  });

  const exportCsv = () => {
    downloadCsv(
      `inbox-${new Date().toISOString().slice(0, 10)}.csv`,
      matched.map((i) => ({
        client: i.clientName,
        brief: i.brief,
        stage: INQUIRY_STAGE_META[i.stage].label,
        nextActionBy: i.nextActionBy ?? "",
        unread: i.unreadGroup,
        ageHours: i.lastActivityHrs,
      })),
    );
    toast(`Exported ${matched.length} rows to CSV`);
  };

  return (
    <>
      <PageHeader
        title="Inbox"
        subtitle="Threads, mentions & notifications — sorted by what needs you."
        actions={
          <GhostButton size="sm" onClick={exportCsv}>
            Export CSV
          </GhostButton>
        }
      />
      <SavedViewsBar viewKey="inbox" current={{ filter, sort }} onApply={onApplyView} />

      {/* Search + sort row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <input
            type="text"
            aria-label="Search inbox by client or brief"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by client or brief…"
            style={{
              width: "100%",
              padding: "9px 12px",
              fontFamily: FONTS.body,
              fontSize: 13,
              color: COLORS.ink,
              background: "#fff",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              outline: "none",
            }}
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          aria-label="Sort"
          style={{
            padding: "9px 12px",
            fontFamily: FONTS.body,
            fontSize: 13,
            color: COLORS.ink,
            background: "#fff",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          <option value="recent">Most recent</option>
          <option value="oldest">Oldest</option>
          <option value="client">Client name</option>
        </select>
      </div>
      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        {(
          [
            { id: "needs-me", label: `Needs me · ${inquiries.filter((i) => i.nextActionBy === "coordinator").length}` },
            { id: "all",      label: `All · ${inquiries.filter((i) => isOpen(i.stage)).length}` },
            { id: "unread",   label: `Unread · ${inquiries.filter((i) => isOpen(i.stage) && i.unreadGroup > 0).length}` },
            { id: "by-stage", label: "By stage" },
          ] as const
        ).map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              style={{
                padding: "6px 12px",
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
        {/* Saved searches (#31) — quick-access saved query chips */}
        {[
          { label: "Awaiting client reply", q: () => { setFilter("needs-me"); } },
          { label: "Unread threads", q: () => { setFilter("unread"); } },
        ].map(({ label, q }) => (
          <button
            key={label}
            type="button"
            onClick={q}
            style={{
              padding: "6px 10px",
              background: "transparent",
              color: COLORS.inkMuted,
              border: `1px dashed ${COLORS.border}`,
              borderRadius: 999,
              cursor: "pointer",
              fontFamily: FONTS.body,
              fontSize: 11.5,
              fontWeight: 500,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span aria-hidden style={{ fontSize: 10 }}>🔖</span>
            {label}
          </button>
        ))}

        {/* Clear all filters (#19) — visible when something non-default is active */}
        {(filter !== "needs-me" || search.trim() || sort !== "recent") && (
          <button
            type="button"
            onClick={() => { setFilter("needs-me" as const); setSearch(""); setSort("recent"); }}
            style={{
              padding: "6px 10px",
              background: "transparent",
              color: COLORS.inkMuted,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 999,
              cursor: "pointer",
              fontFamily: FONTS.body,
              fontSize: 11.5,
              fontWeight: 500,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span aria-hidden>×</span> Clear
          </button>
        )}
      </div>

      {matched.length > 0 && (filter !== "needs-me" || search.trim() || sort !== "recent") && (
        <div style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.inkMuted, marginBottom: 8 }}>
          Showing {matched.length} {matched.length === 1 ? "thread" : "threads"}
          {search.trim() && ` matching "${search.trim()}"`}
        </div>
      )}

      {/* WS-3.3 — "By stage" pipeline columns view */}
      {filter === "by-stage" ? (
        <InboxPipelineView
          inquiries={RICH_INQUIRIES.filter((i) => isOpen(i.stage))}
          onOpen={(id) => openDrawer("inquiry-workspace", { inquiryId: id })}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="mail"
          title={search.trim() ? `No results for "${search.trim()}"` : "Inbox zero"}
          body={search.trim() ? "Try a different search term or clear the query." : "Nothing waiting on you in this filter. Switch to All to see everything moving."}
          primaryLabel={search.trim() ? "Clear search" : "Show all threads"}
          onPrimary={() => { if (search.trim()) setSearch(""); else setFilter("all"); }}
        />
      ) : (
        <div
          style={{
            background: "#fff",
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {rows.map((inq, idx) => {
            const isOfferPending = inq.stage === "offer_pending";
            return (
              <SwipeableRow key={inq.id}>
                <button
                  type="button"
                  data-tulala-row
                  ref={(el) => {
                    rowRefs.current[idx] = el;
                  }}
                  onClick={() => goToInquiryMessages(inq.id)}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    width: "100%",
                    padding: "14px 16px",
                    background: "#fff",
                    border: "none",
                    borderTop: idx === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: FONTS.body,
                  }}
                >
                  <Avatar
                    initials={inq.clientName.slice(0, 2).toUpperCase()}
                    hashSeed={inq.clientName}
                    size={32}
                    tone="auto"
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
                        {inq.clientName}
                      </span>
                      <ClientTrustChip level={inq.clientTrust} compact />
                      {isFixtureInquiryId(inq.id) && <FixtureBadge />}
                      {inq.unreadPrivate > 0 && (
                        <span
                          title="Unread in private thread"
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            background: COLORS.amber,
                            color: "#fff",
                            padding: "1px 6px",
                            borderRadius: 999,
                          }}
                        >
                          {inq.unreadPrivate} private
                        </span>
                      )}
                      {inq.unreadGroup > 0 && (
                        <span
                          title="Unread in group thread"
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            background: COLORS.accent,
                            color: "#fff",
                            padding: "1px 6px",
                            borderRadius: 999,
                          }}
                        >
                          {inq.unreadGroup} group
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 12.5,
                        color: COLORS.inkMuted,
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {inq.brief}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        marginTop: 6,
                        fontSize: 11,
                        color: COLORS.inkDim,
                        alignItems: "center",
                      }}
                    >
                      <span>{INQUIRY_STAGE_META[inq.stage].label}</span>
                      <Bullet />
                      <span>
                        {inq.lastActivityHrs < 1
                          ? "just now"
                          : inq.lastActivityHrs < 24
                            ? `${Math.round(inq.lastActivityHrs)}h ago`
                            : `${Math.round(inq.lastActivityHrs / 24)}d ago`}
                      </span>
                      {inq.nextActionBy && (
                        <>
                          <Bullet />
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              padding: "1px 6px",
                              borderRadius: 999,
                              background:
                                inq.nextActionBy === "coordinator"
                                  ? COLORS.accentSoft
                                  : inq.nextActionBy === "client"
                                    ? "rgba(184,134,11,0.10)"
                                    : "rgba(11,11,13,0.06)",
                              color:
                                inq.nextActionBy === "coordinator"
                                  ? COLORS.accent
                                  : inq.nextActionBy === "client"
                                    ? COLORS.amber
                                    : COLORS.ink,
                            }}
                          >
                            {inq.nextActionBy === "coordinator" ? "Needs you"
                              : inq.nextActionBy === "client"    ? "Awaiting client"
                              : inq.nextActionBy === "talent"    ? "Awaiting talent"
                              : `Awaiting ${inq.nextActionBy}`}
                          </span>
                        </>
                      )}
                    </div>
                    {/* Inline quick-reply trio for offer_pending rows.
                        Lets coordinators / clients act without opening
                        the workspace drawer. */}
                    {isOfferPending && (
                      <div
                        style={{ marginTop: 10 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <QuickReplyButtons
                          onAccept={() => toast("Offer accepted")}
                          onCounter={() => {
                            goToInquiryMessages(inq.id);
                          }}
                          onDecline={() => toast("Offer declined")}
                        />
                      </div>
                    )}
                  </div>
                  <Icon name="chevron-right" size={14} color={COLORS.inkDim} />
                </button>
              </SwipeableRow>
            );
          })}
        </div>
      )}
      {filter !== "by-stage" && (
        <LoadMore
          total={matched.length}
          shown={rows.length}
          onMore={() => setPagesShown((p) => p + 1)}
        />
      )}
      {/* FAB — full quick-create menu (mobile only) */}
      <FabWithQuickCreate label="Create new" />
    </>
  );
}

/**
 * Mobile FAB that opens the canonical quick-create sheet. Use this
 * instead of <FloatingFab onClick={...}> on any page that wants the
 * full "+ New" experience on small screens.
 */
export function FabWithQuickCreate({ label = "Create new" }: { label?: string }) {
  const actions = useQuickCreateActionsFiltered();
  if (actions.length === 0) return null;
  return <FloatingFab label={label} actions={actions} />;
}

// ─── WS-3.3 InboxPipelineView ────────────────────────────────────────────────

const PIPELINE_STAGES: Array<{ id: RichInquiry["stage"]; label: string; color: string }> = [
  { id: "submitted",     label: "Submitted",     color: "#6366F1" },
  { id: "coordination",  label: "Coordinating",  color: "#3B82F6" },
  { id: "offer_pending", label: "Offer pending",  color: "#F59E0B" },
  { id: "approved",      label: "Approved",      color: "#10B981" },
  { id: "booked",        label: "Booked",        color: "#059669" },
];

function InboxPipelineView({
  inquiries,
  onOpen,
}: {
  inquiries: RichInquiry[];
  onOpen: (id: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        overflowX: "auto",
        paddingBottom: 12,
      }}
    >
      {PIPELINE_STAGES.map((col) => {
        const colInqs = inquiries.filter((i) => i.stage === col.id);
        return (
          <div
            key={col.id}
            style={{
              minWidth: 200, width: 220, flexShrink: 0,
              background: COLORS.surfaceAlt, borderRadius: RADIUS.lg,
              border: `1px solid ${COLORS.border}`, overflow: "hidden",
            }}
          >
            {/* Column header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "10px 12px",
              borderBottom: `1px solid ${COLORS.border}`,
              background: "#fff",
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: col.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.ink, fontFamily: FONTS.body }}>{col.label}</span>
              <span style={{
                marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#fff",
                background: col.color, borderRadius: 999,
                padding: "1px 6px", fontFamily: FONTS.body,
              }}>{colInqs.length}</span>
            </div>

            {/* Cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 8 }}>
              {colInqs.length === 0 ? (
                <div style={{ padding: "12px 8px", textAlign: "center", fontSize: 11.5, color: COLORS.inkDim, fontFamily: FONTS.body }}>
                  All clear
                </div>
              ) : (
                colInqs.map((inq) => (
                  <button
                    key={inq.id}
                    type="button"
                    onClick={() => onOpen(inq.id)}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      padding: "10px 12px",
                      background: "#fff", border: `1px solid ${COLORS.borderSoft}`,
                      borderRadius: RADIUS.md, cursor: "pointer",
                      fontFamily: FONTS.body,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = COLORS.accent)}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.borderSoft)}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.ink }}>
                        {inq.clientName}
                      </span>
                      {isFixtureInquiryId(inq.id) && <FixtureBadge compact />}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.inkMuted, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {inq.brief}
                    </div>
                    {inq.unreadGroup > 0 && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: "#fff",
                        background: COLORS.accent, borderRadius: 999, padding: "1px 5px",
                      }}>
                        {inq.unreadGroup} new
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// CALENDAR (#12 — month grid)
// ════════════════════════════════════════════════════════════════════
/**
 * Roster-wide calendar. Lays out a 6×7 month grid; each cell hints at
 * any bookings/holds on that day. Mock — real version reads from a
 * unified events feed.
 */
// ─── Calendar date helpers ────────────────────────────────────────────
// Parse inquiry/booking date strings into arrays of {day, inquiryId} for
// the currently-displayed month. Handles formats the mock data uses:
//   "Tue, May 6"  "May 14–15"  "May 18–20"  "Apr 10"  "Apr 29"
const MONTH_ABBR: Record<string, number> = {
  Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5,
  Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11,
};
export function parseInquiryDays(dateStr: string, displayMonth: number): number[] {
  // Strip leading weekday prefix ("Tue, " / "Sat, ")
  const s = dateStr.replace(/^(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat),?\s*/, "").trim();
  // Range within a month: "May 14–15" or "May 18–20"
  const rangeM = s.match(/^([A-Z][a-z]{2})\s+(\d+)[–\-](\d+)/);
  if (rangeM) {
    if (MONTH_ABBR[rangeM[1]] !== displayMonth) return [];
    const from = parseInt(rangeM[2], 10);
    const to   = parseInt(rangeM[3], 10);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }
  // Single day: "Apr 10" or "May 6"
  const singleM = s.match(/^([A-Z][a-z]{2})\s+(\d+)/);
  if (singleM && MONTH_ABBR[singleM[1]] === displayMonth) {
    return [parseInt(singleM[2], 10)];
  }
  return [];
}
