import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DOMAIN_STATUS_META,
  agencyDomainDnsRows,
  domainCanBecomePrimary,
  domainNeedsRoutingCheck,
  domainNeedsTxtVerification,
  type AgencyDomainRowStatus,
} from "./website-domain-rows";
import {
  VERCEL_APEX_A_RECORD,
  VERCEL_GENERAL_CNAME_TARGET,
} from "@/lib/saas/custom-domain-routing";

const ALL_STATUSES: AgencyDomainRowStatus[] = [
  "pending",
  "dns_verification_sent",
  "verified",
  "ssl_provisioned",
  "active",
  "failed",
  "suspended",
];

test("every registry status has chip meta", () => {
  for (const status of ALL_STATUSES) {
    const meta = DOMAIN_STATUS_META[status];
    assert.ok(meta, `missing meta for ${status}`);
    assert.ok(meta.labelKey.length > 0);
  }
});

test("apex domain: A record at @, TXT at @ with the real token", () => {
  const { txt, routing } = agencyDomainDnsRows("acme-models.com", "impronta-verify-abc123");
  assert.deepEqual(routing, [
    { type: "A", host: "@", value: VERCEL_APEX_A_RECORD },
  ]);
  assert.deepEqual(txt, {
    type: "TXT",
    host: "@",
    value: "impronta-verify-abc123",
  });
});

test("subdomain: CNAME + TXT share the sub-label host", () => {
  const { txt, routing } = agencyDomainDnsRows("www.acme-models.com", "impronta-verify-xyz");
  assert.deepEqual(routing, [
    { type: "CNAME", host: "www", value: VERCEL_GENERAL_CNAME_TARGET },
  ]);
  assert.equal(txt?.host, "www");
  assert.equal(txt?.value, "impronta-verify-xyz");
});

test("no verification token renders NO TXT row - never an invented record", () => {
  const { txt, routing } = agencyDomainDnsRows("acme-models.com", null);
  assert.equal(txt, null);
  assert.equal(routing.length, 1);
});

test("action derivations follow the server's transitions", () => {
  assert.equal(domainNeedsTxtVerification("pending"), true);
  assert.equal(domainNeedsTxtVerification("dns_verification_sent"), true);
  assert.equal(domainNeedsTxtVerification("verified"), false);
  assert.equal(domainNeedsTxtVerification("active"), false);

  assert.equal(domainNeedsRoutingCheck("verified"), true);
  assert.equal(domainNeedsRoutingCheck("ssl_provisioned"), true);
  assert.equal(domainNeedsRoutingCheck("active"), false);
  assert.equal(domainNeedsRoutingCheck("dns_verification_sent"), false);
});

test("make-primary matches switchPrimaryDomainAction gates", () => {
  // Custom domains: only fully active rows (customDomainCanBecomePrimary).
  assert.equal(
    domainCanBecomePrimary({ kind: "custom", status: "active", isPrimary: false }),
    true,
  );
  assert.equal(
    domainCanBecomePrimary({ kind: "custom", status: "verified", isPrimary: false }),
    false,
  );
  // Already primary: never offered.
  assert.equal(
    domainCanBecomePrimary({ kind: "custom", status: "active", isPrimary: true }),
    false,
  );
  // Subdomains: always eligible (the Tulala fallback host).
  assert.equal(
    domainCanBecomePrimary({ kind: "subdomain", status: "active", isPrimary: false }),
    true,
  );
});
