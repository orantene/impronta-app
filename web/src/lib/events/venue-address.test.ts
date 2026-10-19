import test from "node:test";
import assert from "node:assert/strict";

import { formatVenueAddress } from "@/lib/events/venue-address";

test("joins the filled address columns on one line", () => {
  assert.equal(
    formatVenueAddress({ address_line1: " Calle 1 ", address_line2: null, city: "Tulum", region: "Q.R.", postal_code: "77760", country_code: "MX" }),
    "Calle 1, 77760 Tulum, Q.R., MX",
  );
});

test("null when the venue has no address data or there is no venue", () => {
  assert.equal(formatVenueAddress({ address_line1: "", city: null }), null);
  assert.equal(formatVenueAddress(null), null);
});
