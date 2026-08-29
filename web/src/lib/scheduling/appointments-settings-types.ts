/**
 * Tenant appointments settings — directive-free types.
 *
 * Stored at agencies.settings.appointments. A "use server" module may export
 * only async functions, so the shared shape lives here.
 */

import { parseTerminologyId, type TerminologyId } from "./terminology";
import { isValidIanaTimeZone } from "./tz";

export type AppointmentPresetId = "default" | "barbershop" | "salon" | "clinic";

export type AppointmentDefaults = {
  slotMinutes: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeMin: number;
  horizonDays: number;
};

export type TenantAppointmentsSettings = {
  enabled: boolean;
  terminology: TerminologyId;
  timezone: string;
  allowTalentDirectBooking: boolean;
  defaults: AppointmentDefaults;
  presetId: AppointmentPresetId | null;
};

export const DEFAULT_APPOINTMENT_DEFAULTS: AppointmentDefaults = {
  slotMinutes: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minNoticeMin: 120,
  horizonDays: 60,
};

export const DEFAULT_TENANT_APPOINTMENTS: TenantAppointmentsSettings = {
  enabled: false,
  terminology: "reservations",
  timezone: "UTC",
  allowTalentDirectBooking: false,
  defaults: { ...DEFAULT_APPOINTMENT_DEFAULTS },
  presetId: null,
};

const PRESET_IDS: readonly AppointmentPresetId[] = [
  "default",
  "barbershop",
  "salon",
  "clinic",
];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  const n = Math.trunc(v);
  if (n < min || n > max) return fallback;
  return n;
}

export function parseAppointmentPresetId(raw: unknown): AppointmentPresetId | null {
  if (typeof raw === "string" && (PRESET_IDS as readonly string[]).includes(raw)) {
    return raw as AppointmentPresetId;
  }
  return null;
}

export function normalizeTenantAppointmentsSettings(
  raw: unknown,
): TenantAppointmentsSettings {
  if (!isPlainObject(raw)) return { ...DEFAULT_TENANT_APPOINTMENTS, defaults: { ...DEFAULT_APPOINTMENT_DEFAULTS } };
  const defaultsRaw = isPlainObject(raw.defaults) ? raw.defaults : raw;
  return {
    enabled: raw.enabled === true,
    terminology: parseTerminologyId(raw.terminology),
    timezone:
      typeof raw.timezone === "string" && isValidIanaTimeZone(raw.timezone)
        ? raw.timezone
        : "UTC",
    allowTalentDirectBooking: raw.allowTalentDirectBooking === true,
    defaults: {
      slotMinutes: clampInt(
        defaultsRaw.slotMinutes ?? defaultsRaw.slot_minutes,
        1,
        480,
        DEFAULT_APPOINTMENT_DEFAULTS.slotMinutes,
      ),
      bufferBeforeMin: clampInt(
        defaultsRaw.bufferBeforeMin ?? defaultsRaw.buffer_before_min,
        0,
        240,
        DEFAULT_APPOINTMENT_DEFAULTS.bufferBeforeMin,
      ),
      bufferAfterMin: clampInt(
        defaultsRaw.bufferAfterMin ?? defaultsRaw.buffer_after_min,
        0,
        240,
        DEFAULT_APPOINTMENT_DEFAULTS.bufferAfterMin,
      ),
      minNoticeMin: clampInt(
        defaultsRaw.minNoticeMin ?? defaultsRaw.min_notice_min,
        0,
        60 * 24 * 30,
        DEFAULT_APPOINTMENT_DEFAULTS.minNoticeMin,
      ),
      horizonDays: clampInt(
        defaultsRaw.horizonDays ?? defaultsRaw.horizon_days,
        1,
        365,
        DEFAULT_APPOINTMENT_DEFAULTS.horizonDays,
      ),
    },
    presetId: parseAppointmentPresetId(raw.presetId),
  };
}
