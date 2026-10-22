import "server-only";

import { loadNonMenuOfferingIds } from "@/lib/offerings/non-menu-offerings";
import { businessServicePagesOn } from "@/lib/services/business-pages/load.server";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { isMissingTable, shapeSavedServices, type SavedService, type SavedServiceRow } from "./saved-services";

const OFFERING_COLUMNS = "id, tenant_id, title, title_i18n, status, moderation_state, visibility, kind, owner_kind, talent_profile_id, attributes";

/** The account's host, from the proxy-set headers the renderer already read. */
export type SavedServicesHost = { hostKind: string | null; hostTalentProfileId: string | null; hubTalentProfileId?: string | null };

/**
 * The signed-in client's saved services on THIS site: `client_user_id = userId` (the session
 * user, never a request value) AND `tenant_id = tenantId` (the host's tenant); on a talent
 * site only the host talent's services are shown (TUL-1692, `shapeSavedServices`). Degrades to an
 * empty list, including while the held table (20261231422300) is not applied.
 */
export async function loadSavedServices(userId: string, tenantId: string, locale: string, host: SavedServicesHost): Promise<SavedService[]> {
  const admin = createServiceRoleClient();
  if (!admin || !userId || !tenantId) return [];
  const { data, error } = await admin
    .from("client_favorite_services")
    .select(`added_at, offering_id, tenant_id, talent_offerings ( ${OFFERING_COLUMNS} )`)
    .eq("client_user_id", userId)
    .eq("tenant_id", tenantId)
    .order("added_at", { ascending: false })
    .limit(200);
  if (error) {
    if (!isMissingTable(error)) logServerError("clientAccount.savedServices.list", error);
    return [];
  }
  const rows = (data ?? []) as unknown as SavedServiceRow[];
  if (rows.length === 0) return [];
  // Business service pages: only an agency host, only when the plan has them. A failed
  // non-menu read fails closed (no business page; the item falls back to /book).
  let businessPagesOn = false;
  let nonMenuIds: ReadonlySet<string> = new Set();
  if (host.hostKind === "agency") {
    businessPagesOn = await businessServicePagesOn(admin, tenantId);
    if (businessPagesOn) {
      const nm = await loadNonMenuOfferingIds(admin, tenantId);
      if (nm.error) {
        logServerError("clientAccount.savedServices.nonMenu", nm.error);
        businessPagesOn = false;
      }
      nonMenuIds = nm.ids;
    }
  }
  return shapeSavedServices(rows, tenantId, locale, { ...host, businessPagesOn, nonMenuIds });
}
