import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveTalentHubCustomDomainHomeRedirect } from "./hub-custom-domain-redirect";

test("hub visitor with active primary custom domain → custom home", () => {
  assert.equal(
    resolveTalentHubCustomDomainHomeRedirect({
      platformHost: true,
      isModal: false,
      preview: undefined,
      primaryActiveCustomDomain: "sofia.com",
    }),
    "https://sofia.com/",
  );
});

test("staff preview=1 keeps the hub profile", () => {
  assert.equal(
    resolveTalentHubCustomDomainHomeRedirect({
      platformHost: true,
      isModal: false,
      preview: "1",
      primaryActiveCustomDomain: "sofia.com",
    }),
    null,
  );
});

test("modal never redirects", () => {
  assert.equal(
    resolveTalentHubCustomDomainHomeRedirect({
      platformHost: true,
      isModal: true,
      preview: undefined,
      primaryActiveCustomDomain: "sofia.com",
    }),
    null,
  );
});

test("agency / non-platform host never redirects", () => {
  assert.equal(
    resolveTalentHubCustomDomainHomeRedirect({
      platformHost: false,
      isModal: false,
      preview: undefined,
      primaryActiveCustomDomain: "sofia.com",
    }),
    null,
  );
});

test("no active primary custom domain → no redirect", () => {
  assert.equal(
    resolveTalentHubCustomDomainHomeRedirect({
      platformHost: true,
      isModal: false,
      preview: undefined,
      primaryActiveCustomDomain: null,
    }),
    null,
  );
  assert.equal(
    resolveTalentHubCustomDomainHomeRedirect({
      platformHost: true,
      isModal: false,
      preview: undefined,
      primaryActiveCustomDomain: "  ",
    }),
    null,
  );
});

test("profile-view wires hub custom-domain 308 before freeform render", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/t/[profileCode]/profile-view.tsx"),
    "utf8",
  );
  // The redirect lives in load-hub-custom-domain-redirect.ts (profile-view.tsx is on the file-size ratchet).
  assert.match(src, /redirectHubProfileToCustomDomain/);
  // Compare inside TalentProfileView (metadata also calls the freeform resolver).
  const viewAt = src.indexOf("export async function TalentProfileView");
  assert.ok(viewAt > 0);
  const view = src.slice(viewAt);
  const redirectAt = view.indexOf("redirectHubProfileToCustomDomain");
  const freeformAt = view.indexOf("resolvePlatformTalentSiteForProfile");
  assert.ok(redirectAt > 0 && freeformAt > redirectAt);
  const loader = readFileSync(
    join(process.cwd(), "src/lib/talent-site/server/load-hub-custom-domain-redirect.ts"),
    "utf8",
  );
  assert.match(loader, /export async function redirectHubProfileToCustomDomain/);
  assert.match(loader, /loadTalentHubCustomDomainHomeRedirect\(/);
  assert.match(loader, /permanentRedirect\(customHome\)/);
});
