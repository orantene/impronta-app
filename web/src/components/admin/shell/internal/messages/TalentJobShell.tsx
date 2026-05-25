"use client";

import React, { useState, useEffect } from "react";
import { COLORS, FONTS } from "../state";
import { Avatar } from "../primitives";
import { useTalentConversations, type Conversation } from "../talent";
import { TalentAgencyFilterChips } from "../talent/shared/TalentAgencyFilterChips";
import { AdminInquiryRow } from "./AdminOperationsShell";
import { EmptyDetail } from "./client-1";
import { consumePendingConversation, isLocallySeen, isManualUnread, markConvSeen, sortPinnedFirst, useFlagsSubscription, useSeenSubscription } from "./conversation-stash";
import { ageLabel, renderWithDateGroups, stageStyle, useScrollIntoViewWhenActive } from "./messages-shared";
import { HoverActionsCss, InboxRowHoverActions, SearchPill, freshnessTone, initialsOf } from "./shared/inbox-identity-1";
import { FilterChip } from "./shared/inbox-identity-2";
import { CollapsedInboxRail, ColumnDivider, MobileInboxTab, TALENT_RATE_FOR_CONV, useResizableInboxLayout } from "./shared/inbox-layout-1";
import type { TalentFilter } from "./shared/inbox-layout-1";
import type { Offer } from "./shared/machinery-9";
import { JobStageFunnel, sourceChipMeta } from "./talent-1";
import { TalentJobDetail } from "./talent-2";


export function TalentJobShell() {
  const conversations = useTalentConversations();
  // Subscribe to seen-state changes so the inbox re-sorts the moment
  // a row gets clicked (the NEW pill drops, the unseen sort tier loses
  // that conv, and it falls back to its recency rank).
  useSeenSubscription();
  // Pin-aware initial state — when a caller (talent Today row, booking
  // row, etc.) pinned a conversation, land in the thread pane directly.
  const { initialId, fromPin } = (() => {
    const pending = consumePendingConversation();
    if (pending && conversations.some(c => c.id === pending)) {
      return { initialId: pending, fromPin: true };
    }
    return { initialId: conversations[0]?.id ?? "", fromPin: false };
  })();
  const [activeId, setActiveId] = useState<string>(initialId);
  // Mark whatever conv we land on as seen — covers both pin-driven
  // entries and the default first-conv selection so the user never
  // sees a stale NEW pill on the conv they're currently viewing.
  useEffect(() => {
    if (initialId) markConvSeen(initialId);
    // run once on mount with the initial id
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: initialId is stable for the life of this shell; markConvSeen is a stable external fn
  }, []);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<TalentFilter>("all");
  const [mobilePane, setMobilePane] = useState<"list" | "thread">(fromPin ? "thread" : "list");
  const layout = useResizableInboxLayout("talent");

  const filtered = conversations.filter(c => {
    // "coordinating" filter — jobs where Marta runs her own workspace
    // (talent_coord pov). Distinct from stage filters because it
    // crosses stages: an inquiry she's coord'ing AND a booked one
    // both qualify.
    if (filter === "coordinating") {
      if (!c.iAmCoordinator) return false;
    } else if (filter !== "all" && c.stage !== filter) {
      return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      // Wider haystack than just client+brief so "Sara", "Madrid",
      // "Hub", or an agency name actually finds the right job.
      const haystack = [
        c.client, c.brief, c.agency,
        c.leader?.name, c.location, c.date,
        c.source?.kind === "tulala-hub" ? c.source.label : "",
        c.source?.kind === "direct" ? c.source.label : "",
        c.lastMessage.preview,
      ].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    // Two-tier chronological sort so the inbox reads top-down as
    // "what's brand-new, then what's most recent, then what's older."
    //   Tier 1: unseen (never opened) inquiries — most urgent attention
    //   Tier 2: everything else — sorted by recency (freshest first)
    // Within each tier, lower ageHrs = more recent → top. Locally-seen
    // convs lose their tier-1 status (after the user opens them) so
    // they re-rank into the recency sort like any other row.
    const aNew = (a.seen === false && !isLocallySeen(a.id)) ? 1 : 0;
    const bNew = (b.seen === false && !isLocallySeen(b.id)) ? 1 : 0;
    if (aNew !== bNew) return bNew - aNew;
    return a.lastMessage.ageHrs - b.lastMessage.ageHrs;
  });

  const active = conversations.find(c => c.id === activeId) ?? filtered[0] ?? conversations[0];

  return (
    <>
      <TalentAgencyFilterChips />
      {/* Page header removed — inbox header inside the shell already
          says "My jobs · count", so this row was a duplicate. */}
      <div
        data-tulala-messages-shell
        data-mobile-pane={mobilePane}
        style={{
          display: "grid",
          // CRITICAL: grid-template-columns is driven from a CSS
          // variable rather than inline directly. The mobile @media
          // override needs unambiguous precedence over the desktop
          // 3-track layout — putting `--tulala-shell-cols` on the
          // inline style and resolving via the stylesheet means the
          // mobile rule (`grid-template-columns: 1fr !important`)
          // wins cleanly with no inline-vs-stylesheet ambiguity.
          ["--tulala-shell-cols" as never]: `${layout.collapsed ? 32 : layout.leftWidth}px 6px 1fr`,
          gridTemplateColumns: "var(--tulala-shell-cols)",
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 14,
          overflow: "hidden",
          height: "min(calc(100vh - var(--proto-cbar, 50px) - 56px - 200px), 820px)",
          minHeight: 560,
          // Hard floor so a long unbreakable child can't push the
          // shell wider than its assigned grid track. Was the root
          // cause of the right-side bleed: a chip strip's min-content
          // expanded the shell's intrinsic width.
          minWidth: 0,
          maxWidth: "100%",
          fontFamily: FONTS.body,
        }}
      >
        {/* Mobile: pin the shell to fill the viewport area between
            the top chrome (cbar + identity bar + page header ≈ 156px)
            and the bottom nav (~80px). Position:fixed bypasses the
            inline height calc that was leaving the composer below the
            bottom nav. Uses dynamic viewport units so iOS Safari URL
            bar collapse doesn't break the layout. The grid template
            also forces 1fr (single column) here for redundant safety
            in case the page-wide rule misses. */}
        <style dangerouslySetInnerHTML={{ __html:
          "@media (max-width: 720px){"
          + "[data-tulala-messages-shell]{"
          + "position:fixed!important;"
          + "left:0!important;right:0!important;"
          + "width:100vw!important;max-width:100vw!important;"
          + "grid-template-columns:1fr!important;"
          // Page header was removed entirely, so the shell only needs
          // to clear the cbar + identity bar (50 + 56 = 106px) at the
          // top, and the bottom nav (80px) at the bottom.
          + "top:calc(var(--proto-cbar, 50px) + 56px)!important;"
          + "bottom:80px!important;"
          + "height:calc(100dvh - var(--proto-cbar, 50px) - 56px - 80px)!important;"
          + "min-height:0!important;max-height:none!important;"
          + "border-radius:0!important;border-left:0!important;border-right:0!important;"
          + "z-index:10!important;"
          + "}"
          // Children of the shell — list/thread panes — must be able
          // to shrink to 0. Without min-width:0 their min-content
          // width pushes the shell beyond viewport.
          + "[data-tulala-messages-shell] > *{min-width:0!important;max-width:100%!important}"
          + "}"
        }} />
        {layout.collapsed ? (
          <CollapsedInboxRail
            count={conversations.length}
            unreadCount={conversations.reduce((s, c) => s + c.unreadCount, 0)}
            onExpand={() => layout.setCollapsed(false)}
          />
        ) : (
          <TalentJobInbox
            conversations={filtered}
            activeId={active?.id ?? ""}
            onSelect={(id) => { setActiveId(id); setMobilePane("thread"); markConvSeen(id); }}
            search={search} onSearchChange={setSearch}
            filter={filter} onFilterChange={setFilter}
            onCollapse={() => layout.setCollapsed(true)}
          />
        )}
        <ColumnDivider onResize={layout.setLeftWidth} disabled={layout.collapsed} />
        <div data-tulala-thread-pane style={{ display: "flex", flexDirection: "column", minHeight: 0, background: COLORS.surfaceAlt, overflow: "hidden" }}>
          {active ? <TalentJobDetail conv={active} onBack={() => setMobilePane("list")} /> : <EmptyDetail label="No job selected" />}
        </div>
      </div>
      {/* Mobile-only: thin tab on left edge that pops open the inbox
          while a thread is open. Hidden on desktop via CSS. */}
      {mobilePane === "thread" && (
        <MobileInboxTab
          unreadCount={conversations.reduce((s, c) => s + c.unreadCount, 0)}
          onOpen={() => setMobilePane("list")}
        />
      )}
    </>
  );
}

// ── Talent: job-flavored row ──
// Shows: client + status + dates/location + your-take-home line + your status
export function TalentJobRow({
  conv, active, onClick,
}: { conv: Conversation; active: boolean; onClick: () => void }) {
  const sc = stageStyle(conv.stage);
  const yourRate = TALENT_RATE_FOR_CONV[conv.id] ?? "—";
  const myStatus: "accepted" | "pending" | "—" =
    conv.stage === "booked" ? "accepted"
    : conv.stage === "inquiry" || conv.stage === "hold" ? "pending"
    : "—";

  // Compose the last-message preview. Sender prefix gives instant
  // context ("Sara: ..." vs "You: ..." vs system-only).
  const senderPrefix = (() => {
    switch (conv.lastMessage.sender) {
      case "you": return "You: ";
      case "coordinator": return `${conv.leader?.name?.split(" ")[0] ?? "Coordinator"}: `;
      case "client": return `${conv.client.split(" ")[0]}: `;
      case "agency": return `${conv.agency?.split(" ")[0] ?? "Agency"}: `;
      case "system": return "";
      default: return "";
    }
  })();

  // Pull the human-readable date label. "Sat, May 17" reads better than
  // a raw "May 17" — but we leave the conv.date string alone (single
  // source). When data ships with a weekday it'll just render through.
  const dateLabel = conv.date;

  // Parse the location into city. We drop the venue from the row — it
  // belongs in the Details rail. City + date is enough to scan by.
  const cityLabel = conv.location ? conv.location.split(" · ")[0] : null;

  // Build a single subtitle: "Brief · Sat, May 14 · Madrid" — but only
  // include city if the brief doesn't already mention it. De-dupes the
  // common mock pattern "Spring lookbook · Madrid" + "📍 Madrid".
  const briefMentionsCity = cityLabel && conv.brief.toLowerCase().includes(cityLabel.toLowerCase());
  const subtitleParts = [
    conv.brief,
    dateLabel ? withWeekday(dateLabel) : null,
    !briefMentionsCity ? cityLabel : null,
  ].filter(Boolean);

  // Active-stage word — appears inline next to funnel dots. Drops the
  // separate uppercase stage label that was duplicating it on row 4.
  // Cancelled rows surface the outcome reason in place of the generic
  // "Cancelled" — talent reads "Client cancelled" / "Rejected" /
  // "Expired" inline without opening the conv to find out why.
  const stageWord = conv.stage === "past" ? "Wrapped"
    : conv.stage === "hold" ? "Offer"
    : conv.stage === "cancelled" && conv.outcome === "client_cancelled" ? "Client cancelled"
    : conv.stage === "cancelled" && conv.outcome === "client_rejected" ? "Rejected"
    : conv.stage === "cancelled" && conv.outcome === "client_no_response" ? "Expired"
    : conv.stage === "cancelled" && conv.outcome === "talent_declined" ? "You declined"
    : conv.stage.charAt(0).toUpperCase() + conv.stage.slice(1);
  const ageLbl = ageLabel(conv.lastMessage.ageHrs);
  const slaTone = freshnessTone(conv.lastMessage.ageHrs, myStatus === "pending");
  // "Awaiting you" only when the talent actually owes a response. The
  // "✓ confirmed" pill on booked rows was duplicate signal — the funnel
  // step already says Booked and the take-home rate already says Paid /
  // confirmed. Drop it.
  const showAwaiting = myStatus === "pending";

  // Stage-tinted row backgrounds — subtle wash that helps the eye sort
  // the inbox at a glance. Brand-new (unseen) inquiries get a coral
  // tint to read as "needs attention now"; booked rows get a soft
  // green to read as "locked in"; everything else stays transparent.
  // The active row (currently selected) wins over the stage tint with
  // a darker neutral wash + accent border-left.
  // `seen: false` flips to true once the user opens the conv in this
  // session (markConvSeen). Module-level seen-set means the NEW pill
  // disappears the moment they click in.
  // Manual-unread overrides the locally-seen state — see AdminInquiryRow.
  const isUnseen = isManualUnread(conv.id) || (conv.seen === false && !isLocallySeen(conv.id));
  const stageBg: string =
    active ? "rgba(11,11,13,0.045)"
    : isUnseen ? "rgba(176,48,58,0.05)"     // coral-soft = brand-new inquiry
    : conv.stage === "booked" ? "rgba(46,125,91,0.045)" // success-soft = locked
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
          : "3px solid transparent",
        // Longhand to silence React's shorthand-vs-longhand warning
        // when borderLeft flips between active / unseen / default.
        borderTop: "none", borderRight: "none",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        cursor: "pointer", textAlign: "left", fontFamily: FONTS.body,
        // Slight emphasis when unseen — bumps weight to the row level,
        // not just text — so the eye registers "new" before reading.
        position: "relative",
      }}
    >
      <InboxRowHoverActions rowId={conv.id} label={conv.client} />
      {/* Client avatar — initial in deterministic auto-tint per client
          name. Most clients are brands (Mango, Bvlgari, Vogue), so
          a colored initial reads cleaner than a generic logo would.
          marginTop:2 baselines the avatar with the first text row. */}
      <span style={{ flexShrink: 0, marginTop: 2 }}>
        <Avatar
          initials={initialsOf(conv.client)}
          hashSeed={conv.client}
          tone="auto"
          size={36}
        />
      </span>

      {/* Right column — three rows of text + a slim funnel strip. */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        {/* Row 1 — client name (single line, truncated) + NEW pill (when
            never opened) + take-home rate (when set). */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <span
            title={conv.client}
            style={{
              fontSize: 14, fontWeight: 700, color: COLORS.ink,
              flex: 1, minWidth: 0,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              lineHeight: 1.25, letterSpacing: -0.1,
            }}
          >
            {conv.client}
          </span>
          {/* NEW pill — only on brand-new (unseen) inquiries. Pulls
              the eye before the stage funnel + status pill in row 4
              so the talent can spot fresh work even before reading. */}
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
          {yourRate && yourRate !== "—" && (
            <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: -0.1 }} className="text-admin-ink">{yourRate}</span>
          )}
        </div>

        {/* Row 2 — brief · date · city · source. Single ellipsized line.
            Source chip appears inline (small dot + label) so the
            talent reads where the inquiry came from without opening
            the conv. */}
        {subtitleParts.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, lineHeight: 1.4, minWidth: 0 }} className="text-admin-ink-muted">
            <span style={{
              minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap", flex: 1,
            }}>
              {subtitleParts.join(" · ")}
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

        {/* Row 3 — last-message preview · age (right) · unread badge. */}
        {conv.lastMessage.preview && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6, marginTop: 1,
          }}>
            <span style={{
              flex: 1, minWidth: 0,
              fontSize: 11.5, color: conv.unreadCount > 0 ? COLORS.ink : COLORS.inkMuted,
              fontWeight: conv.unreadCount > 0 ? 500 : 400,
              lineHeight: 1.4,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {senderPrefix && (
                <span style={{ fontWeight: 600 }} className="text-admin-ink-muted">{senderPrefix}</span>
              )}
              {conv.lastMessage.preview}
            </span>
            <span style={{ flexShrink: 0, fontSize: 10.5, fontVariantNumeric: "tabular-nums" }} className="text-admin-ink-muted">
              {ageLbl}
            </span>
            {conv.unreadCount > 0 && (
              <span style={{ flexShrink: 0, minWidth: 16, height: 16, padding: "0 5px", borderRadius: 999, boxSizing: "border-box", color: "#fff", fontSize: 9.5, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }} className="bg-admin-accent">{conv.unreadCount}</span>
            )}
          </div>
        )}

        {/* Row 4 — funnel dots + active-stage word + (optional) "awaiting
            you" badge. Dropped the duplicate uppercase stage label and
            the "✓ confirmed" success pill — both said the same thing
            the funnel step already says. */}
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
          {slaTone && (
            <span aria-label={`SLA: ${slaTone.label}`} style={{
              width: 6, height: 6, borderRadius: "50%",
              background: slaTone.color, flexShrink: 0,
            }} />
          )}
          {showAwaiting && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999,
              background: `${COLORS.amber}18`,
              color: COLORS.amber,
              flexShrink: 0,
            }}>
              awaiting you
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// Add a weekday prefix to a date label when missing. "May 14" →
// "Sat, May 14". Best-effort — falls through if we can't parse.
export function withWeekday(label: string): string {
  // Already has weekday like "Sat, May 14" or "Sun, Jun 8" — leave it.
  if (/^[A-Z][a-z]{2,5}, /.test(label)) return label;
  // Range like "May 14–15" — leave it; weekday for first day adds
  // ambiguity for multi-day shoots.
  if (/[–-]/.test(label)) return label;
  const parsed = Date.parse(`${label} ${new Date().getFullYear()}`);
  if (isNaN(parsed)) return label;
  const day = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(parsed).getDay()];
  return `${day}, ${label}`;
}

export function TalentJobInbox({
  conversations, activeId, onSelect, search, onSearchChange, filter, onFilterChange, onCollapse,
}: {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  search: string; onSearchChange: (s: string) => void;
  filter: TalentFilter; onFilterChange: (f: TalentFilter) => void;
  /** Optional handler — when present, renders a small collapse-to-rail
   *  button in the inbox header. Hosting shell controls the width. */
  onCollapse?: () => void;
}) {
  // Subscribe to pin/manual-unread flags so the inbox re-orders +
  // re-tints when those toggle from a row's hover actions.
  useFlagsSubscription();
  // "Coordinating" only appears in the strip when there's at least one
  // job where Marta runs her own workspace. Hides for talents with no
  // coord work — keeps the strip lean for the common case.
  const coordCount = conversations.filter(c => c.iAmCoordinator).length;
  const chips: { id: TalentFilter; label: string; count?: number; pin?: boolean }[] = [
    { id: "all", label: "All jobs" },
    { id: "inquiry", label: "Inquiry" },
    { id: "hold", label: "Hold" },
    { id: "booked", label: "Booked" },
    { id: "past", label: "Past" },
    ...(coordCount > 0 ? [{ id: "coordinating" as const, label: "Coordinating", count: coordCount, pin: true }] : []),
  ];
  return (
    <aside data-tulala-list-pane style={{
      display: "flex", flexDirection: "column",
      borderRight: `1px solid ${COLORS.borderSoft}`, background: "#fff",
      minHeight: 0,
      // Hard responsive floor for the list pane — without min-width:0
      // a long unbreakable child (filter chip label, message preview)
      // pushes the pane wider than its grid track. max-width:100% keeps
      // it inside the shell at every viewport.
      minWidth: 0, maxWidth: "100%",
    }}>
      <HoverActionsCss />
      <div data-tulala-inbox-header style={{
        padding: "14px 14px 8px",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        minWidth: 0, maxWidth: "100%",
      }}>
        <div data-tulala-list-header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <h3 style={{ fontFamily: FONTS.display, fontSize: 17, fontWeight: 700, margin: 0 }} className="text-admin-ink">My jobs</h3>
          <div className="inline-flex items-center gap-1.5">
            <span className="text-admin-ink-muted text-admin-11">{conversations.length}</span>
            {onCollapse && (
              <button
                type="button"
                onClick={onCollapse}
                aria-label="Collapse jobs list"
                title="Collapse to rail"
                style={{
                  width: 22, height: 22, borderRadius: 6,
                  border: `1px solid ${COLORS.borderSoft}`, background: "#fff",
                  color: COLORS.inkMuted, cursor: "pointer",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M8 2l-4 4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
          </div>
        </div>
        <style>{`
          @media (max-width: 720px) {
            [data-tulala-list-header] { display: none !important; }
            /* Inbox subgroups — every nested wrapper gets min-width:0
               + max-width:100% so the chip strip + search + row list
               can never push their parent beyond viewport. The chip
               strip stays scrollable horizontally inside its own box. */
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
          <SearchPill value={search} onChange={onSearchChange} placeholder="Search jobs…" />
        </div>
        <div data-tulala-inbox-chips style={{ display: "flex", gap: 5, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 2 }}>
          {chips.map(c => <FilterChip
            key={c.id}
            id={c.id}
            label={c.label}
            active={filter === c.id}
            count={c.count}
            icon={c.pin ? (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M6 1l1.5 3.2L11 5l-2.5 2.4.6 3.4L6 9l-3.1 1.8.6-3.4L1 5l3.5-.8L6 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              </svg>
            ) : undefined}
            onClick={() => onFilterChange(c.id)}
          />)}
        </div>
      </div>
      <div data-tulala-inbox-scroll style={{
        flex: 1, overflowY: "auto", minHeight: 0,
        // min-width:0 so the row buttons (which use flex with truncating
        // text) actually shrink to their parent — without it the rows'
        // text-overflow:ellipsis never kicks in on the message preview
        // and they push the inbox wider than viewport.
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
            <div className="text-admin-ink text-admin-13 font-semibold">
              {search.trim() ? <>No matches for &ldquo;{search}&rdquo;</> : "Nothing in this view"}
            </div>
            <div style={{ fontSize: 11.5, lineHeight: 1.4, maxWidth: 240 }} className="text-admin-ink-muted">
              {search.trim() ? "Try a different keyword, or clear the search." : <>Try the <strong>All jobs</strong> filter or clear your search to see everything.</>}
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
              <TalentJobRow key={c.id} conv={c} active={c.id === activeId} onClick={() => onSelect(c.id)} />
            ),
          )}
      </div>
    </aside>
  );
}
