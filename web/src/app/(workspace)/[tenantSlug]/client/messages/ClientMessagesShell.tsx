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

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClientInquiryRow } from "../../_data-bridge";
import type { WorkspaceMessage } from "../../_data-bridge/inquiries-messages";
import type { ClientInquiryDetails } from "../../_data-bridge/client-inquiry-details";
import { InquiryDrawer } from "@/components/inquiry/InquiryDrawer";
import { DetailsTab } from "./DetailsTab";

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
  return STAGE_COLORS[s] ?? { bg: "rgba(11,11,13,0.06)", fg: "#52525B", label: s };
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
              loadingMessages={loadingThread}
              details={details}
              loadingDetails={loadingDetails}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              tenantSlug={tenantSlug}
              onBack={() => setMobilePane("list")}
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
  loadingMessages,
  details,
  loadingDetails,
  activeTab,
  onTabChange,
  tenantSlug,
  onBack,
}: {
  inq: ClientInquiryRow;
  messages: WorkspaceMessage[];
  loadingMessages: boolean;
  details: ClientInquiryDetails | null;
  loadingDetails: boolean;
  activeTab: ThreadTab;
  onTabChange: (tab: ThreadTab) => void;
  tenantSlug: string;
  onBack: () => void;
}) {
  const stage = stageStyle(inq.status);
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
              <span style={{ padding: "1px 6px", borderRadius: 999, background: stage.bg, color: stage.fg, fontWeight: 700, fontSize: 9.5 }}>
                {stage.label}
              </span>
              {inq.event_date && <span>· {formatDate(inq.event_date)}</span>}
              {inq.event_location && <span>· {inq.event_location}</span>}
            </div>
          </div>
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
          <ChatThreadBody inq={inq} messages={messages} loading={loadingMessages} tenantSlug={tenantSlug} />
        )}
        {activeTab === "details" && (
          <DetailsTab details={loadingDetails ? null : details} />
        )}
        {activeTab === "lineup" && (
          <TabStubPanel
            title="Lineup"
            body="Proposed + confirmed talent for this project."
            bullets={
              details?.talent.selected.length
                ? details.talent.selected.map((t) => `${t.name} · ${t.status}`)
                : []
            }
            emptyHint={
              details?.talent.selection_mode === "agency_recommends"
                ? "Agency to recommend — the coordinator will propose talent shortly."
                : "No talent selected yet."
            }
          />
        )}
        {activeTab === "offer" && (
          <TabStubPanel
            title="Offer"
            body={
              details?.offer?.exists
                ? `Offer ${details.offer.status} · ${details.offer.total_client_price ?? "—"} ${details.offer.currency ?? ""}`
                : "No offer yet."
            }
            bullets={[]}
            emptyHint={
              details?.offer?.exists
                ? "Approve, counter, or decline UI ships in Phase E."
                : "Once your coordinator confirms talent, you'll receive an offer here."
            }
          />
        )}
        {activeTab === "files" && (
          <TabStubPanel
            title="Files & references"
            body={
              (details?.attachments.files.length ?? 0) + (details?.attachments.links.length ?? 0) > 0
                ? `${details!.attachments.files.length} files · ${details!.attachments.links.length} links`
                : "No files yet."
            }
            bullets={[
              ...(details?.attachments.files.map((f) => f.name) ?? []),
              ...(details?.attachments.links ?? []),
            ]}
            emptyHint="Upload comes in Phase F. For now, share references via Chat."
          />
        )}
      </div>

      {/* Compose hint — only on Chat tab */}
      {activeTab === "chat" && (
        <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.borderSoft}`, background: "#fff", fontSize: 12, color: C.inkMuted, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span>In-page composer coming next sprint.</span>
          <Link
            href={`/${tenantSlug}/client/inquiries/${inq.id}`}
            style={{ color: C.accent, textDecoration: "none", fontWeight: 600 }}
          >
            Open full thread →
          </Link>
        </div>
      )}
    </>
  );
}

function ChatThreadBody({
  inq, messages, loading,
}: {
  inq: ClientInquiryRow;
  messages: WorkspaceMessage[];
  loading: boolean;
  tenantSlug: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);
  void inq;
  return (
    <div ref={scrollRef} style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}>
      {loading ? (
        <div style={{ color: C.inkDim, fontSize: 12, textAlign: "center", padding: 20 }}>Loading messages…</div>
      ) : messages.length === 0 ? (
        <div style={{ color: C.inkDim, fontSize: 12.5, textAlign: "center", padding: 30, fontStyle: "italic" }}>
          No messages yet. Your coordinator will reply here once they pick up your inquiry.
        </div>
      ) : (
        messages.map((m) => <Bubble key={m.id} m={m} />)
      )}
    </div>
  );
}

function TabStubPanel({
  title, body, bullets, emptyHint,
}: {
  title: string;
  body: string;
  bullets: string[];
  emptyHint: string;
}) {
  return (
    <div style={{ padding: "20px 22px", fontFamily: FONT }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.6 }}>
        {title}
      </div>
      <div style={{ marginTop: 6, fontSize: 14, color: C.ink, lineHeight: 1.5 }}>{body}</div>
      {bullets.length > 0 && (
        <ul style={{ margin: "10px 0 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
          {bullets.map((b, i) => (
            <li key={i} style={{ fontSize: 12.5, color: C.inkMuted, padding: "4px 8px", background: "rgba(11,11,13,0.03)", borderRadius: 6 }}>
              {b}
            </li>
          ))}
        </ul>
      )}
      <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 8, background: "rgba(11,11,13,0.02)", border: `1px dashed ${C.borderSoft}`, fontSize: 12, color: C.inkMuted, lineHeight: 1.5 }}>
        {emptyHint}
      </div>
    </div>
  );
}

// ─── Legacy ThreadPane (kept for reference; no longer used) ──────────────

function ThreadPane({
  inq,
  messages,
  loading,
  tenantSlug,
  onBack,
}: {
  inq: ClientInquiryRow;
  messages: WorkspaceMessage[];
  loading: boolean;
  tenantSlug: string;
  onBack: () => void;
}) {
  const stage = stageStyle(inq.status);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  return (
    <>
      {/* Thread header */}
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.borderSoft}`, background: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
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
            {inq.company || "Inquiry"}
          </div>
          <div style={{ fontSize: 11, color: C.inkMuted, display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
            <span style={{ padding: "1px 6px", borderRadius: 999, background: stage.bg, color: stage.fg, fontWeight: 700, fontSize: 9.5 }}>
              {stage.label}
            </span>
            {inq.event_date && <span>· {formatDate(inq.event_date)}</span>}
            {inq.event_location && <span>· {inq.event_location}</span>}
          </div>
        </div>
        <Link
          href={`/${tenantSlug}/client/inquiries/${inq.id}`}
          style={{
            height: 30,
            padding: "0 12px",
            borderRadius: 7,
            border: `1px solid ${C.borderSoft}`,
            display: "inline-flex",
            alignItems: "center",
            textDecoration: "none",
            color: C.ink,
            fontSize: 11.5,
            fontWeight: 600,
            fontFamily: FONT,
            background: "#fff",
          }}
        >
          Open details →
        </Link>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 10, background: C.surfaceAlt }}>
        {loading ? (
          <div style={{ color: C.inkDim, fontSize: 12, textAlign: "center", padding: 20 }}>Loading messages…</div>
        ) : messages.length === 0 ? (
          <div style={{ color: C.inkDim, fontSize: 12.5, textAlign: "center", padding: 30, fontStyle: "italic" }}>
            No messages yet. Your coordinator will reply here once they pick up your inquiry.
          </div>
        ) : (
          messages.map((m) => <Bubble key={m.id} m={m} />)
        )}
      </div>

      {/* Compose hint — actual send still happens on the detail page */}
      <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.borderSoft}`, background: "#fff", fontSize: 12, color: C.inkMuted, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span>Open the inquiry to reply with the full composer.</span>
        <Link
          href={`/${tenantSlug}/client/inquiries/${inq.id}`}
          style={{ color: C.accent, textDecoration: "none", fontWeight: 600 }}
        >
          Open thread →
        </Link>
      </div>
    </>
  );
}

function Bubble({ m }: { m: WorkspaceMessage }) {
  const mine = m.is_mine;
  return (
    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
      <div style={{ maxWidth: "78%" }}>
        {!mine && (
          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkMuted, marginBottom: 3, letterSpacing: 0.3 }}>
            {m.sender_name}
          </div>
        )}
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
        <div style={{ fontSize: 10, color: C.inkDim, marginTop: 3, textAlign: mine ? "right" : "left" }}>
          {formatTime(m.created_at)}
        </div>
      </div>
    </div>
  );
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
