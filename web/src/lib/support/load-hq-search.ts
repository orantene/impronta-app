import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { deskSearchRange, parseDeskSearch, DESK_SEARCH_PAGE_SIZE } from "./desk/desk-search";
import { hydrateHqQueueRows, type HqQueueRow } from "./load-hq";
import { supportFrom } from "./support-from";

export type HqSearchPage = { rows: HqQueueRow[]; hasMore: boolean };

const EMPTY: HqSearchPage = { rows: [], hasMore: false };

/**
 * Desk search against the whole ticket table (TUL-624), newest first, paged.
 * Every value comes out of `parseDeskSearch` (no filter grammar, no wildcards)
 * or out of our own DB (uuids), and goes through the query builder, never
 * string-built SQL.
 */
export async function searchHqSupportTickets(raw: string, page: number): Promise<HqSearchPage> {
  const term = parseDeskSearch(raw);
  if (!term) return EMPTY;
  try {
    const admin = createServiceRoleClient();
    if (!admin) return EMPTY;
    let q = supportFrom(admin, "support_tickets").select("*");

    if (term.kind === "number") {
      q = q.eq("ticket_number", term.number);
    } else if (term.kind === "email") {
      q = q.ilike("contact_email", `%${term.email}%`);
    } else if (term.kind === "talent") {
      const { data, error } = await supportFrom(admin, "talent_profiles")
        .select("id, user_id")
        .eq("profile_code", term.code);
      if (error) {
        logServerError("support.hq.search", error);
        return EMPTY;
      }
      const rows = (data ?? []) as Array<{ id: string; user_id: string | null }>;
      if (rows.length === 0) return EMPTY;
      const ids = rows.map((r) => r.id);
      const users = rows.map((r) => r.user_id).filter((u): u is string => Boolean(u));
      const parts = [`talent_profile_id.in.(${ids.join(",")})`];
      if (users.length) parts.push(`requester_user_id.in.(${users.join(",")})`);
      q = q.or(parts.join(","));
    } else {
      const like = `%${term.text}%`;
      const { data: tenants, error: tenantErr } = await supportFrom(admin, "agencies")
        .select("id")
        .or(`display_name.ilike.${like},slug.ilike.${like}`)
        .limit(25);
      if (tenantErr) {
        logServerError("support.hq.search", tenantErr);
        return EMPTY;
      }
      const tenantIds = ((tenants ?? []) as Array<{ id: string }>).map((t) => t.id);
      const parts = [
        `subject.ilike.${like}`,
        `contact_email.ilike.${like}`,
        `contact_name.ilike.${like}`,
        `last_message_preview.ilike.${like}`,
      ];
      if (tenantIds.length) parts.push(`tenant_id.in.(${tenantIds.join(",")})`);
      q = q.or(parts.join(","));
    }

    const { from } = deskSearchRange(page);
    // One extra row tells us whether another page exists.
    const { data, error } = await q
      .order("last_message_at", { ascending: false })
      .range(from, from + DESK_SEARCH_PAGE_SIZE);
    if (error) {
      logServerError("support.hq.search", error);
      return EMPTY;
    }
    const all = (data ?? []) as unknown[];
    const rows = await hydrateHqQueueRows(admin, all.slice(0, DESK_SEARCH_PAGE_SIZE));
    return { rows, hasMore: all.length > DESK_SEARCH_PAGE_SIZE };
  } catch (err) {
    logServerError("support.hq.search", err);
    return EMPTY;
  }
}
