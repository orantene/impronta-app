import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Display names for the people who asked for an approval. `profiles` has no
 * tenant column (a person is one row across every workspace), so this read
 * lives here rather than in a server action; the caller is already scoped
 * to its tenant's `approval_requests` and hands over only those ids. A
 * failed read is logged and leaves the rows named by id: a name is a
 * courtesy on the inbox, never the record.
 */
export async function requesterNames(admin: Pick<SupabaseClient, "from">, ids: readonly string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  const { data, error } = await admin.from("profiles").select("id, display_name").in("id", [...ids]);
  if (error) {
    logServerError("approvals.requesterNames", error);
    return names;
  }
  for (const p of (data ?? []) as Array<{ id: string; display_name: string | null }>) {
    if (p.display_name) names.set(p.id, p.display_name);
  }
  return names;
}
