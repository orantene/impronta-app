import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resetPublicPageBootstrap, seedPublicPageBootstrap, takeOr } from "./public-page-bootstrap";

const bundle = {
  settingsEnabled: true,
  manager: { ok: true, data: null },
  maison: { enabled: false },
  goLive: { ok: false, error: "x" },
} as never;

// seedPublicPageBootstrap is browser-only; give the test a window.
(globalThis as { window?: unknown }).window ??= {};

test("first paint: zero server actions, every slice comes from the server seed", async () => {
  resetPublicPageBootstrap();
  seedPublicPageBootstrap(bundle);
  let actions = 0;
  const fb = async () => {
    actions += 1;
    return undefined as never;
  };
  await Promise.all([
    takeOr("settingsEnabled", "editor", fb),
    takeOr("manager", "manager", fb),
    takeOr("maison", "host", fb),
    takeOr("maison", "card", fb),
    takeOr("goLive", "card", fb),
  ]);
  assert.equal(actions, 0);
});

test("re-seeding the same bundle (a parent re-render) does not reset reads", async () => {
  resetPublicPageBootstrap();
  seedPublicPageBootstrap(bundle);
  let actions = 0;
  const fb = async () => {
    actions += 1;
    return { ok: true, data: null } as never;
  };
  await takeOr("manager", "manager", fb);
  seedPublicPageBootstrap(bundle);
  await takeOr("manager", "manager", fb);
  assert.equal(actions, 1);
});

test("a later re-read, a failed slice and an unseeded page fall back to the consumer's action", async () => {
  resetPublicPageBootstrap();
  let actions = 0;
  const fb = async () => {
    actions += 1;
    return false as never;
  };
  await takeOr("settingsEnabled", "editor", fb);
  seedPublicPageBootstrap({ ...(bundle as object), settingsEnabled: null } as never);
  await takeOr("settingsEnabled", "editor", fb);
  assert.equal(actions, 2);
});

test("the route loads the bundle on the server; nothing calls a server action during render", () => {
  const root = process.cwd();
  const read = (f: string) => readFileSync(join(root, "src", f), "utf8");
  const page = read("app/(workspace)/talent/site/page.tsx");
  assert.match(page, /await loadPublicPageBootstrap\(\)/);
  assert.match(page, /<PublicPageBootstrapSeed bundle=\{bundle\}/);
  const store = read("components/talent/site/public-page-bootstrap.ts");
  assert.doesNotMatch(store, /Action/, "the client store must not import or call a server action");
  assert.match(read("lib/talent-site/server/public-page-bootstrap.server.ts"), /Promise\.all\(/);
  const wired: Array<[string, RegExp]> = [
    ["components/admin/shell/internal/talent/pages/PublicPageEditor.tsx", /takeOr\("settingsEnabled"/],
    ["components/talent/site/TalentMaxSiteManager.tsx", /takeOr\("manager"/],
    ["components/talent/site/maison-setup/MaisonSetupHost.tsx", /takeOr\("maison", "host"/],
    ["components/talent/site/maison-setup/MyWebsiteCard.tsx", /takeOr\("maison", "card"/],
    ["components/talent/site/maison-setup/MyWebsiteCard.tsx", /takeOr\("goLive"/],
  ];
  for (const [f, re] of wired) assert.match(read(f), re, f);
});
