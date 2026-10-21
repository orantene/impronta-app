import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { menuBoardCopy } from "./menu-board-copy";
import { lowestOptionCents, menuBoardLocale } from "./menu-board-price";

test("TUL-1801: a dish priced by size is 'from' its cheapest option", () => {
  assert.equal(lowestOptionCents([{ amountCents: 9000 }, { amountCents: 6000 }]), 6000);
  assert.equal(lowestOptionCents([{ amountCents: null }, { amountCents: 9000 }]), 9000);
});

test("TUL-1801: options with no price keep the quote label", () => {
  assert.equal(lowestOptionCents([{ amountCents: null }, { amountCents: 0 }]), null);
  assert.equal(lowestOptionCents([]), null);
  assert.equal(lowestOptionCents(undefined), null);
});

test("TUL-1801: the board speaks the visitor's locale when no content locale was passed", () => {
  assert.equal(menuBoardLocale(undefined, "es"), "es");
  assert.equal(menuBoardLocale("es", "en"), "es");
  assert.equal(menuBoardLocale(undefined, undefined), "en");
  const copy = menuBoardCopy(undefined, undefined, "es");
  assert.equal(copy.submit, "Enviar pedido");
  assert.equal(copy.selectQuantities, "Selecciona las cantidades");
  assert.equal(copy.quoteOnRequest, "Precio a consultar");
});

test("TUL-1801: the static board has no English-only quote label", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/site-admin/builder-node/render.tsx"), "utf8");
  assert.doesNotMatch(src, /return "Quote on request";/);
  assert.match(src, /Cotización a pedido/);
  assert.match(src, /lowestOptionCents\(item\.options\)/);
});
