import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ticketFeeRows } from "./ticket-fee-comparison";

/**
 * This codebase has already paid for a hardcoded rate once.
 * `bookings/commission.ts` kept its own plan-tier table while calling itself
 * the single source of truth, diverged from `platform_commission_config`, and
 * billed 17.5% instead of 6% on real money through a fallback path. Its header
 * now says "do not reintroduce a tier to rate map in this file".
 *
 * A marketing page quoting a stale rate is the same failure with a slower
 * fuse: the visitor reads one number and the card is charged another, on the
 * page whose entire job is being checkable.
 */

test("the table follows the configured rate", () => {
  const six = ticketFeeRows(0.06).find((r) => r.faceValue === 10)!;
  const eight = ticketFeeRows(0.08).find((r) => r.faceValue === 10)!;
  assert.equal(six.tulala, 0.6);
  assert.equal(eight.tulala, 0.8);
  assert.equal(
    eight.tulalaPct,
    8,
    "the displayed percentage must be derived, or it keeps saying 6 after the config moves",
  );
});

test("Eventbrite's numbers match their published terms", () => {
  // 3.7% + $1.79 service, 2.9% processing, read from their pricing page on
  // 4 September 2026. If they reprice, this fails and the page gets refreshed
  // rather than quietly rotting.
  const twenty = ticketFeeRows(0.06).find((r) => r.faceValue === 20)!;
  assert.equal(twenty.eventbrite, 3.11);
});

test("the flat fee's shape is the argument, so it is pinned", () => {
  const pct = ticketFeeRows(0.06).map((r) => r.eventbritePct);
  for (let i = 1; i < pct.length; i++) {
    assert.ok(
      pct[i]! < pct[i - 1]!,
      `Their share must fall as face value rises; that IS the argument. Got ${pct.join(", ")}`,
    );
  }
});

/**
 * The prose is the half that rots invisibly. A stale TABLE is obvious at a
 * glance; a stale SENTENCE saying "our six percent" is not, and the sentence
 * is what a reader quotes back at us.
 */
test("no rate is written as a literal in the fee tree", () => {
  for (const f of [
    "src/lib/marketing/ticket-fee-comparison.ts",
    "src/components/marketing/ticket-fee-table.tsx",
  ]) {
    const src = readFileSync(f, "utf8");
    assert.ok(
      !/six percent|seis por ciento/i.test(src),
      `${f}: the rate is spelled out in prose. Derive it, or it will still say ` +
        `six after the config says something else.`,
    );
  }
});

test("the split in the prose is derived, not typed", () => {
  const src = readFileSync("src/components/marketing/ticket-fee-table.tsx", "utf8");
  assert.match(src, /tenHalf/, "the buyer/seller halves must come from the rate");
  assert.ok(
    !/\$0\.30 added to the buyer/.test(src),
    "a typed $0.30 stops matching the engine the moment the surcharge changes",
  );
});
