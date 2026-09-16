/**
 * brief-store-tenant.server.ts — the tenant-scoped brief read the Templates &
 * Imagery composer uses. Lives beside brief-store.server.ts (which sits at
 * its line budget) and shares its SELECT + mapper so the shape cannot drift.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

import type { Brief } from "./brief-store";
import { BRIEF_SELECT, mapBrief, type BriefRow } from "./brief-store.server";

/**
 * The brief a WORKSPACE was provisioned from (Templates & Imagery composer).
 * Scoped by the stamped `tenant_id`, never by id alone: a brief id must not be
 * enough to compose another tenant's site. With `briefId` the row must match
 * both; without it the tenant's newest brief wins. Null when nothing is
 * stamped, which the composer reports as `fallback_used`, never as an error.
 */
export async function loadBriefForTenant(input: {
  tenantId: string;
  briefId?: string | null;
}): Promise<Brief | null> {
  const sb = createServiceRoleClient();
  if (!sb) return null;
  try {
    let query = sb.from("tulala_briefs").select(BRIEF_SELECT).eq("tenant_id", input.tenantId);
    if (input.briefId) query = query.eq("id", input.briefId);
    const { data, error } = await query.order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (error) {
      logServerError("tulala.loadBriefForTenant", error);
      return null;
    }
    return data ? mapBrief(data as unknown as BriefRow) : null;
  } catch (err) {
    logServerError("tulala.loadBriefForTenant", err);
    return null;
  }
}

