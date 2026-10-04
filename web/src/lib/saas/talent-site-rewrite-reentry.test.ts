import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function src(relative: string): string {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

const REENTRY = "src/lib/saas/talent-site-rewrite-reentry.ts";
const PROXY = "src/proxy.ts";

test("talent-site rewrite re-entry rebinds headers and guest identity (D-MSG-431/422)", () => {
  const helper = src(REENTRY);
  assert.match(helper, /D-MSG-431/);
  assert.match(helper, /D-MSG-422/);
  assert.match(helper, /resolveTenantContext\(request, candidateHost\)/);
  assert.match(
    helper,
    /rebound\.set\(HOST_TALENT_PROFILE_HEADER, reboundCtx\.talentProfileId\)/,
  );
  assert.match(helper, /rebound\.set\(HOST_CONTEXT_HEADER, "talent_site"\)/);
  assert.match(helper, /attachTalentSiteGuestIdentity\(request, rebound\)/);

  const proxy = src(PROXY);
  assert.match(proxy, /talentSiteRewriteReentryResponse/);
  // Must not forward only the stripped clone from the short-circuit.
  assert.doesNotMatch(
    proxy,
    /pathname\.startsWith\("\/_talent-site\/"\)[\s\S]{0,400}?headers:\s*sanitizedInboundHeaders/,
  );
});
