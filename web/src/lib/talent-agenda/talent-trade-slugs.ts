import "server-only";

import type { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

type Admin = NonNullable<ReturnType<typeof createServiceRoleClient>>;

type TermRow = { id?: string; slug: string | null; kind?: string | null; parent_id: string | null };

/**
 * TUL-259: per talent profile, the slug chain of its primary talent type
 * (type, then category group, then parent category), most specific first.
 * `bookingNoun` maps the chain to appointment vs event wording.
 *
 * Every read checks its error; on any failure the affected profiles are simply
 * absent from the map and the caller falls back to the booking-source default.
 */
export async function loadTalentTradeSlugs(
  admin: Admin,
  profileIds: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (profileIds.length === 0) return out;

  const { data, error } = await admin
    .from("talent_profile_taxonomy")
    .select("talent_profile_id, is_primary, taxonomy_terms(kind, slug, parent_id)")
    .in("talent_profile_id", profileIds);
  if (error) {
    logServerError("cron/booking-reminders.trade-slugs", error.message);
    return out;
  }

  const chosen = new Map<string, TermRow>();
  const primary = new Set<string>();
  for (const row of (data ?? []) as unknown as Array<{
    talent_profile_id: string;
    is_primary: boolean | null;
    taxonomy_terms: TermRow | TermRow[] | null;
  }>) {
    const term = Array.isArray(row.taxonomy_terms) ? row.taxonomy_terms[0] : row.taxonomy_terms;
    if (!term || term.kind !== "talent_type" || !term.slug) continue;
    const id = row.talent_profile_id;
    if (!chosen.has(id) || (row.is_primary && !primary.has(id))) {
      chosen.set(id, term);
      if (row.is_primary) primary.add(id);
    }
  }

  // Walk up at most two levels (type -> group -> parent category).
  const chains = new Map<string, string[]>();
  let frontier = new Map<string, string | null>(); // profile id -> next parent id
  for (const [pid, term] of chosen) {
    chains.set(pid, [term.slug as string]);
    frontier.set(pid, term.parent_id);
  }
  for (let level = 0; level < 2; level += 1) {
    const ids = Array.from(new Set(Array.from(frontier.values()).filter((v): v is string => !!v)));
    if (ids.length === 0) break;
    const { data: parents, error: parentErr } = await admin
      .from("taxonomy_terms")
      .select("id, slug, parent_id")
      .in("id", ids);
    if (parentErr) {
      logServerError("cron/booking-reminders.trade-slugs-parents", parentErr.message);
      break;
    }
    const byId = new Map<string, TermRow>();
    for (const t of (parents ?? []) as unknown as TermRow[]) if (t.id) byId.set(t.id, t);
    const next = new Map<string, string | null>();
    for (const [pid, parentId] of frontier) {
      const t = parentId ? byId.get(parentId) : undefined;
      if (!t || !t.slug) continue;
      chains.get(pid)?.push(t.slug);
      next.set(pid, t.parent_id);
    }
    frontier = next;
  }

  for (const [pid, chain] of chains) out.set(pid, chain);
  return out;
}
