import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";

/**
 * _data-bridge/calendar.ts — calendar page data loader.
 *
 * Split out of the monolithic `_data-bridge.ts` (rev 13). Every event row
 * is a real `inquiries` record with a non-null `event_date`; the calendar
 * page does month navigation client-side from this single fetch.
 */

export type CalendarEvent = {
  id: string;
  contact_name: string;
  company: string | null;
  event_date: string; // ISO date string "YYYY-MM-DD"
  status: string;
};

/**
 * Load all inquiries with a non-null event_date for the calendar page.
 * Returns events sorted by event_date ascending so month navigation is fast
 * client-side (no re-fetch on month change).
 */
export async function loadCalendarEvents(
  tenantId: string,
): Promise<CalendarEvent[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("inquiries")
      .select("id, contact_name, company, event_date, status")
      .eq("tenant_id", tenantId)
      .not("event_date", "is", null)
      .order("event_date", { ascending: true })
      .limit(500);

    if (error) {
      logServerError("workspace.loadCalendarEvents", error);
      return [];
    }

    return (data ?? []).map((row) => ({
      id: (row as { id: string }).id,
      contact_name: (row as { contact_name: string }).contact_name,
      company: (row as { company: string | null }).company,
      event_date: (row as { event_date: string }).event_date,
      status: (row as { status: string }).status,
    }));
  } catch (err) {
    logServerError("workspace.loadCalendarEvents", err);
    return [];
  }
}
