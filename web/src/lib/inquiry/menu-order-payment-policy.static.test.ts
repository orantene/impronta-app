/**
 * menu-order-payment-policy.static.test.ts
 *
 * `payInPerson` arrives from a public, unauthenticated island. If the engine
 * trusted it, a caller could post `true` on a card-only item and get an order
 * stamped 'cash' / 'pay_in_person' that skips the payment request entirely —
 * silently defeating the merchant's own policy, with no error anywhere.
 *
 * The Front Door contract states the pipeline re-validates payment policy at
 * submit. This pins that the menu engine does, until the pipeline owns it at
 * Orders 0.6 — at which point these properties move with it rather than being
 * deleted alongside the engine.
 *
 * Shape-based, and comment-stripped before asserting: a guard that pins prose
 * fails on the very comment that explains it.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ENGINE = path.join(process.cwd(), "src/lib/inquiry/menu-order-engine.ts");
const raw = readFileSync(ENGINE, "utf8");
const source = raw
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

test("the engine derives payInPerson instead of trusting the client field", () => {
  assert.ok(
    /const\s+payInPerson\s*=/.test(source),
    "expected a server-derived `payInPerson`",
  );
  assert.ok(
    /everyLineAllowsPayInPerson/.test(source),
    "the derivation must consider every resolved line's policy",
  );
});

test("no money decision reads input.payInPerson directly", () => {
  const offenders: string[] = [];
  const re = /input\.payInPerson/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const line = source.slice(0, m.index).split("\n").length;
    const stmt = source.slice(m.index - 60, m.index + 60);
    // The single legal read is the derivation itself.
    if (/const\s+payInPerson\s*=/.test(stmt)) continue;
    offenders.push(`line ${line}`);
  }
  assert.deepEqual(
    offenders,
    [],
    `these read the client field directly instead of the derived one: ${offenders.join(", ")}`,
  );
});

test("the derivation requires EVERY line to allow it", () => {
  // ALL, not ANY: one card-only line must make the whole order card-only, or a
  // mixed order lets the card-only item ride in on its neighbour's policy.
  assert.ok(
    /everyLineAllowsPayInPerson\s*=\s*false/.test(source),
    "expected the flag to be cleared by a disallowing line",
  );
  assert.ok(
    /input\.payInPerson\s*===\s*true\s*&&\s*everyLineAllowsPayInPerson/.test(source),
    "expected the client hint to be ANDed with the server-derived policy",
  );
});
