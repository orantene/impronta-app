"use client";

/**
 * `PaymentRequestView`: the pure, fully prop-driven presentation half of
 * `PaymentRequestSheet` (`./PaymentRequest.tsx`). Split into its own file,
 * not just its own export, because the wrapper imports server actions
 * (`messaging-engine.ts`, which chains into `server-only`-guarded modules)
 * and `node:test` has no bundler to strip that import for a render test —
 * this file must stay import-clean so `PaymentRequest.render.test.tsx` can
 * load it directly, the same reason `RenameInlineView` lives correctly in
 * one file with its wrapper (that wrapper takes `onSave` as a prop instead
 * of importing an engine call itself) while this sheet's wrapper cannot.
 */

import { formatCentsUSD } from "@/lib/bookings/commission";
import type { MessagingRefusal } from "@/lib/messaging/types";
import { dollarsToCents, type AmountKind, type AmountOption, type PaymentTargetChip } from "@/lib/messages-v5/payment-view";

import { fill, type KitCopy } from "../../kit/copy";
import { OptionRow } from "../../kit/OptionRow";
import { Btn } from "../../kit/primitives";
import { OkLine, RefusalLine } from "../../kit/RefusalLine";
import { Sheet } from "../../kit/Sheet";
import type { ScreenVariant } from "../contracts";

export type PaymentRequestPhase = "idle" | "sending" | "sent" | "refused";
export type PaymentHow = "link" | "collect" | "outside";
export type OutsideMethod = "cash" | "transfer" | "terminal_offline";

export const OUTSIDE_METHODS: readonly OutsideMethod[] = ["cash", "transfer", "terminal_offline"];

/** The concrete cents figure for the picked amount kind. "Other" parses the
 * typed dollars; deposit/full read the offer-derived option. Null when the
 * kind has no resolvable figure yet (no offer, or nothing typed). */
export function amountCentsForKind(kind: AmountKind, options: readonly AmountOption[], otherInput: string): number | null {
  if (kind === "other") return dollarsToCents(otherInput);
  return options.find((o) => o.kind === kind)?.amountCents ?? null;
}

export type PaymentRequestViewProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly copy: KitCopy;
  readonly variant: ScreenVariant;
  readonly identityConfirmed: boolean;
  readonly onCaptureIdentity: () => void;
  readonly targets: readonly PaymentTargetChip[];
  readonly selectedTargetId: string | null;
  readonly onSelectTarget: (recordId: string) => void;
  readonly canMintLink: boolean;
  readonly amountOptions: readonly AmountOption[];
  readonly amountKind: AmountKind;
  readonly onSelectAmountKind: (kind: AmountKind) => void;
  readonly otherAmountInput: string;
  readonly onOtherAmountChange: (value: string) => void;
  readonly how: PaymentHow;
  readonly onSelectHow: (how: PaymentHow) => void;
  readonly outsideMethod: OutsideMethod;
  readonly onOutsideMethodChange: (method: OutsideMethod) => void;
  readonly reference: string;
  readonly onReferenceChange: (value: string) => void;
  readonly openRequestBlocking: boolean;
  readonly collectHref: string | null;
  readonly phase: PaymentRequestPhase;
  readonly refusalCode: MessagingRefusal | null;
  readonly canSend: boolean;
  readonly onSend: () => void;
};

export function PaymentRequestView(props: PaymentRequestViewProps) {
  const {
    open,
    onClose,
    copy: kitCopy,
    variant,
    identityConfirmed,
    onCaptureIdentity,
    targets,
    selectedTargetId,
    onSelectTarget,
    canMintLink,
    amountOptions: options,
    amountKind,
    onSelectAmountKind,
    otherAmountInput,
    onOtherAmountChange,
    how,
    onSelectHow,
    outsideMethod,
    onOutsideMethodChange,
    reference,
    onReferenceChange,
    openRequestBlocking,
    collectHref,
    phase,
    refusalCode,
    canSend,
    onSend,
  } = props;
  const c = kitCopy.paymentRequest;
  const busy = phase === "sending";

  const amountLabelFor = (opt: AmountOption): string =>
    opt.kind === "deposit"
      ? fill(c.amountDeposit, { pct: opt.pct ?? 0 })
      : opt.kind === "full"
        ? c.amountFull
        : c.amountOther;
  const amountSubFor = (opt: AmountOption): string | null => (opt.amountCents != null ? formatCentsUSD(opt.amountCents) : null);
  const pickedAmountCents = amountCentsForKind(amountKind, options, otherAmountInput);
  const messagePreview = amountKind === "full" ? c.messagePreviewFull : fill(c.messagePreview, { amount: pickedAmountCents != null ? formatCentsUSD(pickedAmountCents) : "" });

  return (
    <Sheet
      open={open}
      title={c.title}
      copy={kitCopy}
      onClose={onClose}
      variant={variant === "mobile" ? "mobile-h92" : "desktop"}
      width={520}
      footer={
        phase !== "sent" && identityConfirmed ? (
          how === "collect" ? (
            <Btn variant="primary" fill disabled={!collectHref} data-payment-collect onClick={onSend}>
              {c.collectHere}
            </Btn>
          ) : (
            <Btn variant="primary" fill busy={busy} disabled={!canSend || busy} onClick={onSend} data-payment-send>
              {busy ? c.sending : c.send}
            </Btn>
          )
        ) : null
      }
      hint={openRequestBlocking && how === "link" ? c.openRequestHint : undefined}
    >
      <div className="msgv5" data-payment-request-sheet>
        {!identityConfirmed ? (
          <RefusalLine code="identity_unconfirmed" copy={kitCopy} variant={variant} action={{ label: c.captureIdentity, onClick: onCaptureIdentity }} />
        ) : phase === "sent" ? (
          <OkLine text={how === "outside" ? c.recordedOk : c.sentOk} variant={variant} />
        ) : (
          <>
            {targets.length > 1 ? (
              <section data-payment-for>
                <h4>{c.forLabel}</h4>
                {targets.map((t) => (
                  <OptionRow
                    key={t.recordId}
                    control="radio"
                    selected={selectedTargetId === t.recordId}
                    title={t.label === t.kind ? (kitCopy.record as Record<string, string>)[t.kind] ?? t.label : t.label}
                    disabled={busy}
                    onSelect={() => onSelectTarget(t.recordId)}
                    variant={variant}
                  />
                ))}
              </section>
            ) : null}

            <section data-payment-amount>
              <h4>{c.amountLabel}</h4>
              {options.map((opt) => (
                <OptionRow
                  key={opt.kind}
                  control="radio"
                  selected={amountKind === opt.kind}
                  title={amountLabelFor(opt)}
                  amount={amountSubFor(opt)}
                  disabled={busy}
                  onSelect={() => onSelectAmountKind(opt.kind)}
                  variant={variant}
                />
              ))}
              {amountKind === "other" ? (
                <div className="fld" data-payment-other>
                  <label htmlFor="msgv5-payment-other">{c.amountOther}</label>
                  <input
                    id="msgv5-payment-other"
                    className="in"
                    inputMode="decimal"
                    placeholder={c.otherPlaceholder}
                    value={otherAmountInput}
                    disabled={busy}
                    onChange={(e) => onOtherAmountChange(e.target.value)}
                  />
                </div>
              ) : null}
            </section>

            <section data-payment-how>
              <h4>{c.howLabel}</h4>
              <OptionRow
                control="radio"
                selected={how === "link"}
                title={c.howLink}
                sub={canMintLink ? c.howLinkSub : c.howLinkUnavailable}
                disabled={busy || !canMintLink}
                onSelect={canMintLink ? () => onSelectHow("link") : undefined}
                variant={variant}
              />
              <OptionRow
                control="radio"
                selected={how === "collect"}
                title={c.howCollect}
                sub={canMintLink ? c.howCollectSub : c.howLinkUnavailable}
                disabled={busy || !canMintLink}
                onSelect={canMintLink ? () => onSelectHow("collect") : undefined}
                variant={variant}
              />
              <OptionRow
                control="radio"
                selected={how === "outside"}
                title={c.howOutside}
                sub={c.howOutsideSub}
                disabled={busy}
                onSelect={() => onSelectHow("outside")}
                variant={variant}
              />
            </section>

            {how === "outside" ? (
              <section data-payment-outside>
                <h4>{c.methodLabel}</h4>
                {OUTSIDE_METHODS.map((m) => (
                  <OptionRow
                    key={m}
                    control="radio"
                    selected={outsideMethod === m}
                    title={m === "cash" ? c.methodCash : m === "transfer" ? c.methodTransfer : c.methodTerminal}
                    disabled={busy}
                    onSelect={() => onOutsideMethodChange(m)}
                    variant={variant}
                  />
                ))}
                <div className="fld">
                  <label htmlFor="msgv5-payment-reference">{c.referenceLabelRequired}</label>
                  <input
                    id="msgv5-payment-reference"
                    className="in"
                    placeholder={c.referencePlaceholder}
                    value={reference}
                    disabled={busy}
                    required
                    aria-describedby="msgv5-payment-reference-hint"
                    onChange={(e) => onReferenceChange(e.target.value)}
                  />
                  {/* D-MSG-344: the hint appears once they start typing but are
                      still short, so an empty form is not scolded and a stuck
                      Send always has a reason on screen. */}
                  <p id="msgv5-payment-reference-hint" data-payment-reference-hint className="hint" hidden={reference.trim().length === 0 || reference.trim().length >= 3}>
                    {c.referenceHint}
                  </p>
                </div>
              </section>
            ) : null}

            {how === "link" ? (
              <section data-payment-message>
                <h4>{c.messageLabel}</h4>
                <p>{messagePreview}</p>
              </section>
            ) : null}

            {how === "collect" && collectHref ? <p data-payment-collect-href>{collectHref}</p> : null}

            {refusalCode ? <RefusalLine code={refusalCode} copy={kitCopy} variant={variant} /> : null}
          </>
        )}
      </div>
    </Sheet>
  );
}
