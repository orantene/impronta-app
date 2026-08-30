"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getMarketingSupportCopy } from "@/lib/marketing/support-copy";
import { trackProductEvent } from "@/lib/analytics/track-client";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";
import {
  appendGuestContactCardAction,
  attachGuestContactAction,
  getGuestSupportThreadAction,
  listGuestSupportThreadsAction,
  requestGuestHumanAction,
  sendGuestSupportMessageAction,
  startGuestSupportChatAction,
} from "@/lib/support/guest-actions";
import type { SupportMessageRow, SupportTicketRow } from "@/lib/support/support-types";
import { SupportCardRenderer } from "@/components/support/SupportCardRenderer";

const GUEST_SUPPORT_CHAT_PATH = "/api/ai/guest-support-chat";

async function requestGuestSupportAnswer(ticketId: string): Promise<boolean> {
  const res = await fetch(GUEST_SUPPORT_CHAT_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ticketId }),
  });
  const ct = res.headers.get("content-type") ?? "";
  return res.ok && ct.includes("application/json");
}

export function MarketingSupportPanel({
  locale,
  originSlug,
  signedIn,
  resumeTicketId,
  onClose,
  onUnread,
}: {
  locale: "en" | "es";
  originSlug: string;
  signedIn: boolean;
  resumeTicketId: string | null;
  onClose: () => void;
  onUnread: () => void;
}) {
  const copy = getMarketingSupportCopy(locale);
  const [view, setView] = useState<"home" | "thread">(resumeTicketId ? "thread" : "home");
  const [ticketId, setTicketId] = useState<string | null>(resumeTicketId);
  const [ticket, setTicket] = useState<SupportTicketRow | null>(null);
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);
  const [threads, setThreads] = useState<SupportTicketRow[]>([]);
  const [draft, setDraft] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const askedRef = useRef(false);

  const loadThread = useCallback(async (id: string) => {
    const result = await getGuestSupportThreadAction({ ticketId: id });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setTicket(result.ticket);
    setMessages(result.messages);
    const last = result.messages[result.messages.length - 1];
    if (last && last.authorKind !== "requester" && document.visibilityState !== "visible") {
      onUnread();
    }
  }, [onUnread]);

  useEffect(() => {
    void listGuestSupportThreadsAction().then((r) => {
      if (r.ok) setThreads(r.tickets);
    });
  }, []);

  useEffect(() => {
    if (resumeTicketId) {
      setTicketId(resumeTicketId);
      setView("thread");
      void loadThread(resumeTicketId);
    }
  }, [resumeTicketId, loadThread]);

  useEffect(() => {
    if (view !== "thread" || !ticketId || !ticket) return;
    const shouldPoll =
      ticket.handledBy === "human" || ticket.waitingOn === "support";
    if (!shouldPoll) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadThread(ticketId);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [view, ticketId, ticket, loadThread]);

  useEffect(() => {
    if (!ticketId || signedIn || ticket?.contactEmail) return;
    const hasAi = messages.some((m) => m.authorKind === "ai");
    if (hasAi && !askedRef.current) {
      askedRef.current = true;
      void appendGuestContactCardAction({ ticketId });
      void loadThread(ticketId);
    }
  }, [messages, ticketId, signedIn, ticket?.contactEmail, loadThread]);

  async function sendQuestion() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!ticketId) {
        const created = await startGuestSupportChatAction({
          body,
          originSlug,
          locale,
          honeypot,
        });
        if (!created.ok) {
          setError(created.error);
          return;
        }
        setTicketId(created.ticketId);
        setView("thread");
        setDraft("");
        trackProductEvent(PRODUCT_ANALYTICS_EVENTS.marketing_support_question_sent, { locale });
        const answered = await requestGuestSupportAnswer(created.ticketId);
        if (!answered) {
          setError(copy.answerUnavailable);
        } else {
          trackProductEvent(PRODUCT_ANALYTICS_EVENTS.marketing_support_answer_shown, { locale });
        }
        await loadThread(created.ticketId);
        return;
      }
      const sent = await sendGuestSupportMessageAction({
        ticketId,
        body,
        honeypot,
      });
      if (!sent.ok) {
        setError(sent.error);
        return;
      }
      setDraft("");
      trackProductEvent(PRODUCT_ANALYTICS_EVENTS.marketing_support_question_sent, { locale });
      if (ticket?.handledBy === "ai") {
        const answered = await requestGuestSupportAnswer(ticketId);
        if (!answered) {
          setError(copy.answerUnavailable);
        } else {
          trackProductEvent(PRODUCT_ANALYTICS_EVENTS.marketing_support_answer_shown, { locale });
        }
      }
      await loadThread(ticketId);
    } finally {
      setBusy(false);
    }
  }

  async function saveEmail() {
    if (!ticketId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await attachGuestContactAction({
        ticketId,
        email,
        name,
        honeypot,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      trackProductEvent(PRODUCT_ANALYTICS_EVENTS.marketing_support_email_captured, { locale });
      await loadThread(ticketId);
    } finally {
      setBusy(false);
    }
  }

  async function askHuman() {
    if (!ticketId || busy) return;
    setBusy(true);
    try {
      const result = await requestGuestHumanAction({ ticketId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      trackProductEvent(PRODUCT_ANALYTICS_EVENTS.marketing_support_human_requested, { locale });
      await loadThread(ticketId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-label={copy.panelTitle}
      className="fixed z-[390] flex flex-col overflow-hidden border border-[var(--plt-hairline-strong)] bg-[var(--plt-bg)] text-[var(--plt-ink)] shadow-lg"
      style={{
        right: "max(16px, env(safe-area-inset-right))",
        bottom: "max(80px, env(safe-area-inset-bottom))",
        width: "min(400px, calc(100vw - 24px))",
        height: "min(640px, calc(100dvh - 96px))",
        borderRadius: 20,
      }}
    >
      <header className="flex items-start justify-between gap-3 border-b border-[var(--plt-hairline)] px-4 py-3">
        <div>
          <div className="text-[0.95rem] font-semibold">{copy.panelTitle}</div>
          <div className="text-[0.75rem] text-[var(--plt-muted)]">{copy.panelSubtitle}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2 py-1 text-[0.8rem] text-[var(--plt-ink-soft)] hover:bg-[var(--plt-bg-raised)]"
        >
          {copy.close}
        </button>
      </header>

      <div className="hidden">
        <input
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {error ? <p className="mb-3 text-[0.8rem] text-[var(--plt-ink)]">{error}</p> : null}
        {view === "home" && !ticketId ? (
          <div>
            <p className="mb-4 text-[0.875rem] text-[var(--plt-ink-soft)]">{copy.emptyHome}</p>
            {threads.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {threads.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="w-full rounded-xl bg-[var(--plt-bg-raised)] px-3 py-2 text-left text-[0.8rem] hover:bg-[var(--plt-bg-deep)]"
                      onClick={() => {
                        setTicketId(row.id);
                        setView("thread");
                        void loadThread(row.id);
                      }}
                    >
                      {row.subject || row.lastMessagePreview || copy.newChat}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) => {
              if (m.messageKind === "card") {
                const kind = m.cardPayload?.kind;
                if (kind === "guest-contact" && !ticket?.contactEmail && !signedIn) {
                  return (
                    <div key={m.id} className="rounded-xl bg-[var(--plt-bg-raised)] px-3 py-3">
                      <p className="mb-2 text-[0.8rem]">{copy.emailPrompt}</p>
                      <label className="mb-2 block text-[0.75rem]">
                        {copy.emailLabel}
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-[var(--plt-hairline-strong)] bg-[var(--plt-bg)] px-2 py-1.5"
                        />
                      </label>
                      <label className="mb-2 block text-[0.75rem]">
                        {copy.nameLabel}
                        <input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-[var(--plt-hairline-strong)] bg-[var(--plt-bg)] px-2 py-1.5"
                        />
                      </label>
                      <p className="mb-2 text-[0.7rem] text-[var(--plt-muted)]">{copy.emailConsent}</p>
                      <button
                        type="button"
                        onClick={() => void saveEmail()}
                        className="rounded-full bg-[var(--plt-forest)] px-3 py-1.5 text-[0.8rem] text-[var(--plt-bg)] hover:bg-[var(--plt-ink)]"
                      >
                        {copy.saveEmail}
                      </button>
                    </div>
                  );
                }
                return (
                  <SupportCardRenderer
                    key={m.id}
                    payload={m.cardPayload ?? {}}
                    tone="light"
                    onAction={(action) => {
                      if (action === "talk-human") void askHuman();
                    }}
                  />
                );
              }
              const mine = m.authorKind === "requester";
              return (
                <div
                  key={m.id}
                  className={`max-w-[88%] rounded-2xl px-3 py-2 text-[0.85rem] leading-relaxed ${
                    mine
                      ? "ml-auto bg-[var(--plt-forest)] text-[var(--plt-bg)]"
                      : "bg-[var(--plt-bg-raised)] text-[var(--plt-ink)]"
                  }`}
                >
                  {m.body}
                </div>
              );
            })}
            {ticket && !ticket.contactEmail && !signedIn ? (
              <button
                type="button"
                onClick={() => void askHuman()}
                className="self-start text-[0.75rem] underline underline-offset-2"
              >
                {copy.askHuman}
              </button>
            ) : null}
          </div>
        )}
      </div>

      <form
        className="border-t border-[var(--plt-hairline)] p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void sendQuestion();
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={copy.composerPlaceholder}
          rows={3}
          className="mb-2 w-full resize-none rounded-xl border border-[var(--plt-hairline-strong)] bg-[var(--plt-bg)] px-3 py-2 text-[0.875rem]"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="rounded-full bg-[var(--plt-forest)] px-4 py-1.5 text-[0.8rem] font-medium text-[var(--plt-bg)] hover:bg-[var(--plt-ink)] disabled:opacity-50"
        >
          {copy.send}
        </button>
      </form>
    </div>
  );
}
