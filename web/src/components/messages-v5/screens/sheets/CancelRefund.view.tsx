"use client";

/**
 * `CancelRefundView`: the pure, fully prop-driven presentation half of
 * `CancelRecordSheet` / `RefundOnlySheet` (`./CancelRefund.tsx`). Split into
 * its own file, not just its own export, for the same reason as
 * `PaymentRequest.view.tsx`: the wrapper imports server actions that chain
 * into `server-only`-guarded modules, and `node:test` has no bundler to
 * strip that import for a render test.
 */

import { formatCentsUSD } from "@/lib/bookings/commission";
import type { MessagingRefusal } from "@/lib/messaging/types";
import { footerLabelKindFor, type PaymentTargetChip, type RefundChoice, type RefundMode } from "@/lib/messages-v5/payment-view";

import { fill, type KitCopy } from "../../kit/copy";
import { OptionRow } from "../../kit/OptionRow";
import { Btn } from "../../kit/primitives";
import { OkLine, RefusalLine } from "../../kit/RefusalLine";
import { Sheet } from "../../kit/Sheet";
import type { ScreenVariant } from "../contracts";

export type CancelRefundMode = "cancel" | "refundOnly";
export type CancelRefundPhase = "loading" | "idle" | "working" | "done" | "refused";

export type CancelRefundViewProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly copy: KitCopy;
  readonly variant: ScreenVariant;
  readonly mode: CancelRefundMode;
  readonly targets: readonly PaymentTargetChip[];
  readonly selectedTargetId: string | null;
  readonly onSelectTarget: (recordId: string) => void;
  readonly windowLabel: string | null;
  readonly freesCount: number;
  readonly refundChoices: readonly RefundChoice[];
  readonly refundMode: RefundMode;
  readonly onSelectRefundMode: (mode: RefundMode) => void;
  readonly partialAmountInput: string;
  readonly onPartialAmountChange: (value: string) => void;
  readonly reason: string;
  readonly onReasonChange: (value: string) => void;
  readonly effectAmountCents: number;
  readonly phase: CancelRefundPhase;
  readonly refusalCode: MessagingRefusal | null;
  readonly canSubmit: boolean;
  readonly onSubmit: () => void;
};

export function CancelRefundView(props: CancelRefundViewProps) {
  const {
    open,
    onClose,
    copy: kitCopy,
    variant,
    mode,
    targets,
    selectedTargetId,
    onSelectTarget,
    windowLabel,
    freesCount,
    refundChoices,
    refundMode,
    onSelectRefundMode,
    partialAmountInput,
    onPartialAmountChange,
    reason,
    onReasonChange,
    effectAmountCents,
    phase,
    refusalCode,
    canSubmit,
    onSubmit,
  } = props;
  const c = kitCopy.cancel;
  const busy = phase === "working";

  const footerLabel =
    mode === "refundOnly"
      ? fill(c.footerRefundOnly, { amount: formatCentsUSD(effectAmountCents) })
      : footerLabelKindFor(refundMode, effectAmountCents) === "cancelAndRefund"
        ? fill(c.footerCancelAndRefund, { amount: formatCentsUSD(effectAmountCents) })
        : c.footerCancelOnly;

  return (
    <Sheet
      open={open}
      title={mode === "refundOnly" ? c.refundOnlyTitle : c.title}
      copy={kitCopy}
      onClose={onClose}
      variant={variant === "mobile" ? "mobile-h92" : "desktop"}
      width={520}
      footer={
        phase !== "done" && phase !== "loading" ? (
          <Btn variant="danger" fill busy={busy} disabled={!canSubmit || busy} onClick={onSubmit} data-cancel-submit>
            {busy ? c.working : footerLabel}
          </Btn>
        ) : null
      }
    >
      <div className="msgv5" data-cancel-refund-sheet>
        {phase === "loading" ? (
          <p data-cancel-loading>{c.previewLoading}</p>
        ) : phase === "done" ? (
          <OkLine text={mode === "refundOnly" ? c.doneRefunded : c.doneCancelled} variant={variant} />
        ) : (
          <>
            {targets.length > 1 ? (
              <section data-cancel-for>
                <h4>{kitCopy.paymentRequest.forLabel}</h4>
                {targets.map((t) => (
                  <OptionRow key={t.recordId} control="radio" selected={selectedTargetId === t.recordId} title={t.label} disabled={busy} onSelect={() => onSelectTarget(t.recordId)} variant={variant} />
                ))}
              </section>
            ) : null}

            {windowLabel ? <p data-cancel-window>{windowLabel}</p> : null}
            {mode === "cancel" && freesCount > 0 ? <p data-cancel-frees>{fill(c.freesLabel, { count: freesCount })}</p> : null}

            <section data-cancel-refund-choice>
              <h4>{c.refundChoiceLabel}</h4>
              {refundChoices.map((choice) => (
                <OptionRow
                  key={choice.mode}
                  control="radio"
                  selected={refundMode === choice.mode}
                  title={choice.mode === "full" ? c.refundFull : choice.mode === "partial" ? c.refundPartial : c.refundKeep}
                  amount={choice.mode !== "keep" && choice.maxCents > 0 ? formatCentsUSD(choice.maxCents) : null}
                  disabled={busy || !choice.enabled}
                  onSelect={choice.enabled ? () => onSelectRefundMode(choice.mode) : undefined}
                  variant={variant}
                />
              ))}
              {refundMode === "partial" ? (
                <div className="fld" data-cancel-partial>
                  <label htmlFor="msgv5-cancel-partial">{c.partialAmountLabel}</label>
                  <input
                    id="msgv5-cancel-partial"
                    className="in"
                    inputMode="decimal"
                    disabled={busy}
                    value={partialAmountInput}
                    onChange={(e) => onPartialAmountChange(e.target.value)}
                  />
                </div>
              ) : null}
            </section>

            <div className="fld" data-cancel-reason>
              <label htmlFor="msgv5-cancel-reason">{c.reasonLabel}</label>
              <input id="msgv5-cancel-reason" className="in" placeholder={c.reasonPlaceholder} disabled={busy} value={reason} onChange={(e) => onReasonChange(e.target.value)} />
              <span>{c.reasonClientSees}</span>
            </div>

            <section data-cancel-effects>
              <h4>{c.effectsTitle}</h4>
              <ul>
                {effectAmountCents > 0 ? <li>{fill(c.effectRefund, { amount: formatCentsUSD(effectAmountCents) })}</li> : <li>{c.effectKeep}</li>}
                {mode === "cancel" && freesCount > 0 ? <li>{c.effectFrees}</li> : null}
              </ul>
            </section>

            {refusalCode ? <RefusalLine code={refusalCode} copy={kitCopy} variant={variant} /> : null}
          </>
        )}
      </div>
    </Sheet>
  );
}
