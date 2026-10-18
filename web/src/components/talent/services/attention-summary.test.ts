import assert from "node:assert/strict";
import { test } from "node:test";
import { attentionSummary, photoOnlyTip } from "./attention-summary";

test("singular and plural agree, zeros omitted", () => {
  assert.equal(
    attentionSummary({ total: 1, noPhoto: 0, noPrice: 1, soldOut: 0 }, "en"),
    "1 item needs attention: 1 has no price yet.",
  );
  assert.equal(
    attentionSummary({ total: 3, noPhoto: 2, noPrice: 0, soldOut: 1 }, "en"),
    "3 items need attention: 2 have no photo, 1 is sold out.",
  );
});
test("spanish", () => {
  assert.equal(
    attentionSummary({ total: 2, noPhoto: 0, noPrice: 2, soldOut: 0 }, "es"),
    "2 artículos necesitan atención: 2 sin precio todavía.",
  );
  assert.equal(
    attentionSummary({ total: 1, noPhoto: 0, noPrice: 0, soldOut: 1 }, "es"),
    "1 artículo necesita atención: 1 agotado.",
  );
});
test("overlap note only when parts exceed the total", () => {
  assert.match(attentionSummary({ total: 2, noPhoto: 2, noPrice: 1, soldOut: 0 }, "en"), /more than one/);
});

test("TUL-825: photo-only gaps read as a friendly optional tip, other gaps stay attention", () => {
  assert.match(photoOnlyTip({ total: 2, noPhoto: 2, noPrice: 0, soldOut: 0 }, "es") ?? "", /Tip opcional/);
  assert.match(photoOnlyTip({ total: 2, noPhoto: 2, noPrice: 0, soldOut: 0 }, "en") ?? "", /Optional tip/);
  assert.equal(photoOnlyTip({ total: 2, noPhoto: 1, noPrice: 1, soldOut: 0 }, "en"), null);
  assert.equal(photoOnlyTip({ total: 1, noPhoto: 0, noPrice: 1, soldOut: 0 }, "en"), null);
});
