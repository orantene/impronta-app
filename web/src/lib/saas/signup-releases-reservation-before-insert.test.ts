import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A signup must not collide with its own subdomain reservation.
 *
 * `platform_subdomain_label_taken()` (migration 20261231280000) counts any
 * unexpired `saas_subdomain_reservations` row as "this label is taken". It has
 * no lead-exclusion parameter, and it cannot have one that helps: a reservation
 * is keyed by LEAD and is created BEFORE the tenant exists, so
 * `p_exclude_tenant_id` can never match it either.
 *
 * Both signup entry points reserve the slug for 15 minutes before provisioning
 * (`get-started/actions.ts` and `onboarding/build.server.ts`), and both funnel
 * into `provisionWorkspaceFromLead`. So if the reservation is still held when
 * the `agencies` row is inserted, the lead's own reservation answers "taken"
 * about the lead's own slug, and:
 *
 *   - the `agencies_slug_subdomain_guard` trigger rejects the insert (23505),
 *     which fails the whole signup; and
 *   - any caller that pre-checks the RPC renames the workspace to `<slug>-2`,
 *     which is worse, because it is a wrong answer rather than an error.
 *
 * The ordering is the fix, so the ordering is what this test pins.
 */

const here = dirname(fileURLToPath(import.meta.url));
const signup = readFileSync(join(here, "workspace-signup.server.ts"), "utf8");
const helper = readFileSync(join(here, "release-subdomain-reservation.server.ts"), "utf8");

test("the subdomain reservation is released BEFORE anything consults the namespace", () => {
  const release = signup.indexOf("await releaseSubdomainReservationForLead(admin, lead.id)");
  const insert = signup.indexOf('.from("agencies")\n    .insert({');

  assert.ok(release > 0, "provisionWorkspaceFromLead no longer releases the lead's reservation");
  assert.ok(insert > 0, "the agencies insert moved — this test's anchor is stale");
  assert.ok(
    release < insert,
    "the reservation is released after the agencies insert: the signup collides with its own reservation",
  );

  // The pre-check is the WORSE of the two readers. The trigger fails loudly
  // (23505); the pre-check silently renames the workspace to `<slug>-2` because
  // the lead's own reservation makes its own chosen name look taken. So the
  // release must come before it too, not merely before the insert.
  const preCheck = signup.indexOf("isPlatformSubdomainLabelTaken(slug)");
  if (preCheck > 0) {
    assert.ok(
      release < preCheck,
      "the namespace pre-check runs before the reservation is released: signup will silently rename the workspace",
    );
  }
});

test("the release deletes by lead_id, not by slug", () => {
  // A lead that changed its slug between form submit and provisioning still
  // holds the row it originally reserved. Deleting by slug would miss it and
  // leave a live reservation to collide with.
  assert.match(
    helper,
    /\.from\("saas_subdomain_reservations"\)\s*\n\s*\.delete\(\)\s*\n\s*\.eq\("lead_id", leadId\)/,
  );
});

test("the release is best-effort and never throws the signup away", () => {
  // Provisioning is idempotent and retried. A reservation row that cannot be
  // deleted must not be the reason a paid-for workspace fails to exist.
  const fn = helper.slice(helper.indexOf("async function releaseSubdomainReservationForLead"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.match(body, /logServerError\("workspace-signup\.releaseReservation", error\)/);
  assert.doesNotMatch(body, /\bthrow\b/);
});
