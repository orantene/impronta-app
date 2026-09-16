/**
 * event_list — the engine seam (read only). Published events with their
 * scheduled nights, the way `/events` lists them; `upcoming` keeps events
 * with a night still to come, `all` keeps every published event.
 */

import type { StorefrontAdmin } from "./admin";
import type { EventCard, EventListData, EventListProps } from "./event-list.types";

export type EventListDeps = { admin: StorefrontAdmin; now?: () => Date };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function readEventListCore(
  deps: EventListDeps,
  tenantId: string,
  props: EventListProps,
): Promise<{ ok: true; data: EventListData } | { ok: false; reason: string }> {
  if (!UUID.test(tenantId)) return { ok: false, reason: "invalid_request" };
  const now = (deps.now ?? (() => new Date()))();
  const count = Math.min(50, Math.max(1, Math.trunc(props.count ?? 12) || 12));
  try {
    const { data: events, error } = await deps.admin
      .from("events")
      .select("id, slug, title, description, venue_id, status")
      .eq("tenant_id", tenantId)
      .eq("status", "published")
      .limit(100);
    if (error) return { ok: false, reason: "unavailable" };
    const rows = (events ?? []) as Array<{ id: string; slug: string | null; title: string | null; description: string | null; venue_id: string | null }>;
    if (rows.length === 0) return { ok: true, data: { events: [], layout: props.layout ?? "cards" } };
    const ids = rows.map((e) => e.id);
    const [{ data: sessions, error: sErr }, venues] = await Promise.all([
      deps.admin.from("sessions").select("id, event_id, starts_at, ends_at, status").eq("tenant_id", tenantId).eq("status", "scheduled").in("event_id", ids).order("starts_at", { ascending: true }),
      (async () => {
        const venueIds = [...new Set(rows.map((e) => e.venue_id).filter((v): v is string => !!v))];
        if (venueIds.length === 0) return new Map<string, string>();
        const { data } = await deps.admin.from("venues").select("id, timezone").in("id", venueIds);
        return new Map(((data ?? []) as Array<{ id: string; timezone: string }>).map((v) => [v.id, v.timezone]));
      })(),
    ]);
    if (sErr) return { ok: false, reason: "unavailable" };
    const byEvent = new Map<string, Array<{ starts_at: string; ends_at: string }>>();
    for (const s of (sessions ?? []) as Array<{ event_id: string; starts_at: string; ends_at: string }>) {
      byEvent.set(s.event_id, [...(byEvent.get(s.event_id) ?? []), s]);
    }
    const cards: EventCard[] = [];
    for (const e of rows) {
      if (!e.slug) continue;
      const nights = byEvent.get(e.id) ?? [];
      const future = nights.filter((n) => Date.parse(n.ends_at) >= now.getTime());
      if ((props.filter ?? "upcoming") === "upcoming" && future.length === 0) continue;
      const shown = future.length > 0 ? future : nights;
      cards.push({
        id: e.id,
        slug: e.slug,
        title: e.title ?? "",
        description: e.description,
        path: `/events/${encodeURIComponent(e.slug)}`,
        nextStartsAtIso: shown[0] ? new Date(shown[0].starts_at).toISOString() : null,
        lastStartsAtIso: shown.length > 0 ? new Date(shown[shown.length - 1]!.starts_at).toISOString() : null,
        timezone: (e.venue_id ? venues.get(e.venue_id) : undefined) ?? null,
        nightsCount: shown.length,
      });
    }
    cards.sort((a, b) => (a.nextStartsAtIso ?? "9").localeCompare(b.nextStartsAtIso ?? "9"));
    return { ok: true, data: { events: cards.slice(0, count), layout: props.layout ?? "cards" } };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
