import "server-only";

/**
 * TUL-1272 C1: write `slug_history` when a service is renamed, so the old URL 301s to the new
 * one. Code-first: the held migration 415800 adds the columns, so this reads and writes only
 * when the presentation flag is on AND the columns exist (`serviceContentColumnsAvailable`).
 * A failed read or write never blocks the save: the rename is saved either way and the old
 * `servicio-<title>-<id8>` URL keeps resolving through its id8.
 *
 * Two steps around the save: `prepare` (before the UPDATE, reads the stored title and history)
 * and `commit` (after a successful UPDATE, writes the planned history).
 */
import { logServerError } from "@/lib/server/safe-error";
import { servicePresentationResolverEnabled } from "@/lib/services/presentation/flag";
import { serviceContentColumnsAvailable } from "./service-content-columns.server";
import { planServiceSlugWrite } from "./service-slug-write";

type Res = { data: unknown; error: { code?: string; message?: string } | null };

/** The PostgREST chain used here (structural, so tests pass a fake). */
export type SlugRenameDb = {
  from(table: "talent_offerings"): {
    select(columns: string): { eq(c: string, v: string): { maybeSingle(): PromiseLike<Res> } };
    update(patch: { slug_history: string[] }): { eq(c: string, v: string): PromiseLike<Res> };
  };
};

export type SlugRename = { offeringId: string; slugHistory: string[] };

type StoredRow = {
  id: string;
  title: string | null;
  slug: string | null;
  slug_history: string[] | null;
  owner_kind: string | null;
  talent_profile_id: string | null;
  tenant_id: string | null;
};

export async function prepareServiceSlugRename(
  /** The service-role client (typed structurally as SlugRenameDb; generated types lag the held columns). */
  client: unknown,
  input: { offeringId: string; nextTitle: string },
  opts: { enabled?: boolean; columnsAvailable?: () => Promise<boolean> } = {},
): Promise<SlugRename | null> {
  const db = client as SlugRenameDb | null;
  if (!db || !input.offeringId) return null;
  if (!(opts.enabled ?? servicePresentationResolverEnabled())) return null;
  try {
    const available = opts.columnsAvailable ? await opts.columnsAvailable() : await serviceContentColumnsAvailable();
    if (!available) return null;
    const { data, error } = await db
      .from("talent_offerings")
      .select("id, title, slug, slug_history, owner_kind, talent_profile_id, tenant_id")
      .eq("id", input.offeringId)
      .maybeSingle();
    if (error) {
      logServerError("service-slug-rename.read", error);
      return null;
    }
    const row = data as StoredRow | null;
    if (!row || (row.title ?? "").trim() === input.nextTitle.trim()) return null;
    const stored = Array.isArray(row.slug_history) ? row.slug_history : [];
    const plan = planServiceSlugWrite({
      row: { ...row, title: row.title ?? "", slugHistory: stored },
      nextTitle: input.nextTitle,
      // The custom slug is not edited here: keep whatever is stored.
      requested: row.slug,
      siblings: [],
    });
    if (!plan.ok) return null;
    const same = plan.slugHistory.length === stored.length && plan.slugHistory.every((s, i) => s === stored[i]);
    return same ? null : { offeringId: row.id, slugHistory: plan.slugHistory };
  } catch (e) {
    logServerError("service-slug-rename.prepare", e);
    return null;
  }
}

export async function commitServiceSlugHistory(client: unknown, rename: SlugRename): Promise<void> {
  const db = client as SlugRenameDb | null;
  if (!db) return;
  try {
    const { error } = await db.from("talent_offerings").update({ slug_history: rename.slugHistory }).eq("id", rename.offeringId);
    if (error) logServerError("service-slug-rename.write", error);
  } catch (e) {
    logServerError("service-slug-rename.write", e);
  }
}
