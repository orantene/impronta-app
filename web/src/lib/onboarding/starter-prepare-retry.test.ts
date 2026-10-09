import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  clearStarterPrepare,
  markStarterPrepareFailed,
  needsStarterPrepareRetry,
  parseStarterPrepare,
  planStarterPrepareRetry,
  settingsAfterSuccessfulRetry,
} from "./starter-prepare";

test("parseStarterPrepare: failed stamp", () => {
  const stamp = parseStarterPrepare({
    status: "failed",
    at: "2026-10-08T12:00:00.000Z",
    error: "boom",
  });
  assert.deepEqual(stamp, {
    status: "failed",
    at: "2026-10-08T12:00:00.000Z",
    error: "boom",
  });
});

test("parseStarterPrepare: rejects garbage", () => {
  assert.equal(parseStarterPrepare(null), null);
  assert.equal(parseStarterPrepare({ status: "nope", at: "x" }), null);
  assert.equal(parseStarterPrepare({ status: "failed" }), null);
});

test("needsStarterPrepareRetry: site_compose failed (compose path)", () => {
  assert.equal(
    needsStarterPrepareRetry({ site_compose: { outcome: "failed", at: "t" } }),
    true,
  );
  assert.equal(
    needsStarterPrepareRetry({ site_compose: { outcome: "composed", at: "t" } }),
    false,
  );
});

test("needsStarterPrepareRetry: starter_prepare failed (seed/throw path)", () => {
  assert.equal(
    needsStarterPrepareRetry(
      markStarterPrepareFailed({}, "seed failed", "2026-10-08T12:00:00.000Z"),
    ),
    true,
  );
  assert.equal(needsStarterPrepareRetry(clearStarterPrepare({ starter_prepare: { status: "failed", at: "t" } })), false);
});

test("simulate compose failure → banner state → retry plan → cleared", () => {
  // Provision left a compose failure stamp (non-fatal after try/catch).
  const afterFail = { site_compose: { outcome: "failed", notes: ["compose blew up"] } };
  assert.equal(needsStarterPrepareRetry(afterFail), true);

  const withBrief = planStarterPrepareRetry({ settings: afterFail, briefId: "brief-1" });
  assert.deepEqual(withBrief, { kind: "compose", briefId: "brief-1" });

  // Successful retry rewrites compose outcome and clears any starter_prepare.
  const afterOk = settingsAfterSuccessfulRetry(
    markStarterPrepareFailed(afterFail, "also recorded"),
    "composed",
  );
  assert.equal(needsStarterPrepareRetry(afterOk), false);
  assert.equal((afterOk.site_compose as { outcome: string }).outcome, "composed");
  assert.equal("starter_prepare" in afterOk, false);
});

test("retry without brief plans seed path", () => {
  const settings = markStarterPrepareFailed({}, "no compose yet");
  assert.deepEqual(planStarterPrepareRetry({ settings, briefId: null }), { kind: "seed" });
  assert.deepEqual(
    planStarterPrepareRetry({ settings: { site_compose: { outcome: "composed" } }, briefId: "b" }),
    { kind: "noop" },
  );
});

test("static: provision records starter_prepare on fail/throw and contains try/catch", () => {
  const src = readFileSync(
    join(process.cwd(), "src/lib/server-actions/talent-workspace-provision.ts"),
    "utf8",
  );
  assert.match(src, /recordStarterPrepareFailed/);
  assert.match(src, /forgetUserTenantMemberships/);
  assert.match(src, /try\s*\{[\s\S]*onboardStarterContent[\s\S]*\}\s*catch/);
});

test("static: retry action calls composeSiteFromBrief and clears flag", () => {
  const src = readFileSync(
    join(process.cwd(), "src/lib/server-actions/retry-starter-prepare.ts"),
    "utf8",
  );
  assert.match(src, /composeSiteFromBrief/);
  assert.match(src, /clearStarterPrepareFlag/);
  assert.match(src, /planStarterPrepareRetry/);
  assert.match(src, /overwrite:\s*true/);
});

test("static: Website launchpad mounts StarterPrepareBanner", () => {
  const src = readFileSync(
    join(
      process.cwd(),
      "src/components/admin/shell/internal/page-modules/WebsiteLaunchpad.tsx",
    ),
    "utf8",
  );
  assert.match(src, /StarterPrepareBanner/);
});
