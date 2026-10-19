/**
 * D1 (TUL-1268 item 1): the ONE "can this be sold" rule.
 *
 * Pure, no I/O, safe to import from client components. Every display surface
 * (a Buy / Reservar button, a menu, a picker, a storefront) and every checkout
 * entry point asks `sellability(row, context)`, so the UI can never offer what
 * the server then refuses. Do NOT re-derive status / moderation / visibility
 * checks inline: `sellable-one-rule.static.test.ts` fails on new ones.
 *
 * Contexts:
 *  - `guest`         a logged-out visitor CHARGED for it: published + approved +
 *                    public. `on_request` is not public, so it never takes an
 *                    instant charge (it has request / quote paths only).
 *  - `client`        a signed-in client. Same rule as `guest`: signing in does
 *                    not widen what the workspace chose to publish.
 *  - `guest_request` a visitor may SEE it and ASK for it (no charge): published +
 *                    approved + (public | on_request). agency_only stays hidden.
 *  - `pos_desk`      staff at the point of sale / staff pickers: published only.
 *                    A person with workspace access is the confirmation, and an
 *                    agency_only service is exactly what the desk sells.
 *  - `reservation`   the one offering a venue configured for table bookings
 *                    (`venue_service_rules.reservation_offering_id`). It is
 *                    deliberately NOT a menu item (often `unlisted` or
 *                    agency_only), so visibility is not part of the rule, but it
 *                    must still be published AND approved. The id comes from the
 *                    owner's venue config, never from the request.
 *
 * Fails closed: a missing row, or a missing status / moderation / visibility
 * value, is a refusal.
 */

export type SellContext = "guest" | "client" | "guest_request" | "pos_desk" | "reservation";

export type SellRefusalReason =
  | "not_found"
  | "not_published"
  | "not_approved"
  | "on_request_no_charge"
  | "not_public";

export type Sellability = { ok: true } | { ok: false; reason: SellRefusalReason };

/** Accepts the DB row shape (snake_case) or the TalentOffering shape (camelCase). */
export type SellableRow = {
  status?: unknown;
  moderation_state?: unknown;
  moderationState?: unknown;
  visibility?: unknown;
};

export function sellability(row: SellableRow | null | undefined, context: SellContext): Sellability {
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status !== "published") return { ok: false, reason: "not_published" };
  if (context === "pos_desk") return { ok: true };

  const moderation = row.moderation_state ?? row.moderationState;
  if (moderation !== "approved") return { ok: false, reason: "not_approved" };
  if (context === "reservation") return { ok: true };

  const visibility = row.visibility;
  if (visibility === "public") return { ok: true };
  if (visibility === "on_request") {
    return context === "guest_request" ? { ok: true } : { ok: false, reason: "on_request_no_charge" };
  }
  return { ok: false, reason: "not_public" };
}

export function isSellable(row: SellableRow | null | undefined, context: SellContext): boolean {
  return sellability(row, context).ok;
}

type FilterChain = {
  eq(column: string, value: unknown): FilterChain;
  in(column: string, values: readonly unknown[]): FilterChain;
};

/**
 * The same rule as a query filter, for list reads (`talent_offerings`). Tenant
 * scoping stays the caller's own `.eq("tenant_id", ...)`. `reservation` cannot
 * be a list scope: it is a single configured id.
 */
export function scopeToSellableOfferings<Q>(query: Q, context: Exclude<SellContext, "reservation">): Q {
  const q = query as unknown as FilterChain;
  if (context === "pos_desk") return q.eq("status", "published") as unknown as Q;
  const base = q.eq("status", "published").eq("moderation_state", "approved");
  if (context === "guest_request") return base.in("visibility", ["public", "on_request"]) as unknown as Q;
  return base.eq("visibility", "public") as unknown as Q;
}
