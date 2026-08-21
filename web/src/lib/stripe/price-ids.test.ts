import assert from "node:assert/strict";
import test from "node:test";

import { getWorkspacePriceId } from "./price-ids";

const NETWORK_MONTHLY = "STRIPE_PRICE_NETWORK_MONTHLY";
const NETWORK_ANNUAL = "STRIPE_PRICE_NETWORK_ANNUAL";
const STUDIO_MONTHLY = "STRIPE_PRICE_STUDIO_MONTHLY";
const WEBSITE_MONTHLY = "STRIPE_PRICE_WEBSITE_MONTHLY";
const WEBSITE_ANNUAL = "STRIPE_PRICE_WEBSITE_ANNUAL";

// Snapshot + restore env around each case so tests don't leak state into
// the wider suite (env vars are process-global).
function withEnv(values: Record<string, string | undefined>, fn: () => void) {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key];
    if (values[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = values[key];
    }
  }
  try {
    fn();
  } finally {
    for (const [key, prior] of Object.entries(previous)) {
      if (prior === undefined) delete process.env[key];
      else process.env[key] = prior;
    }
  }
}

test("getWorkspacePriceId returns null when the network monthly env var is not set", () => {
  withEnv({ [NETWORK_MONTHLY]: undefined }, () => {
    assert.equal(getWorkspacePriceId("network", "monthly"), null);
  });
});

test("getWorkspacePriceId returns the env value when STRIPE_PRICE_NETWORK_MONTHLY is set", () => {
  withEnv({ [NETWORK_MONTHLY]: "price_test_network_monthly_abc123" }, () => {
    assert.equal(
      getWorkspacePriceId("network", "monthly"),
      "price_test_network_monthly_abc123",
    );
  });
});

test("getWorkspacePriceId reads the annual variant independently", () => {
  withEnv(
    {
      [NETWORK_MONTHLY]: "price_monthly",
      [NETWORK_ANNUAL]: "price_annual",
    },
    () => {
      assert.equal(getWorkspacePriceId("network", "monthly"), "price_monthly");
      assert.equal(getWorkspacePriceId("network", "annual"), "price_annual");
    },
  );
});

test("getWorkspacePriceId trims whitespace and treats empty strings as unset", () => {
  withEnv({ [NETWORK_MONTHLY]: "   " }, () => {
    assert.equal(getWorkspacePriceId("network", "monthly"), null);
  });
  withEnv({ [NETWORK_MONTHLY]: "  price_with_spaces  " }, () => {
    assert.equal(getWorkspacePriceId("network", "monthly"), "price_with_spaces");
  });
});

test("getWorkspacePriceId handles studio independently from network", () => {
  withEnv(
    {
      [STUDIO_MONTHLY]: "price_studio_monthly",
      [NETWORK_MONTHLY]: undefined,
    },
    () => {
      assert.equal(getWorkspacePriceId("studio", "monthly"), "price_studio_monthly");
      assert.equal(getWorkspacePriceId("network", "monthly"), null);
    },
  );
});

test("website is a defined plan key that is NOT purchasable until its env vars are set", () => {
  withEnv(
    {
      [WEBSITE_MONTHLY]: undefined,
      [WEBSITE_ANNUAL]: undefined,
    },
    () => {
      // Deliberate: the tier exists in the type system and the catalog, but
      // no Stripe price is configured, so checkout cannot start.
      assert.equal(getWorkspacePriceId("website", "monthly"), null);
      assert.equal(getWorkspacePriceId("website", "annual"), null);
    },
  );

  // ...and it reads its own env vars once they ARE set.
  withEnv(
    {
      [WEBSITE_MONTHLY]: "price_website_monthly",
      [WEBSITE_ANNUAL]: "price_website_annual",
    },
    () => {
      assert.equal(getWorkspacePriceId("website", "monthly"), "price_website_monthly");
      assert.equal(getWorkspacePriceId("website", "annual"), "price_website_annual");
    },
  );
});
