import assert from "node:assert/strict";
import test from "node:test";

import { getWorkspacePriceId, pickCurrentWorkspacePriceId } from "./price-ids";

const NETWORK_MONTHLY = "STRIPE_PRICE_NETWORK_MONTHLY";
const NETWORK_ANNUAL = "STRIPE_PRICE_NETWORK_ANNUAL";
const STUDIO_MONTHLY = "STRIPE_PRICE_STUDIO_MONTHLY";

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

test("pickCurrentWorkspacePriceId prefers an active sale window over canonical", () => {
  const priceId = pickCurrentWorkspacePriceId(
    [
      {
        stripe_price_id: "price_canonical",
        valid_from: null,
        valid_until: null,
      },
      {
        stripe_price_id: "price_sale",
        valid_from: "2026-05-01T00:00:00.000Z",
        valid_until: "2026-06-01T00:00:00.000Z",
      },
    ],
    new Date("2026-05-28T12:00:00.000Z"),
  );

  assert.equal(priceId, "price_sale");
});

test("pickCurrentWorkspacePriceId ignores expired sale windows", () => {
  const priceId = pickCurrentWorkspacePriceId(
    [
      {
        stripe_price_id: "price_expired_sale",
        valid_from: "2026-04-01T00:00:00.000Z",
        valid_until: "2026-05-01T00:00:00.000Z",
      },
      {
        stripe_price_id: "price_canonical",
        valid_from: null,
        valid_until: null,
      },
    ],
    new Date("2026-05-28T12:00:00.000Z"),
  );

  assert.equal(priceId, "price_canonical");
});
