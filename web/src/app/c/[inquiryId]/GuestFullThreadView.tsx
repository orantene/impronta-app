"use client";

/**
 * GuestFullThreadView — U1 (Mini→Full Messages expansion).
 *
 * The full-window guest reading-room: the SAME inquiry thread the floating
 * MiniChatPanel shows, opened in a real centered Messages column. A guest who
 * clicks "Open full conversation ↗" lands here at /c/[inquiryId] and can read
 * the whole history + send replies as the cookie-owned guest. (A signed-in
 * owning client is redirected into the real client Messages shell by the page,
 * so this surface is the GUEST destination.)
 *
 * REUSE, not a new design system:
 *   • Atoms: MiniChatMessageBubble + SendIcon from the _chat module.
 *   • Tokens: C / FONT / DEFAULT_ACCENT / readableOn / primaryBtnStyle /
 *     statusCopy from mini-chat-styles (locale-aware via createTranslator).
 *   • Liveness: the SAME ~4s poll + optimistic-send + mergeServer reconcile as
 *     MiniChatPanel — pause on document.hidden; cursor via lastSeenIsoRef;
 *     reconcile tmp- rows by body; NEVER Date.now() in render.
 *
 * The server actions arrive as INJECTED CALLBACK PROPS (onFetch / onSend), so
 * this client component imports NO backend module — the guest-cookie security
 * boundary is resolved server-side inside those actions. Inline styles are fine
 * here (this file is NOT under components/admin/shell, so the inline-style
 * ratchet does not apply).
 *
 * Honest presence ONLY — the header shows the real "Typically replies in ~X"
 * fragment from the server, never a fabricated "online now"/typing indicator.
 */

import { useEffect, useRef, useState } from "react";

import {
  MiniChatMessageBubble,
  SendIcon,
  type StreamRow,
} from "@/app/t/[profileCode]/_chat/MiniChatMessageBubble";
import {
  C,
  DEFAULT_ACCENT,
  FONT,
  primaryBtnStyle,
  readableOn,
} from "@/app/t/[profileCode]/_chat/mini-chat-styles";
import type {
  FetchMessagesCallback,
  GuestThreadMessage,
  GuestThreadStatus,
  OnSendMessageCallback,
} from "@/lib/inquiry/guest-chat-contract";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";

import { GuestFullThreadHeader } from "./GuestFullThreadHeader";

// ─────────────────────────────────────────────────────────────────────────────
// Props — defined LOCALLY (importing the callback/message/status TYPES from the
// pure-types contract is allowed; this lane ADDS none).
// ─────────────────────────────────────────────────────────────────────────────

export type GuestFullThreadViewProps = {
  inquiryId: string;
  brand: {
    agencyName: string;
    talentDisplayName: string | null;
    accentColor: string | null;
    logoUrl: string | null;
  };
  initialMessages: GuestThreadMessage[];
  initialThreadStatus: GuestThreadStatus;
  typicalReplyLabel: string | null;
  onFetch: FetchMessagesCallback;
  onSend: OnSendMessageCallback;
  pollIntervalMs?: number;
  /** Guest UI locale — resolved server-side from the tenant default_locale. */
  locale?: string;
};

export function GuestFullThreadView({
  inquiryId,
  brand,
  initialMessages,
  initialThreadStatus,
  typicalReplyLabel,
  onFetch,
  onSend,
  pollIntervalMs = 4000,
  locale = "en",
}: GuestFullThreadViewProps) {
  const t = createTranslator(locale);
  const accent = brand.accentColor ?? DEFAULT_ACCENT;
  const accentInk = readableOn(brand.accentColor);

  // Stream seeded from the server-rendered initial messages so the first paint
  // already shows the whole history (no fetch flash). The poll cursor starts at
  // the newest seeded row so we only ever pull the delta after mount.
  const [rows, setRows] = useState<StreamRow[]>(() => sortedRows(initialMessages));
  const lastSeenIsoRef = useRef<string | null>(newestIso(initialMessages));

  const [threadStatus, setThreadStatus] = useState<GuestThreadStatus>(initialThreadStatus);
  const [reply, setReply] = useState<string | null>(typicalReplyLabel);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Honeypot — hidden, off-screen, aria-hidden. Bots fill it; we reject.
  const [honeypot, setHoneypot] = useState("");
  // Cooldown as a remaining-seconds countdown so render never calls Date.now().
  const [cooldownSecs, setCooldownSecs] = useState(0);
  const inCooldown = cooldownSecs > 0;

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Reconcile a batch of server messages into the stream ──────────────────
  // Same algorithm as MiniChatPanel.mergeServer: drop optimistic tmp- rows once
  // their body lands from the server; de-dupe persisted rows by id; keep
  // oldest→newest; advance the poll cursor.
  function mergeServer(incoming: GuestThreadMessage[]) {
    if (incoming.length === 0) return;
    setRows((cur) => {
      const serverIds = new Set(incoming.map((m) => m.id));
      const serverBodies = new Set(
        incoming.filter((m) => m.authorRole === "guest").map((m) => m.body.trim()),
      );
      const kept = cur.filter((r) => {
        if (!r.pending) return !serverIds.has(r.id);
        return !serverBodies.has(r.body.trim());
      });
      const merged = [...kept, ...incoming];
      merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return merged;
    });
    const newest = incoming[incoming.length - 1]?.createdAt ?? null;
    if (newest && (!lastSeenIsoRef.current || newest > lastSeenIsoRef.current)) {
      lastSeenIsoRef.current = newest;
    }
  }

  // ── Cooldown ticker — decrements once per second ──────────────────────────
  useEffect(() => {
    if (cooldownSecs <= 0) return;
    const id = setInterval(() => {
      setCooldownSecs((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [cooldownSecs]);

  // ── ~4s poll while visible (pause when the tab is hidden) ─────────────────
  // Deps are the real stable values (onFetch / inquiryId / pollIntervalMs); NO
  // exhaustive-deps disable. mergeServer + the setters are stable refs under the
  // React Compiler, matching the MiniChatPanel poll effect's dependency list.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (stopped) return;
      if (typeof document !== "undefined" && document.hidden) {
        timer = setTimeout(tick, pollIntervalMs);
        return;
      }
      try {
        const res = await onFetch({ inquiryId, afterIso: lastSeenIsoRef.current });
        if (!stopped && res.ok) {
          mergeServer(res.messages);
          setThreadStatus(res.threadStatus);
          if (res.typicalReplyLabel) setReply(res.typicalReplyLabel);
        }
      } catch {
        /* transient — next tick retries */
      }
      if (!stopped) timer = setTimeout(tick, pollIntervalMs);
    };

    timer = setTimeout(tick, pollIntervalMs);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [inquiryId, pollIntervalMs, onFetch]);

  // ── Auto-scroll to newest on stream growth ────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows.length]);

  // ── Map a contract failure code → friendly copy + side effects ────────────
  function applyFailure(code: string, message: string, retryAfterMs?: number) {
    if (code === "rate_limited") {
      setCooldownSecs(Math.max(1, Math.ceil((retryAfterMs ?? 30_000) / 1000)));
      setError(message || t("public.guestChat.errRateLimited"));
      return;
    }
    if (code === "blocked") {
      setError(message || t("public.guestChat.errBlocked"));
      return;
    }
    setError(message || t("public.guestChat.errGeneric"));
  }

  // ── Send a reply (optimistic) — mirrors MiniChatPanel.handleReply ─────────
  async function handleSend() {
    const body = draft.trim();
    if (!body || sending || inCooldown) return;

    setSending(true);
    setError(null);

    const { tmpId, nowIso } = optimisticSendIds();
    setRows((cur) => [
      ...cur,
      {
        id: tmpId,
        inquiryId,
        authorRole: "guest",
        authorLabel: null,
        authorAvatarUrl: null,
        body,
        kind: "text",
        cardPayload: null,
        createdAt: nowIso,
        editedAt: null,
        isDeleted: false,
        replyToMessageId: null,
        pending: true,
      },
    ]);
    setDraft("");

    const res = await onSend({ inquiryId, body, honeypot: honeypot || null });

    setSending(false);

    if (!res.ok) {
      setRows((cur) =>
        cur.map((r) => (r.id === tmpId ? { ...r, pending: false, failed: true } : r)),
      );
      // Restore the typed text (cleared optimistically before the await) so a
      // transient failure doesn't lose the reply.
      setDraft(body);
      applyFailure(res.code, res.message, res.retryAfterMs);
      return;
    }

    setRows((cur) => cur.map((r) => (r.id === tmpId ? { ...res.message, pending: false } : r)));
    const iso = res.message.createdAt;
    if (!lastSeenIsoRef.current || iso > lastSeenIsoRef.current) {
      lastSeenIsoRef.current = iso;
    }
  }

  const sendDisabled = !draft.trim() || sending || inCooldown;

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: C.surfaceFaint,
        display: "flex",
        flexDirection: "column",
        fontFamily: FONT,
      }}
    >
      {/* Centered max-width reading column. */}
      <div
        style={{
          width: "min(720px, 100%)",
          margin: "0 auto",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          background: C.surface,
          borderLeft: `1px solid ${C.borderSoft}`,
          borderRight: `1px solid ${C.borderSoft}`,
        }}
      >
        <GuestFullThreadHeader
          agencyName={brand.agencyName}
          talentDisplayName={brand.talentDisplayName}
          accent={accent}
          logoUrl={brand.logoUrl}
          threadStatus={threadStatus}
          typicalReplyLabel={reply}
          locale={locale}
        />

        {/* ── Tall scrolling message list ─────────────────────────────────── */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "22px 20px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            minHeight: 0,
          }}
        >
          {rows.length === 0 ? (
            <div
              style={{
                margin: "auto",
                textAlign: "center",
                color: C.inkDim,
                fontSize: 13,
                lineHeight: 1.5,
                maxWidth: 380,
              }}
            >
              {t("public.guestChat.noMessagesYet")}
            </div>
          ) : (
            rows.map((m) => (
              <MiniChatMessageBubble key={m.id} m={m} accent={accent} locale={locale} />
            ))
          )}
        </div>

        {/* ── Error line ──────────────────────────────────────────────────── */}
        {error && (
          <div
            role="alert"
            style={{
              padding: "8px 20px",
              fontSize: 12,
              color: C.danger,
              background: "rgba(161,58,58,0.06)",
            }}
          >
            {error}
            {inCooldown
              ? ` ${interpolate(t("public.guestChat.tryAgainIn"), { secs: cooldownSecs })}`
              : ""}
          </div>
        )}

        {/* ── Composer ────────────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 10,
            padding: "12px 16px 16px",
            borderTop: `1px solid ${C.borderSoft}`,
            background: C.surface,
          }}
        >
          {/* Honeypot — hidden, off-screen, aria-hidden. */}
          <input
            type="text"
            name="company_website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: "hidden",
              clip: "rect(0 0 0 0)",
              border: 0,
            }}
          />
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={t("public.guestChat.replyPlaceholder")}
            rows={1}
            disabled={sending || inCooldown}
            style={{
              flex: 1,
              minHeight: 44,
              maxHeight: 160,
              padding: "12px 14px",
              borderRadius: 12,
              border: `1px solid ${C.borderSoft}`,
              background: C.surfaceFaint,
              fontFamily: FONT,
              fontSize: 14,
              lineHeight: 1.45,
              color: C.ink,
              resize: "none",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sendDisabled}
            aria-label={t("public.guestChat.sendMessageAria")}
            style={{
              ...primaryBtnStyle(accent, accentInk),
              height: 44,
              width: 50,
              padding: 0,
              opacity: sendDisabled ? 0.45 : 1,
              cursor: sendDisabled ? "not-allowed" : "pointer",
            }}
          >
            {sending ? "…" : <SendIcon color={accentInk} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (module scope — never call Date.now() in render).
// ─────────────────────────────────────────────────────────────────────────────

function sortedRows(messages: GuestThreadMessage[]): StreamRow[] {
  return [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// Optimistic-send id + timestamp. Module scope so the impure Date.now()/new Date()
// calls live outside render (the react-hooks/purity rule flags them in component scope).
function optimisticSendIds(): { tmpId: string; nowIso: string } {
  const now = Date.now();
  return { tmpId: `tmp-${now}`, nowIso: new Date(now).toISOString() };
}

function newestIso(messages: GuestThreadMessage[]): string | null {
  let newest: string | null = null;
  for (const m of messages) {
    if (!newest || m.createdAt > newest) newest = m.createdAt;
  }
  return newest;
}
