import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

import {
  brandedSubdomainEligible,
  customDomainLockedCopy,
  customDomainEligible,
  resolveWorkspacePublicAddress,
  workspacePlanPublicModelCopy,
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

test("customDomainLockedCopy keeps upgrade guidance aligned to plan tier", () => {
  assert.match(customDomainLockedCopy("free"), /unlock on Studio/i);
  assert.match(customDomainLockedCopy("studio"), /unlock on Agency and Network/i);
  assert.match(customDomainLockedCopy("agency"), /unlock on Agency and Network/i);
});

test("workspacePlanPublicModelCopy matches canonical plan model", () => {
  assert.equal(
    workspacePlanPublicModelCopy("free"),
    "Free · tulala.digital/<slug> + up to 5 public profiles",
  );
  assert.equal(
    workspacePlanPublicModelCopy("studio"),
    "Studio · branded subdomain (optional)",
  );
  assert.equal(
    workspacePlanPublicModelCopy("agency"),
    "Agency · branded subdomain + custom domain",
  );
  assert.equal(
    workspacePlanPublicModelCopy("network"),
    "Network · shared templates and multi-workspace controls",
  );
  assert.equal(
    workspacePlanPublicModelCopy("legacy"),
    "Agency · branded subdomain + custom domain",
  );
});

test("domain lock and plan model copy stay centralized in shared helpers", () => {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(thisDir, "../../..");
  const targets = [
    "src/app/(workspace)/[tenantSlug]/admin/site/page.tsx",
    "src/app/(workspace)/[tenantSlug]/admin/settings/SettingsClientShell.tsx",
    "src/app/(workspace)/[tenantSlug]/admin/settings/domain-actions.ts",
  ];
  for (const relative of targets) {
    const source = readFileSync(path.join(repoRoot, relative), "utf8");
    assert.match(source, /customDomainLockedCopy\(/);
    assert.doesNotMatch(source, /Branded subdomains unlock on Studio/);
    assert.doesNotMatch(source, /Studio includes the branded Tulala subdomain/);
  }
});
