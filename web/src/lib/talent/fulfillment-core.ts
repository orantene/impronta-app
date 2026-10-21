/**
 * Pure core of markBookingFulfillment, split out of fulfillment-actions.ts
 * (TUL-1708 #4355 follow-up, behavioral-test card) so it is importable from a
 * plain `node:test` run. fulfillment-actions.ts's own imports (`next/headers`
 * via the session cache, `next/cache`'s revalidatePath, `server-only` via
 * `@/lib/bookings/fulfillment` -> `@/lib/messaging/record-sync`) only resolve
 * inside Next's own bundler, not under tsx — so this module takes every such
 * collaborator as an injected dependency instead of importing it directly.
 * Only `import type` lines are allowed above the deps interface: type-only
 * imports are erased at compile time and never execute the real module.
 */
import type { FulfillmentStatus, MarkFulfillmentResult } from "@/lib/bookings/fulfillment";

export type BookingAuth =
  | { ok: true; tenantId: string | null; talentProfileId: string | null; via: "owner" | "staff" }
  | { ok: false; error: string };

export type FulfillmentInput = {
  status: FulfillmentStatus;
  carrier?: string | null;
  trackingNumber?: string | null;
  notes?: string | null;
};

/** Injectable collaborators for markBookingFulfillmentCore. */
export interface MarkFulfillmentDeps {
  isValidStatus: (status: FulfillmentStatus) => boolean;
  isHandedOff: (status: FulfillmentStatus) => boolean;
  authorize: (bookingId: string) => Promise<BookingAuth>;
  /** Wraps requireWorkspaceStaffAction({ capability: "booking.payment.request" }) + the tenant check. */
  requireHandoffCapability: (tenantId: string | null) => Promise<boolean>;
  getAdmin: () => unknown;
  upsert: (
    admin: unknown,
    bookingId: string,
    tenantId: string | null,
    patch: { status: FulfillmentStatus; carrier: string | null; trackingNumber: string | null; notes: string | null },
  ) => Promise<{ ok: boolean; shippedAt: string | null; error?: string }>;
  listSettledTransactionIds: (admin: unknown, bookingId: string) => Promise<string[]>;
  transfer: (transactionId: string) => Promise<unknown>;
  onTransferError: (err: unknown) => void;
  revalidate: (tenantId: string) => void;
}

/**
 * Core logic for markBookingFulfillment, collaborators injected for behavioral tests.
 * TUL-1708 (PM revision): on the staff path, the handed-off states release the
 * deferred payout below (transfer) — that's money in motion, manager-tier, not
 * the operate_venue (editor+) bar that admitted the staff path in general. The
 * talent owner's own path is unaffected.
 */
export async function markBookingFulfillmentCore(
  bookingId: string,
  input: FulfillmentInput,
  deps: MarkFulfillmentDeps,
): Promise<MarkFulfillmentResult> {
  if (!deps.isValidStatus(input.status)) return { ok: false, error: "Unknown status." };
  const auth = await deps.authorize(bookingId);
  if (!auth.ok) return { ok: false, error: auth.error };

  if (auth.via === "staff" && deps.isHandedOff(input.status)) {
    const allowed = await deps.requireHandoffCapability(auth.tenantId);
    if (!allowed) return { ok: false, error: "Forbidden." };
  }

  const admin = deps.getAdmin();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const res = await deps.upsert(admin, bookingId, auth.tenantId, {
    status: input.status,
    carrier: input.carrier ?? null,
    trackingNumber: input.trackingNumber ?? null,
    notes: input.notes ?? null,
  });
  if (!res.ok) return { ok: false, error: res.error ?? "Could not save." };

  const handedOff = deps.isHandedOff(input.status);
  // Release the deferred payout: re-run transfers for every settled txn on
  // this booking now that shipped_at is set. Best-effort (idempotent).
  if (handedOff && res.shippedAt) {
    const txnIds = await deps.listSettledTransactionIds(admin, bookingId);
    for (const id of txnIds) {
      try {
        await deps.transfer(id);
      } catch (err) {
        deps.onTransferError(err);
      }
    }
  }

  if (auth.tenantId) deps.revalidate(auth.tenantId);
  return { ok: true, shipped: handedOff };
}
