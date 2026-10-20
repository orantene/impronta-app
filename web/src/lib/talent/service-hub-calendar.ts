/**
 * service-hub-calendar.ts — "Calendar by channel" (TUL-1371). Pure.
 *
 * The booking engine already makes a hold or booking from ANY channel block the
 * talent's time everywhere (`loadBusyIntervals` unions them per talent). This
 * only LABELS each upcoming entry with the channel that placed it, from what the
 * schema has: the placing workspace (`tenant_id`). The talent's own workspace and
 * the platform hub both read as "My site / hub"; every other tenant is a
 * workspace shown by name. No schema change; a channel column can come later.
 */

export type CalendarEntry = {
  id: string;
  kind: "hold" | "booking";
  title: string;
  startsAt: string;
  endsAt: string;
  tenantId: string;
  /** `talent_bookings.status` (confirmed / completed / cancelled), or 'held' for a hold. */
  status: string;
  holdStrength: "soft" | "firm" | null;
  expiresAt: string | null;
};

export type ChannelCalendarRow = {
  id: string;
  kind: "hold" | "booking";
  title: string;
  startsAt: string;
  endsAt: string;
  channelKey: string;
  /** The workspace's name; null for "My site / hub" (the UI words it). */
  channelName: string | null;
  holdStrength: "soft" | "firm" | null;
};

export function calendarByChannel(input: {
  entries: readonly CalendarEntry[];
  ownTenantIds: ReadonlySet<string>;
  hubTenantIds: ReadonlySet<string>;
  tenantNames: ReadonlyMap<string, string>;
  now: Date;
}): ChannelCalendarRow[] {
  const nowMs = input.now.getTime();
  const rows: ChannelCalendarRow[] = [];
  for (const en of input.entries) {
    const start = Date.parse(en.startsAt);
    const end = Date.parse(en.endsAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    if (end <= nowMs) continue;
    if (en.status === "cancelled") continue;
    if (en.kind === "hold" && en.expiresAt) {
      const exp = Date.parse(en.expiresAt);
      if (Number.isFinite(exp) && exp <= nowMs) continue;
    }
    const mine = input.ownTenantIds.has(en.tenantId) || input.hubTenantIds.has(en.tenantId);
    rows.push({
      id: en.id,
      kind: en.kind,
      title: en.title,
      startsAt: en.startsAt,
      endsAt: en.endsAt,
      channelKey: mine ? "my_site_hub" : `ws:${en.tenantId}`,
      channelName: mine ? null : (input.tenantNames.get(en.tenantId) ?? en.tenantId),
      holdStrength: en.holdStrength,
    });
  }
  return rows.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}
