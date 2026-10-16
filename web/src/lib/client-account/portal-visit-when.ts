import { formatZonedWhen } from "./area-pure";
import { visitZone } from "./visit-zone";

/**
 * TUL-503: the workspace client portal (Today, Inquiries, thread Details) used to read time
 * only from the inquiry brief and ignored the booking's own start. A visit now reads in its
 * own zone: the booking talent's hours zone, else the booking zone, else the workspace zone.
 * Pure.
 */
export type PortalVisitWhen = { date: string; time: string; tzLabel: string; zone: string };

export function portalVisitWhen(input: {
  startsAt: string | null | undefined;
  talentZone: string | null | undefined;
  bookingZone: string | null | undefined;
  workspaceZone: string;
  locale: string;
}): PortalVisitWhen | null {
  const zone = visitZone(input.talentZone ?? input.bookingZone, visitZone(input.bookingZone, input.workspaceZone));
  const w = formatZonedWhen(input.startsAt, zone, input.locale);
  return w ? { ...w, zone } : null;
}
