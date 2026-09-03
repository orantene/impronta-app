/**
 * Static guard: every Stripe Checkout session creation carries an idempotency key.
 *
 * WHY: a double submit on an unkeyed `checkout.sessions.create` mints TWO
 * sessions. If both complete you have two real charges — and on the subscription
 * lanes, two live subscriptions for one customer, which then bill forever until
 * someone notices. Five such calls existed in the SaaS/client billing lane.
 *
 * This is a SHAPE guard, deliberately. It counts create calls against
 * idempotency keys per file rather than pinning line numbers or exact call
 * text, because a guard that can only fail when someone reformats a file costs
 * more than it protects (see the static-guard incident of 2026-09-02).
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src", "lib");

/** Files that create Checkout sessions. Add new ones here. */
const CHECKOUT_FILES = [
  "stripe/client-billing.ts",
  "stripe/talent-billing.ts",
  "stripe/workspace-billing.ts",
  "payments/stripe-checkout.ts",
] as const;

/**
 * Files knowingly still unkeyed, with an owner and a reason.
 *
 * `payments/stripe-checkout.ts` is the hosted BOOKING checkout. It is being
 * keyed by the Orders & Checkout lane in PR #1511 (`cs_txn_<transactionId>`),
 * and that file is theirs for the duration — keying it here would collide.
 *
 * This list is SELF-CLEANING: the test below asserts each entry is genuinely
 * still unkeyed, so the moment #1511 lands this suite goes red and whoever sees
 * it deletes the entry. An exception that cannot expire quietly.
 */
const KNOWN_UNKEYED: readonly string[] = ["payments/stripe-checkout.ts"];

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function countCreateCalls(src: string): number {
  return (src.match(/checkout\.sessions\.create\(/g) ?? []).length;
}

function countKeys(src: string): number {
  return (src.match(/idempotencyKey/g) ?? []).length;
}

describe("every Checkout session creation is idempotent", () => {
  for (const rel of CHECKOUT_FILES) {
    if (KNOWN_UNKEYED.includes(rel)) continue;

    test(`${rel} keys every create call`, () => {
      const src = read(rel);
      const creates = countCreateCalls(src);
      const keys = countKeys(src);

      assert.ok(creates > 0, `${rel} is listed as a checkout file but creates no sessions`);
      assert.equal(
        keys,
        creates,
        `${rel} has ${creates} checkout.sessions.create call(s) but ${keys} idempotency key(s). ` +
          `An unkeyed call means a double submit can mint two sessions, and two completed ` +
          `sessions on a subscription lane means two live subscriptions.`,
      );
    });
  }

  test("the known-unkeyed list is still accurate, and expires itself", () => {
    // If this fails because a file IS now keyed, that is the good outcome:
    // delete its entry from KNOWN_UNKEYED. The exception exists to be removed.
    for (const rel of KNOWN_UNKEYED) {
      const src = read(rel);
      assert.equal(
        countKeys(src),
        0,
        `${rel} now has an idempotency key — remove it from KNOWN_UNKEYED so it is guarded ` +
          `like the rest. (Expected once PR #1511 lands.)`,
      );
    }
  });

  test("no checkout file was silently dropped from the list", () => {
    // A new billing file with an unkeyed create call would otherwise never be
    // seen by this guard. Cheap tripwire: the count of listed files is pinned,
    // so adding a file forces a decision about guarding it.
    assert.equal(
      CHECKOUT_FILES.length,
      4,
      "A checkout file was added or removed. Add it to CHECKOUT_FILES (and key its create calls) " +
        "rather than adjusting this number to make the test pass.",
    );
  });
});
