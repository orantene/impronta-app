/**
 * TUL-1366: data access for product_tiers.service_fee_bps (the Tulala service
 * fee per plan / membership level). Lives in lib/billing, not in a server
 * action, and is only ever called from the platform-admin-gated actions in
 * server-actions/admin-tier-service-fee.ts with a service-role client.
 * product_tiers has RLS enabled and no policy, so nothing else can reach it.
 */
type Db = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export type TierForFee = { id: string; name: string; slug: string; family: string; serviceFeeBps: number };

/** { tierId: bps } for every tier. {} when the column does not exist yet (migration not applied). */
export async function readTierServiceFees(db: Db): Promise<Record<string, number>> {
  try {
    const { data, error } = await db.from("product_tiers").select("id, service_fee_bps");
    if (error || !Array.isArray(data)) return {};
    const out: Record<string, number> = {};
    for (const r of data as Array<{ id: string; service_fee_bps: unknown }>) {
      if (typeof r.service_fee_bps === "number") out[r.id] = r.service_fee_bps;
    }
    return out;
  } catch {
    return {};
  }
}

/** One tier with its family (workspace / talent / client) and current fee; null when missing or unreadable. */
export async function readTierForFee(db: Db, tierId: string): Promise<TierForFee | null> {
  try {
    const { data: t, error } = await db
      .from("product_tiers")
      .select("id, name, slug, package_id, service_fee_bps")
      .eq("id", tierId)
      .maybeSingle();
    if (error || !t) return null;
    const row = t as { id: string; name: string; slug: string; package_id: string; service_fee_bps: unknown };
    if (typeof row.service_fee_bps !== "number") return null;
    const { data: p, error: pErr } = await db.from("product_packages").select("family").eq("id", row.package_id).maybeSingle();
    if (pErr || !p) return null;
    return { id: row.id, name: row.name, slug: row.slug, family: String((p as { family: unknown }).family), serviceFeeBps: row.service_fee_bps };
  } catch {
    return null;
  }
}

export async function writeTierServiceFee(db: Db, tierId: string, bps: number): Promise<boolean> {
  try {
    const { error } = await db
      .from("product_tiers")
      .update({ service_fee_bps: bps, updated_at: new Date().toISOString() })
      .eq("id", tierId);
    return !error;
  } catch {
    return false;
  }
}
