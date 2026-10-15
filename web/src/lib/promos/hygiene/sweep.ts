/**
 * Clears show_on_site on promos that ended by date (or were archived) without
 * the talent touching them. Best effort: never throws, never fails the caller.
 */
export const SHOW_ON_SITE_SWEEP_LIMIT = 500;

type SelectChain = {
  eq(col: string, v: boolean): SelectChain;
  or(filter: string): SelectChain;
  limit(n: number): PromiseLike<{ data: { id: string }[] | null; error: { message: string } | null }>;
};
type UpdateChain = {
  in(col: string, ids: string[]): PromiseLike<{ error: { message: string } | null }>;
};
export type SweepDb = {
  from(table: "tenant_promo_codes"): {
    select(cols: string): SelectChain;
    update(patch: { show_on_site: boolean }): UpdateChain;
  };
};

export type ShowOnSiteSweepResult = { cleared: number; failed: boolean };

export async function sweepStaleShowOnSite(
  db: SweepDb,
  now: Date = new Date(),
  limit: number = SHOW_ON_SITE_SWEEP_LIMIT,
  log: (msg: string) => void = () => {},
): Promise<ShowOnSiteSweepResult> {
  try {
    const found = await db
      .from("tenant_promo_codes")
      .select("id")
      .eq("show_on_site", true)
      .or(`ends_at.lt.${now.toISOString()},archived_at.not.is.null`)
      .limit(limit);
    if (found.error) {
      log(`select failed: ${found.error.message}`);
      return { cleared: 0, failed: true };
    }
    const ids = (found.data ?? []).map((r) => r.id);
    if (ids.length === 0) return { cleared: 0, failed: false };
    const upd = await db.from("tenant_promo_codes").update({ show_on_site: false }).in("id", ids);
    if (upd.error) {
      log(`update failed: ${upd.error.message}`);
      return { cleared: 0, failed: true };
    }
    return { cleared: ids.length, failed: false };
  } catch (e) {
    log(`threw: ${e instanceof Error ? e.message : "unknown"}`);
    return { cleared: 0, failed: true };
  }
}
