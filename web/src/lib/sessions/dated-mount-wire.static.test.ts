import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "../..");
const mount = readFileSync(join(root, "components/public-booking/DatedPlacesMount.tsx"), "utf8");
const route = readFileSync(join(root, "app/(public)/_services/business-service-route.tsx"), "utf8");

test("the client mount injects the dated purchase action into the step", () => {
  assert.match(mount, /^"use client";/);
  assert.match(mount, /import \{ startDatedPurchase \} from "@\/app\/\(public\)\/_dated\/dated-purchase-actions"/);
  assert.match(mount, /<DatedPlacesStep[\s\S]*onBook=\{startDatedPurchase\}/);
});

test("the business service route loads the picker for THIS tenant and offering and mounts only when it has dates", () => {
  assert.match(route, /loadDatedPicker\(\{ tenantId: loaded\.tenantId, offeringId: offering\.id \}\)/);
  assert.match(route, /shouldMountDatedStep\(/);
  assert.match(route, /bookingSlot=/);
});
