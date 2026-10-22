// TUL-1822: what the person already saved on the essentials step (services,
// hours, place, name) counts as "said" on the summary card. The card used to
// read the brief only, so an item that was done still said "Falta".

import type { Essentials } from "./essentials";
import type { FlowLocale } from "./flow";
import { hoursSummary } from "./review-setup-lines";
import { SETUP_COPY } from "./setup-copy";
import type { Understanding, UnderstoodLine } from "./understanding";

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
      // TUL-1822: "where" is answered by the place step 3 saved, even when no area was typed (the mode itself).
      return e.place ? e.place.area?.trim() || SETUP_COPY[locale].placeModes[e.place.mode] : null;
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

/**
 * TUL-1822: the card the client already holds, patched with what step 3 saved.
 * The server recomputes the card from the saved essentials on a reload, but the
 * card in memory predates step 3, so a person who went Back to the summary saw
 * "Falta" on services, hours and where right after filling them in.
 */
export function understandingWithSavedEssentials(u: Understanding, essentials: Essentials | null | undefined, locale: FlowLocale): Understanding {
  if (!essentials) return u;
  const lines = withSavedEssentials(u.lines, essentials, locale);
  return lines.some((l, i) => l !== u.lines[i]) ? { ...u, lines } : u;
}
