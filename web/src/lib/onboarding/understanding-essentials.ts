// TUL-1822: what the person already saved on the essentials step (services,
// hours, place, name) counts as "said" on the summary card. The card used to
// read the brief only, so an item that was done still said "Falta".

import type { Essentials } from "./essentials";
import type { FlowLocale } from "./flow";
import { hoursSummary } from "./review-setup-lines";
import type { UnderstoodLine } from "./understanding";

function savedValue(line: UnderstoodLine, e: Essentials, locale: FlowLocale): string | null {
  switch (line.id) {
    case "services":
    case "offer": {
      const names = e.services.map((s) => s.name.trim()).filter(Boolean);
      return names.length ? names.join(" · ") : null;
    }
    case "hours":
      return hoursSummary(e.hours, locale);
    case "city":
      return e.place?.area?.trim() || null;
    case "name":
    case "businessName":
      return e.name?.trim() || null;
    default:
      return null;
  }
}

/** Fill a "missing" line from saved essentials; any line with a value is left as it is. */
export function withSavedEssentials(lines: UnderstoodLine[], essentials: Essentials | null | undefined, locale: FlowLocale): UnderstoodLine[] {
  if (!essentials) return lines;
  return lines.map((l) => {
    if (l.status !== "missing" || l.value) return l;
    const v = savedValue(l, essentials, locale);
    return v ? { ...l, value: v, status: "known" as const } : l;
  });
}
