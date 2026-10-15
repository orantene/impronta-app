// TUL-739: a Mexican profesional was refused with "Payouts aren't available in
// Mexico yet" (English, on an ES page) even with STRIPE_MX_SECRET_KEY set. The
// MX seller was routed to the Mexico platform, but the create payload still
// sent the cross-border RECIPIENT service agreement, which Stripe rejects for a
// domestic MX account on the MX platform. The catch then showed the English copy.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveStripeAccountForSeller } from "../stripe/account-routing";
import {
  connectAccountTermsFor,
  payoutSetupErrorCode,
  payoutSetupErrorText,
  MX_PLATFORM_UNCONFIGURED,
} from "./connect-account-setup";

describe("TUL-739 MX onboarding on the MX platform", () => {
  it("MX seller with the MX key set routes to the MX platform", () => {
    assert.equal(resolveStripeAccountForSeller({ payoutCountry: "MX", mxConfigured: true }), "mx");
  });

  it("an MX account on the MX platform is domestic: no recipient agreement, full capabilities", () => {
    const t = connectAccountTermsFor("MX", "mx");
    assert.equal(t.recipientAgreement, false);
    assert.equal(t.cardPayments, true);
  });

  it("the US platform keeps the recipient agreement for MX and other LatAm", () => {
    for (const c of ["MX", "AR", "CO"]) {
      const t = connectAccountTermsFor(c, "us");
      assert.equal(t.recipientAgreement, true, c);
      assert.equal(t.cardPayments, false, c);
    }
    assert.deepEqual(connectAccountTermsFor("US", "us"), { recipientAgreement: false, cardPayments: true });
  });

  it("both create sites use the platform-aware terms, not the bare country check", () => {
    for (const f of ["stripe-connect-talent.ts", "stripe-connect.ts"]) {
      const src = readFileSync(join(__dirname, f), "utf8");
      assert.match(src, /connectAccountTermsFor\(country, platform\)/, f);
      assert.doesNotMatch(src, /requiresRecipientAgreement\(country\)/, f);
      assert.doesNotMatch(src, /Payouts aren't available in/, f);
    }
  });
});

describe("TUL-739 payout setup errors are localized", () => {
  it("unconfigured MX platform has ES and EN copy without em dashes", () => {
    const es = payoutSetupErrorText(MX_PLATFORM_UNCONFIGURED, true);
    const en = payoutSetupErrorText(MX_PLATFORM_UNCONFIGURED, false);
    assert.match(es, /México/);
    assert.match(en, /Mexico/);
    assert.notEqual(es, en);
    for (const s of [es, en]) assert.doesNotMatch(s, /—/);
  });

  it("country refusal codes render in Spanish with the Spanish country name", () => {
    const code = payoutSetupErrorCode("MX", "connect");
    const es = payoutSetupErrorText(code, true);
    assert.match(es, /México/);
    assert.doesNotMatch(es, /aren't|Mexico\b/);
    assert.match(payoutSetupErrorText(code, false), /Mexico/);
    const gp = payoutSetupErrorText(payoutSetupErrorCode("AR", "global_payouts"), true);
    assert.match(gp, /Argentina/);
    assert.match(gp, /banco local/);
  });

  it("unknown messages pass through unchanged", () => {
    assert.equal(payoutSetupErrorText("Sign in required.", true), "Sign in required.");
  });
});
