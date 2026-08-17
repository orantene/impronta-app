/**
 * Cover for the redirect-manager helpers (`./redirects.ts`).
 *
 * Lane: `test:builder-capabilities:a` picks up every `*.test.ts` directly under
 * `src/lib/site-admin` (list-test-files --depth=1), so this runs in CI.
 *
 * Run: node_modules/.bin/tsx --test src/lib/site-admin/redirects.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  auditRedirects,
  matchesRedirectQuery,
  parseRedirectImport,
  redirectFieldHint,
  resolveFinalPath,
  toRedirectsCsv,
  REDIRECT_IMPORT_MAX,
  type RedirectRecord,
} from "./redirects";

function rec(
  id: string,
  oldPath: string,
  newPath: string,
  extra: Partial<RedirectRecord> = {},
): RedirectRecord {
  return {
    id,
    oldPath,
    newPath,
    statusCode: 301,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: null,
    ...extra,
  };
}

// ── resolveFinalPath ─────────────────────────────────────────────────────────

test("resolveFinalPath: an unredirected path is zero hops", () => {
  const walk = resolveFinalPath("/b", new Map());
  assert.deepEqual(walk, { finalPath: "/b", hops: 0, looped: false });
});

test("resolveFinalPath: follows a chain to its end", () => {
  const active = new Map([
    ["/b", "/c"],
    ["/c", "/d"],
  ]);
  assert.deepEqual(resolveFinalPath("/b", active), {
    finalPath: "/d",
    hops: 2,
    looped: false,
  });
});

test("resolveFinalPath: a two-node cycle is flagged, not hung", () => {
  const active = new Map([
    ["/a", "/b"],
    ["/b", "/a"],
  ]);
  assert.equal(resolveFinalPath("/a", active).looped, true);
});

test("resolveFinalPath: a self-redirect is a loop", () => {
  assert.equal(resolveFinalPath("/a", new Map([["/a", "/a"]])).looped, true);
});

// ── auditRedirects ───────────────────────────────────────────────────────────

test("auditRedirects: a healthy single redirect has no issues", () => {
  const issues = auditRedirects([rec("1", "/old", "/new")]);
  assert.equal(issues.size, 0);
});

test("auditRedirects: /a→/b plus /b→/c reports the chain with its final path", () => {
  const issues = auditRedirects([rec("1", "/a", "/b"), rec("2", "/b", "/c")]);
  // Only the FIRST hop is the problem — /b→/c is itself a clean single hop.
  assert.deepEqual(issues.get("1"), [{ kind: "chain", finalPath: "/c", hops: 2 }]);
  assert.equal(issues.get("2"), undefined);
});

test("auditRedirects: mutual redirects are both flagged as loops", () => {
  const issues = auditRedirects([rec("1", "/a", "/b"), rec("2", "/b", "/a")]);
  assert.deepEqual(issues.get("1"), [{ kind: "loop" }]);
  assert.deepEqual(issues.get("2"), [{ kind: "loop" }]);
});

test("auditRedirects: a disabled row is invisible to the chain walk", () => {
  const issues = auditRedirects([
    rec("1", "/a", "/b"),
    rec("2", "/b", "/c", { active: false }),
  ]);
  assert.equal(issues.get("1"), undefined);
});

test("auditRedirects: a disabled duplicate of an active From is shadowed", () => {
  const issues = auditRedirects([
    rec("1", "/a", "/b"),
    rec("2", "/a", "/z", { active: false }),
  ]);
  assert.deepEqual(issues.get("2"), [{ kind: "shadowed" }]);
});

// ── parseRedirectImport ──────────────────────────────────────────────────────

test("parseRedirectImport: comma, tab, space and arrow separators all parse", () => {
  const parsed = parseRedirectImport(
    ["/a,/1", "/b\t/2", "/c /3", "/d -> /4", "/e → /5"].join("\n"),
  );
  assert.equal(parsed.validCount, 5);
  assert.deepEqual(
    parsed.rows.map((r) => (r.ok ? r.newPath : r.error)),
    ["/1", "/2", "/3", "/4", "/5"],
  );
});

test("parseRedirectImport: default status is 301; 302 and words are honoured", () => {
  const parsed = parseRedirectImport(
    ["/a,/1", "/b,/2,302", "/c,/3,temporary", "/d,/4,permanent"].join("\n"),
  );
  assert.deepEqual(
    parsed.rows.map((r) => (r.ok ? r.statusCode : null)),
    [301, 302, 302, 301],
  );
});

test("parseRedirectImport: a header row is skipped, not treated as data", () => {
  const parsed = parseRedirectImport("from,to,status\n/a,/b,301");
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.validCount, 1);
});

test("parseRedirectImport: blank lines and # comments are ignored", () => {
  const parsed = parseRedirectImport("\n# migrating the blog\n/a,/b\n\n");
  assert.equal(parsed.rows.length, 1);
});

test("parseRedirectImport: paths are normalized the way the DB expects", () => {
  const parsed = parseRedirectImport("old-page,/new-page/");
  assert.deepEqual(
    parsed.rows[0]?.ok ? [parsed.rows[0].oldPath, parsed.rows[0].newPath] : null,
    ["/old-page", "/new-page"],
  );
});

test("parseRedirectImport: bad lines are reported with their 1-based line number", () => {
  const parsed = parseRedirectImport("/a,/b\n/only-one\n/c,/d");
  assert.equal(parsed.validCount, 2);
  const bad = parsed.rows.find((r) => !r.ok);
  assert.equal(bad?.ok, false);
  assert.equal(bad && !bad.ok ? bad.line : null, 2);
});

test("parseRedirectImport: a full URL is rejected with a path-only message", () => {
  const parsed = parseRedirectImport("https://example.com/a,/b");
  const row = parsed.rows[0];
  assert.equal(row?.ok, false);
  assert.match(row && !row.ok ? row.error : "", /not a full URL/i);
});

test("parseRedirectImport: identical from/to is rejected", () => {
  const parsed = parseRedirectImport("/a,/a");
  assert.equal(parsed.validCount, 0);
});

test("parseRedirectImport: a repeated From inside one paste is rejected once", () => {
  const parsed = parseRedirectImport("/a,/b\n/a,/c");
  assert.equal(parsed.validCount, 1);
  const dup = parsed.rows[1];
  assert.match(dup && !dup.ok ? dup.error : "", /more than once/i);
});

test("parseRedirectImport: an unknown status code is rejected, not silently 301'd", () => {
  const parsed = parseRedirectImport("/a,/b,307");
  assert.equal(parsed.validCount, 0);
  const row = parsed.rows[0];
  assert.match(row && !row.ok ? row.error : "", /301 or 302/);
});

test("parseRedirectImport: the paste is capped and reports truncation", () => {
  const text = Array.from(
    { length: REDIRECT_IMPORT_MAX + 5 },
    (_unused, i) => `/from-${i},/to-${i}`,
  ).join("\n");
  const parsed = parseRedirectImport(text);
  assert.equal(parsed.truncated, true);
  assert.equal(parsed.rows.length, REDIRECT_IMPORT_MAX);
});

test("parseRedirectImport: empty input yields nothing rather than an error row", () => {
  const parsed = parseRedirectImport("   \n\n");
  assert.deepEqual(parsed.rows, []);
  assert.equal(parsed.truncated, false);
});

// ── CSV round-trip ───────────────────────────────────────────────────────────

test("toRedirectsCsv output parses back through the importer", () => {
  const csv = toRedirectsCsv([
    rec("1", "/a", "/b"),
    rec("2", "/c", "/d", { statusCode: 302, active: false }),
  ]);
  assert.equal(csv.split("\n")[0], "from,to,status,state");
  const parsed = parseRedirectImport(csv);
  // The 4th column ("state") is not an import field, so those lines are
  // rejected rather than silently mis-parsed — the operator trims it.
  assert.equal(parsed.rows.length, 2);
  assert.ok(parsed.rows.every((r) => !r.ok));
  // Without the state column it round-trips cleanly.
  const trimmed = csv
    .split("\n")
    .map((line) => line.split(",").slice(0, 3).join(","))
    .join("\n");
  const reparsed = parseRedirectImport(trimmed);
  assert.equal(reparsed.validCount, 2);
});

// ── small helpers ────────────────────────────────────────────────────────────

test("matchesRedirectQuery: matches either path, case-insensitively", () => {
  const row = rec("1", "/Old-Page", "/new");
  assert.equal(matchesRedirectQuery(row, "old"), true);
  assert.equal(matchesRedirectQuery(row, "NEW"), true);
  assert.equal(matchesRedirectQuery(row, "  "), true);
  assert.equal(matchesRedirectQuery(row, "nope"), false);
});

test("redirectFieldHint: silent while empty, explains once it can't be a path", () => {
  assert.equal(redirectFieldHint(""), null);
  assert.equal(redirectFieldHint("/fine"), null);
  assert.match(redirectFieldHint("/a?b=1") ?? "", /query string/i);
});
