/**
 * The browser must hold the SERVER-RESOLVED publishable key, never the
 * build-inlined NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (in forced test mode that
 * could be a live pk against TEST intents/accounts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { stripeEnv } from "./env-keys";
import { getStripePublishableKeyFor } from "./client";

const SRC = path.resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");
const LIVE_FAKE = "pk_" + "live_" + "fakeKeyForTests";
const TEST_FAKE = "pk_test_fakeKeyForTests";
const NAME = "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY";

const CLIENT_FILES = [
  "components/chat-cards/PayNowSheet.tsx",
  "components/payments/ConnectEmbeddedOnboarding.tsx",
];

for (const rel of CLIENT_FILES) {
  test(`${rel} never reads a NEXT_PUBLIC_STRIPE_PUBLISHABLE env name`, () => {
    const code = read(rel)
      .split("\n")
      .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
      .join("\n");
    assert.doesNotMatch(code, /NEXT_PUBLIC_STRIPE_PUBLISHABLE/);
    assert.doesNotMatch(code, /process\.env/);
  });
}

test("PayNowSheet takes the key from the server-resolved intent response", () => {
  const code = read("components/chat-cards/PayNowSheet.tsx");
  assert.match(code, /setPublishableKey\(r\.publishableKey \?\? null\)/);
  assert.match(code, /const pk = publishableKey;/);
});

test("ConnectEmbeddedOnboarding takes the key from the account-session result and refuses when absent", () => {
  const code = read("components/payments/ConnectEmbeddedOnboarding.tsx");
  assert.match(code, /first\.publishableKey \?\? null/);
  assert.match(code, /if \(!publishableKey\) \{/);
});

test("forced test mode resolves the _TEST publishable key, never the live one", () => {
  const env = {
    STRIPE_FORCE_TEST_MODE: "1",
    [NAME]: LIVE_FAKE,
    [`${NAME}_TEST`]: TEST_FAKE,
  };
  assert.equal(stripeEnv(NAME, env), TEST_FAKE);
});

test("forced test mode with only the live key set fails closed (undefined)", () => {
  assert.equal(stripeEnv(NAME, { STRIPE_FORCE_TEST_MODE: "1", [NAME]: LIVE_FAKE }), undefined);
});

test("not forced: the normal publishable key", () => {
  const env = { [NAME]: LIVE_FAKE, [`${NAME}_TEST`]: TEST_FAKE };
  assert.equal(stripeEnv(NAME, env), LIVE_FAKE);
});

test("getStripePublishableKeyFor (what the server actions send down) honors forced test mode", () => {
  const names = ["STRIPE_FORCE_TEST_MODE", NAME, `${NAME}_TEST`];
  const saved = names.map((n) => process.env[n]);
  try {
    process.env[NAME] = LIVE_FAKE;
    process.env[`${NAME}_TEST`] = TEST_FAKE;
    delete process.env.STRIPE_FORCE_TEST_MODE;
    assert.equal(getStripePublishableKeyFor("us"), LIVE_FAKE);
    process.env.STRIPE_FORCE_TEST_MODE = "1";
    assert.equal(getStripePublishableKeyFor("us"), TEST_FAKE);
  } finally {
    names.forEach((n, i) => {
      const v = saved[i];
      if (v === undefined) delete process.env[n];
      else process.env[n] = v;
    });
  }
});
