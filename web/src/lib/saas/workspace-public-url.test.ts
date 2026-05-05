import assert from "node:assert/strict";
import test from "node:test";

import {
  brandedSubdomainEligible,
  customDomainEligible,
  resolveWorkspacePublicAddress,
  workspacePathHost,
  workspacePathUrl,
} from "./workspace-public-url";

test("workspace path helpers produce the canonical Tulala path URL", () => {
  assert.equal(workspacePathHost("impronta"), "tulala.digital/impronta");
  assert.equal(workspacePathUrl("impronta"), "https://tulala.digital/impronta");
});

test("free plan resolves to the Tulala path URL even when a subdomain row exists", () => {
  const result = resolveWorkspacePublicAddress({
    slug: "impronta",
    plan: "free",
    domainState: {
      primaryHost: "impronta.tulala.digital",
      primaryHostKind: "subdomain",
      subdomainHost: "impronta.tulala.digital",
    },
  });

  assert.equal(brandedSubdomainEligible("free"), false);
  assert.equal(customDomainEligible("free"), false);
  assert.equal(result.primaryKind, "path");
  assert.equal(result.primaryHost, "tulala.digital/impronta");
});

test("studio plan prefers the branded subdomain when present", () => {
  const result = resolveWorkspacePublicAddress({
    slug: "impronta",
    plan: "studio",
    domainState: {
      primaryHost: "impronta.tulala.digital",
      primaryHostKind: "subdomain",
      subdomainHost: "impronta.tulala.digital",
    },
  });

  assert.equal(brandedSubdomainEligible("studio"), true);
  assert.equal(customDomainEligible("studio"), false);
  assert.equal(result.primaryKind, "subdomain");
  assert.equal(result.primaryHost, "impronta.tulala.digital");
  assert.equal(result.primaryUrl, "https://impronta.tulala.digital");
});

test("agency plan prefers the connected custom domain when it is primary", () => {
  const result = resolveWorkspacePublicAddress({
    slug: "impronta",
    plan: "agency",
    domainState: {
      primaryHost: "improntamodels.com",
      primaryHostKind: "custom",
      subdomainHost: "impronta.tulala.digital",
    },
  });

  assert.equal(brandedSubdomainEligible("agency"), true);
  assert.equal(customDomainEligible("agency"), true);
  assert.equal(result.primaryKind, "custom");
  assert.equal(result.primaryHost, "improntamodels.com");
  assert.equal(result.primaryUrl, "https://improntamodels.com");
});
