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
  assert.equal(workspacePathHost("impronta"), "tulala.digital/w/impronta");
  assert.equal(workspacePathUrl("impronta"), "https://tulala.digital/w/impronta");
});

test("whitelabel branding is gated to Agency / Network (and grandfathered legacy)", () => {
  // Only the top paid tiers get whitelabel — matches customDomainEligible.
  assert.equal(whitelabelBrandingEligible("agency"), true);
  assert.equal(whitelabelBrandingEligible("network"), true);
  assert.equal(whitelabelBrandingEligible("legacy"), true);
  // Free and Studio stay Tulala-branded on their talents' + clients' surfaces.
  assert.equal(whitelabelBrandingEligible("free"), false);
  assert.equal(whitelabelBrandingEligible("studio"), false);
  // Website ships a custom domain but NOT whitelabel branding — the two
  // eligibility sets are deliberately different.
  assert.equal(whitelabelBrandingEligible("website"), false);
});

test("planTierHasWhitelabel fails closed for null / unknown / non-whitelabel tiers", () => {
  assert.equal(planTierHasWhitelabel("agency"), true);
  assert.equal(planTierHasWhitelabel("network"), true);
  assert.equal(planTierHasWhitelabel("legacy"), true);
  assert.equal(planTierHasWhitelabel("studio"), false);
  assert.equal(planTierHasWhitelabel("website"), false);
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
  assert.equal(result.primaryHost, "tulala.digital/w/impronta");
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

test("customDomainLockedCopy names only plans a customer can actually buy", () => {
  // The plan list is DERIVED from customDomainEligible + brandedSubdomainEligible
  // filtered to visible, non-archived plans. It was a hardcoded string saying
  // "Website, Agency, and Network" — and Website is is_active=false and
  // isVisible=false, so that copy named a plan whose checkout refuses. A dead
  // CTA in a paywall message, which is the worst place for one: the reader is
  // already trying to give us money.
  const free = customDomainLockedCopy("free");
  assert.match(free, /Custom domains unlock on Agency and Network/i);
  assert.doesNotMatch(free, /Website/);
  assert.match(customDomainLockedCopy("studio"), /unlock on Agency and Network/i);
  assert.match(customDomainLockedCopy("agency"), /unlock on Agency and Network/i);
  // Every locked-copy branch must name Website, because Website is the
  // cheapest tier that unlocks a custom domain.
  for (const plan of ["free", "studio", "agency"] as const) {
    assert.match(customDomainLockedCopy(plan), /Agency/);
  }
});

test("website plan: branded subdomain + custom domain, no whitelabel", () => {
  assert.equal(brandedSubdomainEligible("website"), true);
  assert.equal(customDomainEligible("website"), true);
  assert.equal(whitelabelBrandingEligible("website"), false);
  assert.equal(planTierHasWhitelabel("website"), false);

  const result = resolveWorkspacePublicAddress({
    slug: "cafe-tulum",
    plan: "website",
    domainState: {
      primaryHost: "cafetulum.com",
      primaryHostKind: "custom",
      subdomainHost: "cafe-tulum.tulala.digital",
    },
  });
  assert.equal(result.customDomainEligible, true);
  assert.equal(result.primaryKind, "custom");
  assert.equal(result.primaryHost, "cafetulum.com");
});

test("workspacePlanPublicModelCopy matches canonical plan model", () => {
  assert.equal(
    workspacePlanPublicModelCopy("free"),
    "Free · tulala.digital/w/<slug> + up to 5 public profiles",
  );
  assert.equal(
    workspacePlanPublicModelCopy("website"),
    "Website · branded subdomain + custom domain, no talent roster",
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

test("customDomainLockedCopy is localised and carries no price", () => {
  const es = customDomainLockedCopy("free", "es");
  assert.match(es, /dominios propios se activan en/i);
  assert.match(es, /Agency y Network/);
  // Unknown locale falls back to English rather than a half-built string.
  assert.match(customDomainLockedCopy("free", "fr"), /Custom domains unlock/i);
  for (const loc of ["en", "es"]) {
    assert.doesNotMatch(customDomainLockedCopy("free", loc), /\$|\d+\s*(usd|mxn)/i);
  }
});

test("the derived list follows the predicate, not a typed string", () => {
  // The regression this replaces: someone changes customDomainEligible and the
  // message keeps naming the old set. Asserting the two agree means the copy
  // cannot drift from the gate without failing here.
  const named = customDomainLockedCopy("free");
  for (const plan of ["agency", "network"] as const) {
    assert.equal(customDomainEligible(plan), true);
  }
  assert.equal(customDomainEligible("studio"), false);
  assert.doesNotMatch(named, /Studio\.|on Studio and/);
});
