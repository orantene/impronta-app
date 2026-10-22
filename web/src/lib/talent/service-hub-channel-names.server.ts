import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export type ChannelWorkspace = { id: string; displayName: string; kind: string | null };

/**
 * TUL-1371: workspace display names for the channels page. The `agencies` table is
 * readable by that workspace's staff only, so a talent's own session gets zero rows
 * and the page showed raw ids. The ids passed in come ONLY from the talent's own
 * listings, terms, holds and bookings (all read under her RLS), and only the public
 * name and kind leave this function; nothing else about the workspace.
 * A failed read is `{ ok: false }`.
 */
export async function loadChannelWorkspaces(
  fallback: SupabaseClient,
  tenantIds: readonly string[],
): Promise<{ ok: true; rows: ChannelWorkspace[] } | { ok: false }> {
  const ids = [...new Set(tenantIds.filter(Boolean))];
  if (ids.length === 0) return { ok: true, rows: [] };
  const { data, error } = await (createServiceRoleClient() ?? fallback).from("agencies").select("id, display_name, kind").in("id", ids);
  if (error) {
    logServerError("serviceHub.channels.workspaces", error);
    return { ok: false };
  }
  return {
    ok: true,
    rows: ((data ?? []) as Array<Record<string, unknown>>).map((a) => ({
      id: String(a.id),
      displayName: typeof a.display_name === "string" && a.display_name.trim() ? a.display_name : String(a.id),
      kind: typeof a.kind === "string" ? a.kind : null,
    })),
  };
}
