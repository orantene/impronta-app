import "server-only";

/**
 * TUL-1495 (TUL-1324): a service rename keeps the old link alive through `offering_slugs`
 * (held migration 418800). A slug that followed the old title follows the new one and the old
 * slug stays as a history row that 301s to the current one (`planOfferingSlugRename`); a slug
 * the owner typed is never touched. This replaced the old `slug_history` column writer, a
 * column 418800 does not have.
 *
 * Two steps around the save: `prepare` (before the UPDATE, reads the stored title and the
 * offering's slug rows) and `commit` (after a successful UPDATE, applies the planned ops).
 * Only when the presentation flag is on AND the table exists. A failed read or write never
 * blocks the save: the rename is saved either way and the legacy `servicio-<title>-<id8>` URL
 * keeps resolving through its id8. A write that fails half way puts the retired row back.
 */
import { planOfferingSlugRename, type SlugOp, type SlugRow } from "@/lib/offerings/offering-slug-rename";
import { logServerError } from "@/lib/server/safe-error";
import { servicePresentationResolverEnabled } from "@/lib/services/presentation/flag";

type PgError = { code?: string; message?: string } | null;
type Res = { data?: unknown; error: PgError };

/** The PostgREST chain used here (structural, so tests pass a fake). */
export type SlugRenameDb = {
  from(table: string): Record<string, (...args: never[]) => unknown>;
};

/** Always scoped to the saving talent: the service-role client bypasses RLS. */
export type SlugRename = { offeringId: string; talentProfileId: string; scope: string; ops: SlugOp[] };

const MISSING_TABLE = new Set(["42P01", "PGRST205", "PGRST204"]);

type Chain = {
  select(c: string): Chain;
  eq(c: string, v: string): Chain;
  in(c: string, v: string[]): Chain;
  update(patch: Record<string, unknown>): Chain;
  insert(row: Record<string, unknown>): PromiseLike<Res>;
  maybeSingle(): PromiseLike<Res>;
  then: PromiseLike<Res>["then"];
};
const table = (db: SlugRenameDb, name: string) => db.from(name) as unknown as Chain;

export async function prepareServiceSlugRename(
  /** The service-role client (typed structurally; generated types lag the held tables). */
  client: unknown,
  input: { offeringId: string; talentProfileId: string; nextTitle: string },
  opts: { enabled?: boolean } = {},
): Promise<SlugRename | null> {
  const db = client as SlugRenameDb | null;
  if (!db || !input.offeringId || !input.talentProfileId) return null;
  if (!(opts.enabled ?? servicePresentationResolverEnabled())) return null;
  const scope = `t:${input.talentProfileId}`;
  try {
    const off = (await table(db, "talent_offerings")
      .select("id, title")
      .eq("id", input.offeringId)
      .eq("talent_profile_id", input.talentProfileId)
      .maybeSingle()) as Res;
    if (off.error) {
      logServerError("service-slug-rename.read", off.error);
      return null;
    }
    const oldTitle = ((off.data as { title?: string | null } | null)?.title ?? "").trim();
    if (!off.data || oldTitle === input.nextTitle.trim()) return null;

    const mine = (await table(db, "offering_slugs").select("id, locale, slug, is_current").eq("offering_id", input.offeringId)) as unknown as Res;
    if (mine.error) {
      if (!MISSING_TABLE.has(mine.error.code ?? "")) logServerError("service-slug-rename.slugs", mine.error);
      return null;
    }
    const rows: SlugRow[] = ((mine.data ?? []) as Array<{ id: string; locale: string; slug: string; is_current: boolean }>).map((r) => ({
      id: r.id,
      locale: r.locale,
      slug: r.slug,
      isCurrent: r.is_current === true,
    }));
    if (!rows.some((r) => r.isCurrent)) return null;

    const locales = [...new Set(rows.filter((r) => r.isCurrent).map((r) => r.locale))];
    const scoped = (await table(db, "offering_slugs").select("locale, slug").eq("owner_scope", scope).in("locale", locales)) as unknown as Res;
    if (scoped.error) {
      logServerError("service-slug-rename.taken", scoped.error);
      return null;
    }
    const taken = new Map<string, Set<string>>();
    for (const r of (scoped.data ?? []) as Array<{ locale: string; slug: string }>) {
      taken.set(r.locale, (taken.get(r.locale) ?? new Set<string>()).add(r.slug));
    }
    const ops = planOfferingSlugRename({ oldTitle, newTitle: input.nextTitle, rows, takenByLocale: taken });
    return ops.length === 0 ? null : { offeringId: input.offeringId, talentProfileId: input.talentProfileId, scope, ops };
  } catch (e) {
    logServerError("service-slug-rename.prepare", e);
    return null;
  }
}

async function setCurrent(db: SlugRenameDb, rowId: string, value: boolean, offeringId: string): Promise<PgError> {
  const res = (await table(db, "offering_slugs").update({ is_current: value }).eq("id", rowId).eq("offering_id", offeringId)) as unknown as Res;
  return res.error;
}

export async function commitServiceSlugHistory(client: unknown, rename: SlugRename): Promise<void> {
  const db = client as SlugRenameDb | null;
  if (!db) return;
  // Ops come in pairs: retire the current row, then promote/insert its successor. If the
  // successor fails, the retired row goes back so the locale is never left without a slug.
  let retired: string | null = null;
  try {
    for (const op of rename.ops) {
      if (op.kind === "retire") {
        const err = await setCurrent(db, op.rowId, false, rename.offeringId);
        if (err) {
          logServerError("service-slug-rename.retire", err);
          retired = null;
          continue;
        }
        retired = op.rowId;
        continue;
      }
      let err: PgError;
      if (op.kind === "promote") err = await setCurrent(db, op.rowId, true, rename.offeringId);
      else {
        const res = (await table(db, "offering_slugs").insert({
          offering_id: rename.offeringId,
          owner_scope: rename.scope,
          locale: op.locale,
          slug: op.slug,
          is_current: true,
        })) as Res;
        err = res.error;
      }
      if (err) {
        logServerError("service-slug-rename.write", err);
        if (retired) {
          const back = await setCurrent(db, retired, true, rename.offeringId);
          if (back) logServerError("service-slug-rename.restore", back);
        }
      }
      retired = null;
    }
  } catch (e) {
    logServerError("service-slug-rename.commit", e);
    if (retired) await setCurrent(db, retired, true, rename.offeringId).catch(() => undefined);
  }
}
