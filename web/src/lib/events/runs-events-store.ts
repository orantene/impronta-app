import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

/**
 * `agencies.runs_events` — does this workspace do events.
 *
 * The ONLY reader and writer of the column. Mirrors `workspace-type-store.ts`:
 * a read that fails returns `null`, never `false`, so a caller cannot mistake
 * "could not read" for "events are off" and quietly render a workspace as one
 * that never sells a ticket.
 */
export async function readRunsEvents(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<boolean | null> {
  const { data, error } = await supabase
    .from("agencies")
    .select("runs_events")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) {
    logServerError("runs-events-store.readRunsEvents", error);
    return null;
  }
  if (!data) return null;
  return (data as { runs_events?: unknown }).runs_events === true;
}

export async function writeRunsEvents(
  supabase: SupabaseClient,
  tenantId: string,
  on: boolean,
): Promise<boolean> {
  const { error } = await supabase
    .from("agencies")
    .update({ runs_events: on, updated_at: new Date().toISOString() })
    .eq("id", tenantId);
  if (error) {
    logServerError("runs-events-store.writeRunsEvents", error);
    return false;
  }
  return true;
}
