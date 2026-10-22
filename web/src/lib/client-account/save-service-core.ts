/**
 * TUL-1463 / TUL-1692: the save-a-service flow behind the `setServiceSaved` server action,
 * with its I/O passed in so it is testable without a request.
 *
 * Order: not impersonating, valid input, the client account surface ON for this host
 * (`accountSurfaceEnabledForRequest`, like every other client account action), a signed-in
 * client. Removing touches only this client's own row. Saving reads the offering and asks the
 * pure `decideServiceSave`: visible on this host's tenant and, on a talent site (hub or agency
 * tenant), owned by the HOST talent. The held table missing fails closed.
 */
import { z } from "zod";

import { isClientAccountEligible } from "./pure";
import { decideServiceSave, isMissingTable, type SaveableOffering, type ServiceSaveRefusal } from "./saved-services";

export type SaveServiceResult = { ok: true; saved: boolean } | { ok: false; reason: ServiceSaveRefusal | "invalid" | "unavailable" | "not_client" };

type DbError = { code?: string | null } | null;
type DbReply = { data: unknown; error: DbError };
type FavoriteQuery = PromiseLike<DbReply> & { eq: (column: string, value: string) => FavoriteQuery };
type OfferingQuery = { eq: (column: string, value: string) => { maybeSingle: () => PromiseLike<DbReply> } };

/** The slice of the service-role client this flow uses. */
export type SaveServiceAdmin = {
  from(table: "client_favorite_services"): {
    delete: () => FavoriteQuery;
    upsert: (row: { client_user_id: string; offering_id: string; tenant_id: string }, opts: { onConflict: string; ignoreDuplicates: boolean }) => PromiseLike<DbReply>;
  };
  from(table: "talent_offerings"): { select: (columns: string) => OfferingQuery };
};

export type SaveServiceDeps = {
  notImpersonating: () => Promise<boolean>;
  surfaceEnabled: () => Promise<boolean>;
  session: () => Promise<{ userId: string | null; appRole: string | null }>;
  admin: SaveServiceAdmin | null;
  /** The host's tenant; `hubTalentProfileId` is set on every talent site (hub or agency tenant). */
  tenant: () => Promise<{ tenantId: string; hubTalentProfileId?: string | null } | null>;
  logError: (where: string, error: unknown) => void;
};

const Input = z.object({ offeringId: z.string().uuid(), saved: z.boolean() });

export async function runSetServiceSaved(deps: SaveServiceDeps, input: { offeringId: string; saved: boolean }): Promise<SaveServiceResult> {
  if (!(await deps.notImpersonating())) return { ok: false, reason: "unavailable" };
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  // TUL-1692: the surface off for this host means the action does not exist either.
  if (!(await deps.surfaceEnabled())) return { ok: false, reason: "unavailable" };
  const session = await deps.session();
  const userId = session.userId;
  if (!userId) return { ok: false, reason: "sign_in" };
  if (!isClientAccountEligible(session.appRole)) return { ok: false, reason: "not_client" };
  const admin = deps.admin;
  if (!admin) return { ok: false, reason: "unavailable" };

  if (!parsed.data.saved) {
    // Removing touches only this client's own row; nothing to authorize beyond the session.
    const { error } = await admin
      .from("client_favorite_services")
      .delete()
      .eq("client_user_id", userId)
      .eq("offering_id", parsed.data.offeringId);
    if (error) {
      if (!isMissingTable(error)) deps.logError("clientAccount.saveService.delete", error);
      return { ok: false, reason: "unavailable" };
    }
    return { ok: true, saved: false };
  }

  const tenant = await deps.tenant();
  if (!tenant) return { ok: false, reason: "unavailable" };
  const { data, error: offErr } = await admin
    .from("talent_offerings")
    .select("id, tenant_id, talent_profile_id, status, moderation_state, visibility")
    .eq("id", parsed.data.offeringId)
    .maybeSingle();
  if (offErr) {
    deps.logError("clientAccount.saveService.offering", offErr);
    return { ok: false, reason: "unavailable" };
  }
  const decision = decideServiceSave({
    sessionUserId: userId,
    siteTenantId: tenant.tenantId,
    hubTalentProfileId: tenant.hubTalentProfileId ?? null,
    offering: data as SaveableOffering | null,
  });
  if (!decision.ok) return decision;
  const { error } = await admin
    .from("client_favorite_services")
    .upsert(
      { client_user_id: userId, offering_id: parsed.data.offeringId, tenant_id: decision.tenantId },
      { onConflict: "client_user_id,offering_id", ignoreDuplicates: true },
    );
  if (error) {
    if (!isMissingTable(error)) deps.logError("clientAccount.saveService.insert", error);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, saved: true };
}
