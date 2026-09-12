import "server-only";

/**
 * May an order take money with no customer row attached?
 *
 * Split out of `lib/pos/collection.ts` (L53): this reads the order's lines and
 * asks `lib/orders/identity-requirement`, the pure rule it consults, so it
 * belongs beside that rule rather than inside the till that calls it.
 */

import { logServerError } from "@/lib/server/safe-error";
import { identityVerdict, type IdentityLine } from "@/lib/orders/identity-requirement";

type Admin = {
  // Tests inject a fake PostgREST builder. Same seam as expire-orders.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

/**
 * The order's lines, with the identity demand of the offering each one sells.
 *
 * Read here rather than derived from the draft in memory because the OFFERING
 * is the authority and it can have been edited since the line was added. The
 * decision itself is `lib/orders/identity-requirement`, which is pure and
 * shared with the public purchase pipeline so the counter and the web cannot
 * answer the same question two ways.
 */
export async function identityLinesForOrder(
  admin: Admin,
  orderId: string,
): Promise<{ ok: true; lines: IdentityLine[] } | { ok: false }> {
  const { data: lineRows, error: lineErr } = await admin
    .from("order_lines")
    .select("offering_id, label, sort_order")
    .eq("order_id", orderId)
    .order("sort_order", { ascending: true });
  if (lineErr) {
    logServerError("pos.identityLinesForOrder.lines", lineErr);
    return { ok: false };
  }
  const rows = (lineRows ?? []) as Array<{
    offering_id: string | null;
    label: string | null;
    sort_order?: number | null;
  }>;
  const offeringIds = [...new Set(rows.map((r) => r.offering_id).filter((id): id is string => !!id))];
  if (offeringIds.length === 0) return { ok: true, lines: [] };

  const { data: offeringRows, error: offErr } = await admin
    .from("talent_offerings")
    .select("id, title, requires_identity, identity_reason")
    .in("id", offeringIds);
  if (offErr) {
    logServerError("pos.identityLinesForOrder.offerings", offErr);
    return { ok: false };
  }
  const byId = new Map(
    ((offeringRows ?? []) as Array<{
      id: string;
      title: string | null;
      requires_identity: boolean | null;
      identity_reason: string | null;
    }>).map((o) => [o.id, o]),
  );

  return {
    ok: true,
    lines: rows.map((r) => {
      const offering = r.offering_id ? byId.get(r.offering_id) : undefined;
      return {
        offeringId: r.offering_id ?? null,
        offeringTitle: offering?.title ?? r.label ?? null,
        requiresIdentity: offering?.requires_identity === true,
        identityReason: offering?.identity_reason ?? null,
      };
    }),
  };
}

/**
 * May this order take money without a customer row?
 *
 * `unavailable` means the READ failed. It is not a verdict about the buyer and
 * must never be reported as one, and it must never lead to a second attempt at
 * the same write.
 */
export async function anonymousSaleVerdict(
  admin: Admin,
  orderId: string,
  opts?: { attendeeName?: string | null },
): Promise<{ ok: true } | { ok: false; reason: "no_contact" | "unavailable"; error: string }> {
  const read = await identityLinesForOrder(admin, orderId);
  if (!read.ok) {
    return { ok: false, reason: "unavailable", error: "Could not check what this sale needs." };
  }
  // The counter is about to take money: `paid` is the status this answer
  // gates. A Void writes `cancelled` and never asks this question.
  const verdict = identityVerdict({ intoStatus: "paid", hasCustomer: false, lines: read.lines });
  if (verdict.ok) return { ok: true };
  // Front desk names a seat on `admissions.holder_name`. That is enough for
  // attendee_names; delivery and entitlement still need an email or a phone.
  const attendeeName = (opts?.attendeeName ?? "").trim();
  if (verdict.reason === "attendee_names" && attendeeName.length > 0) return { ok: true };
  return { ok: false, reason: "no_contact", error: verdict.message };
}
