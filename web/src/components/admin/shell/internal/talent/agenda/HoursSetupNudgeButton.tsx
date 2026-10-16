"use client";

import { HOURS_NUDGE_COPY, needsHoursSetupNudge } from "@/lib/scheduling/hours-setup-nudge";

/**
 * TUL-634: "set your time zone / hours" nudge on Today, independent of the
 * first-day card, so an established talent with no open hours still sees it.
 * Renders nothing when hours have an open window or the agenda failed to load.
 */
export function HoursSetupNudgeButton({
  es,
  hours,
  loadError,
  onOpen,
}: {
  es: boolean;
  hours: Parameters<typeof needsHoursSetupNudge>[0];
  loadError: Parameters<typeof needsHoursSetupNudge>[1];
  onOpen?: () => void;
}) {
  if (!onOpen || !needsHoursSetupNudge(hours, loadError)) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="hours-setup-nudge"
      className="min-h-[44px] w-full rounded-xl bg-[rgba(59,76,202,0.08)] px-3 text-left text-[13.5px] font-medium text-[var(--tc-accent)]"
    >
      {HOURS_NUDGE_COPY[es ? "es" : "en"]}
    </button>
  );
}
