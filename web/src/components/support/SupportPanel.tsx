"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { Icon } from "@/components/admin/shell/internal/primitives";
import { COLORS, FONTS, RADIUS } from "./support-tokens";
import { supportPanelContainerStyle } from "./support-panel-geometry";
import { useCompactViewport } from "./use-compact-viewport";
import { useFocusTrap } from "./use-focus-trap";
import {
  useSupportRealtime,
  useSupportSessionRestore,
  useSupportUnread,
} from "./support-hooks";
import { SupportThreadView } from "./SupportThreadView";
import { SupportThreadHeader } from "./SupportThreadHeader";
import { Composer, NewTicketForm } from "./SupportPanelForms";
import type { SupportContract } from "./support-contract";
import { createClient } from "@/lib/supabase/client";
import { supportFrom } from "@/lib/support/support-from";
import { mapMessageRow, mapTicketRow, type SupportMessageRow, type SupportTicketRow, type SupportTicketSummary } from "@/lib/support/support-types";
import { getDiagnosticsSnapshot } from "@/lib/support/diagnostics/collector";
import { ReplayConsent } from "./ReplayConsent";
import { useReplayBuffer } from "@/lib/support/replay/SupportRecorderProvider";
import { uploadReplayForTicket } from "@/lib/support/replay/upload-replay";

type View = "home" | "tickets" | "thread" | "new";

export function SupportPanel({
  open,
  onClose,
  contract,
  tickets,
  setTickets,
  deepLinkTicketId = null,
}: {
  open: boolean;
  onClose: () => void;
  contract: SupportContract;
  /** Lifted to the launcher so its unread badge tracks panel activity live. */
  tickets: SupportTicketSummary[];
  setTickets: (updater: (prev: SupportTicketSummary[]) => SupportTicketSummary[]) => void;
  /** Ticket to open on mount (email "Reply in app" deep link). */
  deepLinkTicketId?: string | null;
}) {
  const t = useT();
  const compact = useCompactViewport();
  const trapRef = useFocusTrap<HTMLDivElement>(open && compact);
  const { view, ticketId, setView } = useSupportSessionRestore();
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);
  const [ticket, setTicket] = useState<SupportTicketRow | null>(null);
  const [ask, setAsk] = useState("");
  const [askError, setAskError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [attachReplay, setAttachReplay] = useState(false);
  const replay = useReplayBuffer();
  const unread = useSupportUnread(tickets);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (deepLinkTicketId) setView("thread", deepLinkTicketId);
  }, [deepLinkTicketId, setView]);

  // Keep the summaries in sync with what the user just did — the server
  // snapshot alone leaves badges stuck and new tickets invisible until reload.
  const patchSummary = useCallback(
    (id: string, patch: Partial<SupportTicketSummary>) => {
      setTickets((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    },
    [setTickets],
  );
  const prependSummary = useCallback(
    (row: SupportTicketSummary) => {
      setTickets((prev) => [row, ...prev.filter((x) => x.id !== row.id)]);
    },
    [setTickets],
  );
  const summaryFromCreate = useCallback(
    (id: string, ticketNumber: number, subject: string, preview: string): SupportTicketSummary => ({
      id,
      ticketNumber,
      subject,
      status: "open",
      waitingOn: "support",
      category: null,
      lastMessageAt: new Date().toISOString(),
      lastMessagePreview: preview,
      unread: false,
      requesterUserId: contract.userId,
      surface: contract.surface,
    }),
    [contract.userId, contract.surface],
  );

  const maybeAttachReplay = async (id: string) => {
    if (!attachReplay || !replay.enabled) return;
    try {
      await uploadReplayForTicket(id);
    } catch {
      /* fail-open */
    }
  };

  const requestAi = useCallback(async (id: string) => {
    setThinking(true);
    try {
      await fetch("/api/ai/support-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticketId: id }),
      });
    } catch {
      /* fail-open: the route persists a system nudge when the model is down */
    } finally {
      setThinking(false);
    }
  }, []);

  const onMessage = useCallback(
    (row: SupportMessageRow) => {
      setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
      if (row.messageKind !== "note") {
        patchSummary(row.ticketId, {
          lastMessagePreview: row.body.slice(0, 140),
          lastMessageAt: row.createdAt,
        });
      }
    },
    [patchSummary],
  );
  const onTicket = useCallback(
    (row: SupportTicketRow) => {
      setTicket(row);
      patchSummary(row.id, { status: row.status, waitingOn: row.waitingOn });
    },
    [patchSummary],
  );
  useSupportRealtime({ ticketId, onMessage, onTicket });

  useEffect(() => {
    if (!open || !ticketId) return;
    const supabase = createClient();
    if (!supabase) return;
    void (async () => {
      const { data: tRow } = await supportFrom(supabase, "support_tickets")
        .select("*")
        .eq("id", ticketId)
        .maybeSingle();
      const mapped = mapTicketRow(tRow);
      if (mapped) setTicket(mapped);
      const { data: msgs } = await supportFrom(supabase, "support_messages")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });
      setMessages((msgs ?? []).map(mapMessageRow).filter(Boolean) as SupportMessageRow[]);
      void contract.markRead({ ticketId });
      patchSummary(ticketId, { unread: false });
    })();
  }, [open, ticketId, contract, patchSummary]);

  // Bottom-anchor the thread: without this a long thread opens scrolled to
  // the top and incoming replies append off-screen.
  useEffect(() => {
    if (view !== "thread") return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [view, messages.length, thinking]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const submitAsk = async () => {
    const body = ask.trim();
    if (!body || sending) return;
    setSending(true);
    setAskError(null);
    const r = await contract.createTicket({
      tenantSlug: contract.tenantSlug,
      surface: contract.surface,
      body,
      originSlug: contract.originSlug ?? undefined,
      diagnostics: getDiagnosticsSnapshot(),
    });
    setSending(false);
    if (r.ok) {
      setAsk("");
      prependSummary(summaryFromCreate(r.ticketId, r.ticketNumber ?? 0, body.slice(0, 80), body));
      setView("thread", r.ticketId);
      void maybeAttachReplay(r.ticketId);
      void requestAi(r.ticketId);
    } else {
      // Keep the text — a failed send must never eat what the user typed.
      setAskError(t("dashboard.adminSupport.sendFailed"));
    }
  };

  if (!open) return null;

  return (
    <div
      ref={trapRef}
      id="tulala-support-panel"
      role="dialog"
      aria-label={t("dashboard.adminSupport.panelAria")}
      data-tulala-support-panel=""
      style={{
        ...supportPanelContainerStyle(compact),
        opacity: 1,
        transition: "opacity 160ms ease",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 16px 10px",
          borderBottom: `1px solid ${COLORS.borderSoft}`,
        }}
      >
        <div style={{ fontFamily: FONTS.display, fontSize: 16, fontWeight: 600, color: COLORS.ink }}>
          {t("dashboard.adminSupport.title")}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("dashboard.adminSupport.close")}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: COLORS.inkMuted,
            padding: 14,
            margin: -10,
            display: "flex",
          }}
        >
          <Icon name="x" size={16} />
        </button>
      </header>

      {view === "thread" ? (
        <SupportThreadHeader ticket={ticket} onBack={() => setView("tickets")} />
      ) : null}

      <div ref={scrollRef} style={{ flex: 1, overflow: "auto" }}>
        {view === "home" && (
          <HomeView
            firstName={contract.firstName}
            ask={ask}
            setAsk={setAsk}
            onSubmit={() => void submitAsk()}
            sending={sending}
            error={askError}
            recent={tickets.slice(0, 2)}
            onOpenTicket={(id) => setView("thread", id)}
            onStartTicket={() => setView("new")}
            replayEnabled={replay.enabled}
            attachReplay={attachReplay}
            setAttachReplay={setAttachReplay}
            onMessageOran={() => {
              void (async () => {
                setAskError(null);
                const r = await contract.createTicket({
                  tenantSlug: contract.tenantSlug,
                  surface: contract.surface,
                  body: t("dashboard.adminSupport.messageOranBody"),
                  messageOranDirectly: true,
                  diagnostics: getDiagnosticsSnapshot(),
                });
                if (r.ok) {
                  prependSummary(
                    summaryFromCreate(r.ticketId, r.ticketNumber ?? 0, "", ""),
                  );
                  void maybeAttachReplay(r.ticketId);
                  setView("thread", r.ticketId);
                } else {
                  setAskError(t("dashboard.adminSupport.sendFailed"));
                }
              })();
            }}
          />
        )}
        {view === "tickets" && (
          <TicketListView
            tickets={tickets}
            canSeeWorkspace={contract.canSeeWorkspaceTickets}
            userId={contract.userId}
            onOpen={(id) => setView("thread", id)}
          />
        )}
        {view === "thread" && (
          <SupportThreadView
            ticket={ticket}
            messages={messages}
            liveShareAvailable={contract.liveShareAvailable !== false}
            onRate={(rating) => {
              if (ticketId) void contract.rateTicket({ ticketId, rating });
            }}
            onRequestHuman={() => {
              if (ticketId) void contract.requestHuman({ ticketId });
            }}
            onCardAction={(action) => {
              if (action === "add-phone") setView("new");
              if (action === "talk-human" && ticketId) void contract.requestHuman({ ticketId });
            }}
            thinking={thinking}
          />
        )}
        {view === "new" && (
          <NewTicketForm
            contract={contract}
            replayEnabled={replay.enabled}
            attachReplay={attachReplay}
            setAttachReplay={setAttachReplay}
            onCreated={(id, ticketNumber, subject, body) => {
              prependSummary(summaryFromCreate(id, ticketNumber, subject, body));
              void maybeAttachReplay(id);
              setView("thread", id);
              void requestAi(id);
            }}
          />
        )}
      </div>

      {view === "thread" ? (
        <Composer
          disabled={!ticketId || ticket?.status === "closed"}
          onSend={async (body) => {
            if (!ticketId) return false;
            const r = await contract.sendMessage({ ticketId, body });
            if (r.ok) {
              // Optimistic append (deduped against the realtime INSERT by id)
              // so the message shows even when realtime lags or is down.
              if (r.messageId) {
                onMessage({
                  id: r.messageId,
                  ticketId,
                  tenantId: ticket?.tenantId ?? null,
                  authorKind: "requester",
                  authorUserId: contract.userId,
                  messageKind: "text",
                  body,
                  cardPayload: null,
                  aiMeta: null,
                  metadata: {},
                  editedAt: null,
                  deletedAt: null,
                  createdAt: new Date().toISOString(),
                });
              }
              void requestAi(ticketId);
              return true;
            }
            return false;
          }}
        />
      ) : null}

      <nav
        style={{
          display: "flex",
          borderTop: `1px solid ${COLORS.borderSoft}`,
          padding: "8px 12px",
          gap: 8,
        }}
      >
        <DockTab
          active={view === "home"}
          label={t("dashboard.adminSupport.tabHome")}
          onClick={() => setView("home")}
        />
        <DockTab
          active={view === "tickets" || view === "thread"}
          label={t("dashboard.adminSupport.tabTickets")}
          badge={unread}
          onClick={() => setView("tickets")}
        />
      </nav>
    </div>
  );
}

function DockTab({
  active,
  label,
  badge,
  onClick,
}: {
  active: boolean;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        border: "none",
        background: active ? COLORS.surfaceAlt : "transparent",
        borderRadius: 10,
        padding: "13px 10px",
        fontSize: 12.5,
        fontWeight: 600,
        color: active ? COLORS.ink : COLORS.inkMuted,
        cursor: "pointer",
        position: "relative",
      }}
    >
      {label}
      {badge && badge > 0 ? (
        <span
          style={{
            marginLeft: 6,
            background: COLORS.coral,
            color: "#fff",
            borderRadius: 8,
            fontSize: 10,
            padding: "1px 5px",
          }}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function HomeView({
  firstName,
  ask,
  setAsk,
  onSubmit,
  sending,
  error,
  recent,
  onOpenTicket,
  onStartTicket,
  onMessageOran,
  replayEnabled,
  attachReplay,
  setAttachReplay,
}: {
  firstName: string;
  ask: string;
  setAsk: (v: string) => void;
  onSubmit: () => void;
  sending: boolean;
  error: string | null;
  recent: SupportTicketSummary[];
  onOpenTicket: (id: string) => void;
  onStartTicket: () => void;
  onMessageOran: () => void;
  replayEnabled: boolean;
  attachReplay: boolean;
  setAttachReplay: (v: boolean) => void;
}) {
  const t = useT();
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontFamily: FONTS.display, fontSize: 19, fontWeight: 600, color: COLORS.ink }}>
          {interpolate(t("dashboard.adminSupport.greeting"), { name: firstName })}
        </div>
        <div style={{ fontSize: 13, color: COLORS.inkMuted, marginTop: 4 }}>
          {t("dashboard.adminSupport.subline")}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: COLORS.card,
          border: "1px solid rgba(95,75,139,0.35)",
          borderRadius: 14,
          padding: "8px 10px 8px 12px",
        }}
      >
        <Icon name="sparkle" size={16} color={COLORS.royal} />
        <input
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder={t("dashboard.adminSupport.askPlaceholder")}
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            fontSize: 13.5,
            fontFamily: FONTS.body,
            background: "transparent",
            color: COLORS.ink,
          }}
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!ask.trim() || sending}
          aria-label={t("dashboard.adminSupport.send")}
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            border: "none",
            background: ask.trim() ? COLORS.fill : COLORS.surfaceAlt,
            color: "#fff",
            cursor: ask.trim() ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="send" size={14} color={ask.trim() ? "#fff" : COLORS.inkDim} />
        </button>
      </div>
      {error ? (
        <div role="alert" style={{ fontSize: 12, color: COLORS.critical }}>
          {error}
        </div>
      ) : null}
      {replayEnabled ? (
        <ReplayConsent checked={attachReplay} onChange={setAttachReplay} />
      ) : null}
      {recent.length > 0 ? (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: COLORS.inkDim, marginBottom: 8 }}>
            {t("dashboard.adminSupport.recent")}
          </div>
          {recent.map((row) => (
            <TicketRow key={row.id} row={row} onOpen={() => onOpenTicket(row.id)} />
          ))}
        </div>
      ) : null}
      <button
        type="button"
        onClick={onStartTicket}
        style={{
          border: `1px solid ${COLORS.border}`,
          background: COLORS.card,
          borderRadius: 10,
          padding: "10px 12px",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          color: COLORS.ink,
        }}
      >
        {t("dashboard.adminSupport.startTicket")}
      </button>
      <button
        type="button"
        onClick={onMessageOran}
        style={{ border: "none", background: "transparent", color: COLORS.royal, fontSize: 12.5, cursor: "pointer" }}
      >
        {t("dashboard.adminSupport.messageOran")}
      </button>
    </div>
  );
}

function TicketRow({ row, onOpen }: { row: SupportTicketSummary; onOpen: () => void }) {
  const t = useT();
  const waitingYou = row.status === "open" && row.waitingOn === "requester";
  const withSupport = row.status === "open" && row.waitingOn === "support";
  const label = waitingYou
    ? t("dashboard.adminSupport.statusWaitingYou")
    : withSupport
      ? t("dashboard.adminSupport.statusWithSupport")
      : t("dashboard.adminSupport.statusResolved");
  const pillBg = waitingYou ? COLORS.coralSoft : row.status !== "open" ? COLORS.successSoft : COLORS.surfaceAlt;
  const pillFg = waitingYou ? COLORS.coralDeep : row.status !== "open" ? COLORS.successDeep : COLORS.inkMuted;
  return (
    <button
      type="button"
      onClick={onOpen}
      data-tulala-support-ticket-row=""
      style={{
        display: "flex",
        width: "100%",
        textAlign: "left",
        gap: 10,
        padding: "10px 4px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        alignItems: "center",
      }}
    >
      {row.unread ? (
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.coral, flexShrink: 0 }} />
      ) : (
        <span style={{ width: 8, height: 8, flexShrink: 0 }} />
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: COLORS.ink }}>{row.subject || t("dashboard.adminSupport.untitled")}</span>
        <span style={{ display: "block", fontSize: 12, color: COLORS.inkDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.lastMessagePreview}
        </span>
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          background: pillBg,
          color: pillFg,
          borderRadius: 999,
          padding: "3px 8px",
          flexShrink: 0,
        }}
      >
        {label}
      </span>
    </button>
  );
}

function TicketListView({
  tickets,
  canSeeWorkspace,
  userId,
  onOpen,
}: {
  tickets: SupportTicketSummary[];
  canSeeWorkspace: boolean;
  userId: string;
  onOpen: (id: string) => void;
}) {
  const t = useT();
  const [seg, setSeg] = useState<"mine" | "workspace">("mine");
  const scoped =
    canSeeWorkspace && seg === "workspace"
      ? tickets
      : tickets.filter((x) => x.requesterUserId === userId);
  const open = scoped.filter((x) => x.status === "open");
  const resolved = scoped.filter((x) => x.status !== "open");
  return (
    <div style={{ padding: 16 }}>
      {canSeeWorkspace ? (
        <div
          style={{
            display: "flex",
            background: COLORS.surfaceAlt,
            borderRadius: 10,
            padding: 3,
            marginBottom: 14,
          }}
        >
          {(["mine", "workspace"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSeg(s)}
              style={{
                flex: 1,
                border: "none",
                background: seg === s ? COLORS.card : "transparent",
                borderRadius: 8,
                padding: "6px 8px",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                color: COLORS.ink,
              }}
            >
              {s === "mine" ? t("dashboard.adminSupport.segMine") : t("dashboard.adminSupport.segWorkspace")}
            </button>
          ))}
        </div>
      ) : null}
      {open.length === 0 && resolved.length === 0 ? (
        <div style={{ fontSize: 13, color: COLORS.inkMuted, padding: "24px 8px" }}>
          {t("dashboard.adminSupport.emptyTickets")}
        </div>
      ) : null}
      {open.map((row) => (
        <TicketRow key={row.id} row={row} onOpen={() => onOpen(row.id)} />
      ))}
      {resolved.length > 0 ? (
        <details style={{ marginTop: 12 }}>
          <summary style={{ fontSize: 12, color: COLORS.inkDim, cursor: "pointer" }}>
            {t("dashboard.adminSupport.resolvedSection")}
          </summary>
          {resolved.map((row) => (
            <TicketRow key={row.id} row={row} onOpen={() => onOpen(row.id)} />
          ))}
        </details>
      ) : null}
    </div>
  );
}

