/**
 * OrderCard (board D08 shared draft + order, D12, M06): the POS draft as the
 * client and staff both see it, or the confirmed order with its kitchen
 * state. Lines carry who proposed them (S5). Nothing is charged until confirm.
 */

import { Card, CardLine, CardTotal } from "./Card";
import type { KitCopy } from "./copy";
import { fill } from "./copy";
import { PaymentLadder, type LadderStep } from "./PaymentLadder";
import { Btn, Pill } from "./primitives";

export type OrderCardLine = { readonly label: string; readonly amount: string; readonly proposedBy?: "client" | "staff" | null; readonly muted?: boolean };
export type OrderLadderStep = "draft" | "confirmed" | "paid" | "fulfilled";
export type OrderCardAction = "confirm" | "edit";

export type OrderCardProps = {
  readonly mode: "draft" | "order";
  readonly title: string;
  readonly clientName: string;
  readonly version?: number | null;
  readonly lines: readonly OrderCardLine[];
  readonly total: string;
  readonly pickupLabel?: string | null;
  readonly step: OrderLadderStep;
  readonly paymentState?: string | null;
  readonly fulfilmentState?: string | null;
  readonly foot?: string | null;
  readonly copy: KitCopy;
  readonly busy?: boolean;
  readonly mine?: boolean;
  readonly variant?: "desktop" | "mobile";
  readonly onAction?: (action: OrderCardAction) => void;
};

const RANK: Record<OrderLadderStep, number> = { draft: 1, confirmed: 2, paid: 3, fulfilled: 4 };

export function OrderCard({ mode, title, clientName, version, lines, total, pickupLabel, step, paymentState, fulfilmentState, foot, copy, busy, mine, variant = "desktop", onAction }: OrderCardProps) {
  const r = RANK[step];
  const ladder: LadderStep[] = [
    { label: copy.ladder.draft, done: r >= 1 },
    { label: copy.ladder.confirmed, done: r >= 2 },
    { label: copy.ladder.paid, done: r >= 3 },
    { label: copy.ladder.fulfilled, done: r >= 4 },
  ];
  const pills =
    mode === "draft" ? (
      <Pill tone="ch">{fill(copy.order.notYet, { version: version ?? 1 })}</Pill>
    ) : (
      <>
        {paymentState ? <Pill tone={paymentState === "paid" ? "money" : "due"}>{(copy.payment as Record<string, string>)[paymentState] ?? paymentState}</Pill> : null}
        {fulfilmentState ? <Pill tone={fulfilmentState === "fulfilled" ? "done" : "due"}>{(copy.fulfilment as Record<string, string>)[fulfilmentState] ?? fulfilmentState}</Pill> : null}
      </>
    );
  const totalLabel = pickupLabel ? `${copy.card.total} · ${fill(copy.order.pickup, { time: pickupLabel })}` : copy.card.total;
  const actions =
    onAction && mode === "draft" ? (
      <>
        <Btn size="sm" onClick={() => onAction("edit")} data-order-action="edit">
          {copy.order.edit}
        </Btn>
        <Btn size="sm" variant="primary" busy={busy} onClick={() => onAction("confirm")} data-order-action="confirm">
          {busy ? copy.order.confirming : copy.order.confirm}
        </Btn>
      </>
    ) : null;
  // Fulfilment is owned by the POS (D-MSG-155): "paid" reads a status sentence,
  // never a writer. `markPickedUp` in copy is kept as a past-tense label for
  // the "fulfilled" pill row elsewhere; no button ever calls it here.
  const fulfilmentNote = mode === "order" && step === "paid" ? copy.order.fulfilmentFromPos : null;

  return (
    <Card
      category="order"
      label={mode === "draft" ? copy.card.cat.sharedDraft : copy.card.cat.order}
      title={title}
      pills={pills}
      who={mode === "draft" ? fill(copy.order.bothEdit, { name: clientName }) : clientName}
      mine={mine ?? mode === "order"}
      busy={busy}
      variant={variant}
      testId="order"
      foot={foot ?? undefined}
      actions={actions}
    >
      {lines.map((l, i) => (
        <CardLine
          key={i}
          label={l.label}
          amount={l.amount}
          muted={l.muted}
          flag={l.proposedBy === "client" ? <span className="lineflag client">{fill(copy.order.chose, { name: clientName })}</span> : l.proposedBy === "staff" ? <span className="lineflag">{copy.order.youAdded}</span> : null}
        />
      ))}
      <CardTotal label={totalLabel} amount={total} />
      <PaymentLadder steps={ladder} />
      {fulfilmentNote ? <div className="who" data-order-fulfilment-note>{fulfilmentNote}</div> : null}
    </Card>
  );
}
