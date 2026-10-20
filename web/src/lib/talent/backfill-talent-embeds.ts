/**
 * TUL-1382: keep history screens showing a talent's name after the staff
 * `talent_profiles` SELECT policy became roster-scoped.
 *
 * A removed, unpublished talent is no longer visible to the staff session, so a
 * `talent_profiles ( ... )` embed on an otherwise authorized row (lineup,
 * offer line, roster peek) comes back NULL and the screen renders a blank name.
 * This fills ONLY those missing embeds, reading the requested columns through
 * the service client keyed by the `talent_profile_id`s the authorized rows
 * already carry. An embed the session could see is never touched.
 *
 * Callers authorize first (inquiry manager / workspace staff) and read their
 * rows with the session client; this adds no row and no id the action did not
 * already return.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { staffTalentClient } from "@/lib/talent/staff-talent-lookup";

type RowWithTalent = { talent_profile_id?: string | null; talent_profiles?: unknown };

const SAFE_COLUMNS: ReadonlySet<string> = new Set(["display_name", "first_name", "last_name", "profile_code"]);

function missing(embed: unknown): boolean {
  return embed == null || (Array.isArray(embed) && embed.length === 0);
}

export async function backfillMissingTalentEmbeds(
  supabase: SupabaseClient,
  rows: ReadonlyArray<Record<string, unknown> | RowWithTalent>,
  columns: string,
): Promise<void> {
  const need = (rows as RowWithTalent[]).filter(
    (r) => typeof r.talent_profile_id === "string" && r.talent_profile_id && missing(r.talent_profiles),
  );
  if (need.length === 0) return;
  const ids = [...new Set(need.map((r) => r.talent_profile_id as string))];
  // SECURITY: this reaches client-facing payloads (the client dashboard roster peek), so only
  // display columns may ever be read through the service client. user_id is never one of them.
  const safe = columns.split(",").map((c) => c.trim()).filter((c) => SAFE_COLUMNS.has(c));
  if (safe.length === 0) return;
  const client = await staffTalentClient(supabase);
  // `id` is always selected so rows can be matched back.
  const { data, error } = await client.from("talent_profiles").select(`id, ${safe.join(", ")}`).in("id", ids);
  if (error) {
    // Display only: leave the embeds empty rather than fail the screen.
    logServerError("talent.backfillTalentEmbeds", error);
    return;
  }
  const byId = new Map<string, Record<string, unknown>>();
  for (const p of (data ?? []) as unknown as Array<Record<string, unknown>>) {
    const { id, ...rest } = p;
    byId.set(String(id), rest);
  }
  for (const r of need) {
    const found = byId.get(r.talent_profile_id as string);
    if (found) (r as RowWithTalent).talent_profiles = found;
  }
}

/**
 * `rows` with any NULL talent embed filled (see `backfillMissingTalentEmbeds`). One expression so a
 * caller keeps its `const rows = ...` shape. Display columns only; the rows are returned in place.
 */
export async function withTalentEmbeds<T extends Record<string, unknown> | RowWithTalent>(
  supabase: SupabaseClient,
  rows: T[],
  columns: string,
): Promise<T[]> {
  await backfillMissingTalentEmbeds(supabase, rows, columns);
  return rows;
}
