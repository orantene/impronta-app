import assert from "node:assert/strict";
import { test } from "node:test";

import {
  guestDockServicePriceLabel,
  guestDockServicePriceParts,
  guestDockServiceUsdLabel,
} from "./guest-dock-service-price";

const FX = { rateDate: "2026-09-25", perUsd: { MXN: 18 } };
const nb = (s: string) => s.replace(/\u00a0/g, " ");

test("guest dock price line: MXN only (USD on its own line)", () => {
  assert.equal(nb(guestDockServicePriceLabel(50000, "MXN", FX, "es")!), "$500 MXN");
  assert.equal(guestDockServiceUsdLabel(50000, "MXN", FX, "es"), "≈ US$28");
  const parts = guestDockServicePriceParts(50000, "MXN", FX, "es");
  assert.equal(nb(parts!.primary), "$500 MXN");
  assert.equal(parts!.usd, "≈ US$28");
  assert.doesNotMatch(parts!.primary, /≈|·/);
});

test("guest dock price line: no rates → local only, no invented USD", () => {
  const line = guestDockServicePriceLabel(50000, "MXN", null, "es");
  assert.ok(line);
  assert.match(line!, /MXN/);
  assert.equal(guestDockServiceUsdLabel(50000, "MXN", null, "es"), null);
});

test("guest dock price line: unpriced → null", () => {
  assert.equal(guestDockServicePriceLabel(null, "MXN", FX, "es"), null);
  assert.equal(guestDockServicePriceLabel(0, "MXN", FX, "es"), null);
});

test("guest dock groups thousands", () => {
  assert.equal(nb(guestDockServicePriceLabel(150000, "MXN", null, "es")!), "$1,500 MXN");
});
