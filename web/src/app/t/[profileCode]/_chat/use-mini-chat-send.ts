"use client";

/**
 * useMiniChatSend — the guest-chat send state machine extracted from MiniChatPanel
 * to keep that orchestrator under its line cap (god-file split). It owns the three
 * send paths and the single `submit()` router:
 *
 *   • handleReply — continue a REAL (contact-promoted) live thread.
 *   • continueEarlyInquiry — an early-partial row already exists (created by a
 *     prior chip/cart action with the synthetic seed contact): promote its contact
 *     to the real values, then send the first message to THAT id. No second
 *     inquiry is created and the placeholder contact never reaches admin Messages
 *     (findings #1 + #5).
 *   • handleFirstSend — gate on name/email, then branch to continueEarlyInquiry
 *     (early row present) or onStartInquiry (fresh create).
 *
 * submit() routes on `contactPromoted` (NOT inquiryId alone) so an un-promoted
 * early row always passes through the ContactCard gate before it can finalize.
 *
 * Pure orchestration over injected state/setters; imports no backend module.
 */

import { useRef } from "react";
import type { MutableRefObject } from "react";

import type {
  GuestIdentityTier,
  GuestThreadMessage,
  StartGuestChatInput,
  StartGuestChatResult,
  SendGuestMessageInput,
  SendGuestMessageResult,
} from "@/lib/inquiry/guest-chat-contract";
import type { StreamRow } from "./MiniChatMessageBubble";
import { makePendingRow, markRowFailed } from "./mini-chat-panel-helpers";
import { EMAIL_RE, joinGuestDisplayName } from "./mini-chat-styles";

type Stage = "intro" | "gate" | "thread";

export type MiniChatSendArgs = {
  // Identity + composer state.
  draft: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  honeypot: string;
  inquiryId: string | null;
  sending: boolean;
  inCooldown: boolean;
  // Attribution.
  tenantSlug: string;
  talentProfileId: string;
  talentProfileCode: string;
  sourcePage: string;
  // Unified record (early-row create + contact promotion).
  contactPromoted: boolean;
  promoteContact: (value: {
    name: string;
    email: string;
    phone?: string | null;
  }) => Promise<boolean>;
  // Injected server actions.
  onStartInquiry: (input: StartGuestChatInput) => Promise<StartGuestChatResult>;
  onSendMessage: (input: SendGuestMessageInput) => Promise<SendGuestMessageResult>;
  // Setters / refs owned by the panel.
  setRows: (updater: (cur: StreamRow[]) => StreamRow[]) => void;
  setDraft: (v: string) => void;
  setStage: (v: Stage) => void;
  setSending: (v: boolean) => void;
  setError: (v: string | null) => void;
  setCaptchaRequired: (v: boolean) => void;
  setInquiryId: (v: string) => void;
  setEmailedTo: (v: string | null) => void;
  lastSeenIsoRef: MutableRefObject<string | null>;
  mergeServer: (incoming: GuestThreadMessage[]) => void;
  applyFailure: (
    code: string,
    message: string,
    retryAfterMs?: number,
    extra?: { gateTier?: GuestIdentityTier; activeCount?: number; limit?: number },
  ) => void;
  /** Called once a "Send to agency" submission lands, to show the success note. */
  onSent?: () => void;
};

export type MiniChatSendResult = {
  handleFirstSend: () => Promise<void>;
  handleReply: () => Promise<void>;
  submit: () => void;
  /**
   * Explicit "Send to agency" affordance (plan §B.9 / finding #2). Gives a
   * confirming "I'm done, submit this" moment for the rail-first flow where the
   * guest filled the details sidebar but never typed a chat line.
   *
   *   • Live promoted thread already → no-op send, just confirm (onSent).
   *   • Contact still the placeholder seed / not collected → force the ContactCard
   *     gate (returns "needs_contact"; the panel sets stage="gate"). The gate's own
   *     send completes the promotion + first message.
   *   • Contact already collected in gate state but row not promoted → promote +
   *     send a default first message to the existing/new id, then confirm.
   *
   * Returns the outcome so the panel can set the gate stage and/or show the
   * success note.
   */
  sendToAgency: () => Promise<"sent" | "needs_contact" | "error">;
};

/** Default first message when the guest sends from the rail without typing one. */
const DEFAULT_FIRST_BODY = "I would like to inquire about your talent.";

export function useMiniChatSend(args: MiniChatSendArgs): MiniChatSendResult {
  const {
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
    contactPromoted,
    promoteContact,
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
    onSent,
  } = args;

  // Set when sendToAgency forced the ContactCard gate, so the gate's own submit
  // (handleFirstSend) fires the success note once it lands. Cleared on completion.
  const sendToAgencyPendingRef = useRef(false);

  /**
   * Promote an existing early-partial row's placeholder contact to the real
   * values, then send the first message to THAT inquiry. No second inquiry is
   * created and the placeholder contact is overwritten before delivery.
   */
  async function continueEarlyInquiry(earlyId: string, body: string): Promise<boolean> {
    setSending(true);
    setError(null);
    setCaptchaRequired(false);
    const tmpId = `tmp-${Date.now()}`;
    setRows((cur) => [...cur, makePendingRow(tmpId, earlyId, body)]);
    setDraft("");
    setStage("thread");

    // Promote the placeholder contact FIRST so the inquiry carries a reachable
    // contact before the message is delivered.
    const promoted = await promoteContact({
      name: joinGuestDisplayName(firstName, lastName),
      email: email.trim(),
      phone: phone.trim() || null,
    });
    if (!promoted) {
      setSending(false);
      setRows((cur) => markRowFailed(cur, tmpId));
      setDraft(body);
      setError("We couldn't save your contact details. Please try again.");
      return false;
    }

    const res = await onSendMessage({ inquiryId: earlyId, body, honeypot: honeypot || null });
    setSending(false);
    if (!res.ok) {
      setRows((cur) => markRowFailed(cur, tmpId));
      setDraft(body);
      applyFailure(res.code, res.message, res.retryAfterMs);
      return false;
    }
    setRows((cur) => cur.map((r) => (r.id === tmpId ? { ...res.message, pending: false } : r)));
    const iso = res.message.createdAt;
    if (!lastSeenIsoRef.current || iso > lastSeenIsoRef.current) {
      lastSeenIsoRef.current = iso;
    }
    return true;
  }

  async function handleFirstSend() {
    // When the gate was forced by "Send to agency" (rail-first flow), the guest
    // may have typed no chat line — synthesize a default first message so the
    // submit still lands. Normal composer behavior (empty draft = no-op) holds
    // when the CTA did not initiate this send.
    const body = draft.trim() || (sendToAgencyPendingRef.current ? DEFAULT_FIRST_BODY : "");
    if (!body) return;
    if (!firstName.trim() || !EMAIL_RE.test(email.trim())) {
      setStage("gate");
      setError(null);
      return;
    }
    // Findings #1 / #5: an early-partial row may already exist (a prior chip /
    // cart action created it with the synthetic seed contact). Promote-then-send
    // to that id instead of creating a second/shadow inquiry; this is also the
    // contact-gate (the real contact is written before the message lands).
    const earlyId = inquiryId;
    if (earlyId && !contactPromoted) {
      const ok = await continueEarlyInquiry(earlyId, body);
      if (ok && sendToAgencyPendingRef.current) {
        sendToAgencyPendingRef.current = false;
        onSent?.();
      }
      return;
    }

    const contactName = joinGuestDisplayName(firstName, lastName);
    setSending(true);
    setError(null);
    setCaptchaRequired(false);
    const tmpId = `tmp-${Date.now()}`;
    setRows((cur) => [...cur, makePendingRow(tmpId, "", body)]);
    setDraft("");
    setStage("thread");
    const res = await onStartInquiry({
      tenantSlug,
      talentProfileId,
      talentProfileCode,
      contactFirstName: firstName.trim(),
      contactLastName: lastName.trim() || null,
      contactName,
      contactEmail: email.trim(),
      contactPhone: phone.trim() || null,
      firstMessage: body,
      sourcePage,
      honeypot: honeypot || null,
    });
    setSending(false);
    if (!res.ok) {
      setRows((cur) => markRowFailed(cur, tmpId));
      setDraft(body);
      applyFailure(res.code, res.message, res.retryAfterMs, {
        gateTier: res.gateTier,
        activeCount: res.activeCount,
        limit: res.limit,
      });
      return;
    }
    setInquiryId(res.inquiryId);
    setEmailedTo(res.claimEmailSent ? res.guestEmail : null);
    if (!res.claimEmailSent && res.guestActivation !== "unlinked") {
      setError(
        "Your message was sent, but we couldn't email a sign-in link. Use \"Email me a sign-in link\" below to try again.",
      );
    }
    lastSeenIsoRef.current = null;
    setRows((cur) => cur.filter((r) => r.id !== tmpId));
    const seeded: GuestThreadMessage[] = [res.openingMessage];
    if (res.autoAckMessage) seeded.push(res.autoAckMessage);
    mergeServer(seeded);
    if (sendToAgencyPendingRef.current) {
      sendToAgencyPendingRef.current = false;
      onSent?.();
    }
  }

  /** Create a fresh inquiry (no early row) with the collected contact + body. */
  async function startFreshInquiry(body: string): Promise<boolean> {
    const contactName = joinGuestDisplayName(firstName, lastName);
    setSending(true);
    setError(null);
    setCaptchaRequired(false);
    const tmpId = `tmp-${Date.now()}`;
    setRows((cur) => [...cur, makePendingRow(tmpId, "", body)]);
    setDraft("");
    setStage("thread");
    const res = await onStartInquiry({
      tenantSlug,
      talentProfileId,
      talentProfileCode,
      contactFirstName: firstName.trim(),
      contactLastName: lastName.trim() || null,
      contactName,
      contactEmail: email.trim(),
      contactPhone: phone.trim() || null,
      firstMessage: body,
      sourcePage,
      honeypot: honeypot || null,
    });
    setSending(false);
    if (!res.ok) {
      setRows((cur) => markRowFailed(cur, tmpId));
      setDraft(body);
      applyFailure(res.code, res.message, res.retryAfterMs, {
        gateTier: res.gateTier,
        activeCount: res.activeCount,
        limit: res.limit,
      });
      return false;
    }
    setInquiryId(res.inquiryId);
    setEmailedTo(res.claimEmailSent ? res.guestEmail : null);
    lastSeenIsoRef.current = null;
    setRows((cur) => cur.filter((r) => r.id !== tmpId));
    const seeded: GuestThreadMessage[] = [res.openingMessage];
    if (res.autoAckMessage) seeded.push(res.autoAckMessage);
    mergeServer(seeded);
    return true;
  }

  /**
   * sendToAgency — explicit submit (plan §B.9 / finding #2). Forces the
   * ContactCard gate when the contact is still the placeholder seed, otherwise
   * promotes + sends a default first message and confirms.
   */
  async function sendToAgency(): Promise<"sent" | "needs_contact" | "error"> {
    if (sending || inCooldown) return "error";

    // Already a live, contact-promoted thread → nothing to submit, just confirm.
    if (inquiryId && contactPromoted) {
      onSent?.();
      return "sent";
    }

    // Contact not yet collected → force the ContactCard gate. The gate's own
    // submit (onFirstSend) reuses the promotion path and confirms on landing.
    if (!firstName.trim() || !EMAIL_RE.test(email.trim())) {
      sendToAgencyPendingRef.current = true;
      setStage("gate");
      setError(null);
      return "needs_contact";
    }

    // Contact is collected but the row is unpromoted: promote-and-send to the
    // early row, or create fresh. Use the typed draft if present, else a default.
    const body = draft.trim() || DEFAULT_FIRST_BODY;
    const earlyId = inquiryId;
    const ok = earlyId
      ? await continueEarlyInquiry(earlyId, body)
      : await startFreshInquiry(body);
    if (ok) {
      onSent?.();
      return "sent";
    }
    return "error";
  }

  async function handleReply() {
    const body = draft.trim();
    if (!body || !inquiryId) return;
    setSending(true);
    setError(null);
    const tmpId = `tmp-${Date.now()}`;
    setRows((cur) => [...cur, makePendingRow(tmpId, inquiryId, body)]);
    setDraft("");
    const res = await onSendMessage({ inquiryId, body, honeypot: honeypot || null });
    setSending(false);
    if (!res.ok) {
      setRows((cur) => markRowFailed(cur, tmpId));
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
    // Finding #1: route on whether the inquiry is a REAL live thread (contact
    // promoted), NOT on inquiryId alone. An un-promoted early row carries the
    // synthetic seed contact, so it must pass through handleFirstSend (which forces
    // the ContactCard gate + promotes the row) rather than handleReply.
    if (inquiryId && contactPromoted) void handleReply();
    else void handleFirstSend();
  }

  return { handleFirstSend, handleReply, submit, sendToAgency };
}
