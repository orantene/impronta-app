/**
 * TUL-1916 — the table-QR guest menu lists only items with
 * `talent_offerings.table_qr_enabled = true`. The column arrives with a
 * migration, so every reader works without it: a row that does not carry the
 * key is listed (today's behaviour). Only an explicit `false` hides an item.
 */

/** Columns read for the guest menu, with and without the flag. */
export const TABLE_QR_COLUMN = "table_qr_enabled";

export function isOnTableQrMenu(row: { table_qr_enabled?: boolean | null }): boolean {
  return row.table_qr_enabled !== false;
}

export function withTableQrOnly<T extends { table_qr_enabled?: boolean | null }>(rows: readonly T[]): T[] {
  return rows.filter(isOnTableQrMenu);
}
