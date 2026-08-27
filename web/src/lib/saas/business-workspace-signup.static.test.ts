/**
 * Pins the business signup front door.
 *
 * `agencies.workspace_type` ('talent' | 'business') and the Website plan tier
 * both shipped to production BEFORE anything could reach them: /get-started
 * only accepted operator/agency/organization, so the whole Website tier was
 * unreachable from the front door. These assertions are what keeps that from
 * silently regressing — none of it is observable from a unit test of a pure
 * function, because the mapping lives inside a Supabase insert literal.
 *
 * Static (source-text) assertions on purpose: `workspace-signup.server.ts`
 * cannot be imported here without a Supabase service-role client and a Next
 * request scope.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const SRC = path.join(process.cwd(), "src");

function read(rel: string): string {
  return readFileSync(path.join(SRC, rel), "utf8");
}

test("the /get-started action accepts a 'business' audience", () => {
  const source = read("app/(marketing)/get-started/actions.ts");
  assert.match(
    source,
    /audience:\s*z\.enum\(\[[^\]]*"business"[^\]]*\]\)/,
    "the signup zod enum must accept 'business' or a local business can never submit the form",
  );
});

test("the signup form offers the local-business option", () => {
  const source = read("components/marketing/get-started-form-copy.ts");
  assert.match(
    source,
    /key:\s*"business"/,
    "the audience radio must include a 'business' option in the EN copy",
  );
  // Both locales, not just English: a Spanish visitor who cannot see the
  // option cannot pick it, and the funnel is bilingual.
  assert.equal(
    (source.match(/key:\s*"business"/g) ?? []).length,
    2,
    "the 'business' option must exist in BOTH the en and es option lists",
  );
});

test("a business lead provisions workspace_type='business', talent otherwise", () => {
  const source = read("lib/saas/workspace-signup.server.ts");
  assert.match(
    source,
    /workspace_type:\s*lead\.audience === "business" \? "business" : "talent"/,
    "the agencies insert must derive workspace_type from the lead audience",
  );
});

test("kind stays 'agency' for every self-serve workspace", () => {
  // proxy.ts routes hosts on POSITIVE `kind` predicates (`kind: "agency" |
  // "hub"`). A third kind would fall through every one of them and 404 the
  // tenant's own storefront. What a business IS is said by workspace_type.
  const source = read("lib/saas/workspace-signup.server.ts");
  assert.match(source, /kind:\s*"agency",/, "self-serve provisioning must insert kind 'agency'");
  assert.doesNotMatch(
    source,
    /kind:\s*"business"/,
    "'business' is a workspace_type, never an organization kind",
  );
});

test("provisioning never hands out a paid tier", () => {
  // Website is PAID. The upgrade runs through the post-provision checkout and
  // the Stripe webhook sets plan_tier. Provisioning straight onto a paid tier
  // would give away a plan nobody paid for.
  const source = read("lib/saas/workspace-signup.server.ts");
  assert.match(source, /plan_tier:\s*"free",/);
  assert.doesNotMatch(source, /plan_tier:\s*"website"/);
});

test("?tier=website opens the form on the business option", () => {
  const source = read("app/(marketing)/get-started/page.tsx");
  assert.match(
    source,
    /rawTier === "website"\)\s*return "business"/,
    "a visitor arriving from the Website tier has already said they are a business",
  );
});
