/**
 * An in-memory `pos_reserve_collection` / `pos_settle_collection_reservation` /
 * `reap_collection_reservations` over the same fake store the POS tests already
 * use.
 *
 * WHY IT LIVES IN ONE PLACE. Three test files drive `startCollection`, and the
 * reservation is no longer optional for any of them: a collection that cannot
 * reach the RPC is refused rather than collecting unguarded. Three private
 * copies of this logic would be three chances for a test to assert against a
 * model that no longer matches the migration.
 *
 * IT IS A MODEL, NOT THE THING. It reproduces the DECISIONS of
 * 20261230002310 (replay before the state check, paid widened to the payout
 * states, uncollected before reservations so `already_collected` and
 * `exceeds_outstanding` stay different answers) and none of the concurrency:
 * the real guarantee is `SELECT ... FOR UPDATE`, and only the database can
 * demonstrate that. The isolated-branch SQL proof in the migration is what
 * covers the part this cannot.
 */

export type FakeRow = Record<string, unknown>;

export type ReservationCapableStore = {
  orders: FakeRow[];
  booking_transactions: FakeRow[];
  order_collection_reservations: FakeRow[];
};

export type FakeRpcReply = { data: unknown; error: { message: string } | null };

/** Statuses that count as money already in hand, matching the migration. */
const PAID_STATUSES = new Set(["paid", "payout_pending", "payout_sent", "payout"]);

const OPEN_STATUSES = new Set(["draft", "pending_payment"]);

function cents(raw: unknown): number {
  const n = Number(raw ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function reservationsOf(store: ReservationCapableStore): FakeRow[] {
  if (!Array.isArray(store.order_collection_reservations)) {
    store.order_collection_reservations = [];
  }
  return store.order_collection_reservations;
}

function paidCents(store: ReservationCapableStore, orderId: string): number {
  return (store.booking_transactions ?? [])
    .filter(
      (t) =>
        t.order_id === orderId
        && !t.refund_of_transaction_id
        && PAID_STATUSES.has(String(t.status ?? "")),
    )
    .reduce((sum, t) => sum + cents(t.gross_amount_cents), 0);
}

function liveReservedCents(store: ReservationCapableStore, orderId: string, now: number): number {
  return reservationsOf(store)
    .filter(
      (r) =>
        r.order_id === orderId
        && r.state === "reserved"
        && Date.parse(String(r.expires_at)) > now,
    )
    .reduce((sum, r) => sum + cents(r.amount_cents), 0);
}

function refuse(reason: string, outstanding?: number): FakeRpcReply {
  return {
    data:
      outstanding === undefined
        ? { ok: false, reason }
        : { ok: false, reason, outstanding_cents: outstanding },
    error: null,
  };
}

/**
 * Build the `rpc` half of a fake admin.
 *
 * Anything it does not model comes back as an error rather than a silent
 * `{ok: false}`: a test that reaches an unmodelled RPC should say so loudly
 * instead of quietly exercising a refusal branch.
 */
export function makeCollectionRpc(store: ReservationCapableStore) {
  return async (fn: string, args: Record<string, unknown>): Promise<FakeRpcReply> => {
    if (fn === "pos_reserve_collection") {
      const orderId = String(args.p_order_id ?? "");
      const key = String(args.p_operation_key ?? "").trim();
      const order = (store.orders ?? []).find((o) => o.id === orderId);
      if (!key) return refuse("bad_input");
      if (!order) return refuse("not_found");
      if (order.tenant_id !== args.p_tenant_id) return refuse("wrong_tenant");

      const now = Date.now();
      const rows = reservationsOf(store);
      const existing = rows.find((r) => r.order_id === orderId && r.operation_key === key);
      const total = cents(order.total_cents);

      if (existing) {
        const outstanding = total - paidCents(store, orderId) - liveReservedCents(store, orderId, now);
        return {
          data: {
            ok: true,
            already: true,
            reservation_id: existing.id,
            state: existing.state,
            transaction_id: existing.transaction_id ?? null,
            amount_cents: cents(existing.amount_cents),
            outstanding_cents: Math.max(0, outstanding),
            version: cents(order.version),
          },
          error: null,
        };
      }

      if (!OPEN_STATUSES.has(String(order.status ?? ""))) return refuse("not_open");
      if (args.p_expected_version != null && cents(order.version) !== Number(args.p_expected_version)) {
        return refuse("conflict");
      }

      const uncollected = total - paidCents(store, orderId);
      if (uncollected <= 0) return refuse("already_collected", 0);

      const outstanding = uncollected - liveReservedCents(store, orderId, now);
      const asked = args.p_amount_cents == null ? null : Number(args.p_amount_cents);
      if (asked != null && asked <= 0) return refuse("amount", Math.max(0, outstanding));
      const amount = asked ?? outstanding;
      if (outstanding <= 0 || amount > outstanding) {
        return refuse("exceeds_outstanding", Math.max(0, outstanding));
      }

      const ttl = Number(args.p_ttl_seconds ?? 900);
      const row: FakeRow = {
        id: crypto.randomUUID(),
        tenant_id: args.p_tenant_id,
        order_id: orderId,
        operation_key: key,
        amount_cents: amount,
        method: args.p_method,
        state: "reserved",
        transaction_id: null,
        expires_at: new Date(now + ttl * 1000).toISOString(),
        created_by: args.p_actor_id ?? null,
        created_at: new Date(now).toISOString(),
        settled_at: null,
      };
      rows.push(row);
      order.version = cents(order.version) + 1;

      return {
        data: {
          ok: true,
          already: false,
          reservation_id: row.id,
          state: "reserved",
          transaction_id: null,
          amount_cents: amount,
          outstanding_cents: outstanding - amount,
          expires_at: row.expires_at,
          version: order.version,
        },
        error: null,
      };
    }

    if (fn === "pos_settle_collection_reservation") {
      const id = String(args.p_reservation_id ?? "");
      const state = String(args.p_state ?? "");
      if (state !== "settled" && state !== "released") return refuse("bad_input");
      const row = reservationsOf(store).find((r) => r.id === id);
      if (!row) return refuse("not_found");
      if (row.state === "reserved") {
        row.state = state;
        row.transaction_id = args.p_transaction_id ?? row.transaction_id ?? null;
        row.settled_at = new Date().toISOString();
        return { data: { ok: true, already: false, reservation_id: id, state }, error: null };
      }
      if (row.state === state) {
        return { data: { ok: true, already: true, reservation_id: id, state }, error: null };
      }
      return { data: { ok: false, reason: "not_reserved", state: row.state }, error: null };
    }

    if (fn === "reap_collection_reservations") {
      const now = Date.now();
      const doomed = reservationsOf(store).filter(
        (r) => r.state === "reserved" && Date.parse(String(r.expires_at)) <= now,
      );
      for (const r of doomed) {
        r.state = "released";
        r.settled_at = new Date(now).toISOString();
      }
      return {
        data: { ok: true, released: doomed.length, ids: doomed.map((r) => r.id) },
        error: null,
      };
    }

    return { data: null, error: { message: `fake admin has no rpc ${fn}` } };
  };
}
