import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  isLocalDevOrigin,
  resolveTalentOwnPageState,
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

test("TUL-90: a draft or hidden profile claims no address and is not live", () => {
  for (const workflowStatus of ["draft", "invited", null]) {
    const s = resolveTalentOwnPageState({ profileCode: "TAL-93943", workflowStatus, isPubliclyHidden: false });
    assert.deepEqual(s, { live: false, href: null, label: null });
  }
  const hidden = resolveTalentOwnPageState({ profileCode: "TAL-1", workflowStatus: "published", isPubliclyHidden: true });
  assert.equal(hidden.live, false);
  const noCode = resolveTalentOwnPageState({ profileCode: " ", workflowStatus: "published", isPubliclyHidden: false });
  assert.equal(noCode.live, false);
});

test("TUL-90: a published profile shows her own address, never a sample slug", () => {
  const s = resolveTalentOwnPageState({ profileCode: "TAL-93943", workflowStatus: "published", isPubliclyHidden: false });
  assert.deepEqual(s, { live: true, href: "https://tulala.digital/t/TAL-93943", label: "tulala.digital/t/TAL-93943" });
  const local = resolveTalentOwnPageState({
    profileCode: "TAL-9",
    workflowStatus: "published",
    isPubliclyHidden: false,
    currentOrigin: "http://localhost:3001",
  });
  assert.equal(local.live && local.href, "http://localhost:3001/t/TAL-9");
});

test("TUL-90: no sample slug or 'live now' claim is hardcoded in the surfaces", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  const card = read("src/components/admin/shell/internal/talent/shared/profile-sections-2.tsx");
  assert.match(card, /resolveTalentOwnPageState/);
  const settings = read("src/components/talent/website-settings/WebsiteSettingsScreen.tsx");
  assert.equal(settings.includes("live now"), false);
});

test("TUL-90: every surface resolves her address through the one helper", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  const myProfile = read("src/components/admin/shell/internal/talent/pages/MyProfilePage.tsx");
  assert.match(myProfile, /resolveTalentOwnPageState/);
  assert.equal(myProfile.includes("https://tulala.digital/t/${"), false);
  const where = read("src/components/talent/site/TalentSiteAppearancesPanel.tsx");
  assert.match(where, /resolveTalentOwnPageState/);
  assert.equal(where.includes("https://tulala.digital/t/"), false);
  const fallback = read("src/app/%5Fhost-unregistered/page.tsx");
  assert.equal(fallback.includes("talent agency"), false);
  const wave2 = read("src/components/admin/shell/internal/wave2.tsx");
  assert.match(wave2, /copyTalentOwnPublicLink/);
  assert.match(read("src/lib/talent/public-profile-href.ts"), /t\("Publish your profile first to get a public link"\)/);
});

test("TUL-90: new copy exists in es and says public page, not roster", () => {
  const i18n = readFileSync(join(process.cwd(), "src/components/admin/shell/internal/dashboard-i18n-talent-editors.ts"), "utf8");
  for (const key of [
    "Your public page is live",
    "Your public page is not published yet",
    "Publish your profile first to get a public link",
    "Publish your profile to get a public address you can share.",
  ]) {
    assert.ok(i18n.includes(`"${key}":`), key);
  }
  assert.ok(i18n.includes("Tu página pública está en línea"));
  assert.ok(i18n.includes("Tu página pública aún no está publicada"));
  assert.equal(i18n.includes("Your roster page is not published yet"), false);
});
