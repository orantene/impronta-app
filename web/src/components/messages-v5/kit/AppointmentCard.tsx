/**
 * AppointmentCard (boards D03, D09, D19, D20): the booking record as the
 * thread shows it. `confirming` is the busy state with the recheck ladder;
 * `conflict` lists S3's ConfirmConflict rows and says nothing was created.
 */

import type { ConfirmConflict } from "@/lib/messaging/confirm-plan";

import { Card, CardLine } from "./Card";
import type { KitCopy } from "./copy";
import { fill } from "./copy";
import { PaymentLadder, type LadderStep } from "./PaymentLadder";
import { Btn, Icon, Pill } from "./primitives";

export type AppointmentCardState = "hold" | "confirming" | "confirmed" | "cancelled" | "conflict";
export type AppointmentCardAction = "reschedule" | "open_calendar" | "open_project" | "retry_confirm";

export type AppointmentCardProps = {
  readonly title: string;
  readonly clientName?: string | null;
  readonly withName?: string | null;
  readonly state: AppointmentCardState;
  readonly paymentState?: "deposit_paid" | "paid" | "unpaid" | null;
  readonly lines?: readonly { readonly label: string; readonly value?: string; readonly muted?: boolean }[];
  readonly ladder?: readonly LadderStep[];
  readonly balanceLabel?: string | null;
  readonly conflicts?: readonly ConfirmConflict[];
  readonly cancelledBy?: "client" | "staff";
  readonly freeAgain?: string | null;
  readonly isProject?: boolean;
  readonly copy: KitCopy;
  readonly busy?: boolean;
  readonly mine?: boolean;
  readonly variant?: "desktop" | "mobile";
  readonly onAction?: (action: AppointmentCardAction) => void;
};

export function AppointmentCard({ title, clientName, withName, state, paymentState, lines = [], ladder, balanceLabel, conflicts = [], cancelledBy = "client", freeAgain, isProject, copy, busy, mine = true, variant = "desktop", onAction }: AppointmentCardProps) {
  const confirming = state === "confirming" || busy;
  const pill =
    state === "confirming" ? (
      <Pill tone="ch">{copy.appt.rechecking}</Pill>
    ) : state === "cancelled" ? (
      <Pill tone="lost">{cancelledBy === "client" ? copy.appt.cancelledByClient : copy.appt.cancelledByStaff}</Pill>
    ) : state === "conflict" ? (
      <Pill tone="fail">{copy.appt.conflict}</Pill>
    ) : state === "hold" ? (
      <Pill tone="due">{copy.fulfilment.hold}</Pill>
    ) : paymentState === "deposit_paid" ? (
      <Pill tone="money">{copy.appt.depositPaid}</Pill>
    ) : (
      <Pill tone="money">{copy.appt.confirmed}</Pill>
    );
  const who = [clientName, withName ? fill(copy.appt.withName, { name: withName }) : null].filter(Boolean).join(" · ");
  const label = isProject ? copy.card.cat.booking : copy.card.cat.appointment;

  let foot: string | null = null;
  let actions = null;
  if (state === "confirmed") {
    foot = balanceLabel ? fill(copy.appt.balanceOnDay, { amount: balanceLabel }) : isProject ? copy.appt.inEverywhere : null;
    actions = onAction ? (
      <Btn size="sm" onClick={() => onAction(isProject ? "open_project" : balanceLabel ? "reschedule" : "open_calendar")} data-appt-action>
        {isProject ? copy.appt.openProject : balanceLabel ? copy.appt.reschedule : copy.appt.openCalendar}
      </Btn>
    ) : null;
  } else if (state === "cancelled") {
    foot = freeAgain ? fill(copy.appt.freeAgain, { resources: freeAgain }) : null;
  } else if (state === "conflict") {
    foot = copy.appt.conflictNotCreated;
    actions = onAction ? (
      <Btn size="sm" variant="primary" onClick={() => onAction("retry_confirm")} data-appt-action>
        {copy.appt.confirming}
      </Btn>
    ) : null;
  }

  return (
    <Card category="appt" label={label} title={state === "confirming" ? copy.appt.confirming : title} pills={pill} who={who || undefined} mine={mine} busy={confirming} variant={variant} testId="appointment" foot={foot} actions={actions}>
      {lines.map((l, i) => (
        <CardLine key={i} label={l.label} amount={l.value} muted={l.muted} />
      ))}
      {conflicts.map((c) => (
        <CardLine
          key={`${c.code}:${c.line}`}
          label={
            <>
              <Icon name="alert" size={12} /> {c.line}
            </>
          }
          amount={c.why}
        />
      ))}
      {ladder ? <PaymentLadder steps={ladder} /> : null}
    </Card>
  );
}
