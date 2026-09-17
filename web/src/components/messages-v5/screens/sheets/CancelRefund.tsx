"use client";

/**
 * CancelRefundSheet (D20 desktop / M10 phone 2): registers TWO new
 * `ShellActionId`s in the sheet registry (`../sheet-registry`) — `cancel_record`
 * (cancel a record and choose how the money moves) and `refund` (move money
 * back with no cancellation). Both are additive entries on `ShellActionId`
 * (`../contracts.ts`) and `NextStep.tsx`'s `ROUTES` (the two lines this lane
 * is allowed to touch there), since neither existed before this lane.
 *
 * Wraps S6's engine — `messagingPreviewCancel` (policy window, refundable
 * cents, what gets freed), `messagingCancelRecord` (cancel + full/partial/keep
 * refund), `messagingRefund` (refund only, no cancellation). Nothing here is
 * a new writer (Principle 0).
 *
 * D-MSG-14x (seam): `messagingRefund` takes a `paymentId`, which nothing on
 * `RecordChip` carries. `messagingLoadRefundableTransaction` (new, L7, in
 * `messaging-money-actions.ts`) resolves the newest paid transaction with
 * money still owed on the chosen record, the same way `messagingPreviewCancel`
 * resolves the record itself, and is used ONLY by the `refund` (no
 * cancellation) registration.
 *
 * Split like `RenameInline`/`RenameInlineView`, but across two FILES rather
 * than two exports (`CancelRefund.view.tsx` holds the pure `CancelRefundView`
 * — see that file's header for why): `CancelRecordSheet` / `RefundOnlySheet`
 * below are the thin stateful wrappers, sharing one implementation, that
 * satisfy `ActionSheetProps` for their own action id.
 */

import { useEffect, useState } from "react";

import type { CancelPreview } from "@/lib/messaging/money";
import type { MessagingRefusal, RecordKind } from "@/lib/messaging/types";
import { cancelTargetsFrom, defaultCancelTarget, partialAmountValid, refundOptions, type RefundChoice, type RefundMode } from "@/lib/messages-v5/payment-view";
import { messagingCancelRecord, messagingLoadRefundableTransaction, messagingPreviewCancel, messagingRefund } from "@/lib/server-actions/messaging-money-actions";

import { fill } from "../../kit/copy";
import { registerActionSheet, type ActionSheetProps } from "../sheet-registry";
import { CancelRefundView, type CancelRefundMode, type CancelRefundPhase } from "./CancelRefund.view";

function CancelRefundSheetImpl(props: ActionSheetProps, mode: CancelRefundMode) {
  const { open, onClose, ctx, copy, variant } = props;
  const inquiryId = ctx.row?.id ?? "";
  const targets = cancelTargetsFrom(ctx.chips);

  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(() => defaultCancelTarget(targets)?.recordId ?? null);
  const [phase, setPhase] = useState<CancelRefundPhase>("loading");
  const [preview, setPreview] = useState<CancelPreview | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [refundableCents, setRefundableCents] = useState(0);
  const [refundMode, setRefundMode] = useState<RefundMode>("full");
  const [partialAmountInput, setPartialAmountInput] = useState("");
  const [reason, setReason] = useState("");
  const [refusalCode, setRefusalCode] = useState<MessagingRefusal | null>(null);

  const selectedTarget = targets.find((t) => t.recordId === selectedTargetId) ?? defaultCancelTarget(targets);

  useEffect(() => {
    if (!open || !inquiryId || !selectedTarget) {
      setPhase(open ? "refused" : "loading");
      if (open) setRefusalCode("not_found");
      return;
    }
    let alive = true;
    setPhase("loading");
    setRefusalCode(null);
    const recordKind = selectedTarget.kind as RecordKind;
    const recordId = selectedTarget.recordId;
    if (mode === "cancel") {
      void messagingPreviewCancel({ inquiryId, recordKind, recordId }).then((result) => {
        if (!alive) return;
        if (!result.ok) {
          setPhase("refused");
          setRefusalCode(result.reason);
          return;
        }
        setPreview(result.preview);
        const choices = refundOptions(result.preview.ok ? result.preview : { refundableCents: 0, depositRefundable: false });
        setRefundMode(choices.find((ch) => ch.mode === "full" && ch.enabled) ? "full" : "keep");
        setPhase("idle");
      });
    } else {
      void messagingLoadRefundableTransaction({ recordKind, recordId }).then((result) => {
        if (!alive) return;
        if (!result.ok) {
          setPhase("refused");
          setRefusalCode(result.reason);
          return;
        }
        setPaymentId(result.paymentId);
        setRefundableCents(result.refundableCents);
        setRefundMode("full");
        setPhase(result.paymentId ? "idle" : "refused");
        if (!result.paymentId) setRefusalCode("payment_unknown");
      });
    }
    return () => {
      alive = false;
    };
  }, [open, inquiryId, selectedTarget, mode]);

  const previewOk = preview && preview.ok ? preview : null;
  const windowLabel =
    mode === "cancel" && previewOk
      ? previewOk.window.enforceable
        ? fill(previewOk.window.insideWindow ? copy.kit.cancel.windowInside : copy.kit.cancel.windowOutside, { date: previewOk.window.deadlineIso ?? "" })
        : copy.kit.cancel.windowUnenforced
      : null;
  const freesCount = mode === "cancel" ? (previewOk?.freesAdmissionIds.length ?? 0) : 0;

  const refundChoices: readonly RefundChoice[] =
    mode === "cancel"
      ? refundOptions(previewOk ?? { refundableCents: 0, depositRefundable: false })
      : [
          { mode: "full", enabled: refundableCents > 0, maxCents: refundableCents },
          { mode: "partial", enabled: refundableCents > 0, maxCents: refundableCents },
        ];

  const activeChoice = refundChoices.find((r) => r.mode === refundMode) ?? null;
  const partialCents = refundMode === "partial" ? (Number(partialAmountInput.replace(/,/g, "").trim()) > 0 ? Math.round(Number(partialAmountInput) * 100) : null) : null;
  const effectAmountCents = refundMode === "keep" ? 0 : refundMode === "full" ? (activeChoice?.maxCents ?? 0) : (partialCents ?? 0);

  const canSubmit =
    phase === "idle" &&
    reason.trim().length >= 2 &&
    (refundMode === "keep" ? mode === "cancel" : refundMode === "full" ? (activeChoice?.enabled ?? false) : partialAmountValid(partialCents, activeChoice?.maxCents ?? 0));

  async function submit() {
    if (!selectedTarget || phase === "working") return;
    setPhase("working");
    setRefusalCode(null);
    const recordKind = selectedTarget.kind as RecordKind;
    const recordId = selectedTarget.recordId;
    if (mode === "cancel") {
      const result = await messagingCancelRecord({
        inquiryId,
        recordKind,
        recordId,
        reason: reason.trim(),
        refund: refundMode === "partial" ? { mode: "partial", amountCents: partialCents ?? 0 } : { mode: refundMode },
        expectedVersion: ctx.version,
      });
      if (!result.ok) {
        setPhase("refused");
        setRefusalCode(result.reason);
        return;
      }
    } else {
      if (!paymentId) {
        setPhase("refused");
        setRefusalCode("payment_unknown");
        return;
      }
      const result = await messagingRefund({
        inquiryId,
        paymentId,
        mode: refundMode === "partial" ? "partial" : "full",
        amountCents: refundMode === "partial" ? (partialCents ?? undefined) : undefined,
        reason: reason.trim(),
        expectedVersion: ctx.version,
      });
      if (!result.ok) {
        setPhase("refused");
        setRefusalCode(result.reason);
        return;
      }
    }
    setPhase("done");
    await ctx.reloadThread();
    await ctx.reloadInbox();
    ctx.notify({ kind: "ok", text: mode === "refundOnly" ? copy.kit.cancel.doneRefunded : copy.kit.cancel.doneCancelled });
    onClose();
  }

  return (
    <CancelRefundView
      open={open}
      onClose={onClose}
      copy={copy.kit}
      variant={variant}
      mode={mode}
      targets={targets}
      selectedTargetId={selectedTarget?.recordId ?? null}
      onSelectTarget={setSelectedTargetId}
      windowLabel={windowLabel}
      freesCount={freesCount}
      refundChoices={refundChoices}
      refundMode={refundMode}
      onSelectRefundMode={setRefundMode}
      partialAmountInput={partialAmountInput}
      onPartialAmountChange={setPartialAmountInput}
      reason={reason}
      onReasonChange={setReason}
      effectAmountCents={effectAmountCents}
      phase={phase}
      refusalCode={refusalCode}
      canSubmit={canSubmit}
      onSubmit={() => void submit()}
    />
  );
}

export function CancelRecordSheet(props: ActionSheetProps) {
  return CancelRefundSheetImpl(props, "cancel");
}

export function RefundOnlySheet(props: ActionSheetProps) {
  return CancelRefundSheetImpl(props, "refundOnly");
}

registerActionSheet("cancel_record", { Component: CancelRecordSheet, lane: "L7" });
registerActionSheet("refund", { Component: RefundOnlySheet, lane: "L7" });
