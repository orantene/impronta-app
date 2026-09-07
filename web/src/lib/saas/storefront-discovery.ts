import "server-only";

import { unstable_cache } from "next/cache";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { normalizeWorkspaceType } from "@/lib/saas/workspace-type";

/**
 * Does this storefront have talent to shortlist?
 *
 * `workspace_type` existed and was correct — `elpaisa` has been `business`
 * since it was created — but it only ever reached the ADMIN nav, where it hides
 * the roster and pitches pages. The public storefront branched on "is this a
 * tenant host", never on "what kind of business is this", so a parrilla shipped
 * a talent shortlist, a favorites drawer and an inquiry cart.
 *
 * Worse than an empty widget: `saved_talent` and `client_favorites` are keyed on
 * `client_user_id` ALONE, with no tenant column. So a signed-in visitor's saved
 * talent from an agency followed them onto the restaurant's site and rendered a
 * count. The owner saw his own three.
 *
 * FAILS TOWARD SHOWING. An unreadable row, a missing tenant, a database outage
 * — all return `true`, because `normalizeWorkspaceType` already defaults to
 * `talent` and because the two failures are not symmetric: a missing shortlist
 * on an agency is a regression in a working product, while an extra one on a
 * restaurant is the bug we are fixing, which is visible and already caught.
 */
export function storefrontShowsTalentDiscovery(tenantId: string | null): Promise<boolean> {
  if (!tenantId) return Promise.resolve(true);

  return unstable_cache(
    async (): Promise<boolean> => {
      const supabase = createServiceRoleClient();
      if (!supabase) return true;

      const { data, error } = await supabase
        .from("agencies")
        .select("workspace_type")
        .eq("id", tenantId)
        .maybeSingle();

      if (error) {
        logServerError("saas/storefrontShowsTalentDiscovery", error);
        return true;
      }
      // A missing row is not a business; it is a lookup that found nothing, and
      // guessing "business" there would strip a real agency's shortlist.
      if (!data) return true;

      return normalizeWorkspaceType(
        (data as { workspace_type?: unknown }).workspace_type,
      ) !== "business";
    },
    ["storefront-talent-discovery", tenantId],
    { revalidate: 300, tags: [`tenant:${tenantId}`] },
  )();
}
