/**
 * TUL-1708 (area G: discovery, content & site settings) — self-contained ratchet.
 *
 * `requireWorkspaceStaffAction()` with no `capability` defaults to
 * `agency.workspace.view`, which every `viewer` holds. Several writers in this
 * area called it bare, so a viewer could toggle Discover cross-hub exposure,
 * flip the guest-chat widget, set the workspace's hub work style (client
 * pricing/split/routing), add or remove an alternate custom domain, or change
 * the auto-acknowledgement policy — all owner/admin-class actions by intent
 * (several already had a secondary owner/admin role check bolted on AFTER the
 * guard; `removeAlternateDomain` had no secondary check at all).
 *
 * The reference pattern (`capabilityless-staff-guard.*`, PR #4288 / #4300) is
 * not on `main` yet, so this file does not depend on it or extend it. It is a
 * standalone static + role-matrix check scoped to the 7 files in this sweep.
 *
 * NOT fixed here (flagged, not invented):
 *  - `_door-actions.ts`: `admitAtDoor`, `sellAtDoor`, `settleHeldOrderAtDoor`
 *    are operational writers. Per the TUL-1708 PM decision, operational
 *    writers (POS/door/floor/classes/etc.) take the new `operate_venue`
 *    capability, which DEV is adding in a separate PR not yet on `main`.
 *    Inventing a capability is explicitly out of scope, so these three keep
 *    the bare guard until `operate_venue` lands.
 *  - `admin-cms-revisions.ts`: every exported function is a read (list
 *    revisions, fetch a snapshot for a restore preview — nothing here
 *    persists). Reads keep the default per the sweep's own rule, so no
 *    change was made; there is no writer in this file to fix.
 *
 * Acceptance (from TUL-1708, mirrors #4300's unticked line):
 *  - [x] Every writer fixed below requires the right capability, passed to
 *        the guard directly (no new capability invented).
 *  - [x] Viewer/editor/manager refused, admin/owner allowed on the role
 *        matrix for each capability used.
 *  - [x] No bare guard left in a writer this sweep could fix without
 *        inventing a capability (door writers and cms-revisions excepted,
 *        both flagged above).
 *  - [ ] Once `capabilityless-staff-guard.baseline.json` lands (#4288/#4300),
 *        add this area's files to it at their new (lower) counts instead of
 *        relying on this standalone file.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { roleGrantsCapability } from "@/lib/access/roles";
import type { TenantRoleKey } from "@/lib/access/roles";

const ROOT = process.cwd();

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf8");
}

/** Slice a named exported function's body out of a file's source (up to the next top-level export). */
function fnBody(src: string, name: string): string {
  const at = src.indexOf(`export async function ${name}`);
  assert.ok(at >= 0, `export async function ${name} not found`);
  const next = src.indexOf("export async function", at + 1);
  return next > 0 ? src.slice(at, next) : src.slice(at);
}

const FIXED = [
  {
    file: "src/lib/server-actions/admin-discover-exposure.ts",
    writer: "saveDiscoverExposure",
    reader: "loadDiscoverExposure",
    capability: "manage_storefront_settings",
  },
  {
    file: "src/lib/server-actions/admin-guest-chat-settings.ts",
    writer: "saveGuestChatSettings",
    reader: "loadGuestChatSettingsForAdmin",
    capability: "manage_storefront_settings",
  },
  {
    file: "src/lib/server-actions/work-style.ts",
    writer: "saveWorkStyleAction",
    reader: "loadWorkStyleAction",
    capability: "manage_agency_settings",
  },
  {
    file: "src/app/(workspace)/[tenantSlug]/admin/policy/auto-ack/actions.ts",
    writer: "updateAutoAckPolicy",
    reader: null,
    capability: "manage_agency_settings",
  },
] as const;

test("every fixed writer passes its capability into requireWorkspaceStaffAction", () => {
  for (const { file, writer, capability } of FIXED) {
    const body = fnBody(read(file), writer);
    assert.match(
      body,
      new RegExp(`requireWorkspaceStaffAction\\(\\{\\s*capability:\\s*"${capability}"\\s*\\}\\)`),
      `${file} :: ${writer} must require "${capability}"`,
    );
    assert.doesNotMatch(
      body,
      /requireWorkspaceStaffAction\(\s*\)/,
      `${file} :: ${writer} must not keep a bare requireWorkspaceStaffAction()`,
    );
  }
});

test("reads in the fixed files keep the viewer default (no capability added)", () => {
  for (const { file, reader } of FIXED) {
    if (!reader) continue;
    const body = fnBody(read(file), reader);
    assert.match(
      body,
      /requireWorkspaceStaffAction\(\s*\)/,
      `${file} :: ${reader} is a read and should keep the default guard`,
    );
  }
});

test("alternate-domain.ts: both writers require manage_agency_domains (matches the sibling domain surface)", () => {
  const src = read("src/lib/server-actions/alternate-domain.ts");
  for (const fn of ["addAlternateDomain", "removeAlternateDomain"] as const) {
    const body = fnBody(src, fn);
    assert.match(
      body,
      /requireWorkspaceStaffAction\(\{\s*capability:\s*"manage_agency_domains"\s*\}\)/,
      `alternate-domain.ts :: ${fn} must require "manage_agency_domains"`,
    );
    assert.doesNotMatch(body, /requireWorkspaceStaffAction\(\s*\)/, `${fn} must not keep a bare guard`);
  }
});

test("admin-cms-revisions.ts has no writer: every export stays on the default guard", () => {
  const src = read("src/lib/server-actions/admin-cms-revisions.ts");
  for (const fn of [
    "listCmsPageRevisions",
    "listCmsPostRevisions",
    "getCmsPageRevisionForRestore",
    "getCmsPostRevisionForRestore",
  ] as const) {
    const body = fnBody(src, fn);
    assert.match(body, /requireWorkspaceStaffAction\(\s*\)/, `${fn} is a read`);
  }
});

test("_door-actions.ts: operational writers are left on the default guard (operate_venue not yet on main)", () => {
  const src = read("src/app/(workspace)/[tenantSlug]/admin/_door-actions.ts");
  for (const fn of ["admitAtDoor", "sellAtDoor", "settleHeldOrderAtDoor"] as const) {
    const body = fnBody(src, fn);
    assert.match(
      body,
      /requireWorkspaceStaffAction\(\s*\)/,
      `${fn} intentionally kept bare: blocked on the operate_venue capability (separate DEV PR)`,
    );
  }
});

const ROLE_ORDER: readonly TenantRoleKey[] = ["viewer", "editor", "manager", "admin", "owner"];

test("role matrix: manage_storefront_settings is refused below admin, allowed admin+", () => {
  const expect: Record<TenantRoleKey, boolean> = {
    viewer: false,
    editor: false,
    manager: false,
    admin: true,
    owner: true,
  };
  for (const role of ROLE_ORDER) {
    assert.equal(
      roleGrantsCapability(role, "manage_storefront_settings"),
      expect[role],
      `manage_storefront_settings / ${role}`,
    );
  }
});

test("role matrix: manage_agency_settings is refused below admin, allowed admin+", () => {
  const expect: Record<TenantRoleKey, boolean> = {
    viewer: false,
    editor: false,
    manager: false,
    admin: true,
    owner: true,
  };
  for (const role of ROLE_ORDER) {
    assert.equal(
      roleGrantsCapability(role, "manage_agency_settings"),
      expect[role],
      `manage_agency_settings / ${role}`,
    );
  }
});

test("role matrix: manage_agency_domains is owner-only", () => {
  const expect: Record<TenantRoleKey, boolean> = {
    viewer: false,
    editor: false,
    manager: false,
    admin: false,
    owner: true,
  };
  for (const role of ROLE_ORDER) {
    assert.equal(
      roleGrantsCapability(role, "manage_agency_domains"),
      expect[role],
      `manage_agency_domains / ${role}`,
    );
  }
});
