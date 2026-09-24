import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { needsUsdRates } from "@/lib/pricing/usd-equivalent";

test("an MXN priced row needs rates; USD-only and free rows do not", () => {
  assert.equal(needsUsdRates([{ currency: "MXN", amountCents: 70000 }]), true);
  assert.equal(needsUsdRates([{ currency: "USD", amountCents: 70000 }]), false);
  assert.equal(needsUsdRates([{ currency: "MXN", amountCents: 0 }]), false);
});

test("the vanity loader refuses the fetch when rates are not needed", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/talent-site/server/vanity-usd-rates.ts"),
    "utf8",
  );
  assert.match(source, /if \(!needsUsdRates\(items\)\) return null/);
  assert.match(source, /return loadUsdRates\(\)/);
});
