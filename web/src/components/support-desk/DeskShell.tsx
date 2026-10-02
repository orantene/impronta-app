"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { SupportThreadView } from "@/components/support/SupportThreadView";
import { useSupportRealtime } from "@/components/support/support-hooks";
import type { SupportCannedReply } from "@/lib/platform/support-canned";
import type { HqQueueRow, HqTicketContext } from "@/lib/support/load-hq";
import {
  hqChangeStatusAction,
  hqLoadTicketDetailAction,
  hqReopenTicketAction,
  hqReplySupportTicketAction,
} from "@/lib/support/hq-actions";
import type { SupportMessageRow, SupportTicketRow } from "@/lib/support/support-types";

import "./desk.css";

type ViewId = "needs_you" | "waiting" | "resolved" | "all";
type MobilePane = "queues" | "list" | "thread";

function viewMatch(view: ViewId, ticket: SupportTicketRow): boolean {
  if (view === "all") return true;
  if (view === "resolved") return ticket.status === "resolved" || ticket.status === "closed";
  if (ticket.status !== "open") return false;
  if (view === "needs_you") return ticket.waitingOn === "support";
  return ticket.waitingOn === "requester";
}

function statusLabel(ticket: SupportTicketRow): string {
  if (ticket.status === "resolved") return "Resolved";
  if (ticket.status === "closed") return "Closed";
  return ticket.waitingOn === "support" ? "Needs you" : "Waiting on customer";
}

export function DeskShell({
  rows: initialRows,
  cannedReplies,
  initialTicketId,
  basePath,
}: {
  rows: HqQueueRow[];
  cannedReplies: SupportCannedReply[];
  initialTicketId: string | null;
  /** `/desk` or `/platform/admin/support/desk` */
  basePath: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [view, setView] = useState<ViewId>("needs_you");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initialTicketId);
  const [mobile, setMobile] = useState<MobilePane>(
    initialTicketId ? "thread" : "list",
  );
  const [ticket, setTicket] = useState<SupportTicketRow | null>(null);
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);
  const [context, setContext] = useState<HqTicketContext | null>(null);
  const [body, setBody] = useState("");
  const [note, setNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (!viewMatch(view, row.ticket)) return false;
      if (!needle) return true;
      const hay = [
        row.ticket.subject,
        row.requesterName,
        row.requesterEmail,
        row.tenantName,
        row.ticket.ticketNumber,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, view, q]);

  const reloadDetail = useCallback(async (id: string) => {
    const r = await hqLoadTicketDetailAction({ ticketId: id });
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    setTicket(r.data.ticket);
    setMessages(r.data.messages);
    setContext(r.data.context);
    setRows((prev) =>
      prev.map((row) =>
        row.ticket.id === id ? { ...row, ticket: r.data.ticket } : row,
      ),
    );
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setTicket(null);
      setMessages([]);
      setContext(null);
      return;
    }
    void reloadDetail(selectedId);
  }, [selectedId, reloadDetail]);

  const onMessage = useCallback((row: SupportMessageRow) => {
    setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
  }, []);
  const onTicket = useCallback((row: SupportTicketRow) => {
    setTicket(row);
    setRows((prev) =>
      prev.map((r) => (r.ticket.id === row.id ? { ...r, ticket: row } : r)),
    );
  }, []);
  useSupportRealtime({
    ticketId: selectedId,
    onMessage,
    onTicket,
  });

  const selectTicket = (id: string) => {
    setSelectedId(id);
    setMobile("thread");
    setBody("");
    setNote(false);
    setError(null);
    if (basePath === "/desk") {
      router.replace(`/desk/${id}`);
    }
  };

  const send = (andResolve: boolean) => {
    if (!selectedId || pending) return;
    const text = body.trim();
    if (!text && !andResolve) return;
    startTransition(async () => {
      setError(null);
      if (text) {
        const r = await hqReplySupportTicketAction({
          ticketId: selectedId,
          body: text,
          asInternalNote: note,
        });
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setBody("");
      }
      if (andResolve && !note) {
        const r = await hqChangeStatusAction({
          ticketId: selectedId,
          status: "resolved",
        });
        if (!r.ok) {
          setError(r.error);
          return;
        }
      }
      await reloadDetail(selectedId);
    });
  };

  const resolve = () => {
    if (!selectedId || pending) return;
    startTransition(async () => {
      setError(null);
      const r = await hqChangeStatusAction({
        ticketId: selectedId,
        status: "resolved",
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      await reloadDetail(selectedId);
    });
  };

  const reopen = () => {
    if (!selectedId || pending) return;
    startTransition(async () => {
      setError(null);
      const r = await hqReopenTicketAction({ ticketId: selectedId });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      await reloadDetail(selectedId);
    });
  };

  const views: { id: ViewId; label: string }[] = [
    { id: "needs_you", label: "Needs you" },
    { id: "waiting", label: "Waiting" },
    { id: "resolved", label: "Resolved" },
    { id: "all", label: "All" },
  ];

  return (
    <div className="desk-root" data-desk-theme="light">
      <header className="desk-topbar">
        <div className="desk-brand">Tulala Support Desk</div>
        <div className="desk-actions">
          <button
            type="button"
            className="desk-btn"
            onClick={() => setMobile("queues")}
          >
            Queues
          </button>
          <Link className="desk-btn" href="/platform/admin/support">
            Open Support HQ ↗
          </Link>
        </div>
      </header>

      <div className="desk-shell" data-mobile={mobile}>
        <nav className="desk-rail" aria-label="Views">
          <p className="desk-section-title">Views</p>
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              className="desk-rail-item"
              data-active={view === v.id}
              onClick={() => {
                setView(v.id);
                setMobile("list");
              }}
            >
              {v.label}
            </button>
          ))}
        </nav>

        <section className="desk-list" aria-label="Conversations">
          <div style={{ padding: "0.75rem 0.85rem" }}>
            <input
              className="desk-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search conversations"
              aria-label="Search conversations"
            />
          </div>
          {filtered.length === 0 ? (
            <p className="desk-empty">No conversations in this view.</p>
          ) : (
            filtered.map((row) => (
              <button
                key={row.ticket.id}
                type="button"
                className="desk-row"
                data-active={selectedId === row.ticket.id}
                onClick={() => selectTicket(row.ticket.id)}
              >
                <p className="desk-row-title">
                  {row.ticket.subject || `Ticket #${row.ticket.ticketNumber}`}
                </p>
                <p className="desk-row-meta">
                  {row.requesterName || row.requesterEmail || "Unknown"} ·{" "}
                  <span className="desk-pill">{statusLabel(row.ticket)}</span>
                </p>
              </button>
            ))
          )}
        </section>

        <section className="desk-thread" aria-label="Thread">
          {!selectedId || !ticket ? (
            <p className="desk-empty">Select a conversation.</p>
          ) : (
            <>
              <div
                style={{
                  padding: "0.75rem 1rem",
                  borderBottom: "1px solid var(--desk-border-soft)",
                  display: "flex",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <button
                  type="button"
                  className="desk-btn"
                  onClick={() => setMobile("list")}
                >
                  Back
                </button>
                <strong style={{ fontSize: "var(--desk-fs-16)" }}>
                  {ticket.subject || `Ticket #${ticket.ticketNumber}`}
                </strong>
                <span className="desk-pill">{statusLabel(ticket)}</span>
                <div style={{ marginLeft: "auto" }} className="desk-actions">
                  {ticket.status === "open" ? (
                    <button
                      type="button"
                      className="desk-btn"
                      disabled={pending}
                      onClick={resolve}
                    >
                      Resolve
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="desk-btn"
                      disabled={pending}
                      onClick={reopen}
                    >
                      Reopen
                    </button>
                  )}
                </div>
              </div>
              <div className="desk-thread-scroll">
                <SupportThreadView
                  ticket={ticket}
                  messages={messages}
                  tone="light"
                />
              </div>
              <div className="desk-composer" data-note={note}>
                {error ? <p className="desk-error">{error}</p> : null}
                <div className="desk-actions" style={{ marginBottom: "0.45rem" }}>
                  <button
                    type="button"
                    className="desk-btn"
                    data-active={!note}
                    onClick={() => setNote(false)}
                  >
                    Reply
                  </button>
                  <button
                    type="button"
                    className="desk-btn"
                    data-active={note}
                    onClick={() => setNote(true)}
                  >
                    Internal note
                  </button>
                  {cannedReplies.length > 0 ? (
                    <select
                      className="desk-btn"
                      aria-label="Insert canned reply"
                      defaultValue=""
                      onChange={(e) => {
                        const id = e.target.value;
                        const hit = cannedReplies.find((c) => c.id === id);
                        if (hit) setBody((prev) => (prev ? `${prev}\n${hit.body}` : hit.body));
                        e.target.value = "";
                      }}
                    >
                      <option value="">Canned…</option>
                      {cannedReplies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={
                    note
                      ? "Internal note (not visible to customer)"
                      : "Reply to customer"
                  }
                  aria-label={note ? "Internal note" : "Reply"}
                />
                <div className="desk-actions">
                  <button
                    type="button"
                    className="desk-btn-primary desk-btn"
                    disabled={pending || !body.trim()}
                    onClick={() => send(false)}
                  >
                    {note ? "Add note" : "Send"}
                  </button>
                  {!note ? (
                    <button
                      type="button"
                      className="desk-btn"
                      disabled={pending}
                      onClick={() => send(true)}
                    >
                      Send & resolve
                    </button>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </section>

        <aside className="desk-context" aria-label="Customer context">
          <p className="desk-section-title">Context</p>
          {!context ? (
            <p className="desk-empty">No context loaded.</p>
          ) : (
            <div style={{ padding: "0 0.85rem 1rem" }}>
              <p className="desk-row-title">{context.requesterName || "Unknown"}</p>
              <p className="desk-row-meta">{context.requesterEmail || "No email"}</p>
              <p className="desk-row-meta" style={{ marginTop: "0.75rem" }}>
                Workspace: {context.tenantName || "Platform / guest"}
              </p>
              <p className="desk-row-meta">Plan: {context.planTier || "—"}</p>
              <p className="desk-row-meta">
                Past tickets: {context.pastTickets.length}
              </p>
              {context.recentBookings.length > 0 ? (
                <>
                  <p className="desk-section-title" style={{ paddingInline: 0 }}>
                    Recent bookings
                  </p>
                  {context.recentBookings.slice(0, 5).map((b) => (
                    <p key={b.id} className="desk-row-meta">
                      {b.status} · {b.paymentStatus || "payment n/a"}
                    </p>
                  ))}
                </>
              ) : null}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
