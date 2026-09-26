import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PAY_PLATFORM_HOST,
  PAY_PLATFORM_ORIGIN,
  paymentLinkPathPrefix,
  paymentLinkPublicUrl,
} from "./pay-link-url";

describe("paymentLinkPathPrefix", () => {
  it("uses /link on the platform pay host", () => {
    assert.equal(paymentLinkPathPrefix(PAY_PLATFORM_ORIGIN), "/link");
    assert.equal(paymentLinkPathPrefix(`https://${PAY_PLATFORM_HOST}/`), "/link");
  });

  it("uses /pay on branded seller hosts", () => {
    assert.equal(paymentLinkPathPrefix("https://qa-stripe-r2.tulala.digital"), "/pay");
    assert.equal(paymentLinkPathPrefix("https://impronta.tulala.digital"), "/pay");
    assert.equal(paymentLinkPathPrefix("https://casarizo.com"), "/pay");
  });
});

describe("paymentLinkPublicUrl", () => {
  it("mints platform fallback on /link", () => {
    assert.equal(
      paymentLinkPublicUrl(PAY_PLATFORM_ORIGIN, "abc12345"),
      "https://pay.tulala.digital/link/abc12345",
    );
  });

  it("mints branded URLs on /pay", () => {
    assert.equal(
      paymentLinkPublicUrl("https://qa-stripe-r2.tulala.digital/", "abc12345"),
      "https://qa-stripe-r2.tulala.digital/pay/abc12345",
    );
  });
});
