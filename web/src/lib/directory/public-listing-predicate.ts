/**
 * The ONE canonical "publicly listed" gate for talent_profiles reads that
 * surface people to anonymous visitors (directory list, count, search,
 * llms.txt). Mirrors exactly what fetch-directory-page.ts applies to the
 * list and count queries. Do not key on is_test_account, names, emails or
 * profile_code ranges: is_publicly_listed is already maintained by the DB
 * (talent_compute_publicly_listed()).
 */

export type PublicListingFilter =
  | { column: "deleted_at"; op: "is"; value: null }
  | { column: "is_publicly_hidden"; op: "eq"; value: false }
  | { column: "is_publicly_listed"; op: "eq"; value: true }
  | { column: "profile_kind"; op: "neq"; value: "resource" };

export const PUBLIC_LISTING_FILTERS: readonly PublicListingFilter[] = [
  { column: "deleted_at", op: "is", value: null },
  { column: "is_publicly_hidden", op: "eq", value: false },
  { column: "is_publicly_listed", op: "eq", value: true },
  { column: "profile_kind", op: "neq", value: "resource" },
];

/** Structural slice of a Supabase filter builder (each call returns the builder). */
interface GateFilterBuilder {
  is(column: string, value: null): GateFilterBuilder;
  eq(column: string, value: boolean): GateFilterBuilder;
  neq(column: string, value: string): GateFilterBuilder;
  in(column: string, values: string[]): GateFilterBuilder;
}

/** Apply the canonical public-listing gate to a talent_profiles query. */
export function applyPublicListingGate<Q>(query: Q): Q {
  let q = query as unknown as GateFilterBuilder;
  for (const f of PUBLIC_LISTING_FILTERS) {
    if (f.op === "is") q = q.is(f.column, f.value);
    else if (f.op === "eq") q = q.eq(f.column, f.value);
    else q = q.neq(f.column, f.value);
  }
  return q as unknown as Q;
}

/** Minimal client surface for the id intersect (a real SupabaseClient satisfies it). */
interface GateClient {
  from(table: string): { select(columns: string): unknown };
}

const ID_CHUNK = 200;

/**
 * Keep only ids that pass the public-listing gate. Used after search paths
 * that cannot be gated at the source (the RPC). One bounded query per
 * ID_CHUNK ids; input order is preserved. Throws on a read error.
 */
export async function filterToPubliclyListedIds(
  supabase: unknown,
  ids: readonly string[],
): Promise<string[]> {
  if (ids.length === 0) return [];
  const client = supabase as GateClient;
  const allowed = new Set<string>();
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    const base = client.from("talent_profiles").select("id") as GateFilterBuilder;
    const { data, error } = await (applyPublicListingGate(base).in(
      "id",
      chunk,
    ) as unknown as PromiseLike<{
      data: { id: string }[] | null;
      error: { message: string } | null;
    }>);
    if (error) throw new Error(`[directory] public listing gate: ${error.message}`);
    for (const row of data ?? []) allowed.add(row.id);
  }
  return ids.filter((id) => allowed.has(id));
}
