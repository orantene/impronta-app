import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeHostHeader,
  resolveEffectiveTenantId,
} from "@/lib/analytics/derive-tenant";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";

// ── normalizeHostHeader ──────────────────────────────────────────────────────

test("normalizeHostHeader: strips port + lowercases", () => {
  assert.equal(normalizeHostHeader("Impronta.Tulala.Digital:3000"), "impronta.tulala.digital");
  assert.equal(normalizeHostHeader("acme.lvh.me"), "acme.lvh.me");
});

test("normalizeHostHeader: handles IPv6 literal + empty", () => {
  assert.equal(normalizeHostHeader("[::1]:3000"), "::1");
  assert.equal(normalizeHostHeader(""), null);
  assert.equal(normalizeHostHeader(null), null);
  assert.equal(normalizeHostHeader(undefined), null);
});

// ── resolveEffectiveTenantId — the precedence core ───────────────────────────

test("host-derived tenant wins; matching client hint is honored (no drop)", () => {
  const out = resolveEffectiveTenantId({ derivedTenantId: TENANT_A, clientHint: TENANT_A });
  assert.equal(out.tenantId, TENANT_A);
  assert.equal(out.hintDropped, false);
});

test("host-derived tenant wins; MISMATCHED client hint is dropped (spoof rejected)", () => {
  // The spoof attempt: client claims TENANT_B but the host proves TENANT_A.
  const out = resolveEffectiveTenantId({ derivedTenantId: TENANT_A, clientHint: TENANT_B });
  assert.equal(out.tenantId, TENANT_A, "persisted tenant is the server-derived one, never the hint");
  assert.equal(out.hintDropped, true);
});

test("host-derived tenant present, NO client hint → derived used, nothing dropped", () => {
  const out = resolveEffectiveTenantId({ derivedTenantId: TENANT_A, clientHint: null });
  assert.equal(out.tenantId, TENANT_A);
  assert.equal(out.hintDropped, false);
});

test("no derivable tenant + client hint present → hint DROPPED, tenant null (never trust client alone)", () => {
  const out = resolveEffectiveTenantId({ derivedTenantId: null, clientHint: TENANT_B });
  assert.equal(out.tenantId, null);
  assert.equal(out.hintDropped, true);
});

test("no derivable tenant + no hint → null, nothing dropped", () => {
  const out = resolveEffectiveTenantId({ derivedTenantId: null, clientHint: null });
  assert.equal(out.tenantId, null);
  assert.equal(out.hintDropped, false);
});

test("whitespace-only values are treated as absent", () => {
  const out = resolveEffectiveTenantId({ derivedTenantId: "   ", clientHint: "   " });
  assert.equal(out.tenantId, null);
  assert.equal(out.hintDropped, false);
});
