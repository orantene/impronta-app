"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Raw `agencies.workspace_type` for the placeholder-copy kind (TUL-80). Read
 * with the caller's cookie session, so RLS is the boundary. Any failure
 * returns null, which the copy pass treats as the agency baseline.
 */
export async function fetchWorkspaceTypeForCopy(tenantId: string): Promise<string | null> {
  if (!tenantId) return null;
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("agencies")
    .select("workspace_type")
    .eq("id", tenantId)
    .maybeSingle<{ workspace_type: string | null }>();
  if (error) return null;
  return data?.workspace_type ?? null;
}
