"use client";

import { talentStatusClass } from "../../visual/tokens";
import type { AgendaBookingState } from "../types";
import { useAgendaCopy } from "../use-agenda-copy";

const BOOKING_STATE_META: Record<
  AgendaBookingState,
  { labelKey: string; className: string }
> = {
  requested: {
    labelKey: "Booking requested",
    className: talentStatusClass.info,
  },
  hold: {
    labelKey: "On hold",
    className: talentStatusClass.warn,
  },
  confirmed: {
    labelKey: "Confirmed",
    className: talentStatusClass.ok,
  },
  completed: {
    labelKey: "Completed",
    className: talentStatusClass.neutral,
  },
  cancelled: {
    labelKey: "Cancelled",
    className: talentStatusClass.risk,
  },
  no_show: {
    labelKey: "No-show",
    className: talentStatusClass.risk,
  },
  hold_expired: {
    labelKey: "Hold expired",
    className: talentStatusClass.muted,
  },
};

export function BookingStateChip({ state }: { state: AgendaBookingState }) {
  const copy = useAgendaCopy();
  const meta = BOOKING_STATE_META[state];
  const label = copy.t(meta.labelKey);
  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none ${meta.className}`}
    >
      {label}
    </span>
  );
}
