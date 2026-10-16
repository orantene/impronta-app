import assert from "node:assert/strict";
import { test } from "node:test";

import { PROMO_CODE_HINT_KEY, PROMO_CODE_HINT_TTL_MS, clearPromoCodeHint, readPromoCodeHint, writePromoCodeHint, type HintStorage } from "./code-hint";

function mem(): HintStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

test("write then read returns the normalized code within 30 minutes", () => {
  const s = mem();
  assert.equal(writePromoCodeHint(s, "  luz 20 ", 1_000), true);
  assert.equal(readPromoCodeHint(s, 1_000 + PROMO_CODE_HINT_TTL_MS - 1), "LUZ20");
});

test("expired hints read as null and are removed", () => {
  const s = mem();
  writePromoCodeHint(s, "LUZ20", 1_000);
  assert.equal(readPromoCodeHint(s, 1_000 + PROMO_CODE_HINT_TTL_MS), null);
  assert.equal(s.data.has(PROMO_CODE_HINT_KEY), false);
});

test("malformed or tampered values never yield a code", () => {
  for (const raw of ["not json", "null", "{}", JSON.stringify({ code: "<script>", exp: 9e12 }), JSON.stringify({ code: "OK", exp: "soon" })]) {
    const s = mem();
    s.setItem(PROMO_CODE_HINT_KEY, raw);
    assert.equal(readPromoCodeHint(s, 0), null, raw);
    assert.equal(s.data.has(PROMO_CODE_HINT_KEY), false);
  }
});

test("clear removes it; blocked storage never throws", () => {
  const s = mem();
  writePromoCodeHint(s, "LUZ20", 0);
  clearPromoCodeHint(s);
  assert.equal(readPromoCodeHint(s, 1), null);
  const boom: HintStorage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
    removeItem: () => { throw new Error("blocked"); },
  };
  assert.equal(writePromoCodeHint(boom, "LUZ20", 0), false);
  assert.equal(readPromoCodeHint(boom, 0), null);
  clearPromoCodeHint(boom);
  assert.equal(writePromoCodeHint(null, "LUZ20", 0), false);
  assert.equal(readPromoCodeHint(null, 0), null);
  assert.equal(writePromoCodeHint(mem(), "", 0), false);
});
