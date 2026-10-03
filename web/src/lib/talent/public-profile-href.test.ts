import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  isLocalDevOrigin,
  resolveTalentPublicPreviewDestinations,
  talentPublicProfileHref,
  talentPublicProfileLabel,
} from "./public-profile-href";

test("F41: production and server render keep the canonical host", () => {
  assert.equal(talentPublicProfileHref("TAL-93901", null), "https://tulala.digital/t/TAL-93901");
  assert.equal(talentPublicProfileHref("TAL-93901", "https://app.tulala.digital"), "https://tulala.digital/t/TAL-93901");
});

test("F41: a local dev origin builds the link on itself", () => {
  assert.equal(talentPublicProfileHref("TAL-93901", "http://localhost:3001"), "http://localhost:3001/t/TAL-93901");
  assert.equal(talentPublicProfileHref("x", "http://app.localhost:3000"), "http://app.localhost:3000/t/x");
  assert.equal(talentPublicProfileLabel("x", "http://127.0.0.1:3001"), "127.0.0.1:3001/t/x");
});

test("F41: only local hosts count as local", () => {
  assert.equal(isLocalDevOrigin("http://localhost.evil.com"), false);
  assert.equal(isLocalDevOrigin("not a url"), false);
  assert.equal(isLocalDevOrigin("http://tulala.test"), true);
});

test("preview destinations prefer a live personal website over the hub", () => {
  const resolved = resolveTalentPublicPreviewDestinations({
    profileCode: "TAL-93900",
    publicSiteUrl: "https://jorg-beauty-qa.tulala.digital",
  });
  assert.deepEqual(
    resolved.destinations.map((d) => d.kind),
    ["website", "hub"],
  );
  assert.equal(resolved.defaultHref, "https://jorg-beauty-qa.tulala.digital");
  assert.equal(resolved.destinations[1]?.href, "https://tulala.digital/t/TAL-93900");
});

test("preview destinations collapse when publicSiteUrl is only the hub path", () => {
  const resolved = resolveTalentPublicPreviewDestinations({
    profileCode: "TAL-93900",
    publicSiteUrl: "/t/TAL-93900",
  });
  assert.deepEqual(
    resolved.destinations.map((d) => d.kind),
    ["hub"],
  );
  assert.equal(resolved.defaultHref, "https://tulala.digital/t/TAL-93900");
});

test("relative /t/site URLs resolve against local origin in local QA", () => {
  const resolved = resolveTalentPublicPreviewDestinations({
    profileCode: "TAL-93900",
    publicSiteUrl: "/t/site/jorg-beauty-qa",
    currentOrigin: "http://localhost:3001",
  });
  assert.equal(resolved.defaultHref, "http://localhost:3001/t/site/jorg-beauty-qa");
  assert.equal(resolved.destinations[0]?.kind, "website");
});

test("relative /t/site URLs keep the canonical host outside local QA", () => {
  const resolved = resolveTalentPublicPreviewDestinations({
    profileCode: "TAL-93900",
    publicSiteUrl: "/t/site/jorg-beauty-qa",
  });
  assert.equal(resolved.defaultHref, "https://tulala.digital/t/site/jorg-beauty-qa");
});

test("the public-preview drawer uses her real code and the origin-aware helper", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/admin/shell/internal/talent-drawers/profile-extras.tsx"),
    "utf8",
  );
  const start = src.indexOf("export function TalentPublicPreviewDrawer");
  const drawer = src.slice(start, src.indexOf("function PreviewKv"));
  assert.match(drawer, /talentPublicProfileHref\(slug, origin\)/);
  assert.match(drawer, /bridgeTalentSelfProfile\?\.profileCode/);
  assert.equal(drawer.includes("https://tulala.digital"), false);
  assert.equal(drawer.includes("MY_TALENT_PROFILE"), false);
  assert.equal(drawer.includes("marta-reyes"), false);
});

test("the identity-bar eye uses the preview destination control", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/admin/shell/internal/page-modules/IdentityBar-1.tsx"),
    "utf8",
  );
  assert.match(src, /TalentPreviewEyeControl/);
  assert.equal(src.includes("talentPublicProfileHref(bridgeTalentSelfProfile.profileCode"), false);
});
