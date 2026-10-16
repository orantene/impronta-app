// TUL-806: the review step (4/4) also shows what step 3 set: services, hours
// and where the person works. Those live in the saved essentials, not in the
// brief lines the review already lists.

import type { DayKey, Essentials, HourRange } from "./essentials";
import type { FlowLocale } from "./flow";
import { DAY_LABELS, DAY_ORDER, timezoneLabel } from "./setup";
import { SETUP_COPY } from "./setup-copy";
import { timeSlotLabel } from "./time-slots";

export type ReviewLine = { id: "services" | "hours" | "place" | "timezone"; label: string; value: string };

const LABELS: Record<FlowLocale, { services: string; hours: string; place: string; timezone: string; closed: string }> = {
  en: { services: "Services", hours: "Hours", place: "Where", timezone: "Time zone", closed: "Closed" },
  es: { services: "Servicios", hours: "Horario", place: "Dónde", timezone: "Zona horaria", closed: "Cerrado" },
};

const same = (a: HourRange[], b: HourRange[]) =>
  a.length === b.length && a.every((r, i) => r.startMin === b[i].startMin && r.endMin === b[i].endMin);

export function hoursSummary(week: Essentials["hours"], locale: FlowLocale): string | null {
  if (!week) return null;
  const groups: Array<{ from: DayKey; to: DayKey; ranges: HourRange[] }> = [];
  for (const d of DAY_ORDER) {
    const ranges = week[d] ?? [];
    if (!ranges.length) continue;
    const last = groups[groups.length - 1];
    const prevDay = DAY_ORDER[DAY_ORDER.indexOf(d) - 1];
    if (last && last.to === prevDay && same(last.ranges, ranges)) last.to = d;
    else groups.push({ from: d, to: d, ranges });
  }
  if (!groups.length) return LABELS[locale].closed;
  const day = (k: DayKey) => DAY_LABELS[locale][k];
  return groups
    .map((g) => {
      const days = g.from === g.to ? day(g.from) : `${day(g.from)}-${day(g.to)}`;
      const times = g.ranges.map((r) => `${timeSlotLabel(r.startMin, locale)}-${timeSlotLabel(r.endMin, locale)}`).join(", ");
      return `${days} ${times}`;
    })
    .join(" · ");
}

export function reviewSetupLines(e: Essentials | null, locale: FlowLocale): ReviewLine[] {
  if (!e) return [];
  const l = LABELS[locale];
  const out: ReviewLine[] = [];
  const services = e.services.map((s) => s.name.trim()).filter(Boolean);
  if (services.length) out.push({ id: "services", label: l.services, value: services.join(" · ") });
  const hours = hoursSummary(e.hours, locale);
  if (hours) out.push({ id: "hours", label: l.hours, value: hours });
  if (e.place) {
    const mode = SETUP_COPY[locale].placeModes[e.place.mode];
    out.push({ id: "place", label: l.place, value: e.place.area?.trim() ? `${mode}, ${e.place.area.trim()}` : mode });
  }
  if (e.timezone?.trim()) out.push({ id: "timezone", label: l.timezone, value: timezoneLabel(e.timezone.trim()) });
  return out;
}
