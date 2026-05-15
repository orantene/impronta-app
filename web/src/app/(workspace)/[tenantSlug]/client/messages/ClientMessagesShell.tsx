"use client";

/**
 * ClientMessagesShell — the client-side Messages dashboard.
 *
 * Same two-pane shell pattern as the admin + talent Messages surfaces
 * (list left, thread right, pane-switching on mobile). Header carries a
 * prominent "+ New inquiry" button that opens a drawer with the canonical
 * inquiry form so the client can start a new inquiry without leaving
 * Messages.
 *
 * Server provides the data (real inquiries + per-thread messages); this
 * shell is purely presentational + drawer state.
 */

import { useState, useRef, useEffect, useMemo, useTransition } from "react";
import { ThreadSearch, type ThreadSearchMessage, type JumpTarget } from "@/components/thread-search/ThreadSearch";
import { StatusSheet, type StatusSheetData, type StageStatus, type OfferStatus, type PaymentStatus, type TalentParticipationRow } from "@/components/messages-status-sheet/StatusSheet";
import { PayNowSheet } from "@/components/chat-cards/PayNowSheet";
import { addReaction, removeReaction } from "@/lib/server-actions/message-reactions";

const DEFAULT_REACTION_SET = ["👍", "❤️", "🎉", "😂", "😮", "🙏"] as const;
import { useRouter } from "next/navigation";
import type { ClientInquiryRow } from "../../_data-bridge";
import type { WorkspaceMessage } from "../../_data-bridge/inquiries-messages";
import type { ClientInquiryDetails } from "../../_data-bridge/client-inquiry-details";
import { InquiryDrawer } from "@/components/inquiry/InquiryDrawer";
import { DetailsTab } from "./DetailsTab";
import { OfferTab } from "./OfferTab";
import {
  sendClientMessageAction,
  markClientThreadReadAction,
  editClientMessageAction,
  deleteClientMessageAction,
} from "../_actions/inquiry-message-actions";
import { uploadInquiryAttachmentAsClient } from "@/lib/server-actions/client-inquiry-attachments";

const FONT = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.10)",
  borderSoft: "rgba(24,24,27,0.06)",
  surface:    "#FAFAF7",
  surfaceAlt: "#F7F7F2",
  cardBg:     "#ffffff",
  accent:     "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
  accentDeep: "#1E40AF",
} as const;

const STAGE_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  submitted:        { bg: "rgba(245,158,11,0.10)",  fg: "#92400E", label: "Submitted" },
  coordination:     { bg: "rgba(29,78,216,0.10)",   fg: "#1E40AF", label: "Coordinating" },
  offer_pending:    { bg: "rgba(168,85,247,0.10)",  fg: "#6D28D9", label: "Offer pending" },
  offer_sent:       { bg: "rgba(168,85,247,0.10)",  fg: "#6D28D9", label: "Offer sent" },
  approved:         { bg: "rgba(16,185,129,0.10)",  fg: "#047857", label: "Approved" },
  booked:           { bg: "rgba(16,185,129,0.12)",  fg: "#065F46", label: "Booked" },
  cancelled:        { bg: "rgba(239,68,68,0.10)",   fg: "#991B1B", label: "Cancelled" },
  archived:         { bg: "rgba(11,11,13,0.06)",    fg: "#52525B", label: "Archived" },
  draft:            { bg: "rgba(11,11,13,0.06)",    fg: "#52525B", label: "Draft" },
};

function stageStyle(s: string) {
  return (
    STAGE_COLORS[s] ?? {
      bg: "rgba(11,11,13,0.06)",
      fg: "#52525B",
      label: s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    }
  );
}

type Filter = "all" | "needs-me" | "active" | "booked" | "past";

export type TalentOption = {
  id: string;
  name: string;
  primaryTypeLabel?: string;
  city?: string;
};

export type ThreadTab = "chat" | "lineup" | "offer" | "details" | "files";

type Props = {
  tenantSlug: string;
  tenantName: string;
  inquiries: ClientInquiryRow[];
  client: {
    displayName: string;
    company?: string | null;
    agencyName: string;
  };
  roster: TalentOption[];
  /** Pre-loaded messages for the initially-selected inquiry (first row). */
  initialMessages: WorkspaceMessage[];
  /** Phase C — pre-loaded Details payload for the initial active inquiry. */
  initialDetails: ClientInquiryDetails | null;
  initialActiveId: string | null;
  /** Phase C — which tab to open (chat / lineup / offer / details / files). */
  initialTab: ThreadTab;
  /** Auto-open the inquiry drawer on mount (?new=1). */
  autoOpenDrawer?: boolean;
  /** Talent to pre-attach when auto-opening (?talent=<id>). */
  prefilledTalentId?: string;
  /** Inquiry id from ?just_submitted=1 — pin its thread + show toast. */
  justSubmittedInquiryId?: string;
};

export function ClientMessagesShell({
  tenantSlug,
  tenantName,
  inquiries,
  client,
  roster,
  initialMessages,
  initialDetails,
  initialActiveId,
  initialTab,
  autoOpenDrawer = false,
  prefilledTalentId,
  justSubmittedInquiryId,
}: Props) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(initialActiveId);
  const [activeTab, setActiveTab] = useState<ThreadTab>(initialTab);
  const [messages, setMessages] = useState<WorkspaceMessage[]>(initialMessages);
  const [details, setDetails] = useState<ClientInquiryDetails | null>(initialDetails);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [mobilePane, setMobilePane] = useState<"list" | "thread">("list");
  const [drawerOpen, setDrawerOpen] = useState(autoOpenDrawer);
  const [loadingThread, setLoadingThread] = useState(false);

  // Mark the active thread read whenever the user views it (Chat tab) AND
  // there are messages loaded. Fire-and-forget — the unread badge on the
  // list row + the parent inbox refresh on the next router.refresh() reflect
  // the result. We re-fire when `activeId`, `messages.length`, or `activeTab`
  // changes so flipping between threads + tabs keeps the marker fresh.
  useEffect(() => {
    if (!activeId || activeTab !== "chat" || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (!last || last.id.startsWith("tmp-")) return; // skip optimistic
    void markClientThreadReadAction(tenantSlug, activeId, last.id);
  }, [activeId, activeTab, messages.length, tenantSlug]);

  // Rollback optimistic message bubbles when send fails.
  useEffect(() => {
    function onFail(e: Event) {
      const detail = (e as CustomEvent<{ tempId: string }>).detail;
      if (!detail?.tempId) return;
      setMessages((prev) => prev.filter((m) => m.id !== detail.tempId));
    }
    window.addEventListener("client-message-send-failed", onFail);
    return () => window.removeEventListener("client-message-send-failed", onFail);
  }, []);

  // Reconcile optimistic bubbles with server messages on send success.
  //
  // MERGE, don't replace. Three guarantees:
  //   1. Optimistic tmp- bubble whose body matches a server message gets
  //      replaced by the canonical row (real id, real sender_user_id).
  //   2. Optimistic tmp- bubble with no server match stays visible —
  //      protects against the user-reported "1-second vanish" if the
  //      server returns 0 (RLS misconfig, transient error, auth blip).
  //   3. New server messages we didn't have locally (e.g. coordinator
  //      auto-ack) get added in chronological order.
  useEffect(() => {
    function onOk(e: Event) {
      const detail = (e as CustomEvent<{ tempId: string; inquiryId: string }>).detail;
      if (!detail?.inquiryId || detail.inquiryId !== activeId) return;
      fetch(`/api/client/messages?inquiry=${encodeURIComponent(detail.inquiryId)}`)
        .then((r) => (r.ok ? r.json() : { messages: null }))
        .then((j: { messages: WorkspaceMessage[] | null }) => {
          if (!j.messages) return;
          const serverMsgs = j.messages;
          setMessages((prev) => {
            const prevIds = new Set(prev.map((m) => m.id));
            // Server rows we don't already have locally.
            const incoming = serverMsgs.filter((m) => !prevIds.has(m.id));
            // Drop tmp- bubbles whose body matches an incoming server row.
            const cleaned = prev.filter((m) => {
              if (!m.id.startsWith("tmp-")) return true;
              return !incoming.some((s) => s.body === m.body);
            });
            return [...cleaned, ...incoming].sort((a, b) =>
              a.created_at.localeCompare(b.created_at),
            );
          });
        })
        .catch(() => { /* leave optimistic bubble; user will see it reconcile on next switch */ });
    }
    window.addEventListener("client-message-send-ok", onOk);
    return () => window.removeEventListener("client-message-send-ok", onOk);
  }, [activeId]);

  // Toast for the just-submitted inquiry — fades after 4 seconds.
  const [showJustSubmittedToast, setShowJustSubmittedToast] = useState(!!justSubmittedInquiryId);
  useEffect(() => {
    if (!showJustSubmittedToast) return;
    const t = setTimeout(() => setShowJustSubmittedToast(false), 4000);
    return () => clearTimeout(t);
  }, [showJustSubmittedToast]);

  // Clean the query params after auto-opening so reloads don't re-trigger.
  useEffect(() => {
    if (autoOpenDrawer || justSubmittedInquiryId) {
      const url = new URL(window.location.href);
      url.searchParams.delete("new");
      url.searchParams.delete("talent");
      url.searchParams.delete("just_submitted");
      window.history.replaceState({}, "", url.toString());
    }
  }, [autoOpenDrawer, justSubmittedInquiryId]);

  // When user picks a different inquiry, fetch its private-thread messages.
  // Uses the existing /api/admin/inspector route? Simpler: a tiny dedicated
  // endpoint. For now keep it as router.refresh + server reload model:
  // we'll lazily fetch via a fetch() to a small client API route.
  useEffect(() => {
    if (!activeId || activeId === initialActiveId) {
      return;
    }
    let cancelled = false;
    setLoadingThread(true);
    fetch(`/api/client/messages?inquiry=${encodeURIComponent(activeId)}`)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((j: { messages: WorkspaceMessage[] }) => {
        if (!cancelled) setMessages(j.messages ?? []);
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingThread(false);
      });
    return () => { cancelled = true; };
  }, [activeId, initialActiveId]);

  // Phase C — lazy-fetch Details payload on inquiry switch.
  useEffect(() => {
    if (!activeId || activeId === initialActiveId) return;
    let cancelled = false;
    setLoadingDetails(true);
    fetch(`/api/client/inquiry-details?inquiry=${encodeURIComponent(activeId)}`)
      .then((r) => (r.ok ? r.json() : { details: null }))
      .then((j: { details: ClientInquiryDetails | null }) => {
        if (!cancelled) setDetails(j.details ?? null);
      })
      .catch(() => { if (!cancelled) setDetails(null); })
      .finally(() => { if (!cancelled) setLoadingDetails(false); });
    return () => { cancelled = true; };
  }, [activeId, initialActiveId]);

  const filtered = inquiries.filter((i) => {
    if (filter === "needs-me" && i.next_action_by !== "client") return false;
    if (filter === "active" && !["submitted", "coordination", "offer_pending", "offer_sent"].includes(i.status)) return false;
    if (filter === "booked" && i.status !== "booked" && i.status !== "approved") return false;
    if (filter === "past" && !["cancelled", "archived"].includes(i.status)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const haystack = [i.company, i.event_location, i.status, i.id].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const active = inquiries.find((i) => i.id === activeId) ?? null;
  const unreadTotal = inquiries.reduce((s, i) => s + (i.unreadCount || 0), 0);

  return (
    <>
      {/* ─── Page header — same height + style as talent/admin ─── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700, fontFamily: FONT }}>
            Messages
          </div>
          <h1 style={{ margin: "4px 0 0", fontSize: 24, color: C.ink, letterSpacing: 0, fontFamily: FONT_DISPLAY, fontWeight: 600 }}>
            Your conversations
            {unreadTotal > 0 && (
              <span style={{ marginLeft: 10, fontSize: 13, fontWeight: 600, color: "#fff", background: C.accent, padding: "3px 8px", borderRadius: 999 }}>
                {unreadTotal} unread
              </span>
            )}
          </h1>
          <p style={{ margin: "6px 0 0", maxWidth: 620, fontSize: 13, lineHeight: 1.5, color: C.inkMuted, fontFamily: FONT }}>
            All inquiries and bookings with {tenantName}. Start a new request anytime.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          style={{
            height: 40,
            padding: "0 18px",
            borderRadius: 10,
            background: C.ink,
            color: "#fff",
            border: "none",
            cursor: "pointer",
            fontFamily: FONT,
            fontSize: 13.5,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            letterSpacing: 0.1,
            boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New inquiry
        </button>
      </div>

      {/* ─── Two-pane shell ─── */}
      <div
        data-tulala-messages-shell
        data-mobile-pane={mobilePane}
        style={{
          display: "grid",
          ["--tulala-shell-cols" as never]: "340px 1fr",
          gridTemplateColumns: "var(--tulala-shell-cols)",
          background: "#fff",
          border: `1px solid ${C.borderSoft}`,
          borderRadius: 14,
          overflow: "hidden",
          height: "min(calc(100vh - 56px - 52px - 200px), 720px)",
          minHeight: 520,
          minWidth: 0,
          maxWidth: "100%",
          fontFamily: FONT,
        }}
      >
        <style dangerouslySetInnerHTML={{ __html:
          "@media (max-width: 720px){"
          + "[data-tulala-messages-shell]{grid-template-columns:1fr!important;}"
          + "[data-tulala-messages-shell][data-mobile-pane='list'] [data-pane='thread']{display:none!important;}"
          + "[data-tulala-messages-shell][data-mobile-pane='thread'] [data-pane='list']{display:none!important;}"
          + "}"
        }} />

        {/* List pane */}
        <div data-pane="list" style={{ display: "flex", flexDirection: "column", borderRight: `1px solid ${C.borderSoft}`, minWidth: 0, background: "#fff" }}>
          {/* List header */}
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.borderSoft}`, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: -0.1 }}>
                Projects · {filtered.length}
              </div>
            </div>
            <input
              type="text"
              placeholder="Search inquiries…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                height: 32,
                padding: "0 10px",
                borderRadius: 7,
                border: `1px solid ${C.borderSoft}`,
                fontFamily: FONT,
                fontSize: 12.5,
                color: C.ink,
                background: C.surface,
                outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 4, overflowX: "auto" }}>
              {([
                { id: "all" as const, label: "All" },
                { id: "needs-me" as const, label: "Needs me" },
                { id: "active" as const, label: "Active" },
                { id: "booked" as const, label: "Booked" },
                { id: "past" as const, label: "Past" },
              ]).map(({ id, label }) => {
                const isActive = filter === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFilter(id)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      border: `1px solid ${isActive ? C.ink : C.borderSoft}`,
                      background: isActive ? C.ink : "transparent",
                      color: isActive ? "#fff" : C.inkMuted,
                      fontFamily: FONT,
                      fontSize: 11.5,
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* List rows */}
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {filtered.length === 0 ? (
              <EmptyList onCreate={() => setDrawerOpen(true)} />
            ) : (
              filtered.map((inq) => (
                <InquiryRow
                  key={inq.id}
                  inq={inq}
                  active={inq.id === activeId}
                  onClick={() => {
                    setActiveId(inq.id);
                    setMobilePane("thread");
                  }}
                />
              ))
            )}
          </div>
        </div>

        {/* Thread pane */}
        <div data-pane="thread" style={{ display: "flex", flexDirection: "column", minHeight: 0, background: C.surfaceAlt, overflow: "hidden" }}>
          {active ? (
            <ThreadPaneWithTabs
              inq={active}
              messages={messages}
              onMessagesChange={setMessages}
              loadingMessages={loadingThread}
              details={details}
              loadingDetails={loadingDetails}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              tenantSlug={tenantSlug}
              client={client}
              onBack={() => setMobilePane("list")}
              onAfterOfferAction={() => router.refresh()}
            />
          ) : (
            <EmptyDetail onCreate={() => setDrawerOpen(true)} />
          )}
        </div>
      </div>

      {drawerOpen && (
        <InquiryDrawer
          source={prefilledTalentId ? "discover_single_talent" : "direct_client_dashboard"}
          initialIntent={{
            requester: {
              name: client.displayName,
              // Email/phone resolved server-side from the session.
            },
            client: {
              company: client.company ?? undefined,
              same_as_requester: true,
            },
            talent: prefilledTalentId
              ? { selected_ids: [prefilledTalentId], selection_mode: "i_know_who" }
              : { selection_mode: "agency_recommends" },
            source_context: prefilledTalentId
              ? { entry_point: "messages_drawer", prefilled_talent_id: prefilledTalentId }
              : { entry_point: "messages_drawer" },
          }}
          tenantSlug={tenantSlug}
          agencyName={client.agencyName}
          client={{
            displayName: client.displayName,
            company: client.company,
            trust_level: "basic",
          }}
          roster={roster}
          enableDraftAutosave={true}
          onClose={() => {
            setDrawerOpen(false);
            router.refresh();
          }}
        />
      )}

      {showJustSubmittedToast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 110,
            background: "#0F5132",
            color: "#fff",
            padding: "10px 18px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: FONT,
            boxShadow: "0 4px 18px rgba(15,81,50,0.32)",
          }}
        >
          ✓ Inquiry sent — your coordinator will reply here shortly.
        </div>
      )}
    </>
  );
}

// ─── Inquiry row ─────────────────────────────────────────────────────────

function InquiryRow({ inq, active, onClick }: { inq: ClientInquiryRow; active: boolean; onClick: () => void }) {
  const stage = stageStyle(inq.status);
  const company = inq.company || "Unnamed inquiry";
  const dateLabel = inq.event_date ? formatDate(inq.event_date) : null;
  const location = inq.event_location;
  const needsMe = inq.next_action_by === "client";
  const unread = inq.unreadCount > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "12px 14px",
        background: active ? "rgba(11,11,13,0.045)" : unread ? "rgba(29,78,216,0.03)" : "transparent",
        borderBottom: `1px solid ${C.borderSoft}`,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 5,
        fontFamily: FONT,
        position: "relative",
      }}
    >
      {unread && (
        <span style={{ position: "absolute", left: 4, top: "50%", transform: "translateY(-50%)", width: 6, height: 6, borderRadius: "50%", background: C.accent }} />
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" }}>
        <div style={{ fontSize: 13, fontWeight: unread ? 700 : 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {company}
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: stage.bg, color: stage.fg, whiteSpace: "nowrap" }}>
          {stage.label}
        </span>
      </div>
      {(dateLabel || location) && (
        <div style={{ fontSize: 11.5, color: C.inkMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {[dateLabel, location].filter(Boolean).join(" · ")}
        </div>
      )}
      {needsMe && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 2 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 0.3 }}>
            Action needed
          </span>
        </div>
      )}
    </button>
  );
}

// ─── Thread pane with Phase C tabs ───────────────────────────────────────

const TAB_CONFIG: Array<{ id: ThreadTab; label: string }> = [
  { id: "chat", label: "Chat" },
  { id: "lineup", label: "Lineup" },
  { id: "offer", label: "Offer" },
  { id: "details", label: "Details" },
  { id: "files", label: "Files" },
];

function ThreadPaneWithTabs({
  inq,
  messages,
  onMessagesChange,
  loadingMessages,
  details,
  loadingDetails,
  activeTab,
  onTabChange,
  tenantSlug,
  client,
  onBack,
  onAfterOfferAction,
}: {
  inq: ClientInquiryRow;
  messages: WorkspaceMessage[];
  onMessagesChange: (next: WorkspaceMessage[] | ((prev: WorkspaceMessage[]) => WorkspaceMessage[])) => void;
  loadingMessages: boolean;
  details: ClientInquiryDetails | null;
  loadingDetails: boolean;
  activeTab: ThreadTab;
  onTabChange: (tab: ThreadTab) => void;
  tenantSlug: string;
  client: { displayName: string };
  onBack: () => void;
  onAfterOfferAction?: () => void;
}) {
  const stage = stageStyle(inq.status);
  const [statusSheetOpen, setStatusSheetOpen] = useState(false);
  const [payNowSheet, setPayNowSheet] = useState<{ amountLabel: string } | null>(null);
  const statusSheetData = useMemo<StatusSheetData>(
    () => buildClientStatusSheetData(inq, details),
    [inq, details],
  );
  return (
    <>
      {/* Thread header — same as before, but tab strip appended below */}
      <div style={{ padding: "12px 16px 0", borderBottom: `1px solid ${C.borderSoft}`, background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to list"
            style={{
              display: "none",
              width: 30,
              height: 30,
              borderRadius: 7,
              border: `1px solid ${C.borderSoft}`,
              background: "transparent",
              cursor: "pointer",
              alignItems: "center",
              justifyContent: "center",
            }}
            className="thread-back-btn"
          >
            ←
          </button>
          <style dangerouslySetInnerHTML={{ __html: "@media (max-width:720px){.thread-back-btn{display:inline-flex!important;}}" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {inq.company || details?.job.title || "Inquiry"}
            </div>
            <div style={{ fontSize: 11, color: C.inkMuted, display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
              <button
                type="button"
                onClick={() => setStatusSheetOpen(true)}
                aria-label={`Status: ${stage.label}. Tap for full status breakdown.`}
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: stage.bg,
                  color: stage.fg,
                  fontWeight: 700,
                  fontSize: 9.5,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: FONT,
                  letterSpacing: 0.2,
                }}
              >
                {stage.label}
              </button>
              {inq.event_date && <span>· {formatDate(inq.event_date)}</span>}
              {inq.event_location && <span>· {inq.event_location}</span>}
            </div>
          </div>
          <ClientThreadSearchTrigger
            messages={messages}
            onJumpOffer={details?.offer?.exists ? () => onTabChange("offer") : undefined}
            onJumpDetails={() => onTabChange("details")}
          />
        </div>

        {/* Tab strip */}
        <div role="tablist" style={{ display: "flex", gap: 0, marginTop: 12, overflowX: "auto" }}>
          {TAB_CONFIG.map((t) => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onTabChange(t.id)}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "8px 14px",
                  fontFamily: FONT,
                  fontSize: 12.5,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? C.ink : C.inkMuted,
                  cursor: "pointer",
                  position: "relative",
                  whiteSpace: "nowrap",
                  letterSpacing: 0.1,
                }}
              >
                {t.label}
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    bottom: -1,
                    left: 8,
                    right: 8,
                    height: 2,
                    background: C.ink,
                    borderRadius: 2,
                    opacity: isActive ? 1 : 0,
                    transition: "opacity 180ms",
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab body */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, background: activeTab === "chat" ? C.surfaceAlt : "rgba(11,11,13,0.02)" }}>
        {activeTab === "chat" && (
          <ChatThreadBody
            inq={inq}
            messages={messages}
            loading={loadingMessages}
            tenantSlug={tenantSlug}
            pitch={details?.pitch ?? null}
            onJumpToOffer={() => onTabChange("offer")}
            onPayNow={(amountLabel) => setPayNowSheet({ amountLabel })}
            onMessagesChange={onMessagesChange}
          />
        )}
        {activeTab === "details" && (
          <DetailsTab details={loadingDetails ? null : details} tenantSlug={tenantSlug} />
        )}
        {activeTab === "lineup" && (
          <LineupTab details={loadingDetails ? null : details} />
        )}
        {activeTab === "offer" && (
          <OfferTab
            details={loadingDetails ? null : details}
            tenantSlug={tenantSlug}
            onAfterAction={onAfterOfferAction}
          />
        )}
        {activeTab === "files" && (
          <FilesTab details={loadingDetails ? null : details} />
        )}
      </div>

      <StatusSheet
        open={statusSheetOpen}
        data={statusSheetData}
        onClose={() => setStatusSheetOpen(false)}
      />

      {payNowSheet && (
        <PayNowSheet
          inquiryId={inq.id}
          amountLabel={payNowSheet.amountLabel}
          onClose={() => setPayNowSheet(null)}
        />
      )}

      {/* Inline composer — only on Chat tab */}
      {activeTab === "chat" && (
        <ChatComposer
          inquiryId={inq.id}
          tenantSlug={tenantSlug}
          senderName={client.displayName}
          inquiryStatus={inq.status}
          hasOffer={!!details?.offer?.exists}
          onSent={(msg) => onMessagesChange((prev) => [...prev, msg])}
        />
      )}
    </>
  );
}

// ─── StatusSheet data adapter ────────────────────────────────────────────

const STAGE_FROM_INQUIRY: Record<string, StageStatus> = {
  submitted: "Inquiry",
  coordination: "Inquiry",
  offer_pending: "Offer sent",
  offer_sent: "Offer sent",
  approved: "Booked",
  booked: "Booked",
  converted: "Booked",
  cancelled: "Cancelled",
  expired: "Cancelled",
};

const OFFER_FROM_ENGINE: Record<string, OfferStatus> = {
  draft: "Draft",
  sent: "Sent",
  countered: "Countered",
  accepted: "Accepted",
  rejected: "Declined",
  expired: "Expired",
  superseded: "Sent",
  withdrawn: "Declined",
};

const TALENT_FROM_ENGINE: Record<string, TalentParticipationRow["status"]> = {
  invited: "Invited",
  active: "Confirmed",
  declined: "Declined",
  removed: "Removed",
  replacement_sourcing: "Invited",
};

const NEXT_STEP_FROM_STATUS: Record<string, string> = {
  submitted: "Your coordinator is reviewing the request — typical response within 1 business day.",
  coordination: "Coordinator is sourcing talent. You'll see proposals appear on the Lineup tab.",
  offer_pending: "An offer is being drafted. You'll receive a notification when it's ready to review.",
  offer_sent: "Review the offer in the Offer tab. Approve to confirm, decline to ask for changes.",
  approved: "Booking confirmed. The call sheet appears on event day in your Today tab.",
  booked: "Booking confirmed. Open the Today tab on event day for call sheet + coordinator contact.",
  converted: "Booking confirmed.",
  cancelled: "This project has been cancelled.",
};

function buildClientStatusSheetData(
  inq: ClientInquiryRow,
  details: ClientInquiryDetails | null,
): StatusSheetData {
  const stage = STAGE_FROM_INQUIRY[inq.status] ?? "Inquiry";
  const offerStatus: OfferStatus = details?.offer?.exists
    ? (OFFER_FROM_ENGINE[details.offer.status] ?? "Sent")
    : "No offer";
  const offerTotal =
    details?.offer?.exists && details.offer.total_client_price != null
      ? `${details.offer.currency ?? "USD"} ${Number(details.offer.total_client_price).toLocaleString()}`
      : undefined;

  const talents: TalentParticipationRow[] = (details?.talent.selected ?? []).map((t) => ({
    name: t.name,
    status: TALENT_FROM_ENGINE[t.status] ?? "Invited",
  }));

  // Payment status not yet wired into client details loader — show
  // "Not requested" until offer is accepted, then "Requested" as a
  // reasonable approximation. Real status comes when Stripe wiring lands.
  const payment: { status: PaymentStatus; amountLabel?: string; nextAction?: string } =
    inq.status === "booked" || inq.status === "approved" || inq.status === "converted"
      ? { status: "Requested", amountLabel: offerTotal }
      : { status: "Not requested" };

  return {
    stage,
    offer: { status: offerStatus, totalLabel: offerTotal },
    talents,
    payment,
    nextStep: NEXT_STEP_FROM_STATUS[inq.status],
  };
}

// ─── Thread search ───────────────────────────────────────────────────────

function ClientThreadSearchTrigger({
  messages,
  onJumpOffer,
  onJumpDetails,
}: {
  messages: WorkspaceMessage[];
  onJumpOffer?: () => void;
  onJumpDetails?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const adapted: ThreadSearchMessage[] = useMemo(
    () => messages.map((m) => ({
      id: m.id,
      body: m.body || "",
      createdAt: (m.created_at || "").slice(0, 16).replace("T", " "),
      senderName: m.is_mine ? "You" : m.sender_name,
      hasAttachment: false,
    })),
    [messages],
  );
  const jumpTargets: JumpTarget[] = useMemo(() => {
    const out: JumpTarget[] = [];
    if (onJumpOffer) out.push({ kind: "offer", label: "Offer", onJump: onJumpOffer });
    if (onJumpDetails) out.push({ kind: "call-sheet", label: "Project details", onJump: onJumpDetails });
    return out;
  }, [onJumpOffer, onJumpDetails]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search this conversation"
        title="Search conversation"
        style={{
          width: 32,
          height: 32,
          padding: 0,
          background: "transparent",
          border: `1px solid ${C.borderSoft}`,
          borderRadius: 8,
          cursor: "pointer",
          color: C.inkMuted,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="6" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M9 9l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
      <ThreadSearch
        open={open}
        messages={adapted}
        jumpTargets={jumpTargets}
        onResultClick={() => setOpen(false)}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

// ─── Inline composer ─────────────────────────────────────────────────────

function ChatComposer({
  inquiryId,
  tenantSlug,
  senderName,
  inquiryStatus,
  hasOffer,
  onSent,
}: {
  inquiryId: string;
  tenantSlug: string;
  senderName: string;
  inquiryStatus?: string;
  hasOffer?: boolean;
  onSent: (msg: WorkspaceMessage) => void;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function insertEmoji(emoji: string) {
    const ta = textareaRef.current;
    if (!ta) { setBody((b) => b + emoji); setEmojiOpen(false); return; }
    const start = ta.selectionStart ?? body.length;
    const end = ta.selectionEnd ?? body.length;
    const next = body.slice(0, start) + emoji + body.slice(end);
    setBody(next);
    // Restore caret after the inserted emoji.
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + emoji.length;
      ta.setSelectionRange(pos, pos);
    });
    setEmojiOpen(false);
  }

  // Auto-grow textarea up to ~6 lines.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [body]);

  // Close emoji picker on Escape.
  useEffect(() => {
    if (!emojiOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setEmojiOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [emojiOpen]);

  // Smart-reply chips — contextual one-tap suggestions based on inquiry
  // state. Each chip pre-fills the textarea (the user can edit before
  // sending). Hidden once the user has typed something.
  const smartReplies = useMemo(() => {
    if (body.trim().length > 0) return [];
    switch (inquiryStatus) {
      case "submitted":
        return [
          "Thanks for picking this up!",
          "Any update on talent?",
          "Happy to hop on a quick call.",
        ];
      case "coordination":
        return hasOffer
          ? ["Looking at the offer now.", "Any flexibility on the date?"]
          : [
            "Looking forward to the proposal.",
            "Any update on talent?",
            "Should I adjust the budget?",
          ];
      case "offer_pending":
      case "offer_sent":
        return [
          "I'll review and get back to you.",
          "Can we adjust the rate?",
          "Need to check with my team — back in 24h.",
        ];
      case "approved":
      case "booked":
      case "converted":
        return [
          "Looking forward to the day!",
          "Any prep we should know about?",
          "Who's the talent contact on the day?",
        ];
      default:
        return [];
    }
  }, [body, inquiryStatus, hasOffer]);

  function submit() {
    const trimmed = body.trim();
    if (!trimmed || pending) return;
    setError(null);

    // Optimistic bubble — replaced/reconciled on server response.
    const tempId = `tmp-${Date.now()}`;
    const optimistic: WorkspaceMessage = {
      id: tempId,
      sender_user_id: "",
      sender_name: senderName,
      body: trimmed,
      created_at: new Date().toISOString(),
      is_mine: true,
    };
    onSent(optimistic);
    setBody("");

    startTransition(async () => {
      const res = await sendClientMessageAction(tenantSlug, inquiryId, trimmed);
      if (!res.ok) {
        setError(res.error);
        // Restore the draft so the user can retry — and pull the optimistic
        // bubble back out of the stream via a custom event (cheap signal).
        setBody(trimmed);
        window.dispatchEvent(new CustomEvent("client-message-send-failed", { detail: { tempId } }));
        return;
      }
      // Server accepted — refetch the thread to reconcile the optimistic
      // bubble with the canonical row (real id, real sender_user_id, real
      // created_at). Fire-and-forget; failure just leaves the optimistic
      // bubble in place.
      window.dispatchEvent(
        new CustomEvent("client-message-send-ok", { detail: { tempId, inquiryId } }),
      );
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || uploading || pending) return;
    e.target.value = ""; // reset so re-selecting the same file fires onChange
    if (file.size > 100 * 1024 * 1024) {
      setError("File too large (100 MB max).");
      return;
    }
    setError(null);
    setUploading(true);

    // Optimistic bubble showing the upload is in flight.
    const tempId = `tmp-up-${Date.now()}`;
    onSent({
      id: tempId,
      sender_user_id: "",
      sender_name: senderName,
      body: `📎 Uploading ${file.name}…`,
      created_at: new Date().toISOString(),
      is_mine: true,
    });

    startTransition(async () => {
      const formData = new FormData();
      formData.set("inquiryId", inquiryId);
      formData.set("attachmentKind", "reference");
      formData.set("file", file);
      const upRes = await uploadInquiryAttachmentAsClient(formData);

      if (!upRes.ok) {
        setError(upRes.error || "Upload failed.");
        setUploading(false);
        window.dispatchEvent(new CustomEvent("client-message-send-failed", { detail: { tempId } }));
        return;
      }

      // Replace the in-flight bubble's body via a quick send of a real
      // chat message announcing the file. The coordinator's Files tab
      // already picks up the row from inquiry_attachments — this message
      // makes the upload visible in the conversation stream too.
      const sizeKB = Math.round(upRes.data.byteSize / 1024);
      const announceBody = `📎 Shared a file: ${upRes.data.filename} (${sizeKB.toLocaleString()} KB)`;
      window.dispatchEvent(new CustomEvent("client-message-send-failed", { detail: { tempId } }));

      const sendRes = await sendClientMessageAction(tenantSlug, inquiryId, announceBody);
      setUploading(false);
      if (!sendRes.ok) {
        setError(`Uploaded, but message failed: ${sendRes.error}`);
        return;
      }
      // Add the canonical announce bubble.
      const announceTempId = `tmp-up-msg-${Date.now()}`;
      onSent({
        id: announceTempId,
        sender_user_id: "",
        sender_name: senderName,
        body: announceBody,
        created_at: new Date().toISOString(),
        is_mine: true,
      });
      window.dispatchEvent(
        new CustomEvent("client-message-send-ok", { detail: { tempId: announceTempId, inquiryId } }),
      );
    });
  }

  return (
    <div
      style={{
        padding: "10px 14px 14px",
        borderTop: `1px solid ${C.borderSoft}`,
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {error && (
        <div style={{ fontSize: 11.5, color: "#991B1B", padding: "4px 8px", background: "rgba(239,68,68,0.06)", borderRadius: 6 }}>
          {error}
        </div>
      )}
      {smartReplies.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
          {smartReplies.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setBody(s);
                requestAnimationFrame(() => {
                  textareaRef.current?.focus();
                  const len = s.length;
                  textareaRef.current?.setSelectionRange(len, len);
                });
              }}
              style={{
                padding: "5px 10px",
                borderRadius: 999,
                background: "rgba(29,78,216,0.06)",
                color: C.accent,
                border: `1px solid rgba(29,78,216,0.18)`,
                fontFamily: FONT,
                fontSize: 11.5,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
        style={{ display: "none" }}
        aria-hidden
      />
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || pending}
          aria-label="Attach file"
          title="Attach file"
          style={{
            height: 38,
            width: 38,
            borderRadius: 10,
            background: "transparent",
            color: C.inkMuted,
            border: `1px solid ${C.borderSoft}`,
            cursor: uploading || pending ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {uploading ? (
            <span style={{ fontSize: 11, fontWeight: 600 }}>…</span>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          )}
        </button>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setEmojiOpen((v) => !v)}
            disabled={pending}
            aria-label="Insert emoji"
            title="Insert emoji"
            style={{
              height: 38,
              width: 38,
              borderRadius: 10,
              background: emojiOpen ? "rgba(11,11,13,0.05)" : "transparent",
              color: C.inkMuted,
              border: `1px solid ${C.borderSoft}`,
              cursor: pending ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ☺
          </button>
          {emojiOpen && (
            <div
              role="menu"
              style={{
                position: "absolute",
                bottom: "calc(100% + 6px)",
                left: 0,
                background: "#fff",
                border: `1px solid ${C.borderSoft}`,
                borderRadius: 10,
                boxShadow: "0 6px 24px rgba(0,0,0,0.10)",
                padding: 6,
                display: "grid",
                gridTemplateColumns: "repeat(8, 28px)",
                gap: 2,
                zIndex: 60,
                width: "max-content",
              }}
            >
              {[
                "😀","😂","🥲","😊","😍","🤔","😅","🙏",
                "👍","👎","🙌","👏","💪","🔥","✨","🎉",
                "❤️","💛","💚","💙","💜","🖤","🤍","💖",
                "✅","✔️","☑️","⭐","📌","📎","📅","⏰",
                "💬","📝","💡","🎯","📸","🎬","🎭","🎤",
              ].map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => insertEmoji(e)}
                  role="menuitem"
                  aria-label={`Insert ${e}`}
                  style={{
                    width: 28,
                    height: 28,
                    padding: 0,
                    background: "transparent",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 16,
                    lineHeight: 1,
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            // Cmd/Ctrl+Enter sends; plain Enter inserts newline on mobile.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Reply to your coordinator…"
          rows={1}
          disabled={pending}
          style={{
            flex: 1,
            minHeight: 38,
            maxHeight: 140,
            padding: "9px 12px",
            borderRadius: 10,
            border: `1px solid ${C.borderSoft}`,
            background: C.surface,
            fontFamily: FONT,
            fontSize: 13.5,
            lineHeight: 1.45,
            color: C.ink,
            resize: "none",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!body.trim() || pending}
          aria-label="Send message"
          style={{
            height: 38,
            width: 44,
            borderRadius: 10,
            background: body.trim() && !pending ? C.ink : "rgba(11,11,13,0.20)",
            color: "#fff",
            border: "none",
            cursor: body.trim() && !pending ? "pointer" : "not-allowed",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 120ms",
            flexShrink: 0,
          }}
        >
          {pending ? (
            <span style={{ fontSize: 11, fontWeight: 600 }}>…</span>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>
      <div style={{ fontSize: 10.5, color: C.inkDim, paddingLeft: 4 }}>
        ⌘ + Enter to send
      </div>
    </div>
  );
}

function ChatThreadBody({
  inq, messages, loading, tenantSlug, pitch, onJumpToOffer, onPayNow, onMessagesChange,
}: {
  inq: ClientInquiryRow;
  messages: WorkspaceMessage[];
  loading: boolean;
  tenantSlug: string;
  pitch: ClientInquiryDetails["pitch"];
  onJumpToOffer?: () => void;
  onPayNow?: (amountLabel: string) => void;
  onMessagesChange?: (next: WorkspaceMessage[] | ((prev: WorkspaceMessage[]) => WorkspaceMessage[])) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);
  void inq;
  return (
    <div
      ref={scrollRef}
      role="log"
      aria-live="polite"
      aria-label="Conversation messages"
      style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}
    >
      {pitch && <PitchOriginBlock pitch={pitch} />}
      {loading ? (
        <ChatLoadingSkeleton />
      ) : messages.length === 0 ? (
        <div style={{ color: C.inkDim, fontSize: 12.5, textAlign: "center", padding: 30, fontStyle: "italic" }}>
          No messages yet. Your coordinator will reply here once they pick up your inquiry.
        </div>
      ) : (
        (() => {
          // Find the latest is_mine message with a seen_at — only that one
          // gets the "Seen" pill so the indicator doesn't repeat down the
          // thread. Reading from the loader's seen_at field which already
          // compares per-message created_at against the counterparty's
          // last_read_at on this thread.
          let lastSeenMineIdx = -1;
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].is_mine && messages[i].seen_at) { lastSeenMineIdx = i; break; }
          }
          return messages.map((m, i) => (
            <Bubble
              key={m.id}
              m={m}
              showSeen={i === lastSeenMineIdx}
              tenantSlug={tenantSlug}
              onJumpToOffer={onJumpToOffer}
              onPayNow={onPayNow}
              onMessagesChange={onMessagesChange}
            />
          ));
        })()
      )}
    </div>
  );
}

function ChatLoadingSkeleton() {
  return (
    <div role="status" aria-label="Loading messages" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[
        { mine: false, w: "65%" },
        { mine: true, w: "55%" },
        { mine: false, w: "75%" },
      ].map((p, i) => (
        <div key={i} style={{ display: "flex", justifyContent: p.mine ? "flex-end" : "flex-start" }}>
          <div
            style={{
              width: p.w,
              height: 38,
              borderRadius: 14,
              borderBottomRightRadius: p.mine ? 4 : 14,
              borderBottomLeftRadius: p.mine ? 14 : 4,
              background: p.mine ? "rgba(11,11,13,0.08)" : "rgba(11,11,13,0.04)",
              animation: "client-msg-skel-pulse 1.4s ease-in-out infinite",
            }}
          />
        </div>
      ))}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes client-msg-skel-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
      `}} />
    </div>
  );
}

// ─── Pitch origin block ──────────────────────────────────────────────────

function PitchOriginBlock({
  pitch,
}: {
  pitch: NonNullable<ClientInquiryDetails["pitch"]>;
}) {
  const when = pitch.sent_at ? formatDate(pitch.sent_at) : null;
  const author = pitch.author_name ?? "Your coordinator";
  return (
    <div
      style={{
        background: "rgba(29,78,216,0.05)",
        border: `1px solid rgba(29,78,216,0.15)`,
        borderRadius: 12,
        padding: "12px 14px",
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: C.accent,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        Pitch from {author}
        {when && <span style={{ color: C.inkMuted, marginLeft: 6, fontWeight: 500 }}>· {when}</span>}
      </div>
      {pitch.brief && (
        <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.5, fontWeight: 500 }}>
          {pitch.brief}
        </div>
      )}
      {pitch.personal_note && (
        <div
          style={{
            fontSize: 12.5,
            color: C.inkMuted,
            lineHeight: 1.5,
            fontStyle: "italic",
            paddingTop: 4,
            borderTop: `1px dashed rgba(29,78,216,0.20)`,
            marginTop: 2,
          }}
        >
          “{pitch.personal_note}”
        </div>
      )}
    </div>
  );
}

// ─── Lineup tab ──────────────────────────────────────────────────────────

function LineupTab({ details }: { details: ClientInquiryDetails | null }) {
  if (!details) {
    return <div style={{ padding: 24, color: C.inkMuted, fontFamily: FONT, fontSize: 13 }}>Loading lineup…</div>;
  }
  const list = details.talent.selected;
  const mode = details.talent.selection_mode;

  return (
    <div style={{ padding: "16px 20px 28px", fontFamily: FONT, display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.6 }}>
          Lineup
        </div>
        <div style={{ fontSize: 13, color: C.inkMuted, marginTop: 4, lineHeight: 1.5 }}>
          {mode === "agency_recommends"
            ? "Your coordinator will propose talent based on the brief. You'll see them appear here as they're added."
            : "Talent on this project. Status updates as coordinators confirm them."}
        </div>
      </div>

      {list.length === 0 ? (
        <div
          style={{
            padding: "14px 16px",
            borderRadius: 10,
            background: "rgba(11,11,13,0.02)",
            border: `1px dashed ${C.border}`,
            fontSize: 12.5,
            color: C.inkMuted,
            lineHeight: 1.5,
          }}
        >
          {mode === "agency_recommends"
            ? "No proposals yet — your coordinator typically responds within a business day."
            : "No talent selected yet."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {list.map((t) => (
            <div
              key={t.participant_id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                borderRadius: 10,
                background: "#fff",
                border: `1px solid ${C.borderSoft}`,
              }}
            >
              {t.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={t.photo_url}
                  alt={t.name}
                  style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                />
              ) : (
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: "rgba(11,11,13,0.05)",
                    color: C.inkMuted,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {talentInitials(t.name)}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.name}
                </div>
                {t.profile_code && (
                  <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2 }}>
                    {t.profile_code}
                  </div>
                )}
              </div>
              <LineupStatusPill status={t.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function talentInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function LineupStatusPill({ status }: { status: string }) {
  const palette = (() => {
    if (status === "active") return { bg: "rgba(15,81,50,0.10)", fg: "#0F5132", label: "Confirmed" };
    if (status === "invited") return { bg: C.accentSoft, fg: C.accent, label: "Invited" };
    if (status === "declined") return { bg: "rgba(239,68,68,0.08)", fg: "#991B1B", label: "Declined" };
    if (status === "replacement_sourcing") return { bg: "rgba(245,158,11,0.10)", fg: "#92400E", label: "Sourcing replacement" };
    return { bg: "rgba(11,11,13,0.06)", fg: C.inkMuted, label: status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) };
  })();
  return (
    <span
      style={{
        padding: "3px 9px",
        borderRadius: 999,
        background: palette.bg,
        color: palette.fg,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 0.3,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {palette.label}
    </span>
  );
}

// ─── Files tab ───────────────────────────────────────────────────────────

function FilesTab({ details }: { details: ClientInquiryDetails | null }) {
  if (!details) {
    return <div style={{ padding: 24, color: C.inkMuted, fontFamily: FONT, fontSize: 13 }}>Loading files…</div>;
  }
  const files = details.attachments.files;
  const links = details.attachments.links;
  const isEmpty = files.length === 0 && links.length === 0;

  return (
    <div style={{ padding: "16px 20px 28px", fontFamily: FONT, display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.6 }}>
          Files & references
        </div>
        <div style={{ fontSize: 13, color: C.inkMuted, marginTop: 4 }}>
          Materials shared on this project — mood-boards, decks, contracts.
        </div>
      </div>

      {isEmpty ? (
        <div
          style={{
            padding: "16px",
            borderRadius: 10,
            background: "rgba(11,11,13,0.02)",
            border: `1px dashed ${C.border}`,
            fontSize: 12.5,
            color: C.inkMuted,
            lineHeight: 1.5,
          }}
        >
          No files yet. Share references in the chat — your coordinator will collect them here.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {files.map((f, i) => (
            <a
              key={`f-${i}`}
              href={f.url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 9,
                background: "#fff",
                border: `1px solid ${C.borderSoft}`,
                textDecoration: "none",
                color: C.ink,
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              <span style={{ fontSize: 16 }}>📎</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
              <span style={{ fontSize: 11, color: C.inkMuted }}>Open ↗</span>
            </a>
          ))}
          {links.map((l, i) => (
            <a
              key={`l-${i}`}
              href={l}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 9,
                background: "#fff",
                border: `1px solid ${C.borderSoft}`,
                textDecoration: "none",
                color: C.accent,
                fontSize: 13,
                fontWeight: 500,
                wordBreak: "break-all",
              }}
            >
              <span style={{ fontSize: 16 }}>🔗</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l}</span>
              <span style={{ fontSize: 11, color: C.inkMuted, flexShrink: 0 }}>Open ↗</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}


function Bubble({
  m,
  showSeen,
  tenantSlug,
  onJumpToOffer,
  onPayNow,
  onMessagesChange,
}: {
  m: WorkspaceMessage;
  showSeen?: boolean;
  tenantSlug?: string;
  onJumpToOffer?: () => void;
  onPayNow?: (amountLabel: string) => void;
  onMessagesChange?: (next: WorkspaceMessage[] | ((prev: WorkspaceMessage[]) => WorkspaceMessage[])) => void;
}) {
  const mine = m.is_mine;
  const kind = m.message_kind ?? "text";
  const card = kind !== "text" ? renderClientChatCard(kind, m.card_payload ?? {}, { onJumpToOffer, onPayNow }) : null;

  const isOptimistic = m.id.startsWith("tmp-");
  const canEditOrDelete = mine && !isOptimistic && kind === "text" && tenantSlug && onMessagesChange;
  // Reactions are allowed on any non-optimistic real message — own or others'.
  const canReact = !isOptimistic && tenantSlug && onMessagesChange;

  const [menuOpen, setMenuOpen] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(m.body);
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);
  // Close reaction picker on Escape
  useEffect(() => {
    if (!reactionPickerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setReactionPickerOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [reactionPickerOpen]);

  function commitEdit() {
    const trimmed = editValue.trim();
    if (!trimmed || !tenantSlug || !onMessagesChange) return;
    if (trimmed === m.body) { setEditing(false); return; }
    setActionError(null);
    const optimisticBody = trimmed;
    // Optimistic update
    onMessagesChange((prev) => prev.map((mm) => (mm.id === m.id ? { ...mm, body: optimisticBody } : mm)));
    setEditing(false);
    startTransition(async () => {
      const res = await editClientMessageAction(tenantSlug, m.id, optimisticBody);
      if (!res.ok) {
        setActionError(res.error);
        // Revert
        onMessagesChange((prev) => prev.map((mm) => (mm.id === m.id ? { ...mm, body: m.body } : mm)));
      }
    });
  }

  function commitDelete() {
    if (!tenantSlug || !onMessagesChange) return;
    if (!confirm("Delete this message? It will be removed for everyone on the thread.")) return;
    setActionError(null);
    setMenuOpen(false);
    // Optimistic
    onMessagesChange((prev) => prev.filter((mm) => mm.id !== m.id));
    startTransition(async () => {
      const res = await deleteClientMessageAction(tenantSlug, m.id);
      if (!res.ok) {
        setActionError(res.error);
        // Put it back
        onMessagesChange((prev) => [...prev, m].sort((a, b) => a.created_at.localeCompare(b.created_at)));
      }
    });
  }

  function toggleReaction(emoji: string) {
    if (!tenantSlug || !onMessagesChange) return;
    const cur = m.reactions ?? [];
    const existing = cur.find((r) => r.emoji === emoji);
    const removing = existing?.mine === true;
    setActionError(null);
    setReactionPickerOpen(false);

    // Optimistic
    onMessagesChange((prev) =>
      prev.map((mm) => {
        if (mm.id !== m.id) return mm;
        const list = (mm.reactions ?? []).slice();
        const idx = list.findIndex((r) => r.emoji === emoji);
        if (removing) {
          if (idx >= 0) {
            const newCount = list[idx].count - 1;
            if (newCount <= 0) list.splice(idx, 1);
            else list[idx] = { ...list[idx], count: newCount, mine: false };
          }
        } else if (idx >= 0) {
          list[idx] = { ...list[idx], count: list[idx].count + 1, mine: true };
        } else {
          list.push({ emoji, count: 1, mine: true });
        }
        return { ...mm, reactions: list };
      }),
    );

    startTransition(async () => {
      const res = removing
        ? await removeReaction(m.id, emoji)
        : await addReaction(m.id, emoji);
      if (!res.ok) {
        setActionError(res.error);
        // Rollback by reverting to original `cur`
        onMessagesChange((prev) =>
          prev.map((mm) => (mm.id === m.id ? { ...mm, reactions: cur } : mm)),
        );
      }
    });
  }

  // Structured card — full-width, no chat-bubble chrome. No edit/delete for cards.
  if (card) {
    return (
      <div style={{ display: "flex", justifyContent: "stretch", flexDirection: "column", gap: 4, maxWidth: "92%", margin: mine ? "0 0 0 auto" : "0 auto 0 0" }}>
        {!mine && (
          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkMuted, letterSpacing: 0.3, paddingLeft: 2 }}>
            {m.sender_name}
          </div>
        )}
        {card}
        <div style={{ fontSize: 10, color: C.inkDim, marginTop: 2, textAlign: mine ? "right" : "left", paddingRight: 2 }}>
          {formatTime(m.created_at)}
        </div>
      </div>
    );
  }

  // Plain text bubble.
  return (
    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
      <div style={{ maxWidth: "78%", position: "relative" }}>
        {!mine && (
          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkMuted, marginBottom: 3, letterSpacing: 0.3 }}>
            {m.sender_name}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, justifyContent: mine ? "flex-end" : "flex-start" }}>
          {editing ? (
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { setEditing(false); setEditValue(m.body); }
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commitEdit(); }
                }}
                autoFocus
                rows={2}
                disabled={pending}
                style={{
                  width: "100%",
                  minWidth: 220,
                  padding: "9px 12px",
                  borderRadius: 12,
                  border: `1px solid ${C.accent}`,
                  background: "#fff",
                  fontFamily: FONT,
                  fontSize: 13,
                  lineHeight: 1.45,
                  resize: "vertical",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => { setEditing(false); setEditValue(m.body); }}
                  disabled={pending}
                  style={{ padding: "5px 10px", borderRadius: 7, background: "transparent", border: `1px solid ${C.borderSoft}`, color: C.inkMuted, fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={commitEdit}
                  disabled={pending || !editValue.trim()}
                  style={{ padding: "5px 12px", borderRadius: 7, background: C.ink, border: "none", color: "#fff", fontSize: 11.5, fontWeight: 600, cursor: pending ? "not-allowed" : "pointer", fontFamily: FONT }}
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: "9px 12px",
                borderRadius: 14,
                borderBottomRightRadius: mine ? 4 : 14,
                borderBottomLeftRadius: mine ? 14 : 4,
                background: mine ? C.ink : "#fff",
                color: mine ? "#fff" : C.ink,
                fontSize: 13,
                lineHeight: 1.45,
                border: mine ? "none" : `1px solid ${C.borderSoft}`,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {m.body}
            </div>
          )}
          {canReact && !editing && (
            <div style={{ position: "relative", flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setReactionPickerOpen((v) => !v)}
                aria-label="Add reaction"
                style={{
                  width: 24,
                  height: 24,
                  padding: 0,
                  borderRadius: 6,
                  background: "transparent",
                  border: "none",
                  color: C.inkMuted,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  lineHeight: 1,
                }}
              >
                ☺
              </button>
              {reactionPickerOpen && (
                <div
                  role="menu"
                  style={{
                    position: "absolute",
                    bottom: "calc(100% + 4px)",
                    right: 0,
                    background: "#fff",
                    border: `1px solid ${C.borderSoft}`,
                    borderRadius: 999,
                    boxShadow: "0 6px 18px rgba(0,0,0,0.10)",
                    padding: "4px 6px",
                    display: "flex",
                    gap: 2,
                    zIndex: 60,
                  }}
                >
                  {DEFAULT_REACTION_SET.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => toggleReaction(emoji)}
                      role="menuitem"
                      aria-label={`React with ${emoji}`}
                      style={{
                        width: 28,
                        height: 28,
                        padding: 0,
                        borderRadius: 999,
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 16,
                        lineHeight: 1,
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {canEditOrDelete && !editing && (
            <div ref={menuRef} style={{ position: "relative", flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Message actions"
                style={{
                  width: 24,
                  height: 24,
                  padding: 0,
                  borderRadius: 6,
                  background: "transparent",
                  border: "none",
                  color: C.inkMuted,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  lineHeight: 1,
                }}
              >
                ⋯
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  style={{
                    position: "absolute",
                    bottom: "calc(100% + 4px)",
                    right: 0,
                    minWidth: 130,
                    background: "#fff",
                    border: `1px solid ${C.borderSoft}`,
                    borderRadius: 8,
                    boxShadow: "0 6px 18px rgba(0,0,0,0.10)",
                    padding: 4,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    zIndex: 60,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); setEditing(true); }}
                    role="menuitem"
                    style={{ textAlign: "left", padding: "7px 10px", borderRadius: 6, background: "transparent", border: "none", color: C.ink, fontSize: 12.5, fontWeight: 500, cursor: "pointer", fontFamily: FONT }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={commitDelete}
                    role="menuitem"
                    style={{ textAlign: "left", padding: "7px 10px", borderRadius: 6, background: "transparent", border: "none", color: "#991B1B", fontSize: 12.5, fontWeight: 500, cursor: "pointer", fontFamily: FONT }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        {/* Reaction chips */}
        {m.reactions && m.reactions.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4, justifyContent: mine ? "flex-end" : "flex-start" }}>
            {m.reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => canReact && toggleReaction(r.emoji)}
                aria-label={`${r.count} reacted with ${r.emoji}${r.mine ? " (you)" : ""}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: r.mine ? C.accentSoft : "rgba(11,11,13,0.04)",
                  border: r.mine ? `1px solid ${C.accent}` : `1px solid ${C.borderSoft}`,
                  color: r.mine ? C.accent : C.ink,
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: canReact ? "pointer" : "default",
                  fontFamily: FONT,
                }}
              >
                <span>{r.emoji}</span>
                <span>{r.count}</span>
              </button>
            ))}
          </div>
        )}
        <div style={{ fontSize: 10, color: C.inkDim, marginTop: 3, textAlign: mine ? "right" : "left" }}>
          {formatTime(m.created_at)}
          {mine && showSeen && (
            <span style={{ marginLeft: 6, color: C.accent, fontWeight: 600 }}>· Seen</span>
          )}
          {actionError && (
            <span style={{ color: "#991B1B", marginLeft: 6, fontWeight: 600 }}>· {actionError}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Client-side chat-card dispatcher — mirrors the admin shell's
 * renderChatCardForMessage but with client-appropriate actions only.
 * Returns null for kinds the client surface doesn't render (admin-only
 * cards like admin_suggested_talent, coordinator_request).
 */
function renderClientChatCard(
  kind: string,
  payload: Record<string, unknown>,
  ctx: { onJumpToOffer?: () => void; onPayNow?: (amountLabel: string) => void },
): React.ReactNode {
  const get = <T,>(k: string, fallback: T): T => (payload[k] as T) ?? fallback;

  switch (kind) {
    case "offer_event": {
      const status = get<"draft" | "sent" | "accepted" | "declined" | "countered">("status", "sent");
      const totalLabel = get<string>("total_label", "—");
      const hint = get<string>("hint", "Tap to review");
      return (
        <button
          type="button"
          onClick={ctx.onJumpToOffer}
          style={{
            textAlign: "left",
            background: "#fff",
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: "12px 14px",
            cursor: ctx.onJumpToOffer ? "pointer" : "default",
            fontFamily: FONT,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            width: "100%",
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Offer · {status}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.ink, fontFamily: FONT_DISPLAY }}>
            {totalLabel}
          </div>
          <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
            {hint}
          </div>
        </button>
      );
    }
    case "payment_request":
    case "payment_paid": {
      const amountLabel = get<string>("amount_label", "—");
      const paid = kind === "payment_paid";
      return (
        <div
          style={{
            background: paid ? "rgba(16,185,129,0.06)" : "#fff",
            border: `1px solid ${paid ? "rgba(16,185,129,0.20)" : C.border}`,
            borderRadius: 12,
            padding: "12px 14px",
            fontFamily: FONT,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: paid ? "#047857" : C.accent, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Payment {paid ? "received" : "requested"}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.ink, fontFamily: FONT_DISPLAY }}>
            {amountLabel}
          </div>
          {!paid && (
            <>
              {get<string>("hint", "") && (
                <div style={{ fontSize: 12, color: C.inkMuted }}>
                  {get<string>("hint", "")}
                </div>
              )}
              {ctx.onPayNow && (
                <button
                  type="button"
                  onClick={() => ctx.onPayNow!(amountLabel)}
                  style={{
                    marginTop: 6,
                    padding: "8px 14px",
                    borderRadius: 8,
                    background: "#0F4F3E",
                    color: "#fff",
                    border: "none",
                    fontFamily: FONT,
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    alignSelf: "flex-start",
                  }}
                >
                  Pay {amountLabel}
                </button>
              )}
            </>
          )}
        </div>
      );
    }
    case "call_sheet_update": {
      const changedField = get<string>("changed_field", "");
      const byName = get<string>("by_name", "");
      return (
        <div
          style={{
            background: "rgba(15,81,50,0.05)",
            border: `1px solid rgba(15,81,50,0.15)`,
            borderRadius: 12,
            padding: "10px 14px",
            fontFamily: FONT,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: "#0F5132", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Call sheet updated
          </div>
          <div style={{ fontSize: 13, color: C.ink, marginTop: 3 }}>
            {byName ? `${byName} updated` : "Updated"} <strong>{changedField}</strong>.
          </div>
        </div>
      );
    }
    case "booking_status":
    case "system_event": {
      const text = get<string>("text", "Status updated");
      return (
        <div
          style={{
            fontSize: 11.5,
            color: C.inkMuted,
            textAlign: "center",
            padding: "6px 12px",
            background: "rgba(11,11,13,0.03)",
            borderRadius: 999,
            display: "inline-block",
            margin: "0 auto",
            fontFamily: FONT,
          }}
        >
          {text}
        </div>
      );
    }
    // Admin/staff-only cards — fall through to plain body render.
    case "coordinator_request":
    case "talent_rate":
    case "admin_suggested_talent":
    default:
      return null;
  }
}

function EmptyList({ onCreate }: { onCreate: () => void }) {
  return (
    <div style={{ padding: "24px 16px", textAlign: "center", color: C.inkMuted, fontFamily: FONT }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: C.ink }}>No conversations yet</div>
      <div style={{ fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
        Start your first inquiry to get a project going.
      </div>
      <button
        type="button"
        onClick={onCreate}
        style={{
          height: 32,
          padding: "0 14px",
          borderRadius: 8,
          background: C.ink,
          color: "#fff",
          border: "none",
          cursor: "pointer",
          fontFamily: FONT,
          fontSize: 12.5,
          fontWeight: 600,
        }}
      >
        + New inquiry
      </button>
    </div>
  );
}

function EmptyDetail({ onCreate }: { onCreate: () => void }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 14, color: C.inkMuted, fontFamily: FONT, padding: 24 }}>
      <div style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>Select a project</div>
      <div style={{ fontSize: 12.5, textAlign: "center", maxWidth: 320 }}>
        Pick an inquiry from the list to see your conversation with the coordinator.
      </div>
      <button
        type="button"
        onClick={onCreate}
        style={{
          height: 32,
          padding: "0 14px",
          borderRadius: 8,
          background: "#fff",
          color: C.ink,
          border: `1px solid ${C.border}`,
          cursor: "pointer",
          fontFamily: FONT,
          fontSize: 12.5,
          fontWeight: 600,
        }}
      >
        + Start a new inquiry
      </button>
    </div>
  );
}

function formatDate(d: string): string {
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return d;
  }
}

function formatTime(d: string): string {
  try {
    const dt = new Date(d);
    const today = new Date();
    const sameDay = dt.toDateString() === today.toDateString();
    if (sameDay) return dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " · " + dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return d;
  }
}
