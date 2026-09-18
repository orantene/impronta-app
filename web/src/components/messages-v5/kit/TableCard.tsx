/**
 * TableCard (board D21 "table"): a reservation as the thread shows it. The
 * hold countdown reads the hold's own expiry (`lib/messages-v5/record-cards`
 * `holdCountdown`), never a locally-guessed timer; the ladder is
 * Held -> Confirmed -> Seated -> Closed from S2's chip state
 * (`ladderFor("reservation", ...)`, same helper the panel chip uses).
 */

import { Card, CardLine } from "./Card";
import type { KitCopy } from "./copy";
import { fill } from "./copy";
import { PaymentLadder, type LadderStep } from "./PaymentLadder";
import { Btn, Pill } from "./primitives";

export type TableCardAction = "confirm" | "open_record";

export type TableCardProps = {
  readonly clientName: string;
  readonly partySize: number | null;
  readonly whenLabel: string | null;
  readonly tableLabel?: string | null;
  readonly ladder: readonly LadderStep[];
  readonly step: "held" | "confirmed" | "seated" | "closed";
  readonly holdLeftLabel?: string | null;
  readonly copy: KitCopy;
  readonly busy?: boolean;
  readonly mine?: boolean;
  readonly variant?: "desktop" | "mobile";
  readonly onAction?: (action: TableCardAction) => void;
};

export function TableCard({ clientName, partySize, whenLabel, tableLabel, ladder, step, holdLeftLabel, copy, busy, mine = true, variant = "desktop", onAction }: TableCardProps) {
  const pill =
    step === "held" ? <Pill tone="due">{copy.table.held}</Pill> : step === "closed" ? <Pill tone="lost">{copy.table.closed}</Pill> : step === "seated" ? <Pill tone="money">{copy.table.seated}</Pill> : <Pill tone="money">{copy.ladder.confirmed}</Pill>;
  const foot = step === "held" ? (holdLeftLabel ?? null) : step === "closed" ? copy.table.holdEnded : null;
  const actions =
    onAction && step === "held" ? (
      <Btn size="sm" variant="primary" busy={busy} onClick={() => onAction("confirm")} data-table-action="confirm">
        {busy ? copy.table.confirming : copy.table.confirmTable}
      </Btn>
    ) : onAction && (step === "confirmed" || step === "seated") ? (
      <Btn size="sm" onClick={() => onAction("open_record")} data-table-action="open_record">
        {copy.table.openInReservations}
      </Btn>
    ) : null;

  return (
    <Card category="table" label={copy.card.cat.table} title={fill(copy.table.partySize, { count: partySize ?? "" })} pills={pill} who={clientName} mine={mine} busy={busy} variant={variant} testId="table" foot={foot} actions={actions}>
      {whenLabel ? <CardLine label={whenLabel} /> : null}
      {tableLabel ? <CardLine muted label={tableLabel} /> : null}
      <PaymentLadder steps={ladder} />
    </Card>
  );
}
