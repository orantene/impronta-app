import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { isLocalDevOrigin, talentPublicProfileHref, talentPublicProfileLabel } from "./public-profile-href";

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
