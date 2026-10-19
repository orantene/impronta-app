import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { blankComments } from "@/lib/quality/supabase-unchecked-read";

/**
 * TUL-1268 M6: every refund entry point goes through ONE guard
 * (`authorizeRefund` in `lib/payments/refund-authority.ts`) BEFORE any money
 * moves, and that guard is fed the actor's capability, the requested amount,
 * the charge's refundable remainder and the role limit (`enforceRoleLimit`).
 *
 * Static, like `messaging-money-actions.static.test.ts` and
 * `role-limits-wire.static.test.ts`: these are server actions behind the
 * session/cookie stack, and the properties pinned here are control flow. The
 * guard's verdicts (not capable, over the remainder, over the role limit) are
 * exercised behaviourally in `refund-authority.test.ts`; this file proves each
 * door actually asks it, and asks it first.
 */

type Door = {
  name: string;
  file: string;
  start: string;
  end: string | null;
  /** The call that moves money; the guard must appear before its first use. */
  movers: string[];
};

const DOORS: Door[] = [
  {
    name: "desk refund (refundOrderAtDesk)",
    file: "src/app/(workspace)/[tenantSlug]/admin/orders/refund-actions.ts",
    start: "export async function refundOrderAtDesk",
    end: null,
    movers: ["cancelHybridComponents(", "refundOrderLines("],
  },
  {
    name: "work page Stripe refund (refundTransactionAction)",
    file: "src/app/(workspace)/[tenantSlug]/admin/work/[id]/actions.ts",
    start: "export async function refundTransactionAction",
    end: "export async function markRefundedAction",
    movers: ["executeBookingRefund("],
  },
  {
    name: "messages cancel + refund (messagingCancelRecord)",
    file: "src/lib/server-actions/messaging-money-actions.ts",
    start: "export async function messagingCancelRecord",
    end: "export async function messagingLoadRefundableTransaction",
    movers: ["refundOrderLines(", "refundArbitraryAmount("],
  },
  {
    name: "messages refund (messagingRefund)",
    file: "src/lib/server-actions/messaging-money-actions.ts",
    start: "export async function messagingRefund",
    end: "export async function messagingRecordOutsidePayment",
    movers: ["executeBookingRefund("],
  },
  {
    name: "talent Money refund (refundOwnBookingPayment)",
    file: "src/lib/talent-agenda/refund-actions.ts",
    start: "export async function refundOwnBookingPayment",
    end: null,
    movers: ["executeBookingRefund("],
  },
];

function body(door: Door): { src: string; fn: string } {
  const src = blankComments(readFileSync(join(process.cwd(), door.file), "utf8"));
  const from = src.indexOf(door.start);
  assert.ok(from > -1, `${door.name}: entry point not found`);
  const to = door.end ? src.indexOf(door.end, from) : src.length;
  assert.ok(to > from, `${door.name}: end marker not found`);
  return { src, fn: src.slice(from, to) };
}

for (const door of DOORS) {
  test(`${door.name} goes through authorizeRefund before any money moves`, () => {
    const { src, fn } = body(door);
    assert.match(src, /from "@\/lib\/payments\/refund-authority"/);
    const guardAt = fn.indexOf("authorizeRefund(");
    assert.ok(guardAt > -1, `${door.name}: never calls authorizeRefund`);
    for (const mover of door.movers) {
      const at = fn.indexOf(mover);
      assert.ok(at > -1, `${door.name}: ${mover} not found`);
      assert.ok(guardAt < at, `${door.name}: ${mover} runs before the guard`);
    }
  });

  test(`${door.name} feeds the guard a capability and the role limit`, () => {
    const { src, fn } = body(door);
    assert.match(fn, /\bcapable\b\s*[:,]/,`${door.name}: no capability passed to the guard`);
    assert.match(fn, /\brefundableCents\b\s*[:,]/, `${door.name}: no remainder passed to the guard`);
    assert.match(src, /import \{ enforceRoleLimit \} from "@\/lib\/approvals\/enforce"/);
    assert.match(fn, /enforceRoleLimit\(/, `${door.name}: role limit not applied`);
    assert.match(fn, /action: "refund"/);
  });
}

test("talent refund: requested amount only, never 'everything', own booking's charges only, cancelled direct booking only", () => {
  const { fn } = body(DOORS[4]!);
  assert.match(fn, /allowFullRemainder:\s*false/);
  assert.match(fn, /requestedCents:\s*input\.amountCents/);
  assert.match(fn, /talentMayRefundOwnBooking\(/);
  assert.match(fn, /planOwnBookingRefund\(/);
  assert.match(fn, /\.eq\("booking_id", input\.bookingId\)/);
  // No leg may ask the engine for "the full remainder" (amountCents: null).
  assert.doesNotMatch(fn, /amountCents:\s*null/);
});

test("desk hybrid component refund forwards the requested amount", () => {
  const { fn } = body(DOORS[0]!);
  const call = fn.slice(fn.indexOf("cancelHybridComponents("), fn.indexOf("refundOrderLines("));
  assert.match(call, /amountCents:\s*parsed\.data\.amountCents \?\? null/);
});

test("hybrid-package forwards amountCents to the line refund", () => {
  const src = blankComments(readFileSync(join(process.cwd(), "src/lib/orders/hybrid-package.ts"), "utf8"));
  assert.match(src, /amountCents:\s*input\.amountCents \?\? null/);
});
