/**
 * The link-store's contract, checked without a database.
 *
 * The interesting property is not that the functions exist — it is that the
 * two READ paths deliberately disagree about paused links, and that neither
 * turns a failed read into an empty result.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { blankComments } from "@/lib/quality/supabase-unchecked-read";

const src = blankComments(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "link-store.ts"), "utf8"),
);

test("the picker read is exported under the name other areas were given", () => {
  // Workspace & Dashboards' qr_code block inspector binds to this name. A
  // rename is a cross-area break, so the name is pinned here on purpose.
  assert.match(src, /export async function listLinksForTenant\(/);
  assert.match(src, /export type LinkSummary = \{/);
});

test("the picker shows paused links; the resolver hides them", () => {
  // Two callers, two truths. A guest scanning a paused code must get an honest
  // refusal. An operator choosing which link to PRINT must see paused ones, or
  // a paused code is invisible in the picker and they design a table tent
  // around a link that currently resolves to nothing.
  const resolver = src.slice(src.indexOf("findActiveLinkByCode"), src.indexOf("LinkSummary"));
  assert.match(resolver, /\.eq\("status", "active"\)/, "the resolver must filter to active");

  const picker = src.slice(src.indexOf("listLinksForTenant"), src.indexOf("ScanRecord"));
  assert.doesNotMatch(picker, /\.eq\("status"/, "the picker must NOT filter by status");
  assert.match(picker, /status/, "and must return status so the UI can mark them");
});

test("every read is scoped to a tenant", () => {
  // Service-role queries bypass RLS, so the predicate is the only thing
  // between one workspace and another's links.
  for (const fn of ["findActiveLinkByCode", "listLinksForTenant"]) {
    const body = src.slice(src.indexOf(fn));
    const upTo = body.slice(0, body.indexOf("\n}\n") + 3);
    assert.match(upTo, /\.eq\("tenant_id", tenantId\)/, `${fn} must filter on tenant_id`);
  }
});

test("a failed picker read THROWS rather than returning an empty list", () => {
  // An empty picker on a read error looks like an empty workspace, and the
  // operator creates a duplicate link rather than finding the one they have.
  // This repo has the same defect on record: a read whose failure was
  // indistinguishable from empty gave every tenant an empty nav for months.
  const picker = src.slice(src.indexOf("listLinksForTenant"), src.indexOf("ScanRecord"));
  assert.match(picker, /if \(error\)/, "the error must be checked");
  assert.match(picker, /throw new Error/, "and must throw, not fall through to []");
  assert.doesNotMatch(picker, /if \(error\)[\s\S]{0,80}return \[\]/, "must not swallow the error into an empty list");
});

test("the subject read is exported under the name other areas were given", () => {
  // Appointments' #1790 named this shape; Events and Menu will bind to it too.
  assert.match(src, /export async function findLinkForSubject\(/);
  assert.match(src, /export type LinkForSubject = \{/);
});

test("the subject read NEVER mints", () => {
  // A thing gets a link on FIRST SHARE, by an operator's deliberate action.
  // A mount that minted would put a row in `links` for every profile anyone
  // ever opened — and every one of those rows is a code somebody might print.
  const fn = src.slice(src.indexOf("findLinkForSubject(q: SubjectQuery)"), src.indexOf("export type ScanRecord"));
  assert.doesNotMatch(fn, /\.insert\(/, "the subject read must not write");
  assert.doesNotMatch(fn, /createLink/, "the subject read must not mint");
});

test("the composed URL uses a PASSED-IN origin, never a guessed one", () => {
  // A URL composed against the wrong origin is a QR pointing at another
  // domain — discovered on a printed card by a guest, not by a test.
  const fn = src.slice(src.indexOf("findLinkForSubject(q: SubjectQuery)"), src.indexOf("export type ScanRecord"));
  assert.match(fn, /\$\{q\.origin/, "the origin must come from the caller");
  assert.doesNotMatch(fn, /headers\(\)|process\.env\.\w*URL/, "must not infer a host");
});

test("the subject read returns PAUSED links rather than appearing to have none", () => {
  // If a subject's only link is paused and this returned null, the mount would
  // invite a duplicate — leaving two codes for one thing, one printed and dead.
  const fn = src.slice(src.indexOf("findLinkForSubject(q: SubjectQuery)"), src.indexOf("export type ScanRecord"));
  assert.doesNotMatch(fn, /\.eq\("status", "active"\)/, "must not filter to active");
  assert.match(src, /status: "active" \| "paused";/);
});

test("a failed subject read THROWS rather than reporting no link", () => {
  // Returning null on an error makes the mount offer to create a SECOND code
  // for a thing that already has one — and the first is the printed one.
  const fn = src.slice(src.indexOf("findLinkForSubject(q: SubjectQuery)"), src.indexOf("export type ScanRecord"));
  assert.match(fn, /throw new Error/);
});

test("the picker is capped, so an inspector dropdown cannot stream a workspace", () => {
  const picker = src.slice(src.indexOf("listLinksForTenant"), src.indexOf("ScanRecord"));
  assert.match(picker, /\.limit\(/);
});

test("no read destructures data without also checking error", () => {
  // The recorded incident: `const { data } = await ...` makes a failed read
  // indistinguishable from an empty one.
  const reads = [...src.matchAll(/const \{([^}]*)\} = await admin/g)].map((m) => m[1]!);
  assert.ok(reads.length > 0, "expected some supabase reads");
  for (const destructured of reads) {
    assert.ok(destructured.includes("error"), `read destructures ${destructured.trim()} without error`);
  }
});
