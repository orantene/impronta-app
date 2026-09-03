"use client";
import { renderChatCardForMessage } from "@/components/admin/shell/internal/messages/admin-3";
import { logServerError } from "@/lib/server/safe-error";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ServerActionResult } from "@/lib/server-actions/result";

export type ParticipantThreadMessage = {
  id: string;
  sender_user_id: string | null;
  sender_name: string;
  body: string;
  created_at: string;
  is_mine: boolean;
  /**
   * Card kind, when this message is a card rather than prose.
   *
   * This shell rendered `body` and nothing else, so on the CANONICAL admin
   * thread every card kind was invisible — an offer, a payment request, a
   * balance-due milestone and a reservation all rendered as an empty grey
   * bubble, because a card's `body` is deliberately blank. The full card system
   * lives in the prototype SPA shell; this surface never grew one. Found while
   * putting the order card where staff actually work.
   */
  message_kind?: string | null;
  card_payload?: Record<string, unknown> | null;
  /** For `message_kind === 'order'`: the order the card describes, read live. */
  order?: {
    id: string;
    status: string;
    currency: string;
    totalCents: number;
    outstandingCents?: number | null;
    lineCount: number;
  } | null;
};

export type ParticipantThreadSendResult = ServerActionResult<{
  id: string;
  created_at: string;
}>;

type ThreadType = "private" | "group";

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  borderSoft: "rgba(24,24,27,0.08)",
  cardBg: "#ffffff",
  surface: "rgba(11,11,13,0.02)",
  red: "#A33A3A",
  redSoft: "rgba(163,58,58,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ParticipantThreadShell({
  inquiryId,
  threadType,
  initialMessages,
  accent,
  accentSoft,
  sendMessage,
  markRead,
}: {
  inquiryId: string;
  threadType: ThreadType;
  initialMessages: ParticipantThreadMessage[];
  accent: string;
  accentSoft: string;
  sendMessage: (body: string) => Promise<ParticipantThreadSendResult>;
  markRead: () => Promise<void>;
}) {
  const [messages, setMessages] = useState<ParticipantThreadMessage[]>(initialMessages);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setViewerUserId(data.user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages, inquiryId, threadType]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`participant_inquiry_messages:${inquiryId}:${threadType}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "inquiry_messages",
          filter: `inquiry_id=eq.${inquiryId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            sender_user_id: string | null;
            body: string;
            created_at: string;
            thread_type: string;
          };
          if (row.thread_type !== threadType) return;

          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            const knownSenderName = prev.find((m) => m.sender_user_id === row.sender_user_id)?.sender_name;
            const isMine = viewerUserId != null && row.sender_user_id === viewerUserId;
            return [
              ...prev,
              {
                id: row.id,
                sender_user_id: row.sender_user_id,
                sender_name: knownSenderName ?? (isMine ? "You" : row.sender_user_id?.slice(0, 8) ?? "Unknown"),
                body: row.body,
                created_at: row.created_at,
                is_mine: isMine,
              },
            ];
          });

          if (!viewerUserId || row.sender_user_id === viewerUserId) return;
          // A.5 — surface markRead failures so a busted RLS path or
          // network blip doesn't silently leave the read pointer stale.
          markRead().catch((err) => {
            logServerError("participantthreadshell", err);
          });
        },
      )
      .subscribe();

    return () => {
      // A.5 — channel cleanup is fire-and-forget by design (component
      // unmount path) but log on the off-chance the disconnect throws
      // so we notice if the realtime client gets into a stuck state.
      supabase.removeChannel(channel).catch?.((err: unknown) => {
        logServerError("participantthreadshell", err);
      });
    };
  }, [inquiryId, markRead, threadType, viewerUserId]);

  const grouped = useMemo(() => {
    return messages;
  }, [messages]);

  const handleSend = useCallback(() => {
    const trimmed = body.trim();
    if (!trimmed || sending) return;

    const optimisticId = `opt-${Date.now()}`;
    const optimistic: ParticipantThreadMessage = {
      id: optimisticId,
      sender_user_id: viewerUserId,
      sender_name: "You",
      body: trimmed,
      created_at: new Date().toISOString(),
      is_mine: true,
    };

    setError(null);
    setMessages((prev) => [...prev, optimistic]);
    setBody("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    startSending(async () => {
      const result = await sendMessage(trimmed);
      if (!result.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setBody(trimmed);
        setError(result.error);
        return;
      }

      setMessages((prev) => {
        const opt = prev.find((m) => m.id === optimisticId);
        if (!opt) return prev;
        return [
          ...prev.filter((m) => m.id !== optimisticId && m.id !== result.data.id),
          { ...opt, id: result.data.id, created_at: result.data.created_at },
        ];
      });
    });
  }, [body, sending, sendMessage, viewerUserId]);

  return (
    <section style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 12, background: C.cardBg, overflow: "hidden" }}>
      <div
        style={{
          maxHeight: "min(56vh, 560px)",
          overflowY: "auto",
          padding: "14px 14px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {grouped.length === 0 ? (
          <div style={{ padding: "24px 10px", textAlign: "center", fontSize: 12.5, color: C.inkMuted }}>
            No messages yet. Send the first message below.
          </div>
        ) : (
          grouped.map((m) => (
            <div key={m.id} style={{ display: "flex", justifyContent: m.is_mine ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "78%" }}>
                {!m.is_mine ? (
                  <div style={{ fontSize: 10.5, color: C.inkMuted, marginBottom: 3, paddingLeft: 2 }}>
                    {m.sender_name}
                  </div>
                ) : null}
                {renderThreadCard(m) ?? (
                  <div
                    style={{
                      padding: "8px 11px",
                      borderRadius: 10,
                      background: m.is_mine ? accent : C.surface,
                      color: m.is_mine ? "#fff" : C.ink,
                      fontSize: 13,
                      lineHeight: 1.5,
                      border: m.is_mine ? "none" : `1px solid ${C.borderSoft}`,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {m.body}
                  </div>
                )}
                <div
                  style={{
                    marginTop: 3,
                    fontSize: 10,
                    color: C.inkDim,
                    textAlign: m.is_mine ? "right" : "left",
                    padding: "0 2px",
                  }}
                >
                  {formatTime(m.created_at)}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {error ? (
        <div style={{ borderTop: `1px solid ${C.borderSoft}`, background: C.redSoft, color: C.red, padding: "8px 12px", fontSize: 12 }}>
          {error}
        </div>
      ) : null}

      <div
        style={{
          borderTop: `1px solid ${C.borderSoft}`,
          padding: 10,
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
        }}
      >
        <textarea
          ref={textareaRef}
          value={body}
          rows={1}
          placeholder="Write a message..."
          onChange={(event) => {
            setBody(event.target.value);
            event.currentTarget.style.height = "auto";
            event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 140)}px`;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
          style={{
            flex: 1,
            minHeight: 36,
            maxHeight: 140,
            resize: "none",
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 13,
            fontFamily: FONT,
            color: C.ink,
            background: "#fff",
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || body.trim().length === 0}
          style={{
            height: 36,
            padding: "0 12px",
            borderRadius: 8,
            border: "none",
            background: sending || body.trim().length === 0 ? accentSoft : accent,
            color: sending || body.trim().length === 0 ? C.inkMuted : "#fff",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: sending || body.trim().length === 0 ? "default" : "pointer",
          }}
        >
          Send
        </button>
      </div>
    </section>
  );
}

/**
 * A card, when the message is one. Null falls back to the prose bubble.
 *
 * Reuses the shell's existing card renderer rather than growing a second card
 * system — there are already more thread renderers in this repo than there are
 * kinds of thread, and a second set of card components would be the fourth
 * place a card's appearance is defined.
 *
 * Fails to prose, never to blank: an unknown kind renders its body, which is
 * how a card added by a future migration degrades instead of disappearing.
 */
function renderThreadCard(m: ParticipantThreadMessage): React.ReactNode {
  const kind = m.message_kind;
  if (!kind || kind === "text") return null;
  const node = renderChatCardForMessage(
    kind,
    m.card_payload ?? {},
    () => {},
    { messageId: m.id, order: m.order ?? null, viewerRole: "staff" },
  );
  return node ?? null;
}
