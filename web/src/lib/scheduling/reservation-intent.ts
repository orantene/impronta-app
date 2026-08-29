/**
 * Reservation intent mapper — appointments ride the inquiry spine.
 *
 * PURE. Sets source_channel `offering_request` and date:{status:"exact"}.
 * Do NOT reuse decideFormRouting (it hardcodes date not_sure).
 */

import type { InquiryDate, InquiryIntent } from "@/lib/inquiry/inquiry-intent";
import { utcToZonedHmm, utcToZonedYmd } from "./tz";

export const RESERVATION_STAMP_VERSION = 1 as const;

export type ReservationMode = "request" | "instant" | "deposit" | "full";

export type ReservationStamp = {
  v: typeof RESERVATION_STAMP_VERSION;
  offering_id: string;
  variant_id?: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  duration_minutes: number;
  mode: ReservationMode;
  hold_id?: string | null;
  hold_expires_at?: string | null;
};

const OFFERING_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MODES: readonly ReservationMode[] = ["request", "instant", "deposit", "full"];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isIsoInstant(v: unknown): v is string {
  if (typeof v !== "string" || !v.trim()) return false;
  const ms = Date.parse(v);
  return Number.isFinite(ms);
}

export function parseReservationStamp(sourceContext: unknown): ReservationStamp | null {
  if (!isPlainObject(sourceContext)) return null;
  const raw = isPlainObject(sourceContext.reservation) ? sourceContext.reservation : sourceContext;
  if (!isPlainObject(raw)) return null;
  if (raw.v !== RESERVATION_STAMP_VERSION && raw.v !== "1") return null;
  if (typeof raw.offering_id !== "string" || !OFFERING_ID_RE.test(raw.offering_id)) return null;
  if (!isIsoInstant(raw.starts_at) || !isIsoInstant(raw.ends_at)) return null;
  if (Date.parse(raw.ends_at) <= Date.parse(raw.starts_at)) return null;
  if (typeof raw.timezone !== "string" || !raw.timezone.trim()) return null;
  const duration =
    typeof raw.duration_minutes === "number" && Number.isFinite(raw.duration_minutes) && raw.duration_minutes > 0
      ? Math.trunc(raw.duration_minutes)
      : Math.round((Date.parse(raw.ends_at) - Date.parse(raw.starts_at)) / 60_000);
  if (duration <= 0 || duration > 480) return null;
  const mode = MODES.includes(raw.mode as ReservationMode) ? (raw.mode as ReservationMode) : "request";
  return {
    v: RESERVATION_STAMP_VERSION,
    offering_id: raw.offering_id,
    variant_id: typeof raw.variant_id === "string" && raw.variant_id ? raw.variant_id : null,
    starts_at: new Date(raw.starts_at).toISOString(),
    ends_at: new Date(raw.ends_at).toISOString(),
    timezone: raw.timezone.trim(),
    duration_minutes: duration,
    mode,
    hold_id: typeof raw.hold_id === "string" && raw.hold_id ? raw.hold_id : null,
    hold_expires_at: isIsoInstant(raw.hold_expires_at) ? new Date(raw.hold_expires_at).toISOString() : null,
  };
}

export function reservationDateFromStamp(stamp: ReservationStamp): InquiryDate {
  const starts = new Date(stamp.starts_at);
  const event_date = utcToZonedYmd(starts, stamp.timezone) ?? stamp.starts_at.slice(0, 10);
  const start_time = utcToZonedHmm(starts, stamp.timezone) ?? stamp.starts_at.slice(11, 16);
  return {
    status: "exact",
    event_date,
    start_time,
    duration: `${stamp.duration_minutes} min`,
  };
}

export function applyReservationToIntent(
  intent: InquiryIntent,
  stamp: ReservationStamp,
): InquiryIntent {
  return {
    ...intent,
    source: "offering_request",
    date: reservationDateFromStamp(stamp),
    source_context: {
      ...(intent.source_context ?? {}),
      reservation: stamp,
    },
  };
}
