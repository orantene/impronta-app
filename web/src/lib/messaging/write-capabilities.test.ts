/**
 * write-capabilities.test.ts — TUL-1742.
 *
 * Role-matrix test for `MESSAGING_WRITE_CAPABILITY`, same shape as
 * `pipeline-write-capabilities.test.ts` (TUL-1708): every action must point
 * at a real, non-deprecated capability, and that capability must NOT be
 * viewer-held — the bug class this card fixes (a bare manager-guard call
 * defaults to the viewer-held `agency.workspace.view`).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ROLE_CAPABILITIES, isKnownCapability, getCapability } from "@/lib/access";
import { MESSAGING_WRITE_CAPABILITY } from "./write-capabilities";

const VIEWER_DEFAULT_CAPABILITY = "agency.workspace.view";

test("every MESSAGING_WRITE_CAPABILITY value is a known, non-deprecated capability key", () => {
  for (const [action, capability] of Object.entries(MESSAGING_WRITE_CAPABILITY)) {
    assert.ok(isKnownCapability(capability), `${action}: "${capability}" is not a registered capability`);
    const def = getCapability(capability);
    assert.ok(def, `${action}: capability "${capability}" has no definition`);
    assert.equal(def!.deprecated, false, `${action}: capability "${capability}" is deprecated`);
  }
});

test("no MESSAGING_WRITE_CAPABILITY value is the bare-guard default (agency.workspace.view)", () => {
  for (const [action, capability] of Object.entries(MESSAGING_WRITE_CAPABILITY)) {
    assert.notEqual(
      capability,
      VIEWER_DEFAULT_CAPABILITY,
      `${action}: must not resolve back to the viewer-held default`,
    );
  }
});

test("role matrix: viewer never holds any capability assigned to a messaging write", () => {
  const viewerCaps = ROLE_CAPABILITIES.viewer;
  for (const [action, capability] of Object.entries(MESSAGING_WRITE_CAPABILITY)) {
    assert.equal(
      viewerCaps.has(capability),
      false,
      `${action}: viewer must NOT hold "${capability}" — a viewer could perform this write`,
    );
  }
});

test("TUL-1742: identityCapture / createClient are edit_client_relationship (editor tier), not bare viewer default", () => {
  assert.equal(MESSAGING_WRITE_CAPABILITY.identityCapture, "edit_client_relationship");
  assert.equal(MESSAGING_WRITE_CAPABILITY.createClient, "edit_client_relationship");
  assert.equal(ROLE_CAPABILITIES.viewer.has("edit_client_relationship" as never), false);
  assert.ok(ROLE_CAPABILITIES.editor.has("edit_client_relationship" as never), "editor must hold edit_client_relationship");
});
