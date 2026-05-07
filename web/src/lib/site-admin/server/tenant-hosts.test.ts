import assert from "node:assert/strict";
import test from "node:test";

import {
  pickPreferredTenantPreviewHost,
  resolveWorkspacePreviewUrl,
  tenantPreviewOriginFromHostname,
} from "./tenant-hosts";

test("pickPreferredTenantPreviewHost prefers a local preview host during dev even when a custom domain is primary", () => {
  const host = pickPreferredTenantPreviewHost(
    [
      {
        hostname: "brand.example",
        kind: "custom",
        status: "active",
        is_primary: true,
      },
      {
        hostname: "impronta.lvh.me",
        kind: "subdomain",
        status: "active",
        is_primary: false,
      },
    ],
    { isDev: true },
  );

  assert.equal(host, "impronta.lvh.me");
});

test("pickPreferredTenantPreviewHost prefers the primary custom domain in production", () => {
  const host = pickPreferredTenantPreviewHost(
    [
      {
        hostname: "brand.example",
        kind: "custom",
        status: "active",
        is_primary: true,
      },
      {
        hostname: "impronta.lvh.me",
        kind: "subdomain",
        status: "active",
        is_primary: false,
      },
    ],
    { isDev: false },
  );

  assert.equal(host, "brand.example");
});

test("pickPreferredTenantPreviewHost prefers custom domains over subdomains when all hosts are equally previewable", () => {
  const host = pickPreferredTenantPreviewHost(
    [
      {
        hostname: "impronta.local",
        kind: "subdomain",
        status: "active",
        is_primary: false,
      },
      {
        hostname: "brand.local",
        kind: "custom",
        status: "active",
        is_primary: false,
      },
    ],
    { isDev: true },
  );

  assert.equal(host, "brand.local");
});

test("tenantPreviewOriginFromHostname uses the local dev origin shape for preview hosts", () => {
  assert.equal(
    tenantPreviewOriginFromHostname("impronta.local", { isDev: true }),
    "http://impronta.local:3000",
  );
  assert.equal(
    tenantPreviewOriginFromHostname("brand.example", { isDev: false }),
    "https://brand.example",
  );
});

test("resolveWorkspacePreviewUrl keeps free workspaces on the path-based localhost preview", () => {
  const url = resolveWorkspacePreviewUrl({
    slug: "impronta",
    plan: "free",
    primaryHost: "impronta.tulala.digital",
    primaryHostKind: "subdomain",
    subdomainHost: "impronta.tulala.digital",
    domainRows: [
      {
        hostname: "impronta.tulala.digital",
        kind: "subdomain",
        status: "active",
        isPrimary: true,
      },
      {
        hostname: "impronta.local",
        kind: "subdomain",
        status: "active",
        isPrimary: false,
      },
    ],
    isDev: true,
  });

  assert.equal(url, "http://localhost:3000/impronta");
});

test("resolveWorkspacePreviewUrl uses the branded local preview host for studio when available", () => {
  const url = resolveWorkspacePreviewUrl({
    slug: "impronta",
    plan: "studio",
    primaryHost: "impronta.tulala.digital",
    primaryHostKind: "subdomain",
    subdomainHost: "impronta.tulala.digital",
    domainRows: [
      {
        hostname: "impronta.local",
        kind: "subdomain",
        status: "active",
        isPrimary: false,
      },
      {
        hostname: "impronta.tulala.digital",
        kind: "subdomain",
        status: "active",
        isPrimary: true,
      },
    ],
    isDev: true,
  });

  assert.equal(url, "http://impronta.local:3000");
});

test("resolveWorkspacePreviewUrl keeps localhost admin handoffs on the path tenant URL", () => {
  const url = resolveWorkspacePreviewUrl({
    slug: "impronta",
    plan: "agency",
    primaryHost: "improntamodels.com",
    primaryHostKind: "custom",
    subdomainHost: "impronta.tulala.digital",
    domainRows: [
      {
        hostname: "impronta.local",
        kind: "subdomain",
        status: "active",
        isPrimary: false,
      },
      {
        hostname: "improntamodels.com",
        kind: "custom",
        status: "active",
        isPrimary: true,
      },
    ],
    isDev: true,
    requestHost: "localhost:3000",
  });

  assert.equal(url, "http://localhost:3000/impronta");
});

test("resolveWorkspacePreviewUrl keeps branded local handoffs branded when already on that host", () => {
  const url = resolveWorkspacePreviewUrl({
    slug: "impronta",
    plan: "agency",
    primaryHost: "improntamodels.com",
    primaryHostKind: "custom",
    subdomainHost: "impronta.tulala.digital",
    domainRows: [
      {
        hostname: "impronta.local",
        kind: "subdomain",
        status: "active",
        isPrimary: false,
      },
      {
        hostname: "improntamodels.com",
        kind: "custom",
        status: "active",
        isPrimary: true,
      },
    ],
    isDev: true,
    requestHost: "impronta.local:3000",
  });

  assert.equal(url, "http://impronta.local:3000");
});

test("resolveWorkspacePreviewUrl falls back to the localhost path when no local branded preview host exists", () => {
  const url = resolveWorkspacePreviewUrl({
    slug: "impronta",
    plan: "agency",
    primaryHost: "brand.example",
    primaryHostKind: "custom",
    subdomainHost: "impronta.tulala.digital",
    domainRows: [
      {
        hostname: "brand.example",
        kind: "custom",
        status: "active",
        isPrimary: true,
      },
      {
        hostname: "impronta.tulala.digital",
        kind: "subdomain",
        status: "active",
        isPrimary: false,
      },
    ],
    isDev: true,
  });

  assert.equal(url, "http://localhost:3000/impronta");
});
