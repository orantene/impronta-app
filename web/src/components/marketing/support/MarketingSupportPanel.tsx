"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getMarketingSupportCopy, type MarketingSupportCopy } from "@/lib/marketing/support-copy";
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
import { SupportAgentAvatar } from "@/components/support/SupportAgentAvatar";
import { SUPPORT_AGENT } from "@/lib/support/support-persona";

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

/**
 * What a visitor should be offered first, which is not the same question for
 * a stranger and for a customer.
 *
 * The panel used to show one screen to both: a signed-in customer whose
 * booking had broken was asked "Ask about plans, features, or how to start".
 * `signedIn` reached this component already and changed exactly one thing —
 * whether we asked for an email address.
 */
function startersFor(signedIn: boolean, copy: MarketingSupportCopy): string[] {
  return signedIn
    ? [copy.starterBroken, copy.starterBilling, copy.starterAccount, copy.starterHuman]
    : [copy.starterPricing, copy.starterDomain, copy.starterPayments, copy.starterHuman];
}

/**
 * "Waiting on us" / "Waiting on you" / "Closed", plus how long ago.
 *
 * A past conversation with no state attached is indistinguishable from a
 * suggestion, which is exactly how somebody's old "I need help" ended up
 * looking like a prompt the product was offering them.
 */
function threadStatusLabel(row: SupportTicketRow, copy: MarketingSupportCopy): string {
  const state =
    row.status === "closed" || row.status === "resolved"
      ? copy.statusClosed
      : row.waitingOn === "requester"
        ? copy.statusWaitingYou
        : copy.statusWaitingUs;
  const stamp = row.lastMessageAt ?? row.createdAt ?? null;
  const ago = stamp ? relativeAge(stamp) : null;
  return ago ? `${state} · ${ago}` : state;
}

/** Coarse "how long ago" — precision here would be false precision. */
function relativeAge(iso: string): string | null {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
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
  const starters = startersFor(signedIn, copy);
  const [view, setView] = useState<"home" | "thread">(resumeTicketId ? "thread" : "home");
  const [ticketId, setTicketId] = useState<string | null>(resumeTicketId);
  const [ticket, setTicket] = useState<SupportTicketRow | null>(null);
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);
  const [threads, setThreads] = useState<SupportTicketRow[]>([]);
  const [draft, setDraft] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  /** The model is running. Separate from `busy`, which also covers saving an
      email or asking for a human — those are instant and need no indicator. */
  const [thinking, setThinking] = useState(false);
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
    // Ask for email after the first machine reply — AI answer OR fail-open /
    // escalation system cards. Otherwise a skipped model leaves the guest
    // with the support agent but no way to leave an inbox for the reply.
    const hasMachineReply = messages.some(
      (m) => m.authorKind === "ai" || m.authorKind === "system",
    );
    if (hasMachineReply && !askedRef.current) {
      askedRef.current = true;
      void appendGuestContactCardAction({ ticketId });
      void loadThread(ticketId);
    }
  }, [messages, ticketId, signedIn, ticket?.contactEmail, loadThread]);

  async function sendQuestion(preset?: string) {
    const body = (preset ?? draft).trim();
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
        // Show the question and the fact that something is happening BEFORE
        // waiting on the model. The old order switched to an empty thread view
        // and sat there for the length of a model call — up to twenty seconds,
        // with the question gone and no spinner. It reads as a dead page, and
        // the visitor's next move is to close the tab.
        await loadThread(created.ticketId);
        setThinking(true);
        const answered = await requestGuestSupportAnswer(created.ticketId).finally(() =>
          setThinking(false),
        );
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
      await loadThread(ticketId);
      if (ticket?.handledBy === "ai") {
        setThinking(true);
        const answered = await requestGuestSupportAnswer(ticketId).finally(() =>
          setThinking(false),
        );
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
          <div className="flex flex-col gap-5">
            {/* Who is on the other end. The panel promised "a person if you
                need one" in its subtitle and then showed nobody. */}
            <div className="flex items-start gap-3">
              <SupportAgentAvatar size={36} />
              <div className="min-w-0">
                <div className="text-[0.875rem] font-semibold">{SUPPORT_AGENT.name}</div>
                <p className="text-[0.8rem] text-[var(--plt-ink-soft)]">{copy.agentLine}</p>
              </div>
            </div>

            {/* Real starting points. These replace an empty screen: the panel
                used to open with one sentence and a text box, which is the
                blank-page problem the /support page says we do not do. */}
            <div>
              <h3 className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[var(--plt-muted)]">
                {copy.startersHeading}
              </h3>
              <ul className="flex flex-col gap-2">
                {starters.map((starter) => (
                  <li key={starter}>
                    <button
                      type="button"
                      disabled={busy}
                      className="w-full rounded-xl border border-[var(--plt-hairline)] bg-[var(--plt-bg-raised)] px-3 py-2.5 text-left text-[0.8rem] hover:bg-[var(--plt-bg-deep)] disabled:opacity-60"
                      onClick={() => void sendQuestion(starter)}
                    >
                      {starter}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* The visitor's own past threads, said out loud. These used to sit
                here unlabelled and styled like suggestions, so somebody's old
                "I need help" read as a prompt the product was offering. */}
            {threads.length > 0 ? (
              <div>
                <h3 className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[var(--plt-muted)]">
                  {copy.threadsHeading}
                </h3>
                <ul className="flex flex-col gap-2">
                  {threads.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        className="w-full rounded-xl bg-[var(--plt-bg-raised)] px-3 py-2 text-left hover:bg-[var(--plt-bg-deep)]"
                        onClick={() => {
                          setTicketId(row.id);
                          setView("thread");
                          void loadThread(row.id);
                        }}
                      >
                        <span className="block truncate text-[0.8rem]">
                          {row.subject || row.lastMessagePreview || copy.newChat}
                        </span>
                        <span className="mt-0.5 block text-[0.7rem] text-[var(--plt-muted)]">
                          {threadStatusLabel(row, copy)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
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
                    locale={locale}
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
            {thinking ? (
              <div className="flex items-center gap-2 pt-1" aria-live="polite">
                <SupportAgentAvatar size={24} />
                <span className="text-[0.8rem] text-[var(--plt-ink-soft)]">{copy.thinking}</span>
                <span className="flex gap-1" aria-hidden="true">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--plt-muted)]" />
                  <span
                    className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--plt-muted)]"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--plt-muted)]"
                    style={{ animationDelay: "300ms" }}
                  />
                </span>
              </div>
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
          placeholder={signedIn ? copy.composerPlaceholderSignedIn : copy.composerPlaceholder}
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
