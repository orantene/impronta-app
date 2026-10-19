/**
 * TUL-1271 item 6: catalog rows that are NOT menu items.
 *
 * Two kinds of `talent_offerings` row exist only to back another product:
 *   - the row behind a ticketed event (`events.offering_id`)
 *   - the venue's reservation offering (`venue_service_rules.reservation_offering_id`)
 * They are never sold off a menu. The Menu editor, the POS counter catalog and
 * the QR guest menu all read the same table, so all three use this one rule.
 */

type Row = Record<string, unknown>;
type Result = PromiseLike<{ data: unknown; error: unknown }>;
type Admin = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export type NonMenuOfferingIds = { ids: Set<string>; error: unknown | null };

function collect(rows: unknown, column: string, into: Set<string>) {
  for (const row of (Array.isArray(rows) ? rows : []) as Row[]) {
    const id = row[column];
    if (typeof id === "string" && id.length > 0) into.add(id);
  }
}

/** Tenant-scoped. On a read error `error` is set; callers decide how to fail (all three fail closed). */
export async function loadNonMenuOfferingIds(admin: Admin, tenantId: string): Promise<NonMenuOfferingIds> {
  const [events, rules] = await Promise.all([
    admin.from("events").select("offering_id").eq("tenant_id", tenantId).not("offering_id", "is", null) as Result,
    admin
      .from("venue_service_rules")
      .select("reservation_offering_id")
      .eq("tenant_id", tenantId)
      .not("reservation_offering_id", "is", null) as Result,
  ]);
  const { data: eventRows, error: eventsError } = events;
  const { data: ruleRows, error: rulesError } = rules;
  const ids = new Set<string>();
  collect(eventRows, "offering_id", ids);
  collect(ruleRows, "reservation_offering_id", ids);
  return { ids, error: eventsError ?? rulesError ?? null };
}

export function withoutNonMenuOfferings<T extends { id: string }>(rows: readonly T[], excluded: ReadonlySet<string>): T[] {
  return rows.filter((row) => !excluded.has(row.id));
}

/**
 * Write-path guard: true when any of `offeringIds` may not be sold off a menu
 * surface (counter, QR menu), OR when the exclusion list could not be read
 * (fail closed). Ticketed-event desks (door) do not call this.
 */
export async function anyNonMenuOffering(admin: Admin, tenantId: string, offeringIds: readonly string[]): Promise<boolean> {
  if (offeringIds.length === 0) return false;
  const { ids, error } = await loadNonMenuOfferingIds(admin, tenantId);
  if (error) return true;
  return offeringIds.some((id) => ids.has(id));
}

/** Checkout guard: true when the tenant's sale holds a non-menu offering, or any read fails (fail closed). */
export async function saleHoldsNonMenuOffering(
  admin: Admin,
  tenantId: string,
  orderId: string,
): Promise<boolean> {
  const { data: order, error: orderError } = await admin.from("orders").select("id").eq("id", orderId).eq("tenant_id", tenantId).maybeSingle();
  if (orderError || !order) return true;
  const { data: lines, error: linesError } = await admin.from("order_lines").select("offering_id").eq("order_id", orderId);
  if (linesError) return true;
  const ids = ((lines ?? []) as Array<{ offering_id: string | null }>).map((l) => l.offering_id).filter((id): id is string => Boolean(id));
  return anyNonMenuOffering(admin, tenantId, ids);
}
