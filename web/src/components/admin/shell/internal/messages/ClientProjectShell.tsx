"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clientApproveCurrentOffer, clientRejectCurrentOffer, startInquiryCheckout } from "@/lib/server-actions/client-pipeline";
import { useAdminShell, COLORS, FONTS } from "../state";
import { Avatar } from "../primitives";
import { CLIENT_MOCK_CONVERSATIONS_BY_PROFILE, MOCK_CONVERSATIONS, type Conversation } from "../talent";
import { AdminInquiryRow } from "./AdminOperationsShell";
import { ClientTabsBlock, EmptyDetail } from "./client-1";
import { consumePendingConversation, isLocallySeen, isManualUnread, markConvSeen, pinNextConversation, sortPinnedFirst, useFlagsSubscription, useSeenSubscription } from "./conversation-stash";
import { ageLabel, renderWithDateGroups, stageStyle, useScrollIntoViewWhenActive } from "./messages-shared";
import { HoverActionsCss, InboxRowHoverActions, SearchPill, initialsOf } from "./shared/inbox-identity-1";
import { FilterChip } from "./shared/inbox-identity-2";
import { MobileInboxTab } from "./shared/inbox-layout-1";
import { fmtMoney, getOffer } from "./shared/machinery-10";
import { disabledBtn } from "./shared/machinery-13";
import type { Offer } from "./shared/machinery-9";
import { JobStageFunnel, ShellHeader, sourceChipMeta } from "./talent-1";
import { TalentJobRow, withWeekday } from "./TalentJobShell";


// ════════════════════════════════════════════════════════════════════
// 3) CLIENT PROJECT SHELL — calm, premium, project-status focused
// ════════════════════════════════════════════════════════════════════
//
// Detail view = a project status page. Hero is the stage progress + a
// single "Next action" card (Approve offer / Sign / Pay). Agency card,
// talent lineup avatars, schedule, files, timeline. Conversation at
// the bottom (single thread with the coordinator).

export type ClientFilter = "all" | "waiting-agency" | "action-needed" | "booked" | "past";

// Derived next-action — reads offer.stage + conv.stage so adding a
// new conversation no longer requires updating a hand-rolled map.
// Static overrides below win when the derived label doesn't carry
// enough context (e.g. payment-blocker reasons unique to one conv).
export function deriveClientNextAction(conv: Conversation): { label: string; primary?: boolean } | null {
  const offer = getOffer(conv.id);
  const ofStage = offer?.stage;
  // Booked + offer accepted → next-action depends on what's left.
  if (conv.stage === "booked") {
    // Mock the deposit/balance signal off the conv.amountToYou string
    // (production reads from a real invoice ledger).
    if (conv.amountToYou && /balance.*owed|balance.*due|€\d+ balance/i.test(conv.amountToYou)) {
      const m = conv.amountToYou.match(/€[\d,]+ balance/);
      return { label: m ? `Pay ${m[0]}` : "Pay balance", primary: true };
    }
    return { label: "Sign call sheet" };
  }
  if (conv.stage === "past") return null;
  if (conv.stage === "cancelled") return null;
  // Inquiry / hold — depends on offer stage.
  if (ofStage === "sent" || ofStage === "reviewing") {
    const total = offer ? offer.rows.reduce((s, r) => s + r.clientRate * r.units, 0) + offer.agencyFee : 0;
    const currency = offer?.clientBudget?.currency ?? "EUR";
    return { label: total > 0 ? `Approve offer (${fmtMoney(total, currency)})` : "Approve offer", primary: true };
  }
  if (ofStage === "countered") return { label: "Review counter", primary: true };
  if (ofStage === "accepted") return { label: "Sign booking" };
  if (conv.stage === "hold") {
    return { label: `Confirm ${conv.date ?? "hold"}`, primary: true };
  }
  if (conv.stage === "inquiry") {
    if (ofStage === "no_offer" || ofStage === "client_budget") return { label: "Add a brief", primary: true };
    return { label: "Review profiles" };
  }
  return null;
}

// Static fallbacks — used only when deriveClientNextAction can't infer
// the right label (KYC blockers, post-cancellation notes, etc.). Most
// conversations get their CTA derived; this map is for edge cases.
export const CLIENT_NEXT_ACTION_OVERRIDES: Record<string, { label: string; primary?: boolean } | null> = {
  g1: { label: "Verify card on file", primary: true },
  g3: { label: "Verify card to unlock profiles", primary: true },
};

// Compatibility shim — the existing call sites use bracket access
// (`CLIENT_NEXT_ACTION_FOR_CONV[conv.id]`). Proxied so the lookup
// runs derive-then-override at call time. Pass the conv-id key, get
// the right computed action.
export const CLIENT_NEXT_ACTION_FOR_CONV: Record<string, { label: string; primary?: boolean } | null> = new Proxy({}, {
  get(_t, convId: string) {
    if (CLIENT_NEXT_ACTION_OVERRIDES[convId]) return CLIENT_NEXT_ACTION_OVERRIDES[convId];
    // Find the conv across both client-profile maps.
    for (const list of Object.values(CLIENT_MOCK_CONVERSATIONS_BY_PROFILE)) {
      const c = list.find(c => c.id === convId);
      if (c) return deriveClientNextAction(c);
    }
    // Fall back to MOCK_CONVERSATIONS for talent-side ids that share
    // the same conv (preserves the c1 / c2 / c3 entries' behavior).
    const c = MOCK_CONVERSATIONS.find(c => c.id === convId);
    if (c) return deriveClientNextAction(c);
    return null;
  },
}) as Record<string, { label: string; primary?: boolean } | null>;

// Old hand-rolled map kept as a backstop reference (no longer the
// source of truth). The Proxy above wins. Useful for documenting
// what the legacy values were when something looks wrong.
export const _LEGACY_CLIENT_NEXT_ACTION: Record<string, { label: string; primary?: boolean } | null> = {
  // Mock client-side next-action per conversation. Production reads
  // from the inquiry record; null = no action needed.
  c1: null,
  c2: { label: "Sign booking", primary: true },
  c3: { label: "Approve offer (€8,000)", primary: true },
  c4: { label: "Reply to coordinator" },
  c5: { label: "Pay invoice (€3,200)", primary: true },
  // Martina profile — 8 projects across stages (5 seeded + 3 new
  // for richer demo: 2 brand-new inquiries with NEW pill, 1 in-flight
  // hold awaiting approval).
  m1: { label: "Approve talent (Marta + 2 alts)", primary: true }, // inquiry · awaiting client decision
  m2: { label: "Sign call sheet" },                                // booked · routine confirmation
  m3: null,                                                         // wrapped, paid
  m4: { label: "Confirm Sep 6 hold", primary: true },              // hold · client owes a yes
  m5: null,                                                         // cancelled
  m6: { label: "Review brief + budget" },                           // brand-new inquiry, agency replying first
  m7: { label: "Review profiles" },                                 // brand-new inquiry from referral agency
  m8: { label: "Approve sunset shoot (€4,200)", primary: true },   // hold · approval needed
  // Gringo profile — 4 projects (2 seeded + 2 new for variety).
  g1: { label: "Verify card on file", primary: true },             // inquiry · KYC blocker
  g2: null,                                                         // past
  g3: { label: "Verify card to unlock profiles", primary: true },  // brand-new inquiry, KYC blocker
  g4: { label: "Pay €1,200 balance", primary: true },              // booked · balance due
};
void _LEGACY_CLIENT_NEXT_ACTION;

export function ClientProjectShell() {
  // Each client profile sees only THEIR commissioned projects — not
  // the talent's full inbox or the agency's roster. Falls back to an
  // empty list if a profile hasn't seeded any.
  const { state } = useAdminShell();
  const profileId = state.clientProfile;
  const conversations = CLIENT_MOCK_CONVERSATIONS_BY_PROFILE[profileId] ?? [];
  // Re-render on seen-state changes so the inbox re-sorts the moment
  // a row is clicked (the NEW pill drops, the unseen sort tier loses
  // that conv, and it re-ranks into the recency sort).
  useSeenSubscription();
  // Pin the conversation that the caller requested via pinNextConversation
  // (e.g. the Today bookings row). One-shot consumption — refresh won't
  // re-pin, so the user can navigate freely after.
  // Track BOTH the resolved id AND whether it came from a pin. When the
  // caller (Today row, booking row, etc.) pinned a conversation we always
  // open the thread pane — even if the pinned id happens to match the
  // default first conversation. Without this, clicking Mango (which is
  // c1, also the default) would leave the user stranded on the list.
  const { initialId, fromPin } = (() => {
    const pending = consumePendingConversation();
    if (pending && conversations.some(c => c.id === pending)) {
      return { initialId: pending, fromPin: true };
    }
    return { initialId: conversations[0]?.id ?? "", fromPin: false };
  })();
  const [activeId, setActiveId] = useState<string>(initialId);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ClientFilter>("all");
  const [mobilePane, setMobilePane] = useState<"list" | "thread">(fromPin ? "thread" : "list");

  const filtered = conversations.filter(c => {
    const next = CLIENT_NEXT_ACTION_FOR_CONV[c.id];
    if (filter === "action-needed" && !next?.primary) return false;
    if (filter === "waiting-agency" && next?.primary) return false;
    if (filter === "booked" && c.stage !== "booked") return false;
    if (filter === "past" && c.stage !== "past") return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const haystack = [
        c.client, c.brief, c.agency,
        c.leader?.name, c.location, c.date,
        c.lastMessage.preview,
      ].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    // Same chronological model as the talent inbox: unseen tier
    // first, then by recency (freshest first). Action-needed acts
    // as a secondary tier-1 boost so projects waiting on the
    // client's decision (Approve / Sign / Pay) bubble up too.
    const aNew = (a.seen === false && !isLocallySeen(a.id)) ? 1 : 0;
    const bNew = (b.seen === false && !isLocallySeen(b.id)) ? 1 : 0;
    if (aNew !== bNew) return bNew - aNew;
    const aAct = CLIENT_NEXT_ACTION_FOR_CONV[a.id]?.primary ? 1 : 0;
    const bAct = CLIENT_NEXT_ACTION_FOR_CONV[b.id]?.primary ? 1 : 0;
    if (aAct !== bAct) return bAct - aAct;
    return a.lastMessage.ageHrs - b.lastMessage.ageHrs;
  });

  const active = conversations.find(c => c.id === activeId) ?? filtered[0] ?? conversations[0];

  return (
    <>
      {/* Page header removed — list-pane header already shows "Projects · count". */}
      <div
        data-tulala-messages-shell
        data-mobile-pane={mobilePane}
        style={{
          display: "grid",
          // CSS variable drives the desktop 2-track layout; mobile
          // override in <style> below collapses to 1fr unambiguously.
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
        {/* Same fixed-position mobile pattern as the talent shell —
            shell pins to viewport between identity bar (top) and bottom
            nav, panes stack via grid + slide between via translateX
            (CSS lives in page.tsx). 1fr override is repeated here for
            specificity safety. */}
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
        <ClientProjectInbox
          conversations={filtered}
          activeId={active?.id ?? ""}
          onSelect={(id) => { setActiveId(id); setMobilePane("thread"); markConvSeen(id); }}
          search={search} onSearchChange={setSearch}
          filter={filter} onFilterChange={setFilter}
        />
        <div data-tulala-thread-pane style={{ display: "flex", flexDirection: "column", minHeight: 0, background: COLORS.surfaceAlt, overflow: "hidden" }}>
          {active ? <ClientProjectDetail conv={active} onBack={() => setMobilePane("list")} /> : <EmptyDetail label="No project selected" />}
        </div>
      </div>
      {/* Mobile-only: thin tab on left edge to reopen the inbox while
          a thread is open. Same handle pattern as the talent shell. */}
      {mobilePane === "thread" && (
        <MobileInboxTab
          unreadCount={conversations.reduce((s, c) => s + c.unreadCount, 0)}
          onOpen={() => setMobilePane("list")}
        />
      )}
    </>
  );
}

// ── Client: project-flavored row ──
// Mirrors the TalentJobRow pattern (avatar + name + brief + funnel)
// but client-shaped: instead of "your take-home", the right-side
// signal is the next-action chip (Approve / Sign / Pay), and the
// preview line is plain-language project status. Stage-tinted
// background + NEW pill for unseen rows match the talent inbox so
// the eye reads both surfaces the same way.
export function ClientProjectRow({
  conv, active, onClick,
}: { conv: Conversation; active: boolean; onClick: () => void }) {
  const sc = stageStyle(conv.stage);
  const next = CLIENT_NEXT_ACTION_FOR_CONV[conv.id];
  const dateLabel = conv.date;
  const cityLabel = conv.location ? conv.location.split(" · ")[0] : null;
  const briefMentionsCity = cityLabel && conv.brief.toLowerCase().includes(cityLabel.toLowerCase());
  const subtitleParts = [
    conv.brief,
    dateLabel ? withWeekday(dateLabel) : null,
    !briefMentionsCity ? cityLabel : null,
  ].filter(Boolean);

  // Plain-language status — what's happening on the project today.
  // Action items come from CLIENT_NEXT_ACTION_FOR_CONV; otherwise
  // the message uses the stage-shape phrasing the client expects.
  const statusLine = (() => {
    if (next?.primary) return next.label;
    if (conv.stage === "inquiry") return "Coordinator preparing your shortlist";
    if (conv.stage === "hold") return "Hold confirmed · finalising offer";
    if (conv.stage === "booked") return "Booked · schedule confirmed";
    if (conv.stage === "past") return "Wrapped · invoice closed";
    if (conv.stage === "cancelled") return conv.outcome === "client_cancelled" ? "Cancelled by you" : "Cancelled";
    return conv.lastMessage.preview;
  })();

  const stageWord = conv.stage === "past" ? "Wrapped"
    : conv.stage === "hold" ? "Hold"
    : conv.stage === "cancelled" && conv.outcome === "client_cancelled" ? "Cancelled by you"
    : conv.stage === "cancelled" && conv.outcome === "client_rejected" ? "Offer rejected"
    : conv.stage === "cancelled" && conv.outcome === "client_no_response" ? "Expired · no reply"
    : conv.stage === "cancelled" ? "Cancelled"
    : conv.stage.charAt(0).toUpperCase() + conv.stage.slice(1);

  // Same seen + tint logic as the talent inbox so the row pattern
  // reads identically across roles.
  // Manual-unread overrides the locally-seen state — see AdminInquiryRow.
  const isUnseen = isManualUnread(conv.id) || (conv.seen === false && !isLocallySeen(conv.id));
  const isActionNeeded = !!next?.primary;
  const stageBg: string =
    active ? "rgba(11,11,13,0.045)"
    : isUnseen ? "rgba(176,48,58,0.05)"
    : isActionNeeded ? "rgba(176,48,58,0.04)"
    : conv.stage === "booked" ? "rgba(46,125,91,0.045)"
    : "transparent";

  const rowRef = useScrollIntoViewWhenActive(active);

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
        // Longhand keeps React from warning when borderLeft flips
        // between active / unseen / action-needed / default.
        borderTop: "none", borderRight: "none",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        cursor: "pointer", textAlign: "left", fontFamily: FONTS.body,
        position: "relative",
      }}
    >
      <InboxRowHoverActions rowId={conv.id} label={conv.brief} />
      {/* Project avatar — initial of the project / brand they're
          commissioning. Colored by hash so each project is visually
          distinct. */}
      <span style={{ flexShrink: 0, marginTop: 2 }}>
        <Avatar
          initials={initialsOf(conv.brief.split(" ").slice(0, 2).join(" "))}
          hashSeed={conv.brief + conv.client}
          tone="auto"
          size={36}
        />
      </span>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        {/* Row 1 — project name (brief) + NEW pill + age */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <span
            title={conv.brief}
            style={{
              fontSize: 14, fontWeight: 700, color: COLORS.ink,
              flex: 1, minWidth: 0,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              lineHeight: 1.25, letterSpacing: -0.1,
            }}
          >
            {conv.brief}
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
          <span style={{ flexShrink: 0, fontSize: 10.5, color: COLORS.inkMuted, fontVariantNumeric: "tabular-nums" }}>
            {ageLabel(conv.lastMessage.ageHrs)}
          </span>
        </div>

        {/* Row 2 — agency / coordinator + city + date + source chip.
            Source chip surfaces whether the inquiry routed through
            Tulala Hub, IG DM, agency referral, etc. — same triage
            signal the talent gets in their inbox. */}
        {subtitleParts.length > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 11.5, color: COLORS.inkMuted, lineHeight: 1.4,
            minWidth: 0,
          }}>
            <span style={{
              minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap", flex: 1,
            }}>
              via {conv.agency}
              {subtitleParts.length > 1 && " · "}
              {subtitleParts.slice(1).join(" · ")}
            </span>
            {(() => {
              const sm = conv.source ? sourceChipMeta(conv.source) : null;
              if (!sm) return null;
              return (
                <span title={sm.tooltip} style={{
                  flexShrink: 0,
                  display: "inline-flex", alignItems: "center", gap: 3,
                  padding: "1px 6px", borderRadius: 999,
                  background: sm.bg, color: sm.fg,
                  fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3,
                  textTransform: "uppercase",
                }}>
                  <span aria-hidden style={{ display: "inline-flex" }}>{sm.icon}</span>
                  {sm.label}
                </span>
              );
            })()}
          </div>
        )}

        {/* Row 3 — status line · unread badge. When action is needed
            the line gets a coral tint + bullet so the eye flags it. */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6, marginTop: 2,
        }}>
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
            color: isActionNeeded ? COLORS.coralDeep : conv.unreadCount > 0 ? COLORS.ink : COLORS.inkMuted,
            fontWeight: isActionNeeded ? 600 : conv.unreadCount > 0 ? 500 : 400,
            lineHeight: 1.4,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {statusLine}
          </span>
          {conv.unreadCount > 0 && (
            <span style={{
              flexShrink: 0,
              minWidth: 16, height: 16, padding: "0 5px", borderRadius: 999, boxSizing: "border-box",
              background: COLORS.accent, color: "#fff",
              fontSize: 9.5, fontWeight: 700,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}>{conv.unreadCount}</span>
          )}
        </div>

        {/* Row 4 — funnel dots + stage word + coordinator chip */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
          <span style={{ flex: "0 0 auto", maxWidth: 130 }}>
            <JobStageFunnel currentStage={conv.stage} compact={true} />
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: sc.fg, letterSpacing: 0.3, textTransform: "uppercase",
            flexShrink: 0,
          }}>
            {stageWord}
          </span>
          <span style={{ flex: 1 }} />
          {/* Coordinator owner — small avatar so the client knows
              who's handling their project at a glance. */}
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            flexShrink: 0,
            fontSize: 10.5, color: COLORS.inkMuted,
          }} title={`${conv.leader.name} · ${conv.agency}`}>
            <Avatar size={14} tone="ink" hashSeed={conv.leader.name} initials={conv.leader.initials} />
            {conv.leader.name.split(" ")[0]}
          </span>
        </div>
      </div>
    </button>
  );
}

export function ClientProjectInbox({
  conversations, activeId, onSelect, search, onSearchChange, filter, onFilterChange,
}: {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  search: string; onSearchChange: (s: string) => void;
  filter: ClientFilter; onFilterChange: (f: ClientFilter) => void;
}) {
  // Subscribe to pin/manual-unread flags so the inbox re-orders +
  // re-tints when those toggle from a row's hover actions.
  useFlagsSubscription();
  const chips: { id: ClientFilter; label: string; count?: number }[] = [
    { id: "all", label: "All projects" },
    { id: "action-needed", label: "Needs you", count: conversations.filter(c => CLIENT_NEXT_ACTION_FOR_CONV[c.id]?.primary).length },
    { id: "waiting-agency", label: "In flight" },
    { id: "booked", label: "Booked" },
    { id: "past", label: "Past" },
  ];
  return (
    <aside data-tulala-list-pane style={{
      display: "flex", flexDirection: "column",
      borderRight: `1px solid ${COLORS.borderSoft}`, background: "#fff",
      minHeight: 0, minWidth: 0, maxWidth: "100%",
    }}>
      <HoverActionsCss />
      <div data-tulala-inbox-header style={{
        padding: "14px 14px 8px",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        minWidth: 0, maxWidth: "100%",
      }}>
        <div data-tulala-list-header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
          <h3 style={{ fontFamily: FONTS.display, fontSize: 17, fontWeight: 700, color: COLORS.ink, margin: 0 }}>Projects</h3>
          <span style={{ fontSize: 11, color: COLORS.inkMuted }}>{conversations.length}</span>
        </div>
        <style>{`
          @media (max-width: 720px) {
            [data-tulala-list-header] { display: none !important; }
            [data-tulala-inbox-header],
            [data-tulala-inbox-search],
            [data-tulala-inbox-chips],
            [data-tulala-inbox-scroll] {
              min-width: 0 !important;
              max-width: 100% !important;
              box-sizing: border-box !important;
            }
            [data-tulala-inbox-chips] {
              overflow-x: auto !important;
              scrollbar-width: none !important;
            }
            [data-tulala-inbox-chips]::-webkit-scrollbar { display: none !important; }
          }
        `}</style>
        <div data-tulala-inbox-search style={{ marginBottom: 10 }}>
          <SearchPill value={search} onChange={onSearchChange} placeholder="Search projects…" />
        </div>
        <div data-tulala-inbox-chips style={{ display: "flex", gap: 5, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 2 }}>
          {chips.map(c => (
            <FilterChip
              key={c.id} id={c.id} label={c.label}
              active={filter === c.id}
              count={c.count}
              onClick={() => onFilterChange(c.id)}
            />
          ))}
        </div>
      </div>
      <div data-tulala-inbox-scroll style={{
        flex: 1, overflowY: "auto", minHeight: 0,
        minWidth: 0, maxWidth: "100%",
      }}>
        {conversations.length === 0 ? (
          <div style={{
            padding: "32px 18px", textAlign: "center",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          }}>
            <div aria-hidden style={{
              width: 36, height: 36, borderRadius: 10,
              background: COLORS.surfaceAlt, color: COLORS.inkMuted,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              marginBottom: 4,
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink }}>
              {search.trim() ? <>No matches for &ldquo;{search}&rdquo;</> : "Nothing in this view"}
            </div>
            <div style={{ fontSize: 11.5, color: COLORS.inkMuted, lineHeight: 1.4, maxWidth: 240 }}>
              {search.trim() ? "Try a different keyword, or clear the search." : <>Try the <strong>All projects</strong> filter or clear your search.</>}
            </div>
            {search.trim() && (
              <button type="button" onClick={() => onSearchChange("")} style={{
                marginTop: 6, padding: "5px 12px", borderRadius: 999,
                border: `1px solid ${COLORS.border}`, background: "transparent",
                color: COLORS.ink, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                fontFamily: FONTS.body,
              }}>Clear search</button>
            )}
          </div>
        ) : renderWithDateGroups(
            sortPinnedFirst(conversations),
            c => c.lastMessage.ageHrs,
            c => (
              <ClientProjectRow key={c.id} conv={c} active={c.id === activeId} onClick={() => onSelect(c.id)} />
            ),
          )}
      </div>
    </aside>
  );
}

// ── Client PROJECT DETAIL — calm, status-focused ──
export function ClientProjectDetail({ conv, onBack }: { conv: Conversation; onBack: () => void }) {
  const { toast } = useAdminShell();
  const router = useRouter();
  const [, startTransition] = useTransition();

  // G-pass — when conv.id is a real inquiry UUID, the client-side header
  // CTA routes through clientApproveCurrentOffer / clientRejectCurrentOffer
  // depending on which action the inquiry calls for. Synthetic mock conv
  // ids and unsupported actions stay disabled instead of pretending to run.
  const isRealInquiry = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conv.id);
  const handleClientCtaClick = (label: string) => {
    if (!isRealInquiry) return;
    if (/approve/i.test(label)) {
      startTransition(async () => {
        const r = await clientApproveCurrentOffer(conv.id);
        if (!r.ok) toast(`Approve failed: ${r.error}`);
        else { toast("Offer approved"); router.refresh(); }
      });
      return;
    }
    if (/reject|decline|pass/i.test(label)) {
      startTransition(async () => {
        const r = await clientRejectCurrentOffer(conv.id);
        if (!r.ok) toast(`Reject failed: ${r.error}`);
        else { toast("Offer rejected"); router.refresh(); }
      });
      return;
    }
    if (/pay|invoice|verify card/i.test(label)) {
      startTransition(async () => {
        const r = await startInquiryCheckout(conv.id);
        if (!r.ok) { toast(`Checkout failed: ${r.error}`); return; }
        if (r.url) {
          if (r.mock) toast("Stripe not configured — opening mock success page");
          window.location.href = r.url;
        }
      });
      return;
    }
  };

  // Mock talent lineup for client view (would come from inquiry record)
  const lineup = (conv.participants ?? []).filter(p => p.isTalent).slice(0, 4);

  // Mock timeline of milestones (events the client cares about)
  const timeline: { ts: string; label: string }[] = [
    { ts: "Apr 22", label: "Inquiry sent" },
    { ts: "Apr 22", label: `${conv.leader.name} assigned as your coordinator` },
    ...(conv.stage !== "inquiry" ? [{ ts: "Apr 23", label: "Offer sent · €8,000" }] : []),
    ...(conv.stage === "booked" || conv.stage === "past" ? [{ ts: "Apr 23", label: "You approved offer" }] : []),
    ...(conv.stage === "booked" || conv.stage === "past" ? [{ ts: "Apr 24", label: "Call sheet published" }] : []),
    ...(conv.stage === "past" ? [{ ts: "May 6",  label: "Shoot wrapped" }] : []),
    ...(conv.stage === "past" ? [{ ts: "May 13", label: "Selects shared" }] : []),
  ];

  return (
    <div style={{
      padding: 16, fontFamily: FONTS.body,
      display: "flex", flexDirection: "column", gap: 10,
      height: "100%", minHeight: 0,
    }}>
      {/* Unified shell header — same compact band as the talent shell.
          Trust badges, source channel, status pill, and slim funnel
          all consolidated. Client view: take-home is replaced by the
          "next action" CTA, since clients care about what they owe
          (decision, signature, payment) more than fee breakdowns. */}
      <ShellHeader
        conv={conv}
        onBack={onBack}
        backLabel="Projects"
        primaryChip={null}
        showCoordPill={false}
        rightSlot={(() => {
          const action = CLIENT_NEXT_ACTION_FOR_CONV[conv.id];
          if (!action) return null;
          const canRunAction = isRealInquiry && /approve|reject|decline|pass|pay|invoice|verify card/i.test(action.label);
          return (
            <button
              type="button"
              disabled={!canRunAction}
              title={canRunAction ? undefined : "This client action needs a live workflow before it can run here."}
              onClick={canRunAction ? () => handleClientCtaClick(action.label) : undefined}
              style={canRunAction ? {
              padding: "5px 11px", borderRadius: 999,
              border: action.primary ? "none" : `1px solid ${COLORS.border}`,
              background: action.primary ? COLORS.success : "transparent",
              color: action.primary ? "#fff" : COLORS.ink,
              fontSize: 11.5, fontWeight: 700, cursor: "pointer",
              fontFamily: FONTS.body,
            } : disabledBtn({
              padding: "5px 11px", borderRadius: 999,
              border: action.primary ? "none" : `1px solid ${COLORS.border}`,
              background: action.primary ? COLORS.success : "transparent",
              color: action.primary ? "#fff" : COLORS.ink,
              fontSize: 11.5, fontWeight: 700, cursor: "pointer",
              fontFamily: FONTS.body,
            })}
            >
              {action.label}
            </button>
          );
        })()}
      />
      {/* TAB BAR — Client thread (native) | Talent group (locked) | Files | Details */}
      <ClientTabsBlock conv={conv} lineup={lineup} timeline={timeline} />
    </div>
  );
}
