/**
 * T1-03 proof: a card collection cannot be double-taken, and a genuine split
 * across two tenders still can.
 *
 * WHY THIS EXISTS AS A SCRIPT rather than only as a unit test. The defect it
 * chases is a race between a 900 second claim, an every-minute reaper, and a
 * hosted checkout session that lives for hours. None of those three are in the
 * TypeScript: the claim and the reaper are SQL functions and the refusal is a
 * trigger, so a fake store proves nothing about any of them. This walks the
 * real objects on the isolated `qa-journeys` branch.
 *
 *   JOURNEYS_ISOLATED=1 node --env-file=.env.capacity-isolated.local \
 *     scripts/prove-collection-double-take.mjs
 *
 * Exit codes: 0 every case held, 1 a case failed, 2 refused (wrong target).
 *
 * Cases:
 *   A  THE REVIEWER'S INTERLEAVING. 5000 cent order on the card rail: till A
 *      reserves and opens a checkout session, the reaper releases the lapsed
 *      claim, till B reserves the whole balance again and collects it in cash,
 *      then till A's still-live session completes. The second money row must be
 *      REFUSED, and the order must end on 5000 collected, not 10000.
 *   B  A GENUINE SPLIT. 5000 cent order paid 2000 + 3000 across two tenders.
 *      Both must land. This is the case the relaxed index exists for, and a
 *      guard that breaks it has traded one defect for another.
 *   C  THE CLAIM OUTLIVES THE SESSION. A card reservation's TTL must be at
 *      least the Stripe Checkout floor, so the reaper cannot free a balance
 *      whose session can still be paid.
 *   D  THE SECOND ROUTE. `recordVerifiedCollection`-shaped settlement (no
 *      reservation at all, a caller-supplied amount) is refused once the order
 *      is collected in full.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertIsolatedJourneysTarget } from "./isolated-target-guard.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * READ FROM THE SHIPPED SOURCE, never retyped here.
 *
 * A TTL typed into the proof would prove the proof, not the product: the
 * number the till actually sends is the one that decides whether the reaper
 * can free a balance under a live session.
 */
function ttlFromSource(name) {
  const src = readFileSync(join(HERE, "..", "src/lib/pos/collection-reservations.ts"), "utf8");
  const direct = new RegExp(`export const ${name} = (\\d+);`).exec(src);
  if (direct) return Number(direct[1]);
  const derived = new RegExp(`export const ${name} = ([A-Z_]+) \\+ (\\d+);`).exec(src);
  if (derived) return ttlFromSource(derived[1]) + Number(derived[2]);
  throw new Error(`${name} is not declared in collection-reservations.ts in a shape this proof can read`);
}

/** Stripe Checkout refuses an `expires_at` less than 30 minutes out. */
const STRIPE_CHECKOUT_MIN_TTL_SECONDS = ttlFromSource("STRIPE_CHECKOUT_MIN_TTL_SECONDS");
/** What `startCollection` actually asks for on the card rail. */
const CARD_TTL_SECONDS = ttlFromSource("CARD_RESERVATION_TTL_SECONDS");

assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[prove] DATABASE_URL is not set; refusing.");
  process.exit(2);
}

const failures = [];
const lines = [];

function say(text) {
  lines.push(text);
  console.log(text);
}

function check(name, held, detail) {
  say(`${held ? "  PASS" : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!held) failures.push(name);
}

/** Run a statement that is expected to raise, and report the SQLSTATE + message. */
async function expectRefusal(client, sql, params) {
  await client.query("SAVEPOINT attempt");
  try {
    await client.query(sql, params);
    await client.query("RELEASE SAVEPOINT attempt");
    return { refused: false };
  } catch (err) {
    await client.query("ROLLBACK TO SAVEPOINT attempt");
    await client.query("RELEASE SAVEPOINT attempt");
    return { refused: true, code: err.code, message: String(err.message).split("\n")[0] };
  }
}

/**
 * Through `order_collected_cents`, not a copy of its query.
 *
 * A proof that reimplements the sum proves the reimplementation. This is the
 * same function the reservation RPC and the overcollection guard both read, so
 * if it ever counted the wrong set of statuses the proof would be wrong in the
 * same direction as the product, which is the only way it stays honest.
 */
async function collectedCents(client, orderId) {
  const { rows } = await client.query(
    `select public.order_collected_cents($1) as cents`,
    [orderId],
  );
  return Number(rows[0].cents);
}

/** A tenant + a 5000 cent draft order + the order's one booking shell. */
async function stage(client, totalCents, label) {
  const { rows: tenantRows } = await client.query(
    `insert into public.agencies (slug, display_name)
     values ('t1-03-prove-' || substr(gen_random_uuid()::text, 1, 12), $1)
     returning id`,
    [label],
  );
  const tenantId = tenantRows[0].id;
  const { rows: orderRows } = await client.query(
    `insert into public.orders (
       tenant_id, status, currency, subtotal_cents, discount_cents, tax_cents,
       total_cents, source_channel, guest_session_id, receipt_code
     ) values ($1, 'draft', 'USD', $2, 0, 0, $2, 'pos', 't1-03-prove-guest',
               'T103' || upper(replace(gen_random_uuid()::text, '-', '')))
     returning id, version`,
    [tenantId, totalCents],
  );
  const { rows: shellRows } = await client.query(
    `insert into public.agency_bookings (
       tenant_id, tenant_id_snapshot, order_id, title, status, currency_code, total_client_revenue
     ) values ($1, $1, $2, $3, 'confirmed', 'USD', $4)
     returning id`,
    [tenantId, orderRows[0].id, `${label} shell`, totalCents / 100],
  );
  // A payout destination for the workspace. `validate_booking_transaction_scope`
  // resolves `payout_receiver_id` against this table, and the rail-aware clause
  // in `validate_booking_transaction_status_transition` refuses to move a
  // non-manual (card) row past draft without one. A live Connect workspace has
  // one; the card rail cannot be walked at all without it.
  const { rows: payoutRows } = await client.query(
    `insert into public.payout_accounts (tenant_id, owner_type, owner_id, display_name, provider, status)
     values ($1, 'agency', $1, $2, 'stripe', 'connected')
     returning id`,
    [tenantId, `${label} payout`],
  );
  return {
    tenantId,
    orderId: orderRows[0].id,
    bookingId: shellRows[0].id,
    payoutAccountId: payoutRows[0].id,
  };
}

async function teardown(client, tenantId) {
  // Best effort. A case that blew up leaves the transaction aborted, and a
  // teardown that raises there would REPLACE the error that matters with
  // "current transaction is aborted" and hide the real one.
  try {
    await client.query("SAVEPOINT teardown");
  } catch {
    return;
  }
  await client.query(
    `delete from public.order_collection_reservations
      where order_id in (select id from public.orders where tenant_id = $1)`,
    [tenantId],
  );
  await client.query(
    `delete from public.booking_transactions
      where booking_id in (select id from public.agency_bookings where tenant_id = $1)`,
    [tenantId],
  );
  await client.query(`delete from public.agency_bookings where tenant_id = $1`, [tenantId]);
  await client.query(`delete from public.payout_accounts where tenant_id = $1`, [tenantId]);
  await client.query(`delete from public.orders where tenant_id = $1`, [tenantId]);
  await client.query(`delete from public.agencies where id = $1`, [tenantId]);
  await client.query("RELEASE SAVEPOINT teardown");
}

/** Open a card collection exactly as `startCollection` does: claim, then row, then session. */
async function openCardCollection(client, ctx, operationKey, amountCents) {
  const { rows } = await client.query(
    `select public.pos_reserve_collection($1, $2, $3, $4, 'online_card', null, null, $5) as reply`,
    [ctx.tenantId, ctx.orderId, operationKey, amountCents, CARD_TTL_SECONDS],
  );
  const claim = rows[0].reply;
  if (claim.ok !== true) return { claim, transactionId: null };
  // `payout_receiver_id` is set because `validate_booking_transaction_status_transition`
  // refuses to move a NON-manual row past draft without one (the rail-aware
  // clause restored by 20261230001500). A live Connect workspace has one; the
  // proof supplies it so the card row can walk the real status graph.
  const { rows: txnRows } = await client.query(
    `insert into public.booking_transactions (
       booking_id, order_id, source_tenant_id, gross_amount_cents, platform_fee_cents,
       net_amount_cents, currency, provider, status, checkout_type,
       payout_receiver_id, payout_receiver_kind, payout_receiver_display_name, metadata
     ) values ($1, $2, $3, $4, 0, $4, 'USD', 'stripe', 'draft', 'full',
               $6, 'agency', 'T1-03 proof payout',
               jsonb_build_object('collection_reservation_id', $5::text))
     returning id`,
    [ctx.bookingId, ctx.orderId, ctx.tenantId, amountCents, claim.reservation_id, ctx.payoutAccountId],
  );
  const transactionId = txnRows[0].id;
  // The checkout session is now open at Stripe; the row records that.
  await client.query(
    `update public.booking_transactions set status = 'payment_requested' where id = $1`,
    [transactionId],
  );
  await client.query(
    `update public.orders set status = 'pending_payment' where id = $1 and status in ('draft','pending_payment')`,
    [ctx.orderId],
  );
  return { claim, transactionId };
}

/** Record a cash tender the way `settleAtDoor` does: draft, requested, paid. */
async function collectCash(client, ctx, reference, amountCents) {
  const { rows } = await client.query(
    `insert into public.booking_transactions (
       booking_id, order_id, source_tenant_id, gross_amount_cents, platform_fee_cents,
       net_amount_cents, currency, provider, provider_reference, status
     ) values ($1, $2, $3, $4, 0, $4, 'USD', 'manual', $5, 'draft')
     returning id`,
    [ctx.bookingId, ctx.orderId, ctx.tenantId, amountCents, reference],
  );
  const id = rows[0].id;
  await client.query(`update public.booking_transactions set status = 'payment_requested' where id = $1`, [id]);
  const landed = await expectRefusal(
    client,
    `update public.booking_transactions set status = 'paid' where id = $1`,
    [id],
  );
  return { transactionId: id, paid: !landed.refused, refusal: landed };
}

async function caseA(client) {
  say("");
  say("CASE A — the reviewer's interleaving on the card rail (5000 cent order)");
  const ctx = await stage(client, 5000, "T1-03 case A");
  try {
    const first = await openCardCollection(client, ctx, "till-a:card", 5000);
    check("till A claims the whole balance and opens a checkout session",
      first.claim.ok === true && first.transactionId !== null,
      `claim ${JSON.stringify(first.claim.ok === true ? { amount_cents: first.claim.amount_cents, outstanding_cents: first.claim.outstanding_cents } : first.claim)}`);

    // The 900 second fuse burns down while the customer is still on the Stripe page.
    await client.query(
      `update public.order_collection_reservations set expires_at = now() - interval '1 second'
        where order_id = $1 and state = 'reserved'`,
      [ctx.orderId],
    );
    const { rows: reaped } = await client.query(`select public.reap_collection_reservations(200) as reply`);
    const releasedHere = await client.query(
      `select count(*)::int as n from public.order_collection_reservations
        where order_id = $1 and state = 'released'`,
      [ctx.orderId],
    );
    say(`  reaper released ${releasedHere.rows[0].n} claim(s) on this order (sweep total ${reaped[0].reply.released})`);

    const { rows: secondRows } = await client.query(
      `select public.pos_reserve_collection($1, $2, 'till-b:cash', 5000, 'cash', null, null, 900) as reply`,
      [ctx.tenantId, ctx.orderId],
    );
    const second = secondRows[0].reply;
    say(`  till B reserve → ${JSON.stringify(second)}`);

    let tillBPaid = false;
    if (second.ok === true) {
      const cash = await collectCash(client, ctx, "till-b:cash", 5000);
      tillBPaid = cash.paid;
      say(`  till B cash → ${cash.paid ? "paid" : `refused (${cash.refusal.code}) ${cash.refusal.message}`}`);
    }

    // Till A's customer finally presses Pay on the session that never expired.
    const landed = await expectRefusal(
      client,
      `update public.booking_transactions set status = 'paid' where id = $1`,
      [first.transactionId],
    );
    say(`  till A's checkout completes → ${landed.refused ? `REFUSED (${landed.code}) ${landed.message}` : "paid"}`);

    const cents = await collectedCents(client, ctx.orderId);
    check("the order collected exactly its total, not twice", cents === 5000, `collected ${cents} on a 5000 cent order`);
    check("only one of the two tills got its money row to paid",
      !(tillBPaid && !landed.refused),
      `till B paid=${tillBPaid}, till A paid=${!landed.refused}`);
    return cents;
  } finally {
    await teardown(client, ctx.tenantId);
  }
}

async function caseB(client) {
  say("");
  say("CASE B — a genuine split across two tenders on one 5000 cent order");
  const ctx = await stage(client, 5000, "T1-03 case B");
  try {
    const { rows: r1 } = await client.query(
      `select public.pos_reserve_collection($1, $2, 'split:first', 2000, 'cash', null, null, 900) as reply`,
      [ctx.tenantId, ctx.orderId],
    );
    check("first tender claims 2000", r1[0].reply.ok === true,
      `outstanding after ${r1[0].reply.outstanding_cents}`);
    const cash1 = await collectCash(client, ctx, "split:first", 2000);
    check("first tender reaches paid", cash1.paid,
      cash1.paid ? "" : `${cash1.refusal.code} ${cash1.refusal.message}`);
    await client.query(
      `select public.pos_settle_collection_reservation($1, $2, 'settled')`,
      [r1[0].reply.reservation_id, cash1.transactionId],
    );

    const { rows: r2 } = await client.query(
      `select public.pos_reserve_collection($1, $2, 'split:second', 3000, 'cash', null, null, 900) as reply`,
      [ctx.tenantId, ctx.orderId],
    );
    check("second tender claims the remaining 3000", r2[0].reply.ok === true,
      `outstanding after ${r2[0].reply.outstanding_cents}`);
    const cash2 = await collectCash(client, ctx, "split:second", 3000);
    check("second tender reaches paid on the SAME booking shell", cash2.paid,
      cash2.paid ? "" : `${cash2.refusal.code} ${cash2.refusal.message}`);

    const cents = await collectedCents(client, ctx.orderId);
    check("the split adds up to the order total", cents === 5000, `collected ${cents}`);

    // And one cent more is still refused, so the split did not open the door.
    const overflow = await collectCash(client, ctx, "split:overflow", 1);
    check("a third tender past the total is refused", !overflow.paid,
      overflow.paid ? "it landed" : `${overflow.refusal.code} ${overflow.refusal.message}`);
    return cents;
  } finally {
    await teardown(client, ctx.tenantId);
  }
}

async function caseC(client) {
  say("");
  say("CASE C — a card claim outlives the checkout session it guards");
  const ctx = await stage(client, 5000, "T1-03 case C");
  try {
    const { rows } = await client.query(
      `select public.pos_reserve_collection($1, $2, 'ttl:card', 5000, 'online_card', null, null, $3) as reply`,
      [ctx.tenantId, ctx.orderId, CARD_TTL_SECONDS],
    );
    const claim = rows[0].reply;
    const { rows: ttlRows } = await client.query(
      `select extract(epoch from (expires_at - now()))::int as seconds
         from public.order_collection_reservations where id = $1`,
      [claim.reservation_id],
    );
    const seconds = ttlRows[0].seconds;
    check("the card claim lives past Stripe Checkout's 30 minute floor",
      seconds >= STRIPE_CHECKOUT_MIN_TTL_SECONDS,
      `${seconds}s of claim vs a ${STRIPE_CHECKOUT_MIN_TTL_SECONDS}s session floor`);
    return seconds;
  } finally {
    await teardown(client, ctx.tenantId);
  }
}

async function caseD(client) {
  say("");
  say("CASE D — the unreserved route (a caller-supplied amount, no claim at all)");
  const ctx = await stage(client, 5000, "T1-03 case D");
  try {
    const full = await collectCash(client, ctx, "verified:first", 5000);
    check("the first unreserved settlement lands", full.paid,
      full.paid ? "" : `${full.refusal.code} ${full.refusal.message}`);
    const again = await collectCash(client, ctx, "verified:second", 5000);
    check("a second unreserved settlement on the collected order is refused", !again.paid,
      again.paid ? "it landed" : `${again.refusal.code} ${again.refusal.message}`);
    const cents = await collectedCents(client, ctx.orderId);
    check("the order still shows exactly its total", cents === 5000, `collected ${cents}`);
    return cents;
  } finally {
    await teardown(client, ctx.tenantId);
  }
}

async function main() {
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  say(`[prove] target ${process.env.SUPABASE_PROJECT_REF ?? "(ref not named in env)"}`);
  const guardPresent = await client.query(
    `select count(*)::int as n from pg_trigger
      where tgrelid = 'public.booking_transactions'::regclass
        and tgname = 'trg_booking_transactions_order_not_overcollected'`,
  );
  say(`[prove] order overcollection trigger installed: ${guardPresent.rows[0].n === 1 ? "yes" : "NO"}`);

  try {
    await client.query("BEGIN");
    await caseA(client);
    await caseB(client);
    await caseC(client);
    await caseD(client);
    // ROLLBACK, not COMMIT. The walk writes tenants, orders and money rows, and
    // the isolated branch is shared with the other journey cases; a proof that
    // leaves rows behind is a proof that changes what the next one measures.
    await client.query("ROLLBACK");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[prove] the walk itself blew up:", err.message);
    console.error(err.stack);
    failures.push("the walk completed");
  } finally {
    await client.end();
  }

  say("");
  if (failures.length > 0) {
    say(`[prove] ${failures.length} case(s) FAILED: ${failures.join("; ")}`);
    process.exit(1);
  }
  say("[prove] every case held: no double take, split intact, claim outlives its session.");
  process.exit(0);
}

await main();
