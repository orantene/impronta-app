import "server-only";

/**
 * Replay ONE queued offline cash sale (D-POS-11, D-122; audit A4).
 *
 * WHY THREE STEPS AND NOT ONE RPC. The live cash tender is
 * `startCollection` → `settleAtDoor`: it names the buyer, holds capacity,
 * redeems the promo, inserts the `booking_transactions` row, walks it to
 * `paid`, fires `onOrderPaid` (admissions mint), and binds the reservation.
 * Re-writing that in SQL would be a second money path that drifts from the
 * first. So the RPC does the part that must be atomic per device — lock the
 * device, check the operation key, refuse anything naming a provider, and
 * RESERVE the balance under the outbox key — and this module then runs the
 * SAME TypeScript tender the till runs online. `pos_reserve_collection`
 * answers `already` for the key the RPC reserved, so nothing is claimed
 * twice. Last, `pos_outbox_settle` stamps `applied_at`, and it refuses unless
 * SQL itself sees the reservation `settled`.
 *
 * A retry of the same key at any point resumes rather than repeats: the RPC
 * reports `stage`, `startCollection` finds its own paid row, and the stamp
 * is idempotent.
 */

import { logServerError } from "@/lib/server/safe-error";
import { posOutboxApply, posOutboxSettle, type DeviceReason } from "@/lib/venues/pos-devices";
import type { VenueAdmin } from "@/lib/venues/locations";
import { startCollection, type StartCollectionDeps, type StartCollectionResult } from "./collection";
import type { CashCollectCommand } from "./cash-outbox";

export type ReplayRefusal = DeviceReason | "not_settled" | "not_open" | "already_collected";

export type ReplayResult =
  | { ok: true; outboxId: string; orderId: string; transactionId: string | null; already: boolean }
  | { ok: false; reason: ReplayRefusal };

export type ReplayDeps = {
  /** Test seam. Defaults to the live cash tender. */
  collect?: typeof startCollection;
} & Pick<StartCollectionDeps, "onOrderPaid" | "ensureCustomer">;

/** The only shape the RPC honours. Anything else is refused before the socket. */
export function parseCashCollectCommand(raw: unknown): CashCollectCommand | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (c.kind !== "cash_collect") return null;
  if (c.method !== undefined && c.method !== "cash") return null;
  if ("provider" in c || "payment_intent" in c || "checkout_session" in c) return null;
  const orderId = c.order_id;
  const amount = typeof c.amount_cents === "number" ? Math.trunc(c.amount_cents) : NaN;
  if (typeof orderId !== "string" || !/^[0-9a-f-]{36}$/i.test(orderId)) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { kind: "cash_collect", method: "cash", order_id: orderId, amount_cents: amount };
}

function collectRefusal(r: Extract<StartCollectionResult, { ok: false }>): ReplayRefusal {
  switch (r.reason) {
    case "not_found":
    case "wrong_tenant":
    case "conflict":
      return r.reason;
    case "not_draft":
      return "not_open";
    default:
      return "unavailable";
  }
}

export async function replayCashOutboxItem(
  admin: VenueAdmin,
  input: {
    tenantId: string;
    deviceId: string;
    actorUserId: string;
    operationKey: string;
    command: unknown;
  },
  deps: ReplayDeps = {},
): Promise<ReplayResult> {
  const command = parseCashCollectCommand(input.command);
  if (!command) return { ok: false, reason: "invalid" };

  // 1. Reserve under the outbox key (or learn where a previous replay got to).
  const applied = await posOutboxApply(admin, {
    tenantId: input.tenantId,
    deviceId: input.deviceId,
    operationKey: input.operationKey,
    command,
  });
  if (!applied.ok) return { ok: false, reason: applied.reason };
  if (applied.stage === "settled") {
    return { ok: true, outboxId: applied.id, orderId: command.order_id, transactionId: null, already: true };
  }

  // 2. The live cash tender, under the same key. `pos_reserve_collection`
  //    answers `already` for the claim the RPC just took.
  const collect = deps.collect ?? startCollection;
  const collected = await collect(
    admin as never,
    {
      tenantId: input.tenantId,
      orderId: command.order_id,
      actorUserId: input.actorUserId,
      method: "cash",
      amountCents: command.amount_cents,
      tenderedCents: command.amount_cents,
      idempotencyKey: input.operationKey,
      successUrl: "",
      cancelUrl: "",
    },
    { onOrderPaid: deps.onOrderPaid, ensureCustomer: deps.ensureCustomer },
  );
  if (!collected.ok) {
    logServerError(
      "pos.outboxReplay",
      `outbox ${applied.id}: the cash tender refused ${collected.reason} (${collected.error})`,
    );
    return { ok: false, reason: collectRefusal(collected) };
  }
  if (collected.method !== "cash") return { ok: false, reason: "unavailable" };

  // 3. Stamp applied — only if SQL agrees the claim settled.
  const stamped = await posOutboxSettle(admin, { tenantId: input.tenantId, id: applied.id });
  if (!stamped.ok) return { ok: false, reason: stamped.reason };
  return {
    ok: true,
    outboxId: applied.id,
    orderId: collected.orderId,
    transactionId: stamped.transactionId ?? collected.transactionId,
    already: collected.alreadySettled,
  };
}
