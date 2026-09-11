import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { blankComments } from "@/lib/quality/supabase-unchecked-read";

/**
 * Cancelling an event is five writes, and the defect was that it was one.
 *
 * These are static because the property at stake is WHICH TABLES a cancellation
 * touches and WHERE the decision lives — questions the source text answers
 * honestly and a mocked Supabase answers only about the mock. The arithmetic
 * has nothing in it; the coverage is the whole point.
 */
const MIGRATIONS = join(process.cwd(), "..", "supabase", "migrations");
const CASCADE = readFileSync(join(MIGRATIONS, "20261230000800_cancel_event_cascade.sql"), "utf8");
const WRITERS = blankComments(readFileSync(join(process.cwd(), "src/lib/events/writers.ts"), "utf8"));

test("the cancel path goes through the RPC, never a bare status update", () => {
  // The defect exactly: `update({ status: 'cancelled' })` on `events` and stop.
  // Nothing downstream reads that column, so the show stayed listed, kept
  // selling and kept admitting behind a badge that said cancelled.
  assert.match(WRITERS, /rpc\("cancel_event_cascade"/, "one atomic call");
  assert.doesNotMatch(
    WRITERS,
    /status:\s*"cancelled"[\s\S]{0,80}\.eq\("id",\s*eventId\)/,
    "a direct cancel write would bypass the cascade",
  );
});

test("all four dependent surfaces are actually written", () => {
  // Each one is a different surface's own source of truth. Missing any single
  // one leaves a cancellation that some part of the product cannot see.
  assert.match(CASCADE, /UPDATE public\.sessions/, "the public listing reads sessions.status");
  assert.match(CASCADE, /UPDATE public\.capacity_pools/, "the purchase path reads is_active");
  assert.match(CASCADE, /UPDATE public\.admissions/, "the door reads admissions.status");
  assert.match(CASCADE, /INSERT INTO public\.ticket_refund_intents/, "and somebody is owed money");
});

test("the event row is LOCKED before anything is read off it", () => {
  // Without the lock, "cancel" and "sell one more ticket" interleave: the sale
  // commits against a pool this transaction is about to deactivate, and the
  // buyer holds a ticket that generates no refund intent because the intent
  // sweep already ran.
  assert.match(CASCADE, /FOR UPDATE/, "cancel and sell must serialise");
  const lock = CASCADE.indexOf("FOR UPDATE");
  const firstWrite = CASCADE.indexOf("UPDATE public.events");
  assert.ok(lock > -1 && firstWrite > -1);
  assert.ok(lock < firstWrite, "the lock must precede every write");
});

test("only SCHEDULED sessions are cancelled", () => {
  // A 'completed' night HAPPENED. Rewriting it to cancelled would erase the
  // fact that people attended, which is a worse lie than the stale badge this
  // migration exists to fix.
  assert.match(
    CASCADE,
    /UPDATE public\.sessions[\s\S]{0,240}status = 'scheduled'/,
    "completed nights are history, not candidates",
  );
});

test("every write is predicated on the state it changes, so a second press is a no-op", () => {
  // The caller is a button a worried person presses twice. Idempotency by
  // construction rather than by a guard flag: there is no window in which the
  // flag is set and the writes have not run.
  assert.match(CASCADE, /AND status = 'valid'/, "voiding is predicated on valid");
  assert.match(CASCADE, /AND is_active/, "deactivating is predicated on active");
  assert.match(CASCADE, /ON CONFLICT \(order_line_id\) DO NOTHING/, "one intent per line, ever");
  assert.match(CASCADE, /alreadyCancelled/, "and the second call reports success, not an error");
});

test("only unrefunded PAID lines generate an intent", () => {
  // A pending_payment order has taken no money to give back and a comp line
  // owes nothing. An intent for either occupies the executor every run and
  // logs a refusal that reads like a real failure.
  assert.match(CASCADE, /o\.status IN \('paid', 'fulfilled'\)/, "money must have arrived");
  assert.match(CASCADE, /ol\.total_cents > ol\.refunded_cents/, "and not already been returned");
});

test("the refund is NOT money — it is an intent the cron executes", () => {
  // Postgres can roll back the row; Stripe cannot roll back the charge. Moving
  // money inside the transaction that cancels the event makes the worst
  // outcome unrecoverable instead of merely retryable.
  assert.doesNotMatch(CASCADE, /booking_transactions/, "no charge is touched here");
  assert.match(CASCADE, /event_cancelled/, "the reason the executor branches on");
});

test("the function is service-role only", () => {
  // It takes the tenant as an ARGUMENT. Granted to `authenticated`, one changed
  // uuid cancels another workspace's event.
  assert.match(CASCADE, /REVOKE ALL ON FUNCTION public\.cancel_event_cascade/, "no ambient grant");
});

test("the counts come back, because they are the only evidence the cascade ran", () => {
  assert.match(WRITERS, /sessionsCancelled/, "");
  assert.match(WRITERS, /poolsDeactivated/, "");
  assert.match(WRITERS, /admissionsVoided/, "");
  assert.match(WRITERS, /refundIntents/, "");
});
