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
 * NOT WIRED, said on the control: Cancel appointment (no cancel writer on
 * this surface; the booking's own page owns its lifecycle) and Add a service
 * (the Front desk's B02, not built here).
 */

import { useCallback, useEffect, useState } from "react";

import { useT } from "@/i18n/use-t";
import { bookingStateKey, parseLocalDateTime, type AppointmentRow } from "@/lib/scheduling/appointments-board";
import { rescheduleAppointment } from "@/lib/scheduling/appointments-actions";
import { zonedLocalToUtc } from "@/lib/scheduling/tz";
import { ActionButton, BUTTON_PRIMARY, CARD, FactRow, INPUT, Outcome, SectionLabel } from "./appointments-classes-ui";
import { fill, formatWhen } from "./appointments-format";

const K = "dashboard.adminAppointments";

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
  const state = bookingStateKey(row.status);

  useEffect(() => {
    setMove({ value: "", busy: false, message: null, failed: false, done: false });
  }, [row.id]);

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
        <ActionButton reason={t(`${K}.board.panel.cancelAppointmentOff`)} tone="danger" size="sm">
          {t(`${K}.board.panel.cancelAppointment`)}
        </ActionButton>
      </div>

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
