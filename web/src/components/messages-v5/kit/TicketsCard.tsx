/**
 * TicketsCard (board D21 "tickets"): tiers x quantity, the seat hold
 * countdown, and the Paid -> Issued -> Checked in N of M -> Done ladder
 * (`ladderFor("tickets", ...)`, shared with the panel chip). Actions vary by
 * step: request payment while unpaid, open at the door once issued, or copy
 * the client's secure ticket link (the /q/<code> the engine already minted).
 */

import { Card, CardLine } from "./Card";
import type { KitCopy } from "./copy";
import { fill } from "./copy";
import { PaymentLadder, type LadderStep } from "./PaymentLadder";
import { Btn, Pill } from "./primitives";

export type TicketsTierLine = { readonly label: string; readonly quantity: number; readonly priceCents: number; readonly currency?: string };
export type TicketsCardAction = "request_payment" | "open_at_door" | "copy_link";

export type TicketsCardProps = {
  readonly title: string;
  readonly clientName: string;
  readonly tiers: readonly TicketsTierLine[];
  readonly ladder: readonly LadderStep[];
  readonly step: "paid" | "issued" | "checked_in" | "done";
  readonly holdLeftLabel?: string | null;
  readonly checkedIn?: number | null;
  readonly total?: number | null;
  readonly copy: KitCopy;
  readonly busy?: boolean;
  readonly mine?: boolean;
  readonly variant?: "desktop" | "mobile";
  readonly onAction?: (action: TicketsCardAction) => void;
};

export function TicketsCard({ title, clientName, tiers, ladder, step, holdLeftLabel, checkedIn, total, copy, busy, mine = true, variant = "desktop", onAction }: TicketsCardProps) {
  const pill =
    step === "checked_in" && checkedIn != null && total != null ? (
      <Pill tone="ch">{fill(copy.tickets.checkedInOf, { checkedIn, total })}</Pill>
    ) : step === "done" ? (
      <Pill tone="money">{copy.ladder.done}</Pill>
    ) : step === "issued" ? (
      <Pill tone="money">{copy.ladder.issued}</Pill>
    ) : (
      <Pill tone="due">{copy.payment.unpaid}</Pill>
    );
  const foot = step === "paid" ? (holdLeftLabel ?? null) : null;
  const actions =
    onAction && step === "paid" ? (
      <Btn size="sm" variant="primary" busy={busy} onClick={() => onAction("request_payment")} data-tickets-action="request_payment">
        {copy.tickets.requestPayment}
      </Btn>
    ) : onAction && step === "issued" ? (
      <>
        <Btn size="sm" onClick={() => onAction("open_at_door")} data-tickets-action="open_at_door">
          {copy.tickets.openAtDoor}
        </Btn>
        <Btn size="sm" onClick={() => onAction("copy_link")} data-tickets-action="copy_link">
          {copy.tickets.secureLink}
        </Btn>
      </>
    ) : null;

  return (
    <Card category="ticket" label={copy.card.cat.tickets} title={title} pills={pill} who={clientName} mine={mine} busy={busy} variant={variant} testId="tickets" foot={foot} actions={actions}>
      {tiers.map((t, i) => (
        <CardLine key={i} label={fill(copy.tickets.quantity, { count: t.quantity, label: t.label })} />
      ))}
      <PaymentLadder steps={ladder} />
    </Card>
  );
}
