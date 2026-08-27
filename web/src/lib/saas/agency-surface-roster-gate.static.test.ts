/**
 * INVARIANT — the agency talent-profile surface must gate on the CURRENT
 * tenant's visible roster.
 *
 * `talent_profiles.is_publicly_listed` and `agency_talent_roster` answer two
 * DIFFERENT questions, and conflating them is what broke improntamodels.com:
 *
 *   is_publicly_listed  = "is this talent listed anywhere on the platform?"
 *                         (trigger-maintained; true as soon as ANY tenant, the
 *                         hub included, has them site_visible/featured)
 *   agency_talent_roster = "may THIS tenant show them?"
 *
 * RLS on the public read path enforces only the first. So a talent who is
 * `site_visible` on the hub is admitted on EVERY agency host, including one
 * whose own roster row for them is `removed` or `roster_only`.
 *
 * Live consequence: three talent Impronta had taken off its roster still served
 * complete, indexable profiles with working "Inquire" buttons, while the
 * mirror-image roster gate in `startGuestChatInquiry` rejected every send — so
 * the visitor only discovered the dead end after typing a brief and handing
 * over their name and email. The agency was also publicly showing talent it had
 * explicitly removed.
 *
 * The rule this pins is already stated at the top of `talent-roster.ts`:
 * "Every public storefront query for talent — listing, preview, inquiry
 * submission — must gate on the current tenant's roster."
 *
 * This test fails if the profile view stops consulting the roster on the agency
 * surface. It is deliberately a STATIC source check: the gate lives in a very
 * large server component whose real execution needs a host context, a Supabase
 * client and a rendered tree, and a test that heavy would be skipped, not run.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const PROFILE_VIEW = path.join(
  process.cwd(),
  "src/app/t/[profileCode]/profile-view.tsx",
);
const GUARD = path.join(
  process.cwd(),
  "src/app/t/[profileCode]/_guards/agency-roster-visibility.ts",
);

test("the guard actually consults the tenant roster and 404s", () => {
  const guard = readFileSync(GUARD, "utf8");
  assert.ok(
    guard.includes("isTalentOnTenantRoster"),
    "the guard must consult agency_talent_roster; RLS only enforces the " +
      "global is_publicly_listed gate, which is a different question.",
  );
  assert.ok(
    guard.includes("notFound()"),
    "a roster miss must notFound(), not merely hide the inquiry CTA.",
  );
});

test("the agency profile surface calls the roster guard", () => {
  const src = readFileSync(PROFILE_VIEW, "utf8");
  assert.ok(
    src.includes("assertTalentVisibleOnAgencySurface"),
    "profile-view.tsx no longer references isTalentOnTenantRoster. The agency " +
      "surface must gate on the current tenant's visible roster; RLS only " +
      "enforces the global is_publicly_listed gate, which is a different " +
      "question. See the header of this test.",
  );
});

test("the roster gate is agency-surface scoped and 404s on a miss", () => {
  const src = readFileSync(PROFILE_VIEW, "utf8");
  // Specifically the VIEW's gate, not the metadata one — they have different
  // guards (metadata keys off hostCtx alone; the view also has `surface`).
  const viewStart = src.indexOf("export async function TalentProfileView");
  assert.ok(viewStart > 0, "expected TalentProfileView in profile-view.tsx");
  const callIndex = src.indexOf("assertTalentVisibleOnAgencySurface(", viewStart);
  assert.ok(
    callIndex > 0,
    "expected a roster gate inside TalentProfileView as defence in depth — " +
      "the modal route shares this view and has its own metadata.",
  );

  // The guard condition sits just above the call; the notFound() just below.
  const before = src.slice(Math.max(0, callIndex - 400), callIndex);
  const after = src.slice(callIndex, callIndex + 400);

  assert.match(
    before,
    /surface === "agency"/,
    "the roster gate must be scoped to the agency surface — the freelancer / " +
      "hub surface legitimately serves talent this tenant does not roster.",
  );
  assert.match(
    before,
    /!resolvedPreview/,
    "the roster gate must not fire in preview mode, or operators lose the " +
      "ability to preview a talent before making them site_visible.",
  );
  // notFound() itself now lives inside the guard; asserted in the first test.
});

test("generateMetadata gates too, so no metadata leaks for a removed talent", () => {
  const src = readFileSync(PROFILE_VIEW, "utf8");
  const calls = src.split("assertTalentVisibleOnAgencySurface(").length - 1;
  assert.ok(
    calls >= 2,
    "Expected the roster gate in BOTH buildTalentProfileMetadata and " +
      "TalentProfileView, found " + calls + " call(s).\n\n" +
      "Gating only the view leaves the head intact: the body 404s while " +
      "generateMetadata still emits the removed talent's title, description, " +
      "OG image and canonical, so the agency keeps publishing rich link " +
      "previews for people it took off its roster.",
  );

  const metaIndex = src.indexOf("export async function buildTalentProfileMetadata");
  const viewIndex = src.indexOf("export async function TalentProfileView");
  const firstCall = src.indexOf("assertTalentVisibleOnAgencySurface(");
  assert.ok(
    metaIndex >= 0 && viewIndex > metaIndex,
    "expected buildTalentProfileMetadata to precede TalentProfileView",
  );
  assert.ok(
    firstCall > metaIndex && firstCall < viewIndex,
    "the metadata gate is missing — it is what keeps the removed talent's " +
      "title / OG / canonical out of the head.",
  );
});

/**
 * NOTE ON THE STATUS CODE, so nobody re-derives this the hard way.
 *
 * These gates produce a SOFT 404: a "Page not found" body served with HTTP 200.
 * `src/app/t/[profileCode]/loading.tsx` puts an implicit Suspense boundary on
 * the segment, so Next flushes the shell before either generateMetadata or the
 * page component resolves, and notFound() cannot retract a status already on
 * the wire. Moving the gate earlier within the segment does not help — that was
 * measured, not assumed.
 *
 * The indexing risk is closed regardless: Next's not-found page carries
 * `<meta name="robots" content="noindex">`, the talent's own metadata is gone,
 * and the tenant sitemap scopes by `created_by_agency_id` so these rows were
 * never advertised. A hard 404 would need the check in `proxy.ts` (a roster
 * lookup on every /t/ request) or dropping loading.tsx for all talent pages.
 */
