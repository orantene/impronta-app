"use client";

import type { AgendaBookingState } from "../types";

const BOOKING_STATE_META: Record<
  AgendaBookingState,
  { label: string; className: string }
> = {
  requested: {
    label: "Requested",
    className: "border border-[rgba(59,76,202,0.16)] bg-[rgba(59,76,202,0.08)] text-[var(--tc-accent)]",
  },
  hold: {
    label: "On hold",
    className: "border border-[rgba(138,90,17,0.14)] bg-[rgba(138,90,17,0.10)] text-[#8A5A11]",
  },
  confirmed: {
    label: "Confirmed",
    className: "border border-[rgba(31,92,66,0.14)] bg-[rgba(31,92,66,0.10)] text-[#1F5C42]",
  },
  completed: {
    label: "Completed",
    className: "border border-[rgba(11,11,13,0.10)] bg-[rgba(11,11,13,0.06)] text-[var(--tc-primary)]",
  },
  cancelled: {
    label: "Cancelled",
    className: "border border-[rgba(122,31,38,0.12)] bg-[rgba(176,48,58,0.10)] text-[#7A1F26]",
  },
  no_show: {
    label: "No-show",
    className: "border border-[rgba(122,31,38,0.12)] bg-[rgba(176,48,58,0.10)] text-[#7A1F26]",
  },
  hold_expired: {
    label: "Hold expired",
    className: "border border-[rgba(11,11,13,0.10)] bg-[rgba(11,11,13,0.06)] text-[#5F6368]",
  },
};

export function BookingStateChip({ state }: { state: AgendaBookingState }) {
  const meta = BOOKING_STATE_META[state];
  return (
    <span
      role="status"
      aria-label={meta.label}
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}
