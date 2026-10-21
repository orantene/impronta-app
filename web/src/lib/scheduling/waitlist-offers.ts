import "server-only";

import { logServerError } from "@/lib/server/safe-error";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc?: (fn: string, args: Record<string, unknown>) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from?: (table: string) => any;
};

export type WaitlistOfferRefusal =
  | "no_place"
  | "expired"
  | "already_accepted"
  | "conflict"
  | "not_found"
  | "wrong_tenant"
  | "unavailable"
  | "invalid"
  /** The class is paid: the seat cannot be committed before payment is taken (P1 release gate). */
  | "payment_required";

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

/**
 * Is the offered place FREE? `waitlist_accept_offer` commits the held seat
 * and marks the entry accepted with no order and no payment, which is only
 * right when nothing is owed. FREE means a definite 0: the offering's base
 * price is exactly 0 and no tier/variant is priced. Anything else is paid.
 * Every unreadable step is `unavailable`: never commit on a guess.
 * `rpc` means there is nothing to price here (no such offer, already taken,
 * no session or no offering); the RPC's own answer stands, as before.
 */
async function offeredPlacePrice(
  admin: Admin,
  input: { tenantId: string; offerId: string },
): Promise<"free" | "paid" | "rpc" | "unavailable"> {
  if (typeof admin.from !== "function") return "unavailable";
  const read = async (table: string, cols: string, id: string, tenantScoped: boolean) => {
    let q = admin.from!(table).select(cols).eq("id", id);
    if (tenantScoped) q = q.eq("tenant_id", input.tenantId);
    const { data, error } = await q.maybeSingle();
    if (error) logServerError(`scheduling.waitlistAcceptOffer/${table}`, error);
    return { data: (data ?? null) as Record<string, unknown> | null, failed: Boolean(error) };
  };

  const offer = await read("waitlist_offers", "id, waitlist_entry_id, accepted_at", input.offerId, true);
  if (offer.failed) return "unavailable";
  if (!offer.data || offer.data.accepted_at) return "rpc";
  const entry = await read("session_waitlist_entries", "id, session_id", String(offer.data.waitlist_entry_id ?? ""), true);
  if (entry.failed) return "unavailable";
  if (!entry.data) return "rpc";
  const session = await read("sessions", "id, offering_id", String(entry.data.session_id ?? ""), true);
  if (session.failed) return "unavailable";
  if (!session.data || !session.data.offering_id) return "rpc";
  const offeringId = String(session.data.offering_id);
  const offering = await read("talent_offerings", "id, amount_cents", offeringId, false);
  if (offering.failed) return "unavailable";
  if (!offering.data) return "paid";

  const { data: tiers, error: tierErr } = await admin.from("talent_offering_variants").select("id, amount_cents").eq("offering_id", offeringId);
  if (tierErr) {
    logServerError("scheduling.waitlistAcceptOffer/talent_offering_variants", tierErr);
    return "unavailable";
  }
  const pricedTier = ((tiers ?? []) as Array<{ amount_cents?: number | null }>).some(
    (t) => typeof t.amount_cents === "number" && t.amount_cents > 0,
  );
  return offering.data.amount_cents === 0 && !pricedTier ? "free" : "paid";
}

export async function waitlistAcceptOffer(
  admin: Admin,
  input: { tenantId: string; offerId: string; operationKey: string },
) {
  if (input.operationKey.trim().length < 8) return { ok: false as const, reason: "invalid" as const };
  // P1 release gate: "They took it" on a PAID class would commit a seat nobody
  // paid for. Refused until payment is taken; free classes are unchanged.
  const price = await offeredPlacePrice(admin, input);
  if (price === "unavailable") return { ok: false as const, reason: "unavailable" as const };
  if (price === "paid") return { ok: false as const, reason: "payment_required" as const };
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
