/**
 * PaymentCard (board D07 `payCard`, M05 `mxPayCard`): amount, who pays, the
 * three-step ladder, and one footer sentence + action per state. `unknown`
 * says "Do not request again" (refusal payment_unknown) instead of a retry.
 */

import { Card, CardLine } from "./Card";
import type { KitCopy } from "./copy";
import { fill } from "./copy";
import { PaymentLadder, paymentLadderSteps } from "./PaymentLadder";
import { Btn, Pill } from "./primitives";

export type PaymentCardState = "requested" | "opened" | "paid" | "failed" | "expired" | "refunded" | "partially_refunded" | "unknown";
export type PaymentCardAction = "copy_link" | "wait" | "view_receipt" | "new_link" | "view_refund" | "check";

export type PaymentCardProps = {
  readonly state: PaymentCardState;
  readonly label: string;
  readonly amount: string;
  readonly payerName: string;
  readonly hoursLeft?: number | null;
  readonly expiredOn?: string | null;
  readonly refundAmount?: string | null;
  readonly copy: KitCopy;
  readonly busy?: boolean;
  readonly mine?: boolean;
  readonly variant?: "desktop" | "mobile";
  readonly onAction?: (action: PaymentCardAction) => void;
};

const PILL_TONE: Record<PaymentCardState, "due" | "opp" | "money" | "fail" | "lost" | "ch"> = {
  requested: "due",
  opened: "opp",
  paid: "money",
  failed: "fail",
  expired: "lost",
  refunded: "ch",
  partially_refunded: "ch",
  unknown: "due",
};

const ACTION: Record<PaymentCardState, { key: PaymentCardAction; labelKey: "copyLink" | "wait" | "viewReceipt" | "newLink" | "viewRefund" | "check"; ghost?: boolean }> = {
  requested: { key: "copy_link", labelKey: "copyLink" },
  opened: { key: "wait", labelKey: "wait", ghost: true },
  paid: { key: "view_receipt", labelKey: "viewReceipt" },
  failed: { key: "new_link", labelKey: "newLink" },
  expired: { key: "new_link", labelKey: "newLink" },
  refunded: { key: "view_refund", labelKey: "viewRefund" },
  partially_refunded: { key: "view_refund", labelKey: "viewRefund" },
  unknown: { key: "check", labelKey: "check" },
};

export function PaymentCard({ state, label, amount, payerName, hoursLeft, expiredOn, refundAmount, copy, busy, mine = true, variant = "desktop", onAction }: PaymentCardProps) {
  const foot = fill(copy.pay.foot[state], { hours: hoursLeft ?? 48, date: expiredOn ?? "", amount: refundAmount ?? amount });
  const action = ACTION[state];
  const showLadder = state === "requested" || state === "opened" || state === "paid" || state === "failed";
  return (
    <Card
      category="pay"
      label={copy.card.cat.payment}
      title={label}
      pills={<Pill tone={PILL_TONE[state]}>{copy.payment[state]}</Pill>}
      who={fill(copy.pay.paidBy, { name: payerName })}
      mine={mine}
      busy={busy}
      variant={variant}
      testId="payment"
      foot={foot}
      actions={
        onAction ? (
          <Btn size="sm" variant={action.ghost ? "ghost" : "default"} busy={busy} onClick={() => onAction(action.key)} data-payment-action={action.key}>
            {copy.pay[action.labelKey]}
          </Btn>
        ) : null
      }
    >
      <CardLine label={copy.card.amount} amount={amount} />
      {showLadder ? <PaymentLadder steps={paymentLadderSteps(state, { requested: copy.ladder.requested, opened: copy.ladder.opened, paid: copy.ladder.paid, failed: copy.ladder.failed })} /> : null}
    </Card>
  );
}
