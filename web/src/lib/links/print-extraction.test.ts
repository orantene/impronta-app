/**
 * The extraction seam, and the route contract that rests on it.
 *
 * These are source-shape assertions, deliberately: the route cannot be invoked
 * without a Next request context and a signed-in workspace session, and a test
 * that mocks all of that would assert my mocks rather than the route. What CAN
 * be pinned without lying is the shape of the seam and the security properties
 * of the handler, and those are the parts that fail quietly.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { WEB_ROOT, blankComments } from "@/lib/quality/supabase-unchecked-read";

import { EXTRACTOR_MISSING_REASON, getPrintDesignExtractor } from "./print-extraction";

const ROUTE = blankComments(
  readFileSync(
    join(WEB_ROOT, "src/app/(workspace)/[tenantSlug]/admin/print/[id]/export/route.ts"),
    "utf8",
  ),
);

test("the missing extractor is a null, not a stub returning a default design", () => {
  // A stub would put a real PDF of the WRONG layout in an operator's hands.
  // Absence has to be structurally distinct from a value, or the two get
  // confused exactly once, in production, on paper.
  assert.equal(getPrintDesignExtractor(), null);
});

test("the reason a print cannot run says the design is not at fault", () => {
  assert.match(EXTRACTOR_MISSING_REASON, /Nothing is wrong with this design/);
});

test("the route NEVER resolves the tenant from the URL slug", () => {
  // [tenantSlug] is attacker-supplied. The guard inside loadPrintDesignAction
  // resolves from the workspace surface and filters on tenant_id; reading the
  // slug here would reintroduce the cross-tenant hole it closes.
  assert.doesNotMatch(ROUTE, /tenantSlug/, "the handler must not read tenantSlug");
  assert.match(ROUTE, /loadPrintDesignAction/);
});

test("a missing design and an unauthorised one are both 404, so neither can be probed", () => {
  // loadPrintDesignAction returns null for both. Distinguishing them here would
  // let a signed-in member of one tenant enumerate another tenant's design ids.
  assert.match(ROUTE, /if \(!row\) return problem\(404/);
});

test("an unimplemented extractor is 501, never 500", () => {
  // 500 sends someone hunting for a fault in their own design. There is none.
  assert.match(ROUTE, /problem\(501, EXTRACTOR_MISSING_REASON\)/);
});

test("a refusal is 422 and carries the sentence that says what to change", () => {
  assert.match(ROUTE, /PrintDesignRefusal/);
  assert.match(ROUTE, /problem\(422, error\.message\)/);
});

test("a non-refusal error is rethrown, not flattened into a PDF response", () => {
  // Swallowing an unexpected error here would return 200 with no body, which
  // downloads as a corrupt PDF and reports nothing.
  assert.match(ROUTE, /throw error;/);
});

test("the response is never cached: a print run is per-tenant and staff-only", () => {
  assert.match(ROUTE, /private, no-store/);
});

test("an empty link set refuses rather than emitting a zero-page PDF", () => {
  // A zero-page PDF opens, prints nothing, and looks like a broken printer.
  assert.match(ROUTE, /nothing to print/i);
});

test("the route is in next.config's outputFileTracingIncludes", () => {
  // Belt and braces alongside font-tracing-coverage: this route embeds fonts
  // read at runtime, and a missing trace 500s only on the serverless bundle.
  const config = readFileSync(join(WEB_ROOT, "next.config.ts"), "utf8");
  assert.match(config, /"\/\[tenantSlug\]\/admin\/print\/\[id\]\/export":/);
});
