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
