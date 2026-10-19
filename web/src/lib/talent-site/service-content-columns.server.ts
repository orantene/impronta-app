import "server-only";

/**
 * TUL-1272 C1: read the service content columns only when they exist.
 *
 * The migration that adds them is HELD (`_pending_pm/20261231415800_service_content_fields.sql`).
 * Existing loaders keep their current selects; these columns are fetched in a separate, small
 * query behind `serviceContentColumnsAvailable()`, a cached probe:
 *   - columns present: cached for the process lifetime (an additive column does not go away);
 *   - columns absent (Postgres 42703 / PostgREST PGRST204): cached for NEGATIVE_TTL_MS, so a
 *     PM applying the migration takes effect without a deploy;
 *   - any other error (timeout, network): treated as absent for this call, NOT cached.
 * When the columns are absent the loader returns an empty map and every caller paints the
 * in-code defaults (`effectiveServiceContent`), which equal today's page.
 */
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { SERVICE_CONTENT_COLUMNS, serviceContentFromRow, type ServiceContentFields } from "./service-content-fields";

type PgError = { code?: string; message?: string } | null;
type ReadResult = { data: unknown; error: PgError };

/** The one PostgREST chain used here (structural, so tests pass a fake and generated types are not needed). */
export type ServiceContentDb = {
  from(table: "talent_offerings"): {
    select(columns: string): {
      limit(n: number): PromiseLike<ReadResult>;
      in(column: string, values: readonly string[]): PromiseLike<ReadResult>;
    };
  };
};

const NEGATIVE_TTL_MS = 5 * 60_000;
const COLUMNS = SERVICE_CONTENT_COLUMNS.join(", ");

let probe: { available: boolean; at: number } | null = null;

export function resetServiceContentProbeForTests(): void {
  probe = null;
}

/** Postgres undefined_column, PostgREST schema-cache miss, or the plain-text form of either. */
export function isMissingColumnError(err: PgError | undefined): boolean {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  const m = err.message ?? "";
  return /column .* does not exist/i.test(m) || /could not find the '.*' column/i.test(m);
}

function markAbsent(now: number): void {
  probe = { available: false, at: now };
}

function defaultDb(): ServiceContentDb | null {
  return createServiceRoleClient() as unknown as ServiceContentDb | null;
}

/** True when `talent_offerings` has the C1 content columns (held migration applied). */
export async function serviceContentColumnsAvailable(
  db: ServiceContentDb | null = defaultDb(),
  opts: { now?: number } = {},
): Promise<boolean> {
  const now = opts.now ?? Date.now();
  if (probe?.available) return true;
  if (probe && now - probe.at < NEGATIVE_TTL_MS) return false;
  if (!db) return false;
  try {
    const { error } = await db.from("talent_offerings").select(COLUMNS).limit(0);
    if (!error) {
      probe = { available: true, at: now };
      return true;
    }
    if (isMissingColumnError(error)) markAbsent(now);
    else console.warn("[service-content] probe failed; using defaults for this request:", error.message ?? error.code);
    return false;
  } catch (e) {
    console.warn("[service-content] probe threw; using defaults for this request:", e);
    return false;
  }
}

/**
 * Content fields by offering id. Empty map when the columns are absent, the client is missing or
 * the read fails: callers then use the in-code defaults. Never throws.
 */
export async function loadServiceContentFields(
  offeringIds: readonly string[],
  db: ServiceContentDb | null = defaultDb(),
  opts: { now?: number } = {},
): Promise<Map<string, ServiceContentFields>> {
  const out = new Map<string, ServiceContentFields>();
  const ids = [...new Set(offeringIds.filter(Boolean))];
  if (ids.length === 0 || !db) return out;
  if (!(await serviceContentColumnsAvailable(db, opts))) return out;
  try {
    const { data, error } = await db.from("talent_offerings").select(`id, ${COLUMNS}`).in("id", ids);
    if (error) {
      if (isMissingColumnError(error)) markAbsent(opts.now ?? Date.now());
      else console.warn("[service-content] read failed; using defaults:", error.message ?? error.code);
      return out;
    }
    for (const row of Array.isArray(data) ? data : []) {
      const id = (row as { id?: unknown }).id;
      if (typeof id === "string") out.set(id, serviceContentFromRow(row));
    }
    return out;
  } catch (e) {
    console.warn("[service-content] read threw; using defaults:", e);
    return out;
  }
}
