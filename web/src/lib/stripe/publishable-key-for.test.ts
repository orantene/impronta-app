import { test } from "node:test";
import assert from "node:assert/strict";

import { getStripePublishableKeyFor } from "./client";

test("MX accounts get the MX publishable key; US keeps the US key", () => {
  const saved = {
    us: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    mxPub: process.env.NEXT_PUBLIC_STRIPE_MX_PUBLISHABLE_KEY,
    mx: process.env.STRIPE_MX_PUBLISHABLE_KEY,
  };
  try {
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_us";
    delete process.env.NEXT_PUBLIC_STRIPE_MX_PUBLISHABLE_KEY;
    process.env.STRIPE_MX_PUBLISHABLE_KEY = "pk_test_mx";
    assert.equal(getStripePublishableKeyFor("us"), "pk_test_us");
    assert.equal(getStripePublishableKeyFor("mx"), "pk_test_mx");
    delete process.env.STRIPE_MX_PUBLISHABLE_KEY;
    // MX absent: null (the caller refuses), never the US key for an MX account.
    assert.equal(getStripePublishableKeyFor("mx"), null);
  } finally {
    const restore = (k: string, v: string | undefined) => (v === undefined ? delete process.env[k] : (process.env[k] = v));
    restore("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", saved.us);
    restore("NEXT_PUBLIC_STRIPE_MX_PUBLISHABLE_KEY", saved.mxPub);
    restore("STRIPE_MX_PUBLISHABLE_KEY", saved.mx);
  }
});
