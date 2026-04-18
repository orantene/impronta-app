import test from "node:test";
import assert from "node:assert/strict";

import {
  asAllowlist,
  asFlag,
  resolveWorkspaceV3Enabled,
} from "@/lib/settings/admin-workspace-flag";

// ---------- asFlag ----------

test("asFlag: raw boolean true → true", () => {
  assert.equal(asFlag(true), true);
});

test("asFlag: raw boolean false → false", () => {
  assert.equal(asFlag(false), false);
});

test("asFlag: { enabled: true } → true", () => {
  assert.equal(asFlag({ enabled: true }), true);
});

test("asFlag: { enabled: false } → false", () => {
  assert.equal(asFlag({ enabled: false }), false);
});

test("asFlag: null → false (safe default)", () => {
  assert.equal(asFlag(null), false);
});

test("asFlag: undefined → false (safe default)", () => {
  assert.equal(asFlag(undefined), false);
});

test("asFlag: string 'true' → false (not coerced)", () => {
  assert.equal(asFlag("true"), false);
});

test("asFlag: number 1 → false (not coerced)", () => {
  assert.equal(asFlag(1), false);
});

test("asFlag: arbitrary object → false", () => {
  assert.equal(asFlag({ other: true }), false);
});

// ---------- asAllowlist ----------

test("asAllowlist: array of valid ids → Set of trimmed ids", () => {
  const ids = asAllowlist(["user-1", "  user-2  ", "user-3"]);
  assert.equal(ids.size, 3);
  assert.ok(ids.has("user-1"));
  assert.ok(ids.has("user-2"));
  assert.ok(ids.has("user-3"));
});

test("asAllowlist: array with empty/whitespace entries → filtered", () => {
  const ids = asAllowlist(["user-1", "", "   ", "user-2"]);
  assert.equal(ids.size, 2);
  assert.ok(ids.has("user-1"));
  assert.ok(ids.has("user-2"));
});

test("asAllowlist: array with non-string entries → filtered", () => {
  const ids = asAllowlist(["user-1", 42, null, { id: "user-2" }, "user-3"]);
  assert.equal(ids.size, 2);
  assert.ok(ids.has("user-1"));
  assert.ok(ids.has("user-3"));
});

test("asAllowlist: empty array → empty set", () => {
  assert.equal(asAllowlist([]).size, 0);
});

test("asAllowlist: non-array (string) → empty set", () => {
  assert.equal(asAllowlist("user-1").size, 0);
});

test("asAllowlist: non-array (object) → empty set", () => {
  assert.equal(asAllowlist({ users: ["user-1"] }).size, 0);
});

test("asAllowlist: null → empty set", () => {
  assert.equal(asAllowlist(null).size, 0);
});

test("asAllowlist: duplicate ids collapsed", () => {
  const ids = asAllowlist(["user-1", "user-1", "user-1"]);
  assert.equal(ids.size, 1);
  assert.ok(ids.has("user-1"));
});

// ---------- resolveWorkspaceV3Enabled ----------

test("resolve: global flag true → enabled for everyone (even without userId)", () => {
  const result = resolveWorkspaceV3Enabled(
    { globalEnabled: true, allowlist: [] },
    null,
  );
  assert.equal(result, true);
});

test("resolve: global flag true → enabled even if user not in allowlist", () => {
  const result = resolveWorkspaceV3Enabled(
    { globalEnabled: true, allowlist: ["other-user"] },
    "some-user",
  );
  assert.equal(result, true);
});

test("resolve: global flag false + user in allowlist → enabled", () => {
  const result = resolveWorkspaceV3Enabled(
    { globalEnabled: false, allowlist: ["user-a", "user-b"] },
    "user-a",
  );
  assert.equal(result, true);
});

test("resolve: global flag false + user NOT in allowlist → disabled", () => {
  const result = resolveWorkspaceV3Enabled(
    { globalEnabled: false, allowlist: ["user-a"] },
    "user-b",
  );
  assert.equal(result, false);
});

test("resolve: global flag false + empty allowlist → disabled for everyone", () => {
  const result = resolveWorkspaceV3Enabled(
    { globalEnabled: false, allowlist: [] },
    "any-user",
  );
  assert.equal(result, false);
});

test("resolve: global flag false + null userId → disabled", () => {
  const result = resolveWorkspaceV3Enabled(
    { globalEnabled: false, allowlist: ["user-a"] },
    null,
  );
  assert.equal(result, false);
});

test("resolve: global flag false + undefined userId → disabled", () => {
  const result = resolveWorkspaceV3Enabled(
    { globalEnabled: false, allowlist: ["user-a"] },
    undefined,
  );
  assert.equal(result, false);
});

test("resolve: missing rawSettings (null/undefined values) → disabled", () => {
  const result = resolveWorkspaceV3Enabled(
    { globalEnabled: null, allowlist: null },
    "user-a",
  );
  assert.equal(result, false);
});

test("resolve: malformed global flag (string) + user in allowlist → still enabled via allowlist", () => {
  const result = resolveWorkspaceV3Enabled(
    { globalEnabled: "true", allowlist: ["user-a"] },
    "user-a",
  );
  // "true" is not a real boolean → falls through to allowlist, which allows user-a.
  assert.equal(result, true);
});

test("resolve: { enabled: true } object form → enabled for everyone", () => {
  const result = resolveWorkspaceV3Enabled(
    { globalEnabled: { enabled: true }, allowlist: [] },
    null,
  );
  assert.equal(result, true);
});

test("resolve: whitespace-padded userId in allowlist matches trimmed", () => {
  const result = resolveWorkspaceV3Enabled(
    { globalEnabled: false, allowlist: ["  user-a  "] },
    "user-a",
  );
  assert.equal(result, true);
});
