"use client";

/**
 * AppointmentsList — today and what is coming, with one next action per row.
 *
 * THE BUCKETS ARRIVE, THEY ARE NOT COMPUTED HERE. `loadAppointments` decides
 * "today" against the workspace's own zone and stamps it on each row. This
 * component never calls `new Date()` for layout: a row that is upcoming when
 * the server renders and today when the browser hydrates is a mismatch nothing
 * else in the build can see, and it is invisible in every server check.
 *
 * ONE ACTION, AND ONLY IF IT WORKS. `nextActionFor` derives the button from the
 * same status set `reschedule_booking_set` will actually move, so this screen
 * never offers a control the RPC would refuse. A cancelled row says it is
 * cancelled instead of growing a Move button that fails when pressed.
 *
 * THE REFUSAL NAMES WHAT COLLIDED. `rescheduleAppointment` resolves the RPC's
 * `failed_talent_id` and `failed_pool_id` to names, so "that time was just
 * taken" becomes "Ana is already booked at that time" whenever the id can be
 * read. When it cannot, the sentence has no hole in it — the unnamed variant is
 * a different catalogue key, not the named one with an empty substitution.
 *
 * Token classes only; inline styles are frozen under components/admin/shell.
 */

import { useCallback, useState } from "react";

import { useT } from "@/i18n/use-t";
import {
  groupAppointments,
  parseLocalDateTime,
  type AppointmentRow,
} from "@/lib/scheduling/appointments-board";
import { rescheduleAppointment } from "@/lib/scheduling/appointments-actions";
import { zonedLocalToUtc } from "@/lib/scheduling/tz";
import { fill, formatWhen } from "./appointments-format";

const K = "dashboard.adminAppointments";

type Props = {
  tenantId: string;
  rows: AppointmentRow[];
  adminBase: string;
  onChanged: () => void;
};

type MoveState = {
  bookingId: string;
  value: string;
  busy: boolean;
  message: string | null;
  failed: boolean;
};

export function AppointmentsList({ tenantId, rows, adminBase, onChanged }: Props) {
  const t = useT();
  const [move, setMove] = useState<MoveState | null>(null);

  const submit = useCallback(
    async (row: AppointmentRow) => {
      if (!move || move.bookingId !== row.id) return;

      const parsed = parseLocalDateTime(move.value);
      if (!parsed) {
        setMove({ ...move, failed: true, message: t(`${K}.reschedule.needStart`) });
        return;
      }
      // The control hands back a wall clock with no zone. It means the VENUE's
      // clock, so the venue's zone is what turns it into an instant.
      const instant = zonedLocalToUtc(parsed.ymd, parsed.minutesOfDay, row.timeZone ?? "UTC");
      if (!instant) {
        setMove({
          ...move,
          failed: true,
          message: t(`${K}.reschedule.refusal.nonexistentTime`),
        });
        return;
      }

      setMove({ ...move, busy: true, message: null, failed: false });
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
          setMove({
            bookingId: row.id,
            value: move.value,
            busy: false,
            failed: true,
            message: fill(
              t(`${K}.reschedule.refusal.${result.refusal.key}`),
              result.refusal.params,
            ),
          });
          return;
        }
        setMove(null);
        onChanged();
      } catch (err) {
        // A rejected action must not leave the row spinning for ever with
        // nothing in the console. Say something, and let them try again.
        setMove({
          bookingId: row.id,
          value: move.value,
          busy: false,
          failed: true,
          message: err instanceof Error ? err.message : t(`${K}.reschedule.refusal.unavailable`),
        });
      }
    },
    [move, onChanged, t, tenantId],
  );

  if (rows.length === 0) {
    return (
      <div className="max-w-[560px] rounded-[12px] border border-admin-border-soft bg-admin-card p-[24px]">
        <div className="text-[15px] font-semibold text-admin-ink">{t(`${K}.empty.title`)}</div>
        <p className="mt-[8px] text-[13.5px] leading-[1.5] text-admin-ink-muted">
          {t(`${K}.empty.body`)}
        </p>
      </div>
    );
  }

  return (
    <>
      {groupAppointments(rows).map((group) => (
        <div
          key={group.bucket}
          className="mb-[20px] rounded-[12px] border border-admin-border-soft bg-admin-card p-[20px]"
        >
          <div className="text-[15px] font-semibold text-admin-ink">
            {t(`${K}.bucket.${group.bucket}`)}
          </div>

          <div className="mt-[12px] overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-admin-ink-muted">
                  <th className="py-[6px] pr-[16px] font-medium">{t(`${K}.col.when`)}</th>
                  <th className="py-[6px] pr-[16px] font-medium">{t(`${K}.col.withWhom`)}</th>
                  <th className="py-[6px] pr-[16px] font-medium">{t(`${K}.col.servedBy`)}</th>
                  <th className="py-[6px] pr-[16px] font-medium">{t(`${K}.col.place`)}</th>
                  <th className="py-[6px] font-medium">{t(`${K}.col.action`)}</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr key={row.id} className="border-t border-admin-border-soft align-top">
                    <td className="py-[8px] pr-[16px] text-admin-ink">
                      {row.startsAt ? (
                        formatWhen(row.startsAt, row.timeZone)
                      ) : (
                        <span className="text-admin-ink-muted">{t(`${K}.noTime`)}</span>
                      )}
                      <div className="text-[12px] text-admin-ink-muted">{row.title}</div>
                    </td>
                    <td className="py-[8px] pr-[16px] text-admin-ink">
                      {row.customerName ?? (
                        <span className="text-admin-ink-muted">{t(`${K}.unknownCustomer`)}</span>
                      )}
                    </td>
                    <td className="py-[8px] pr-[16px] text-admin-ink">
                      {row.servedBy.length > 0 ? (
                        row.servedBy.join(", ")
                      ) : (
                        <span className="text-admin-ink-muted">{t(`${K}.unassigned`)}</span>
                      )}
                    </td>
                    <td className="py-[8px] pr-[16px] text-admin-ink">
                      {row.places.length > 0 ? (
                        row.places.join(", ")
                      ) : (
                        <span className="text-admin-ink-muted">{t(`${K}.noPlace`)}</span>
                      )}
                    </td>
                    <td className="py-[8px] text-admin-ink">
                      {row.nextAction.kind === "none" ? (
                        <span className="text-admin-ink-muted">
                          {t(`${K}.action.${row.nextAction.because}`)}
                        </span>
                      ) : row.nextAction.kind === "open" ? (
                        <a
                          className="text-admin-ink underline"
                          href={`${adminBase}/bookings/${row.id}`}
                        >
                          {t(`${K}.action.open`)}
                        </a>
                      ) : (
                        <button
                          type="button"
                          className="rounded-admin border border-admin-line px-3 py-1 text-admin-ink disabled:opacity-60"
                          onClick={() =>
                            setMove({
                              bookingId: row.id,
                              value: "",
                              busy: false,
                              message: null,
                              failed: false,
                            })
                          }
                        >
                          {t(`${K}.action.reschedule`)}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {group.rows
            .filter((row) => move?.bookingId === row.id)
            .map((row) => (
              <div
                key={`move-${row.id}`}
                data-testid="appointment-reschedule"
                className="mt-[16px] rounded-[12px] border border-admin-border-soft bg-admin-surface-alt p-[16px]"
              >
                <div className="text-[14px] font-semibold text-admin-ink">
                  {t(`${K}.reschedule.heading`)}
                </div>
                <p className="mt-[4px] text-[12.5px] leading-[1.5] text-admin-ink-muted">
                  {t(`${K}.reschedule.help`)}
                </p>
                {row.startsAt ? (
                  <p className="mt-[6px] text-[12.5px] text-admin-ink-muted">
                    {fill(t(`${K}.reschedule.currentWindow`), {
                      when: formatWhen(row.startsAt, row.timeZone),
                    })}
                  </p>
                ) : null}

                <label className="mt-[12px] block text-[12.5px] text-admin-ink-muted">
                  {fill(t(`${K}.reschedule.newStart`), { zone: row.timeZone ?? "UTC" })}
                </label>
                <input
                  type="datetime-local"
                  className="mt-[4px] rounded-admin border border-admin-line px-3 py-2 text-admin-ink"
                  value={move?.value ?? ""}
                  onChange={(e) =>
                    setMove((prev) =>
                      prev ? { ...prev, value: e.target.value, message: null } : prev,
                    )
                  }
                />

                <div className="mt-[12px] flex flex-wrap gap-[8px]">
                  <button
                    type="button"
                    className="rounded-admin border border-admin-line px-3 py-2 text-admin-ink disabled:opacity-60"
                    disabled={move?.busy === true}
                    onClick={() => void submit(row)}
                  >
                    {move?.busy
                      ? t(`${K}.reschedule.submitting`)
                      : t(`${K}.reschedule.submit`)}
                  </button>
                  <button
                    type="button"
                    className="rounded-admin border border-admin-line px-3 py-2 text-admin-ink-muted disabled:opacity-60"
                    disabled={move?.busy === true}
                    onClick={() => setMove(null)}
                  >
                    {t(`${K}.reschedule.cancel`)}
                  </button>
                </div>

                {move?.message ? (
                  <p
                    data-testid="appointment-reschedule-message"
                    className={
                      move.failed ? "mt-[10px] text-admin-critical" : "mt-[10px] text-admin-ink"
                    }
                  >
                    {move.message}
                  </p>
                ) : null}
              </div>
            ))}
        </div>
      ))}
    </>
  );
}
