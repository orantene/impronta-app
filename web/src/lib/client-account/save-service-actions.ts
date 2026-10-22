"use server";

/**
 * TUL-1463: save a service (heart) from a service quick view or a service page.
 *
 * The credential is the signed-in session; the tenant is the HOST's (proxy-set headers,
 * `resolveAccountTenant`), never a browser value. The flow is `runSetServiceSaved`
 * (save-service-core): the client account surface must be on for this host
 * (TUL-1692, `accountSurfaceEnabledForRequest`); a guest gets `sign_in` and NOTHING is
 * written (no anonymous rows); a client saves only a service visible on this site's tenant,
 * and on a talent site (hub or agency tenant) only the host talent's (TUL-1692). Writes and reads are
 * `client_user_id = session user`, so no client can read or change another client's saves.
 * The held table (20261231422300) missing fails closed: `unavailable` / nothing saved.
 */

import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { runSetServiceSaved, type SaveServiceAdmin, type SaveServiceResult } from "./save-service-core";
import { cleanOfferingIds, isMissingTable } from "./saved-services";
import { accountSurfaceEnabledForRequest, resolveAccountTenant } from "./tenant.server";

export type { SaveServiceResult } from "./save-service-core";

export async function setServiceSaved(input: { offeringId: string; saved: boolean }): Promise<SaveServiceResult> {
  return runSetServiceSaved(
    {
      notImpersonating: async () => (await assertNotImpersonating()).ok,
      surfaceEnabled: accountSurfaceEnabledForRequest,
      session: async () => {
        const session = await getCachedActorSession();
        return { userId: session.user?.id ?? null, appRole: session.profile?.app_role ?? null };
      },
      admin: createServiceRoleClient() as unknown as SaveServiceAdmin | null,
      tenant: resolveAccountTenant,
      logError: logServerError,
    },
    input,
  );
}

/** Which of these services the signed-in client has saved. A guest: signedIn false, nothing read. */
export async function savedServiceStatus(input: { offeringIds: string[] }): Promise<{ signedIn: boolean; saved: string[] }> {
  const ids = cleanOfferingIds(Array.isArray(input?.offeringIds) ? input.offeringIds : []);
  const session = await getCachedActorSession();
  const userId = session.user?.id ?? null;
  if (!userId) return { signedIn: false, saved: [] };
  const admin = createServiceRoleClient();
  if (!admin || ids.length === 0) return { signedIn: true, saved: [] };
  const { data, error } = await admin
    .from("client_favorite_services")
    .select("offering_id")
    .eq("client_user_id", userId)
    .in("offering_id", ids);
  if (error) {
    if (!isMissingTable(error)) logServerError("clientAccount.saveService.status", error);
    return { signedIn: true, saved: [] };
  }
  return { signedIn: true, saved: ((data ?? []) as Array<{ offering_id: string }>).map((r) => r.offering_id.toLowerCase()) };
}
