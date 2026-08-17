/**
 * site-shell-flag.test.ts — WS-A A8. Pure tests (node:test + node:assert) for
 * the site-shell flag gates + the TWO-HEADERS MUTUAL-EXCLUSION predicate.
 *
 * Critical guarantees proven here:
 *   1. Both render + edit gates default OFF (no env) — the flag-off parity
 *      guarantee (live header/footer render through the legacy path exactly as
 *      today).
 *   2. `resolveShellRenderDecision` is mutually exclusive: snapshot XOR legacy.
 *      - flag OFF                       ⇒ legacy only.
 *      - flag ON + shell published      ⇒ snapshot only.
 *      - flag ON + NO published shell   ⇒ legacy only (belt-and-suspenders).
 */

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  isSiteShellEnabledForTenant,
  resolveShellRenderDecision,
  shouldRouteSiteShellSurface,
  readSiteShellMode,
  readSiteShellEditMode,
} from "./site-shell-flag";

const TENANT = "tenant-aurora";

const ENV_KEYS = [
  "ENABLE_SITE_SHELL",
  "SITE_SHELL_TENANT_IDS",
  "ENABLE_SITE_SHELL_EDIT",
  "SITE_SHELL_EDIT_TENANT_IDS",
] as const;

function clearEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

afterEach(clearEnv);

// ── flag-off parity ──────────────────────────────────────────────────────────────

test("[A8] render + edit gates default OFF with no env (flag-off parity)", () => {
  clearEnv();
  assert.equal(readSiteShellMode(), "off");
  assert.equal(readSiteShellEditMode(), "off");
  assert.equal(isSiteShellEnabledForTenant(TENANT), false);
  assert.equal(shouldRouteSiteShellSurface(TENANT), false);
});

test("[A8] render gate ON for an allow-listed tenant under mode=tenants; OFF for others", () => {
  process.env.ENABLE_SITE_SHELL = "tenants";
  process.env.SITE_SHELL_TENANT_IDS = TENANT;
  assert.equal(isSiteShellEnabledForTenant(TENANT), true);
  assert.equal(isSiteShellEnabledForTenant("some-other-tenant"), false);
});

test("[launch] code-level launch allow-list enables Impronta with NO env set", () => {
  clearEnv();
  const IMPRONTA = "00000000-0000-0000-0000-000000000001";
  // Master switch reads OFF, yet the launch tenant is still enabled...
  assert.equal(readSiteShellMode(), "off");
  assert.equal(isSiteShellEnabledForTenant(IMPRONTA), true);
  // ...while a non-launch tenant stays off (no env, not allow-listed).
  assert.equal(isSiteShellEnabledForTenant(TENANT), false);
});

// ── QA shell tenant (2026-08-16) — the RENDER gate matrix ──────────────────────
//
// Confirms `SITE_SHELL_TENANT_IDS` is the extensibility point for opting a QA
// tenant (e.g. nova-crew, 33333333-3333-3333-3333-333333333333) into the
// render gate WITHOUT touching `LAUNCH_SHELL_TENANT_IDS` (which stays
// impronta-only) — across every env shape the parsers accept, and proving the
// impronta / unknown-tenant / env-listed-tenant triple is stable under each.

const IMPRONTA = "00000000-0000-0000-0000-000000000001";
const NOVA_CREW = "33333333-3333-3333-3333-333333333333";
const UNKNOWN = "tenant-never-listed-anywhere";

test("[QA-shell] mode=off (default/explicit) ⇒ impronta ON (launch list), nova + unknown OFF", () => {
  for (const raw of [undefined, "off", "bogus", ""] as const) {
    clearEnv();
    if (raw !== undefined) process.env.ENABLE_SITE_SHELL = raw;
    assert.equal(readSiteShellMode(), "off");
    assert.equal(isSiteShellEnabledForTenant(IMPRONTA), true);
    assert.equal(isSiteShellEnabledForTenant(NOVA_CREW), false);
    assert.equal(isSiteShellEnabledForTenant(UNKNOWN), false);
  }
});

test("[QA-shell] mode=tenants + SITE_SHELL_TENANT_IDS lists nova-crew ⇒ impronta ON (launch), nova ON (env), unknown OFF", () => {
  clearEnv();
  process.env.ENABLE_SITE_SHELL = "tenants";
  process.env.SITE_SHELL_TENANT_IDS = NOVA_CREW;
  assert.equal(isSiteShellEnabledForTenant(IMPRONTA), true);
  assert.equal(isSiteShellEnabledForTenant(NOVA_CREW), true);
  assert.equal(isSiteShellEnabledForTenant(UNKNOWN), false);
});

test("[QA-shell] SITE_SHELL_TENANT_IDS parses a comma list with whitespace + trailing commas", () => {
  clearEnv();
  process.env.ENABLE_SITE_SHELL = "tenants";
  process.env.SITE_SHELL_TENANT_IDS = ` ${NOVA_CREW} , ${UNKNOWN},, `;
  assert.equal(isSiteShellEnabledForTenant(NOVA_CREW), true);
  assert.equal(isSiteShellEnabledForTenant(UNKNOWN), true);
  assert.equal(isSiteShellEnabledForTenant("a-third-tenant"), false);
});

test("[QA-shell] mode=tenants with EMPTY SITE_SHELL_TENANT_IDS ⇒ only impronta (launch list)", () => {
  clearEnv();
  process.env.ENABLE_SITE_SHELL = "tenants";
  assert.equal(isSiteShellEnabledForTenant(IMPRONTA), true);
  assert.equal(isSiteShellEnabledForTenant(NOVA_CREW), false);
});

test("[QA-shell] mode=all / '1' / 'true' (case-insensitive) ⇒ every tenant ON, incl. unknown", () => {
  for (const raw of ["all", "ALL", "1", "true", "TRUE"] as const) {
    clearEnv();
    process.env.ENABLE_SITE_SHELL = raw;
    assert.equal(readSiteShellMode(), "all");
    assert.equal(isSiteShellEnabledForTenant(IMPRONTA), true);
    assert.equal(isSiteShellEnabledForTenant(NOVA_CREW), true);
    assert.equal(isSiteShellEnabledForTenant(UNKNOWN), true);
  }
});

test("[QA-shell] LAUNCH_SHELL_TENANT_IDS is unaffected by any env shape (impronta always ON)", () => {
  const shapes: Array<[string | undefined, string | undefined]> = [
    [undefined, undefined],
    ["off", undefined],
    ["tenants", undefined],
    ["tenants", NOVA_CREW],
    ["tenants", `${NOVA_CREW},${UNKNOWN}`],
    ["all", undefined],
  ];
  for (const [mode, ids] of shapes) {
    clearEnv();
    if (mode !== undefined) process.env.ENABLE_SITE_SHELL = mode;
    if (ids !== undefined) process.env.SITE_SHELL_TENANT_IDS = ids;
    assert.equal(
      isSiteShellEnabledForTenant(IMPRONTA),
      true,
      `impronta must stay ON for ENABLE_SITE_SHELL=${mode} SITE_SHELL_TENANT_IDS=${ids}`,
    );
  }
});

test("[A8] edit gate is INDEPENDENT of the render gate", () => {
  // Render on, edit off → editor must NOT route the shell surface.
  process.env.ENABLE_SITE_SHELL = "all";
  assert.equal(isSiteShellEnabledForTenant(TENANT), true);
  assert.equal(shouldRouteSiteShellSurface(TENANT), false);
});

// ── two-headers mutual exclusion ────────────────────────────────────────────────

test("[A8] flag OFF ⇒ legacy header only (snapshot never renders)", () => {
  const d = resolveShellRenderDecision({ flagEnabled: false, shellPublished: true });
  assert.equal(d.renderSnapshotShell, false);
  assert.equal(d.renderLegacyHeader, true);
});

test("[A8] flag ON + shell published ⇒ snapshot only (legacy suppressed)", () => {
  const d = resolveShellRenderDecision({ flagEnabled: true, shellPublished: true });
  assert.equal(d.renderSnapshotShell, true);
  assert.equal(d.renderLegacyHeader, false);
});

test("[A8] flag ON + NO published shell ⇒ legacy only (belt-and-suspenders)", () => {
  const d = resolveShellRenderDecision({ flagEnabled: true, shellPublished: false });
  assert.equal(d.renderSnapshotShell, false);
  assert.equal(d.renderLegacyHeader, true);
});

test("[A8] the two outcomes are ALWAYS mutually exclusive (never both / never neither)", () => {
  for (const flagEnabled of [true, false]) {
    for (const shellPublished of [true, false]) {
      const d = resolveShellRenderDecision({ flagEnabled, shellPublished });
      assert.notEqual(
        d.renderSnapshotShell,
        d.renderLegacyHeader,
        `expected XOR for flagEnabled=${flagEnabled} shellPublished=${shellPublished}`,
      );
    }
  }
});
