import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * The venue and workspace facts a PUBLIC event page needs and the anon client
 * cannot read: `venues` is SELECT-able by staff only and `agencies` has no
 * anon SELECT policy at all. Read with the anon client both come back null,
 * the timezone ladder falls "knowingly" to UTC, and every night on every
 * tenant renders on the wrong day while looking normal (measured live on the
 * first real event, 2026-09-05).
 *
 * So these four columns are read server-side with the service role, by
 * primary key, for a tenant the caller has already resolved from the host.
 * Nothing else from either row leaves this module.
 */

export type PublicEventContext = {
  venueTimezone: string | null;
  venueName: string | null;
  workspaceTimezone: string | null;
  workspaceDisplayName: string | null;
  supportedLocales: string[];
};

const EMPTY: PublicEventContext = {
  venueTimezone: null,
  venueName: null,
  workspaceTimezone: null,
  workspaceDisplayName: null,
  supportedLocales: [],
};

export async function readPublicEventContext(input: {
  tenantId: string;
  venueId: string | null;
}): Promise<PublicEventContext> {
  const admin = createServiceRoleClient();
  if (!admin) {
    logServerError("events.publicContext", new Error("service role client unavailable; zone ladder falls to platform"));
    return EMPTY;
  }

  const [venue, agency] = await Promise.all([
    input.venueId
      ? admin.from("venues").select("timezone, name").eq("id", input.venueId).eq("tenant_id", input.tenantId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin.from("agencies").select("timezone, display_name, supported_locales").eq("id", input.tenantId).maybeSingle(),
  ]);

  if (venue.error) logServerError("events.publicContext/venue", venue.error);
  if (agency.error) logServerError("events.publicContext/workspace", agency.error);

  const locales = agency.data?.supported_locales;
  return {
    venueTimezone: (venue.data?.timezone as string | null) ?? null,
    venueName: (venue.data?.name as string | null) ?? null,
    workspaceTimezone: (agency.data?.timezone as string | null) ?? null,
    workspaceDisplayName: (agency.data?.display_name as string | null) ?? null,
    supportedLocales: Array.isArray(locales) ? locales.filter((l): l is string => typeof l === "string") : [],
  };
}
