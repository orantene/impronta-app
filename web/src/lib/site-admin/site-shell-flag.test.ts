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
