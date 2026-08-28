import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { STRIPE_CONNECT_PRIVACY_ATTR, SUPPORT_REPLAY_MASK } from "./mask-config";

test("mask config turns on maskAllInputs and every maskInputOption", () => {
  assert.equal(SUPPORT_REPLAY_MASK.maskAllInputs, true);
  const opts = SUPPORT_REPLAY_MASK.maskInputOptions;
  for (const key of Object.keys(opts) as Array<keyof typeof opts>) {
    assert.equal(opts[key], true, key);
  }
  assert.equal(SUPPORT_REPLAY_MASK.recordCanvas, false);
  assert.equal(SUPPORT_REPLAY_MASK.collectFonts, false);
  assert.equal(SUPPORT_REPLAY_MASK.blockSelector, '[data-tulala-privacy="block"]');
});

test("Stripe Connect embedded-onboarding wrapper blocks replay", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(
    join(here, "../../../../src/components/payments/ConnectEmbeddedOnboarding.tsx"),
    "utf8",
  );
  assert.ok(src.includes(STRIPE_CONNECT_PRIVACY_ATTR));
});
