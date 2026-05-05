import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCustomDomainRoutingRecords,
  customDomainCanBecomePrimary,
  isLikelyApexCustomDomain,
} from "./custom-domain-routing";

test("isLikelyApexCustomDomain handles common second-level suffixes", () => {
  assert.equal(isLikelyApexCustomDomain("example.co.uk"), true);
  assert.equal(isLikelyApexCustomDomain("www.example.co.uk"), false);
});

test("buildCustomDomainRoutingRecords emits CNAME host labels for nested subdomains", () => {
  assert.deepEqual(buildCustomDomainRoutingRecords("www.studio.example.com"), [
    {
      type: "CNAME",
      host: "www.studio",
      value: "cname.vercel-dns-0.com",
    },
  ]);
});

test("custom domains can become primary only once active", () => {
  assert.equal(customDomainCanBecomePrimary("verified"), false);
  assert.equal(customDomainCanBecomePrimary("ssl_provisioned"), false);
  assert.equal(customDomainCanBecomePrimary("active"), true);
});
