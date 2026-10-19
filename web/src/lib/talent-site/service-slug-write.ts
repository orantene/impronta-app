/**
 * TUL-1272 C1: the write-path rules for a service's custom slug, as one pure function the save
 * action calls before it writes `slug` / `slug_history`.
 *
 * - The requested slug must have the stored shape, must not be reserved (`service-slug-reserved.ts`)
 *   and must not use the legacy `servicio-<title>-<id8>` grammar (that shape belongs to the
 *   derived slug of every service and would be ambiguous).
 * - It must be free in the owner's scope, the same scope as the held unique indexes:
 *   talent rows per `talent_profile_id`, business (workspace) rows per `tenant_id`.
 * - When the answering slug changes, the slug the service answered on until now goes to
 *   `slug_history`, so old links 301 to the new one. Newest first, deduplicated, capped at 50
 *   (the migration's check).
 *
 * Not wired yet: the save actions are owned by open PR #4021; B4 calls this from there.
 */
import { normalizeStoredServiceSlug } from "./service-content-fields";
import { currentServiceSlug, parseServiceSlug } from "./service-page";
import { isReservedServiceSlug } from "./service-slug-reserved";

export const SLUG_HISTORY_MAX = 50;

export type ServiceSlugOwner = {
  owner_kind?: string | null;
  talent_profile_id?: string | null;
  tenant_id?: string | null;
};

/** The uniqueness scope of a row's slug, mirroring the two partial unique indexes. Null = no scope. */
export function serviceSlugScopeKey(o: ServiceSlugOwner): string | null {
  const kind = o.owner_kind ?? "talent";
  if (kind === "talent") return o.talent_profile_id ? `talent:${o.talent_profile_id}` : null;
  if (kind === "workspace") return o.tenant_id ? `workspace:${o.tenant_id}` : null;
  return null;
}

export type ServiceSlugRow = ServiceSlugOwner & { id: string; slug?: string | null };

export type SlugWriteRefusal = "invalid" | "reserved" | "taken";

export type SlugWritePlan =
  | { ok: true; changed: boolean; slug: string | null; slugHistory: string[] }
  | { ok: false; reason: SlugWriteRefusal };

/** Why a requested slug can not be stored, or null when its shape and word are fine. */
export function serviceSlugProblem(raw: string): Exclude<SlugWriteRefusal, "taken"> | null {
  const t = raw.trim().toLowerCase();
  if (t && isReservedServiceSlug(t)) return "reserved";
  const s = normalizeStoredServiceSlug(t);
  if (!s) return "invalid";
  if (parseServiceSlug(s) !== null) return "invalid";
  return null;
}

/**
 * Plan the `slug` / `slug_history` write for a service. `requested` null or blank clears the
 * custom slug (the service goes back to its derived slug). `title` is the title being saved, so
 * a rename with no custom slug records the old derived slug in history.
 */
export function planServiceSlugWrite(input: {
  row: ServiceSlugRow & { title: string; slugHistory: readonly string[] };
  nextTitle?: string;
  requested: string | null | undefined;
  siblings: readonly ServiceSlugRow[];
}): SlugWritePlan {
  const { row } = input;
  const raw = input.requested?.trim() ?? "";
  let next: string | null = null;
  if (raw) {
    const problem = serviceSlugProblem(raw);
    if (problem) return { ok: false, reason: problem };
    next = normalizeStoredServiceSlug(raw);
    const scope = serviceSlugScopeKey(row);
    const taken = input.siblings.some(
      (s) => s.id !== row.id && scope !== null && serviceSlugScopeKey(s) === scope && normalizeStoredServiceSlug(s.slug) === next,
    );
    if (taken) return { ok: false, reason: "taken" };
  }
  const before = currentServiceSlug(row, { slug: row.slug ?? null });
  const after = currentServiceSlug({ id: row.id, title: input.nextTitle ?? row.title }, { slug: next });
  const prior = row.slugHistory.map(normalizeStoredServiceSlug).filter((s): s is string => s !== null);
  if (before === after) {
    return { ok: true, changed: next !== (row.slug ?? null), slug: next, slugHistory: prior.filter((h) => h !== after) };
  }
  const history = [before, ...prior].filter((h, i, a) => h !== after && a.indexOf(h) === i).slice(0, SLUG_HISTORY_MAX);
  return { ok: true, changed: true, slug: next, slugHistory: history };
}
