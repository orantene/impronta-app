/**
 * replacement-availability.ts — who is free for a job's window when choosing a
 * replacement (TUL-1373). Pure. Unknown is never free: an unreadable busy list
 * or a job with no usable window marks everyone unknown.
 */

export type BusyRow = { talentProfileId: string; startsAt: string; endsAt: string };
export type Availability = "free" | "busy" | "unknown";

export function availabilityByTalent(
  talentIds: readonly string[],
  window: { startsAt: string; endsAt: string } | null,
  busy: readonly BusyRow[] | "unreadable",
): Map<string, Availability> {
  const out = new Map<string, Availability>();
  const ws = window ? Date.parse(window.startsAt) : NaN;
  const we = window ? Date.parse(window.endsAt) : NaN;
  if (busy === "unreadable" || !Number.isFinite(ws) || !Number.isFinite(we) || we <= ws) {
    for (const id of talentIds) out.set(id, "unknown");
    return out;
  }
  const busyIds = new Set<string>();
  for (const b of busy) {
    const s = Date.parse(b.startsAt);
    const e = Date.parse(b.endsAt);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;
    if (s < we && e > ws) busyIds.add(b.talentProfileId);
  }
  for (const id of talentIds) out.set(id, busyIds.has(id) ? "busy" : "free");
  return out;
}

/** The small suffix after a name in the replacement list: rating, then availability if not free. */
export function candidateTag(c: { availability: Availability; rating: number | null }, locale: string): string {
  const es = locale.toLowerCase().startsWith("es");
  const parts: string[] = [];
  if (c.rating != null && Number.isFinite(c.rating)) parts.push(`${(Math.round(c.rating * 10) / 10).toFixed(1)}★`);
  if (c.availability === "busy") parts.push(es ? "ocupado en ese horario" : "busy at this time");
  if (c.availability === "unknown") parts.push(es ? "disponibilidad sin confirmar" : "availability unknown");
  return parts.join(" · ");
}
