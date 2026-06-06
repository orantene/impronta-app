"use client";

/**
 * MiniChatPanel — the talent-profile conversational-inquiry popup (Lane D / F2).
 *
 * THE UX-CRITICAL surface of the guest-chat MVP. A guest on a talent profile
 * opens this floating panel, types a first message freely (never blocked),
 * fills a one-line name+email gate, and a real inquiry is created. The thread
 * then renders live (initial load + ~4s poll) and the guest keeps chatting.
 *
 * F4 (Lane C): the panel can be expanded in-place into a 2-pane layout via
 * the `expanded` + `onToggleExpand` local props (intersected onto MiniChatPanelProps).
 * When expanded, ExpandedChatLayout wraps MiniChatPanelColumn as the right pane
 * and adds a left conversation-list pane.
 *
 * Design constraints baked in (strategy §10 + deep-dives Part C):
 *   • Async-first, honest presence — NO fake "online now".
 *   • First message is NEVER blocked — the email gate appears at send time.
 *   • Premium, brand-skinned — NO gold/rust accents hard-coded (house rule).
 *   • The UI imports NO backend module — actions arrive as injected callbacks.
 *
 * Memoization note: this codebase runs under the React Compiler, so this file
 * deliberately uses plain functions (no manual useCallback/useMemo).
 */

import { useEffect, useRef, useState } from "react";

import type {
  GuestChipKind,
  GuestIdentityTier,
  GuestInquirySummary,
  GuestThreadMessage,
  GuestThreadStatus,
  MiniChatPanelProps,
} from "@/lib/inquiry/guest-chat-contract";

import { ExpandedChatLayout } from "./ExpandedChatLayout";
import { MiniChatPanelColumn } from "./MiniChatPanelColumn";
import { usePresenceChime } from "./usePresenceChime";
import type { StreamRow } from "./MiniChatMessageBubble";
import {
  C,
  DEFAULT_ACCENT,
  EMAIL_RE,
  FONT,
  firstNameOf,
  readableOn,
} from "./mini-chat-styles";

type Stage = "intro" | "gate" | "thread";

// Local extension of MiniChatPanelProps for the F4 expand/collapse props.
// NOT added to guest-chat-contract.ts (shared read-only); consumed here + the launcher only.
type MiniChatPanelLocalProps = MiniChatPanelProps & {
  /** When true, render 2-pane expanded mode. Owned by TalentProfileChatLauncher. */
  expanded?: boolean;
  /** Toggle handler from TalentProfileChatLauncher's setExpanded. */
  onToggleExpand?: () => void;
};

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
  onAddClaimEmail = null,
  fetchMessages,
  pollIntervalMs = 4000,
  openFullHref = null,
  onListGuestInquiries = null,
  onCaptureChip = null,
  soundOnReply = true,
  identity = "guest",
  expanded = false,
  onToggleExpand,
}: MiniChatPanelLocalProps) {
  const accent = brand.accentColor ?? DEFAULT_ACCENT;
  const accentInk = readableOn(brand.accentColor);
  const talentFirst = firstNameOf(brand.talentDisplayName);

  const [inquiryId, setInquiryId] = useState<string | null>(existingInquiryId);
  const [rows, setRows] = useState<StreamRow[]>([]);
  const lastSeenIsoRef = useRef<string | null>(null);

  const [draft, setDraft] = useState("");
  const [name, setName] = useState(prefill?.name ?? "");
  const [email, setEmail] = useState(prefill?.email ?? "");
  const [phone] = useState(prefill?.phone ?? "");
  const [honeypot, setHoneypot] = useState("");

  const [stage, setStage] = useState<Stage>(existingInquiryId ? "thread" : "intro");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownSecs, setCooldownSecs] = useState(0);
  const [captchaRequired, setCaptchaRequired] = useState(false);

  const [typicalReply, setTypicalReply] = useState<string | null>(null);
  const [threadStatus, setThreadStatus] = useState<GuestThreadStatus>("open");
  const [emailedTo, setEmailedTo] = useState<string | null>(null);

  const [pulseActive, setPulseActive] = useState(false);
  const [seenAtByInquiry, setSeenAtByInquiry] = useState<Record<string, string>>({});
  const { notifyInbound } = usePresenceChime({
    soundEnabled: soundOnReply && Boolean(inquiryId),
  });

  const [limitNudge, setLimitNudge] = useState<{
    tier: GuestIdentityTier;
    activeCount: number;
    limit: number;
  } | null>(null);

  const [capturedChipKinds, setCapturedChipKinds] = useState<GuestChipKind[]>([]);

  // F4: inquiries list for the expanded left pane.
  const [inquiries, setInquiries] = useState<GuestInquirySummary[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const inCooldown = cooldownSecs > 0;

  // Named switch handler — shared by mini-mode dropdown + expanded left pane.
  function handleSwitchInquiry(id: string) {
    if (id === inquiryId) return;
    setInquiryId(id);
    setRows([]);
    lastSeenIsoRef.current = null;
    setStage("thread");
    setCapturedChipKinds([]);
  }

  // F4: load the inquiries list when open (for both mini switcher + expanded pane).
  useEffect(() => {
    if (!open || !onListGuestInquiries || !tenantSlug) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await onListGuestInquiries({ tenantSlug });
        if (!cancelled && res.ok) setInquiries(res.inquiries);
      } catch {
        /* transient */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, expanded, onListGuestInquiries, tenantSlug]);

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
      if (inquiryId) {
        setSeenAtByInquiry((prev) =>
          prev[inquiryId] && prev[inquiryId] >= newest
            ? prev
            : { ...prev, [inquiryId]: newest },
        );
      }
    }
  }

  useEffect(() => {
    if (cooldownSecs <= 0) return;
    const id = setInterval(() => {
      setCooldownSecs((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [cooldownSecs]);

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
          const inbound = res.messages.filter(
            (m) => m.authorRole !== "guest" && m.authorRole !== "system",
          );
          mergeServer(res.messages);
          setThreadStatus(res.threadStatus);
          if (res.typicalReplyLabel) setTypicalReply(res.typicalReplyLabel);
          if (inbound.length > 0) {
            notifyInbound(inbound.length);
            setPulseActive(true);
            setTimeout(() => setPulseActive(false), 1200);
          }
        }
      } catch {
        /* transient */
      }
      if (!stopped) timer = setTimeout(tick, pollIntervalMs);
    };

    timer = setTimeout(tick, pollIntervalMs);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [open, inquiryId, pollIntervalMs, fetchMessages, notifyInbound]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows.length, stage]);

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

  function applyFailure(
    code: string,
    message: string,
    retryAfterMs?: number,
    extra?: { gateTier?: GuestIdentityTier; activeCount?: number; limit?: number },
  ) {
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
    if (code === "limit_reached") {
      const tier: GuestIdentityTier =
        extra?.gateTier ??
        (identity === "account"
          ? "account"
          : identity === "email_verified"
            ? "email_verified"
            : identity === "identified" ||
                (Boolean(name.trim()) && EMAIL_RE.test(email.trim()))
              ? "identified"
              : "guest");
      setLimitNudge({
        tier,
        activeCount: extra?.activeCount ?? 0,
        limit: extra?.limit ?? 0,
      });
      setError(message);
      return;
    }
    setError(message || "Something went wrong. Please try again.");
  }

  async function handleFirstSend() {
    const body = draft.trim();
    if (!body) return;
    if (!name.trim() || !EMAIL_RE.test(email.trim())) {
      setStage("gate");
      setError(null);
      return;
    }
    setSending(true);
    setError(null);
    setCaptchaRequired(false);
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
      setDraft(body);
      applyFailure(res.code, res.message, res.retryAfterMs, {
        gateTier: res.gateTier,
        activeCount: res.activeCount,
        limit: res.limit,
      });
      return;
    }
    setInquiryId(res.inquiryId);
    setEmailedTo(res.guestEmail);
    lastSeenIsoRef.current = null;
    setRows((cur) => cur.filter((r) => r.id !== tmpId));
    const seeded: GuestThreadMessage[] = [res.openingMessage];
    if (res.autoAckMessage) seeded.push(res.autoAckMessage);
    mergeServer(seeded);
  }

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
    if (inquiryId) void handleReply();
    else void handleFirstSend();
  }

  if (!open) return null;

  const sendDisabled = !draft.trim() || sending || inCooldown;

  // Shared column props passed to MiniChatPanelColumn (avoids duplication).
  const columnProps = {
    brand,
    accent,
    accentInk,
    talentFirst,
    tenantSlug,
    talentProfileId,
    open,
    expanded,
    inquiryId,
    rows,
    scrollRef,
    stage,
    threadStatus,
    typicalReply,
    emailedTo,
    seenAtByInquiry,
    pulseActive,
    limitNudge,
    capturedChipKinds,
    draft,
    name,
    email,
    honeypot,
    sending,
    error,
    inCooldown,
    cooldownSecs,
    sendDisabled,
    captchaRequired,
    onClose,
    onDraftChange: setDraft,
    onNameChange: setName,
    onEmailChange: setEmail,
    onHoneypotChange: setHoneypot,
    onSubmit: submit,
    onFirstSend: () => void handleFirstSend(),
    onAddClaimEmail,
    onSwitchInquiry: handleSwitchInquiry,
    onCaptureChip,
    onCapturedChipKind: (kind: GuestChipKind) =>
      setCapturedChipKinds((k) => (k.includes(kind) ? k : [...k, kind])),
    prefill,
    openFullHref,
    onListGuestInquiries,
    onToggleExpand,
    identity,
    textareaRef,
  };

  // ── Expanded 2-pane mode (F4) ─────────────────────────────────────────────
  if (expanded) {
    return (
      <ExpandedChatLayout
        right={<MiniChatPanelColumn {...columnProps} />}
        accent={accent}
        accentInk={accentInk}
        ariaLabel={`Message ${brand.agencyName}`}
        inquiries={inquiries}
        activeInquiryId={inquiryId}
        seenAtByInquiry={seenAtByInquiry}
        onSelect={handleSwitchInquiry}
      />
    );
  }

  // ── Mini single-column mode (default) ─────────────────────────────────────
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
      <MiniChatPanelColumn {...columnProps} />
    </div>
  );
}
