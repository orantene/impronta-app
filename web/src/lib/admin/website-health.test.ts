/**
 * website-health.test.ts — the Site Health report builder.
 *
 * Covers every severity the panel can render, the healthy collapse, the Forms
 * capability gate, and the honesty rules: an unsupplied per-page SEO flag must
 * never become a finding, and no site-level robots/sitemap claim exists to be
 * made in the first place (the builder takes no such input, which this file
 * pins by construction — see `fixture-only inputs` below).
 *
 * LANE: `test:builder-capabilities:a`.
 * Run: node_modules/.bin/tsx --test src/lib/admin/website-health.test.ts
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWebsiteHealthReport,
  type WebsiteHealthInput,
  type WebsiteHealthPageInput,
} from "./website-health";
import type { RedirectRecord } from "@/lib/site-admin/redirects";

/** A workspace with nothing wrong: live custom domain, one live page, no redirects. */
function healthyInput(overrides: Partial<WebsiteHealthInput> = {}): WebsiteHealthInput {
  return {
    domain: {
      primaryHost: "acme.example",
      customDomainHost: "acme.example",
      customDomainStatus: "active",
      failureReason: null,
    },
    pages: [{ status: "published", noindex: false, includeInSitemap: true }],
    redirects: [],
    forms: { visible: false, unreadCount: 0 },
    ...overrides,
  };
}

function redirect(
  id: string,
  oldPath: string,
  newPath: string,
  active = true,
): RedirectRecord {
  return {
    id,
    oldPath,
    newPath,
    statusCode: 301,
    active,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: null,
  };
}

const idsOf = (r: ReturnType<typeof buildWebsiteHealthReport>) =>
  r.findings.map((f) => f.id);

/* ────────────────────────────── healthy ─────────────────────────────── */

test("a healthy site collapses to one ok finding", () => {
  const report = buildWebsiteHealthReport(healthyInput());
  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0]!.severity, "ok");
  assert.equal(report.findings[0]!.id, "all-clear");
  assert.deepEqual(report.counts, { critical: 0, warning: 0, info: 0 });
});

test("a verified-but-not-yet-active custom domain is still healthy", () => {
  for (const status of ["verified", "ssl_provisioned", "active"] as const) {
    const report = buildWebsiteHealthReport(
      healthyInput({
        domain: {
          primaryHost: "acme.example",
          customDomainHost: "acme.example",
          customDomainStatus: status,
          failureReason: null,
        },
      }),
    );
    assert.deepEqual(idsOf(report), ["all-clear"], `status ${status}`);
  }
});

test("every finding carries i18n keys, never English strings", () => {
  const report = buildWebsiteHealthReport(
    healthyInput({
      domain: {
        primaryHost: "acme.tulala.digital",
        customDomainHost: "acme.example",
        customDomainStatus: "failed",
        failureReason: "CNAME missing",
      },
      pages: [
        { status: "published", noindex: true },
        { status: "draft" },
      ],
      redirects: [redirect("a", "/x", "/y"), redirect("b", "/y", "/x")],
      forms: { visible: true, unreadCount: 3 },
    }),
  );
  assert.ok(report.findings.length > 3);
  for (const f of report.findings) {
    for (const key of [f.titleKey, f.detailKey, f.fixLabelKey, f.infoTipKey]) {
      if (key === undefined) continue;
      assert.match(key, /^dashboard\.adminWebsite\.health\./, `key ${key}`);
    }
  }
});

/* ────────────────────────────── domain ──────────────────────────────── */

test("no custom domain is info, not a problem", () => {
  const report = buildWebsiteHealthReport(
    healthyInput({
      domain: {
        primaryHost: "acme.tulala.digital",
        customDomainHost: null,
        customDomainStatus: null,
        failureReason: null,
      },
    }),
  );
  assert.deepEqual(idsOf(report), ["domain-none"]);
  const f = report.findings[0]!;
  assert.equal(f.severity, "info");
  assert.equal(f.fixDrawer, "domain");
  assert.deepEqual(f.detailVars, { host: "acme.tulala.digital" });
});

test("no custom domain and no host at all uses the host-free copy", () => {
  const report = buildWebsiteHealthReport(
    healthyInput({
      domain: {
        primaryHost: null,
        customDomainHost: null,
        customDomainStatus: null,
        failureReason: null,
      },
    }),
  );
  const f = report.findings[0]!;
  assert.equal(f.detailKey, "dashboard.adminWebsite.health.domainNone.detailNoHost");
  assert.equal(f.detailVars, undefined);
});

test("a pending custom domain is a warning", () => {
  for (const status of ["pending", "dns_verification_sent", null] as const) {
    const report = buildWebsiteHealthReport(
      healthyInput({
        domain: {
          primaryHost: "acme.tulala.digital",
          customDomainHost: "acme.example",
          customDomainStatus: status,
          failureReason: null,
        },
      }),
    );
    assert.deepEqual(idsOf(report), ["domain-pending"], `status ${String(status)}`);
    assert.equal(report.findings[0]!.severity, "warning");
    assert.equal(report.counts.warning, 1);
  }
});

test("a failed custom domain is critical and surfaces the registry reason", () => {
  const report = buildWebsiteHealthReport(
    healthyInput({
      domain: {
        primaryHost: "acme.tulala.digital",
        customDomainHost: "acme.example",
        customDomainStatus: "failed",
        failureReason: "CNAME record not found",
      },
    }),
  );
  const f = report.findings[0]!;
  assert.equal(f.id, "domain-failed");
  assert.equal(f.severity, "critical");
  assert.equal(f.detailKey, "dashboard.adminWebsite.health.domainFailed.detailWithReason");
  assert.deepEqual(f.detailVars, { host: "acme.example", reason: "CNAME record not found" });
  assert.equal(report.counts.critical, 1);
});

test("a failed domain with a blank reason falls back to the reason-free copy", () => {
  const report = buildWebsiteHealthReport(
    healthyInput({
      domain: {
        primaryHost: "acme.tulala.digital",
        customDomainHost: "acme.example",
        customDomainStatus: "suspended",
        failureReason: "   ",
      },
    }),
  );
  const f = report.findings[0]!;
  assert.equal(f.detailKey, "dashboard.adminWebsite.health.domainFailed.detail");
  assert.deepEqual(f.detailVars, { host: "acme.example" });
});

/* ─────────────────────── search visibility (honesty) ─────────────────── */

test("published pages flagged noindex become a warning", () => {
  const pages: WebsiteHealthPageInput[] = [
    { status: "published", noindex: true },
    { status: "published", noindex: true },
    { status: "published", noindex: false },
    // A draft page being noindexed is not news — it is not live anyway.
    { status: "draft", noindex: true },
  ];
  const report = buildWebsiteHealthReport(healthyInput({ pages }));
  const f = report.findings.find((x) => x.id === "pages-noindex");
  assert.ok(f);
  assert.equal(f.severity, "warning");
  assert.deepEqual(f.detailVars, { count: 2 });
  assert.equal(f.fixHref, "/website");
});

test("published pages excluded from the sitemap become a warning", () => {
  const report = buildWebsiteHealthReport(
    healthyInput({
      pages: [
        { status: "published", includeInSitemap: false },
        { status: "published", includeInSitemap: true },
      ],
    }),
  );
  const f = report.findings.find((x) => x.id === "pages-sitemap");
  assert.ok(f);
  assert.deepEqual(f.detailVars, { count: 1 });
});

test("fixture-only inputs produce no finding: absent SEO flags are never a claim", () => {
  // Prototype mode supplies neither column. `undefined` must NOT be read as
  // "noindex is off" OR "sitemap is off" — it means the loader said nothing.
  const report = buildWebsiteHealthReport(
    healthyInput({
      pages: [
        { status: "published" },
        { status: "published" },
        { status: "published" },
      ],
    }),
  );
  assert.deepEqual(idsOf(report), ["all-clear"]);
});

/* ───────────────────────────── redirects ────────────────────────────── */

test("a redirect loop is reported as a warning", () => {
  const report = buildWebsiteHealthReport(
    healthyInput({
      redirects: [redirect("a", "/old", "/new"), redirect("b", "/new", "/old")],
    }),
  );
  const f = report.findings.find((x) => x.id === "redirect-loops");
  assert.ok(f);
  assert.equal(f.severity, "warning");
  assert.equal(f.fixHref, "/website/redirects");
  assert.equal((f.detailVars as { count: number }).count, 2);
});

test("a redirect chain is reported separately from a loop", () => {
  const report = buildWebsiteHealthReport(
    healthyInput({
      redirects: [
        redirect("a", "/one", "/two"),
        redirect("b", "/two", "/three"),
      ],
    }),
  );
  assert.deepEqual(idsOf(report), ["redirect-chains"]);
  assert.equal(report.findings[0]!.detailVars!.count, 1);
});

test("inactive redirects do not manufacture chains", () => {
  const report = buildWebsiteHealthReport(
    healthyInput({
      redirects: [
        redirect("a", "/one", "/two"),
        redirect("b", "/two", "/three", false),
      ],
    }),
  );
  assert.deepEqual(idsOf(report), ["all-clear"]);
});

/* ──────────────────────────── content state ─────────────────────────── */

test("drafts and scheduled pages are info, counted separately", () => {
  const report = buildWebsiteHealthReport(
    healthyInput({
      pages: [
        { status: "published" },
        { status: "draft" },
        { status: "draft" },
        { status: "draft", scheduledPublishAt: "2099-01-01T00:00:00.000Z" },
      ],
    }),
  );
  const draft = report.findings.find((x) => x.id === "pages-draft");
  const scheduled = report.findings.find((x) => x.id === "pages-scheduled");
  assert.ok(draft);
  assert.ok(scheduled);
  assert.equal(draft.severity, "info");
  assert.deepEqual(draft.detailVars, { count: 2 });
  assert.deepEqual(scheduled.detailVars, { count: 1 });
  assert.deepEqual(report.counts, { critical: 0, warning: 0, info: 2 });
});

/* ────────────────────────────── forms gate ──────────────────────────── */

test("the forms finding is absent when the viewer cannot see Forms", () => {
  const report = buildWebsiteHealthReport(
    healthyInput({ forms: { visible: false, unreadCount: 9 } }),
  );
  assert.deepEqual(idsOf(report), ["all-clear"]);
});

test("the forms finding appears when the viewer can see Forms", () => {
  const report = buildWebsiteHealthReport(
    healthyInput({ forms: { visible: true, unreadCount: 9 } }),
  );
  const f = report.findings.find((x) => x.id === "forms-unread");
  assert.ok(f);
  assert.equal(f.severity, "info");
  assert.equal(f.fixHref, "/website/forms");
  assert.deepEqual(f.detailVars, { count: 9 });
});

test("an empty forms inbox says nothing", () => {
  const report = buildWebsiteHealthReport(
    healthyInput({ forms: { visible: true, unreadCount: 0 } }),
  );
  assert.deepEqual(idsOf(report), ["all-clear"]);
});

/* ────────────────────────────── ordering ────────────────────────────── */

test("findings are ordered critical → warning → info", () => {
  const report = buildWebsiteHealthReport({
    domain: {
      primaryHost: "acme.tulala.digital",
      customDomainHost: "acme.example",
      customDomainStatus: "failed",
      failureReason: "no A record",
    },
    pages: [
      { status: "published", noindex: true },
      { status: "draft" },
    ],
    redirects: [redirect("a", "/x", "/y"), redirect("b", "/y", "/x")],
    forms: { visible: true, unreadCount: 2 },
  });
  assert.deepEqual(idsOf(report), [
    "domain-failed",
    "pages-noindex",
    "redirect-loops",
    "pages-draft",
    "forms-unread",
  ]);
  assert.deepEqual(report.counts, { critical: 1, warning: 2, info: 2 });
});
