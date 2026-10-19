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
  // comment with "quoted_word" inside should not be read as a name? it is, and that is fine
  "receipt_for_code",
];
export const POLICY_HELPER_FUNCTIONS: readonly string[] = [
  "is_staff_of_tenant",
];
`;

const row = (name, args, roles, secdef = true) => ({
  signature: `${name}(${args})`,
  name,
  secdef,
  anon: roles.includes("anon"),
  authenticated: roles.includes("authenticated"),
});

test("parseSurfaceModule reads both TS lists and refuses an unparseable module", () => {
  const parsed = parseSurfaceModule(SURFACE_SRC);
  assert.ok(parsed.publicSurface.includes("ensure_guest_session"));
  assert.ok(parsed.publicSurface.includes("receipt_for_code"));
  assert.deepEqual(parsed.policyHelpers, ["is_staff_of_tenant"]);
  assert.throws(() => parseSurfaceModule("export const NOTHING = 1;"), /PUBLIC_SURFACE_FUNCTIONS/);
  assert.throws(
    () => parseSurfaceModule('export const PUBLIC_SURFACE_FUNCTIONS = ["a"];'),
    /POLICY_HELPER_FUNCTIONS/,
  );
});

test("parseReviewedAllowList requires a reason and known roles for every entry", () => {
  const ok = parseReviewedAllowList({
    reviewed: [{ name: "my_rpc", roles: ["authenticated"], reason: "reads auth.uid(), owner only" }],
  });
  assert.deepEqual(ok, [{ name: "my_rpc", roles: ["authenticated"], reason: "reads auth.uid(), owner only" }]);
  assert.throws(() => parseReviewedAllowList({ reviewed: [{ name: "x", roles: ["authenticated"], reason: "" }] }), /reason/);
  assert.throws(() => parseReviewedAllowList({ reviewed: [{ name: "x", roles: ["service_role"], reason: "r" }] }), /role/);
  assert.throws(() => parseReviewedAllowList({ reviewed: "nope" }), /reviewed/);
});

test("reviewedFromSources: TS surface + policy helpers cover anon AND authenticated; JSON entries only their roles", () => {
  const reviewed = reviewedFromSources(parseSurfaceModule(SURFACE_SRC), [
    { name: "owner_only_rpc", roles: ["authenticated"], reason: "owner check in body" },
  ]);
  assert.ok(reviewed.anon.has("ensure_guest_session"));
  assert.ok(reviewed.authenticated.has("ensure_guest_session"));
  assert.ok(reviewed.anon.has("is_staff_of_tenant"));
  assert.ok(reviewed.authenticated.has("owner_only_rpc"));
  assert.equal(reviewed.anon.has("owner_only_rpc"), false);
});

test("normaliseRows strips a public. prefix and refuses a malformed row", () => {
  const rows = normaliseRows([
    { signature: "public.f(uuid)", name: "f", secdef: true, anon: false, authenticated: true },
  ]);
  assert.equal(rows[0].signature, "f(uuid)");
  assert.throws(() => normaliseRows([{ name: "f" }]), /signature/);
  assert.throws(() => normaliseRows({}), /array/);
});

test("compareExecutable: a NEW authenticated-executable function off both lists is flagged; baseline and reviewed are not", () => {
  const reviewed = reviewedFromSources(parseSurfaceModule(SURFACE_SRC), []);
  const baseline = { version: 1, anon: [], authenticated: ["old_rpc(uuid)"] };
  const rows = [
    row("old_rpc", "uuid", ["authenticated"]),
    row("ensure_guest_session", "text", ["anon", "authenticated"]),
    row("new_definer_rpc", "uuid, jsonb", ["authenticated"]),
  ];
  const result = compareExecutable({ rows, reviewed, baseline });
  assert.deepEqual(
    result.unreviewed.map((u) => `${u.role}:${u.signature}`),
    ["authenticated:new_definer_rpc(uuid, jsonb)"],
  );
  assert.equal(result.unreviewed[0].secdef, true);
});

test("compareExecutable: an old function that gains an ANON grant is new for anon even though baselined for authenticated", () => {
  const reviewed = reviewedFromSources(parseSurfaceModule(SURFACE_SRC), []);
  const baseline = { version: 1, anon: [], authenticated: ["old_rpc(uuid)"] };
  const result = compareExecutable({ rows: [row("old_rpc", "uuid", ["anon", "authenticated"])], reviewed, baseline });
  assert.deepEqual(result.unreviewed.map((u) => `${u.role}:${u.signature}`), ["anon:old_rpc(uuid)"]);
});

test("compareExecutable: a changed argument list is a new signature (DROP + CREATE makes a new object)", () => {
  const reviewed = reviewedFromSources(parseSurfaceModule(SURFACE_SRC), []);
  const baseline = { version: 1, anon: [], authenticated: ["old_rpc(uuid)"] };
  const result = compareExecutable({ rows: [row("old_rpc", "uuid, text", ["authenticated"])], reviewed, baseline });
  assert.equal(result.unreviewed.length, 1);
  assert.deepEqual(result.staleBaseline, ["authenticated:old_rpc(uuid)"]);
});

test("compareExecutable with NO baseline treats every off-list function as unreviewed", () => {
  const reviewed = reviewedFromSources(parseSurfaceModule(SURFACE_SRC), []);
  const result = compareExecutable({
    rows: [row("a", "", ["authenticated"]), row("receipt_for_code", "text", ["anon", "authenticated"])],
    reviewed,
    baseline: null,
  });
  assert.deepEqual(result.unreviewed.map((u) => `${u.role}:${u.signature}`), ["authenticated:a()"]);
});

test("buildBaseline is sorted, per role, and round-trips through compareExecutable to zero findings", () => {
  const rows = [row("z", "", ["authenticated"]), row("a", "uuid", ["anon", "authenticated"])];
  const baseline = buildBaseline(rows);
  assert.deepEqual(baseline.anon, ["a(uuid)"]);
  assert.deepEqual(baseline.authenticated, ["a(uuid)", "z()"]);
  const reviewed = reviewedFromSources({ publicSurface: [], policyHelpers: [] }, []);
  assert.equal(compareExecutable({ rows, reviewed, baseline }).unreviewed.length, 0);
});

test("decideOutcome: WARN-ONLY never fails, even with findings and no baseline", () => {
  const d = decideOutcome({ enforce: false, baselinePresent: false, unreviewedCount: 40 });
  assert.equal(d.exitCode, 0);
  assert.equal(d.level, "warn");
});

test("decideOutcome: ENFORCE fails on a finding, refuses without a baseline, passes when clean", () => {
  assert.equal(decideOutcome({ enforce: true, baselinePresent: true, unreviewedCount: 1 }).exitCode, 1);
  const noBase = decideOutcome({ enforce: true, baselinePresent: false, unreviewedCount: 0 });
  assert.equal(noBase.exitCode, 1);
  assert.match(noBase.message, /baseline/i);
  const clean = decideOutcome({ enforce: true, baselinePresent: true, unreviewedCount: 0 });
  assert.equal(clean.exitCode, 0);
  assert.equal(clean.level, "pass");
});
