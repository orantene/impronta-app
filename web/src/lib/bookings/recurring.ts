/**
 * P7-02 — a recurring client agreement is not its occurrences.
 *
 * Dated visits come from `session_series` + `expandSeries`. Cancelling one
 * visit must not end the agreement (`session_series.is_active` stays true).
 */

import { logServerError } from "@/lib/server/safe-error";
import {
  expandSeries,
  parseLocalTime,
  type IsoWeekday,
  type Occurrence,
  type SeriesSpec,
} from "@/lib/sessions/recurrence";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type RecurringAgreement = {
  seriesId: string;
  tenantId: string;
  title: string;
  isActive: boolean;
  spec: SeriesSpec;
};

function asWeekdays(raw: unknown): IsoWeekday[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((n): n is IsoWeekday => Number.isInteger(n) && n >= 1 && n <= 7) as IsoWeekday[];
}

export function occurrencesForAgreement(
  agreement: RecurringAgreement,
  from: string,
  through: string,
): Occurrence[] {
  return expandSeries(agreement.spec, from, through);
}

export async function loadRecurringAgreement(
  admin: Admin,
  input: { tenantId: string; seriesId: string },
): Promise<
  | { ok: true; agreement: RecurringAgreement }
  | { ok: false; reason: "not_found" | "unavailable" | "invalid"; error: string }
> {
  if (!input.tenantId || !input.seriesId) {
    return { ok: false, reason: "invalid", error: "Missing agreement." };
  }
  const { data, error } = await admin
    .from("session_series")
    .select("id, tenant_id, title, is_active, local_time, timezone, weekdays, duration_minutes, starts_on, ends_on")
    .eq("id", input.seriesId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (error) {
    logServerError("bookings.loadRecurringAgreement", error);
    return { ok: false, reason: "unavailable", error: "Could not load the agreement." };
  }
  if (!data) return { ok: false, reason: "not_found", error: "That agreement is gone." };
  const row = data as {
    id: string;
    tenant_id: string;
    title: string;
    is_active: boolean;
    local_time: string;
    timezone: string | null;
    weekdays: number[];
    duration_minutes: number;
    starts_on: string;
    ends_on: string | null;
  };
  if (parseLocalTime(row.local_time) == null) {
    return { ok: false, reason: "invalid", error: "That agreement has no local time." };
  }
  return {
    ok: true,
    agreement: {
      seriesId: row.id,
      tenantId: row.tenant_id,
      title: row.title,
      isActive: row.is_active,
      spec: {
        localTime: row.local_time,
        timeZone: row.timezone || "UTC",
        weekdays: asWeekdays(row.weekdays),
        durationMinutes: row.duration_minutes,
        startsOn: row.starts_on,
        endsOn: row.ends_on,
      },
    },
  };
}

export async function skipOccurrence(
  admin: Admin,
  input: { tenantId: string; seriesId: string; sessionId: string },
): Promise<
  | { ok: true; seriesStillActive: true }
  | { ok: false; reason: "not_found" | "unavailable" | "invalid"; error: string }
> {
  if (!input.tenantId || !input.seriesId || !input.sessionId) {
    return { ok: false, reason: "invalid", error: "Missing visit." };
  }
  const { data, error } = await admin
    .from("sessions")
    .update({ status: "cancelled" })
    .eq("id", input.sessionId)
    .eq("series_id", input.seriesId)
    .eq("tenant_id", input.tenantId)
    .select("id")
    .maybeSingle();
  if (error) {
    logServerError("bookings.skipOccurrence", error);
    return { ok: false, reason: "unavailable", error: "Could not skip that visit." };
  }
  if (!data) return { ok: false, reason: "not_found", error: "That visit is gone." };
  return { ok: true, seriesStillActive: true };
}
