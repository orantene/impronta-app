"use client";

import { useEffect, useRef, useState } from "react";
import { DemoBadge as FixtureBadge } from "@/components/demo-badge";
import { isFixtureInquiryId } from "@/lib/fixtures/is-fixture-id";
import { interpolate } from "@/i18n/interpolate";
import { useT } from "@/i18n/use-t";
import { pinNextConversation as pinNextConversationP } from "../messages";
import { Avatar, Bullet, ClientTrustChip, EmptyState, FloatingFab, GhostButton, Icon, SwipeableRow, useKeyboardListNav } from "../primitives";
import { COLORS, FONTS, INQUIRY_STAGE_LABEL_KEYS, INQUIRY_STAGE_META, RADIUS, RICH_INQUIRIES, useAdminShell } from "../state";
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

/**
 * Mobile FAB that opens the canonical quick-create sheet. Use this
 * instead of <FloatingFab onClick={...}> on any page that wants the
 * full "+ New" experience on small screens.
 */
export function FabWithQuickCreate({ label }: { label?: string }) {
  const t = useT();
  const actions = useQuickCreateActionsFiltered();
  if (actions.length === 0) return null;
  return <FloatingFab label={label ?? t("dashboard.adminInbox.createNew")} actions={actions} />;
}

// ─── WS-3.3 InboxPipelineView ────────────────────────────────────────────────

const PIPELINE_STAGES: Array<{ id: RichInquiry["stage"]; labelKey: string; color: string }> = [
  { id: "submitted",     labelKey: "dashboard.adminInbox.pipeSubmitted",    color: "#6366F1" },
  { id: "coordination",  labelKey: "dashboard.adminInbox.pipeCoordinating", color: "#3B82F6" },
  { id: "offer_pending", labelKey: "dashboard.adminInbox.pipeOfferPending", color: "#F59E0B" },
  { id: "approved",      labelKey: "dashboard.adminInbox.pipeApproved",     color: "#10B981" },
  { id: "booked",        labelKey: "dashboard.adminInbox.pipeBooked",       color: "#059669" },
];

function InboxPipelineView({
  inquiries,
  onOpen,
}: {
  inquiries: RichInquiry[];
  onOpen: (id: string) => void;
}) {
  const t = useT();
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
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: FONTS.body }} className="text-admin-ink">{t(col.labelKey)}</span>
              <span style={{
                marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#fff",
                background: col.color, borderRadius: 999,
                padding: "1px 6px", fontFamily: FONTS.body,
              }}>{colInqs.length}</span>
            </div>

            {/* Cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 8 }}>
              {colInqs.length === 0 ? (
                <div style={{ padding: "12px 8px", textAlign: "center", fontSize: 11.5, fontFamily: FONTS.body }} className="text-admin-ink-dim">
                  {t("dashboard.adminInbox.allClear")}
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
                      <span className="text-admin-ink text-admin-12h font-semibold">
                        {inq.clientName}
                      </span>
                      {isFixtureInquiryId(inq.id) && <FixtureBadge compact />}
                    </div>
                    <div style={{ fontSize: 11, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className="text-admin-ink-muted">
                      {inq.brief}
                    </div>
                    {inq.unreadGroup > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", borderRadius: 999, padding: "1px 5px" }} className="bg-admin-accent">
                        {interpolate(t("dashboard.adminInbox.countNew"), { count: inq.unreadGroup })}
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
