import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

import {
  brandedSubdomainEligible,
  customDomainLockedCopy,
  customDomainEligible,
  planTierHasWhitelabel,
  resolveWorkspacePublicAddress,
  whitelabelBrandingEligible,
  workspacePlanPublicModelCopy,
  workspacePathHost,
  workspacePathUrl,
} from "./workspace-public-url";

test("workspace path helpers produce the canonical Tulala path URL", () => {
  assert.equal(workspacePathHost("impronta"), "tulala.digital/impronta");
  assert.equal(workspacePathUrl("impronta"), "https://tulala.digital/impronta");
});

test("whitelabel branding is gated to Agency / Network (and grandfathered legacy)", () => {
  // Only the top paid tiers get whitelabel — matches customDomainEligible.
  assert.equal(whitelabelBrandingEligible("agency"), true);
  assert.equal(whitelabelBrandingEligible("network"), true);
  assert.equal(whitelabelBrandingEligible("legacy"), true);
  // Free and Studio stay Tulala-branded on their talents' + clients' surfaces.
  assert.equal(whitelabelBrandingEligible("free"), false);
  assert.equal(whitelabelBrandingEligible("studio"), false);
});

test("planTierHasWhitelabel fails closed for null / unknown / non-whitelabel tiers", () => {
  assert.equal(planTierHasWhitelabel("agency"), true);
  assert.equal(planTierHasWhitelabel("network"), true);
  assert.equal(planTierHasWhitelabel("legacy"), true);
  assert.equal(planTierHasWhitelabel("studio"), false);
  assert.equal(planTierHasWhitelabel("free"), false);
  assert.equal(planTierHasWhitelabel(null), false);
  assert.equal(planTierHasWhitelabel(undefined), false);
  assert.equal(planTierHasWhitelabel("enterprise-typo"), false);
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

test("domain lock and plan model copy stay centralized in shared helpers [durable scan — was brittle stale-path, fixed 2026-05-19]", () => {
  // ROOT CAUSE of the prior RED (predated the remediation series): this guard
  // hardcoded three file paths; an earlier refactor deleted
  // `admin/settings/SettingsClientShell.tsx` and moved the lock copy off
  // `admin/site/page.tsx`, so `readFileSync` threw / `customDomainLockedCopy(`
  // was absent — a FALSE red. The underlying invariant (the copy is NEVER
  // re-inlined; it lives only in this module) was, and is, genuinely held.
  // Fixed by asserting the invariant STRUCTURALLY (recursive scan) so it
  // survives legitimate file moves but still catches real re-inlining.
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(thisDir, "../../..");

  // 1. Single source of truth: both copy helpers are defined here and nowhere
  //    else exports them.
  const helperSrc = readFileSync(
    path.join(repoRoot, "src/lib/saas/workspace-public-url.ts"),
    "utf8",
  );
  assert.match(helperSrc, /export function customDomainLockedCopy\(/, "lock copy centralized here");
  assert.match(helperSrc, /export function workspacePlanPublicModelCopy\(/, "plan-model copy centralized here");

  // 2. No surface re-inlines the canonical copy. Recursively scan the whole
  //    app + components trees (not a fragile hardcoded path list) for the
  //    verbatim phrases that must only ever come from the helper.
  const FORBIDDEN_REINLINED = [
    /Branded subdomains unlock on Studio/,
    /Studio includes the branded Tulala subdomain/,
    /tulala\.digital\/<slug> \+ up to 5 public profiles/,
  ];
  const offenders: string[] = [];
  for (const rel of ["src/app", "src/components"]) {
    const root = path.join(repoRoot, rel);
    let entries: string[] = [];
    try {
      entries = readdirSync(root, { recursive: true }) as string[];
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!/\.(tsx?|jsx?)$/.test(e)) continue;
      const full = path.join(root, e);
      let body: string;
      try {
        body = readFileSync(full, "utf8");
      } catch {
        continue; // a directory entry from recursive readdir
      }
      if (FORBIDDEN_REINLINED.some((re) => re.test(body))) {
        offenders.push(path.join(rel, e));
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `domain-lock / plan-model copy must come from the shared helper, not be re-inlined. Offending files: ${offenders.join(", ")}`,
  );

  // 3. The surface that currently renders the lock copy goes through the
  //    helper (positive proof the centralization is actually wired, not just
  //    that nobody re-inlined it).
  const domainActions = readFileSync(
    path.join(repoRoot, "src/app/(workspace)/[tenantSlug]/admin/settings/domain-actions.ts"),
    "utf8",
  );
  assert.match(domainActions, /customDomainLockedCopy\(/, "the live lock-copy surface uses the shared helper");
});
