import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  prefetchPublicPageBootstrap,
  resetPublicPageBootstrap,
  takeOr,
} from "./public-page-bootstrap";

const bundle = {
  settingsEnabled: true,
  manager: { ok: true, data: null },
  maison: { enabled: false },
  goLive: { ok: false, error: "x" },
  availableBlocks: { ok: false, error: "x" },
  themeNotices: { ok: false, error: "x" },
} as never;

test("page mount: one server action serves all six loads", async () => {
  resetPublicPageBootstrap();
  let actions = 0;
  prefetchPublicPageBootstrap(async () => {
    actions += 1;
    return bundle;
  });
  // A double render shares the same call.
  prefetchPublicPageBootstrap(async () => {
    actions += 1;
    return bundle;
  });
  let fallbacks = 0;
  const fb = async () => {
    fallbacks += 1;
    return undefined as never;
  };
  await Promise.all([
    takeOr("settingsEnabled", "editor", fb),
    takeOr("manager", "manager", fb),
    takeOr("maison", "host", fb),
    takeOr("maison", "card", fb),
    takeOr("goLive", "card", fb),
    takeOr("availableBlocks", "blocks", fb),
    takeOr("themeNotices", "notice", fb),
  ]);
  assert.equal(actions, 1);
  assert.equal(fallbacks, 0);
});

test("a later re-read by the same consumer is fresh (falls back to its own action)", async () => {
  resetPublicPageBootstrap();
  prefetchPublicPageBootstrap(async () => bundle);
  let fallbacks = 0;
  const fb = async () => {
    fallbacks += 1;
    return { ok: true, data: null } as never;
  };
  await takeOr("manager", "manager", fb);
  await takeOr("manager", "manager", fb);
  assert.equal(fallbacks, 1);
});

test("a failed bundle or slice falls back; no prefetch falls back", async () => {
  resetPublicPageBootstrap();
  let fallbacks = 0;
  const fb = async () => {
    fallbacks += 1;
    return false as never;
  };
  await takeOr("settingsEnabled", "editor", fb);
  prefetchPublicPageBootstrap(async () => {
    throw new Error("boom");
  });
  await takeOr("settingsEnabled", "editor", fb);
  assert.equal(fallbacks, 2);
});

test("every mount-time loader on the page reads through takeOr", () => {
  const read = (f: string) => readFileSync(join(process.cwd(), "src/components", f), "utf8");
  assert.match(read("admin/shell/internal/talent/pages/PublicPageEditor.tsx"), /prefetchPublicPageBootstrap\(\)/);
  const wired: Array<[string, RegExp]> = [
    ["admin/shell/internal/talent/pages/PublicPageEditor.tsx", /takeOr\("settingsEnabled"/],
    ["talent/site/TalentMaxSiteManager.tsx", /takeOr\("manager"/],
    ["talent/site/maison-setup/MaisonSetupHost.tsx", /takeOr\("maison", "host"/],
    ["talent/site/maison-setup/MyWebsiteCard.tsx", /takeOr\("maison", "card"/],
    ["talent/site/maison-setup/MyWebsiteCard.tsx", /takeOr\("goLive"/],
    ["talent/site/theme-update/AvailableBlocks.tsx", /takeOr\("availableBlocks"/],
    ["talent/site/theme-update/ThemeUpdateNotice.tsx", /takeOr\("themeNotices"/],
  ];
  for (const [f, re] of wired) assert.match(read(f), re, f);
});
