"use client";

/**
 * Support Desk shell — three-pane desktop + mobile stack.
 * Reuses HQ loaders/actions/engine. Flag-gated by the page.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import type { HqQueueRow, HqTicketContext } from "@/lib/support/load-hq";
import type { SupportMessageRow, SupportTicketRow } from "@/lib/support/support-types";
import { supportPresenceChannel } from "@/lib/support/support-types";
import {
  hqChangeStatusAction,
  hqClaimSelfAction,
  hqLoadTicketDetailAction,
  hqReplySupportTicketAction,
} from "@/lib/support/hq-actions";
import { SupportThreadView } from "@/components/support/SupportThreadView";
import { TicketContextCard } from "@/app/(workspace)/platform/admin/support/TicketContextCard";
import { SupportAttachButton } from "@/components/support/SupportAttachButton";
import { useHqSupportRealtime, useSupportRealtime } from "@/components/support/support-hooks";
import { useThreadPresence } from "@/lib/realtime/presence";
import { createClient } from "@/lib/supabase/client";
import { SUPPORT_AGENT } from "@/lib/support/support-persona";
import { surfaceIcon as surfaceIconKind } from "@/lib/support/support-hq-presentation";
import {
  DESK_VIEWS,
  countDeskView,
  filterDeskQueue,
  type DeskViewId,
} from "@/lib/support/desk/desk-filters";
import { deskShortcutFromKeyboardEvent } from "@/lib/support/desk/desk-shortcuts";
import { beginDeskSend, type DeskSendAttempt } from "@/lib/support/desk/desk-send";
import {
  applyDeskRequesterMessagePreview,
  applyDeskTicketInsert,
  applyDeskTicketUpdate,
} from "@/lib/support/desk/desk-queue-realtime";
import type { SupportCannedReply } from "@/lib/platform/support-canned";

type MobileStep = "views" | "list" | "thread" | "context";

function useIsMobile(breakpoint = 840): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [breakpoint]);
  return mobile;
}

export function SupportDeskShell({
  rows: initialRows,
  cannedReplies,
  initialTicketId,
  selfUserId: initialSelfId,
}: {
  rows: HqQueueRow[];
  cannedReplies: SupportCannedReply[];
  initialTicketId: string | null;
  selfUserId: string | null;
}) {
  const t = useT();
  const mobile = useIsMobile();
  const [queue, setQueue] = useState(initialRows);
  const [view, setView] = useState<DeskViewId>("needs_you");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initialTicketId);
  const [contextOpen, setContextOpen] = useState(true);
  const [mobileStep, setMobileStep] = useState<MobileStep>(
    initialTicketId ? "thread" : "list",
  );
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [cmdkQ, setCmdkQ] = useState("");
  const [noteMode, setNoteMode] = useState(false);
  const [draft, setDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [ticket, setTicket] = useState<SupportTicketRow | null>(null);
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);
  const [context, setContext] = useState<HqTicketContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendAttempt, setSendAttempt] = useState<DeskSendAttempt | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [self, setSelf] = useState<{ id: string; name: string } | null>(
    initialSelfId ? { id: initialSelfId, name: SUPPORT_AGENT.name } : null,
  );
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => setQueue(initialRows), [initialRows]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user) return;
      const name =
        (typeof user.user_metadata?.first_name === "string"
          ? user.user_metadata.first_name
          : null) || SUPPORT_AGENT.name;
      setSelf({ id: user.id, name });
    });
  }, []);

  const selfId = self?.id ?? initialSelfId;
  const filtered = useMemo(
    () => filterDeskQueue(queue, view, query, selfId),
    [queue, view, query, selfId],
  );

  const reloadTicket = useCallback(async (id: string) => {
    setLoadError(null);
    try {
      const r = await hqLoadTicketDetailAction({ ticketId: id });
      if (!r.ok) {
        setLoadError(r.error);
        return;
      }
      setTicket(r.data.ticket);
      setMessages(r.data.messages);
      setContext(r.data.context);
    } catch {
      setLoadError("network");
    }
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setTicket(null);
      setMessages([]);
      setContext(null);
      return;
    }
    void reloadTicket(selectedId);
  }, [selectedId, reloadTicket]);

  const onMessage = useCallback((row: SupportMessageRow) => {
    setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
  }, []);
  const onTicket = useCallback((row: SupportTicketRow) => setTicket(row), []);
  useSupportRealtime({ ticketId: selectedId, onMessage, onTicket });

  const onTicketInsert = useCallback((ticketRow: SupportTicketRow) => {
    setQueue((prev) => applyDeskTicketInsert(prev, ticketRow));
  }, []);
  const onTicketUpdate = useCallback((ticketRow: SupportTicketRow) => {
    setQueue((prev) => applyDeskTicketUpdate(prev, ticketRow));
    setTicket((cur) => (cur && cur.id === ticketRow.id ? ticketRow : cur));
  }, []);
  const onRequesterMessage = useCallback((message: SupportMessageRow) => {
    setQueue((prev) => applyDeskRequesterMessagePreview(prev, message));
  }, []);
  useHqSupportRealtime({ onTicketInsert, onTicketUpdate, onRequesterMessage });

  const { setTyping, peers } = useThreadPresence({
    channelKey: selectedId,
    channelName: selectedId ? supportPresenceChannel(selectedId) : null,
    privateChannel: true,
    userId: self?.id ?? "",
    displayName: self?.name ?? SUPPORT_AGENT.name,
    role: "hq",
  });

  const selectTicket = useCallback(
    (id: string) => {
      setSelectedId(id);
      if (mobile) setMobileStep("thread");
    },
    [mobile],
  );

  const moveSelection = useCallback(
    (delta: number) => {
      if (filtered.length === 0) return;
      const idx = Math.max(
        0,
        filtered.findIndex((r) => r.ticket.id === selectedId),
      );
      const next = filtered[Math.min(filtered.length - 1, Math.max(0, idx + delta))];
      if (next) selectTicket(next.ticket.id);
    },
    [filtered, selectedId, selectTicket],
  );

  const doSend = useCallback(
    async (opts?: { resolve?: boolean; retry?: boolean }) => {
      if (!selectedId || busy) return;
      const body = (noteMode ? noteDraft : draft).trim();
      if (!body && !opts?.resolve) return;
      if (body) {
        const attempt = beginDeskSend({
          previous: sendAttempt,
          ticketId: selectedId,
          body,
          asInternalNote: noteMode,
          fresh: !opts?.retry,
        });
        if (!attempt) return; // inflight duplicate
        setSendAttempt(attempt);
        setBusy(true);
        setSendError(null);
        setTyping(false);
        try {
          const r = await hqReplySupportTicketAction({
            ticketId: selectedId,
            body,
            asInternalNote: noteMode,
            clientSendKey: attempt.key,
          });
          if (!r.ok) {
            setSendAttempt({ ...attempt, status: "failed" });
            setSendError(r.error);
            setBusy(false);
            return;
          }
          setSendAttempt({ ...attempt, status: "ok" });
          if (noteMode) setNoteDraft("");
          else setDraft("");
        } catch {
          setSendAttempt({ ...attempt, status: "failed" });
          setSendError("network");
          setBusy(false);
          return;
        }
      }
      if (opts?.resolve) {
        await hqChangeStatusAction({ ticketId: selectedId, status: "resolved" });
      }
      setBusy(false);
      await reloadTicket(selectedId);
    },
    [
      selectedId,
      busy,
      noteMode,
      noteDraft,
      draft,
      sendAttempt,
      setTyping,
      reloadTicket,
    ],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = deskShortcutFromKeyboardEvent(e, e.target);
      if (!action) return;
      if (action === "command") {
        e.preventDefault();
        setCmdkOpen(true);
        return;
      }
      if (action === "escape") {
        if (cmdkOpen) {
          setCmdkOpen(false);
          return;
        }
        if (mobile && mobileStep === "context") {
          setMobileStep("thread");
          return;
        }
        if (mobile && mobileStep === "thread") {
          setMobileStep("list");
          return;
        }
        return;
      }
      e.preventDefault();
      if (action === "next") moveSelection(1);
      else if (action === "prev") moveSelection(-1);
      else if (action === "reply") {
        setNoteMode(false);
        composerRef.current?.focus();
      } else if (action === "note") {
        setNoteMode(true);
        composerRef.current?.focus();
      } else if (action === "assign" && selectedId) {
        void hqClaimSelfAction({ ticketId: selectedId }).then(() => reloadTicket(selectedId));
      } else if (action === "resolve" && selectedId) {
        void hqChangeStatusAction({ ticketId: selectedId, status: "resolved" }).then(() =>
          reloadTicket(selectedId),
        );
      } else if (action === "snooze") {
        setBanner(t("dashboard.platform.support.deskSnoozeProposed"));
        window.setTimeout(() => setBanner(null), 2500);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cmdkOpen, mobile, mobileStep, moveSelection, selectedId, reloadTicket, t]);

  const statusLabel = (row: HqQueueRow) => {
    const tk = row.ticket;
    if (tk.status === "resolved") return t("dashboard.platform.support.deskStatusResolved");
    if (tk.status === "closed") return t("dashboard.platform.support.deskStatusClosed");
    if (tk.waitingOn === "requester") return t("dashboard.platform.support.deskWaitingRequester");
    if (tk.waitingOn === "support") return t("dashboard.platform.support.deskWaitingSupport");
    return t("dashboard.platform.support.deskStatusOpen");
  };

  const rail = (
    <aside className="flex h-full min-h-0 w-[220px] shrink-0 flex-col border-r border-admin-border bg-admin-surface-alt max-[840px]:w-full">
      <div className="flex h-12 items-center gap-2 border-b border-admin-border px-3">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-admin-brand text-[11px] font-bold text-white">
          T
        </span>
        <span className="text-[14px] font-semibold tracking-tight text-admin-ink">
          {t("dashboard.platform.support.deskBrand")}
        </span>
      </div>
      <div className="px-3 pt-3 text-[10px] font-bold uppercase tracking-wider text-admin-ink-dim">
        {t("dashboard.platform.support.deskViews")}
      </div>
      <nav className="flex-1 overflow-auto p-1.5">
        {DESK_VIEWS.map((v) => {
          const count = countDeskView(queue, v.id, selfId);
          const active = view === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                setView(v.id);
                if (mobile) setMobileStep("list");
              }}
              className={`mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] ${
                active
                  ? "bg-admin-brand-soft font-semibold text-admin-brand-deep"
                  : "text-admin-ink-muted hover:bg-admin-surface"
              }`}
            >
              <span className="flex-1">{t(`dashboard.platform.support.${v.labelKey}`)}</span>
              <span className="text-[11px] text-admin-ink-dim">{count}</span>
            </button>
          );
        })}
      </nav>
      <div className="border-t border-admin-border p-2">
        <Link
          href="/platform/admin/support"
          className="block rounded-md px-2.5 py-2 text-[12px] text-admin-ink-muted hover:bg-admin-surface"
        >
          {t("dashboard.platform.support.pageTitle")} ↗
        </Link>
      </div>
    </aside>
  );

  const list = (
    <section className="flex h-full min-h-0 w-[320px] shrink-0 flex-col border-r border-admin-border bg-admin-card max-[840px]:w-full">
      <div className="flex h-12 items-center gap-2 border-b border-admin-border px-3">
        {mobile ? (
          <button
            type="button"
            className="text-[13px] text-admin-ink-muted"
            onClick={() => setMobileStep("views")}
          >
            ← {t("dashboard.platform.support.deskBack")}
          </button>
        ) : null}
        <h2 className="text-[14px] font-semibold text-admin-ink">
          {t(`dashboard.platform.support.${DESK_VIEWS.find((v) => v.id === view)?.labelKey ?? "deskViewNeedsYou"}`)}
        </h2>
      </div>
      <div className="border-b border-admin-border px-3 py-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("dashboard.platform.support.deskSearchPlaceholder")}
          className="w-full rounded-lg border border-admin-border bg-admin-surface px-2.5 py-2 text-[13px] text-admin-ink outline-none focus:border-admin-brand"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <div className="text-[14px] font-semibold text-admin-ink">
              {t("dashboard.platform.support.deskEmptyQueue")}
            </div>
            <p className="mt-1 text-[12px] text-admin-ink-muted">
              {t("dashboard.platform.support.deskEmptyQueueHint")}
            </p>
          </div>
        ) : (
          filtered.map((row) => {
            const active = row.ticket.id === selectedId;
            const icon = surfaceIconKind(row.ticket.surface);
            const name =
              row.requesterName ||
              row.ticket.contactName ||
              row.ticket.subject ||
              t("dashboard.platform.support.unknownRequester");
            return (
              <button
                key={row.ticket.id}
                type="button"
                onClick={() => selectTicket(row.ticket.id)}
                className={`grid w-full grid-cols-[28px_1fr] gap-2.5 border-b border-admin-border-soft px-3 py-3 text-left ${
                  active ? "border-l-2 border-l-admin-brand bg-admin-brand-soft" : "hover:bg-admin-surface"
                }`}
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-admin-surface-alt text-[12px]">
                  {icon.glyph}
                </span>
                <span className="min-w-0">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-[13px] font-semibold text-admin-ink">{name}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-admin-ink-dim">
                      #{row.ticket.ticketNumber}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-admin-ink-muted">
                    {row.ticket.subject}
                  </span>
                  <span className="mt-1 inline-flex flex-wrap gap-1">
                    <span className="rounded-full bg-admin-surface-alt px-1.5 py-0.5 text-[10px] text-admin-ink-muted">
                      {statusLabel(row)}
                    </span>
                    {row.ticket.surface === "workspace" ? (
                      <span className="rounded-full bg-admin-indigo-soft px-1.5 py-0.5 text-[10px] text-admin-indigo-deep">
                        {row.tenantSlug ?? "agency"}
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );

  const composer = selectedId ? (
    <div
      className={`border-t border-admin-border p-3 ${noteMode ? "bg-[color-mix(in_srgb,var(--color-admin-coral)_8%,var(--color-admin-card))]" : "bg-admin-card"}`}
    >
      <div className="mb-2 flex items-center gap-2">
        <div className="inline-flex rounded-lg border border-admin-border bg-admin-surface-alt p-0.5">
          <button
            type="button"
            onClick={() => setNoteMode(false)}
            className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${!noteMode ? "bg-admin-card text-admin-ink shadow-sm" : "text-admin-ink-muted"}`}
          >
            {t("dashboard.platform.support.deskReply")}
          </button>
          <button
            type="button"
            onClick={() => setNoteMode(true)}
            className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${noteMode ? "bg-admin-coral-soft text-admin-coral-deep" : "text-admin-ink-muted"}`}
          >
            {t("dashboard.platform.support.deskInternalNote")}
          </button>
        </div>
      </div>
      <div className="mb-1.5 text-[11px] text-admin-ink-dim">
        {noteMode
          ? t("dashboard.platform.support.deskRecipientNote")
          : interpolate(t("dashboard.platform.support.deskRecipientReply"), {
              email:
                ticket?.contactEmail ||
                context?.requesterEmail ||
                t("dashboard.platform.support.unknownRequester"),
            })}
      </div>
      <textarea
        ref={composerRef}
        value={noteMode ? noteDraft : draft}
        onChange={(e) => {
          if (noteMode) setNoteDraft(e.target.value);
          else setDraft(e.target.value);
          setTyping(true);
        }}
        rows={3}
        placeholder={
          noteMode
            ? t("dashboard.platform.support.deskNotePlaceholder")
            : t("dashboard.platform.support.deskComposerPlaceholder")
        }
        className="w-full resize-y rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-[14px] text-admin-ink outline-none focus:border-admin-brand"
        disabled={busy || ticket?.status === "closed"}
      />
      {sendError ? (
        <div className="mt-2 flex items-center gap-2 rounded-md bg-admin-critical-soft px-2.5 py-2 text-[12px] text-admin-critical-deep">
          <span>
            {sendError === "network"
              ? t("dashboard.platform.support.deskNetworkError")
              : t("dashboard.platform.support.deskSendFailed")}
          </span>
          <button
            type="button"
            className="rounded-md bg-admin-card px-2 py-1 font-semibold"
            onClick={() => void doSend({ retry: true })}
          >
            {t("dashboard.platform.support.deskRetry")}
          </button>
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <SupportAttachButton ticketId={selectedId} disabled={busy || ticket?.status === "closed"} tone="hq" />
        {cannedReplies.slice(0, 4).map((c) => (
          <button
            key={c.id}
            type="button"
            className="rounded-md border border-admin-border px-2 py-1 text-[11px] text-admin-ink-muted"
            onClick={() => {
              if (noteMode) setNoteDraft(c.body);
              else setDraft(c.body);
            }}
          >
            {c.title}
          </button>
        ))}
        <div className="flex-1" />
        <button
          type="button"
          disabled={busy || !(noteMode ? noteDraft : draft).trim()}
          onClick={() => void doSend()}
          className="rounded-lg bg-admin-brand px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-45"
        >
          {busy
            ? t("dashboard.platform.support.deskSending")
            : noteMode
              ? t("dashboard.platform.support.deskAddNote")
              : t("dashboard.platform.support.deskSend")}
        </button>
      </div>
    </div>
  ) : null;

  const thread = (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-admin-surface">
      {!selectedId ? (
        <div className="grid flex-1 place-items-center px-6 text-center">
          <div>
            <div className="text-[16px] font-semibold text-admin-ink">
              {t("dashboard.platform.support.deskSelectTicket")}
            </div>
            <p className="mt-1 text-[13px] text-admin-ink-muted">
              {t("dashboard.platform.support.deskSelectTicketHint")}
            </p>
          </div>
        </div>
      ) : (
        <>
          <header className="flex flex-wrap items-center gap-2 border-b border-admin-border px-3 py-2.5">
            {mobile ? (
              <button
                type="button"
                className="text-[13px] text-admin-ink-muted"
                onClick={() => setMobileStep("list")}
              >
                ←
              </button>
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold text-admin-ink">
                {context?.requesterName ||
                  ticket?.contactName ||
                  ticket?.subject ||
                  "…"}
              </div>
              <div className="truncate text-[11px] text-admin-ink-dim">
                {ticket ? `#${ticket.ticketNumber} · ${ticket.surface}` : ""}
                {peers.length > 0
                  ? ` · ${t("dashboard.platform.support.deskPresenceViewing")}: ${peers.map((p) => p.name).join(", ")}`
                  : ""}
              </div>
            </div>
            {ticket ? (
              <>
                <button
                  type="button"
                  className="rounded-md border border-admin-border px-2 py-1 text-[11px]"
                  onClick={() => void hqClaimSelfAction({ ticketId: ticket.id }).then(() => reloadTicket(ticket.id))}
                >
                  {t("dashboard.platform.support.deskAssignMe")}
                </button>
                {ticket.status === "open" ? (
                  <button
                    type="button"
                    className="rounded-md border border-admin-border px-2 py-1 text-[11px]"
                    onClick={() =>
                      void hqChangeStatusAction({ ticketId: ticket.id, status: "resolved" }).then(() =>
                        reloadTicket(ticket.id),
                      )
                    }
                  >
                    {t("dashboard.platform.support.deskResolve")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="rounded-md border border-admin-border px-2 py-1 text-[11px]"
                    onClick={() =>
                      void hqChangeStatusAction({ ticketId: ticket.id, status: "open" }).then(() =>
                        reloadTicket(ticket.id),
                      )
                    }
                  >
                    {t("dashboard.platform.support.deskReopen")}
                  </button>
                )}
              </>
            ) : null}
            {mobile ? (
              <button
                type="button"
                className="rounded-md border border-admin-border px-2 py-1 text-[11px]"
                onClick={() => setMobileStep("context")}
              >
                {t("dashboard.platform.support.deskCustomer")}
              </button>
            ) : (
              <button
                type="button"
                className="rounded-md border border-admin-border px-2 py-1 text-[11px]"
                onClick={() => setContextOpen((v) => !v)}
              >
                {contextOpen
                  ? t("dashboard.platform.support.deskHideContext")
                  : t("dashboard.platform.support.deskShowContext")}
              </button>
            )}
            <button
              type="button"
              className="rounded-md border border-admin-border px-2 py-1 text-[11px]"
              onClick={() => setCmdkOpen(true)}
            >
              ⌘K
            </button>
          </header>
          {loadError ? (
            <div className="m-3 rounded-md bg-admin-critical-soft px-3 py-2 text-[12px] text-admin-critical-deep">
              {loadError === "network"
                ? t("dashboard.platform.support.deskNetworkError")
                : t("dashboard.platform.support.deskLoadError")}
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => selectedId && void reloadTicket(selectedId)}
              >
                {t("dashboard.platform.support.deskRetry")}
              </button>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-auto">
            <SupportThreadView ticket={ticket} messages={messages} tone="hq" />
          </div>
          {composer}
        </>
      )}
    </section>
  );

  // TicketContextCard is HQ-tokenized (dark ink). Keep a dark dock so reuse
  // stays readable inside the light Desk chrome without forking the card.
  const contextPane =
    !mobile && contextOpen ? (
      <aside className="flex h-full w-[300px] shrink-0 flex-col border-l border-admin-border bg-[#16161A] text-[#F5F2EB] max-[1100px]:w-[260px]">
        <div className="flex h-12 items-center border-b border-white/10 px-3 text-[14px] font-semibold">
          {t("dashboard.platform.support.deskCustomer")}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {ticket && context ? (
            <TicketContextCard
              ticket={ticket}
              context={context}
              onOpenPast={(id) => selectTicket(id)}
              viewingNow={peers.some((p) => p.role === "requester")}
            />
          ) : null}
        </div>
      </aside>
    ) : null;

  const cmdk =
    cmdkOpen ? (
      <div
        className="absolute inset-0 z-50 grid place-items-start justify-center bg-black/35 pt-[12vh]"
        onClick={() => setCmdkOpen(false)}
      >
        <div
          className="w-[min(560px,calc(100%-24px))] overflow-hidden rounded-xl border border-admin-border bg-admin-card shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            autoFocus
            value={cmdkQ}
            onChange={(e) => setCmdkQ(e.target.value)}
            placeholder={t("dashboard.platform.support.deskCommandPlaceholder")}
            className="w-full border-b border-admin-border bg-transparent px-4 py-3.5 text-[16px] text-admin-ink outline-none"
          />
          <div className="max-h-[360px] overflow-auto p-1.5">
            {filterDeskQueue(queue, "all_open", cmdkQ, selfId)
              .slice(0, 12)
              .map((row) => (
                <button
                  key={row.ticket.id}
                  type="button"
                  className="flex w-full rounded-lg px-3 py-2.5 text-left text-[13px] text-admin-ink hover:bg-admin-brand-soft"
                  onClick={() => {
                    selectTicket(row.ticket.id);
                    setCmdkOpen(false);
                    setCmdkQ("");
                  }}
                >
                  #{row.ticket.ticketNumber} ·{" "}
                  {row.requesterName || row.ticket.subject}
                </button>
              ))}
            {filterDeskQueue(queue, "all_open", cmdkQ, selfId).length === 0 ? (
              <div className="px-3 py-6 text-center text-[13px] text-admin-ink-dim">
                {t("dashboard.platform.support.deskCommandEmpty")}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ) : null;

  const mobileContextSheet =
    mobile && mobileStep === "context" ? (
      <div className="absolute inset-0 z-40 flex flex-col justify-end bg-black/30">
        <div className="max-h-[78%] overflow-auto rounded-t-2xl border-t border-white/10 bg-[#16161A] text-[#F5F2EB]">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[14px] font-semibold">
              {t("dashboard.platform.support.deskContextSheet")}
            </span>
            <button type="button" onClick={() => setMobileStep("thread")}>
              {t("dashboard.platform.support.deskBack")}
            </button>
          </div>
          {ticket && context ? (
            <TicketContextCard
              ticket={ticket}
              context={context}
              onOpenPast={(id) => {
                selectTicket(id);
                setMobileStep("thread");
              }}
            />
          ) : null}
        </div>
      </div>
    ) : null;

  return (
    <div className="relative flex h-[100dvh] min-h-[560px] flex-col bg-admin-surface text-admin-ink">
      {banner ? (
        <div className="bg-admin-caution-soft px-3 py-1.5 text-center text-[12px] text-admin-caution-deep">
          {banner}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1">
        {mobile ? (
          mobileStep === "views" ? (
            rail
          ) : mobileStep === "list" ? (
            list
          ) : (
            thread
          )
        ) : (
          <>
            {rail}
            {list}
            {thread}
            {contextPane}
          </>
        )}
      </div>
      {cmdk}
      {mobileContextSheet}
    </div>
  );
}
