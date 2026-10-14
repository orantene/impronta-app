import assert from "node:assert/strict";
import test from "node:test";

import { buildPurchasedTalentDomainRow } from "./talent-domain-purchase-activation";

const BASE = {
  talentProfileId: "talent-1",
  domain: "studio.example",
  sessionId: "cs_test_1",
  orderId: "ord_1",
  registrantEmail: "owner@example.com",
  nowIso: "2026-10-09T12:00:00.000Z",
  makePrimary: true,
};

test("purchased attach success → active, no TXT token, primary", () => {
  const row = buildPurchasedTalentDomainRow({
    ...BASE,
    attach: {
      attempted: true,
      attached: true,
      alreadyExists: false,
      verified: true,
      errorMessage: null,
      skippedReason: null,
    },
    verify: null,
  });

  assert.equal(row.status, "active");
  assert.equal(row.verification_token, null);
  assert.equal(row.acquisition, "purchased");
  assert.equal(row.is_primary, true);
  assert.equal(row.verified_at, BASE.nowIso);
  assert.equal(row.ssl_provisioned_at, BASE.nowIso);
  assert.equal(row.failure_reason, null);
  assert.equal(row.vercel_order_id, "ord_1");
});

test("purchased already on project → active even when verify still false", () => {
  const row = buildPurchasedTalentDomainRow({
    ...BASE,
    makePrimary: false,
    attach: {
      attempted: true,
      attached: false,
      alreadyExists: true,
      verified: false,
      errorMessage: null,
      skippedReason: null,
    },
    verify: { verified: false },
  });

  assert.equal(row.status, "active");
  assert.equal(row.verification_token, null);
  assert.equal(row.is_primary, false);
});

test("purchased attach failure → error with failure_reason, never dns_verification_sent", () => {
  const row = buildPurchasedTalentDomainRow({
    ...BASE,
    attach: {
      attempted: true,
      attached: false,
      alreadyExists: false,
      verified: null,
      errorMessage: "domain_taken_elsewhere",
      skippedReason: null,
    },
    verify: null,
  });

  assert.equal(row.status, "error");
  assert.equal(row.verification_token, null);
  assert.equal(row.failure_reason, "domain_taken_elsewhere");
  assert.equal(row.is_primary, false);
  assert.equal(row.verified_at, null);
});

test("purchased attach skipped (no Vercel env) → error, not pending TXT", () => {
  const row = buildPurchasedTalentDomainRow({
    ...BASE,
    attach: {
      attempted: false,
      attached: false,
      alreadyExists: false,
      verified: null,
      errorMessage: null,
      skippedReason: "VERCEL_PROJECT_ID is not configured.",
    },
    verify: null,
  });

  assert.equal(row.status, "error");
  assert.match(row.failure_reason ?? "", /VERCEL_PROJECT_ID/);
  assert.equal(row.verification_token, null);
});
