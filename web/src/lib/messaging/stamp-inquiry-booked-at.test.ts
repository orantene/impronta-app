import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

describe("accept stamps inquiries.booked_at (Track D8)", () => {
  const here = dirname(fileURLToPath(import.meta.url));

  it("ensureBooking calls stampInquiryBookedAt after ensureOfferBooking", () => {
    const src = readFileSync(join(here, "accept-offer-payment.ts"), "utf8");
    assert.match(src, /stampInquiryBookedAt/);
    const start = src.indexOf("async ensureBooking");
    assert.ok(start >= 0);
    const body = src.slice(start, start + 900);
    assert.match(body, /ensureOfferBooking/);
    assert.match(body, /stampInquiryBookedAt/);
  });

  it("stamp helper only writes when booked_at is still null", () => {
    const src = readFileSync(join(here, "stamp-inquiry-booked-at.ts"), "utf8");
    assert.match(src, /\.update\(\{ booked_at:/);
    assert.match(src, /\.is\("booked_at", null\)/);
  });
});
