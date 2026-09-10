"use client";

/**
 * BookingHoursProposalsBanner — the hours nobody has agreed to yet.
 *
 * THE HONEST STATE THIS MAKES VISIBLE. Publishing an offering used to write
 * Mon-Fri 09:00-17:00 UTC straight into `talent_booking_hours`, so strangers
 * were offered a working week nobody had agreed to, in a timezone nobody had
 * chosen. T1-07 replaced that with a PROPOSAL and left the public slots
 * endpoint answering `no_booking_hours` until a human accepts. That is the
 * correct answer, and this banner exists to make it a state an operator can
 * see and resolve rather than a silence they have to diagnose.
 *
 * IT MUST NOT PAPER OVER THE GAP. The help text says in as many words that the
 * public booking page reports no hours until this is accepted. Softening that
 * to "finish setting up" would hide the very fact the operator needs.
 *
 * ONE ACTION, AND IT IS THE EXISTING ONE. The accept goes through
 * `acceptBookingHoursProposal`, the same server action the hours editor in
 * Settings uses, which is gated by the same hours-edit policy and lands on
 * `accept_booking_hours_proposal`. A second write path into
 * `talent_booking_hours` is exactly what T1-07 removed; this is a second DOOR
 * to the first one.
 *
 * Token classes only; inline styles are frozen under components/admin/shell.
 */

import { useCallback, useState } from "react";

import { useT } from "@/i18n/use-t";
import { acceptBookingHoursProposal } from "@/lib/server-actions/booking-hours";
import type { BookingHoursProposalRow } from "@/lib/scheduling/appointments-actions";
import { fill } from "./appointments-format";

const K = "dashboard.adminAppointments.proposals";

type Props = {
  proposals: BookingHoursProposalRow[];
  /** The workspace zone, used only where the proposal itself carries none. */
  defaultTimezone: string;
  onAccepted: () => void;
};

export function BookingHoursProposalsBanner({
  proposals,
  defaultTimezone,
  onAccepted,
}: Props) {
  const t = useT();
  // The timezone the operator has typed, per person. A proposal that resolved
  // one prefills with it; one that did not prefills with the workspace's, which
  // is a suggestion the operator can see and change, never a silent default.
  const [zones, setZones] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ id: string; text: string; failed: boolean } | null>(
    null,
  );

  const zoneFor = useCallback(
    (row: BookingHoursProposalRow) =>
      zones[row.talentProfileId] ?? row.timezone ?? defaultTimezone,
    [defaultTimezone, zones],
  );

  const accept = useCallback(
    async (row: BookingHoursProposalRow) => {
      const timezone = zoneFor(row).trim();
      if (!timezone) {
        setMessage({ id: row.talentProfileId, failed: true, text: t(`${K}.needTimezone`) });
        return;
      }
      setBusyId(row.talentProfileId);
      setMessage(null);
      try {
        const result = await acceptBookingHoursProposal(row.talentProfileId, { timezone });
        if (!result.ok) {
          setMessage({ id: row.talentProfileId, failed: true, text: result.error });
          return;
        }
        setMessage({
          id: row.talentProfileId,
          failed: false,
          text: fill(t(`${K}.accepted`), { name: row.personName }),
        });
        onAccepted();
      } catch (err) {
        setMessage({
          id: row.talentProfileId,
          failed: true,
          text: err instanceof Error ? err.message : t(`${K}.needTimezone`),
        });
      } finally {
        setBusyId(null);
      }
    },
    [onAccepted, t, zoneFor],
  );

  if (proposals.length === 0) return null;

  return (
    <div
      data-testid="booking-hours-proposals-banner"
      className="mb-[20px] rounded-[12px] border border-admin-border-soft bg-admin-card p-[20px]"
    >
      <div className="text-[15px] font-semibold text-admin-ink">{t(`${K}.title`)}</div>
      <p className="mt-[6px] text-[13px] leading-[1.5] text-admin-ink-muted">{t(`${K}.help`)}</p>

      {proposals.map((row) => (
        <div key={row.talentProfileId} className="mt-[14px] text-[13.5px] text-admin-ink">
          <span className="font-semibold">{row.personName}</span>
          <span className="text-admin-ink-muted">
            {" · "}
            {t(`${K}.source.${row.source === "staff_suggestion" ? "staff_suggestion" : "publish_default"}`)}
          </span>

          <div className="mt-[8px] flex flex-wrap items-end gap-[8px]">
            <span className="block">
              <label className="block text-[12.5px] text-admin-ink-muted">
                {t(`${K}.timezone`)}
              </label>
              <input
                type="text"
                className="mt-[4px] rounded-admin border border-admin-line px-3 py-2 text-admin-ink"
                value={zoneFor(row)}
                onChange={(e) =>
                  setZones((prev) => ({ ...prev, [row.talentProfileId]: e.target.value }))
                }
              />
            </span>
            <button
              type="button"
              data-testid="booking-hours-proposal-accept"
              className="rounded-admin border border-admin-line px-3 py-2 text-admin-ink disabled:opacity-60"
              disabled={busyId === row.talentProfileId}
              onClick={() => void accept(row)}
            >
              {busyId === row.talentProfileId ? t(`${K}.accepting`) : t(`${K}.accept`)}
            </button>
          </div>

          {message?.id === row.talentProfileId ? (
            <p
              className={
                message.failed ? "mt-[8px] text-admin-critical" : "mt-[8px] text-admin-ink"
              }
            >
              {message.text}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
