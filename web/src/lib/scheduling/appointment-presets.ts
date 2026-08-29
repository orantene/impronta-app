/**
 * Hours + default presets for the appointments settings card.
 * PURE. Applying a preset never writes the DB by itself.
 */

import type { AppointmentDefaults, AppointmentPresetId } from "./appointments-settings-types";
import { DEFAULT_APPOINTMENT_DEFAULTS } from "./appointments-settings-types";
import type { WeeklyHours } from "./hours-types";

export type AppointmentPreset = {
  id: AppointmentPresetId;
  timezoneHint: string | null;
  defaults: AppointmentDefaults;
  weekly: WeeklyHours;
};

function emptyWeekly(): WeeklyHours {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

function windowedDays(days: number[], startMin: number, endMin: number): WeeklyHours {
  const weekly = emptyWeekly();
  for (const day of days) {
    if (day >= 0 && day <= 6) {
      weekly[day as 0 | 1 | 2 | 3 | 4 | 5 | 6] = [{ startMin, endMin }];
    }
  }
  return weekly;
}

const PRESETS: Record<AppointmentPresetId, AppointmentPreset> = {
  default: {
    id: "default",
    timezoneHint: null,
    defaults: { ...DEFAULT_APPOINTMENT_DEFAULTS, slotMinutes: 60 },
    weekly: windowedDays([1, 2, 3, 4, 5], 9 * 60, 17 * 60),
  },
  barbershop: {
    id: "barbershop",
    timezoneHint: "America/Cancun",
    defaults: { ...DEFAULT_APPOINTMENT_DEFAULTS, slotMinutes: 30, minNoticeMin: 60 },
    weekly: windowedDays([2, 3, 4, 5, 6], 10 * 60, 19 * 60),
  },
  salon: {
    id: "salon",
    timezoneHint: null,
    defaults: { ...DEFAULT_APPOINTMENT_DEFAULTS, slotMinutes: 30, bufferAfterMin: 10 },
    weekly: windowedDays([1, 2, 3, 4, 5, 6], 9 * 60, 18 * 60),
  },
  clinic: {
    id: "clinic",
    timezoneHint: null,
    defaults: { ...DEFAULT_APPOINTMENT_DEFAULTS, slotMinutes: 15, minNoticeMin: 180 },
    weekly: windowedDays([1, 2, 3, 4, 5], 8 * 60, 17 * 60),
  },
};

export const APPOINTMENT_PRESET_IDS = Object.keys(PRESETS) as AppointmentPresetId[];

export function getAppointmentPreset(id: AppointmentPresetId): AppointmentPreset {
  return PRESETS[id];
}
