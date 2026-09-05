import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { blankComments } from "@/lib/quality/supabase-unchecked-read";
import { CODE_ALPHABET, OPAQUE_CODE_MIN_LENGTH, generateOpaqueCode } from "@/lib/links/code";

/**
 * The receipt code is a PUBLIC identifier printed on paper and emailed. Three
 * properties, each pinned because losing any one is silent.
 */

test("createPurchase assigns a receipt code, and reuses the shared generator", () => {
  const src = blankComments(
    readFileSync(join(process.cwd(), "src/lib/orders/purchase.ts"), "utf8"),
  );
  assert.match(src, /receipt_code:\s*generateOpaqueCode\(\)/, "orders must get a receipt code at creation");
  // A SECOND generator is the failure this pins. The alphabet's confusable-pair
  // rule is solved, tested and guarded in one place; a local `Math.random`
  // version would pass every test here while putting `l` and `1` on a ticket.
  assert.doesNotMatch(src, /Math\.random/, "no ad-hoc code generation in the pipeline");
});

test("the code is long enough that guessing is not a strategy", () => {
  // The DB CHECK floors this at 16; the generator's default is 20. Both are
  // asserted because the CHECK is what stops a FUTURE caller assigning
  // something short, and the default is what we actually ship today.
  const code = generateOpaqueCode();
  assert.ok(code.length >= OPAQUE_CODE_MIN_LENGTH, `too short: ${code.length}`);
  assert.ok(code.length >= 16, "below the receipt_code CHECK floor");
});

test("two receipts are not the same receipt", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 2000; i++) seen.add(generateOpaqueCode());
  assert.equal(seen.size, 2000, "a collision in 2000 draws means far too little entropy");
});

test("the alphabet a person retypes has no confusable pair", () => {
  // Pinned HERE too, not only in links, because this is where the value ends up
  // on paper. If the links engine ever relaxes its alphabet for a URL-shortener
  // reason, a receipt typed off a printout starts failing and nobody connects
  // the two changes.
  for (const [a, b] of [["0", "O"], ["1", "l"], ["1", "I"], ["l", "I"]]) {
    const both = [a, b].filter((ch) => CODE_ALPHABET.includes(ch));
    assert.ok(both.length <= 1, `${a}/${b} are misread for each other; found ${JSON.stringify(both)}`);
  }
});
