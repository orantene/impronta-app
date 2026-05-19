/**
 * tenant-isolation.security.test.ts — cross-cutting structural invariants that
 * backstop the per-module characterizations in this PR.
 *
 * Complements (does NOT duplicate) the existing tenant-isolation.test.ts. That
 * file pins the LEGACY_TENANT_ID symbol allow-list + requireStaffTenantAction
 * delegation. This file pins the request-edge trust boundary that the
 * scope.security.test.ts "blind header trust" flag depends on, plus the
 * header/cookie constant contract and the host resolver's fail-closed shape.
 *
 * Technique: readFileSync + assert.match on the specific security-load-bearing
 * files (proxy.ts request edge, host-context.ts resolver) and value-pins on
 * exported constants. Deterministic, tsc-clean, Node-20-safe. Does NOT fix.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  TENANT_HEADER_NAME,
  TENANT_COOKIE_NAME,
  PUBLIC_PATH_PREFIX_HEADER,
} from "./scope";
import {
  HOST_CONTEXT_HEADER,
  HOST_NAME_HEADER,
  HOST_TENANT_SLUG_HEADER,
} from "./host-context";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SAAS_DIR = HERE;
const SRC_ROOT = join(HERE, "..", "..");
const PROXY_SRC = readFileSync(join(SRC_ROOT, "proxy.ts"), "utf8");
const HOST_CTX_SRC = readFileSync(join(SAAS_DIR, "host-context.ts"), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// THE request-edge trust boundary. getPublicTenantScope() trusts the
// x-impronta-tenant-id header verbatim (flagged in scope.security.test.ts).
// That is only safe because proxy.ts NEUTRALISES any client-supplied copy on
// EVERY context branch. These invariants pin that neutralisation so a refactor
// that drops it fails loudly here instead of silently in production.
// ─────────────────────────────────────────────────────────────────────────────

test("INVARIANT proxy.ts: inbound tenant header is OVERWRITTEN on tenant contexts and DELETED on non-tenant contexts", () => {
  // Tenant context (agency/hub): the DB-resolved id wins via .set() (overwrite).
  assert.match(
    PROXY_SRC,
    /requestHeaders\.set\(TENANT_HEADER_NAME, effectiveHostContext\.tenantId\)/,
    "tenant contexts must overwrite the tenant header with the trusted resolved id",
  );
  // Non-tenant context (marketing/app): the spoofable header is stripped.
  assert.match(
    PROXY_SRC,
    /requestHeaders\.delete\(TENANT_HEADER_NAME\)/,
    "non-tenant contexts must delete any client-supplied tenant header",
  );
  // The slug + path-prefix headers get the same treatment (else-branch delete).
  assert.match(PROXY_SRC, /requestHeaders\.delete\(HOST_TENANT_SLUG_HEADER\)/);
  assert.match(PROXY_SRC, /requestHeaders\.delete\(PUBLIC_PATH_PREFIX_HEADER\)/);
});

test("INVARIANT proxy.ts: the spoofable tenant header is never READ before it is neutralised", () => {
  // The neutralisation is positional (set/delete per branch), not an
  // unconditional top-of-pipe strip. The residual safety requirement is that
  // nothing reads requestHeaders.get(TENANT_HEADER_NAME) between
  // `new Headers(request.headers)` and the set/delete. Pin that no such read
  // exists anywhere in proxy.ts at all.
  assert.doesNotMatch(
    PROXY_SRC,
    /requestHeaders\.get\(\s*TENANT_HEADER_NAME\s*\)/,
    "proxy.ts must not consume the (possibly spoofed) inbound tenant header",
  );
});

test("INVARIANT proxy.ts: the strip-then-set contract is documented at the call site", () => {
  assert.match(
    PROXY_SRC,
    /Strip any spoofed header on non-tenant contexts/,
    "the security intent must stay documented where the strip happens",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Header / cookie constant contract. proxy.ts SETS these; scope.ts/host-context
// READ them. If the names drift apart, isolation silently breaks (reader looks
// for a header the writer never set → tenant scope null OR stale). Freeze the
// wire values.
// ─────────────────────────────────────────────────────────────────────────────

test("INVARIANT: tenant/host wire constants are frozen to their exact header/cookie names", () => {
  assert.equal(TENANT_HEADER_NAME, "x-impronta-tenant-id");
  assert.equal(TENANT_COOKIE_NAME, "impronta.active_tenant_id");
  assert.equal(PUBLIC_PATH_PREFIX_HEADER, "x-impronta-public-path-prefix");
  assert.equal(HOST_CONTEXT_HEADER, "x-impronta-host-context");
  assert.equal(HOST_NAME_HEADER, "x-impronta-host-name");
  assert.equal(HOST_TENANT_SLUG_HEADER, "x-impronta-tenant-slug");
});

test("INVARIANT proxy.ts references the SHARED constants (not string literals) for the tenant/slug/prefix headers", () => {
  // Using the symbols (not re-typed "x-impronta-..." literals) is what keeps
  // writer and reader in lockstep. A literal here would be the drift vector.
  assert.match(PROXY_SRC, /TENANT_HEADER_NAME/);
  assert.match(PROXY_SRC, /HOST_TENANT_SLUG_HEADER/);
  assert.match(PROXY_SRC, /PUBLIC_PATH_PREFIX_HEADER/);
  assert.doesNotMatch(
    PROXY_SRC,
    /["']x-impronta-tenant-id["']/,
    "proxy.ts must reference TENANT_HEADER_NAME, never a re-typed literal",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// host-context.ts — the anon-key edge resolver. Must fail CLOSED (not_found),
// never fall back to a seed tenant, and only surface live domains.
// ─────────────────────────────────────────────────────────────────────────────

test("INVARIANT host-context: every failure path resolves to not_found — no tenant-#1 / seed fallback", () => {
  assert.doesNotMatch(
    HOST_CTX_SRC,
    /00000000-0000-0000-0000-0000000000(01|02)/,
    "host resolver must not hardcode the seed/hub UUID as a fallback",
  );
  assert.doesNotMatch(HOST_CTX_SRC, /LEGACY_TENANT_ID/);
  // Missing env, error, !data, NULL tenant_id on hub/agency rows → not_found.
  assert.match(HOST_CTX_SRC, /if \(error \|\| !data\)/);
  assert.match(
    HOST_CTX_SRC,
    /if \(!data\.tenant_id\) \{\s*\n\s*value = \{ kind: "not_found"/,
    "a row with NULL tenant_id must NOT render with a null/again-spoofable tenant",
  );
});

test("INVARIANT host-context: agency_domains reads are restricted to the live status allow-list", () => {
  // The edge runs on the anon key; a pending/disabled/removed domain must not
  // resolve a tenant. Pin the exact allow-list on the primary lookup.
  assert.match(
    HOST_CTX_SRC,
    /\.in\("status", \["active", "ssl_provisioned", "verified"\]\)/,
    "host resolver must only honour active/ssl_provisioned/verified domains",
  );
});

test("INVARIANT host-context: hostnames are DB-driven — no production domain is hardcoded in the resolver", () => {
  // The file's own contract: 'No hostnames are hardcoded in code'. Loopback
  // dev strings are the only allowed literals (NODE_ENV==='development' gate).
  assert.doesNotMatch(HOST_CTX_SRC, /tulala|improntamodels/i, "no production tenant hostname literals");
  const loopback = HOST_CTX_SRC.includes('"localhost"') || HOST_CTX_SRC.includes('"127.0.0.1"');
  if (loopback) {
    assert.match(
      HOST_CTX_SRC,
      /NODE_ENV === "development"/,
      "loopback literals are only permitted behind a development-env gate",
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Seed-UUID containment across the whole saas tree. The existing
// tenant-isolation.test.ts pins the LEGACY_TENANT_ID *symbol*; this catches an
// inlined raw literal "00000000-…-0001" smuggled into any other saas module.
// ─────────────────────────────────────────────────────────────────────────────

test("INVARIANT src/lib/saas/**: the seed tenant UUID literal appears ONLY in tenant.ts (its definition)", () => {
  const SEED = "00000000-0000-0000-0000-000000000001";
  const offenders: string[] = [];
  for (const name of readdirSync(SAAS_DIR)) {
    if (!name.endsWith(".ts")) continue;
    if (name.endsWith(".test.ts")) continue; // tests legitimately mention it
    if (name === "tenant.ts") continue; // canonical definition site
    const body = readFileSync(join(SAAS_DIR, name), "utf8");
    if (body.includes(SEED)) offenders.push(name);
  }
  assert.deepEqual(
    offenders,
    [],
    `Seed tenant UUID must not be inlined as a runtime fallback. Offending saas modules:\n${offenders.join("\n")}`,
  );
});
