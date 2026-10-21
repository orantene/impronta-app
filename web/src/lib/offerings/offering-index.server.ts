import "server-only";

/**
 * offering-index.server.ts · reads the owner's `offering_slugs` rows and offering ids for
 * `buildOfferingIndex` (TUL-1594). Service role, so it is ALWAYS scoped: `t:<talent_profile_id>`
 * or `w:<tenant_id>`. Any failure, the held table missing (42P01 / PGRST205) included,
 * returns null and the route keeps TODAY'S behaviour. Never throws.
 */
import { logServerError } from "@/lib/server/safe-error";

import { buildOfferingIndex, type OfferingSlugDbRow } from "./offering-index";
import type { OfferingIndex } from "./offering-paths";

type PgError = { code?: string; message?: string } | null;
type Res = { data?: unknown; error: PgError };
type Chain = {
  select(c: string): Chain;
  eq(c: string, v: string): Chain;
  range(a: number, b: number): PromiseLike<Res>;
};
type Db = { from(table: string): unknown };
const tbl = (db: Db, t: string) => db.from(t) as Chain;

const MISSING_TABLE = new Set(["42P01", "PGRST205", "PGRST204"]);
const PAGE = 1000;
const MAX_PAGES = 5;

export type OfferingOwner = { kind: "talent"; talentProfileId: string } | { kind: "workspace"; tenantId: string };

export function offeringOwnerScope(owner: OfferingOwner): string {
  return owner.kind === "talent" ? `t:${owner.talentProfileId}` : `w:${owner.tenantId}`;
}

async function readAll(make: () => Chain): Promise<{ rows: unknown[]; error: PgError }> {
  const rows: unknown[] = [];
  for (let p = 0; p < MAX_PAGES; p += 1) {
    const res = (await make().range(p * PAGE, p * PAGE + PAGE - 1)) as Res;
    if (res.error) return { rows: [], error: res.error };
    const batch = (res.data ?? []) as unknown[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return { rows, error: null };
}

export async function loadOfferingIndex(
  client: unknown,
  input: { owner: OfferingOwner; primaryLocale: string },
): Promise<OfferingIndex | null> {
  const db = client as Db | null;
  if (!db) return null;
  try {
    const scope = offeringOwnerScope(input.owner);
    const slugs = await readAll(() => tbl(db, "offering_slugs").select("offering_id, locale, slug, is_current").eq("owner_scope", scope));
    if (slugs.error) {
      if (!MISSING_TABLE.has(slugs.error.code ?? "")) logServerError("offering-index.slugs", slugs.error);
      return null;
    }
    const owner = input.owner;
    const ids = await readAll(() => {
      const q = tbl(db, "talent_offerings").select("id");
      return owner.kind === "talent"
        ? q.eq("talent_profile_id", owner.talentProfileId)
        : q.eq("tenant_id", owner.tenantId).eq("owner_kind", "workspace");
    });
    if (ids.error) {
      logServerError("offering-index.ids", ids.error);
      return null;
    }
    return buildOfferingIndex({
      rows: slugs.rows as OfferingSlugDbRow[],
      offeringIds: (ids.rows as Array<{ id: string }>).map((r) => r.id),
      primaryLocale: input.primaryLocale,
    });
  } catch (e) {
    logServerError("offering-index.load", e);
    return null;
  }
}
