import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  isLiveDomainStatus,
  normalizeWorkspaceUrlPlan,
  resolveLiveDomainState,
  workspaceLiveCustomDomain,
  workspaceLiveHost,
  workspaceLiveUrl,
} from "./workspace-live-url";

// M1 — the admin used to advertise `<slug>.tulala.digital` as the workspace's
// LIVE URL with a green dot and a Copy button. Self-serve signup never inserts
// an agency_domains row and Free is not branded-subdomain eligible, so that
// host returns the middleware's 404 "Host not registered".

test("a Free workspace with no domain rows resolves to the path host", () => {
  assert.equal(
    workspaceLiveHost({ slug: "acme", planTier: "free", domains: null }),
    "tulala.digital/w/acme",
  );
  assert.equal(
    workspaceLiveUrl({ slug: "acme", planTier: "free", domains: null }),
    "https://tulala.digital/w/acme",
  );
});

test("a Free workspace never gets a branded subdomain, even with a live row", () => {
  // Plan eligibility is the outer gate: a stray subdomain row must not promote
  // a Free workspace onto a paid-tier address.
  assert.equal(
    workspaceLiveHost({
      slug: "acme",
      planTier: "free",
      domains: {
        subdomains: [
          { hostname: "acme.tulala.digital", isPrimary: true, status: "active" },
        ],
      },
    }),
    "tulala.digital/w/acme",
  );
});

test("a pending subdomain row is not a live address", () => {
  assert.equal(
    workspaceLiveHost({
      slug: "acme",
      planTier: "studio",
      domains: {
        subdomains: [
          { hostname: "acme.tulala.digital", isPrimary: true, status: "pending" },
        ],
      },
    }),
    "tulala.digital/w/acme",
  );
});

test("an eligible plan with a live subdomain row uses the branded host", () => {
  for (const status of ["verified", "ssl_provisioned", "active"]) {
    assert.equal(
      workspaceLiveHost({
        slug: "acme",
        planTier: "studio",
        domains: {
          subdomains: [
            { hostname: "acme.tulala.digital", isPrimary: true, status },
          ],
        },
      }),
      "acme.tulala.digital",
      `status ${status} should count as live`,
    );
  }
});

test("a live custom domain wins over the branded subdomain", () => {
  assert.equal(
    workspaceLiveHost({
      slug: "acme",
      planTier: "agency",
      domains: {
        customDomains: [
          { hostname: "acme-models.com", isPrimary: true, status: "active" },
        ],
        subdomains: [
          { hostname: "acme.tulala.digital", isPrimary: true, status: "active" },
        ],
      },
    }),
    "acme-models.com",
  );
});

test("workspaceLiveCustomDomain is empty unless a live custom row exists", () => {
  assert.equal(workspaceLiveCustomDomain(null), "");
  assert.equal(
    workspaceLiveCustomDomain({
      customDomains: [
        { hostname: "acme-models.com", isPrimary: true, status: "pending" },
      ],
    }),
    "",
  );
  assert.equal(
    workspaceLiveCustomDomain({
      customDomains: [
        { hostname: "acme-models.com", isPrimary: true, status: "active" },
      ],
    }),
    "acme-models.com",
  );
});

test("resolveLiveDomainState prefers the primary row among live rows", () => {
  const state = resolveLiveDomainState({
    subdomains: [
      { hostname: "old.tulala.digital", isPrimary: false, status: "active" },
      { hostname: "new.tulala.digital", isPrimary: true, status: "active" },
    ],
  });
  assert.equal(state.primaryHost, "new.tulala.digital");
  assert.equal(state.primaryHostKind, "subdomain");
});

test("isLiveDomainStatus rejects every non-live status", () => {
  for (const status of [
    "pending",
    "dns_verification_sent",
    "failed",
    "suspended",
    null,
    undefined,
    "",
  ]) {
    assert.equal(isLiveDomainStatus(status), false, `status ${status}`);
  }
});

test("normalizeWorkspaceUrlPlan degrades unknown plans to free", () => {
  assert.equal(normalizeWorkspaceUrlPlan("studio"), "studio");
  assert.equal(normalizeWorkspaceUrlPlan("website"), "website");
  assert.equal(normalizeWorkspaceUrlPlan("AGENCY"), "agency");
  assert.equal(normalizeWorkspaceUrlPlan(null), "free");
  assert.equal(normalizeWorkspaceUrlPlan(undefined), "free");
  assert.equal(normalizeWorkspaceUrlPlan("enterprise"), "free");
});

test("admin storefront cards do not synthesize slug.tulala.digital", () => {
  const files = [
    "src/components/admin/shell/internal/page-modules/OverviewPage.tsx",
    "src/components/admin/shell/internal/messages/admin-1.tsx",
    "src/components/admin/shell/internal/messages/AdminOperationsShell.tsx",
  ];
  const synthesized = /\$\{[^}]*slug[^}]*\}\.tulala\.digital/;
  for (const rel of files) {
    const source = readFileSync(join(process.cwd(), rel), "utf8");
    assert.equal(
      source.match(synthesized),
      null,
      `${rel} still fabricates a branded host for Free storefronts`,
    );
  }
});
