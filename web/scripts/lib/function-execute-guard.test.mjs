import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildBaseline,
  compareExecutable,
  decideOutcome,
  normaliseRows,
  parseReviewedAllowList,
  parseSurfaceModule,
  reviewedFromSources,
} from "./function-execute-guard.mjs";

const SURFACE_SRC = `
export const PUBLIC_SURFACE_FUNCTIONS: readonly string[] = [
  "ensure_guest_session",
  // "commented_out_surface",
  /* "block_commented_surface", */
  "receipt_for_code", // trailing "comment_name" after a real entry
];
export const POLICY_HELPER_FUNCTIONS: readonly string[] = [
  "is_staff_of_tenant",
];
`;
const SURFACE = parseSurfaceModule(SURFACE_SRC);

const entry = (signature, roles, reason = "defends itself in its body") => ({ signature, roles, reason });
const JSON_ENTRIES = [
  entry("ensure_guest_session(text)", ["anon", "authenticated"]),
  entry("receipt_for_code(text)", ["anon", "authenticated"]),
  entry("is_staff_of_tenant(uuid)", ["authenticated"]),
];

const row = (name, args, roles, extra = {}) => ({
  signature: `${name}(${args})`,
  name,
  secdef: true,
  anon: roles.includes("anon"),
  authenticated: roles.includes("authenticated"),
  usedInPolicy: false,
  usedInDefault: false,
  ...extra,
});
const keys = (list) => list.map((u) => `${u.role}:${u.signature}`);

test("parseSurfaceModule reads both TS lists, ignores commented-out names, refuses an unparseable module", () => {
  assert.deepEqual(SURFACE.publicSurface, ["ensure_guest_session", "receipt_for_code"]);
  assert.deepEqual(SURFACE.policyHelpers, ["is_staff_of_tenant"]);
  assert.throws(() => parseSurfaceModule("export const NOTHING = 1;"), /PUBLIC_SURFACE_FUNCTIONS/);
  assert.throws(
    () => parseSurfaceModule('export const PUBLIC_SURFACE_FUNCTIONS = ["a"];'),
    /POLICY_HELPER_FUNCTIONS/,
  );
});

test("parseReviewedAllowList: signature keyed, reason and known roles required", () => {
  assert.deepEqual(parseReviewedAllowList({ reviewed: [entry("my_rpc(uuid)", ["authenticated"])] }), [
    { signature: "my_rpc(uuid)", name: "my_rpc", roles: ["authenticated"], reason: "defends itself in its body" },
  ]);
  assert.throws(() => parseReviewedAllowList({ reviewed: [entry("my_rpc", ["authenticated"])] }), /signature/);
  assert.throws(() => parseReviewedAllowList({ reviewed: [entry("x()", ["authenticated"], " ")] }), /reason/);
  assert.throws(() => parseReviewedAllowList({ reviewed: [entry("x()", ["service_role"])] }), /role/);
  assert.throws(() => parseReviewedAllowList({ reviewed: "nope" }), /reviewed/);
});

test("reviewedFromSources: policy helpers are authenticated-only; an anon entry for one is refused", () => {
  const reviewed = reviewedFromSources(SURFACE, JSON_ENTRIES);
  assert.ok(reviewed.authenticated.has("is_staff_of_tenant(uuid)"));
  assert.equal(reviewed.anon.has("is_staff_of_tenant(uuid)"), false);
  assert.ok(reviewed.anon.has("ensure_guest_session(text)"));
  assert.throws(
    () => reviewedFromSources(SURFACE, [entry("is_staff_of_tenant(uuid)", ["anon", "authenticated"])]),
    /authenticated-only/,
  );
});

test("reviewedFromSources reports TS-listed names with no pinned signature", () => {
  const reviewed = reviewedFromSources(SURFACE, [entry("ensure_guest_session(text)", ["anon"])]);
  assert.deepEqual(reviewed.unpinned, ["is_staff_of_tenant", "receipt_for_code"]);
});

test("normaliseRows strips a public. prefix and refuses a malformed row", () => {
  const rows = normaliseRows([{ signature: "public.f(uuid)", name: "f", secdef: true, anon: false, authenticated: true }]);
  assert.equal(rows[0].signature, "f(uuid)");
  assert.equal(rows[0].usedInPolicy, false);
  assert.throws(() => normaliseRows([{ name: "f" }]), /signature/);
  assert.throws(() => normaliseRows({}), /array/);
});

test("a NEW authenticated-executable function off every list is flagged; baselined and reviewed are not", () => {
  const reviewed = reviewedFromSources(SURFACE, JSON_ENTRIES);
  const baseline = { version: 1, anon: [], authenticated: ["old_rpc(uuid)"], missingAuthenticatedGrant: [] };
  const rows = [
    row("old_rpc", "uuid", ["authenticated"]),
    row("ensure_guest_session", "text", ["anon", "authenticated"]),
    row("new_definer_rpc", "uuid, jsonb", ["authenticated"]),
  ];
  const result = compareExecutable({ rows, reviewed, baseline });
  assert.deepEqual(keys(result.unreviewed), ["authenticated:new_definer_rpc(uuid, jsonb)"]);
  assert.equal(result.unreviewed[0].secdef, true);
});

test("a NEW SECURITY DEFINER overload of a reviewed name FAILS (signature, not name)", () => {
  const reviewed = reviewedFromSources(SURFACE, JSON_ENTRIES);
  const rows = [
    row("receipt_for_code", "text", ["anon", "authenticated"]),
    row("receipt_for_code", "text, boolean", ["anon", "authenticated"]),
  ];
  const result = compareExecutable({ rows, reviewed, baseline: { version: 1, anon: [], authenticated: [] } });
  assert.deepEqual(keys(result.unreviewed), [
    "anon:receipt_for_code(text, boolean)",
    "authenticated:receipt_for_code(text, boolean)",
  ]);
});

test("a policy helper newly executable by ANON is flagged even though reviewed for authenticated", () => {
  const reviewed = reviewedFromSources(SURFACE, JSON_ENTRIES);
  const result = compareExecutable({
    rows: [row("is_staff_of_tenant", "uuid", ["anon", "authenticated"])],
    reviewed,
    baseline: { version: 1, anon: [], authenticated: [] },
  });
  assert.deepEqual(keys(result.unreviewed), ["anon:is_staff_of_tenant(uuid)"]);
});

test("an old function that gains an ANON grant is new for anon; a changed argument list is a new signature", () => {
  const reviewed = reviewedFromSources(SURFACE, []);
  const baseline = { version: 1, anon: [], authenticated: ["old_rpc(uuid)"] };
  const gained = compareExecutable({ rows: [row("old_rpc", "uuid", ["anon", "authenticated"])], reviewed, baseline });
  assert.deepEqual(keys(gained.unreviewed), ["anon:old_rpc(uuid)"]);
  const changed = compareExecutable({ rows: [row("old_rpc", "uuid, text", ["authenticated"])], reviewed, baseline });
  assert.equal(changed.unreviewed.length, 1);
  assert.deepEqual(changed.staleBaseline, ["authenticated:old_rpc(uuid)"]);
});

test("a NEW function used in a policy or a column default without an authenticated grant is flagged", () => {
  const reviewed = reviewedFromSources(SURFACE, []);
  const baseline = { version: 1, anon: [], authenticated: [], missingAuthenticatedGrant: ["legacy_helper(uuid)"] };
  const rows = [
    row("new_policy_helper", "uuid", [], { usedInPolicy: true }),
    row("new_default_fn", "", [], { usedInDefault: true }),
    row("legacy_helper", "uuid", [], { usedInPolicy: true }),
    row("granted_helper", "uuid", ["authenticated"], { usedInPolicy: true }),
    row("unused_private", "uuid", []),
  ];
  const result = compareExecutable({ rows, reviewed, baseline });
  assert.deepEqual(
    result.missingGrant.map((m) => `${m.signature}:${m.usedIn.join("+")}`),
    ["new_default_fn():default", "new_policy_helper(uuid):policy"],
  );
  assert.ok(keys(result.unreviewed).includes("authenticated:granted_helper(uuid)"));
});

test("with NO baseline every off-list function is unreviewed", () => {
  const reviewed = reviewedFromSources(SURFACE, JSON_ENTRIES);
  const result = compareExecutable({
    rows: [row("a", "", ["authenticated"]), row("receipt_for_code", "text", ["anon", "authenticated"])],
    reviewed,
    baseline: null,
  });
  assert.deepEqual(keys(result.unreviewed), ["authenticated:a()"]);
});

test("buildBaseline is sorted per role, records missing grants, and round-trips to zero findings", () => {
  const rows = [
    row("z", "", ["authenticated"]),
    row("a", "uuid", ["anon", "authenticated"]),
    row("p", "uuid", [], { usedInPolicy: true }),
  ];
  const baseline = buildBaseline(rows);
  assert.deepEqual(baseline.anon, ["a(uuid)"]);
  assert.deepEqual(baseline.authenticated, ["a(uuid)", "z()"]);
  assert.deepEqual(baseline.missingAuthenticatedGrant, ["p(uuid)"]);
  const result = compareExecutable({ rows, reviewed: reviewedFromSources({ publicSurface: [], policyHelpers: [] }, []), baseline });
  assert.equal(result.unreviewed.length + result.missingGrant.length, 0);
});

test("decideOutcome: WARN-ONLY never fails, even with findings and no baseline", () => {
  const d = decideOutcome({ enforce: false, baselinePresent: false, findingCount: 40 });
  assert.equal(d.exitCode, 0);
  assert.equal(d.level, "warn");
});

test("decideOutcome: ENFORCE fails on a finding, refuses without a baseline, passes when clean", () => {
  assert.equal(decideOutcome({ enforce: true, baselinePresent: true, findingCount: 1 }).exitCode, 1);
  const noBase = decideOutcome({ enforce: true, baselinePresent: false, findingCount: 0 });
  assert.equal(noBase.exitCode, 1);
  assert.match(noBase.message, /baseline/i);
  const clean = decideOutcome({ enforce: true, baselinePresent: true, findingCount: 0 });
  assert.equal(clean.exitCode, 0);
  assert.equal(clean.level, "pass");
});
