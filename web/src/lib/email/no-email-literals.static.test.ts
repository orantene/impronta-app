import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Inbound support mail must never be forwarded to a hard-coded address: the
 * target comes only from RESEND_INBOUND_FORWARD_TO. No email literal may live
 * in these non-test sources.
 */
const FILES = [
  "src/lib/email/resend-inbound-forward.ts",
  "src/app/api/webhooks/resend/route.ts",
];
const EMAIL_LITERAL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

for (const rel of FILES) {
  test(`${rel} has no email address literal`, () => {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    const hits = src.match(EMAIL_LITERAL) ?? [];
    assert.equal(hits.length, 0, `${rel} contains ${hits.length} email literal(s)`);
  });
}

test("the hard-coded default export is gone", () => {
  const src = readFileSync(join(process.cwd(), FILES[0]), "utf8");
  assert.ok(!src.includes("DEFAULT_INBOUND_FORWARD_TO"));
});
