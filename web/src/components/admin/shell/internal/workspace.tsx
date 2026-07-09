"use client";

/**
 * InquiryWorkspaceDrawer — the shared messaging-first inquiry surface.
 *
 * This drawer is the admin-shell reflection of the real `admin-inquiry-workspace-v3`
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

import { useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";

/** Maps scrollBehavior() to Virtuoso's "smooth"|"auto" (no "instant"). */
function vsb(): "smooth" | "auto" {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}
import { MentionTypeahead } from "./wave2";
import { sendInquiryMessageAsAdmin } from "@/lib/server-actions/admin-inquiries";
import { sendInquiryMessageAsClient } from "@/lib/server-actions/client-pipeline";
import { sendInquiryMessageAsTalent } from "@/lib/server-actions/talent-pipeline";
import {
  AGENCY_RELIABILITY,
  COLORS,
  FONTS,
  INQUIRY_STAGE_META,
  PAYOUT_RECEIVER_KIND_LABEL,
  PAYOUT_STATUS_META,
  RADIUS,
  TRANSITION,
  REQUIREMENT_ROLE_META,
  RICH_INQUIRIES,
  ROSTER_AGENCY,
  describeSource,
  getPaymentSummary,
  getRichInquiry,
  useAdminShell,
  type Offer,
  type RichInquiry,
  type ThreadMessage,
  type ThreadType,
  type WorkspacePage,
} from "./state";
import {
  ActivityFeedItem,
  Avatar,
  Bullet,
  CapsLabel,
  ClientTrustChip,
  Divider,
  EmptyState,
  Icon,
  PaymentStatusChip,
  PayoutStatusChip,
  PrimaryButton,
  SecondaryButton,
  StatDot,
  DrawerShell,
  useViewport,
  type Attachment,
} from "./primitives";

// ─── Public entry point ───────────────────────────────────────────

export type InquiryWorkspacePov = "admin" | "client" | "talent";

export function InquiryWorkspaceDrawer() {
  const { state, closeDrawer } = useAdminShell();
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
        <span className="inline-flex items-center gap-1.5">
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
//
// WS-1.A — Responsive layout matrix:
//
//  phone   (<768px)  — vertical stack: StatusStrip → thread tabs →
//                      [rail accordion] → stream → composer
//  tablet  (768-1023px) — 2-col grid: messages | 320px rail
//  desktop (1024-1279px) — same as tablet
//  wide    (≥1280px) — 3-col grid (admin): private-stream |
//                      group-stream | 260px rail
//                      (client / talent keep 2-col)

/**
 * WS-31.6 / WS-34.8 — MinorProtectionBanner
 *
 * Non-dismissible banner shown at the top of any inquiry workspace when
 * one or more talents on the inquiry are minors. Surfaces:
 *   - the talent's name + age
 *   - guardian name + consent status
 *   - working-hour window (hard cap)
 *   - max on-set hours per day
 *   - chaperone requirement
 *
 * On compact viewports we collapse to a single-line "1 minor — review
 * protections" pill that opens the MinorAccountDrawer on click. Full
 * banner shown on tablet+.
 *
 * Why non-dismissible: protections are a legal obligation. A coordinator
 * who dismisses the banner accidentally still needs to honor the rules.
 * The banner stays so they can never claim they didn't see it.
 */
function MinorProtectionBanner({ talents, compact = false }: {
  talents: typeof ROSTER_AGENCY;
  compact?: boolean;
}) {
  const { openDrawer } = useAdminShell();
  if (talents.length === 0) return null;
  const today = new Date().getFullYear();

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => openDrawer("minor-account", { talentIds: talents.map(t => t.id) })}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px",
          background: COLORS.coralSoft,
          border: `1px solid ${COLORS.coralDeep}`,
          borderRadius: 10,
          cursor: "pointer",
          fontFamily: FONTS.body,
          textAlign: "left", width: "100%",
        }}
      >
        <span aria-hidden className="text-sm">🛡️</span>
        <span className="text-admin-coral-deep text-xs font-semibold">
          {talents.length === 1 ? `${talents[0].name} is a minor` : `${talents.length} minors on this inquiry`}
        </span>
        <span style={{ flex: 1 }} />
        <span className="text-admin-coral-deep text-admin-11 font-semibold">
          Review protections →
        </span>
      </button>
    );
  }

  return (
    <div
      role="alert"
      style={{
        padding: "10px 14px",
        background: COLORS.coralSoft,
        border: `1px solid ${COLORS.coralDeep}`,
        borderRadius: 12,
        fontFamily: FONTS.body,
        flexShrink: 0,
        display: "flex", alignItems: "flex-start", gap: 12,
      }}
    >
      <span aria-hidden style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>🛡️</span>
      <div className="flex-1 min-w-0">
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4, fontSize: 12.5, fontWeight: 700 }} className="text-admin-coral-deep">
          Minor protections in effect
          <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", opacity: 0.75 }}>
            non-overridable
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 11.5 }} className="text-admin-coral-deep">
          {talents.map(t => {
            const age = t.birthYear ? today - t.birthYear : null;
            const p = t.minorProtections;
            return (
              <div key={t.id} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <strong className="font-bold">{t.name}</strong>
                {age != null && <span>· age {age}</span>}
                {p && (
                  <>
                    <span>· hours {p.workingHourStart}:00–{p.workingHourEnd}:00</span>
                    <span>· max {p.maxOnSetHoursPerDay}h/day</span>
                    {p.chaperoneRequired && <span>· chaperone required</span>}
                  </>
                )}
                {t.guardian && (
                  <span style={{ opacity: 0.85 }}>
                    · guardian: {t.guardian.name}{t.guardian.consentVerified ? " ✓" : " (consent pending)"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        onClick={() => openDrawer("minor-account", { talentIds: talents.map(t => t.id) })}
        style={{
          padding: "5px 10px",
          background: "#fff",
          color: COLORS.coralDeep,
          border: `1px solid ${COLORS.coralDeep}`,
          borderRadius: 6,
          fontSize: 11.5, fontWeight: 600,
          cursor: "pointer",
          fontFamily: FONTS.body,
          flexShrink: 0,
        }}
      >
        Manage →
      </button>
    </div>
  );
}

export function WorkspaceBody({ inquiry, pov }: { inquiry: RichInquiry; pov: InquiryWorkspacePov }) {
  const viewport = useViewport();
  const isPhone  = viewport === "phone";
  // WS-1.A wide layout — admins on ≥1280px get dual-pane (private + group
  // side-by-side, no tab-switching). Client/talent POVs only see one
  // thread anyway, so they keep the 2-col layout regardless of width.
  const isWide = viewport === "wide";
  const showDualPane = isWide && pov === "admin";

  // WS-31.6 — minor-protection detection. Cross-reference talent names
  // on this inquiry with the agency roster; surface a sticky banner if
  // any are flagged as minors. Banner is non-dismissible by design —
  // protection rules are a coordinator obligation, not a UI annoyance.
  const minorsOnInquiry = useMemo(() => {
    const names = new Set(
      inquiry.requirementGroups.flatMap(g => g.talents.map(t => t.name))
    );
    return ROSTER_AGENCY.filter(t => t.isMinor && names.has(t.name));
  }, [inquiry]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: isPhone ? 8 : 12, height: "100%" }}>
      <StatusStrip inquiry={inquiry} pov={pov} compact={isPhone} />
      {minorsOnInquiry.length > 0 && (
        <MinorProtectionBanner talents={minorsOnInquiry} compact={isPhone} />
      )}

      {isPhone ? (
        /* ── Phone: stacked layout ── */
        <PhoneWorkspaceLayout inquiry={inquiry} pov={pov} />
      ) : showDualPane ? (
        /* ── Wide (admin only): private | group | rail ── */
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) 260px",
            gap: 12,
            flex: 1,
            minHeight: 0,
          }}
        >
          <MessagingPanel inquiry={inquiry} pov={pov} forcedThread="private" />
          <MessagingPanel inquiry={inquiry} pov={pov} forcedThread="group" />
          <Rail inquiry={inquiry} pov={pov} />
        </div>
      ) : (
        /* ── Tablet / desktop: tabs + rail ── */
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 272px",
            gap: 14,
            flex: 1,
            minHeight: 0,
          }}
        >
          <MessagingPanel inquiry={inquiry} pov={pov} />
          <Rail inquiry={inquiry} pov={pov} />
        </div>
      )}
    </div>
  );
}

// ─── Phone layout ────────────────────────────────────────────────
//
// Thread tabs across the top (horizontal scroller). A "Details"
// toggle slides the Rail panels down in a compact accordion before
// the message stream. The composer stays docked at the bottom of
// the stream section.

function PhoneWorkspaceLayout({ inquiry, pov }: { inquiry: RichInquiry; pov: InquiryWorkspacePov }) {
  const visible: ThreadType[] = useMemo(() => {
    if (pov === "client") return ["private"];
    if (pov === "talent") return ["group"];
    return ["private", "group"];
  }, [pov]);

  const [active, setActive]     = useState<ThreadType>(visible.includes("private") ? "private" : "group");
  const [railOpen, setRailOpen] = useState(false);
  const [showFiles, setShowFiles] = useState(false); // WS-10.3

  const labels: Record<ThreadType, string> = {
    private: pov === "admin" ? "Client thread" : "With your coordinator",
    group:   pov === "admin" ? "Talent group"  : "Booking team",
  };
  const unread: Record<ThreadType, number> = {
    private: inquiry.unreadPrivate,
    group:   inquiry.unreadGroup,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* ── Thread tabs ── */}
      <div
        role="tablist"
        aria-label="Message threads"
        style={{
          display: "flex",
          overflowX: "auto",
          borderBottom: `1px solid ${COLORS.borderSoft}`,
          background: "#fff",
          flexShrink: 0,
          /* hide scrollbar while keeping scroll functional */
          scrollbarWidth: "none",
        }}
      >
        {visible.map((t) => {
          const isActive = active === t && !showFiles;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => { setActive(t); setShowFiles(false); }}
              data-tulala-thread-tab={t}
              style={{
                flexShrink: 0,
                background: "transparent",
                border: "none",
                padding: "0 16px",
                height: 44,
                fontFamily: FONTS.body,
                fontSize: 14,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? COLORS.ink : COLORS.inkMuted,
                cursor: "pointer",
                borderBottom: isActive ? `2px solid ${COLORS.ink}` : "2px solid transparent",
                marginBottom: -1,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {labels[t]}
              {unread[t] > 0 && (
                <span
                  style={{
                    display: "inline-flex",
                    padding: "0 5px",
                    minWidth: 18,
                    height: 18,
                    borderRadius: 999,
                    background: COLORS.amber,
                    color: "#fff",
                    fontSize: 10.5,
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

        {/* WS-10.3 — Files tab (phone) */}
        <button
          type="button"
          role="tab"
          aria-selected={showFiles}
          data-tulala-workspace-files-tab
          onClick={() => setShowFiles(true)}
          style={{
            flexShrink: 0,
            background: "transparent",
            border: "none",
            padding: "0 16px",
            height: 44,
            fontFamily: FONTS.body,
            fontSize: 14,
            fontWeight: showFiles ? 600 : 500,
            color: showFiles ? COLORS.ink : COLORS.inkMuted,
            cursor: "pointer",
            borderBottom: showFiles ? `2px solid ${COLORS.accent}` : "2px solid transparent",
            marginBottom: -1,
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
          }}
        >
          Files
          <span style={{
            display: "inline-flex", padding: "0 5px", minWidth: 18, height: 18,
            borderRadius: 999, background: showFiles ? COLORS.accent : "rgba(11,11,13,0.08)",
            color: showFiles ? "#fff" : COLORS.inkMuted,
            fontSize: 10.5, fontWeight: 700, alignItems: "center", justifyContent: "center",
          }}>
            {WORKSPACE_FILES_COUNT}
          </span>
        </button>

        {/* Details toggle — visually distinct from thread tabs; this opens
            an info panel, not switches threads. Pill-button affordance with
            info icon makes the metaphor clear. */}
        <button
          type="button"
          onClick={() => setRailOpen((v) => !v)}
          aria-expanded={railOpen}
          aria-label={railOpen ? "Hide details" : "Show inquiry details"}
          data-tulala-phone-details-toggle
          style={{
            marginLeft: "auto",
            marginRight: 6,
            alignSelf: "center",
            flexShrink: 0,
            background: railOpen ? COLORS.fill : "rgba(11,11,13,0.05)",
            border: "none",
            padding: "6px 12px",
            borderRadius: 999,
            fontFamily: FONTS.body,
            fontSize: 12,
            fontWeight: 600,
            color: railOpen ? "#fff" : COLORS.ink,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            transition: `all ${TRANSITION.sm}`,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M7 6.4V10M7 4.5v.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
          {railOpen ? "Hide" : "Details"}
        </button>
      </div>

      {/* ── Collapsible Rail accordion (hidden in files view) ── */}
      {!showFiles && railOpen && (
        <div
          data-tulala-phone-rail
          style={{
            background: "rgba(11,11,13,0.02)",
            borderBottom: `1px solid ${COLORS.borderSoft}`,
            maxHeight: 340,
            overflowY: "auto",
            flexShrink: 0,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <SummaryPanel inquiry={inquiry} />
          {pov === "admin" && <CoordinatorPanel inquiry={inquiry} />}
          <RequirementGroupsPanel inquiry={inquiry} />
          <OfferPanel inquiry={inquiry} pov={pov} />
          {(inquiry.bookingId || inquiry.stage === "approved") && (
            <BookingPanel inquiry={inquiry} />
          )}
          <PaymentPanel inquiry={inquiry} pov={pov} />
          <ActivityPanel inquiry={inquiry} />
        </div>
      )}

      {/* WS-10.3 — Files panel */}
      {showFiles && <WorkspaceFilesPanel pov={pov} />}

      {/* ── Message stream + composer (phone variant) ── */}
      {!showFiles && <PhoneMessagingStream inquiry={inquiry} pov={pov} active={active} />}
    </div>
  );
}

// Slimmed-down message stream for phone — same logic as MessagingPanel
// but without the thread-switcher chrome (handled by PhoneWorkspaceLayout).
function PhoneMessagingStream({
  inquiry,
  pov,
  active,
}: {
  inquiry: RichInquiry;
  pov: InquiryWorkspacePov;
  active: ThreadType;
}) {
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mentionCursor, setMentionCursor] = useState(0);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const handleSend = async () => {
    const trimmed = draft.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setSendError(null);
    // Dispatch by viewer role. Client always writes to the private thread;
    // talent always writes to the group thread; admin can target either.
    const result =
      pov === "client" ? await sendInquiryMessageAsClient(inquiry.id, trimmed)
      : pov === "talent" ? await sendInquiryMessageAsTalent(inquiry.id, trimmed)
      : await sendInquiryMessageAsAdmin(inquiry.id, active, trimmed);
    setSending(false);
    if (result.ok) {
      setDraft("");
    } else {
      setSendError(result.error);
    }
  };

  const messages = inquiry.messages.filter((m) => m.threadType === active);
  const renderables = useMemo(() => buildMessageRenderables(messages), [messages]);

  // WS-13.3 — VirtuosoHandle replaces HTMLDivElement streamRef.
  const streamRef = useRef<VirtuosoHandle>(null);
  const [showLatestPill, setShowLatestPill] = useState(false);

  return (
    <section
      style={{
        background: "#fff",
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Stream — WS-13.3: Virtuoso for large message threads */}
      <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {messages.length === 0 ? (
          <div
            role="log"
            aria-live="polite"
            aria-label="Message thread"
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <EmptyState icon="mail" title="No messages yet" body="Write the first one below." compact />
          </div>
        ) : (
          <Virtuoso
            ref={streamRef}
            data-tulala-msg-stream
            role="log"
            aria-live="polite"
            aria-label="Message thread"
            aria-relevant="additions"
            style={{ flex: 1 }}
            data={renderables}
            followOutput={(isAtBottom) => (isAtBottom ? vsb() : false)}
            atBottomStateChange={(atBottom) => setShowLatestPill(!atBottom)}
            itemContent={(_, r) => {
              if (r.kind === "divider") return <div style={{ padding: "0 14px" }}><DateDivider day={r.day} /></div>;
              if (r.kind === "system") return <div style={{ padding: "0 14px 10px" }}><SystemEventGroup messages={r.messages} /></div>;
              return <div style={{ padding: "0 14px 10px" }}><MessageBubble message={r.message} pov={pov} /></div>;
            }}
          />
        )}
        {showLatestPill && (
          <button
            type="button"
            data-tulala-msg-latest-pill
            onClick={() => streamRef.current?.scrollToIndex({ index: "LAST", behavior: vsb() })}
            aria-label="Scroll to latest messages"
            style={{
              position: "absolute",
              right: 14,
              bottom: 10,
              padding: "7px 14px",
              borderRadius: 999,
              background: COLORS.fill,
              color: "#fff",
              fontFamily: FONTS.body,
              fontSize: 12,
              fontWeight: 500,
              border: "none",
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(11,11,13,0.18)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span aria-hidden className="text-admin-11">↓</span>
            Latest
          </button>
        )}
      </div>

      {/* Composer — phone-optimised (single-line + full-width send) */}
      <div
        style={{
          borderTop: `1px solid ${COLORS.borderSoft}`,
          padding: "10px 12px",
          background: "rgba(11,11,13,0.015)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <MentionTypeahead value={draft} onChange={setDraft} selectionStart={mentionCursor} />
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setMentionCursor(e.target.selectionStart);
            }}
            onSelect={(e) => setMentionCursor(e.currentTarget.selectionStart)}
            onKeyUp={(e) => setMentionCursor(e.currentTarget.selectionStart)}
            onClick={(e) => setMentionCursor(e.currentTarget.selectionStart)}
            placeholder={
              active === "private"
                ? pov === "client" ? "Send your coordinator a note…" : "Reply to client…"
                : pov === "talent" ? "Reply to the team…" : "Message the talent…"
            }
            rows={2}
            style={{
              flex: 1,
              padding: "9px 12px",
              fontFamily: FONTS.body,
              fontSize: 15,
              color: COLORS.ink,
              background: "#fff",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              outline: "none",
              resize: "none",
              lineHeight: 1.5,
              /* Prevent iOS zoom on focus (font-size >= 16px) */
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <PrimaryButton
            disabled={!draft.trim() || sending}
            onClick={() => void handleSend()}
          >
            {sending ? "…" : "Send"}
          </PrimaryButton>
        </div>
        {sendError && (
          <div style={{ marginTop: 4, fontFamily: FONTS.body, fontSize: 10.5 }} className="text-admin-coral">
            ⚠ {sendError}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Status strip (sits between header and split view) ───────────

function StatusStrip({
  inquiry,
  pov,
  compact = false,
}: {
  inquiry: RichInquiry;
  pov: InquiryWorkspacePov;
  compact?: boolean;
}) {
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
            : "Fully resolved";

  if (compact) {
    /* Phone — single row: dot + status label + spacer + next-action */
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          background: "#fff",
          border: `1px solid ${COLORS.borderSoft}`,
          borderRadius: 10,
          fontFamily: FONTS.body,
          flexShrink: 0,
        }}
      >
        <StatDot tone={meta.tone === "red" ? "red" : meta.tone} size={7} />
        <span className="text-admin-ink text-admin-12h font-semibold">{meta.label}</span>
        <span style={{ flex: 1 }} />
        <span className="text-admin-ink-muted text-admin-11">{nextLabel}</span>
      </div>
    );
  }

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
        flexShrink: 0,
      }}
    >
      <StatDot tone={meta.tone === "red" ? "red" : meta.tone} size={8} />
      <span className="text-admin-ink text-admin-13 font-semibold">
        {meta.label}
      </span>
      <span className="text-admin-ink-muted text-xs">{meta.description}</span>
      <span style={{ flex: 1 }} />
      <span className="text-admin-ink-muted text-admin-11h">{nextLabel}</span>
      {pov === "admin" && inquiry.coordinator && (
        <>
          <Bullet />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5 }} className="text-admin-ink-muted">
            <Avatar initials={inquiry.coordinator.initials} size={18} />
            {inquiry.coordinator.name}
          </span>
        </>
      )}
    </div>
  );
}

export function InquiryStatusChip({ inquiry }: { inquiry: RichInquiry }) {
  const meta = INQUIRY_STAGE_META[inquiry.stage];
  const bgMap: Record<string, string> = {
    ink: "rgba(11,11,13,0.06)",
    amber: "rgba(82,96,109,0.12)",
    green: COLORS.successSoft,
    dim: "rgba(11,11,13,0.04)",
    red: COLORS.criticalSoft,
    // "approved / ready to book" — distinct indigo so it never reads as "booked".
    indigo: "rgba(43,63,163,0.12)",
  };
  const fgMap: Record<string, string> = {
    ink: COLORS.ink,
    amber: COLORS.amberDeep,
    green: COLORS.successDeep,
    dim: COLORS.inkMuted,
    red: "#7A2026",
    indigo: "#2B3FA3",
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

// ─── WS-1.B Message stream rhythm ─────────────────────────────────────
//
// Date dividers + system-event grouping + jump-to-latest pill. Without
// these, a 50-message thread reads as a uniform scroll with no rhythm
// and overwhelms the user (per ROADMAP §3.1.2).

/**
 * Parse the day prefix from a `ts` string ("Mon 14:32", "Today 09:15",
 * "Yesterday 18:02"). Used to detect day-change boundaries for date
 * dividers. Falls back to the whole string if no recognized prefix.
 */
function parseDayBucket(ts: string): string {
  const day = ts.split(" ")[0]?.trim();
  return day || ts;
}

/**
 * Friendly day-divider label. "Today" / "Yesterday" stay as-is; weekday
 * abbreviations get spelled out.
 */
const DAY_LABEL: Record<string, string> = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday",
  Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
  Today: "Today", Yesterday: "Yesterday",
};

function DateDivider({ day }: { day: string }) {
  const label = DAY_LABEL[day] ?? day;
  return (
    <div
      data-tulala-msg-date-divider
      role="separator"
      aria-label={`Messages from ${label}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        margin: "10px 0 4px",
      }}
    >
      <div style={{ flex: 1, height: 1, background: COLORS.borderSoft }} />
      <span
        style={{
          fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }} className="text-admin-ink-dim">
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: COLORS.borderSoft }} />
    </div>
  );
}

/**
 * Collapsible "N system updates" stripe. Renders 2+ consecutive system
 * messages as a single line with a chevron; click expands to show each
 * underlying message inline.
 */
function SystemEventGroup({ messages }: { messages: ThreadMessage[] }) {
  const [open, setOpen] = useState(false);
  if (messages.length === 1) {
    // Single system event — render directly without group chrome.
    return (
      <div
        data-tulala-msg-system
        style={{
          textAlign: "center",
          fontFamily: FONTS.body,
          fontSize: 11.5,
          color: COLORS.inkDim,
          padding: "4px 0",
        }}
      >
        {messages[0]!.body}
      </div>
    );
  }
  return (
    <div
      data-tulala-msg-system-group
      style={{
        margin: "4px 0",
        background: "rgba(11,11,13,0.025)",
        border: `1px dashed ${COLORS.borderSoft}`,
        borderRadius: 8,
        fontFamily: FONTS.body,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          fontFamily: FONTS.body,
          fontSize: 11.5,
          color: COLORS.inkMuted,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.ink)}
        onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
      >
        <span className="font-medium">
          {messages.length} system updates
        </span>
        <span aria-hidden className={`text-admin-10 [transition:transform_var(--transition-admin-sm)] ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>
      {open && (
        <div style={{ padding: "0 12px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                fontSize: 11.5,
                color: COLORS.inkMuted,
                paddingLeft: 12,
                borderLeft: `2px solid ${COLORS.borderSoft}`,
              }}
            >
              <span style={{ marginRight: 6 }} className="text-admin-ink-dim">{m.ts}</span>
              {m.body}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Walk the messages and produce a flat array of "renderables": either a
 * date divider, a system-event group, an action banner, or a human message.
 *
 * - Date dividers go between consecutive messages whose day-bucket differs
 * - requiresAction system events bypass grouping → coral action banner (WS-1.E)
 * - Regular system events get coalesced when 2+ appear back-to-back
 * - Human messages render individually
 */
type MessageRenderable =
  | { kind: "divider"; key: string; day: string }
  | { kind: "system";  key: string; messages: ThreadMessage[] }
  | { kind: "action";  key: string; message: ThreadMessage }   // WS-1.E
  | { kind: "human";   key: string; message: ThreadMessage };

function buildMessageRenderables(messages: ThreadMessage[]): MessageRenderable[] {
  const out: MessageRenderable[] = [];
  let lastDay: string | null = null;
  let systemBuffer: ThreadMessage[] = [];
  const flushSystem = () => {
    if (systemBuffer.length === 0) return;
    out.push({ kind: "system", key: `sys-${systemBuffer[0]!.id}`, messages: systemBuffer });
    systemBuffer = [];
  };
  for (const m of messages) {
    const day = parseDayBucket(m.ts);
    if (lastDay !== day) {
      flushSystem();
      out.push({ kind: "divider", key: `div-${day}-${m.id}`, day });
      lastDay = day;
    }
    if (m.senderRole === "system") {
      if (m.requiresAction) {
        // WS-1.E — action messages bypass the group buffer; they render as
        // coral inline-banners regardless of what surrounds them.
        flushSystem();
        out.push({ kind: "action", key: `action-${m.id}`, message: m });
      } else {
        systemBuffer.push(m);
      }
    } else {
      flushSystem();
      out.push({ kind: "human", key: `msg-${m.id}`, message: m });
    }
  }
  flushSystem();
  return out;
}

// ─── WS-1.E — Action banner ───────────────────────────────────────
// Coral inline-banner for system messages that require immediate user
// action (hold expiry, offer deadline, payment overdue, etc.).
// Sits inline in the message stream, not the Rail, so it's impossible
// to miss while reading the thread.

function ActionBanner({ message, onDismiss }: { message: ThreadMessage; onDismiss: () => void }) {
  return (
    <div
      data-tulala-action-banner
      role="alert"
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "10px 14px",
        background: "rgba(176,48,58,0.07)",
        border: "1px solid rgba(176,48,58,0.22)",
        borderLeft: "3px solid #B0303A",
        borderRadius: 8,
        fontFamily: FONTS.body,
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1, marginTop: 1, flexShrink: 0 }}>⚠️</span>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "#7A2026", lineHeight: 1.4 }}>
          {message.requiresActionLabel ?? message.body}
        </div>
        <div style={{ fontSize: 11, marginTop: 2 }} className="text-admin-ink-muted">{message.ts}</div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            background: "transparent",
            border: "none",
            padding: "4px 6px",
            color: COLORS.inkMuted,
            cursor: "pointer",
            fontFamily: FONTS.body,
            fontSize: 13,
            borderRadius: 4,
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ─── WS-1.F.1 — Participant chips (group thread header) ───────────
// Horizontal avatar-chip strip above the stream on group threads.
// Click any chip to filter the stream to that participant's messages.
// "All" chip clears the filter.

function ParticipantChipStrip({
  inquiry,
  filter,
  onFilter,
}: {
  inquiry: RichInquiry;
  filter: string | null;
  onFilter: (name: string | null) => void;
}) {
  const talents = inquiry.requirementGroups.flatMap((g) => g.talents);
  if (talents.length === 0) return null;
  return (
    <div
      data-tulala-participant-chips
      style={{
        display: "flex",
        gap: 6,
        overflowX: "auto",
        scrollbarWidth: "none",
        padding: "8px 14px 0",
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        onClick={() => onFilter(null)}
        style={{
          flexShrink: 0,
          padding: "3px 10px",
          borderRadius: 999,
          border: `1px solid ${filter === null ? COLORS.accent : COLORS.borderSoft}`,
          background: filter === null ? COLORS.fill : "transparent",
          color: filter === null ? "#fff" : COLORS.inkMuted,
          fontFamily: FONTS.body,
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        All
      </button>
      {talents.map((t) => {
        const isActive = filter === t.name;
        return (
          <button
            key={t.name}
            type="button"
            onClick={() => onFilter(isActive ? null : t.name)}
            title={t.lastSaidSnippet ? `Last said: "${t.lastSaidSnippet}"` : t.name}
            style={{
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "3px 10px 3px 4px",
              borderRadius: 999,
              border: `1px solid ${isActive ? COLORS.accent : COLORS.borderSoft}`,
              background: isActive ? COLORS.fill : "transparent",
              color: isActive ? "#fff" : COLORS.inkMuted,
              fontFamily: FONTS.body,
              fontSize: 11,
              fontWeight: 500,
              cursor: "pointer",
              transition: `background ${TRANSITION.micro}, color ${TRANSITION.micro}`,
            }}
          >
            {t.thumb?.startsWith("http") ? (
              <span style={{
                width: 18, height: 18, borderRadius: "50%",
                background: `url(${t.thumb}) center/cover`,
                flexShrink: 0,
              }} />
            ) : (
              <span className="text-admin-13">{t.thumb}</span>
            )}
            {t.name.split(" ")[0]}
            {t.lastSaidTs && !isActive && (
              <span style={{ fontSize: 9.5, opacity: 0.6, marginLeft: 2 }}>
                {t.lastSaidTs.split(" ")[1]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── WS-1.G.1 — Thread search bar ─────────────────────────────────
// Slides down when `active`. Filters renderables to those whose body
// contains the query. "/" in the composer textarea opens it.

function ThreadSearchBar({
  query,
  onChange,
  matchCount,
  onClose,
}: {
  query: string;
  onChange: (q: string) => void;
  matchCount: number;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  return (
    <div
      data-tulala-thread-search
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        background: "rgba(11,11,13,0.02)",
        flexShrink: 0,
      }}
    >
      <span className="text-admin-ink-dim text-xs">🔍</span>
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search messages…"
        style={{
          flex: 1,
          border: "none",
          outline: "none",
          background: "transparent",
          fontFamily: FONTS.body,
          fontSize: 13,
          color: COLORS.ink,
        }}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      />
      {query.length > 0 && (
        <span style={{ fontFamily: FONTS.body, fontSize: 11, flexShrink: 0 }} className="text-admin-ink-muted">
          {matchCount} {matchCount === 1 ? "match" : "matches"}
        </span>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close search"
        style={{
          background: "transparent",
          border: "none",
          padding: "2px 4px",
          color: COLORS.inkMuted,
          cursor: "pointer",
          fontFamily: FONTS.body,
          fontSize: 13,
          flexShrink: 0,
          borderRadius: 4,
        }}
      >
        ✕
      </button>
    </div>
  );
}

function MessagingPanel({
  inquiry,
  pov,
  forcedThread,
}: {
  inquiry: RichInquiry;
  pov: InquiryWorkspacePov;
  forcedThread?: ThreadType;
}) {
  // WS-1.A — `forcedThread` is set in wide dual-pane mode (admin, ≥1280px)
  // so each panel shows a single thread with no tab-switcher chrome.
  const visible: ThreadType[] = useMemo(() => {
    if (forcedThread) return [forcedThread];
    if (pov === "client") return ["private"];
    if (pov === "talent") return ["group"];
    return ["private", "group"];
  }, [pov, forcedThread]);

  const [active, setActive] = useState<ThreadType>(
    forcedThread ?? (visible.includes("private") ? "private" : "group"),
  );

  // WS-10.3 — Files tab visibility
  const [showFiles, setShowFiles] = useState(false);

  // WS-1.C.7 — per-thread draft auto-save to localStorage
  const draftKey = `tulala-draft-${inquiry.id}-${active}`;
  const [draft, setDraft] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(draftKey) ?? "";
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mentionCursor, setMentionCursor] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (draft) { localStorage.setItem(draftKey, draft); }
    else        { localStorage.removeItem(draftKey); }
  }, [draft, draftKey]);
  // When the active thread changes, load its saved draft and move the caret to the end.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const next = localStorage.getItem(draftKey) ?? "";
    setDraft(next);
    setMentionCursor(next.length);
  }, [active, draftKey]);

  // WS-1.D.1 — Typing indicators.
  const [typingLabel] = useState<string | null>(null);

  // WS-1.F — Sending state for admin composer
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const handleSend = async () => {
    const trimmed = draft.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setSendError(null);
    // Dispatch by viewer role. Client always writes to the private thread;
    // talent always writes to the group thread; admin can target either.
    const result =
      pov === "client" ? await sendInquiryMessageAsClient(inquiry.id, trimmed)
      : pov === "talent" ? await sendInquiryMessageAsTalent(inquiry.id, trimmed)
      : await sendInquiryMessageAsAdmin(inquiry.id, active, trimmed);
    setSending(false);
    if (result.ok) {
      setDraft("");
      localStorage.removeItem(draftKey);
    } else {
      setSendError(result.error);
    }
  };

  // WS-1.E — dismissed action banners (session-only)
  const [dismissedActions, setDismissedActions] = useState<Set<string>>(new Set());

  // WS-18.1 — AI reply suggestions (admin/coordinator POV only)
  const AI_SUGGESTIONS: Record<ThreadType, string[]> = {
    private: [
      "The rates look competitive for this brief — happy to discuss further if needed.",
      "We'll have a response for you by end of day.",
      `${inquiry.requirementGroups[0]?.talents[0]?.name ?? "The talent"} is available for those dates. I'll send the formal offer shortly.`,
    ],
    group: [
      "Please confirm your availability for the dates in the brief above.",
      "The client has approved the hold — let me know your call-sheet preferences.",
      "Let me know if you have any questions about the brief.",
    ],
  };
  const [suggestionsVisible, setSuggestionsVisible] = useState(false); // hidden by default — tap ✦ to reveal
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<number>>(new Set());

  // WS-18.2 — AI thread summary (coordinator-only)
  const THREAD_SUMMARIES: Record<ThreadType, string[]> = {
    private: [
      `Client confirmed ${inquiry.requirementGroups[0]?.role ?? "talent"} for ${inquiry.brief}.`,
      `Rates discussed: ${inquiry.offer?.lineItems[0]?.fee ?? "TBD"}. Client expects offer by Friday.`,
      `Hold dates requested: ${inquiry.offer?.sentAt ? `around ${inquiry.offer.sentAt}` : "TBD"}.`,
    ],
    group: [
      `${inquiry.requirementGroups[0]?.talents.map(t => t.name.split(" ")[0]).join(" and ") ?? "Talent"} both confirmed available.`,
      "Brief shared — outstanding: call sheet and contract.",
      inquiry.offer ? `Offer v${inquiry.offer.version} sent at ${inquiry.offer.total}. Awaiting client approval.` : "No offer sent yet.",
    ],
  };
  const [summaryVisible, setSummaryVisible] = useState(false);

  // WS-1.F.1 — participant filter for group thread
  const [participantFilter, setParticipantFilter] = useState<string | null>(null);

  // WS-1.G.1 — inline thread search
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery]   = useState("");

  const allMessages = inquiry.messages.filter((m) => m.threadType === active);

  // Apply participant filter (group thread only)
  const filteredMessages = useMemo(() => {
    if (active !== "group" || !participantFilter) return allMessages;
    return allMessages.filter(
      (m) => m.senderRole === "system" || m.senderName === participantFilter,
    );
  }, [allMessages, active, participantFilter]);

  // Apply search filter
  const searchedMessages = useMemo(() => {
    if (!searchActive || !searchQuery.trim()) return filteredMessages;
    const q = searchQuery.toLowerCase();
    return filteredMessages.filter((m) => m.body.toLowerCase().includes(q));
  }, [filteredMessages, searchActive, searchQuery]);

  const searchMatchCount = searchedMessages.length;

  const renderables = useMemo(
    () => buildMessageRenderables(searchedMessages),
    [searchedMessages],
  );

  // WS-1.B.3 — "↓ Latest" floating pill; WS-13.3 — VirtuosoHandle
  const streamRef = useRef<VirtuosoHandle>(null);
  const [showLatestPill, setShowLatestPill] = useState(false);
  const scrollToLatest = () => {
    streamRef.current?.scrollToIndex({ index: "LAST", behavior: vsb() });
  };

  const labels: Record<ThreadType, string> = {
    private: pov === "admin" ? "Client thread" : "With your coordinator",
    group:   pov === "admin" ? "Talent group"  : "Booking team",
  };
  const unread: Record<ThreadType, number> = {
    private: inquiry.unreadPrivate,
    group:   inquiry.unreadGroup,
  };

  // WS-1.C.1 — thread-context tinting
  const THREAD_ACCENT: Record<ThreadType, string> = {
    private: "rgba(79,70,229,0.55)",   // indigo — private / client
    group:   "rgba(217,119,6,0.55)",   // amber  — group / talent
  };
  const THREAD_BG: Record<ThreadType, string> = {
    private: "rgba(79,70,229,0.04)",
    group:   "rgba(217,119,6,0.04)",
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
      {/* ── Thread switcher — pill segmented control ── */}
      {visible.length > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "10px 12px 0",
            gap: 8,
            borderBottom: `1px solid ${COLORS.borderSoft}`,
            background: "#fff",
          }}
        >
          {/* Pill track */}
          <div
            role="tablist"
            aria-label="Message threads"
            style={{
              display: "flex",
              background: "rgba(11,11,13,0.055)",
              borderRadius: 10,
              padding: 3,
              gap: 2,
            }}
          >
            {visible.map((t) => {
              const isActive = active === t && !showFiles;
              const threadDot = t === "private"
                ? { bg: "rgba(79,70,229,1)", soft: "rgba(79,70,229,0.14)" }
                : { bg: "rgba(217,119,6,1)",  soft: "rgba(217,119,6,0.14)" };
              return (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => { setActive(t); setShowFiles(false); setParticipantFilter(null); setSearchActive(false); setSearchQuery(""); }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    background: isActive ? "#fff" : "transparent",
                    border: "none",
                    borderRadius: 7,
                    padding: "5px 12px",
                    fontFamily: FONTS.body,
                    fontSize: 12.5,
                    fontWeight: isActive ? 650 : 500,
                    color: isActive ? COLORS.ink : COLORS.inkMuted,
                    cursor: "pointer",
                    boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.10), 0 0 0 0.5px rgba(0,0,0,0.06)" : "none",
                    transition: `all ${TRANSITION.sm}`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {/* Thread-colored dot */}
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                    background: isActive ? threadDot.bg : COLORS.inkDim,
                    transition: `background ${TRANSITION.sm}`,
                  }} />
                  {labels[t]}
                  {unread[t] > 0 && (
                    <span
                      style={{
                        display: "inline-flex",
                        padding: "0 5px",
                        minWidth: 16,
                        height: 16,
                        borderRadius: 999,
                        background: COLORS.amber,
                        color: "#fff",
                        fontSize: 9.5,
                        fontWeight: 700,
                        alignItems: "center",
                        justifyContent: "center",
                        lineHeight: 1,
                      }}
                    >
                      {unread[t]}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Files tab inside the pill track */}
            {!forcedThread && (
              <button
                type="button"
                role="tab"
                aria-selected={showFiles}
                data-tulala-workspace-files-tab
                onClick={() => setShowFiles(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  background: showFiles ? "#fff" : "transparent",
                  border: "none",
                  borderRadius: 7,
                  padding: "5px 12px",
                  fontFamily: FONTS.body,
                  fontSize: 12.5,
                  fontWeight: showFiles ? 650 : 500,
                  color: showFiles ? COLORS.ink : COLORS.inkMuted,
                  cursor: "pointer",
                  boxShadow: showFiles ? "0 1px 3px rgba(0,0,0,0.10), 0 0 0 0.5px rgba(0,0,0,0.06)" : "none",
                  transition: `all ${TRANSITION.sm}`,
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: showFiles ? COLORS.accent : COLORS.inkDim, transition: `background ${TRANSITION.sm}` }} />
                Files
                <span style={{ display: "inline-flex", padding: "0 5px", minWidth: 16, height: 16, borderRadius: 999, background: showFiles ? COLORS.accent : "rgba(11,11,13,0.10)", color: showFiles ? "#fff" : COLORS.inkMuted, fontSize: 9.5, fontWeight: 700, alignItems: "center", justifyContent: "center" }}>
                  {WORKSPACE_FILES_COUNT}
                </span>
              </button>
            )}
          </div>

          {/* Right-side toolbar — search, mark read, AI summarize */}
          {!showFiles && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 2, paddingBottom: 2 }}>
            <button
              type="button"
              onClick={() => { setSearchActive((v) => !v); setSearchQuery(""); }}
              aria-label="Search thread"
              title="Search (press / in composer)"
              style={{
                background: searchActive ? "rgba(11,11,13,0.07)" : "transparent",
                border: "none",
                padding: "5px 8px",
                color: searchActive ? COLORS.ink : COLORS.inkMuted,
                cursor: "pointer",
                fontFamily: FONTS.body,
                fontSize: 13,
                borderRadius: 7,
                display: "inline-flex", alignItems: "center",
                transition: `background ${TRANSITION.micro}`,
              }}
            >
              <Icon name="search" size={13} color={searchActive ? COLORS.ink : COLORS.inkMuted} />
            </button>
            {/* WS-18.2 — AI summarize thread */}
            {pov === "admin" && (
              <button
                type="button"
                title="Summarize thread with AI"
                aria-label="Summarize thread"
                onClick={() => setSummaryVisible((v) => !v)}
                style={{
                  background: summaryVisible ? COLORS.royalSoft : "transparent",
                  border: "none",
                  padding: "5px 9px",
                  borderRadius: 7,
                  cursor: "pointer",
                  color: summaryVisible ? COLORS.royal : COLORS.inkMuted,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontFamily: FONTS.body,
                  fontSize: 11.5,
                  fontWeight: 500,
                  transition: `background ${TRANSITION.micro}, color ${TRANSITION.micro}`,
                }}
              >
                <Icon name="sparkle" size={11} color={summaryVisible ? COLORS.royal : COLORS.inkMuted} stroke={1.8} />
                Summarize
              </button>
            )}
          </div>
          )}
        </div>
      )}

      {/* WS-18.2 — AI thread summary banner (pinned below toolbar) */}
      {summaryVisible && !showFiles && (
        <div
          style={{
            borderBottom: `1px solid ${COLORS.royalSoft}`,
            background: "rgba(95,75,139,0.04)",
            padding: "12px 16px",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <div className="flex items-center gap-1.5">
              <Icon name="sparkle" size={12} color={COLORS.royal} stroke={1.7} />
              <span style={{ fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }} className="text-admin-royal">
                AI Summary
              </span>
              <span style={{ fontFamily: FONTS.body, fontSize: 10, marginLeft: 2 }} className="text-admin-ink-dim">
                · draft, not saved
              </span>
            </div>
            <button
              type="button"
              aria-label="Dismiss summary"
              onClick={() => setSummaryVisible(false)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: COLORS.inkDim }}
            >
              <Icon name="x" size={12} color={COLORS.inkDim} />
            </button>
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 5 }}>
            {THREAD_SUMMARIES[active].map((point, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  gap: 8,
                  fontFamily: FONTS.body,
                  fontSize: 12,
                  color: COLORS.ink,
                  lineHeight: 1.45,
                }}
              >
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: COLORS.royal,
                    flexShrink: 0,
                    marginTop: 6,
                  }}
                />
                {point}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* WS-10.3 — Files panel (replaces stream + composer when active) */}
      {showFiles && <WorkspaceFilesPanel pov={pov} />}

      {/* Single-thread header (client / talent POV, or forced dual-pane) — hidden in files view */}
      {!showFiles && (visible.length === 1 || forcedThread) && (
        <div
          style={{
            padding: "10px 14px",
            borderBottom: `1px solid ${COLORS.borderSoft}`,
            background: THREAD_BG[forcedThread ?? active],
            fontFamily: FONTS.body,
            fontSize: 12.5,
            color: COLORS.inkMuted,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: THREAD_ACCENT[forcedThread ?? active], flexShrink: 0, }}
          />
          <span style={{ fontWeight: 600 }} className="text-admin-ink">
            {labels[forcedThread ?? active]}
          </span>
          {pov === "client" && (
            <>
              <Bullet />
              <span className="text-admin-ink-dim text-admin-11h">
                Direct line to your coordinator. Talent can&apos;t see this.
              </span>
            </>
          )}
          {pov === "talent" && (
            <>
              <Bullet />
              <span className="text-admin-ink-dim text-admin-11h">
                You and the other booked talent. The client can&apos;t see this.
              </span>
            </>
          )}
          <span style={{ flex: 1 }} />
          {/* Search toggle for single-thread views */}
          <button
            type="button"
            onClick={() => { setSearchActive((v) => !v); setSearchQuery(""); }}
            style={{
              background: "transparent", border: "none", cursor: "pointer", fontSize: 13, padding: "2px 4px", borderRadius: 4 }} className="text-admin-ink-muted">
            🔍
          </button>
        </div>
      )}

      {/* WS-1.G.1 — Search bar (hidden in files view) */}
      {!showFiles && searchActive && (
        <ThreadSearchBar
          query={searchQuery}
          onChange={setSearchQuery}
          matchCount={searchMatchCount}
          onClose={() => { setSearchActive(false); setSearchQuery(""); }}
        />
      )}

      {/* WS-1.F.1 — Participant chip strip (group thread only, hidden in files view) */}
      {!showFiles && (active === "group" || forcedThread === "group") && (
        <ParticipantChipStrip
          inquiry={inquiry}
          filter={participantFilter}
          onFilter={setParticipantFilter}
        />
      )}

      {/* ── Stream — WS-13.3: Virtuoso (hidden in files view) ── */}
      {!showFiles && <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", minHeight: 300 }}>
        {allMessages.length === 0 && !searchActive ? (
          <div
            role="log"
            aria-live="polite"
            aria-label="Message thread"
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <EmptyState icon="mail" title="No messages yet" body="Write the first one below." compact />
          </div>
        ) : (
          <Virtuoso
            ref={streamRef}
            data-tulala-msg-stream
            role="log"
            aria-live="polite"
            aria-label="Message thread"
            aria-relevant="additions"
            style={{ flex: 1 }}
            data={renderables}
            followOutput={(isAtBottom) => (isAtBottom ? vsb() : false)}
            atBottomStateChange={(atBottom) => setShowLatestPill(!atBottom)}
            components={{
              Footer: () => typingLabel ? (
                <div
                  data-tulala-typing-indicator
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontFamily: FONTS.body,
                    fontSize: 12,
                    color: COLORS.inkMuted,
                    fontStyle: "italic",
                    padding: "2px 18px 18px",
                  }}
                >
                  <span style={{ display: "inline-flex", gap: 3 }}>
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          background: COLORS.inkDim,
                          display: "inline-block",
                          animation: `tulalaTypingDot 1.2s ${i * 0.2}s ease-in-out infinite`,
                        }}
                      />
                    ))}
                  </span>
                  {typingLabel}
                  <style>{`
                    @keyframes tulalaTypingDot {
                      0%,80%,100% { opacity: 0.3; transform: translateY(0); }
                      40%         { opacity: 1;   transform: translateY(-3px); }
                    }
                  `}</style>
                </div>
              ) : null,
            }}
            itemContent={(_, r) => {
              if (r.kind === "divider") return <div style={{ padding: "0 18px" }}><DateDivider day={r.day} /></div>;
              if (r.kind === "system")  return <div style={{ padding: "0 18px 12px" }}><SystemEventGroup messages={r.messages} /></div>;
              if (r.kind === "action") {
                if (dismissedActions.has(r.message.id)) return null;
                return (
                  <div style={{ padding: "0 18px 12px" }}>
                    <ActionBanner
                      message={r.message}
                      onDismiss={() => setDismissedActions((s) => new Set([...s, r.message.id]))}
                    />
                  </div>
                );
              }
              return (
                <div style={{ padding: "0 18px 12px" }}>
                  <MessageBubble
                    message={r.message}
                    pov={pov}
                    searchQuery={searchActive ? searchQuery : ""}
                  />
                </div>
              );
            }}
          />
        )}
        {searchActive && searchQuery.length > 0 && searchedMessages.length === 0 && (
          <div style={{ position: "absolute", top: "50%", left: 0, right: 0, transform: "translateY(-50%)", pointerEvents: "none" }}>
            <EmptyState icon="search" title={`No messages match "${searchQuery}"`} compact />
          </div>
        )}

        {/* WS-1.B.3 — ↓ Latest pill */}
        {showLatestPill && (
          <button
            type="button"
            data-tulala-msg-latest-pill
            onClick={scrollToLatest}
            aria-label="Scroll to latest messages"
            style={{
              position: "absolute",
              right: 18,
              bottom: 14,
              padding: "7px 14px",
              borderRadius: 999,
              background: COLORS.fill,
              color: "#fff",
              fontFamily: FONTS.body,
              fontSize: 12,
              fontWeight: 500,
              border: "none",
              cursor: "pointer",
              boxShadow: "0 6px 18px rgba(11,11,13,0.18)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span aria-hidden className="text-admin-11">↓</span>
            Latest
          </button>
        )}
      </div>}

      {/* ── Composer (hidden in files view) ── */}
      {!showFiles && <div
        style={{
          borderTop: `1px solid ${COLORS.borderSoft}`,
          padding: "10px 12px 12px",
          background: "#fff",
          flexShrink: 0,
        }}
      >
        {/* WS-18.1 — AI reply suggestions strip (admin only, dismissible) */}
        {pov === "admin" && suggestionsVisible && (
          <div style={{ marginBottom: 8, padding: "8px 10px" }} className="bg-admin-royal-soft rounded-admin-md">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <Icon name="sparkle" size={11} color={COLORS.royal} stroke={1.8} />
                <span style={{ fontFamily: FONTS.body, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }} className="text-admin-royal">
                  Suggested replies
                </span>
              </div>
              <button
                type="button"
                aria-label="Dismiss suggestions"
                onClick={() => setSuggestionsVisible(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.inkDim, padding: "1px 3px" }}
              >
                <Icon name="x" size={11} color={COLORS.inkDim} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {AI_SUGGESTIONS[active].map((sug, i) =>
                dismissedSuggestions.has(i) ? null : (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      background: "rgba(255,255,255,0.7)",
                      borderRadius: RADIUS.sm,
                      padding: "0 6px 0 0",
                      overflow: "hidden",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => { setDraft(sug); setSuggestionsVisible(false); }}
                      style={{
                        flex: 1,
                        textAlign: "left",
                        background: "none",
                        border: "none",
                        padding: "6px 10px",
                        fontFamily: FONTS.body,
                        fontSize: 12,
                        color: COLORS.royalDeep,
                        cursor: "pointer",
                        lineHeight: 1.4,
                      }}
                    >
                      {sug}
                    </button>
                    <button
                      type="button"
                      aria-label={`Dismiss suggestion ${i + 1}`}
                      onClick={() => setDismissedSuggestions((p) => new Set([...p, i]))}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: COLORS.royal,
                        padding: "4px",
                        flexShrink: 0,
                        opacity: 0.6,
                      }}
                    >
                      <Icon name="x" size={10} color={COLORS.royal} />
                    </button>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* Minimal icon-bar composer row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
          {/* + attachment */}
          <button
            type="button"
            aria-label="Add attachment"
            disabled
            title="Attachments coming soon"
            style={{ background: "none", border: "none", cursor: "not-allowed", padding: "6px", borderRadius: 8, color: COLORS.inkDim, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: 0.55 }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M9 5.5v7M5.5 9h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
          {/* ✦ AI suggestions */}
          {pov === "admin" && (
            <button
              type="button"
              aria-label="AI suggestions"
              onClick={() => setSuggestionsVisible((v) => !v)}
              style={{ background: suggestionsVisible ? COLORS.royalSoft : "none", border: "none", cursor: "pointer", padding: "6px", borderRadius: 8, color: suggestionsVisible ? COLORS.royal : COLORS.inkMuted, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: `background ${TRANSITION.micro}` }}
            >
              <Icon name="sparkle" size={16} color={suggestionsVisible ? COLORS.royal : COLORS.inkMuted} stroke={1.7} />
            </button>
          )}
          {/* Input pill */}
          <div style={{ flex: 1, position: "relative" }}>
            <MentionTypeahead value={draft} onChange={setDraft} selectionStart={mentionCursor} />
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setMentionCursor(e.target.selectionStart);
              }}
              onSelect={(e) => setMentionCursor(e.currentTarget.selectionStart)}
              onKeyUp={(e) => setMentionCursor(e.currentTarget.selectionStart)}
              onClick={(e) => setMentionCursor(e.currentTarget.selectionStart)}
              placeholder={
                active === "private"
                  ? pov === "client" ? "Send your coordinator a note…" : "Message…"
                  : pov === "talent" ? "Reply to booking team…" : "Message…"
              }
              rows={1}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 14px",
                fontFamily: FONTS.body,
                fontSize: 13.5,
                color: COLORS.ink,
                background: "rgba(11,11,13,0.042)",
                border: `1.5px solid ${draft.length > 0 ? THREAD_ACCENT[active] : "transparent"}`,
                borderRadius: 24,
                outline: "none",
                resize: "none",
                lineHeight: 1.45,
                transition: `border-color ${TRANSITION.sm}`,
                maxHeight: 120,
                overflow: "auto",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void handleSend();
                }
                if (e.key === "/" && !draft) { e.preventDefault(); setSearchActive(true); }
              }}
            />
          </div>
          {/* Send — enabled for admin, client (private thread), and talent (group thread). */}
          <button
            type="button"
            disabled={!draft.trim() || sending}
            aria-label="Send message"
            onClick={() => void handleSend()}
            style={{
              width: 32, height: 32, borderRadius: "50%", border: "none",
              cursor: draft.trim() && !sending ? "pointer" : "not-allowed",
              background: draft.trim() && !sending ? COLORS.fill : "rgba(11,11,13,0.10)",
              color: draft.trim() && !sending ? "#fff" : COLORS.inkDim,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              transition: `background ${TRANSITION.sm}, color ${TRANSITION.sm}`,
              opacity: sending ? 0.6 : 1,
            }}
          >
            {sending ? (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ animation: "spin 0.8s linear infinite" }}>
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="14" strokeDashoffset="4" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M12.5 7H1.5M12.5 7L8 2.5M12.5 7L8 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        </div>
        {/* Error / context hint */}
        {sendError ? (
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5, fontFamily: FONTS.body, fontSize: 10 }} className="text-admin-coral">
            ⚠ {sendError}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5, fontFamily: FONTS.body, fontSize: 10 }} className="text-admin-ink-dim">
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: THREAD_ACCENT[active], display: "inline-block", flexShrink: 0 }} />
            <span>{active === "private" ? "Client thread" : "Talent group"} · {active === "private" ? "visible to client + coordinator" : "visible to coordinator + booked talent"}</span>
            {draft.length > 0 && <><span>·</span><span>⌘↵ to send</span></>}
          </div>
        )}
      </div>}
    </section>
  );
}

// WS-1.G.1 — highlight matching text within a bubble body
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: "rgba(217,119,6,0.30)", color: "inherit", borderRadius: 2, padding: "0 1px" }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function MessageBubble({
  message,
  pov,
  searchQuery = "",
}: {
  message: ThreadMessage;
  pov: InquiryWorkspacePov;
  searchQuery?: string;
}) {
  const isYou = Boolean(message.isYou);
  // T7: Coordinator messages get a distinct visual treatment in group thread
  const isCoordinator = message.senderRole === "coordinator" || message.senderRole === "admin";
  const isSystem = message.senderRole === "system";

  if (isSystem) {
    return (
      <div style={{ textAlign: "center", fontFamily: FONTS.body, fontSize: 11.5, padding: "4px 0" }} className="text-admin-ink-dim">
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
        <div style={{ display: "flex", gap: 6, alignItems: "center", fontFamily: FONTS.body, fontSize: 11.5, flexDirection: isYou ? "row-reverse" : "row" }} className="text-admin-ink-muted">
          <span style={{ fontWeight: 500 }} className="text-admin-ink">
            {isYou ? "You" : message.senderName}
          </span>
          {/* T7: Coordinator chip — clearly labels who has authority in the thread */}
          {isCoordinator && !isYou && pov === "talent" && (
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", background: "rgba(82,96,109,0.12)", padding: "2px 6px", borderRadius: 4 }} className="text-admin-amber-deep">
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
          {/* WS-1.G.1 — highlight search match */}
          <HighlightedText text={message.body} query={searchQuery} />
        </div>
      </div>
    </div>
  );
}

// ─── WS-10.3 — Workspace files panel ──────────────────────────────
//
// A dedicated "Files" tab inside the messaging panel that surfaces
// every attachment shared across all threads of this inquiry, with
// filter-by-type and per-file actions (preview / download).

type WorkspaceFileEntry = Attachment & {
  thread: "private" | "group";
  senderName: string;
  date: string;
  /** WS-10.5 — version history. Files sharing the same versionGroup are revisions of each other. */
  versionGroup?: string;
  /** 1 = oldest, higher = newer. Latest = highest number in the group. */
  version?: number;
};

// WS-10.5 — contract draft is versioned; v2 supersedes v1 (same group "contract-draft")
const WORKSPACE_MOCK_FILES: WorkspaceFileEntry[] = [
  { id: "f1",  name: "call-sheet-apr29.pdf",        kind: "pdf",   size: "120 KB", thread: "private", senderName: "Martina H.",    date: "Apr 25" },
  { id: "f2",  name: "valentino-ss26-brief.pdf",     kind: "pdf",   size: "2.4 MB", thread: "private", senderName: "Valentino CD",  date: "Apr 23" },
  { id: "f3",  name: "sofia-composite.jpg",          kind: "image", size: "880 KB", thread: "group",   senderName: "Martina H.",    date: "Apr 24" },
  { id: "f4",  name: "lena-composite.jpg",           kind: "image", size: "760 KB", thread: "group",   senderName: "Martina H.",    date: "Apr 24" },
  { id: "f5",  name: "contract-draft-v1.pdf",        kind: "pdf",   size: "95 KB",  thread: "private", senderName: "Martina H.",    date: "Apr 26", versionGroup: "contract-draft", version: 1 },
  { id: "f6",  name: "contract-draft-v2.pdf",        kind: "pdf",   size: "97 KB",  thread: "private", senderName: "Valentino CD",  date: "Apr 27", versionGroup: "contract-draft", version: 2 },
  { id: "f7",  name: "mood-board-paris.jpg",         kind: "image", size: "3.1 MB", thread: "private", senderName: "Valentino CD",  date: "Apr 23" },
  { id: "f8",  name: "on-set-contact-list.pdf",      kind: "pdf",   size: "48 KB",  thread: "group",   senderName: "Martina H.",    date: "Apr 27" },
];

const WORKSPACE_FILES_COUNT = WORKSPACE_MOCK_FILES.length;

type FilesFilter = "all" | "pdf" | "image" | "other";

function WorkspaceFilesPanel({
  pov,
}: {
  pov: InquiryWorkspacePov;
}) {
  const [filter, setFilter] = useState<FilesFilter>("all");
  // WS-10.5 — track which version groups are expanded
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (g: string) =>
    setExpandedGroups((s) => {
      const next = new Set(s);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  const rawFiltered = WORKSPACE_MOCK_FILES.filter((f) => {
    if (pov === "client" && f.thread !== "private") return false;
    if (pov === "talent" && f.thread !== "group")   return false;
    if (filter === "pdf")   return f.kind === "pdf";
    if (filter === "image") return f.kind === "image";
    if (filter === "other") return f.kind !== "pdf" && f.kind !== "image";
    return true;
  });

  // WS-10.5 — De-duplicate versioned files: only the latest version of each group
  // appears in the list by default; the full history is shown when expanded.
  const versionGroups = new Map<string, WorkspaceFileEntry[]>();
  for (const f of rawFiltered) {
    if (f.versionGroup) {
      const group = versionGroups.get(f.versionGroup) ?? [];
      group.push(f);
      versionGroups.set(f.versionGroup, group);
    }
  }
  // Sort each group so highest version is last (= latest)
  versionGroups.forEach((group) => group.sort((a, b) => (a.version ?? 0) - (b.version ?? 0)));

  const filtered = rawFiltered.filter((f) => {
    if (!f.versionGroup) return true; // unversioned — always show
    const group = versionGroups.get(f.versionGroup)!;
    const latest = group[group.length - 1];
    return f.id === latest.id; // only show latest in default view
  });

  const FILTER_OPTIONS: { key: FilesFilter; label: string }[] = [
    { key: "all",   label: "All files" },
    { key: "pdf",   label: "PDFs" },
    { key: "image", label: "Images" },
    { key: "other", label: "Other" },
  ];

  const THREAD_LABEL: Record<"private" | "group", string> = {
    private: pov === "admin" ? "Client thread" : "With coordinator",
    group:   pov === "admin" ? "Talent group"  : "Booking team",
  };
  const THREAD_COLOR: Record<"private" | "group", string> = {
    private: "rgba(79,70,229,0.7)",
    group:   "rgba(217,119,6,0.7)",
  };
  const FILE_ICON: Record<string, string> = {
    pdf: "📄", image: "🖼", video: "🎬", audio: "🎵", file: "📎",
  };

  return (
    <div
      data-tulala-workspace-files
      style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}
    >
      {/* ── Header bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          borderBottom: `1px solid ${COLORS.borderSoft}`,
          background: "#fff",
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        {/* Filter pills */}
        <div style={{ display: "flex", gap: 4, flex: 1, flexWrap: "wrap" }}>
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setFilter(opt.key)}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                border: filter === opt.key ? `1.5px solid ${COLORS.accent}` : `1px solid ${COLORS.border}`,
                background: filter === opt.key ? `rgba(31,92,66,0.08)` : "transparent",
                color: filter === opt.key ? COLORS.accent : COLORS.inkMuted,
                fontFamily: FONTS.body,
                fontSize: 11.5,
                fontWeight: filter === opt.key ? 600 : 500,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {opt.label}
              {opt.key === "all" && (
                <span style={{ marginLeft: 5, opacity: 0.6 }}>{WORKSPACE_MOCK_FILES.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── File list ── */}
      {filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon="plus"
            title={`No ${filter === "all" ? "" : filter + " "}files shared yet`}
            body="Attachments sent in this thread will appear here."
            compact
          />
        </div>
      ) : (
        <div className="flex flex-col">
          {filtered.map((file) => {
            const vGroup = file.versionGroup
              ? versionGroups.get(file.versionGroup)!
              : null;
            const isGroupExpanded = file.versionGroup ? expandedGroups.has(file.versionGroup) : false;
            const olderVersions = vGroup ? vGroup.slice(0, vGroup.length - 1) : [];

            return (
              <div key={file.id}>
                {/* ── Primary file row ── */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${COLORS.borderSoft}`, background: "#fff", transition: `background ${TRANSITION.micro}`, }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surfaceAlt)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                >
                  {/* File icon */}
                  <span
                    style={{
                      fontSize: 22, flexShrink: 0, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }} className="bg-admin-surface-alt">
                    {FILE_ICON[file.kind] ?? "📎"}
                  </span>

                  {/* File meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <div style={{ fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} className="text-admin-ink">
                        {/* For versioned files, show display name without version suffix */}
                        {file.versionGroup
                          ? file.name.replace(/-v\d+(\.[^.]+)$/, "$1")
                          : file.name}
                      </div>
                      {/* WS-10.5 — "v2" current-version badge */}
                      {file.version !== undefined && (
                        <span style={{ padding: "1px 5px", borderRadius: 4, background: "rgba(31,92,66,0.1)", fontFamily: FONTS.body, fontSize: 10, fontWeight: 700, flexShrink: 0 }} className="text-admin-accent">
                          v{file.version}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2, fontFamily: FONTS.body, fontSize: 11, flexWrap: "wrap" }} className="text-admin-ink-muted">
                      <span>{file.size}</span>
                      <span style={{ opacity: 0.4 }}>·</span>
                      <span>{file.senderName}</span>
                      <span style={{ opacity: 0.4 }}>·</span>
                      <span>{file.date}</span>
                      {pov === "admin" && (
                        <>
                          <span style={{ opacity: 0.4 }}>·</span>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 3,
                              padding: "1px 6px",
                              borderRadius: 4,
                              background: `${THREAD_COLOR[file.thread]}18`,
                              color: THREAD_COLOR[file.thread],
                              fontSize: 10,
                              fontWeight: 600,
                            }}
                          >
                            {THREAD_LABEL[file.thread]}
                          </span>
                        </>
                      )}
                      {/* WS-10.5 — version history toggle */}
                      {olderVersions.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleGroup(file.versionGroup!)}
                          style={{
                            background: "rgba(11,11,13,0.06)",
                            border: "none",
                            cursor: "pointer",
                            padding: "1px 6px",
                            borderRadius: 4,
                            color: COLORS.inkMuted,
                            fontFamily: FONTS.body,
                            fontSize: 10,
                            fontWeight: 600,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 3,
                          }}
                        >
                          {isGroupExpanded ? "▲" : "▼"} {olderVersions.length} older version{olderVersions.length > 1 ? "s" : ""}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* WS-10.5 — Version history sub-list */}
                {isGroupExpanded && olderVersions.map((oldFile) => (
                  <div
                    key={oldFile.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 14px 8px 56px",
                      borderBottom: `1px solid ${COLORS.borderSoft}`,
                      background: "rgba(11,11,13,0.02)",
                    }}
                  >
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{FILE_ICON[oldFile.kind] ?? "📎"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span style={{ fontFamily: FONTS.body, fontSize: 11.5, fontWeight: 500 }} className="text-admin-ink-muted">
                          {oldFile.name}
                        </span>
                        <span style={{ padding: "1px 5px", borderRadius: 4, background: "rgba(11,11,13,0.06)", fontFamily: FONTS.body, fontSize: 10, fontWeight: 600 }} className="text-admin-ink-muted">
                          v{oldFile.version}
                        </span>
                      </div>
                      <div style={{ fontFamily: FONTS.body, fontSize: 10.5, marginTop: 1 }} className="text-admin-ink-dim">
                        {oldFile.size} · {oldFile.senderName} · {oldFile.date}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Rail (right side) ─────────────────────────────────────────────

function Rail({ inquiry, pov }: { inquiry: RichInquiry; pov: InquiryWorkspacePov }) {
  const [tab, setTab] = useState<"details" | "activity">("details");

  return (
    <aside
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: `1px solid ${COLORS.borderSoft}`, flexShrink: 0 }}>
        {(["details", "activity"] as const).map(t => {
          const isActive = tab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                padding: "11px 0",
                fontFamily: FONTS.body,
                fontSize: 13,
                fontWeight: isActive ? 650 : 500,
                color: isActive ? COLORS.ink : COLORS.inkMuted,
                cursor: "pointer",
                borderBottom: isActive ? `2px solid ${COLORS.ink}` : "2px solid transparent",
                marginBottom: -1,
                textTransform: "capitalize",
                transition: `color ${TRANSITION.micro}`,
              }}
            >
              {t}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 16px" }}>
        {tab === "details" && (
          <div className="flex flex-col gap-2.5">
            {pov === "admin" && <ViewingNowBadge inquiry={inquiry} />}
            <SummaryPanel inquiry={inquiry} />
            {pov === "admin" && <CoordinatorPanel inquiry={inquiry} />}
            <RequirementGroupsPanel inquiry={inquiry} />
            <OfferPanel inquiry={inquiry} pov={pov} />
            {(inquiry.bookingId || inquiry.stage === "approved") && (
              <BookingPanel inquiry={inquiry} />
            )}
            <PaymentPanel inquiry={inquiry} pov={pov} />
          </div>
        )}
        {tab === "activity" && (
          <ActivityPanel inquiry={inquiry} />
        )}
      </div>
    </aside>
  );
}

// WS-1.D.3 — Viewing-now badge. In production this will be driven by a
// Presence WebSocket channel keyed on inquiry id. For now we
// mock a single viewer derived from the coordinator assignment.
function ViewingNowBadge({ inquiry }: { inquiry: RichInquiry }) {
  if (!inquiry.coordinator) return null;
  return (
    <div
      data-tulala-viewing-now
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 12px",
        background: "rgba(46,125,91,0.06)",
        border: "1px solid rgba(46,125,91,0.18)",
        borderRadius: 10,
        fontFamily: FONTS.body,
        fontSize: 11.5,
        color: COLORS.successDeep,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, boxShadow: "0 0 0 2px rgba(46,125,91,0.25)", }}
      />
      <Avatar initials={inquiry.coordinator.initials} size={18} tone="ink" />
      <span className="font-medium">{inquiry.coordinator.name}</span>
      <span style={{ color: COLORS.green, fontWeight: 400 }} className="bg-admin-green">viewing now</span>
    </div>
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
      <span style={{ fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", minWidth: 64, flexShrink: 0 }} className="text-admin-ink-muted">
        {label}
      </span>
      <span style={{ fontFamily: mono ? FONTS.mono : FONTS.body, fontSize: mono ? 11.5 : 13 }} className="text-admin-ink">
        {value}
      </span>
    </div>
  );
}

function CoordinatorPanel({ inquiry }: { inquiry: RichInquiry }) {
  return (
    <RailCard title="Coordinator">
      {inquiry.coordinator ? (
        <div className="flex items-center gap-2.5">
          <Avatar initials={inquiry.coordinator.initials} size={32} tone="ink" />
          <div className="flex-1 min-w-0">
            <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 500 }} className="text-admin-ink">
              {inquiry.coordinator.name}
            </div>
            <div style={{ fontFamily: FONTS.body, fontSize: 11.5, marginTop: 1 }} className="text-admin-ink-muted">
              {inquiry.coordinator.acceptedAt
                ? `Accepted ${inquiry.coordinator.acceptedAt}`
                : "Awaiting accept"}
            </div>
          </div>
          {inquiry.coordinator.isPrimary && (
            <span style={{ padding: "2px 7px", background: "rgba(11,11,13,0.05)", fontSize: 10, fontWeight: 600, borderRadius: 999, fontFamily: FONTS.body, letterSpacing: 0.4, textTransform: "uppercase" }} className="text-admin-ink">
              Primary
            </span>
          )}
        </div>
      ) : (
        <div style={{ fontFamily: FONTS.body, fontSize: 12.5 }} className="text-admin-ink-muted">
          No coordinator assigned.
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
            <div style={{ fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }} className="text-admin-ink-muted">
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
                  <div style={{ fontFamily: FONTS.body, fontSize: 10.5, marginBottom: 2 }} className="text-admin-ink-muted">
                    {s.label}
                  </div>
                  <div
                    style={{
                      fontFamily: FONTS.body,
                      fontSize: 15,
                      fontWeight: 600,
                      color:
                        s.label === "Cancellations" && rel.cancellations > 0
                          ? COLORS.red
                          : s.label === "On time" && rel.onTimeRate === 100
                            ? COLORS.green
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

function RequirementGroupsPanel({ inquiry }: { inquiry: RichInquiry }) {
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
            <span className="text-admin-ink text-admin-12h font-medium">
              {REQUIREMENT_ROLE_META[g.role].pluralLabel}
            </span>
            <span className="text-admin-ink-muted text-admin-11h">
              {g.approved}/{g.needed} approved
            </span>
          </div>
          {/* progress */}
          <div style={{ height: 4, background: "rgba(11,11,13,0.06)", borderRadius: 999, overflow: "hidden", marginBottom: 8 }}>
            <div
              style={{
                '--progress-w': `${g.needed === 0 ? 0 : Math.round((g.approved / g.needed) * 100)}%`,
                '--progress-bg': g.approved >= g.needed ? COLORS.green : COLORS.fill,
              }}
              className="w-[var(--progress-w)] h-full bg-[var(--progress-bg)]"
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {g.talents.map((t, ti) => (
              <div
                key={ti}
                title={`${t.name} · ${t.status}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 8px",
                  background:
                    t.status === "accepted"
                      ? "rgba(46,125,91,0.07)"
                      : t.status === "declined"
                        ? "rgba(176,48,58,0.06)"
                        : "rgba(11,11,13,0.03)",
                  borderRadius: 8,
                  fontFamily: FONTS.body,
                  border: `1px solid ${
                    t.status === "accepted" ? "rgba(46,125,91,0.18)"
                    : t.status === "declined" ? "rgba(176,48,58,0.14)"
                    : COLORS.borderSoft
                  }`,
                }}
              >
                {t.thumb?.startsWith("http") ? (
                  <span style={{ width: 22, height: 22, borderRadius: "50%", background: `url(${t.thumb}) center/cover`, flexShrink: 0 }} />
                ) : (
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{t.thumb}</span>
                )}
                <div className="flex-1 min-w-0">
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: t.status === "accepted" ? COLORS.successDeep : t.status === "declined" ? "#7A2026" : COLORS.ink,
                    }}
                  >
                    {t.name}
                  </div>
                  {/* WS-1.F.2 — last-said snippet */}
                  {t.lastSaidSnippet && (
                    <div style={{ fontSize: 10.5, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="text-admin-ink-muted">
                      <span className="text-admin-ink-dim">{t.lastSaidTs} — </span>
                      &ldquo;{t.lastSaidSnippet}&rdquo;
                    </div>
                  )}
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: 0.3,
                    textTransform: "uppercase",
                    color: t.status === "accepted" ? COLORS.successDeep : t.status === "declined" ? "#7A2026" : COLORS.inkMuted,
                    flexShrink: 0,
                  }}
                >
                  {t.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </RailCard>
  );
}

function OfferPanel({ inquiry, pov }: { inquiry: RichInquiry; pov: InquiryWorkspacePov }) {
  if (!inquiry.offer) {
    return (
      <RailCard title="Offer">
        <div style={{ fontFamily: FONTS.body, fontSize: 12.5 }} className="text-admin-ink-muted">
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
        <span style={{ fontFamily: FONTS.body, fontSize: 11.5 }} className="text-admin-ink-muted">
          {inquiry.offer.sentAt ? `sent ${inquiry.offer.sentAt}` : "draft"}
        </span>
      }
    >
      <OfferInner offer={inquiry.offer} pov={pov} />
    </RailCard>
  );
}

function OfferInner({ offer, pov }: { offer: Offer; pov: InquiryWorkspacePov }) {
  const { openDrawer, state } = useAdminShell();
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
        <span style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 500, letterSpacing: -0.3 }} className="text-admin-ink">
          {offer.total}
        </span>
        <ApprovalChip status={offer.clientApproval} who="Client" />
      </div>

      {/* WS-18.3 — AI anomaly detection: compare offer total vs past history */}
      {pov === "admin" && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "8px 10px", marginBottom: 10 }} className="bg-admin-royal-soft rounded-admin-sm">
          <span style={{ flexShrink: 0, marginTop: 2, lineHeight: 0 }}>
            <Icon name="sparkle" size={12} color={COLORS.royal} stroke={1.7} />
          </span>
          {(() => {
            const totalNum = parseFloat(offer.total.replace(/[€,\s]/g, ""));
            const msg = totalNum > 9000
              ? `${offer.total} is above your typical range for this client — worth a quick check before sending.`
              : totalNum < 3000
                ? `${offer.total} is on the low end vs your last 3 bookings with this client.`
                : `${offer.total} is within your usual range for this client type.`;
            return (
              <div style={{ fontFamily: FONTS.body, fontSize: 11.5, lineHeight: 1.45 }} className="text-admin-royal-deep">
                {msg}
              </div>
            );
          })()}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {offer.lineItems.map((li, i) => {
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
              {li.thumb?.startsWith("http") ? (
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: `url(${li.thumb}) center/cover`, flexShrink: 0 }} />
              ) : (
                <span className="text-sm">{li.thumb}</span>
              )}
              <span style={{ flex: 1 }} className="text-admin-ink">{li.talentName}</span>
              <span style={{ fontWeight: 500 }} className="text-admin-ink">{li.fee}</span>
              <ApprovalChip status={li.status} compact />
            </div>
          );
        })}
      </div>

      {/* C19 — Version history trail */}
      {offer.history && offer.history.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.borderSoft}` }}>
          <div style={{ fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }} className="text-admin-ink-muted">
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
                <span style={{ fontWeight: 700, fontSize: 10.5, letterSpacing: 0.3, flexShrink: 0 }} className="text-admin-ink-dim">
                  v{h.version}
                </span>
                <span style={{ fontWeight: 600, flexShrink: 0 }} className="text-admin-ink">{h.total}</span>
                <span style={{ flex: 1, fontSize: 11.5 }}>{h.note}</span>
                <span style={{ flexShrink: 0, fontSize: 11 }} className="text-admin-ink-dim">{h.sentAt}</span>
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
              <span style={{ fontWeight: 700, fontSize: 10.5, letterSpacing: 0.3, flexShrink: 0 }} className="text-admin-ink">
                v{offer.version} ←
              </span>
              <span style={{ fontWeight: 600, flexShrink: 0 }} className="text-admin-ink">{offer.total}</span>
              <span style={{ flex: 1, fontSize: 11.5 }} className="text-admin-ink-muted">current</span>
              <span style={{ flexShrink: 0, fontSize: 11 }} className="text-admin-ink-dim">{offer.sentAt ?? "draft"}</span>
            </div>
          </div>
        </div>
      )}

      {/* Per-POV CTAs */}
      {pov === "client" && offer.clientApproval === "pending" && (
        <div style={{ marginTop: 12, fontFamily: FONTS.body, fontSize: 11.5, lineHeight: 1.45 }} className="text-admin-ink-muted">
          Review the offer here; your coordinator will confirm the final decision in the thread.
        </div>
      )}
      {pov === "talent" && offer.lineItems.some((l) => l.status === "pending") && (
        <div style={{ marginTop: 12, fontFamily: FONTS.body, fontSize: 11.5, lineHeight: 1.45 }} className="text-admin-ink-muted">
          Your line-item status is visible here; response actions will live in the thread.
        </div>
      )}
      {pov === "admin" && (
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
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
  const color = tone === "green" ? COLORS.successDeep : tone === "red" ? "#7A2026" : tone === "dim" ? COLORS.inkMuted : COLORS.amberDeep;
  const bg =
    tone === "green"
      ? COLORS.successSoft
      : tone === "red"
        ? COLORS.criticalSoft
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

// WS-12.3 — Dual timezone display helpers
//
// In production these will be derived from:
//   - The workspace's default timezone (agency location)
//   - The booking location's timezone (auto-resolved from location string + geocoding)
//   - The talent's profile timezone
// For now we hard-code two example zones to show the UX.
//
const WORKSPACE_TZ = "Europe/Lisbon";     // agency local time
const BOOKING_TZ   = "Europe/Paris";      // shoot location

function DualTimeBadge({
  localLabel,
  remoteLabel,
}: {
  localLabel: string;  // e.g. "09:00 LIS"
  remoteLabel: string; // e.g. "10:00 PAR"
}) {
  return (
    <div
      data-tulala-tz-badge
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px",
        borderRadius: 7,
        background: "rgba(79,70,229,0.06)",
        border: "1px solid rgba(79,70,229,0.14)",
        fontFamily: FONTS.body,
        fontSize: 11,
      }}
    >
      <Icon name="map-pin" size={10} color="rgba(79,70,229,0.7)" stroke={1.8} />
      <span style={{ fontWeight: 600, color: "rgba(79,70,229,0.85)" }}>{localLabel}</span>
      <span className="text-admin-ink-dim">·</span>
      <span className="text-admin-ink-muted">{remoteLabel}</span>
      <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase" }} className="text-admin-ink-dim">
        (LOCATION)
      </span>
    </div>
  );
}

function BookingPanel({ inquiry }: { inquiry: RichInquiry }) {
  const { effectiveTenant } = useAdminShell();
  const tenantSlug = effectiveTenant.slug;

  if (inquiry.bookingId) {
    // Only link if bookingId looks like a real UUID (not a prototype "BK-xxx" slug).
    const isRealId = /^[0-9a-f-]{36}$/.test(inquiry.bookingId);
    const bookingHref = isRealId
      ? `/${tenantSlug}/admin/bookings/${inquiry.bookingId}`
      : null;

    return (
      <RailCard
        title="Booking"
        action={
          bookingHref ? (
            <a
              href={bookingHref}
              style={{
                fontFamily: FONTS.body, fontSize: 11, fontWeight: 600,
                color: COLORS.accent, textDecoration: "none",
              }}
            >
              View →
            </a>
          ) : undefined
        }
      >
        <KvCompact label="ID" value={inquiry.bookingId} mono />
        <KvCompact label="Date" value={inquiry.date ?? "TBC"} />
        <KvCompact label="Location" value={inquiry.location ?? "TBC"} />
      </RailCard>
    );
  }
  return (
    <RailCard title="Convert to booking">
      <div style={{ fontFamily: FONTS.body, fontSize: 12.5, lineHeight: 1.5 }} className="text-admin-ink-muted">
        All parties have approved. Convert to a booking to lock the dates, generate the contract, and notify the talent.
      </div>
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
  const { openDrawer } = useAdminShell();
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
      <div className="mb-2.5">
        <PaymentStatusChip status={summary.status} />
      </div>
      <KvCompact label="Total" value={summary.total} />
      <KvCompact label="Fee" value={`${summary.platformFee} on ${summary.pricedOnPlan}`} />
      <KvCompact label="Net" value={summary.netPayout} />
      <Divider />
      <div className="mt-2.5">
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
            <div className="flex-1 min-w-0">
              <div style={{ fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600 }} className="text-admin-ink">
                {receiver.displayName}
              </div>
              <div style={{ fontFamily: FONTS.body, fontSize: 11, marginTop: 1 }} className="text-admin-ink-muted">
                {PAYOUT_RECEIVER_KIND_LABEL[receiver.kind]}
              </div>
            </div>
            <PayoutStatusChip status={receiver.status} />
          </div>
        ) : (
          <div style={{ padding: "10px 0 4px", fontFamily: FONTS.body, fontSize: 12, lineHeight: 1.5 }} className="text-admin-ink-muted">
            No receiver set yet. Payment cannot be requested until one is selected.
          </div>
        )}
        {canPick && (
          <div className="mt-2">
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
        <div style={{ marginTop: 10, padding: "8px 10px", background: "rgba(11,11,13,0.03)", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 8, fontFamily: FONTS.body, fontSize: 11.5, lineHeight: 1.5 }} className="text-admin-ink-muted">
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
  type FeedEvent = { actor: string; action: string; target: string; timestamp: string; iconName: "bolt" | "check" | "mail" | "user" };
  const events: FeedEvent[] = [
    inquiry.bookingId
      ? { actor: "System",      action: "created booking",         target: inquiry.bookingId,                           timestamp: "Today",                         iconName: "bolt"     }
      : null,
    inquiry.offer && inquiry.offer.clientApproval === "accepted"
      ? { actor: "Client",      action: "approved",                target: `offer v${inquiry.offer.version}`,           timestamp: "Today",                         iconName: "check"    }
      : null,
    inquiry.offer
      ? { actor: "Coordinator", action: "sent",                    target: `offer v${inquiry.offer.version}`,           timestamp: inquiry.offer.sentAt ?? "—",     iconName: "mail"     }
      : null,
    inquiry.coordinator
      ? { actor: inquiry.coordinator.name, action: "accepted as coordinator", target: "",                               timestamp: inquiry.coordinator.acceptedAt ?? "—", iconName: "user" }
      : null,
    { actor: "Client", action: "submitted inquiry", target: "", timestamp: `${inquiry.ageDays}d ago`, iconName: "bolt" },
  ].filter(Boolean) as FeedEvent[];

  return (
    <RailCard title="Activity">
      <div className="flex flex-col">
        {events.slice(0, 5).map((e, i) => (
          <div key={i} style={{ borderTop: i > 0 ? `1px solid ${COLORS.borderSoft}` : "none" }}>
            <ActivityFeedItem
              actor={e.actor}
              action={e.action}
              target={e.target}
              timestamp={e.timestamp}
              iconName={e.iconName}
            />
          </div>
        ))}
      </div>
    </RailCard>
  );
}


// ─── WS-7.4 / 7.5 Keyboard shortcut layer + help overlay ─────────────────────
//
// `useKeyboardLayer` registers global keyboard shortcuts for the workspace.
//   j / k          → next / prev row in the active list
//   e              → archive selected
//   r              → reply (open private thread)
//   c              → compose (new inquiry)
//   g then i       → go to Messages
//   g then c       → go to Calendar
//   g then t       → go to Roster
//   g then o       → go to Overview
//   Cmd/Ctrl-K     → open Command Palette
//   ?              → toggle shortcut cheatsheet
//
// Usage: call `useKeyboardLayer(handlers)` in the workspace shell.
// ─────────────────────────────────────────────────────────────────────────────

export type KeyboardLayerHandlers = {
  onOpenPalette:  () => void;
  onOpenHelp:     () => void;
  onNavigate:     (page: WorkspacePage) => void;
  onCompose?:     () => void;
  /** Whether a drawer or modal is currently open (suppresses shortcuts). */
  isModalOpen:    boolean;
};

export function useKeyboardLayer({
  onOpenPalette,
  onOpenHelp,
  onNavigate,
  onCompose,
  isModalOpen,
}: KeyboardLayerHandlers) {
  const gPending = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // Cmd/Ctrl-K always works (even in inputs)
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenPalette();
        gPending.current = false;
        return;
      }

      // All other shortcuts suppressed when typing or modal open
      if (inInput || isModalOpen) { gPending.current = false; return; }

      // G-prefixed navigation shortcuts
      if (gPending.current) {
        gPending.current = false;
        e.preventDefault();
        const map: Record<string, WorkspacePage> = {
          i: "messages", o: "overview", c: "calendar", t: "roster",
        };
        if (map[e.key]) onNavigate(map[e.key] as WorkspacePage);
        return;
      }

      if (e.key === "g") { gPending.current = true; return; }
      if (e.key === "?") { onOpenHelp(); return; }
      if (e.key === "c" && onCompose) { onCompose(); return; }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      // Cancel pending G if any non-eligible key is pressed
      if (e.key !== "g") gPending.current = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup",   onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup",   onKeyUp);
    };
  }, [onOpenPalette, onOpenHelp, onNavigate, onCompose, isModalOpen]);
}

// ─── WS-7.5 Keyboard shortcut help overlay ───────────────────────────────────

const SHORTCUT_GROUPS = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["G", "O"],    label: "Go to Overview" },
      { keys: ["G", "I"],    label: "Go to Messages" },
      { keys: ["G", "C"],    label: "Go to Calendar" },
      { keys: ["G", "T"],    label: "Go to Roster" },
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      { keys: ["C"],         label: "New inquiry (compose)" },
      { keys: ["⌘", "K"],   label: "Command palette" },
      { keys: ["?"],         label: "Keyboard shortcuts" },
    ],
  },
  // Only shortcuts that actually work are listed — an advertised-but-dead
  // shortcut is a broken promise. E (archive) / R (reply) / "/" / Tab were
  // listed here before they existed; re-add each one WITH its implementation.
  {
    title: "List navigation (Messages)",
    shortcuts: [
      { keys: ["J"],         label: "Focus next thread" },
      { keys: ["K"],         label: "Focus previous thread" },
      { keys: ["⏎"],        label: "Open focused thread" },
    ],
  },
];

export function ShortcutHelpOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "?") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      data-tulala-shortcut-overlay="overlay"
      style={{
        position:   "fixed",
        inset:      0,
        zIndex:     1200,
        background: "rgba(0,0,0,0.5)",
        display:    "flex",
        alignItems: "center",
        justifyContent: "center",
        padding:    16,
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ border:       `1px solid ${COLORS.border}`, boxShadow:    "0 20px 60px rgba(0,0,0,0.2)", width:        560, maxWidth:     "100%", maxHeight:    "80vh", overflow:     "auto", padding:      "20px 0" }} className="bg-admin-surface rounded-admin-xl">
        {/* Header */}
        <div style={{
          display:     "flex",
          alignItems:  "center",
          justifyContent: "space-between",
          padding:     "0 20px 16px",
          borderBottom: `1px solid ${COLORS.border}`,
          marginBottom: 12,
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, fontFamily: FONTS.body }} className="text-admin-ink">
            Keyboard shortcuts
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: COLORS.inkMuted, fontSize: 18, lineHeight: 1,
              padding: "2px 4px", borderRadius: RADIUS.sm,
            }}
          >
            ×
          </button>
        </div>

        {/* Shortcut groups */}
        <div style={{
          display:             "grid",
          gridTemplateColumns: "1fr 1fr",
          gap:                 "20px 0",
          padding:             "0 20px",
        }}>
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <div style={{ fontSize:      10, fontWeight:    700, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily:    FONTS.body, marginBottom:  8 }} className="text-admin-ink-dim">
                {group.title}
              </div>
              <div className="flex flex-col gap-1">
                {group.shortcuts.map((sc, i) => (
                  <div key={i} style={{
                    display:     "flex",
                    alignItems:  "center",
                    justifyContent: "space-between",
                    gap:         8,
                  }}>
                    <span style={{ fontSize: 12, fontFamily: FONTS.body }} className="text-admin-ink-muted">
                      {sc.label}
                    </span>
                    <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                      {sc.keys.map((k, ki) => (
                        <kbd key={ki} style={{
                          fontSize:     10,
                          color:        COLORS.ink,
                          background:   COLORS.surfaceAlt,
                          border:       `1px solid ${COLORS.border}`,
                          borderRadius: 4,
                          padding:      "2px 6px",
                          fontFamily:   FONTS.mono,
                          minWidth:     22,
                          textAlign:    "center",
                        }}>
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div style={{ marginTop:   16, padding:     "12px 20px 0", borderTop:   `1px solid ${COLORS.border}`, fontSize:    11, fontFamily:  FONTS.body, textAlign:   "center" }} className="text-admin-ink-muted">
          Press <kbd style={{ fontSize: 10, padding: "1px 5px", background: COLORS.surfaceAlt, border: `1px solid ${COLORS.border}`, borderRadius: 3 }}>?</kbd> or <kbd style={{ fontSize: 10, padding: "1px 5px", background: COLORS.surfaceAlt, border: `1px solid ${COLORS.border}`, borderRadius: 3 }}>esc</kbd> to close
        </div>
      </div>
    </div>
  );
}

// ─── WS-7.6 BulkActionBar ────────────────────────────────────────────────────
//
// Appears at the bottom of the screen when 2+ rows are selected.
// Actions: Archive, Assign, Export, Clear selection.
//
// Usage:
//   <BulkActionBar
//     count={selectedIds.size}
//     onArchive={handleBulkArchive}
//     onAssign={handleBulkAssign}
//     onExport={handleBulkExport}
//     onClear={() => setSelectedIds(new Set())}
//   />
// ─────────────────────────────────────────────────────────────────────────────

export function BulkActionBar({
  count,
  onArchive,
  onAssign,
  onExport,
  onClear,
}: {
  count:      number;
  onArchive?: () => void;
  onAssign?:  () => void;
  onExport?:  () => void;
  onClear?:   () => void;
}) {
  if (count < 2) return null;

  const BTN: React.CSSProperties = {
    display:      "inline-flex",
    alignItems:   "center",
    gap:          6,
    padding:      "6px 14px",
    borderRadius: RADIUS.md,
    border:       "none",
    fontFamily:   FONTS.body,
    fontSize:     13,
    fontWeight:   600,
    cursor:       "pointer",
    background:   "rgba(255,255,255,0.15)",
    color:        "#fff",
    transition:   `background ${TRANSITION.micro}`,
  };

  return (
    <div
      data-tulala-bulk-action-bar
      style={{
        position:    "fixed",
        bottom:      20,
        left:        "50%",
        transform:   "translateX(-50%)",
        zIndex:      900,
        background:  COLORS.fill,
        color:       "#fff",
        borderRadius: RADIUS.xl,
        boxShadow:   "0 12px 40px rgba(0,0,0,0.35)",
        padding:     "10px 16px",
        display:     "flex",
        alignItems:  "center",
        gap:         8,
        animation:   "tulalaBulkBarIn .2s ease",
        fontFamily:  FONTS.body,
        fontSize:    13,
        minWidth:    340,
      }}
    >
      <style>{`@keyframes tulalaBulkBarIn { from { transform: translateX(-50%) translateY(12px); opacity: 0; } to { transform: translateX(-50%) translateY(0); opacity: 1; } }`}</style>
      <span style={{ fontWeight: 700, marginRight: 4 }}>{count} selected</span>
      {onArchive && <button type="button" style={BTN} onClick={onArchive}>Archive</button>}
      {onAssign  && <button type="button" style={BTN} onClick={onAssign}>Assign</button>}
      {onExport  && <button type="button" style={BTN} onClick={onExport}>Export</button>}
      <div style={{ flex: 1 }} />
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selection"
        style={{
          background: "transparent", border: "none", cursor: "pointer",
          color: "rgba(255,255,255,0.7)", fontSize: 16, padding: "2px 4px",
        }}
      >
        ×
      </button>
    </div>
  );
}

// ─── Helpers exported for surfaces ────────────────────────────────────

export function inquiryStageLabel(stage: RichInquiry["stage"]): string {
  return INQUIRY_STAGE_META[stage].label;
}
