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

import { useState, useRef, useEffect, useMemo, useCallback, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { ThreadSearch, type ThreadSearchMessage, type JumpTarget } from "@/components/thread-search/ThreadSearch";
import { StatusSheet, type StatusSheetData, type StageStatus, type OfferStatus, type PaymentStatus, type TalentParticipationRow } from "@/components/messages-status-sheet/StatusSheet";
import { PayNowSheet } from "@/components/chat-cards/PayNowSheet";
import {
  OfferCard,
  PaymentRequestCard,
  BookingConfirmedCard,
  BalanceDueCard,
  CallSheetUpdateCard,
  SystemEventCard,
} from "@/components/chat-cards/ChatCard";
import { LineupAddTalentPicker } from "./LineupAddTalentPicker";
import { isMutablePhase } from "@/lib/inquiry/inquiry-lifecycle";
import { addReaction, removeReaction } from "@/lib/server-actions/message-reactions";
import { StarButton } from "@/components/chat-interactions/StarButton";
import { PinButton } from "@/components/chat-interactions/PinButton";
import { PinnedStrip } from "@/components/chat-interactions/PinnedStrip";
import { usePinnedMessages } from "@/components/chat-interactions/usePinnedMessages";
import { VoiceRecorderButton } from "@/components/chat-interactions/VoiceRecorderButton";
import { VoiceNotePlayer } from "@/components/chat-interactions/VoiceNotePlayer";
import { readVoiceMetaFromMessageMetadata } from "@/lib/messages/voice-meta";
import { renderMessageMarkdown } from "@/lib/messages/markdown";
import { LinkPreview, firstHttpUrl, TypingRow } from "@/components/messages/thread-enhancements";
import { useThreadPresence } from "@/lib/realtime/presence";

const DEFAULT_REACTION_SET = ["👍", "❤️", "🎉", "😂", "😮", "🙏"] as const;
import { useRouter } from "next/navigation";
import type { ClientInquiryRow } from "../../_data-bridge";
import type { WorkspaceMessage } from "../../_data-bridge/inquiries-messages";
import type { ClientInquiryDetails } from "../../_data-bridge/client-inquiry-details";
import { InquiryDrawer } from "@/components/inquiry/InquiryDrawer";
import { ThreadShell } from "@/components/shared/ThreadShell";
import { clientInquiryMatchesFilter, toClientThreadItems } from "./client-thread-adapter";
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
  // Reconcile by ROW ID, never body text. The composer swaps each
  // optimistic `tmp-` bubble's id to the canonical row id (returned by the
  // send action) the instant the server accepts it, so by the time this
  // refetch lands every sent bubble already carries its real id. That makes
  // the merge a pure by-id operation — two messages with identical bodies
  // (e.g. "ok" sent twice) can no longer collide and drop/duplicate, which
  // was the body-match bug (audit #15). Three guarantees:
  //   1. A locally-held row is replaced by its canonical server version
  //      (real created_at / sender_user_id / seen_at / reactions).
  //   2. A still-optimistic tmp- bubble with no server row yet stays visible
  //      — protects against the "1-second vanish" on a transient empty read.
  //   3. Server rows we didn't have locally (coordinator auto-ack, the other
  //      party's messages) are appended in chronological order, deduped by id.
  useEffect(() => {
    function onOk(e: Event) {
      const detail = (e as CustomEvent<{ inquiryId: string }>).detail;
      if (!detail?.inquiryId || detail.inquiryId !== activeId) return;
      fetch(`/api/client/messages?inquiry=${encodeURIComponent(detail.inquiryId)}`)
        .then((r) => (r.ok ? r.json() : { messages: null }))
        .then((j: { messages: WorkspaceMessage[] | null }) => {
          if (!j.messages) return;
          const serverMsgs = j.messages;
          setMessages((prev) => {
            const serverById = new Map(serverMsgs.map((m) => [m.id, m]));
            // Replace each locally-held row with its canonical server version;
            // leave still-optimistic tmp- bubbles (no server row yet) as-is.
            const merged = prev.map((m) => serverById.get(m.id) ?? m);
            const haveIds = new Set(merged.map((m) => m.id));
            // Append server rows we don't have yet — by id, never body text.
            const incoming = serverMsgs.filter((m) => !haveIds.has(m.id));
            return [...merged, ...incoming].sort((a, b) =>
              a.created_at.localeCompare(b.created_at),
            );
          });
          // Server data is fresh — re-pull the inbox so the row that
          // just received a new message bubbles to the top (the bridge
          // sorts by last_message_at desc, see clients.ts). This keeps
          // the list ordering aligned with the user's mental model:
          // the conversation they last engaged with is on top.
          router.refresh();
        })
        .catch(() => { /* leave optimistic bubble; user will see it reconcile on next switch */ });
    }
    window.addEventListener("client-message-send-ok", onOk);
    return () => window.removeEventListener("client-message-send-ok", onOk);
  }, [activeId, router]);

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

  // Viewer user ID — fetched once for is_mine determination in realtime events.
  // Mirrored into state so child panes (typing presence) can read a stable id.
  const viewerUserIdRef = useRef<string | null>(null);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      viewerUserIdRef.current = data.user?.id ?? null;
      setViewerUserId(data.user?.id ?? null);
    });
  }, []);

  // Realtime — push incoming messages into state as they arrive on the
  // active inquiry's private thread. Channel is torn down and recreated
  // on inquiry switch. Own messages are skipped (handled by the optimistic /
  // reconcile path in ChatComposer to avoid dedup conflicts with tmp- ids).
  useEffect(() => {
    if (!activeId) return;
    const supabase = createClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`client_msg:${activeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "inquiry_messages", filter: `inquiry_id=eq.${activeId}` },
        (payload) => {
          const row = payload.new as {
            id: string; sender_user_id: string | null; body: string;
            created_at: string; thread_type: string;
          };
          if (row.thread_type !== "private") return;
          let appended = false;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            const isMine = viewerUserIdRef.current != null && row.sender_user_id === viewerUserIdRef.current;
            if (isMine) return prev;
            const knownName = prev.find((m) => m.sender_user_id === row.sender_user_id)?.sender_name;
            appended = true;
            return [...prev, {
              id: row.id,
              sender_user_id: row.sender_user_id ?? "",
              sender_name: knownName ?? (row.sender_user_id?.slice(0, 8) ?? "Unknown"),
              body: row.body,
              created_at: row.created_at,
              is_mine: false,
            }];
          });
          // Pull the inbox again so the just-updated thread bubbles to
          // top, the preview line refreshes, and the unread badge ticks.
          if (appended) router.refresh();
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel).catch(() => {}); };
  }, [activeId, router]);

  // Filter predicate lifted VERBATIM into the client role adapter
  // (client-thread-adapter.ts) — pure + oracle-pinned, behaviour
  // byte-for-byte unchanged (remediation plan §3/§4, Phase 2).
  const filtered = inquiries.filter((i) => clientInquiryMatchesFilter(i, filter, search));

  // O(1) lookup for the bespoke renderRow slot (ids ⊆ filtered ⊆ inquiries).
  const rowById = useMemo(
    () => new Map(inquiries.map((i) => [i.id, i])),
    [inquiries],
  );

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

      {/* ─── Two-pane shell — composed by the shared <ThreadShell>
          primitive (remediation plan §3/§4, Phase 2 strangler step 2).
          Every bespoke client pixel (list header, InquiryRow,
          ThreadPaneWithTabs, the grid + mobile CSS) is injected through
          ThreadShell's optional slots; the shell owns ONLY the list
          iteration + region composition that was duplicated verbatim
          across the client/admin/talent consoles. The rendered DOM is
          byte-identical to the prior inline two-pane block — the slot
          markup below is the same JSX, relocated under the shell. ─── */}
      <ThreadShell
        role="client"
        inquiries={toClientThreadItems(filtered)}
        activeId={activeId}
        actions={{
          onSelectInquiry: (id) => {
            setActiveId(id);
            setMobilePane("thread");
          },
        }}
        listHeaderSlot={
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
        }
        emptyListSlot={<EmptyList onCreate={() => setDrawerOpen(true)} />}
        renderRow={(item, ctx) => {
          const inq = rowById.get(item.id);
          if (!inq) return null;
          return <InquiryRow inq={inq} active={ctx.active} onClick={ctx.select} />;
        }}
        details={
          active ? (
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
              roster={roster}
              viewerUserId={viewerUserId}
              onBack={() => setMobilePane("list")}
              onAfterOfferAction={() => router.refresh()}
            />
          ) : (
            <EmptyDetail onCreate={() => setDrawerOpen(true)} />
          )
        }
        scaffold={(regions) => (
          <div
            data-tulala-messages-shell
            data-mobile-pane={mobilePane}
            style={{
              display: "grid",
              ["--tulala-shell-cols" as never]: "340px 1fr",
              gridTemplateColumns: "var(--tulala-shell-cols)",
              // Constrain the single row to the container height — without this
              // `grid-auto-rows: auto` lets the thread column grow to its
              // natural content height (~1065px), which overflows the shell
              // and clips the composer below the visible 720px area.
              gridTemplateRows: "minmax(0, 1fr)",
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
              {regions.listHeader}
              {/* List rows */}
              <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                {regions.list}
              </div>
            </div>

            {/* Thread pane */}
            <div data-pane="thread" style={{ display: "flex", flexDirection: "column", minHeight: 0, background: C.surfaceAlt, overflow: "hidden" }}>
              {regions.thread}
            </div>
          </div>
        )}
      />

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

type RowChip = {
  label: string;
  bg: string;
  color: string;
  title?: string;
  uppercase?: boolean;
  fontSize?: number;
  padding?: string;
};

function InquiryRow({ inq, active, onClick }: { inq: ClientInquiryRow; active: boolean; onClick: () => void }) {
  const stage = stageStyle(inq.status);
  const company = inq.company || "Unnamed inquiry";
  const dateLabel = inq.event_date ? formatDate(inq.event_date) : null;
  const location = inq.event_location;
  const needsMe = inq.next_action_by === "client";
  const unread = inq.unreadCount > 0;
  const isDiscover =
    inq.source_channel === "discover_single_talent" ||
    inq.source_channel === "discover_shortlist";

  // Status + state chip stack — same metadata/status treatment as the polished
  // talent inbox (audit #15): an uppercase status pill, an amber "Your turn"
  // when the client owes the next move, a blue "N new" unread count, and
  // Discover provenance. The status pill carries the default 10.5/"2px 8px"
  // metric; secondary state chips are 10/"1px 7px" (mirrors talent toThreadItem).
  const chips: RowChip[] = [
    { label: stage.label, bg: stage.bg, color: stage.fg, uppercase: true },
  ];
  if (needsMe) {
    chips.push({ label: "Your turn", bg: "rgba(245,158,11,0.12)", color: "#92400E", fontSize: 10, padding: "1px 7px" });
  }
  if (unread) {
    chips.push({ label: `${inq.unreadCount} new`, bg: C.accentSoft, color: C.accent, fontSize: 10, padding: "1px 7px" });
  }
  if (isDiscover) {
    chips.push({
      label: `◎ via ${inq.source_channel === "discover_shortlist" ? "Shortlist" : "Discover"}`,
      bg: C.accentSoft,
      color: C.accent,
      fontSize: 10,
      padding: "1px 7px",
      uppercase: true,
      title:
        inq.source_channel === "discover_shortlist"
          ? "You added talent from a Discover shortlist."
          : "This inquiry started from Discover.",
    });
  }

  // Build the last-message preview line. "You: …" when the client sent
  // the newest message, plain body otherwise. Truncated to ~70 chars so
  // it never wraps in the 340px list column.
  const preview = inq.last_message_body
    ? (inq.last_message_from_me ? `You: ${inq.last_message_body}` : inq.last_message_body)
    : null;
  const previewTime = inq.last_message_at ? formatRelativeShort(inq.last_message_at) : null;

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
        gap: 4,
        fontFamily: FONT,
        position: "relative",
      }}
    >
      {unread && (
        <span style={{ position: "absolute", left: 4, top: 16, width: 6, height: 6, borderRadius: "50%", background: C.accent }} />
      )}
      {/* Row 1 — status + state chip stack (status · Your turn · N new · via Discover) */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {chips.map((c, i) => (
          <span
            key={`${inq.id}-chip-${i}`}
            title={c.title}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: c.padding ?? "2px 8px",
              borderRadius: 999,
              background: c.bg,
              color: c.color,
              fontSize: c.fontSize ?? 10.5,
              fontWeight: 700,
              letterSpacing: c.uppercase ? 0.3 : undefined,
              textTransform: c.uppercase ? "uppercase" : undefined,
              whiteSpace: "nowrap",
            }}
          >
            {c.label}
          </span>
        ))}
      </div>
      {/* Row 2 — Company / project title */}
      <div style={{ fontSize: 13, fontWeight: unread ? 700 : 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {company}
      </div>
      {/* Row 3 — Event date + location (only when set) */}
      {(dateLabel || location) && (
        <div style={{ fontSize: 11.5, color: C.inkMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {[dateLabel, location].filter(Boolean).join(" · ")}
        </div>
      )}
      {/* Row 4 — Last-message preview + relative time. This is what
          makes the row feel like a real conversation list (familiar
          WhatsApp / iMessage pattern): user sees the last thing said
          and roughly when it happened without opening the thread. */}
      {preview && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 1 }}>
          <span style={{
            flex: 1,
            minWidth: 0,
            fontSize: 12,
            color: unread ? C.ink : C.inkMuted,
            fontWeight: unread ? 500 : 400,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {preview}
          </span>
          {previewTime && (
            <span style={{ flexShrink: 0, fontSize: 10.5, color: C.inkDim, fontVariantNumeric: "tabular-nums" }}>
              {previewTime}
            </span>
          )}
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

/** Within-Chat sub-view (audit #15) — mirrors the talent shell's Chat/Activity
 *  split. "Chat" is the human conversation; "Activity" is the read-only
 *  money/booking timeline. */
type ChatMode = "chat" | "activity";

/** Message kinds that render as structured cards — the money/booking/system
 *  timeline shown in the thread's "Activity" sub-view. Mirrors the talent
 *  shell's MONEY_KINDS, limited to the kinds the client card renderer actually
 *  draws (renderClientChatCard). Everything else — plain text, plus staff-only
 *  kinds that fall through to a text bubble — stays in "Chat", so no message is
 *  ever hidden from both views. */
const CLIENT_ACTIVITY_KINDS = new Set<string>([
  "offer_event",
  "payment_request",
  "payment_paid",
  "booking_confirmed",
  "call_sheet_update",
  "booking_status",
  "system_event",
]);

function isClientActivityMessage(m: WorkspaceMessage): boolean {
  const kind = m.message_kind ?? "text";
  return kind !== "text" && CLIENT_ACTIVITY_KINDS.has(kind);
}

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
  roster,
  viewerUserId,
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
  roster: TalentOption[];
  viewerUserId: string | null;
  onBack: () => void;
  onAfterOfferAction?: () => void;
}) {
  const stage = stageStyle(inq.status);
  const router = useRouter();
  const [statusSheetOpen, setStatusSheetOpen] = useState(false);
  const [payNowSheet, setPayNowSheet] = useState<{ amountLabel: string } | null>(null);
  // Chat/Activity sub-view (audit #15) — mirrors the talent shell. Resets to
  // "chat" whenever the selected inquiry changes so a new thread always opens
  // on the conversation.
  const [chatMode, setChatMode] = useState<ChatMode>("chat");
  useEffect(() => { setChatMode("chat"); }, [inq.id]);
  // Inquiry-wide pinned messages (shared — everyone on the thread sees the
  // same set). Loaded client-side; refreshed after a pin toggle reconciles.
  // Client thread is the GROUP thread.
  const { pins, pinnedIds, refresh: refreshPins, removeLocal: removePinLocal } =
    usePinnedMessages(inq.id, "group");
  // Jump to a pinned message: scroll its bubble into view and pulse-highlight.
  const jumpToMessage = useCallback((messageId: string) => {
    const el = document.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.transition = "background 600ms";
    const prevBg = el.style.background;
    el.style.background = C.accentSoft;
    window.setTimeout(() => { el.style.background = prevBg; }, 900);
  }, []);
  // D7: count both money message cards AND inquiry_events for the Activity badge
  const activityCount = useMemo(
    () => messages.filter(isClientActivityMessage).length + (details?.activity.length ?? 0),
    [messages, details],
  );
  const statusSheetData = useMemo<StatusSheetData>(
    () => buildClientStatusSheetData(inq, details),
    [inq, details],
  );
  // Ephemeral typing presence (broadcast-only, no DB). Channel keyed per
  // inquiry; null when no viewer id so the hook safely no-ops.
  const { typingUsers, setTyping } = useThreadPresence({
    channelKey: viewerUserId ? `inquiry:${inq.id}:group` : null,
    userId: viewerUserId ?? "",
    displayName: client.displayName,
  });
  return (
    <>
      {/* Thread header — same as before, but tab strip appended below */}
      <div style={{ padding: "12px 16px 0", borderBottom: `1px solid ${C.borderSoft}`, background: "#fff" }}>
        <div className="flex items-center gap-2.5">
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
          <div className="flex-1 min-w-0">
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
          {details?.coordinator?.assigned && details.coordinator.name && (
            <CoordinatorChip
              name={details.coordinator.name}
              avatarUrl={details.coordinator.avatar_url}
            />
          )}
          <ClientThreadSearchTrigger
            messages={messages}
            onJumpOffer={details?.offer?.exists ? () => onTabChange("offer") : undefined}
            onJumpDetails={() => onTabChange("details")}
          />
        </div>

        {/* S0.10 — Next-action strip. Contextual one-liner about what's
            happening now / what the client needs to do. */}
        <NextActionStrip
          inquiry={inq}
          hasOffer={!!details?.offer?.exists}
          onTabChange={onTabChange}
        />

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

        {/* Chat / Activity sub-toggle — mirrors the talent shell (audit #15).
            "Chat" is the human conversation; "Activity" is the read-only
            money/booking timeline (offer → payment → booking). Only shown on
            the Chat tab; lives in the fixed header so it stays pinned. */}
        {activeTab === "chat" && (
          <div role="tablist" aria-label="Chat or activity" style={{ display: "flex", gap: 4, marginTop: 8, marginBottom: 10 }}>
            {([
              { id: "chat" as ChatMode, label: "Chat" },
              { id: "activity" as ChatMode, label: "Activity" },
            ]).map(({ id, label }) => {
              const isActive = chatMode === id;
              const count = id === "activity" ? activityCount : 0;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setChatMode(id)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 12px",
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
                  {count > 0 && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: 16,
                        height: 16,
                        padding: "0 4px",
                        borderRadius: 999,
                        background: isActive ? "rgba(255,255,255,0.22)" : C.accentSoft,
                        color: isActive ? "#fff" : C.accent,
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Pinned strip — inquiry-wide pinned messages, shared across the
            thread. Renders nothing when empty. Chat sub-view only. */}
        {activeTab === "chat" && chatMode === "chat" && pins.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <PinnedStrip
              pins={pins}
              onJump={jumpToMessage}
              onUnpin={async (messageId) => {
                removePinLocal(messageId);
                const { toggleMessagePin } = await import("@/lib/server-actions/message-pins");
                await toggleMessagePin(messageId, inq.id);
                void refreshPins();
              }}
              palette={{
                accent: C.accent,
                accentSoft: C.accentSoft,
                ink: C.ink,
                inkMuted: C.inkMuted,
                border: C.border,
                surface: "#fff",
              }}
            />
          </div>
        )}
      </div>

      {/* Tab body */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, background: activeTab === "chat" ? C.surfaceAlt : "rgba(11,11,13,0.02)" }}>
        {activeTab === "chat" && (
          <ChatThreadBody
            inq={inq}
            messages={messages}
            mode={chatMode}
            loading={loadingMessages}
            tenantSlug={tenantSlug}
            pitch={details?.pitch ?? null}
            details={details}
            onJumpToOffer={() => onTabChange("offer")}
            onPayNow={(cardAmountLabel) =>
              // #13-2 — open the Pay-now sheet on the REAL charge (the booking
              // transaction's gross from the loader's `payment` section), not
              // the offer total / stale card label. Falls back to the card's
              // own amount pre-charge (no transaction row yet).
              setPayNowSheet({ amountLabel: clientChargeLabel(details) ?? cardAmountLabel })
            }
            onMessagesChange={onMessagesChange}
            pinnedIds={pinnedIds}
            onPinChanged={() => { void refreshPins(); }}
          />
        )}
        {activeTab === "details" && (
          <DetailsTab details={loadingDetails ? null : details} tenantSlug={tenantSlug} />
        )}
        {activeTab === "lineup" && (
          <LineupTab
            details={loadingDetails ? null : details}
            tenantSlug={tenantSlug}
            inquiryId={inq.id}
            inquiryStatus={inq.status}
            roster={roster}
            onAdded={() => router.refresh()}
          />
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
          onPaid={() => router.refresh()}
        />
      )}

      {/* Ephemeral typing-presence row — between the message list and the
          composer. Renders nothing when no peer is typing. */}
      {activeTab === "chat" && chatMode === "chat" && (
        <TypingRow users={typingUsers} color={C.accent} />
      )}
      {/* Inline composer — only on the Chat tab's Chat sub-view. The Activity
          sub-view is a read-only money/booking timeline (audit #15). */}
      {activeTab === "chat" && chatMode === "chat" && (
        <ChatComposer
          inquiryId={inq.id}
          tenantSlug={tenantSlug}
          senderName={client.displayName}
          inquiryStatus={inq.status}
          hasOffer={!!details?.offer?.exists}
          details={details}
          onTyping={setTyping}
          onSent={(msg) => onMessagesChange((prev) => [...prev, msg])}
          onReconcileSent={(tempId, realId) =>
            onMessagesChange((prev) =>
              prev.map((m) => (m.id === tempId ? { ...m, id: realId } : m)),
            )
          }
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
  approved: "Approved",
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
  approved: "You've approved the offer. The agency is finalizing your booking — you'll get a confirmation when it's set.",
  booked: "Booking confirmed. Open the Today tab on event day for call sheet + coordinator contact.",
  converted: "Booking confirmed.",
  cancelled: "This project has been cancelled.",
};

/**
 * #13-2 — format the client's REAL charge (booking-transaction gross, GROSS
 * only) from the loader's `payment` section, for the Pay-now sheet + status.
 * Returns null when no transaction exists yet (pre-charge) so callers can fall
 * back to the triggering card's own amount. Mirrors the label format used in
 * buildClientStatusSheetData so the sheet and the status row read identically.
 */
function clientChargeLabel(details: ClientInquiryDetails | null): string | null {
  const p = details?.payment;
  if (!p || p.amount_major == null) return null;
  return `${p.currency ?? "USD"} ${Number(p.amount_major).toLocaleString()}`;
}

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

  // Real payment state from the booking + its transaction (loader `payment`
  // section). The client sees GROSS only (what they pay) — never the
  // platform/agency/talent split. Falls back to the offer total for the label
  // when the charge amount isn't recorded yet.
  const payment: { status: PaymentStatus; amountLabel?: string; nextAction?: string } = (() => {
    const p = details?.payment ?? null;
    const amountLabel = clientChargeLabel(details) ?? offerTotal;
    switch (p?.state) {
      case "requested":      return { status: "Requested", amountLabel, nextAction: "Open the Offer tab to pay and confirm your booking." };
      case "partially_paid": return { status: "Partially paid", amountLabel, nextAction: "A balance remains — open the Offer tab to pay the rest." };
      case "paid":           return { status: "Paid", amountLabel };
      case "refunded":       return { status: "Refunded", amountLabel };
      case "failed":         return { status: "Failed", amountLabel, nextAction: "The last payment attempt failed — try again from the Offer tab." };
      default:               return { status: "Not requested" };
    }
  })();

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

// ─── Coordinator chip ────────────────────────────────────────────────────
//
// Tiny avatar + first-name chip rendered in the thread header so the
// client always knows *who* on the agency side is handling their
// inquiry. Avatar falls back to initials when no photo is on file.
function CoordinatorChip({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl: string | null;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  const firstName = name.split(/\s+/)[0] ?? name;
  return (
    <div
      title={`${name} is coordinating your inquiry`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 9px 3px 3px",
        borderRadius: 999,
        background: "rgba(11,11,13,0.04)",
        border: `1px solid ${C.borderSoft}`,
        flexShrink: 0,
      }}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          aria-hidden
          style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover" }}
        />
      ) : (
        <span
          aria-hidden
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: C.accent,
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.2,
          }}
        >
          {initials || "?"}
        </span>
      )}
      <span style={{ fontSize: 11.5, fontWeight: 600, color: C.ink, fontFamily: FONT }}>
        {firstName}
      </span>
    </div>
  );
}

// ─── @mention helpers ─────────────────────────────────────────────────────

/** Extract participant names that can be @-mentioned from the details payload. */
function getMentionableParticipants(details: ClientInquiryDetails | null): string[] {
  const names: string[] = [];
  if (details?.coordinator?.assigned && details.coordinator.name) {
    names.push(details.coordinator.name);
  }
  for (const t of details?.talent.selected ?? []) {
    names.push(t.name);
  }
  return names;
}

/** Detect the @-mention prefix being typed at the current cursor position.
 *  Returns the prefix string (without @) when a mention is active, null otherwise. */
function detectMentionPrefix(text: string, caretPos: number): string | null {
  // Find the last @ before the caret that isn't preceded by a word char.
  const sub = text.slice(0, caretPos);
  const match = sub.match(/(^|[\s\n])@([^\s@]*)$/);
  if (!match) return null;
  return match[2]; // text after @
}

// ─── Inline composer ─────────────────────────────────────────────────────

function ChatComposer({
  inquiryId,
  tenantSlug,
  senderName,
  inquiryStatus,
  hasOffer,
  details,
  onTyping,
  onSent,
  onReconcileSent,
}: {
  inquiryId: string;
  tenantSlug: string;
  senderName: string;
  inquiryStatus?: string;
  hasOffer?: boolean;
  details?: ClientInquiryDetails | null;
  /** Ephemeral typing-presence beat. true on keystroke, false on send/blur. */
  onTyping?: (isTyping: boolean) => void;
  onSent: (msg: WorkspaceMessage) => void;
  /** Promote an optimistic `tmp-` bubble to its canonical server row id so
   *  the reconcile dedups by id, never body text (audit #15). */
  onReconcileSent: (tempId: string, realId: string) => void;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  // @mention picker state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number>(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Participant list for @-mention popover
  const mentionableNames = useMemo(() => getMentionableParticipants(details ?? null), [details]);
  const filteredMentions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return mentionableNames.filter((n) => n.toLowerCase().includes(q));
  }, [mentionQuery, mentionableNames]);

  /** Called when user selects a name from the mention popover.
   *  Inserts the first-name token so the @\S+ highlight always covers the whole token. */
  function insertMention(name: string) {
    const ta = textareaRef.current;
    const caret = ta?.selectionStart ?? body.length;
    // Use the first word of the name as the token so the @\S+ regex
    // highlights it as a single unbroken span (e.g. @Sofia rather than @Sofia Herrera).
    const token = name.split(/\s+/)[0] ?? name;
    // Replace from the @ position to the current caret with the @token
    const before = body.slice(0, mentionStart);
    const after = body.slice(caret);
    const insertion = `@${token} `;
    const next = before + insertion + after;
    setBody(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      ta?.focus();
      const pos = mentionStart + insertion.length;
      ta?.setSelectionRange(pos, pos);
    });
  }

  /** Track textarea changes to detect @ prefix. */
  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setBody(val);
    onTyping?.(val.length > 0);
    const caret = e.target.selectionStart ?? val.length;
    const prefix = detectMentionPrefix(val, caret);
    if (prefix !== null) {
      // Record the @ start position: caret - prefix.length - 1 (for @)
      const atPos = caret - prefix.length - 1;
      setMentionStart(atPos);
      setMentionQuery(prefix);
    } else {
      setMentionQuery(null);
    }
  }

  // Close mention picker on Escape
  useEffect(() => {
    if (mentionQuery === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMentionQuery(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mentionQuery]);

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
    onTyping?.(false);

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
      // Server accepted — promote the optimistic bubble to its canonical row
      // id immediately so the refetch reconciles by id, never body text
      // (audit #15: identical bodies used to collide). The refetch then swaps
      // in the canonical row data (created_at / seen_at). Fire-and-forget;
      // failure just leaves the (now real-id) bubble in place.
      if (res.messageId) onReconcileSent(tempId, res.messageId);
      window.dispatchEvent(
        new CustomEvent("client-message-send-ok", { detail: { inquiryId } }),
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
      // The announce send already succeeded — add the bubble with its
      // canonical row id directly so the refetch reconciles by id, never body
      // text (audit #15). Falls back to a tmp id only if the action somehow
      // returned no id (defensive; the engine always returns one).
      onSent({
        id: sendRes.messageId || `tmp-up-msg-${Date.now()}`,
        sender_user_id: "",
        sender_name: senderName,
        body: announceBody,
        created_at: new Date().toISOString(),
        is_mine: true,
      });
      window.dispatchEvent(
        new CustomEvent("client-message-send-ok", { detail: { inquiryId } }),
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
        <div className="relative shrink-0">
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
        {/* Voice note — record + send straight to the private thread. After a
            successful send we fire the same `client-message-send-ok` event the
            text path uses so the thread refetches (loadInquiryMessages now
            carries metadata.voice → the bubble renders the player). */}
        <VoiceRecorderButton
          inquiryId={inquiryId}
          threadType="private"
          accent={C.accent}
          idleColor={C.inkMuted}
          onSent={() => {
            window.dispatchEvent(
              new CustomEvent("client-message-send-ok", { detail: { inquiryId } }),
            );
          }}
          onError={(msg) => setError(msg)}
        />
        <div style={{ flex: 1, position: "relative" }}>
          {/* @mention popover — appears above the textarea when a mention is active */}
          {mentionQuery !== null && filteredMentions.length > 0 && (
            <div
              role="listbox"
              aria-label="Mention a participant"
              style={{
                position: "absolute",
                bottom: "calc(100% + 6px)",
                left: 0,
                minWidth: 180,
                maxWidth: 280,
                background: "#fff",
                border: `1px solid ${C.borderSoft}`,
                borderRadius: 10,
                boxShadow: "0 6px 20px rgba(0,0,0,0.10)",
                padding: 4,
                display: "flex",
                flexDirection: "column",
                gap: 2,
                zIndex: 65,
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.4, padding: "4px 8px 2px" }}>
                Mention a participant
              </div>
              {filteredMentions.map((name) => (
                <button
                  key={name}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onMouseDown={(e) => {
                    e.preventDefault(); // prevent textarea blur
                    insertMention(name);
                  }}
                  style={{
                    textAlign: "left",
                    padding: "7px 10px",
                    borderRadius: 7,
                    background: "transparent",
                    border: "none",
                    color: C.ink,
                    fontFamily: FONT,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(29,78,216,0.06)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                >
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      background: C.accentSoft,
                      color: C.accent,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")}
                  </span>
                  <span>@{name}</span>
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={body}
            onChange={handleBodyChange}
            onBlur={() => onTyping?.(false)}
            onKeyDown={(e) => {
              // Cmd/Ctrl+Enter sends; plain Enter inserts newline on mobile.
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
              // Tab / ArrowDown — close mention picker without inserting (user can click)
              if (e.key === "Tab" && mentionQuery !== null) {
                setMentionQuery(null);
              }
            }}
            placeholder="Reply to your coordinator…"
            rows={1}
            disabled={pending}
            style={{
              width: "100%",
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
        </div>
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
        ⌘ + Enter to send · type @ to mention a participant
      </div>
    </div>
  );
}

// ─── Activity event items ────────────────────────────────────────────────────
//
// D7 — enrich the Activity sub-tab with structured inquiry_events rows.
// These come from `details.activity` and show field diffs, money milestones,
// and booking status changes in a clean read-only timeline.

type ActivityEventItem = ClientInquiryDetails["activity"][number];

/** Human-readable label + icon for each client-visible event type. */
const ACTIVITY_EVENT_META: Record<string, { icon: string; label: (e: ActivityEventItem) => string }> = {
  "inquiry.submitted":              { icon: "📝", label: () => "Inquiry submitted" },
  "inquiry.moved_to_coordination":  { icon: "🎯", label: () => "Moved to coordination" },
  "inquiry.details_updated":        { icon: "✏️", label: () => "Details updated" },
  "inquiry.frozen":                 { icon: "🔒", label: () => "Inquiry paused" },
  "inquiry.unfrozen":               { icon: "🔓", label: () => "Inquiry resumed" },
  "inquiry.archived":               { icon: "📦", label: () => "Inquiry archived" },
  "inquiry.cancelled":              { icon: "✖️", label: () => "Inquiry cancelled" },
  "coordinator.assigned":           { icon: "👤", label: (e) => e.actor_name ? `${e.actor_name} assigned as coordinator` : "Coordinator assigned" },
  "coordinator.accepted":           { icon: "✅", label: (e) => e.actor_name ? `${e.actor_name} accepted this inquiry` : "Coordinator accepted" },
  "roster.talent_invited":          { icon: "🌟", label: () => "Talent added to lineup" },
  "roster.talent_accepted":         { icon: "✅", label: () => "Talent confirmed" },
  "roster.talent_declined":         { icon: "❌", label: () => "Talent declined" },
  "offer.created":                  { icon: "💰", label: () => "Offer drafted" },
  "offer.sent":                     { icon: "📤", label: () => "Offer sent for review" },
  "offer.client_rejected":          { icon: "↩️", label: () => "Offer returned for revision" },
  "approval.submitted":             { icon: "👍", label: (e) => e.actor_name ? `${e.actor_name} approved` : "Approval received" },
  "approval.all_complete":          { icon: "🎉", label: () => "All parties approved — ready to book" },
  "booking.created":                { icon: "📅", label: () => "Booking confirmed" },
  "payment_requested":              { icon: "💳", label: () => "Payment requested" },
  "payment_paid":                   { icon: "✅", label: () => "Payment received" },
  "booking_confirmed":              { icon: "🎬", label: () => "Booking confirmed — all set!" },
};

/** Format a field-diff entry from the `changed` payload of inquiry.details_updated. */
function formatFieldDiff(fieldName: string, from: unknown, to: unknown): string {
  const label = ({
    event_date: "Date",
    event_location: "Location",
    message: "Brief",
    quantity: "Quantity",
  } as Record<string, string>)[fieldName] ?? fieldName.replace(/_/g, " ");

  const fmt = (v: unknown): string => {
    if (v == null || v === "") return "(none)";
    if (typeof v === "string") {
      // Dates: try ISO date formatting
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        try {
          return new Date(v + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
        } catch { return v; }
      }
      // Truncate long strings (brief)
      return v.length > 60 ? v.slice(0, 60) + "…" : v;
    }
    return String(v);
  };

  return `${label}: ${fmt(from)} → ${fmt(to)}`;
}

function ActivityEventRow({ event }: { event: ActivityEventItem }) {
  const meta = ACTIVITY_EVENT_META[event.event_type];
  const icon = meta?.icon ?? "•";
  const label = meta ? meta.label(event) : event.event_type.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  // For details_updated: render field diffs inline
  const changed = event.event_type === "inquiry.details_updated"
    ? (event.payload?.changed as Record<string, { from: unknown; to: unknown }> | undefined)
    : undefined;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 10,
        background: "#fff",
        border: `1px solid ${C.borderSoft}`,
        fontFamily: FONT,
      }}
    >
      <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, lineHeight: 1.4 }}>
          {label}
        </div>
        {changed && Object.keys(changed).length > 0 && (
          <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
            {Object.entries(changed).map(([field, diff]) => (
              <div
                key={field}
                style={{
                  fontSize: 11.5,
                  color: C.inkMuted,
                  background: "rgba(29,78,216,0.04)",
                  borderLeft: `2px solid ${C.accent}`,
                  borderRadius: "0 6px 6px 0",
                  padding: "3px 8px",
                  lineHeight: 1.4,
                }}
              >
                {formatFieldDiff(field, diff.from, diff.to)}
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 10.5, color: C.inkDim, marginTop: 4 }}>
          {formatTime(event.created_at)}
          {event.actor_name && event.event_type !== "coordinator.assigned" && event.event_type !== "coordinator.accepted" && (
            <span style={{ marginLeft: 5 }}>· {event.actor_name}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatThreadBody({
  inq, messages, mode, loading, tenantSlug, pitch, details, onJumpToOffer, onPayNow, onMessagesChange,
  pinnedIds, onPinChanged,
}: {
  inq: ClientInquiryRow;
  messages: WorkspaceMessage[];
  mode: ChatMode;
  loading: boolean;
  tenantSlug: string;
  pitch: ClientInquiryDetails["pitch"];
  details: ClientInquiryDetails | null;
  onJumpToOffer?: () => void;
  onPayNow?: (amountLabel: string) => void;
  onMessagesChange?: (next: WorkspaceMessage[] | ((prev: WorkspaceMessage[]) => WorkspaceMessage[])) => void;
  pinnedIds?: Set<string>;
  onPinChanged?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // "Chat" shows the human conversation (text bubbles + any staff-only kinds
  // that fall through to a plain bubble); "Activity" shows only the
  // money/booking/system cards as a read-only timeline. The two are a strict
  // partition so no message is hidden from both views (audit #15).
  const visible = useMemo(
    () =>
      mode === "activity"
        ? messages.filter(isClientActivityMessage)
        : messages.filter((m) => !isClientActivityMessage(m)),
    [messages, mode],
  );

  // D7 — Build a merged activity timeline for the Activity sub-view.
  // Combine money/booking message cards with inquiry_events rows from `details.activity`.
  // Sort chronologically (oldest first); deduplicate by semantic overlap where possible.
  const activityTimeline = useMemo<
    Array<{ kind: "message"; msg: WorkspaceMessage } | { kind: "event"; event: ActivityEventItem }>
  >(() => {
    if (mode !== "activity") return [];
    const msgItems: Array<{ kind: "message"; msg: WorkspaceMessage; ts: string }> =
      visible.map((m) => ({ kind: "message" as const, msg: m, ts: m.created_at }));

    // Inquiry events from the loader — these are the structural milestones.
    // Skip events whose type overlaps semantically with message cards already
    // shown (offer_event ↔ offer.sent, payment cards ↔ payment_requested/paid)
    // to avoid showing the same moment twice with different labels.
    const msgKindTypes = new Set(visible.map((m) => m.message_kind ?? "text"));
    const skipEventTypes = new Set<string>();
    if (msgKindTypes.has("offer_event")) skipEventTypes.add("offer.sent").add("offer.created");
    if (msgKindTypes.has("payment_request")) skipEventTypes.add("payment_requested");
    if (msgKindTypes.has("payment_paid")) skipEventTypes.add("payment_paid");
    if (msgKindTypes.has("booking_confirmed")) skipEventTypes.add("booking.created").add("booking_confirmed");

    const eventItems: Array<{ kind: "event"; event: ActivityEventItem; ts: string }> =
      (details?.activity ?? [])
        .filter((e) => !skipEventTypes.has(e.event_type))
        .map((e) => ({ kind: "event" as const, event: e, ts: e.created_at }));

    // Merge and sort by timestamp ascending (oldest first → timeline flows down)
    return [...msgItems, ...eventItems]
      .sort((a, b) => a.ts.localeCompare(b.ts))
      .map(({ kind, ...rest }) => {
        if (kind === "message") return { kind: "message" as const, msg: (rest as { msg: WorkspaceMessage }).msg };
        return { kind: "event" as const, event: (rest as { event: ActivityEventItem }).event };
      });
  }, [mode, visible, details]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [visible, activityTimeline.length]);

  const isEmpty = mode === "activity" ? activityTimeline.length === 0 : visible.length === 0;

  return (
    <div
      ref={scrollRef}
      role="log"
      aria-live="polite"
      aria-label={mode === "activity" ? "Booking activity timeline" : "Conversation messages"}
      style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}
    >
      {mode === "chat" && pitch && <PitchOriginBlock pitch={pitch} />}
      {loading ? (
        <ChatLoadingSkeleton />
      ) : isEmpty ? (
        <div style={{ color: C.inkDim, fontSize: 12.5, textAlign: "center", padding: 30, fontStyle: "italic" }}>
          {mode === "activity"
            ? "No activity yet. Offers, payments and booking confirmations will appear here as your booking progresses."
            : "No messages yet. Your coordinator will reply here once they pick up your inquiry."}
        </div>
      ) : mode === "activity" ? (
        // D7: merged activity timeline — inquiry_events + money message cards
        <>
          {activityTimeline.map((item) =>
            item.kind === "event" ? (
              <ActivityEventRow key={`ev-${item.event.id}`} event={item.event} />
            ) : (
              <Bubble
                key={item.msg.id}
                m={item.msg}
                showSeen={false}
                tenantSlug={tenantSlug}
                inquiryId={inq.id}
                onJumpToOffer={onJumpToOffer}
                onPayNow={onPayNow}
                onMessagesChange={undefined}
                pinnedIds={pinnedIds}
                onPinChanged={onPinChanged}
              />
            )
          )}
        </>
      ) : (
        (() => {
          // Find the latest is_mine message with a seen_at — only that one
          // gets the "Seen" pill so the indicator doesn't repeat down the
          // thread. Computed over the visible (filtered) list so the pill
          // tracks the sub-view the user is looking at.
          let lastSeenMineIdx = -1;
          for (let i = visible.length - 1; i >= 0; i--) {
            if (visible[i].is_mine && visible[i].seen_at) { lastSeenMineIdx = i; break; }
          }
          return visible.map((m, i) => (
            <Bubble
              key={m.id}
              m={m}
              showSeen={i === lastSeenMineIdx}
              tenantSlug={tenantSlug}
              inquiryId={inq.id}
              onJumpToOffer={onJumpToOffer}
              onPayNow={onPayNow}
              onMessagesChange={onMessagesChange}
              pinnedIds={pinnedIds}
              onPinChanged={onPinChanged}
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

// ─── Next-action strip (S0.10) ───────────────────────────────────────────

function NextActionStrip({
  inquiry,
  hasOffer,
  onTabChange,
}: {
  inquiry: ClientInquiryRow;
  hasOffer: boolean;
  onTabChange: (tab: ThreadTab) => void;
}) {
  // Map (status × next_action_by) → contextual message + optional CTA.
  type StripState = {
    icon: string;
    label: string;
    detail: string;
    tone: "neutral" | "client" | "agency" | "success";
    cta?: { label: string; onClick: () => void };
  };

  const state = ((): StripState | null => {
    const by = inquiry.next_action_by;
    switch (inquiry.status) {
      case "submitted":
        return {
          icon: "📥",
          label: by === "client" ? "Your turn" : "Coordinator reviewing",
          detail: by === "client"
            ? "Add anything else your coordinator should know."
            : "Typical reply within one business day.",
          tone: by === "client" ? "client" : "agency",
        };
      case "coordination":
        return {
          icon: "🎯",
          label: by === "client" ? "Your turn" : "Sourcing talent",
          detail: by === "client"
            ? "Reply to your coordinator's question to keep things moving."
            : "Coordinator is matching the right talent — proposals appear in Lineup.",
          tone: by === "client" ? "client" : "agency",
          cta: by === "client"
            ? undefined
            : { label: "View lineup", onClick: () => onTabChange("lineup") },
        };
      case "offer_pending":
      case "offer_sent":
        return {
          icon: "💰",
          label: hasOffer ? "Offer ready to review" : "Offer being drafted",
          detail: hasOffer
            ? "Open the Offer tab to approve or decline."
            : "Coordinator is finalizing line items — you'll get notified when it's ready.",
          tone: hasOffer ? "client" : "agency",
          cta: hasOffer
            ? { label: "Open offer", onClick: () => onTabChange("offer") }
            : undefined,
        };
      case "approved":
        return {
          icon: "✅",
          label: "Approved — booking soon",
          detail: "Coordinator is converting your approval into a confirmed booking.",
          tone: "agency",
        };
      case "booked":
      case "converted":
        return {
          icon: "🎬",
          label: "Booked",
          detail: "Day-of details will surface in your Today page on event day.",
          tone: "success",
          cta: { label: "View call sheet", onClick: () => onTabChange("details") },
        };
      case "cancelled":
      case "rejected":
        return {
          icon: "✖️",
          label: "Cancelled",
          detail: "This inquiry was cancelled. Start a new one anytime.",
          tone: "neutral",
        };
      default:
        return null;
    }
  })();

  if (!state) return null;

  const tonePalette: Record<StripState["tone"], { bg: string; border: string; ink: string }> = {
    neutral: { bg: "rgba(11,11,13,0.03)", border: C.borderSoft, ink: C.inkMuted },
    client:  { bg: C.accentSoft, border: "rgba(29,78,216,0.18)", ink: C.accent },
    agency:  { bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.20)", ink: "#92400E" },
    success: { bg: "rgba(15,81,50,0.06)", border: "rgba(15,81,50,0.18)", ink: "#0F5132" },
  };
  const p = tonePalette[state.tone];

  return (
    <div
      role="status"
      style={{
        marginTop: 10,
        padding: "8px 12px",
        background: p.bg,
        border: `1px solid ${p.border}`,
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontFamily: FONT,
      }}
    >
      <span style={{ fontSize: 16, flexShrink: 0 }}>{state.icon}</span>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 11.5, fontWeight: 700, color: p.ink, textTransform: "uppercase", letterSpacing: 0.4 }}>
          {state.label}
        </div>
        <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 1, lineHeight: 1.4 }}>
          {state.detail}
        </div>
      </div>
      {state.cta && (
        <button
          type="button"
          onClick={state.cta.onClick}
          style={{
            padding: "5px 10px",
            borderRadius: 7,
            background: "#fff",
            border: `1px solid ${p.border}`,
            color: p.ink,
            fontFamily: FONT,
            fontSize: 11.5,
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {state.cta.label}
        </button>
      )}
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

function LineupTab({
  details,
  tenantSlug,
  inquiryId,
  inquiryStatus,
  roster,
  onAdded,
}: {
  details: ClientInquiryDetails | null;
  tenantSlug?: string;
  inquiryId?: string;
  inquiryStatus?: string;
  roster?: TalentOption[];
  onAdded?: () => void;
}) {
  if (!details) {
    return <div style={{ padding: 24, color: C.inkMuted, fontFamily: FONT, fontSize: 13 }}>Loading lineup…</div>;
  }
  const list = details.talent.selected;
  const mode = details.talent.selection_mode;
  // 2.10: a client can propose adding a roster talent while the inquiry is still
  // mutable (pre-booking, not frozen). is_frozen isn't surfaced on the client
  // row yet → default false; the server action + engine block frozen writes.
  const canPropose =
    !!tenantSlug && !!inquiryId && !!roster && roster.length > 0 &&
    isMutablePhase(inquiryStatus ?? "", false);
  const lineupTalentIds = list
    .map((t) => (t as { talent_profile_id?: string | null }).talent_profile_id)
    .filter((id): id is string => Boolean(id));
  // D5.4 — rollup label from `lineup_status_summary` SQL fn.
  // D5.5 — cross-tenant context label (null for single-tenant).
  const statusLabel = details.lineup_status_label;
  const crossTenantLabel = details.cross_tenant_label;

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
        {/* D5.4 — top-level rollup banner. Always present (DB returns
            "No lineup yet" for empty inquiries). */}
        {statusLabel && statusLabel !== "No lineup yet" && (
          <div style={{
            marginTop: 8,
            padding: "8px 12px",
            borderRadius: 8,
            background: "rgba(15,79,62,0.06)",
            border: "1px solid rgba(15,79,62,0.18)",
            fontSize: 12.5,
            fontWeight: 600,
            color: "#0F4F3E",
            lineHeight: 1.4,
          }}>
            {statusLabel}
          </div>
        )}
        {/* D5.5 — cross-tenant context badge. Only renders when the
            inquiry's talents are routed to >1 owning party. Single-
            tenant case (today's dominant) leaves this null. */}
        {crossTenantLabel && (
          <div style={{
            marginTop: 6,
            padding: "6px 10px",
            borderRadius: 8,
            background: "rgba(91,107,160,0.08)",
            border: "1px solid rgba(91,107,160,0.20)",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11.5,
            fontWeight: 600,
            color: "#3B4B85",
          }}
          title="Each workspace independently coordinates their own talent. You see one unified view; behind the scenes the workspaces don't share notes."
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M3 6h6M6 3v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
            </svg>
            {crossTenantLabel}
          </div>
        )}
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
        <div className="flex flex-col gap-2">
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
              <div className="flex-1 min-w-0">
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

      {canPropose ? (
        <LineupAddTalentPicker
          tenantSlug={tenantSlug!}
          inquiryId={inquiryId!}
          roster={roster!}
          excludeIds={lineupTalentIds}
          onAdded={onAdded ?? (() => {})}
        />
      ) : null}
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
        <div className="flex flex-col gap-1.5">
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
  inquiryId,
  onJumpToOffer,
  onPayNow,
  onMessagesChange,
  pinnedIds,
  onPinChanged,
}: {
  m: WorkspaceMessage;
  showSeen?: boolean;
  tenantSlug?: string;
  inquiryId?: string;
  onJumpToOffer?: () => void;
  onPayNow?: (amountLabel: string) => void;
  onMessagesChange?: (next: WorkspaceMessage[] | ((prev: WorkspaceMessage[]) => WorkspaceMessage[])) => void;
  pinnedIds?: Set<string>;
  onPinChanged?: () => void;
}) {
  const mine = m.is_mine;
  const kind = m.message_kind ?? "text";
  // Voice notes render as an inline player bubble (handled below), never a
  // money/booking card. Detect from metadata so a tolerant parse wins.
  const voiceMeta = kind === "voice" ? readVoiceMetaFromMessageMetadata(m.metadata) : null;
  const card = kind !== "text" && kind !== "voice" ? renderClientChatCard(kind, m.card_payload ?? {}, { onJumpToOffer, onPayNow }) : null;

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

  // Voice note — inline audio player in a normal bubble (no edit/delete).
  if (voiceMeta) {
    return (
      <div data-message-id={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
        <div style={{ maxWidth: "78%" }}>
          {!mine && (
            <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkMuted, marginBottom: 3, letterSpacing: 0.3 }}>
              {m.sender_name}
            </div>
          )}
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 14,
              borderBottomRightRadius: mine ? 4 : 14,
              borderBottomLeftRadius: mine ? 14 : 4,
              background: mine ? C.ink : "#fff",
              border: mine ? "none" : `1px solid ${C.borderSoft}`,
            }}
          >
            <VoiceNotePlayer meta={voiceMeta} accent={C.accent} onDark={mine} />
          </div>
          <div style={{ fontSize: 10, color: C.inkDim, marginTop: 3, textAlign: mine ? "right" : "left", paddingRight: 2 }}>
            {formatTime(m.created_at)}
          </div>
        </div>
      </div>
    );
  }

  // Structured card — full-width, no chat-bubble chrome. No edit/delete for cards.
  if (card) {
    return (
      <div data-message-id={m.id} style={{ display: "flex", justifyContent: "stretch", flexDirection: "column", gap: 4, maxWidth: "92%", margin: mine ? "0 0 0 auto" : "0 auto 0 0" }}>
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
    <div data-message-id={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
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
              {renderMessageMarkdown(m.body ?? "")}
              {(() => {
                const url = firstHttpUrl(m.body);
                return url ? (
                  <LinkPreview
                    url={url}
                    colors={{
                      bg: mine ? "rgba(255,255,255,0.10)" : C.surface,
                      border: mine ? "rgba(255,255,255,0.24)" : C.borderSoft,
                      title: mine ? "#fff" : C.ink,
                      muted: mine ? "rgba(255,255,255,0.72)" : C.inkMuted,
                    }}
                  />
                ) : null;
              })()}
            </div>
          )}
          {canReact && !editing && (
            <div className="relative shrink-0">
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
          {!isOptimistic && inquiryId && !editing && (
            <StarButton
              messageId={m.id}
              inquiryId={inquiryId}
              starred={m.starred ?? false}
              compact
              onError={setActionError}
            />
          )}
          {!isOptimistic && inquiryId && !editing && (
            <PinButton
              messageId={m.id}
              inquiryId={inquiryId}
              pinned={pinnedIds?.has(m.id) ?? false}
              compact
              accent={C.accent}
              onError={setActionError}
              onChanged={() => onPinChanged?.()}
            />
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
 * Client-side chat-card dispatcher. Maps a message `kind` + payload to the
 * SHARED `@/components/chat-cards/ChatCard` components — the same green card
 * primitives the admin shell uses (admin-3 `renderChatCardForMessage`) — with
 * client-appropriate actions only. Audit #11 removed the forked blue
 * client-only card JSX that used to live here so there is one card renderer.
 *
 * Returns null for kinds the client surface doesn't render (staff-only cards
 * like admin_suggested_talent / coordinator_request / talent_rate) so the
 * caller falls back to the plain message body.
 */
function renderClientChatCard(
  kind: string,
  payload: Record<string, unknown>,
  ctx: { onJumpToOffer?: () => void; onPayNow?: (amountLabel: string) => void },
): React.ReactNode {
  const get = <T,>(k: string, fallback: T): T => (payload[k] as T) ?? fallback;

  switch (kind) {
    case "offer_event":
      // Whole-card deep-link to the Offer tab. The client decides on the offer
      // there (Approve / Counter / Decline) — never inline on the card.
      return (
        <OfferCard
          status={get<"draft" | "sent" | "accepted" | "declined" | "countered">("status", "sent")}
          totalLabel={get<string>("total_label", "—")}
          hint={get<string>("hint", "Tap to review")}
          onOpen={ctx.onJumpToOffer}
        />
      );
    case "payment_request": {
      const amountLabel = get<string>("amount_label", "—");
      // The client IS the payer — surface the Pay-now CTA. onPayNow opens the
      // checkout sheet on the REAL charge (see the onPayNow wiring / #13-2).
      return (
        <PaymentRequestCard
          amountLabel={amountLabel}
          status="requested"
          hint={get<string>("hint", "")}
          onPayNow={ctx.onPayNow ? () => ctx.onPayNow!(amountLabel) : undefined}
        />
      );
    }
    case "payment_paid":
      return <PaymentRequestCard amountLabel={get<string>("amount_label", "—")} status="paid" />;
    case "booking_confirmed":
      return (
        <BookingConfirmedCard
          totalLabel={get<string>("total_label", "")}
          summary={get<string>("summary", "Payment received — your booking is confirmed.")}
        />
      );
    case "balance_due": {
      // 6.3: the deposit settled; the client owes the remaining balance. Pay
      // balance reuses the same checkout flow — the admin creates the balance
      // txn (checkout_type='balance'), which becomes the active charge onPayNow
      // settles.
      const depositLabel = get<string>("deposit_label", "—");
      return (
        <BalanceDueCard
          depositLabel={depositLabel}
          hint={get<string>("hint", "")}
          onPayBalance={ctx.onPayNow ? () => ctx.onPayNow!(depositLabel) : undefined}
        />
      );
    }
    case "call_sheet_update":
      return (
        <CallSheetUpdateCard
          changedField={get<string>("changed_field", "")}
          byName={get<string>("by_name", "")}
        />
      );
    case "booking_status":
    case "system_event":
      return <SystemEventCard text={get<string>("text", "Status updated")} />;
    // Staff-only cards — the client surface never renders these.
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

/**
 * Short relative timestamp for inbox-row previews:
 *   • <60s     → "now"
 *   • <60m     → "5m"
 *   • <24h     → "3h"  /  same-day clock when sent today
 *   • <7d      → weekday ("Mon")
 *   • otherwise → "Oct 1" / "Oct 1, 2025"
 * Keeps the row scannable — no second component wraps.
 */
function formatRelativeShort(iso: string): string {
  try {
    const dt = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - dt.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return "now";
    if (diffMin < 60) return `${diffMin}m`;
    const isSameDay = dt.toDateString() === now.toDateString();
    if (isSameDay) {
      return dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    }
    const diffDays = Math.floor(diffMs / 86_400_000);
    if (diffDays < 7) {
      return dt.toLocaleDateString(undefined, { weekday: "short" });
    }
    if (dt.getFullYear() === now.getFullYear()) {
      return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }
    return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
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
