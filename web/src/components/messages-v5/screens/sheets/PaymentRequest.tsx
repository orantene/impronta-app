"use client";

/**
 * PaymentRequestSheet (D07 desktop / M05 phone 2): registers "request_payment"
 * in the sheet registry (`../sheet-registry`). For the accepted offer, an
 * order, or a schedulable record from `ctx.chips`, picks an amount (the
 * offer's own deposit rule, the full balance, or a typed "Other"), then how
 * to collect it: mint a pay link in this thread (`messagingRequestPayment`),
 * deep-link to the POS to collect at the counter, or record a payment that
 * happened outside the platform (`messagingRecordOutsidePayment`). Wraps the
 * engine; nothing here is a new writer (Principle 0).
 *
 * Owner rulings this sheet enforces: identity before pay links (a pay link
 * or POS collect is blocked until the client is CONFIRMED, not merely
 * linked — the sheet shows `RefusalLine identity_unconfirmed` with a
 * "Capture identity" action instead); one open payment request at a time
 * (`openRequestFor` reads `RecordChip.paymentState`, S2's own sync of
 * `payment_links`/`orders`, so this needs no separate fetch).
 *
 * D-MSG-14x (seam): `RecordChip.recordId` for `appointment` / `reservation`
 * / `class_enrolment` / `tickets` is a booking or admission id, not an
 * `orders.id` (every `syncConversationRecord` caller for those kinds passes
 * a booking/admission id — see `lib/scheduling/cancel-booking.ts`,
 * `lib/orders/purchase.ts`). `messagingRequestPayment` and the POS deep link
 * both need a real `orders.id`, so "Send a pay link" and "Collect here" are
 * only offered for an `order` chip; "Record as paid outside" still reaches
 * every other kind through `messagingRecordOutsidePayment`'s own
 * inquiry-level fallback (`markInquiryPaidInCash`), which records the FULL
 * balance regardless of the amount picked here (that function takes no
 * amount at all) — a pre-existing, documented gap in that fallback
 * (`messaging-money-actions.ts`, D-MSG-43), not something this sheet papers
 * over.
 *
 * Split like `RenameInline`/`RenameInlineView`, but across two FILES rather
 * than two exports: `PaymentRequestView` (`./PaymentRequest.view.tsx`) is
 * pure and fully prop-driven (every render test targets it directly — the
 * six states the lane brief asks for) and imports no server action, so
 * `node:test` (no bundler to strip a `server-only` import) can load it
 * directly; this file is the thin stateful wrapper that satisfies
 * `ActionSheetProps`, loads the accepted offer, and owns the round trip.
 */

import { useEffect, useState } from "react";

import type { MessagingRefusal } from "@/lib/messaging/types";
import {
  amountOptions,
  canMintPaymentLink,
  defaultPaymentTarget,
  openRequestFor,
  paymentTargetsFrom,
  selectAcceptedOffer,
  type AmountKind,
} from "@/lib/messages-v5/payment-view";
import { messagingRequestPayment } from "@/lib/server-actions/messaging-engine";
import { messagingRecordOutsidePayment } from "@/lib/server-actions/messaging-money-actions";
import { messagingLoadOffers } from "@/lib/server-actions/messaging-sheets";

import { registerActionSheet, type ActionSheetProps } from "../sheet-registry";
import { amountCentsForKind, PaymentRequestView, type OutsideMethod, type PaymentHow, type PaymentRequestPhase } from "./PaymentRequest.view";

type OfferForDeposit = { status: string; depositPct: number | null; depositAmountCents: number | null; totalClientPrice: number };

export function PaymentRequestSheet(props: ActionSheetProps) {
  const { open, onClose, ctx, copy, variant } = props;
  const inquiryId = ctx.row?.id ?? "";
  const targets = paymentTargetsFrom(ctx.chips);

  const [offer, setOffer] = useState<OfferForDeposit | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(() => defaultPaymentTarget(targets)?.recordId ?? null);
  const [amountKind, setAmountKind] = useState<AmountKind>("deposit");
  const [otherAmountInput, setOtherAmountInput] = useState("");
  const [how, setHow] = useState<PaymentHow>(() => (canMintPaymentLink(defaultPaymentTarget(targets)) ? "link" : "outside"));
  const [outsideMethod, setOutsideMethod] = useState<OutsideMethod>("cash");
  const [reference, setReference] = useState("");
  const [phase, setPhase] = useState<PaymentRequestPhase>("idle");
  const [refusalCode, setRefusalCode] = useState<MessagingRefusal | null>(null);

  useEffect(() => {
    if (!open || !inquiryId) return;
    let alive = true;
    void messagingLoadOffers({ inquiryId }).then((result) => {
      if (!alive || !result.ok) return;
      const accepted = selectAcceptedOffer(result.offers);
      setOffer(accepted ? { status: accepted.status, depositPct: accepted.depositPct, depositAmountCents: accepted.depositAmountCents, totalClientPrice: accepted.totalClientPrice } : null);
    });
    return () => {
      alive = false;
    };
  }, [open, inquiryId]);

  const selectedTarget = targets.find((t) => t.recordId === selectedTargetId) ?? defaultPaymentTarget(targets);

  /** Picking a new target that cannot mint a link (D-MSG-14x) falls back to
   * "Record as paid outside" rather than leaving "how" on a now-disabled
   * option. No effect needed: this only ever runs from the explicit click. */
  function selectTarget(recordId: string) {
    setSelectedTargetId(recordId);
    const next = targets.find((t) => t.recordId === recordId) ?? null;
    if (!canMintPaymentLink(next) && how !== "outside") setHow("outside");
  }
  const canMintLink = canMintPaymentLink(selectedTarget);
  const options = amountOptions(offer);
  const openRequest = openRequestFor(ctx.chips);
  const identityConfirmed = ctx.essentials?.customer.identityLevel === "confirmed" || ctx.essentials?.customer.identityLevel === "granted";
  const amountCents = amountCentsForKind(amountKind, options, otherAmountInput);

  const canSend =
    how === "link"
      ? canMintLink && !openRequest && (amountKind === "full" || (amountCents != null && amountCents > 0))
      : how === "outside"
        ? amountCents != null && amountCents > 0 && reference.trim().length >= 3
        : false;

  const collectHref = canMintLink && selectedTarget ? `/${ctx.tenantSlug}/admin/pos?view=sell&order=${selectedTarget.recordId}` : null;

  async function send() {
    if (how === "collect") {
      if (collectHref) onClose();
      return;
    }
    if (phase === "sending") return;
    setPhase("sending");
    setRefusalCode(null);
    if (how === "outside") {
      const result = await messagingRecordOutsidePayment({
        inquiryId,
        recordId: selectedTarget?.recordId ?? inquiryId,
        amountCents: amountCents ?? 0,
        method: outsideMethod,
        reference: reference.trim(),
        expectedVersion: ctx.version,
      });
      if (!result.ok) {
        setPhase("refused");
        setRefusalCode(result.reason);
        return;
      }
    } else {
      if (!selectedTarget) {
        setPhase("refused");
        setRefusalCode("invalid");
        return;
      }
      const result = await messagingRequestPayment({
        inquiryId,
        orderId: selectedTarget.recordId,
        amountKind,
        amountCents: amountKind === "full" ? 0 : (amountCents ?? 0),
        idempotencyKey: `msgv5-pay-${inquiryId}-${selectedTarget.recordId}-${amountKind}`,
        publicOrigin: typeof window !== "undefined" ? window.location.origin : "",
        expectedVersion: ctx.version,
      });
      if (!result.ok) {
        setPhase("refused");
        setRefusalCode(result.reason);
        return;
      }
    }
    setPhase("sent");
    await ctx.reloadThread();
    await ctx.reloadInbox();
    ctx.notify({ kind: "ok", text: how === "outside" ? copy.kit.paymentRequest.recordedOk : copy.kit.paymentRequest.sentOk });
    onClose();
  }

  return (
    <PaymentRequestView
      open={open}
      onClose={onClose}
      copy={copy.kit}
      variant={variant}
      identityConfirmed={identityConfirmed}
      onCaptureIdentity={() => ctx.dispatch("capture_identity")}
      targets={targets}
      selectedTargetId={selectedTarget?.recordId ?? null}
      onSelectTarget={selectTarget}
      canMintLink={canMintLink}
      amountOptions={options}
      amountKind={amountKind}
      onSelectAmountKind={setAmountKind}
      otherAmountInput={otherAmountInput}
      onOtherAmountChange={setOtherAmountInput}
      how={how}
      onSelectHow={setHow}
      outsideMethod={outsideMethod}
      onOutsideMethodChange={setOutsideMethod}
      reference={reference}
      onReferenceChange={setReference}
      openRequestBlocking={Boolean(openRequest)}
      collectHref={collectHref}
      phase={phase}
      refusalCode={refusalCode}
      canSend={canSend}
      onSend={() => void send()}
    />
  );
}

registerActionSheet("request_payment", { Component: PaymentRequestSheet, lane: "L7" });
