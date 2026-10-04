import assert from "node:assert/strict";
import { test } from "node:test";

import { guestDockServicePriceLabel } from "./guest-dock-service-price";

const FX = { rateDate: "2026-09-25", perUsd: { MXN: 18 } };

test("guest dock price line: MXN + ≈ US$", () => {
  assert.equal(
    guestDockServicePriceLabel(50000, "MXN", FX, "es"),
    "$500 MXN · ≈ US$28",
  );
});

test("guest dock price line: no rates → local only, no invented USD", () => {
  const line = guestDockServicePriceLabel(50000, "MXN", null, "es");
  assert.ok(line);
  assert.match(line!, /MXN/);
  assert.doesNotMatch(line!, /≈\s*US\$/);
});

test("guest dock price line: unpriced → null", () => {
  assert.equal(guestDockServicePriceLabel(null, "MXN", FX, "es"), null);
  assert.equal(guestDockServicePriceLabel(0, "MXN", FX, "es"), null);
});
