"use server";

/**
 * TUL-1463: save a service (heart) from a service quick view or a service page.
 *
 * The credential is the signed-in session; the tenant is the HOST's (proxy-set headers,
 * `resolveAccountTenant`), never a browser value. The decision is the pure
 * `decideServiceSave`: a guest gets `sign_in` and NOTHING is written (no anonymous rows);
 * a client saves only a service visible on this site's tenant. Writes and reads are
 * `client_user_id = session user`, so no client can read or change another client's saves.
 * The held table (20261231422300) missing fails closed: `unavailable` / nothing saved.
 */

import { z } from "zod";

import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { isClientAccountEligible } from "./pure";
import { cleanOfferingIds, decideServiceSave, isMissingTable, type SaveableOffering, type ServiceSaveRefusal } from "./saved-services";
import { resolveAccountTenant } from "./tenant.server";

export type SaveServiceResult = { ok: true; saved: boolean } | { ok: false; reason: ServiceSaveRefusal | "invalid" | "unavailable" | "not_client" };

export async function setServiceSaved(input: { offeringId: string; saved: boolean }): Promise<SaveServiceResult> {
  if (!(await assertNotImpersonating()).ok) return { ok: false, reason: "unavailable" };
  const parsed = z.object({ offeringId: z.string().uuid(), saved: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const session = await getCachedActorSession();
  const userId = session.user?.id ?? null;
  if (!userId) return { ok: false, reason: "sign_in" };
  if (!isClientAccountEligible(session.profile?.app_role ?? null)) return { ok: false, reason: "not_client" };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };

  if (!parsed.data.saved) {
    // Removing touches only this client's own row; nothing to authorize beyond the session.
    const { error } = await admin
      .from("client_favorite_services")
      .delete()
      .eq("client_user_id", userId)
      .eq("offering_id", parsed.data.offeringId);
    if (error) {
      if (!isMissingTable(error)) logServerError("clientAccount.saveService.delete", error);
      return { ok: false, reason: "unavailable" };
    }
    return { ok: true, saved: false };
  }

  const tenant = await resolveAccountTenant();
  if (!tenant) return { ok: false, reason: "unavailable" };
  const { data, error: offErr } = await admin
    .from("talent_offerings")
    .select("id, tenant_id, status, moderation_state, visibility")
    .eq("id", parsed.data.offeringId)
    .maybeSingle();
  if (offErr) {
    logServerError("clientAccount.saveService.offering", offErr);
    return { ok: false, reason: "unavailable" };
  }
  const decision = decideServiceSave({ sessionUserId: userId, siteTenantId: tenant.tenantId, offering: data as SaveableOffering | null });
  if (!decision.ok) return decision;
  const { error } = await admin
    .from("client_favorite_services")
    .upsert(
      { client_user_id: userId, offering_id: parsed.data.offeringId, tenant_id: decision.tenantId },
      { onConflict: "client_user_id,offering_id", ignoreDuplicates: true },
    );
  if (error) {
    if (!isMissingTable(error)) logServerError("clientAccount.saveService.insert", error);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, saved: true };
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
