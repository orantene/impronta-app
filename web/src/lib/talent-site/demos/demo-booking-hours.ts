/**
 * TUL-516 / TUL-489: every demo with a timed bookable service must have
 * `talent_booking_hours` that fit the longest service, otherwise the public
 * sheet shows "Sin horarios disponibles" (slots API reason `no_booking_hours`).
 *
 * Pure. Seed and the live ensure script share this so a demo never ships
 * without a working when-step (or a quote-only catalog that skips slots).
 */

export type DemoHoursSpec = {
  timezone: string;
  /** Days: 0=Sun … 6=Sat. */
  days: number[];
  startMin: number;
  endMin: number;
  slotMinutes: number;
};

export type DemoServiceHoursInput = {
  durationMin: number;
  booking: "instant" | "request" | "quote";
};

/** Timed services that open the catalog when-step (quote/ask-only skip slots). */
export function timedBookableServices(
  services: readonly DemoServiceHoursInput[],
): DemoServiceHoursInput[] {
  return services.filter((s) => s.booking !== "quote" && s.durationMin > 0);
}

/** Longest timed service duration in minutes, or 0 when none. */
export function maxTimedServiceMinutes(services: readonly DemoServiceHoursInput[]): number {
  const timed = timedBookableServices(services);
  if (timed.length === 0) return 0;
  return Math.max(...timed.map((s) => s.durationMin));
}

/** Best-effort IANA zone from the demo's city label (MX-focused demos). */
export function timezoneForDemoCity(city: string): string {
  const c = city.trim().toLowerCase();
  if (c.includes("monterrey")) return "America/Monterrey";
  if (c.includes("cancún") || c.includes("cancun") || c.includes("playa")) return "America/Cancun";
  if (c.includes("tulum") || c.includes("mérida") || c.includes("merida")) return "America/Cancun";
  if (c.includes("guadalajara")) return "America/Mexico_City";
  return "America/Mexico_City";
}

/**
 * Hours that fit every timed service. Widens an explicit window when it is
 * shorter than the longest service; invents a weekday+Sat window when missing.
 * Returns null when the demo has no timed bookable services (quote-only).
 */
export function resolvedDemoBookingHours(input: {
  city: string;
  services: readonly DemoServiceHoursInput[];
  hours?: DemoHoursSpec | null;
}): DemoHoursSpec | null {
  const maxDur = maxTimedServiceMinutes(input.services);
  if (maxDur <= 0) return null;

  const timezone = input.hours?.timezone?.trim() || timezoneForDemoCity(input.city);
  const needWindow = maxDur + 60; // one hour of slack past the longest hold

  if (input.hours) {
    const window = input.hours.endMin - input.hours.startMin;
    if (window >= needWindow && input.hours.days.length > 0) {
      return {
        timezone,
        days: [...input.hours.days],
        startMin: input.hours.startMin,
        endMin: input.hours.endMin,
        slotMinutes: input.hours.slotMinutes > 0 ? input.hours.slotMinutes : 60,
      };
    }
    return {
      timezone,
      days: input.hours.days.length ? [...input.hours.days] : [1, 2, 3, 4, 5, 6],
      startMin: input.hours.startMin,
      endMin: input.hours.startMin + Math.max(window, needWindow),
      slotMinutes: input.hours.slotMinutes > 0 ? input.hours.slotMinutes : 60,
    };
  }

  // Default: Mon–Sat, 10:00 onward, wide enough for the longest service.
  const startMin = 10 * 60;
  return {
    timezone,
    days: [1, 2, 3, 4, 5, 6],
    startMin,
    endMin: startMin + Math.max(8 * 60, needWindow),
    slotMinutes: 60,
  };
}

/** True when the window can host a hold of `durationMinutes`. */
export function hoursFitDuration(hours: DemoHoursSpec, durationMinutes: number): boolean {
  return hours.endMin - hours.startMin >= durationMinutes && hours.days.length > 0;
}
