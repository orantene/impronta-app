import "server-only";

import { logServerError } from "@/lib/server/safe-error";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc?: (fn: string, args: Record<string, unknown>) => any;
};

export type WaitlistOfferRefusal =
  | "no_place"
  | "expired"
  | "already_accepted"
  | "conflict"
  | "not_found"
  | "wrong_tenant"
  | "unavailable"
  | "invalid";

function mapReason(reason: string | undefined): WaitlistOfferRefusal {
  if (
    reason === "no_place" ||
    reason === "expired" ||
    reason === "already_accepted" ||
    reason === "conflict" ||
    reason === "not_found" ||
    reason === "wrong_tenant" ||
    reason === "invalid"
  ) {
    return reason;
  }
  return "unavailable";
}

async function call(
  admin: Admin,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ ok: true; payload: Record<string, unknown> } | { ok: false; reason: WaitlistOfferRefusal }> {
  if (typeof admin.rpc !== "function") return { ok: false, reason: "unavailable" };
  const { data, error } = await admin.rpc(fn, args);
  if (error) {
    logServerError(`scheduling.${fn}`, error);
    return { ok: false, reason: "unavailable" };
  }
  const reply = (data ?? {}) as Record<string, unknown>;
  if (reply.ok === true) return { ok: true, payload: reply };
  return { ok: false, reason: mapReason(typeof reply.reason === "string" ? reply.reason : undefined) };
}

export async function waitlistOfferPlace(
  admin: Admin,
  input: { tenantId: string; entryId: string; operationKey: string; ttlSeconds?: number },
) {
  if (input.operationKey.trim().length < 8) return { ok: false as const, reason: "invalid" as const };
  const r = await call(admin, "waitlist_offer_place", {
    p_tenant_id: input.tenantId,
    p_entry_id: input.entryId,
    p_operation_key: input.operationKey.trim(),
    p_ttl_s: input.ttlSeconds ?? 900,
  });
  if (!r.ok) return r;
  return {
    ok: true as const,
    offerId: String(r.payload.offer_id ?? ""),
    expiresAt: String(r.payload.expires_at ?? ""),
    already: r.payload.already === true,
  };
}

export async function waitlistAcceptOffer(
  admin: Admin,
  input: { tenantId: string; offerId: string; operationKey: string },
) {
  if (input.operationKey.trim().length < 8) return { ok: false as const, reason: "invalid" as const };
  const r = await call(admin, "waitlist_accept_offer", {
    p_tenant_id: input.tenantId,
    p_offer_id: input.offerId,
    p_operation_key: input.operationKey.trim(),
  });
  if (!r.ok) return r;
  return {
    ok: true as const,
    offerId: String(r.payload.offer_id ?? input.offerId),
    already: r.payload.already === true,
  };
}

export async function waitlistDeclineOffer(
  admin: Admin,
  input: { tenantId: string; offerId: string },
) {
  const r = await call(admin, "waitlist_decline_offer", {
    p_tenant_id: input.tenantId,
    p_offer_id: input.offerId,
  });
  if (!r.ok) return r;
  return { ok: true as const, offerId: String(r.payload.offer_id ?? input.offerId) };
}

export async function reapWaitlistOffers(
  admin: Admin,
  limit = 50,
): Promise<{ ok: true; released: number } | { ok: false }> {
  if (typeof admin.rpc !== "function") return { ok: false };
  const { data, error } = await admin.rpc("reap_waitlist_offers", { p_limit: limit });
  if (error) {
    logServerError("scheduling.reapWaitlistOffers", error);
    return { ok: false };
  }
  const reply = (data ?? {}) as { ok?: boolean; released?: number };
  if (reply.ok !== true) return { ok: false };
  return { ok: true, released: Number(reply.released) || 0 };
}
