"use client";

/**
 * AppointmentPanel — the right panel for a selected appointment, in the
 * same shape W39 gives a session: title, facts card, actions, and the one
 * form this surface owns, the move (`reschedule_booking_set`, all or
 * nothing, with the window the operator was looking at).
 *
 * A MOVE THAT WORKED SAYS SO (D-107). The form stays open on success and
 * says which of the two answers came back: moved, or already at that time
 * and nothing changed. THE REFUSAL NAMES WHAT COLLIDED: `rescheduleAppointment`
 * resolves the RPC's ids to names, so "that time was just taken" becomes
 * "Ana is already booked at that time" whenever the id can be read.
 *
 * CANCEL WITH THE POLICY (Package 2): `cancelBookingSetAction` cancels the
 * booking and everything it holds, and answers what is refundable under the
 * cancellation window; `policy_keeps` and `not_cancellable` come back as
 * sentences. COPY CUSTOMER LINK signs a manage token (`signBookingManageTokenAction`)
 * for the public `/manage/<token>` page, cancel or reschedule (A07).
 *
 * NOT WIRED, said on the control: Add a service (the Front desk's B02, not
 * built here).
 */

import { useCallback, useEffect, useState } from "react";

import { useT } from "@/i18n/use-t";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { bookingStateKey, parseLocalDateTime, type AppointmentRow } from "@/lib/scheduling/appointments-board";
import { rescheduleAppointment } from "@/lib/scheduling/appointments-actions";
import { zonedLocalToUtc } from "@/lib/scheduling/tz";
import { cancelBookingSetAction, signBookingManageTokenAction } from "@/lib/server-actions/scheduling-engine";
import { engineRefusalKey } from "./catalog/catalog-model";
import { ActionButton, BUTTON_PRIMARY, CARD, FactRow, INPUT, Outcome, SectionLabel } from "./appointments-classes-ui";
import { fill, formatWhen } from "./appointments-format";

const K = "dashboard.adminAppointments";
const P = "dashboard.adminAppointments.board.panel";

type CancelState = {
  open: boolean;
  reason: string;
  busy: boolean;
  outcome: { kind: "refused" | "done"; text: string } | null;
};

type MoveState = {
  value: string;
  busy: boolean;
  message: string | null;
  failed: boolean;
  /** True once the move has been answered successfully; the form then offers only Close. */
  done: boolean;
};

export function AppointmentPanel({
  row,
  tenantId,
  adminBase,
  moveOpen,
  onMoveOpen,
  onChanged,
}: {
  row: AppointmentRow;
  tenantId: string;
  adminBase: string;
  /** The move form is opened from the row's "Move it" or the panel's own. */
  moveOpen: boolean;
  onMoveOpen: (open: boolean) => void;
  onChanged: () => void;
}) {
  const t = useT();
  const [move, setMove] = useState<MoveState>({ value: "", busy: false, message: null, failed: false, done: false });
  const [cancel, setCancel] = useState<CancelState>({ open: false, reason: "", busy: false, outcome: null });
  const [linkNote, setLinkNote] = useState<string | null>(null);
  const state = bookingStateKey(row.status);

  useEffect(() => {
    setMove({ value: "", busy: false, message: null, failed: false, done: false });
    setCancel({ open: false, reason: "", busy: false, outcome: null });
    setLinkNote(null);
  }, [row.id]);

  const submitCancel = async () => {
    setCancel((c) => ({ ...c, busy: true, outcome: null }));
    try {
      const res = await cancelBookingSetAction({
        bookingId: row.id,
        operationKey: `cancel-${crypto.randomUUID()}`,
        reason: cancel.reason.trim().slice(0, 200),
        by: "staff",
      });
      if (res.ok) {
        const text =
          res.refundableCents > 0
            ? fill(t(`${P}.appointmentCancelled`), { amount: formatOrderMoney(res.refundableCents, "USD") })
            : t(`${P}.appointmentCancelledNothing`);
        setCancel((c) => ({ ...c, busy: false, outcome: { kind: "done", text } }));
        onChanged();
      } else {
        setCancel((c) => ({ ...c, busy: false, outcome: { kind: "refused", text: t(engineRefusalKey(res.reason)) } }));
      }
    } catch {
      setCancel((c) => ({ ...c, busy: false, outcome: { kind: "refused", text: t(engineRefusalKey("unavailable")) } }));
    }
  };

  const copyLink = async (action: "cancel" | "reschedule") => {
    setLinkNote(null);
    try {
      const res = await signBookingManageTokenAction({ bookingId: row.id, action });
      if (!res.ok) {
        setLinkNote(t(engineRefusalKey(res.reason)));
        return;
      }
      await navigator.clipboard.writeText(`${window.location.origin}/manage/${res.token}`);
      setLinkNote(t(`${P}.linkCopied`));
    } catch {
      setLinkNote(t(`${P}.linkFailed`));
    }
  };

  const submit = useCallback(async () => {
    const parsed = parseLocalDateTime(move.value);
    if (!parsed) {
      setMove((m) => ({ ...m, failed: true, done: false, message: t(`${K}.reschedule.needStart`) }));
      return;
    }
    // The control hands back a wall clock with no zone. It means the VENUE's
    // clock, so the venue's zone is what turns it into an instant.
    const instant = zonedLocalToUtc(parsed.ymd, parsed.minutesOfDay, row.timeZone ?? "UTC");
    if (!instant) {
      setMove((m) => ({ ...m, failed: true, done: false, message: t(`${K}.reschedule.refusal.nonexistentTime`) }));
      return;
    }
    setMove((m) => ({ ...m, busy: true, message: null, failed: false, done: false }));
    try {
      const result = await rescheduleAppointment({
        tenantId,
        bookingId: row.id,
        newStartsAt: instant.toISOString(),
        newEndsAt: null,
        // THE WINDOW THE OPERATOR WAS LOOKING AT. Without these two the RPC
        // keeps last-write-wins and a stale screen silently overwrites
        // somebody else's move.
        expectedStartsAt: row.startsAt,
        expectedEndsAt: row.endsAt,
      });
      if (!result.ok) {
        setMove((m) => ({
          ...m,
          busy: false,
          failed: true,
          done: false,
          message: fill(t(`${K}.reschedule.refusal.${result.refusal.key}`), result.refusal.params),
        }));
        return;
      }
      // The two answers are DIFFERENT SENTENCES. `already` means the RPC
      // found the booking at that time and changed nothing.
      setMove((m) => ({
        ...m,
        busy: false,
        failed: false,
        done: true,
        message: result.already
          ? t(`${K}.reschedule.already`)
          : fill(t(`${K}.reschedule.moved`), { when: formatWhen(result.startsAt, row.timeZone) }),
      }));
      onChanged();
    } catch (err) {
      setMove((m) => ({
        ...m,
        busy: false,
        failed: true,
        done: false,
        message: err instanceof Error ? err.message : t(`${K}.reschedule.refusal.unavailable`),
      }));
    }
  }, [move.value, onChanged, row.endsAt, row.id, row.startsAt, row.timeZone, t, tenantId]);

  const canMove = row.nextAction.kind === "reschedule";

  return (
    <div data-testid="appointment-panel" className="flex h-full flex-col gap-[12px] font-admin-body">
      <div>
        <div className="text-[14px] font-semibold text-admin-ink">
          {row.customerName ?? t(`${K}.unknownCustomer`)}
          {row.startsAt ? ` · ${formatWhen(row.startsAt, row.timeZone)}` : ""}
        </div>
        <div className="text-[12px] text-admin-ink-muted">
          {row.title}
          {row.servedBy.length > 0 ? ` · ${row.servedBy.join(", ")}` : ""}
          {row.places.length > 0 ? ` · ${row.places.join(", ")}` : ""}
        </div>
      </div>

      <div className={`${CARD} px-[14px] py-[12px]`}>
        <FactRow label={t(`${K}.col.when`)}>{row.startsAt ? formatWhen(row.startsAt, row.timeZone) : t(`${K}.noTime`)}</FactRow>
        <FactRow label={t(`${K}.col.servedBy`)}>{row.servedBy.length > 0 ? row.servedBy.join(", ") : t(`${K}.unassigned`)}</FactRow>
        <FactRow label={t(`${K}.col.place`)}>{row.places.length > 0 ? row.places.join(", ") : t(`${K}.noPlace`)}</FactRow>
        <FactRow label={t(`${K}.col.state`)}>{t(`${K}.state.${state}`)}</FactRow>
        {row.timeZone ? <FactRow label={t(`${K}.board.panel.clock`)}>{row.timeZone}</FactRow> : null}
      </div>

      <SectionLabel>{t(`${K}.board.panel.actions`)}</SectionLabel>
      <div className="grid grid-cols-2 gap-[8px]">
        <ActionButton
          reason={canMove ? null : t(`${K}.reschedule.refusal.notReschedulable`)}
          size="sm"
          onClick={() => onMoveOpen(!moveOpen)}
        >
          {t(`${K}.action.reschedule`)}
        </ActionButton>
        <a href={`${adminBase}/bookings/${row.id}`} className="inline-flex h-[34px] items-center justify-center rounded-[9px] border border-admin-border bg-admin-card px-[14px] font-admin-body text-admin-12h font-semibold leading-[1.2] text-admin-ink hover:border-admin-border-strong">
          {t(`${K}.action.open`)}
        </a>
        <ActionButton reason={t(`${K}.board.panel.addServiceOff`)} size="sm">
          {t(`${K}.board.panel.addService`)}
        </ActionButton>
        <ActionButton
          reason={state === "cancelled" || state === "completed" ? t(`${K}.reschedule.refusal.notReschedulable`) : null}
          tone="danger"
          size="sm"
          testId="appointment-cancel"
          onClick={() => setCancel((c) => ({ ...c, open: !c.open, outcome: null }))}
        >
          {t(`${K}.board.panel.cancelAppointment`)}
        </ActionButton>
      </div>

      {/* A07 / R04: the customer's own cancel or reschedule page, one signed link each. */}
      <div className="flex flex-wrap items-center gap-[8px] text-[12px] text-admin-ink-muted">
        <span>{t(`${P}.copyLink`)}:</span>
        <button type="button" className="cursor-pointer font-semibold text-admin-brand underline underline-offset-2" onClick={() => void copyLink("cancel")}>
          {t(`${P}.copyLinkCancel`)}
        </button>
        <button type="button" className="cursor-pointer font-semibold text-admin-brand underline underline-offset-2" onClick={() => void copyLink("reschedule")}>
          {t(`${P}.copyLinkReschedule`)}
        </button>
      </div>
      {linkNote ? <Outcome kind="note">{linkNote}</Outcome> : null}

      {cancel.open ? (
        <form
          data-testid="appointment-cancel-form"
          className={`${CARD} flex flex-col gap-[8px] p-[12px]`}
          onSubmit={(e) => {
            e.preventDefault();
            void submitCancel();
          }}
        >
          <label className="flex flex-col gap-[4px] text-[12px] text-admin-ink-muted">
            <span>{t(`${P}.cancelAppointmentReason`)}</span>
            <input className={INPUT} maxLength={200} value={cancel.reason} onChange={(e) => setCancel((c) => ({ ...c, reason: e.target.value }))} />
          </label>
          <div className="flex gap-[8px]">
            {cancel.outcome?.kind === "done" ? null : (
              <button type="submit" disabled={cancel.busy} className={`${BUTTON_PRIMARY} border-admin-critical bg-admin-critical hover:bg-admin-critical-deep disabled:opacity-60`}>
                {cancel.busy ? t(`${P}.working`) : t(`${P}.cancelAppointmentConfirm`)}
              </button>
            )}
            <ActionButton disabled={cancel.busy} onClick={() => setCancel((c) => ({ ...c, open: false }))}>
              {t(`${P}.close`)}
            </ActionButton>
          </div>
          {cancel.outcome ? (
            <Outcome kind={cancel.outcome.kind} testId="appointment-cancel-message">
              {cancel.outcome.text}
            </Outcome>
          ) : null}
        </form>
      ) : null}

      {moveOpen && canMove ? (
        <div data-testid="appointment-reschedule" className={`${CARD} flex flex-col gap-[8px] p-[12px]`}>
          <div className="text-[13px] font-semibold text-admin-ink">{t(`${K}.reschedule.heading`)}</div>
          <p className="m-0 text-[11.5px] leading-[1.45] text-admin-ink-muted">{t(`${K}.reschedule.help`)}</p>
          {row.startsAt ? (
            <p className="m-0 text-[11.5px] text-admin-ink-muted">
              {fill(t(`${K}.reschedule.currentWindow`), { when: formatWhen(row.startsAt, row.timeZone) })}
            </p>
          ) : null}
          <label className="flex flex-col gap-[4px] text-[12px] text-admin-ink-muted">
            <span>{fill(t(`${K}.reschedule.newStart`), { zone: row.timeZone ?? "UTC" })}</span>
            <input
              type="datetime-local"
              className={INPUT}
              value={move.value}
              onChange={(e) => setMove((m) => ({ ...m, value: e.target.value, message: null }))}
            />
          </label>
          <div className="flex flex-wrap gap-[8px]">
            {/* Once the move is done the window on screen is the OLD one, so
                submitting again would be refused as a stale screen. */}
            {move.done ? null : (
              <button type="button" className={`${BUTTON_PRIMARY} disabled:opacity-60`} disabled={move.busy} onClick={() => void submit()}>
                {move.busy ? t(`${K}.reschedule.submitting`) : t(`${K}.reschedule.submit`)}
              </button>
            )}
            <ActionButton disabled={move.busy} onClick={() => onMoveOpen(false)}>
              {move.done ? t(`${K}.reschedule.close`) : t(`${K}.reschedule.cancel`)}
            </ActionButton>
          </div>
          {move.message ? (
            <Outcome kind={move.failed ? "refused" : move.done ? "done" : "note"} testId="appointment-reschedule-message">
              {move.message}
            </Outcome>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
