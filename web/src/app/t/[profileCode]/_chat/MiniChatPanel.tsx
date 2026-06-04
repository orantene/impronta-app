"use client";

/**
 * MiniChatPanel — the talent-profile conversational-inquiry popup (Lane D / F2).
 *
 * THE UX-CRITICAL surface of the guest-chat MVP. A guest on a talent profile
 * opens this floating panel, types a first message freely (never blocked),
 * fills a one-line name+email gate, and a real inquiry is created. The thread
 * then renders live (initial load + ~4s poll) and the guest keeps chatting.
 *
 * Design constraints baked in (strategy §10 + deep-dives Part C):
 *   • Async-first, honest presence — NO fake "online now". Header shows the
 *     real "Typically replies in ~X" (from the server) and we set the
 *     expectation BEFORE the first send. Instant auto-ack confirms receipt.
 *   • First message is NEVER blocked — the email gate appears at send time,
 *     inline, framed as "Where should {Name} reach you?", not "Register".
 *   • Premium, brand-skinned — accent color from agency_branding drives the
 *     launcher/send button; NO gold/rust accents hard-coded (house rule).
 *   • The UI imports NO backend module. The three server actions arrive as
 *     INJECTED CALLBACK PROPS (onStartInquiry / onSendMessage / fetchMessages)
 *     per guest-chat-contract.ts — the security boundary (the guest cookie)
 *     is resolved server-side inside those actions, never passed from here.
 *
 * Anti-abuse floor (Lane B integration points handled here on the UI side):
 *   • Honeypot field rendered hidden + aria-hidden + off-screen; its value is
 *     forwarded on both start + send.
 *   • On code "captcha_required" we surface a Turnstile slot (inert stub for
 *     MVP — Lane B wires the real widget); on "rate_limited" we show a
 *     cooldown countdown (driven by a ticking state, never Date.now() in render).
 *
 * Memoization note: this codebase runs under the React Compiler, so this file
 * deliberately uses plain functions (no manual useCallback/useMemo) — the
 * compiler handles memoization and the lint forbids hand-rolled memo here.
 */

import { useEffect, useRef, useState } from "react";

import type {
  GuestThreadMessage,
  GuestThreadStatus,
  MiniChatPanelProps,
} from "@/lib/inquiry/guest-chat-contract";

import {
  MiniChatMessageBubble,
  SendIcon,
  type StreamRow,
} from "./MiniChatMessageBubble";
import {
  C,
  DEFAULT_ACCENT,
  EMAIL_RE,
  FONT,
  STATUS_COPY,
  firstNameOf,
  inputStyle,
  primaryBtnStyle,
  readableOn,
} from "./mini-chat-styles";

type Stage = "intro" | "gate" | "thread";

// ───────────────────────────────────────────────────────────────────────────
// Component
// ───────────────────────────────────────────────────────────────────────────

export function MiniChatPanel({
  open,
  onClose,
  tenantSlug,
  talentProfileId,
  talentProfileCode,
  sourcePage,
  brand,
  existingInquiryId = null,
  prefill = null,
  onStartInquiry,
  onSendMessage,
  fetchMessages,
  pollIntervalMs = 4000,
  openFullHref = null,
}: MiniChatPanelProps) {
  const accent = brand.accentColor ?? DEFAULT_ACCENT;
  const accentInk = readableOn(brand.accentColor);
  const talentFirst = firstNameOf(brand.talentDisplayName);

  // Inquiry identity. Starts from any existing thread the cookie maps to.
  const [inquiryId, setInquiryId] = useState<string | null>(existingInquiryId);

  // Conversation stream + cursor for incremental polling.
  const [rows, setRows] = useState<StreamRow[]>([]);
  const lastSeenIsoRef = useRef<string | null>(null);

  // Composer + gate state.
  const [draft, setDraft] = useState("");
  const [name, setName] = useState(prefill?.name ?? "");
  const [email, setEmail] = useState(prefill?.email ?? "");
  const [phone] = useState(prefill?.phone ?? "");
  const [honeypot, setHoneypot] = useState("");

  const [stage, setStage] = useState<Stage>(existingInquiryId ? "thread" : "intro");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cooldown is tracked as a remaining-seconds countdown so render never calls
  // Date.now() (React-purity rule). 0 = not in cooldown.
  const [cooldownSecs, setCooldownSecs] = useState(0);
  const [captchaRequired, setCaptchaRequired] = useState(false);

  // Header SLA + status (honest presence). Null until the server tells us.
  const [typicalReply, setTypicalReply] = useState<string | null>(null);
  const [threadStatus, setThreadStatus] = useState<GuestThreadStatus>("open");
  const [emailedTo, setEmailedTo] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const inCooldown = cooldownSecs > 0;

  // ── Reconcile a batch of server messages into the stream ──────────────────
  // Drops optimistic tmp- rows whose body matches an incoming server row;
  // de-dupes by id; keeps oldest→newest order; advances the poll cursor.
  function mergeServer(incoming: GuestThreadMessage[]) {
    if (incoming.length === 0) return;
    setRows((cur) => {
      const serverIds = new Set(incoming.map((m) => m.id));
      const serverBodies = new Set(
        incoming.filter((m) => m.authorRole === "guest").map((m) => m.body.trim()),
      );
      const kept = cur.filter((r) => {
        if (!r.pending) return !serverIds.has(r.id); // replace persisted dupes
        // Optimistic guest row — drop once its body lands from the server.
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

  // ── Cooldown ticker — decrements the countdown once per second ────────────
  useEffect(() => {
    if (cooldownSecs <= 0) return;
    const id = setInterval(() => {
      setCooldownSecs((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [cooldownSecs]);

  // ── Initial load when a thread exists (reopen path) ───────────────────────
  useEffect(() => {
    if (!open || !inquiryId) return;
    let cancelled = false;
    void (async () => {
      const res = await fetchMessages({ inquiryId, afterIso: null });
      if (cancelled || !res.ok) return;
      lastSeenIsoRef.current = null;
      mergeServer(res.messages);
      setThreadStatus(res.threadStatus);
      setTypicalReply(res.typicalReplyLabel);
      setStage("thread");
    })();
    return () => {
      cancelled = true;
    };
  }, [open, inquiryId, fetchMessages]);

  // ── ~4s poll while open + visible (MVP liveness; pause when hidden) ────────
  useEffect(() => {
    if (!open || !inquiryId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (stopped) return;
      if (typeof document !== "undefined" && document.hidden) {
        timer = setTimeout(tick, pollIntervalMs);
        return;
      }
      try {
        const res = await fetchMessages({ inquiryId, afterIso: lastSeenIsoRef.current });
        if (!stopped && res.ok) {
          mergeServer(res.messages);
          setThreadStatus(res.threadStatus);
          if (res.typicalReplyLabel) setTypicalReply(res.typicalReplyLabel);
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
  }, [open, inquiryId, pollIntervalMs, fetchMessages]);

  // ── Auto-scroll to newest on stream growth ────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows.length, stage]);

  // ── Escape closes; focus the composer when opening ────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const focusTimer = setTimeout(() => textareaRef.current?.focus(), 60);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(focusTimer);
    };
  }, [open, onClose]);

  // ── Map a contract failure code → friendly copy + side effects ────────────
  function applyFailure(code: string, message: string, retryAfterMs?: number) {
    if (code === "rate_limited") {
      setCooldownSecs(Math.max(1, Math.ceil((retryAfterMs ?? 30_000) / 1000)));
      setError(message || "You're sending a little fast — give it a moment.");
      return;
    }
    if (code === "captcha_required") {
      setCaptchaRequired(true);
      setError(message || "Quick check to confirm you're human.");
      return;
    }
    if (code === "disposable_email") {
      setError(message || "Please use a non-disposable email so we can reach you.");
      return;
    }
    if (code === "blocked") {
      setError(message || "This conversation can't continue.");
      return;
    }
    setError(message || "Something went wrong. Please try again.");
  }

  // ── First send: collect email if not yet captured, else start the inquiry ─
  async function handleFirstSend() {
    const body = draft.trim();
    if (!body) return;

    // Gate: we need name+email before we can persist + route + claim.
    if (!name.trim() || !EMAIL_RE.test(email.trim())) {
      setStage("gate");
      setError(null);
      return;
    }

    setSending(true);
    setError(null);
    setCaptchaRequired(false);

    // Optimistic guest bubble.
    const tmpId = `tmp-${Date.now()}`;
    const nowIso = new Date().toISOString();
    setRows((cur) => [
      ...cur,
      {
        id: tmpId,
        inquiryId: "",
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
    setStage("thread");

    const res = await onStartInquiry({
      tenantSlug,
      talentProfileId,
      talentProfileCode,
      contactName: name.trim(),
      contactEmail: email.trim(),
      contactPhone: phone.trim() || null,
      firstMessage: body,
      sourcePage,
      honeypot: honeypot || null,
    });

    setSending(false);

    if (!res.ok) {
      setRows((cur) =>
        cur.map((r) => (r.id === tmpId ? { ...r, pending: false, failed: true } : r)),
      );
      // Restore the typed text so a transient failure doesn't destroy it. The
      // draft was cleared optimistically before the await; put it back so the
      // guest can retry from the composer (the failed bubble copy points here).
      setDraft(body);
      applyFailure(res.code, res.message, res.retryAfterMs);
      return;
    }

    setInquiryId(res.inquiryId);
    setEmailedTo(res.guestEmail);
    lastSeenIsoRef.current = null;
    // Drop the optimistic row; render the canonical opening + auto-ack.
    setRows((cur) => cur.filter((r) => r.id !== tmpId));
    const seeded: GuestThreadMessage[] = [res.openingMessage];
    if (res.autoAckMessage) seeded.push(res.autoAckMessage);
    mergeServer(seeded);
  }

  // ── Subsequent sends in an existing thread ────────────────────────────────
  async function handleReply() {
    const body = draft.trim();
    if (!body || !inquiryId) return;

    setSending(true);
    setError(null);

    const tmpId = `tmp-${Date.now()}`;
    const nowIso = new Date().toISOString();
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

    const res = await onSendMessage({ inquiryId, body, honeypot: honeypot || null });

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

  function submit() {
    if (sending || inCooldown) return;
    if (inquiryId) {
      void handleReply();
    } else {
      void handleFirstSend();
    }
  }

  if (!open) return null;

  const sendDisabled = !draft.trim() || sending || inCooldown;
  const gateReady = Boolean(name.trim()) && EMAIL_RE.test(email.trim());
  const showGate = stage === "gate";

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={`Message ${brand.agencyName}`}
      style={{
        position: "fixed",
        right: "max(16px, env(safe-area-inset-right))",
        bottom: "calc(84px + env(safe-area-inset-bottom))",
        zIndex: 90,
        width: "min(380px, calc(100vw - 32px))",
        maxHeight: "min(620px, calc(100vh - 140px))",
        display: "flex",
        flexDirection: "column",
        background: C.surface,
        borderRadius: 18,
        border: `1px solid ${C.border}`,
        boxShadow:
          "0 24px 60px -18px rgba(16,18,29,0.45), 0 6px 18px -8px rgba(16,18,29,0.25)",
        overflow: "hidden",
        fontFamily: FONT,
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 11,
          padding: "13px 14px",
          borderBottom: `1px solid ${C.borderSoft}`,
          background: C.surfaceFaint,
        }}
      >
        <div
          aria-hidden
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            flexShrink: 0,
            background: brand.logoUrl
              ? `center / cover no-repeat url(${brand.logoUrl})`
              : accent,
            color: accentInk,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: 0.2,
          }}
        >
          {!brand.logoUrl && (talentFirst[0]?.toUpperCase() ?? "•")}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 700,
              color: C.ink,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {brand.agencyName}
          </div>
          {/* HONEST presence: only ever the real reply-time, never "online now".
              typicalReply is a bare fragment ("in ~2 hours", "within a day") —
              the "Typically replies" prefix is owned here, so the producer must
              NOT also include it (avoids the double-prefix). */}
          <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 1 }}>
            {inquiryId
              ? STATUS_COPY[threadStatus]
              : typicalReply
                ? `Typically replies ${typicalReply}`
                : "Leave a message — the team replies by email"}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            border: "none",
            background: "transparent",
            color: C.inkMuted,
            cursor: "pointer",
            fontSize: 19,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "14px 14px 6px",
          display: "flex",
          flexDirection: "column",
          gap: 9,
          background: C.surface,
        }}
      >
        {/* Warm opener — always first, brand-voiced. */}
        <div
          style={{
            alignSelf: "flex-start",
            maxWidth: "88%",
            background: C.surfaceCool,
            color: C.ink,
            borderRadius: "14px 14px 14px 4px",
            padding: "10px 13px",
            fontSize: 13.5,
            lineHeight: 1.5,
          }}
        >
          Hi — I&rsquo;m {talentFirst}&rsquo;s booking assistant. What&rsquo;s the event?
          Tell me a little and I&rsquo;ll get the right person to reply.
        </div>

        {rows.map((m) => (
          <MiniChatMessageBubble key={m.id} m={m} accent={accent} />
        ))}

        {/* "We emailed you a link" — graceful async recovery copy. */}
        {emailedTo && (
          <div
            style={{
              alignSelf: "center",
              textAlign: "center",
              fontSize: 11,
              color: C.systemInk,
              padding: "2px 8px",
              maxWidth: "92%",
            }}
          >
            We emailed{" "}
            <strong style={{ color: C.inkMuted }}>{emailedTo}</strong> a link to sign in and
            continue this conversation from any device.
          </div>
        )}
      </div>

      {/* ── Inline name+email gate (appears only at send time) ──────────── */}
      {showGate && (
        <div
          style={{
            padding: "11px 14px",
            borderTop: `1px solid ${C.borderSoft}`,
            background: C.surfaceFaint,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: C.inkMuted }}>
            Where should {talentFirst} reach you?
          </div>
          {draft.trim() && (
            <div
              style={{
                fontSize: 12,
                color: C.inkMuted,
                background: C.surface,
                border: `1px solid ${C.borderSoft}`,
                borderRadius: 9,
                padding: "8px 11px",
                lineHeight: 1.45,
                maxHeight: 66,
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              <span
                style={{ color: C.inkDim, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3 }}
              >
                YOUR MESSAGE
              </span>
              <br />
              {draft.trim()}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
              style={inputStyle}
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              type="email"
              autoComplete="email"
              style={inputStyle}
            />
          </div>
          <button
            type="button"
            onClick={() => void handleFirstSend()}
            disabled={!gateReady || sending}
            style={{
              ...primaryBtnStyle(accent, accentInk),
              opacity: !gateReady || sending ? 0.5 : 1,
              cursor: !gateReady || sending ? "not-allowed" : "pointer",
            }}
          >
            {sending ? "Sending…" : "Send message"}
          </button>
        </div>
      )}

      {/* ── Captcha slot (inert stub for MVP; Lane B mounts Turnstile here) ─ */}
      {captchaRequired && !showGate && (
        <div
          data-guest-chat-captcha-slot
          style={{
            padding: "9px 14px",
            borderTop: `1px solid ${C.borderSoft}`,
            background: C.surfaceFaint,
            fontSize: 11.5,
            color: C.inkMuted,
          }}
        >
          Quick human check required to continue. (Verification widget loads here.)
        </div>
      )}

      {/* ── Error line ──────────────────────────────────────────────────── */}
      {error && !showGate && (
        <div
          role="alert"
          style={{
            padding: "7px 14px",
            fontSize: 11.5,
            color: C.danger,
            background: "rgba(161,58,58,0.06)",
          }}
        >
          {error}
          {inCooldown ? ` Try again in ${cooldownSecs}s.` : ""}
        </div>
      )}

      {/* ── Composer (hidden while the gate is showing) ─────────────────── */}
      {!showGate && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 8,
            padding: "10px 12px 12px",
            borderTop: `1px solid ${C.borderSoft}`,
            background: C.surface,
          }}
        >
          {/* Honeypot — hidden, off-screen, aria-hidden. Bots fill it; we reject. */}
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
                submit();
              }
            }}
            placeholder={inquiryId ? "Write a reply…" : "Type your message…"}
            rows={1}
            disabled={sending || inCooldown}
            style={{
              flex: 1,
              minHeight: 40,
              maxHeight: 132,
              padding: "10px 12px",
              borderRadius: 12,
              border: `1px solid ${C.borderSoft}`,
              background: C.surfaceFaint,
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
            disabled={sendDisabled}
            aria-label="Send message"
            style={{
              ...primaryBtnStyle(accent, accentInk),
              height: 40,
              width: 46,
              padding: 0,
              opacity: sendDisabled ? 0.45 : 1,
              cursor: sendDisabled ? "not-allowed" : "pointer",
            }}
          >
            {sending ? "…" : <SendIcon color={accentInk} />}
          </button>
        </div>
      )}

      {/* ── Footer: "Open full conversation ↗" (inert/link-only for MVP) ─── */}
      {openFullHref && (
        <a
          href={openFullHref}
          style={{
            display: "block",
            textAlign: "center",
            padding: "8px 14px",
            borderTop: `1px solid ${C.borderSoft}`,
            background: C.surfaceFaint,
            color: C.inkMuted,
            fontSize: 11.5,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Open full conversation ↗
        </a>
      )}
    </div>
  );
}
