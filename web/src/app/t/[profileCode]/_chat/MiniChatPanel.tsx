"use client";

/**
 * MiniChatPanel — the talent-profile conversational-inquiry popup (Lane D / F2).
 *
 * THE UX-CRITICAL surface of the guest-chat MVP. A guest on a talent profile
 * opens this floating panel, types a first message freely (never blocked),
 * fills a one-line name+email gate, and a real inquiry is created. The thread
 * then renders live (initial load + ~4s poll) and the guest keeps chatting.
 *
 * F4 (Lane C): the panel can be expanded in-place into a 2-pane layout via the
 * `expanded` + `onToggleExpand` local props; ExpandedChatLayout wraps
 * MiniChatPanelColumn as the right pane and adds a left conversation-list pane.
 *
 * Design constraints (strategy §10 + deep-dives Part C): async-first honest
 * presence (NO fake "online now"); first message NEVER blocked (gate at send
 * time); NO gold/rust accents hard-coded; the UI imports NO backend module
 * (actions arrive as injected callbacks). Runs under the React Compiler, so plain
 * functions are used (no manual useCallback/useMemo).
 */

import { useEffect, useRef, useState } from "react";

import type {
  GuestChipKind,
  GuestChipValue,
  GuestIdentityTier,
  GuestInquirySummary,
  GuestThreadMessage,
  GuestThreadStatus,
  InquiryReceiptData,
} from "@/lib/inquiry/guest-chat-contract";
import type { InquiryIntent } from "@/lib/inquiry/inquiry-intent";

import { createTranslator } from "@/i18n/messages";

import { ExpandedChatLayout } from "./ExpandedChatLayout";
import { MiniChatPanelColumn } from "./MiniChatPanelColumn";
import { usePresenceChime } from "./usePresenceChime";
import { useUnifiedInquiry } from "./use-unified-inquiry";
import type { UnifiedInquiryPatch } from "./use-unified-inquiry";
import { useMiniChatSend } from "./use-mini-chat-send";
import { useJon360PanelTracking } from "./use-jon360-panel-tracking";
import { useSentAirlock } from "./use-sent-airlock";
import { useCartTalentPreload } from "./use-cart-talent-preload";
import {
  NOOP_CAPTURE_CHIP,
  NOOP_ENSURE_INQUIRY,
  deriveTalentPickState,
  makeRemoteNoteRows,
  reconcileCartRemovals,
} from "./mini-chat-panel-helpers";
import { useGuestDetailReconcile } from "./use-guest-detail-reconcile";
import { chipValueToPatch, chipValuesToServerIntent } from "./unified-inquiry-bridge";
import type { StreamRow } from "./MiniChatMessageBubble";
import {
  DEFAULT_ACCENT,
  EMAIL_RE,
  firstNameOf,
  paletteFor,
  readableOn,
  splitGuestFullName,
} from "./mini-chat-styles";
import { miniPanelContainerStyle } from "./mini-chat-panel-geometry";
import { useCompactViewport } from "./use-compact-viewport";
import type { MiniChatPanelLocalProps } from "./mini-chat-panel-props";
import { OfferingQuickPicker, offeringDraftPrefix, type ChatOffering } from "./OfferingQuickPicker";
import { setPendingOffering } from "./pending-offering-store";

type Stage = "intro" | "gate" | "thread";

// ───────────────────────────────────────────────────────────────────────────
// Component
// ───────────────────────────────────────────────────────────────────────────

export function MiniChatPanel({
  open,
  onClose,
  tenantSlug,
  tenantId = null,
  talentProfileId,
  talentProfileCode,
  sourcePage,
  brand,
  existingInquiryId = null,
  prefill = null,
  offerings = [],
  onStartInquiry,
  onSendMessage,
  onAddClaimEmail = null,
  onCheckClaimEmail = null,
  fetchMessages,
  pollIntervalMs = 4000,
  openFullHref = null,
  onListGuestInquiries = null,
  onCaptureChip = null,
  onEnsureInquiry = null,
  onLoadDetails = null,
  onListRoster = null,
  soundOnReply = true,
  identity = "guest",
  surfaceMode = "light",
  expanded = false,
  onToggleExpand,
  cartTalentIds,
  cartTalentNames,
  openToTalentSection = false,
  onConsumeOpenToTalentSection,
  onRemoveCartTalent,
  onRegisterRemoveTalent,
  onInquiryIdChange,
}: MiniChatPanelLocalProps) {
  const accent = brand.accentColor ?? DEFAULT_ACCENT;
  const accentInk = readableOn(brand.accentColor);
  // Jon 360 Phase 7 — active C palette (light default; dark for noir tenants),
  // threaded to the column + 2-pane shell; + full-screen mobile sheet signal.
  const P = paletteFor(surfaceMode);
  const compactSheet = useCompactViewport();
  const talentFirst = firstNameOf(brand.talentDisplayName);
  // Guest UI locale rides along on `brand` (resolved server-side from the
  // tenant's default_locale, since guests have no LOCALE_COOKIE).
  const t = createTranslator(brand.locale ?? "en");

  const [inquiryId, setInquiryId] = useState<string | null>(existingInquiryId);
  const [rows, setRows] = useState<StreamRow[]>([]);
  const lastSeenIsoRef = useRef<string | null>(null);

  const [draft, setDraft] = useState("");
  const prefillNames = splitGuestFullName(prefill?.name);
  const [firstName, setFirstName] = useState(prefill?.firstName ?? prefillNames.firstName);
  const [lastName, setLastName] = useState(prefill?.lastName ?? prefillNames.lastName);
  const [email, setEmail] = useState(prefill?.email ?? "");
  const [phone] = useState(prefill?.phone ?? "");
  const [honeypot, setHoneypot] = useState("");

  const [stage, setStage] = useState<Stage>(existingInquiryId ? "thread" : "intro");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownSecs, setCooldownSecs] = useState(0);
  const [captchaRequired, setCaptchaRequired] = useState(false);

  const [threadMeta, setThreadMeta] = useState<{ typicalReply: string | null; receipt: InquiryReceiptData | null }>({ typicalReply: null, receipt: null });
  const [threadStatus, setThreadStatus] = useState<GuestThreadStatus>("open");
  const [emailedTo, setEmailedTo] = useState<string | null>(null);
  const [gateEmailNotice, setGateEmailNotice] = useState<string | null>(null);
  const [gateEmailBlocksSubmit, setGateEmailBlocksSubmit] = useState(false);

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
  // Per-kind captured chip values (for re-edit pre-fill + reconcile display).
  const [capturedChipValues, setCapturedChipValues] = useState<
    Partial<Record<GuestChipKind, GuestChipValue>>
  >({});
  // P1-T3: the latest server-read details, fed to the unified hook as the
  // reconcile base. The remote-change flash kinds come back from the reconcile
  // hook below.
  const [serverIntent, setServerIntent] = useState<InquiryIntent | null>(null);

  // F4: inquiries list for the expanded left pane.
  const [inquiries, setInquiries] = useState<GuestInquirySummary[]>([]);

  // Finding #2: post-"Send to agency" success note (one-shot confirmation).
  const [sentNote, setSentNote] = useState(false);
  // Jon 360 Phase 1: the SENT airlock beat, played on a REAL send-success only.
  const { showSentAirlock, trigger: triggerSentAirlock } = useSentAirlock();
  // Finding #3: the last patch sent, so the draft banner's retry can re-run the
  // exact failed write rather than guessing which field failed.
  const lastPatchRef = useRef<UnifiedInquiryPatch | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const inCooldown = cooldownSecs > 0;

  // P1-T1/T2/T3: useUnifiedInquiry owns the SINGLE inquiry record behind this
  // panel (lazy early-row create, debounced patch() writes, per-field sync state,
  // inbound serverIntent reconcile). NOOP_* fallbacks keep patch() inert when the
  // injected actions are absent.
  const unified = useUnifiedInquiry({
    tenantSlug,
    tenantId,
    talentProfileId: talentProfileId || null,
    talentProfileCode: talentProfileCode || null,
    sourcePage,
    existingInquiryId: inquiryId,
    serverIntent,
    ensureInquiry: onEnsureInquiry ?? NOOP_ENSURE_INQUIRY,
    onCaptureChip: onCaptureChip ?? NOOP_CAPTURE_CHIP,
  });

  // Phase 0c CRO — Jon-360 funnel firing (receipt_viewed + send/reply).
  const jon360 = useJon360PanelTracking({
    inquiryId: unified.inquiryId ?? inquiryId, tenantId, cartTalentIds,
    identity, sourcePage, receipt: threadMeta.receipt,
  });

  // When the hook lazily creates the early row, adopt its id so the thread + gate
  // target the same inquiry.
  useEffect(() => {
    if (unified.inquiryId && unified.inquiryId !== inquiryId) {
      setInquiryId(unified.inquiryId);
    }
  }, [unified.inquiryId, inquiryId]);

  // Report the resolved inquiry id up so the launcher's rail X-remove can patch
  // the record in sync with the cart (without ever creating a fresh row).
  useEffect(() => {
    onInquiryIdChange?.(inquiryId);
  }, [inquiryId, onInquiryIdChange]);

  // Phase 3: opening the pill with cart talent preloads them (use-cart-talent-preload).
  useCartTalentPreload({
    open,
    cartTalentIds,
    cartTalentNames,
    enabled: Boolean(onEnsureInquiry),
    intent: unified.intent,
    patch: unified.patch,
  });

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

  useEffect(() => {
    if (stage !== "gate" || !onCheckClaimEmail) {
      setGateEmailNotice(null);
      setGateEmailBlocksSubmit(false);
      return;
    }

    const addr = email.trim();
    if (!EMAIL_RE.test(addr)) {
      setGateEmailNotice(null);
      setGateEmailBlocksSubmit(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const res = await onCheckClaimEmail({ email: addr, replacePrimary: false });
        if (cancelled) return;
        if (!res.ok) {
          setGateEmailNotice(null);
          setGateEmailBlocksSubmit(false);
          return;
        }
        setGateEmailNotice(res.message ?? null);
        setGateEmailBlocksSubmit(Boolean(res.blocksSubmit));
      })();
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [email, onCheckClaimEmail, stage]);

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

  // Early-row send keeps the same inquiryId (draft -> submitted), so the full
  // load effect below won't re-run on its own and the RECEIVED receipt + sent
  // status (which the send action does not return) never load. Bump this on a
  // successful send to force exactly one more full load via the proven path.
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!open || !inquiryId) return;
    let cancelled = false;
    void (async () => {
      const res = await fetchMessages({ inquiryId, afterIso: null });
      if (cancelled || !res.ok) return;
      lastSeenIsoRef.current = null;
      mergeServer(res.messages);
      setThreadStatus(res.threadStatus);
      setThreadMeta({ typicalReply: res.typicalReplyLabel, receipt: res.receipt });
      setStage("thread");
    })();
    return () => {
      cancelled = true;
    };
  }, [open, inquiryId, fetchMessages, reloadTick]);

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
          if (res.typicalReplyLabel) setThreadMeta((m) => ({ ...m, typicalReply: res.typicalReplyLabel }));
          if (inbound.length > 0) {
            notifyInbound(inbound.length);
            setPulseActive(true);
            setTimeout(() => setPulseActive(false), 1200);
            jon360.trackReply(); // Phase 0c CRO — coordinator reply landed.
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

  // P1-T3: useGuestDetailReconcile re-reads the owned inquiry row on a realtime
  // refresh, adopts the values (serverIntent base) and flashes + notes remote
  // changes. Kinds the guest is editing now are skipped (no clobber).
  const savingKinds = new Set<GuestChipKind>(
    (Object.keys(unified.fieldState) as GuestChipKind[]).filter(
      (k) => unified.fieldState[k] === "saving",
    ),
  );
  const { flashKinds: remoteFlashKinds } = useGuestDetailReconcile({
    open,
    inquiryId,
    tenantId,
    onLoadDetails,
    savingKinds,
    onValues: (values, capturedKinds) => {
      setServerIntent(chipValuesToServerIntent(values));
      setCapturedChipValues(values);
      setCapturedChipKinds((prev) => {
        const merged = new Set(prev);
        for (const k of capturedKinds) merged.add(k);
        return Array.from(merged);
      });
    },
    onRemoteNote: (kinds) => {
      setRows((cur) => [...cur, ...makeRemoteNoteRows(kinds, inquiryId, t)]);
    },
  });

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
      setError(message || t("public.guestChat.errRateLimited"));
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
                (Boolean(firstName.trim()) && EMAIL_RE.test(email.trim()))
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

  // Send state machine (handleFirstSend / handleReply / submit) extracted to keep
  // this orchestrator under its line cap. submit() routes on contactPromoted so an
  // un-promoted early row always passes the ContactCard gate (findings #1 + #5).
  const { handleFirstSend, submit, sendToAgency } = useMiniChatSend({
    draft,
    firstName,
    lastName,
    email,
    phone,
    honeypot,
    inquiryId,
    sending,
    inCooldown,
    tenantSlug,
    talentProfileId,
    talentProfileCode,
    sourcePage,
    contactPromoted: unified.contactPromoted,
    promoteContact: unified.promoteContact,
    onStartInquiry,
    onSendMessage,
    setRows,
    setDraft,
    setStage,
    setSending,
    setError,
    setCaptchaRequired,
    setInquiryId,
    setEmailedTo,
    lastSeenIsoRef,
    mergeServer,
    applyFailure,
    onSent: () => {
      // Phase 0c CRO — send_clicked + contact_promoted (the PRIMARY conversion).
      jon360.trackSend();
      setSentNote(true);
      triggerSentAirlock();
      // Force one full re-load so the receipt card + sent status mount: the send
      // action returns neither and inquiryId is unchanged on an early-row submit.
      setReloadTick((n) => n + 1);
    },
  });

  // Finding #3: re-run the exact last failed patch when the draft banner's retry
  // is tapped (no-op when nothing has been patched yet).
  function handleRetrySync() {
    const last = lastPatchRef.current;
    if (last) void unified.patch(last);
  }

  // P1-T1/T2: a chip edit routes through the unified hook (optimistic local
  // display, then patch() the single record; micro-status via unified.fieldState).
  async function handleChipPatch(kind: GuestChipKind, value: GuestChipValue) {
    setCapturedChipValues((prev) => ({ ...prev, [kind]: value }));
    setCapturedChipKinds((k) => (k.includes(kind) ? k : [...k, kind]));
    const patch = chipValueToPatch(kind, value);
    if (!patch) return;
    lastPatchRef.current = patch;
    await unified.patch(patch);
  }

  // Phase 2 / Addendum A: Talent / Brief / Contact editors route through the SAME
  // useUnifiedInquiry.patch path as the chips (one record, synced thread note).
  async function handleTalentChange(
    selectedIds: string[],
    selectionMode: "i_know_who" | "agency_recommends",
    selectedNames: string[],
  ) {
    // Keep the launcher cart (the rail's single source) in sync: a cart talent
    // dropped in-chat is also removed from the cart, so rail + form + record agree.
    reconcileCartRemovals(selectedIds, cartTalentIds, onRemoveCartTalent);
    lastPatchRef.current = { kind: "talent", selectedIds, selectionMode, selectedNames };
    await unified.patch({ kind: "talent", selectedIds, selectionMode, selectedNames });
  }

  // B6: register the unified talent-patch runner up to the launcher so the rail
  // X-remove routes the RECORD write through the SAME useUnifiedInquiry.patch path
  // as the in-chat change above (same saving state + grace window + retry). The
  // launcher owns the local cart op, so this runner does only the record write (no
  // reconcileCartRemovals re-mirror — that would recurse into the launcher's own
  // cart removal). Add and remove patch { kind:"talent" } with the full id set.
  const unifiedPatch = unified.patch;
  useEffect(() => {
    if (!onRegisterRemoveTalent) return;
    onRegisterRemoveTalent(
      (
        selectedIds: string[],
        selectionMode: "i_know_who" | "agency_recommends",
        selectedNames: string[],
      ) => {
        lastPatchRef.current = { kind: "talent", selectedIds, selectionMode, selectedNames };
        void unifiedPatch({ kind: "talent", selectedIds, selectionMode, selectedNames });
      },
    );
    return () => onRegisterRemoveTalent(null);
  }, [onRegisterRemoveTalent, unifiedPatch]);

  async function handleBriefChange(summary: string) {
    lastPatchRef.current = { kind: "brief", summary };
    await unified.patch({ kind: "brief", summary });
  }

  async function handleContactChange(value: {
    name: string;
    email: string;
    phone: string;
  }) {
    // Mirror into the gate state so a later first-message send is pre-satisfied.
    if (value.name) {
      const parts = splitGuestFullName(value.name);
      setFirstName(parts.firstName);
      setLastName(parts.lastName);
    }
    if (value.email) setEmail(value.email);
    // When the editor supplies a complete, valid contact, PROMOTE the early row
    // (flips contactPromoted) so a later send continues the thread instead of
    // re-forcing the gate. Partial edits fall back to a debounced patch.
    if (value.name.trim() && EMAIL_RE.test(value.email.trim())) {
      await unified.promoteContact({
        name: value.name.trim(),
        email: value.email.trim(),
        phone: value.phone.trim() || null,
      });
      return;
    }
    const contactPatch: UnifiedInquiryPatch = {
      kind: "contact",
      name: value.name || null,
      email: value.email || null,
      phone: value.phone || null,
    };
    lastPatchRef.current = contactPatch;
    await unified.patch(contactPatch);
  }

  const selectedTalentIds = unified.intent.talent?.selected_ids ?? [];
  // Phase 3: empty-state talent-pick-first lead + Talent-section deep-link (§B.1/§B.2).
  const { talentPickFirst, railOpenToSection } = deriveTalentPickState({
    enabled: Boolean(onEnsureInquiry),
    talentProfileId,
    stage,
    inquiryId,
    cartTalentIds,
    intent: unified.intent,
    openToTalentSection,
  });
  const briefSummary = unified.intent.brief?.summary ?? null;
  const contactValues = {
    name: unified.intent.requester?.name ?? null,
    email: unified.intent.requester?.email ?? null,
    phone: unified.intent.requester?.phone ?? null,
  };

  if (!open) return null;

  const sendDisabled = !draft.trim() || sending || inCooldown;

  // Shared column props passed to MiniChatPanelColumn (avoids duplication).
  const columnProps = {
    brand,
    accent,
    accentInk,
    surfaceMode,
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
    typicalReply: threadMeta.typicalReply,
    receipt: threadMeta.receipt,
    emailedTo,
    seenAtByInquiry,
    pulseActive,
    limitNudge,
    capturedChipKinds,
    draft,
    firstName,
    lastName,
    email,
    honeypot,
    sending,
    error,
    inCooldown,
    cooldownSecs,
    sendDisabled,
    captchaRequired,
    onClose,
    onDraftChange: (v: string) => {
      if (sentNote) setSentNote(false); // resuming composing clears the Sent note
      setDraft(v);
    },
    onFirstNameChange: setFirstName,
    onLastNameChange: setLastName,
    onEmailChange: setEmail,
    onHoneypotChange: setHoneypot,
    onSubmit: submit,
    onFirstSend: () => void handleFirstSend(),
    gateEmailNotice,
    gateEmailBlocksSubmit,
    onAddClaimEmail,
    onCheckClaimEmail,
    onGuestEmailUpdated: (addr: string) => {
      setEmailedTo(addr);
      setEmail(addr);
    },
    onSwitchInquiry: handleSwitchInquiry,
    onCaptureChip,
    onCapturedChipKind: (kind: GuestChipKind) =>
      setCapturedChipKinds((k) => (k.includes(kind) ? k : [...k, kind])),
    onPatchChip: onEnsureInquiry ? handleChipPatch : null,
    capturedChipValues,
    chipFieldState: unified.fieldState,
    chipRemoteFlashKinds: remoteFlashKinds,
    // Finding #3: panel-level sync visibility + retry of the last failed patch.
    syncState: unified.syncState,
    onRetrySync: handleRetrySync,
    // Jon 360 Phase 1: draft = early row exists but contact not yet promoted.
    inquiryRecordExists: Boolean(inquiryId),
    contactPromoted: unified.contactPromoted,
    showSentAirlock,
    // Finding #2: the explicit "Send to agency" CTA. Hidden once the thread is a
    // live, contact-promoted conversation (the composer carries the reply flow).
    onSendToAgency:
      onEnsureInquiry && !(inquiryId && unified.contactPromoted)
        ? () => void sendToAgency()
        : undefined,
    sentNote,
    // Phase 2 / Addendum A: the Talent / Brief / Contact editors + details rail.
    extrasEnabled: Boolean(onEnsureInquiry),
    onListRoster,
    selectedTalentIds,
    briefSummary,
    contactValues,
    inquiryIntent: unified.intent,
    onTalentChange: (
      ids: string[],
      mode: "i_know_who" | "agency_recommends",
      names: string[],
    ) => void handleTalentChange(ids, mode, names),
    onBriefChange: (summary: string) => void handleBriefChange(summary),
    onContactChange: (value: { name: string; email: string; phone: string }) =>
      void handleContactChange(value),
    cartTalentNames, // Phase 6: gate lineup recap source (live cart names)
    talentPickFirst, // Phase 3: empty-cart lead + +N/avatar deep-link to Talent
    railOpenToSection,
    onConsumeRailOpenTo: () => onConsumeOpenToTalentSection?.(),
    prefill,
    openFullHref,
    onListGuestInquiries,
    onToggleExpand,
    identity, textareaRef,
  };

  // ── Expanded 2-pane mode (F4) ─────────────────────────────────────────────
  if (expanded) {
    return (
      <ExpandedChatLayout
        right={<MiniChatPanelColumn {...columnProps} />}
        accent={accent}
        accentInk={accentInk}
        surfaceMode={surfaceMode}
        locale={brand.locale}
        ariaLabel={`Message ${brand.agencyName}`}
        inquiries={inquiries}
        activeInquiryId={inquiryId}
        seenAtByInquiry={seenAtByInquiry}
        onSelect={handleSwitchInquiry}
      />
    );
  }

  // ── Mini single-column mode (default) ─────────────────────────────────────
  // Geometry (desktop card vs. full-screen mobile sheet) lives in geometry.ts.
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={`Message ${brand.agencyName}`}
      style={miniPanelContainerStyle(P, compactSheet)}
    >
      <MiniChatPanelColumn {...columnProps} />
      {/* W2-B — the talent's services inside the chat: tap → the request. */}
      <OfferingQuickPicker
        offerings={offerings as ChatOffering[]}
        locale={brand.locale ?? "en"}
        onPick={(o) => {
          setPendingOffering({ ...o, intent: "request" });
          if (sentNote) setSentNote(false);
          setDraft(offeringDraftPrefix(o, brand.locale ?? "en"));
        }}
      />
    </div>
  );
}
