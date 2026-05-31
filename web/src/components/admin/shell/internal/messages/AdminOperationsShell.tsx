"use client";

import React, { useState, useEffect } from "react";
import { DemoBadge } from "@/components/demo-badge";
import { isFixtureInquiryId } from "@/lib/fixtures/is-fixture-id";
import { useAdminShell, RICH_INQUIRIES, COLORS, FONTS, type RichInquiry } from "../state";
import { Avatar, ClientTrustBadge } from "../primitives";
import { AdminInboxList } from "./admin-1";
import { AdminInquiryDetail } from "./admin-2";
import { EmptyDetail } from "./client-1";
import { ClientProjectRow } from "./ClientProjectShell";
import { __convFlags, consumePendingConversation, getIncomingHandoffs, isLocallySeen, isManualUnread, markConvSeen, useSeenSubscription } from "./conversation-stash";
import { ageLabel, stageStyle, useScrollIntoViewWhenActive } from "./messages-shared";
import { InboxRowHoverActions, initialsOf } from "./shared/inbox-identity-1";
import { MobileInboxTab } from "./shared/inbox-layout-1";
import type { Offer } from "./shared/machinery-9";
import { JobStageFunnel } from "./talent-1";
import { withWeekday } from "./TalentJobShell";


// ════════════════════════════════════════════════════════════════════
// 1) ADMIN OPERATIONS SHELL — workspace admin / coordinator
// ════════════════════════════════════════════════════════════════════
//
// This shell feels like an operations console:
//   • inbox left (with admin-flavored rows: stage + needs-me + lineup)
//   • thread + composer center (uses existing pov-aware WorkspaceBody)
//   • operational right rail handled inside WorkspaceBody (Lineup, Offer
//     builder, Coordinator, Activity, Files)
//
// The right rail in WorkspaceBody already gives admin everything they
// need. The admin's job: flip between Client thread / Talent group /
// Files (the existing tabs) and use the rail to drive the deal forward.

export type AdminFilter = "all" | "needs-me" | "unread" | "coordinating" | "handoffs" | "inquiry" | "hold" | "booked" | "past" | "archived" | "triage";

export function AdminOperationsShell() {
  const { effectiveMessagesInquiries, effectiveTenant, tenantSlug } = useAdminShell();
  // Context already decides between bridge-populated (use as-is, even when
  // empty) and standalone-dev (RICH_INQUIRIES mock). Re-doing the fallback
  // here with `length > 0 ?` was the bug: real tenants with 0 inquiries
  // had their dashboard show mock "24 active" data. Trust the context.
  const inquiries = effectiveMessagesInquiries;
  // Re-render on seen-state changes so the inbox re-sorts the moment
  // a row gets clicked (NEW pill drops, unseen tier loses that row).
  useSeenSubscription();
  // Pin-aware initial state — same pattern as the other shells. The pin
  // can carry either a conv id (cN) OR an inquiry id (RI-XXX); we map
  // through INQUIRY_TO_CONV reverse if needed.
  const { initialId, fromPin } = (() => {
    const pending = consumePendingConversation();
    if (!pending) return { initialId: inquiries[0]?.id ?? "", fromPin: false };
    if (inquiries.some(i => i.id === pending)) return { initialId: pending, fromPin: true };
    const reverseFromConv: Record<string, string> = { c1: "RI-201", c2: "RI-202", c3: "RI-203" };
    const ri = reverseFromConv[pending];
    if (ri && inquiries.some(i => i.id === ri)) return { initialId: ri, fromPin: true };
    return { initialId: inquiries[0]?.id ?? "", fromPin: false };
  })();
  const [activeId, setActiveId] = useState<string>(initialId);
  // Initial conv counts as seen on mount so the user never sees a NEW
  // pill on the conv they're currently viewing.
  useEffect(() => {
    if (initialId) markConvSeen(initialId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: initialId is derived before first render and should only mark seen once; markConvSeen is a stable external fn
  }, []);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AdminFilter>("needs-me");
  const [mobilePane, setMobilePane] = useState<"list" | "thread">(fromPin ? "thread" : "list");

  const stageBucket = (s: string): "inquiry" | "hold" | "booked" | "past" => {
    if (s === "draft" || s === "submitted" || s === "coordination") return "inquiry";
    if (s === "offer_pending") return "hold";
    if (s === "approved" || s === "booked") return "booked";
    return "past";
  };

  // talent_coord lens — inquiries where the current user (Marta) is
  // the coordinator on the lineup. Surfaces the dedicated "I'm
  // running this" view for talent who manage their own studios.
  const isCoordOnInquiry = (i: RichInquiry) =>
    i.coordinator?.name === "Marta Reyes"
    || i.requirementGroups.some(g => g.talents.some(t => t.name === "Marta Reyes"));

  // Pre-compute incoming handoff inquiry-id set so the row filter can
  // do a quick membership check without re-querying the store per row.
  const handoffIds = new Set(getIncomingHandoffs("Marta Reyes").map(h => h.inquiryId));
  const filtered = inquiries.filter(i => {
    const bucket = stageBucket(i.stage);
    const isArchived = !!__convFlags[i.id]?.archived;
    // Hide archived from every other view; only the "archived" filter
    // shows them. Mirrors how Gmail / iMessage hide archived threads.
    if (filter !== "archived" && isArchived) return false;
    if (filter === "archived" && !isArchived) return false;
    if (filter === "needs-me" && i.nextActionBy !== "coordinator") return false;
    if (filter === "unread" && i.unreadGroup === 0 && i.unreadPrivate === 0) return false;
    if (filter === "coordinating" && !isCoordOnInquiry(i)) return false;
    if (filter === "handoffs" && !handoffIds.has(i.id)) return false;
    // A7 — triage queue: coordinator-action-needed AND still in the
    // open part of the funnel (inquiry / hold). Past + booked + archived
    // are excluded; this view is for "what do I owe right now."
    if (filter === "triage") {
      if (i.nextActionBy !== "coordinator") return false;
      if (bucket !== "inquiry" && bucket !== "hold") return false;
    }
    if (
      filter !== "all"
      && filter !== "needs-me"
      && filter !== "unread"
      && filter !== "coordinating"
      && filter !== "handoffs"
      && filter !== "archived"
      && filter !== "triage"
      && bucket !== filter
    ) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      // Search across all the things an admin would scan for: client
      // name, brief, agency, coordinator name, location/city, and the
      // brief inquiry source label. Used to be client+brief only —
      // searching for "Sara" or "Lisbon" returned nothing.
      const haystack = [
        i.clientName,
        i.brief,
        i.agencyName,
        i.coordinator?.name,
        i.location,
        i.source.kind === "hub" ? i.source.hubName : "",
        i.source.kind === "direct" ? i.source.domain : "",
      ].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    // A7 — Triage view: SLA pressure first (oldest unanswered on top).
    // Highest `lastActivityHrs` = "talked to client a long time ago" =
    // most pressing to revisit. Reverses the default recency tier so
    // the admin sees their backlog, not their freshest threads.
    if (filter === "triage") {
      return b.lastActivityHrs - a.lastActivityHrs;
    }
    // Default chronological model (same as talent + client inboxes):
    //   Tier 1 — unseen / brand-new inquiries first (most urgent)
    //   Tier 2 — needs-me first (admin owes a reply)
    //   Tier 3 — recency (lower ageHrs = more recent → top)
    const aNew = (a.seen === false && !isLocallySeen(a.id)) ? 1 : 0;
    const bNew = (b.seen === false && !isLocallySeen(b.id)) ? 1 : 0;
    if (aNew !== bNew) return bNew - aNew;
    const aMine = a.nextActionBy === "coordinator" ? 1 : 0;
    const bMine = b.nextActionBy === "coordinator" ? 1 : 0;
    if (aMine !== bMine) return bMine - aMine;
    return a.lastActivityHrs - b.lastActivityHrs;
  });

  const active = inquiries.find(i => i.id === activeId) ?? filtered[0] ?? inquiries[0];
  const totalUnread = inquiries.reduce((s, i) => s + i.unreadGroup + i.unreadPrivate, 0);
  const needsMe = inquiries.filter(i => i.nextActionBy === "coordinator").length;

  return (
    <>
      <div
        data-tulala-messages-shell
        data-mobile-pane={mobilePane}
        style={{
          display: "grid",
          ["--tulala-shell-cols" as never]: "340px 1fr",
          gridTemplateColumns: "var(--tulala-shell-cols)",
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 14,
          overflow: "hidden",
          height: "min(calc(100vh - var(--proto-cbar, 50px) - 56px - 200px), 820px)",
          minHeight: 560,
          minWidth: 0,
          maxWidth: "100%",
          fontFamily: FONTS.body,
        }}
      >
        {/* Same fixed-position mobile pattern as the talent + client
            shells. Shell pins to viewport between identity bar (top)
            and bottom nav, panes stack via grid + slide between via
            translateX (CSS lives in page.tsx). */}
        <style dangerouslySetInnerHTML={{ __html:
          "@media (max-width: 720px){"
          + "[data-tulala-messages-shell]{"
          + "position:fixed!important;"
          + "left:0!important;right:0!important;"
          + "width:100vw!important;max-width:100vw!important;"
          + "grid-template-columns:1fr!important;"
          + "top:calc(var(--proto-cbar, 50px) + 56px)!important;"
          + "bottom:80px!important;"
          + "height:calc(100dvh - var(--proto-cbar, 50px) - 56px - 80px)!important;"
          + "min-height:0!important;max-height:none!important;"
          + "border-radius:0!important;border-left:0!important;border-right:0!important;"
          + "z-index:10!important;"
          + "}"
          + "[data-tulala-messages-shell] > *{min-width:0!important;max-width:100%!important}"
          + "}"
        }} />
        <AdminInboxList
          inquiries={filtered}
          activeId={active?.id ?? ""}
          onSelect={(id) => { setActiveId(id); setMobilePane("thread"); markConvSeen(id); }}
          search={search}
          onSearchChange={setSearch}
          filter={filter}
          onFilterChange={setFilter}
          totalUnread={totalUnread}
          needsMe={needsMe}
        />
        <div data-tulala-thread-pane style={{ display: "flex", flexDirection: "column", minHeight: 0, background: COLORS.surfaceAlt, overflow: "hidden" }}>
          {active ? (
            <AdminInquiryDetail inquiry={active} onBack={() => setMobilePane("list")} />
          ) : inquiries.length === 0 ? (
            // Zero-inquiry empty state: guide the workspace owner toward
            // sharing their storefront so the first client reaches out.
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              padding: "32px 24px", gap: 10, textAlign: "center",
            }}>
              <div aria-hidden style={{
                width: 44, height: 44, borderRadius: 12,
                background: COLORS.accentSoft, color: COLORS.accent,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                marginBottom: 2,
              }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M18 3H2a1 1 0 00-1 1v10a1 1 0 001 1h3l3 3 3-3h7a1 1 0 001-1V4a1 1 0 00-1-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              </div>
              <div style={{ fontFamily: FONTS.display, fontSize: 15, fontWeight: 700 }} className="text-admin-ink">
                No messages yet
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.5, maxWidth: 280 }} className="text-admin-ink-muted">
                They&apos;ll appear here as clients reach out via your storefront.
              </div>
              {(tenantSlug || effectiveTenant?.domain) && (
                <a
                  href={`https://${effectiveTenant?.domain ?? `${tenantSlug}.tulala.digital`}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    marginTop: 4, display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "7px 14px", borderRadius: 999,
                    border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
                    fontSize: 12.5, fontWeight: 600, color: COLORS.accent,
                    textDecoration: "none", fontFamily: FONTS.body,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M3 6h6M6 3v6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                  Visit your storefront
                </a>
              )}
            </div>
          ) : (
            <EmptyDetail label="No inquiry selected" />
          )}
        </div>
      </div>
      {mobilePane === "thread" && (
        <MobileInboxTab
          unreadCount={totalUnread}
          onOpen={() => setMobilePane("list")}
        />
      )}
    </>
  );
}

// ── Admin: dense operations row ──
// Information-rich for triage. Inline signals: stage · budget (when
// known) · shoot date · who-owns-it (coordinator initials) · lineup
// progress dots. The "⚡ needs you" chip only appears when the chip
// would tell you something the filter doesn't already (i.e. NOT shown
// when the active filter is itself "needs-me").
// AdminInquiryRow uses the SAME 4-row template as ClientProjectRow so
// the inbox reads with one design language across all three roles. The
// only differences are admin-specific signals folded into the same
// slots:
//   • Row 1 title is the brief (the project), not the client name
//   • Row 2 leads with the client + lineup count "0/1" (admin
//     operational data) instead of the client's "via Agency"
//   • Row 3 status line speaks admin's voice ("Awaiting your reply",
//     "3 talents pending") rather than the client's ("Coordinator
//     preparing your shortlist")
//   • Row 4 right slot is the coordinator-owner avatar+name (same
//     as client's, just sourced differently)
//   • Avatar carries the ClientTrustBadge — admin-only signal
export function AdminInquiryRow({
  inquiry, active, onClick, hideNeedsYouChip,
}: { inquiry: RichInquiry; active: boolean; onClick: () => void; hideNeedsYouChip: boolean }) {
  const totalUnread = inquiry.unreadGroup + inquiry.unreadPrivate;
  const allTalents = inquiry.requirementGroups.flatMap(g => g.talents);
  const lineupTotal = allTalents.length;
  const lineupAccepted = allTalents.filter(t => t.status === "accepted").length;
  const stageBucket: "inquiry" | "hold" | "booked" | "past" =
      inquiry.stage === "draft" || inquiry.stage === "submitted" || inquiry.stage === "coordination" ? "inquiry"
    : inquiry.stage === "offer_pending" ? "hold"
    : inquiry.stage === "approved" || inquiry.stage === "booked" ? "booked"
    : "past";
  const sc = stageStyle(stageBucket);
  const needsMe = inquiry.nextActionBy === "coordinator";
  // hideNeedsYouChip is set when the user is already filtering by
  // needs-me — we drop the redundant cue from the row in that case.
  const surfaceNeedsMe = needsMe && !hideNeedsYouChip;
  // Coordinator owner — admin needs to know "who owns this" at a glance
  const coord = inquiry.coordinator;

  // Map to client-row's 4-row vocabulary. "Title" = the project brief.
  // "Subtitle" = client + date + city, comma-joined, ellipsised.
  const cityLabel = inquiry.location?.split(" · ")[0] ?? null;
  const briefMentionsCity = cityLabel && inquiry.brief.toLowerCase().includes(cityLabel.toLowerCase());
  const subtitleParts = [
    inquiry.clientName,
    inquiry.date ? withWeekday(inquiry.date) : null,
    !briefMentionsCity ? cityLabel : null,
  ].filter(Boolean);

  // Slice Q (Messages consolidation v2 §10): inbox rows surface the
  // NEXT REQUIRED ACTION of the viewer, not just the last message.
  // When `surfaceNeedsMe` we prepend a clear operational verb that
  // matches plan §10's "Awaiting your reply / Send offer / Talent rate
  // expected" pattern. Falls back to stage-derived copy otherwise.
  const lastMsg = inquiry.messages[inquiry.messages.length - 1];
  const statusLine = (() => {
    // Operational next-action verb prefix when this row needs me.
    if (surfaceNeedsMe) {
      if (inquiry.stage === "submitted" || inquiry.stage === "draft")
        return `→ Add talent · ${lineupTotal === 0 ? "shortlist empty" : `${lineupAccepted}/${lineupTotal} accepted`}`;
      if (inquiry.stage === "coordination" && lineupAccepted < lineupTotal)
        return `→ Nudge talent · ${lineupTotal - lineupAccepted} not responded`;
      if (inquiry.stage === "coordination")
        return "→ Draft offer · lineup confirmed";
      if (inquiry.stage === "offer_pending")
        return inquiry.offer?.total
          ? `→ Awaiting client · offer ${inquiry.offer.total}`
          : "→ Awaiting client decision";
      if (lastMsg && !lastMsg.isYou)
        return `→ Reply to client · "${(lastMsg.body || "").slice(0, 48)}"`;
    }
    if (inquiry.stage === "draft")          return "Draft · not yet sent to talent";
    if (inquiry.stage === "submitted")      return "Inviting talent to the shortlist";
    if (inquiry.stage === "coordination")   return lineupAccepted < lineupTotal ? `Coordinating · ${lineupAccepted}/${lineupTotal} confirmed` : "All talent confirmed · drafting offer";
    if (inquiry.stage === "offer_pending")  return inquiry.offer?.total ? `Offer ${inquiry.offer.total} · awaiting client` : "Offer with client · awaiting approval";
    if (inquiry.stage === "approved")       return "Client approved · prep production";
    if (inquiry.stage === "booked")         return inquiry.offer?.total ? `Booked · ${inquiry.offer.total}` : "Booked · schedule confirmed";
    if (inquiry.stage === "rejected")       return "Rejected by client";
    if (inquiry.stage === "expired")        return "Expired · client never replied";
    if (lastMsg) return (lastMsg.isYou ? "You: " : "") + (lastMsg.body || "").slice(0, 64);
    return "No messages yet";
  })();
  const isActionNeeded = surfaceNeedsMe;

  // Same seen + tint logic as the talent + client inboxes so the
  // row pattern reads identically across all three roles.
  // Manual-unread (user toggled "Mark unread" in hover actions)
  // overrides the locally-seen state so the row reads as unseen
  // even if it was opened before.
  const isUnseen = isManualUnread(inquiry.id) || (inquiry.seen === false && !isLocallySeen(inquiry.id));
  const stageBg: string =
    active ? "rgba(11,11,13,0.045)"
    : isUnseen ? "rgba(176,48,58,0.05)"
    : isActionNeeded ? "rgba(176,48,58,0.04)"
    : stageBucket === "booked" ? "rgba(46,125,91,0.045)"
    : "transparent";

  const rowRef = useScrollIntoViewWhenActive(active);

  // Source chip ("Cold email" / "Direct" / "Hub") removed from the
  // row — it was an opaque admin-metadata signal that crowded the
  // tiny rail without telling the user anything actionable. The same
  // info is still visible inside the inquiry detail header.

  return (
    <button
      ref={rowRef}
      type="button"
      onClick={onClick}
      data-tulala-inbox-row
      style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        width: "100%", padding: "12px 14px",
        background: stageBg,
        borderLeft: active ? `3px solid ${COLORS.accent}`
          : isUnseen ? `3px solid ${COLORS.coral}`
          : isActionNeeded ? `3px solid ${COLORS.coral}88`
          : "3px solid transparent",
        // Longhand to silence React's shorthand-vs-longhand warning.
        borderTop: "none", borderRight: "none",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        cursor: "pointer", textAlign: "left", fontFamily: FONTS.body,
        position: "relative",
      }}
    >
      <InboxRowHoverActions rowId={inquiry.id} label={inquiry.clientName} />
      {/* Project avatar — initial of the brief (matches client row's
          choice to lead with the project, not the client). Trust badge
          stays as an avatar overlay because it's an admin-only signal
          we don't want to surface elsewhere. */}
      <div style={{ position: "relative", flexShrink: 0, marginTop: 2 }}>
        <Avatar
          size={36}
          tone="auto"
          hashSeed={inquiry.brief + inquiry.clientName}
          initials={initialsOf(inquiry.brief.split(" ").slice(0, 2).join(" "))}
        />
        <ClientTrustBadge level={inquiry.clientTrust} />
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        {/* Row 1 — project (brief) + NEW pill + age */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <span title={inquiry.brief} style={{
            fontSize: 14, fontWeight: 700, color: COLORS.ink,
            flex: 1, minWidth: 0,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            lineHeight: 1.25, letterSpacing: -0.1,
          }}>
            {inquiry.brief}
          </span>
          {isUnseen && (
            <span style={{
              flexShrink: 0,
              fontSize: 9, fontWeight: 800, letterSpacing: 0.6,
              padding: "2px 6px", borderRadius: 999,
              background: COLORS.coral, color: "#fff",
              textTransform: "uppercase",
              boxShadow: `0 0 0 2px ${COLORS.coral}1f`,
            }}>NEW</span>
          )}
          {isFixtureInquiryId(inquiry.id) && <DemoBadge />}
          <span style={{ flexShrink: 0, fontSize: 10.5, fontVariantNumeric: "tabular-nums" }} className="text-admin-ink-muted">
            {ageLabel(inquiry.lastActivityHrs)}
          </span>
        </div>

        {/* Row 2 — client + date + city + tiny lineup count + source chip.
            Lineup count is admin-specific operational signal that lives
            INLINE in this row (rather than the old separate ops-meta
            row) so the row is no taller than the client's. */}
        {(subtitleParts.length > 0 || lineupTotal > 0) && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, lineHeight: 1.4, minWidth: 0 }} className="text-admin-ink-muted">
            <span style={{
              minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap", flex: 1,
            }}>
              {subtitleParts.join(" · ")}
            </span>
            {lineupTotal > 0 && (() => {
              // Tone ladder: red at 0/N (nobody on yet — needs urgent
              // outreach), amber while partially accepted (still chasing),
              // green at full (locked in). Drives quick scanning of the
              // pipeline health column without reading numbers.
              const tone = lineupAccepted === 0 ? "red"
                : lineupAccepted < lineupTotal ? "amber"
                : "green";
              const palette = tone === "red"
                ? { bg: `${COLORS.coral}15`, fg: COLORS.coralDeep }
                : tone === "amber"
                ? { bg: `${COLORS.amber}1c`, fg: COLORS.amber }
                : { bg: COLORS.successSoft, fg: COLORS.successDeep };
              return (
                <span aria-label={`${lineupAccepted} of ${lineupTotal} talent accepted`} style={{
                  flexShrink: 0,
                  fontSize: 10, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                  padding: "1px 6px", borderRadius: 999,
                  background: palette.bg, color: palette.fg,
                }}>{lineupAccepted}/{lineupTotal}</span>
              );
            })()}
          </div>
        )}

        {/* Row 3 — status line (admin voice) + unread badge. Coral
            bullet appears when the row needs admin action, mirroring
            the client row's action-needed treatment. */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
          {isActionNeeded && (
            <span aria-hidden style={{
              flexShrink: 0,
              width: 6, height: 6, borderRadius: "50%",
              background: COLORS.coral,
            }} />
          )}
          <span style={{
            flex: 1, minWidth: 0,
            fontSize: 11.5,
            color: isActionNeeded ? COLORS.coralDeep : totalUnread > 0 ? COLORS.ink : COLORS.inkMuted,
            fontWeight: isActionNeeded ? 600 : totalUnread > 0 ? 500 : 400,
            lineHeight: 1.4,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {statusLine}
          </span>
          {totalUnread > 0 && (
            <span style={{ flexShrink: 0, minWidth: 16, height: 16, padding: "0 5px", borderRadius: 999, boxSizing: "border-box", color: "#fff", fontSize: 9.5, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }} className="bg-admin-accent">{totalUnread}</span>
          )}
        </div>

        {/* Row 4 — funnel dots + coordinator owner chip. The uppercase
            stage word is intentionally dropped: the funnel's current-
            dot position is the same signal in a more compact form. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
          <span style={{ flex: "0 0 auto", maxWidth: 130 }}>
            <JobStageFunnel currentStage={inquiry.stage} compact={true} />
          </span>
          <span style={{ flex: 1 }} />
          {coord && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              flexShrink: 0,
              fontSize: 10.5, color: COLORS.inkMuted,
            }} title={coord.name}>
              <Avatar size={14} tone="ink" hashSeed={coord.name} initials={coord.initials} />
              {coord.name.split(" ")[0]}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
