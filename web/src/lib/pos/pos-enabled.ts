/**
 * TUL-1271 #3 — the POS switch is `talent_offerings.pos_enabled`, separate from
 * `status`. The column arrives with a held migration, so every reader here
 * works without it: a row that does not carry the key is "on".
 */

/** The counter sells a row that is published and not switched off for POS. */
export function isPosSellable(row: { status?: string | null; pos_enabled?: boolean | null }): boolean {
  return row.status === "published" && row.pos_enabled !== false;
}

const MISSING_COLUMN_CODES = new Set(["42703", "PGRST204"]);

/** A Postgres/PostgREST "column does not exist" error (the migration is not applied yet). */
export function isMissingColumnError(error: { code?: string | null } | null | undefined): boolean {
  return Boolean(error?.code && MISSING_COLUMN_CODES.has(error.code));
}

type Reader = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (c: string, v: unknown) => {
        in: (c: string, v: readonly string[]) => PromiseLike<{ data: unknown; error: { code?: string | null } | null }>;
      };
    };
  };
};

/**
 * TUL-1321 — the ids (of those asked about) switched OFF for the counter.
 * ONLY the counter channel asks this: the shared `addLine` (QR ordering, door,
 * class sales, quotes, book-again) must never refuse on it, because a POS-off
 * item stays on the website and the QR menu. Before the held migration the
 * column is missing: nobody is off. Any other error fails safe to "nobody off"
 * too, since refusing a sale on a flag read is worse than selling a listed item.
 */
export async function posOffIds(admin: unknown, tenantId: string, offeringIds: readonly string[]): Promise<Set<string>> {
  if (offeringIds.length === 0) return new Set();
  const { data, error } = await (admin as Reader)
    .from("talent_offerings")
    .select("id, pos_enabled")
    .eq("tenant_id", tenantId)
    .in("id", offeringIds);
  if (error || !Array.isArray(data)) return new Set();
  return new Set((data as Array<{ id: string; pos_enabled?: boolean | null }>).filter((r) => r.pos_enabled === false).map((r) => r.id));
}

/** True when this one item is switched off for the counter. */
export async function isPosOff(admin: unknown, tenantId: string, offeringId: string): Promise<boolean> {
  return (await posOffIds(admin, tenantId, [offeringId])).size > 0;
}

