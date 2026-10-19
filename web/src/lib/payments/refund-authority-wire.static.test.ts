import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

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
  // The row sends gross paid; the server clamps it to what is left (review condition 1).
  assert.match(fn, /requestedCents:\s*talentRequestedCents\(input\.amountCents,\s*refundableCents\)/);
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

// ─── every money mover under web/src is guarded or explicitly exempt ────────

/**
 * Review condition 2. Every use of a function that moves refund money, anywhere
 * under `web/src`, must sit inside one of the guarded entry points above, or in
 * a file on this list with the reason it is not a person-facing refund door.
 * A NEW caller fails this test until it goes through `authorizeRefund` (and is
 * added to DOORS) or is argued onto this list in review.
 */
const SYSTEM_EXEMPT: Record<string, string> = {
  "src/lib/payments/refund-execute.ts": "defines executeBookingRefund (the engine itself)",
  "src/lib/orders/refund-execute-lines.ts": "the line-refund engine; its callers are the guarded doors and the cron",
  "src/lib/messaging/money.ts": "defines refundArbitraryAmount; only called from the guarded messagingCancelRecord",
  "src/lib/orders/hybrid-package.ts": "cancelHybridComponents helper; its callers are scanned under that name",
  "src/app/api/cron/ticket-refund-intents/route.ts": "system cron: refunds tickets of a cancelled event, no person acting",
};

const MOVERS = /\b(executeBookingRefund|refundOrderLines|refundArbitraryAmount|cancelHybridComponents)\b/g;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function guardedDoors(): Map<string, Set<string>> {
  const guarded = new Map<string, Set<string>>();
  for (const door of DOORS) {
    const name = door.start.replace("export async function ", "");
    const set = guarded.get(door.file) ?? new Set<string>();
    set.add(name);
    guarded.set(door.file, set);
  }
  return guarded;
}

/** Uses of a money mover in `rawSource` that are not inside a guarded door of `file`. */
function unguardedUses(file: string, rawSource: string, guarded: Map<string, Set<string>>): string[] {
  if (SYSTEM_EXEMPT[file]) return [];
  // Comments blanked; import / re-export statements removed (a name in an
  // import list is not a call).
  const src = blankComments(rawSource).replace(/^\s*(?:import|export)\s[^;]*?\sfrom\s*["'][^"']+["'];?/gms, "");
  const offenders: string[] = [];
  for (const m of src.matchAll(MOVERS)) {
    const at = m.index ?? 0;
    if (/function\s+$/.test(src.slice(Math.max(0, at - 20), at))) continue; // its own definition
    const fns = [...src.slice(0, at).matchAll(/export\s+async\s+function\s+(\w+)/g)];
    const enclosing = fns.length ? fns[fns.length - 1]![1] : "(module scope)";
    if (!guarded.get(file)?.has(enclosing)) offenders.push(`${file} :: ${enclosing} uses ${m[1]}`);
  }
  return offenders;
}

test("the scan catches a new unguarded caller (self-check on a synthetic file)", () => {
  const fake = [
    'import { executeBookingRefund } from "@/lib/payments/refund-execute";',
    "export async function sneakyRefund(id: string) {",
    "  return executeBookingRefund({ transactionId: id, amountCents: null });",
    "}",
  ].join("\n");
  assert.deepEqual(unguardedUses("src/lib/new/sneaky.ts", fake, guardedDoors()), [
    "src/lib/new/sneaky.ts :: sneakyRefund uses executeBookingRefund",
  ]);
  // The same call inside a guarded door's file but a different function is still caught.
  const doorFile = "src/lib/talent-agenda/refund-actions.ts";
  assert.equal(unguardedUses(doorFile, fake, guardedDoors()).length, 1);
});

test("every caller of a refund money mover under web/src is a guarded door or SYSTEM_EXEMPT", () => {
  const guarded = guardedDoors();
  const root = process.cwd();
  const offenders: string[] = [];
  for (const full of sourceFiles(join(root, "src"))) {
    const file = relative(root, full).split(sep).join("/");
    offenders.push(...unguardedUses(file, readFileSync(full, "utf8"), guarded));
  }
  assert.deepEqual(offenders, [], `unguarded refund callers:\n${offenders.join("\n")}`);
});

test("SYSTEM_EXEMPT names only files that exist (no stale exemptions)", () => {
  for (const file of Object.keys(SYSTEM_EXEMPT)) {
    assert.ok(existsSync(join(process.cwd(), file)), `${file} is exempt but gone`);
  }
});

test("Messages over_refund_limit copy: a manager with a higher limit has to make the refund (en, es, fr)", () => {
  const read = (l: string) =>
    (JSON.parse(readFileSync(join(process.cwd(), "messages", `${l}.json`), "utf8")) as {
      dashboard: { pos: { messages: { refusal: Record<string, string> } } };
    }).dashboard.pos.messages.refusal.over_refund_limit;
  assert.equal(read("en"), "A manager with a higher limit has to make this refund.");
  assert.equal(read("es"), "Un gerente con un límite mayor tiene que hacer este reembolso.");
  assert.equal(read("fr"), "Un responsable avec une limite plus elevee doit faire ce remboursement.");
});
