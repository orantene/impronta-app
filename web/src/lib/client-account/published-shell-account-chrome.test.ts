import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test, { afterEach } from "node:test";

import {
  withAccountRegionItem,
  withPublishedShellAccountChrome,
} from "./published-shell-account-chrome";

const ORIGINAL = process.env.CLIENT_ACCOUNT_HOSTS;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CLIENT_ACCOUNT_HOSTS;
  else process.env.CLIENT_ACCOUNT_HOSTS = ORIGINAL;
});

test("withAccountRegionItem inserts account after language once and is idempotent", () => {
  const props = {
    regions: {
      left: [],
      center: [],
      right: [{ type: "nav" }, { type: "language" }, { type: "cta" }],
    },
  };
  const once = withAccountRegionItem(props);
  assert.deepEqual(
    (once.regions as { right: { type: string }[] }).right.map((i) => i.type),
    ["nav", "language", "account", "cta"],
  );
  const twice = withAccountRegionItem(once);
  assert.deepEqual(
    (twice.regions as { right: { type: string }[] }).right.map((i) => i.type),
    ["nav", "language", "account", "cta"],
  );
});

test("withPublishedShellAccountChrome is a no-op when the app flag is off", () => {
  delete process.env.CLIENT_ACCOUNT_HOSTS;
  const props = {
    regions: { right: [{ type: "language" }] },
  };
  assert.equal(withPublishedShellAccountChrome("site_header", props), props);
  assert.equal(withPublishedShellAccountChrome("site_footer", props), props);
});

test("withPublishedShellAccountChrome sets siteChrome.account and the region item when app is listed", () => {
  process.env.CLIENT_ACCOUNT_HOSTS = "app";
  const props = {
    regions: { right: [{ type: "language" }, { type: "cta" }] },
    siteChrome: { demo: false, locales: ["es"] },
  };
  const out = withPublishedShellAccountChrome("site_header", props) as {
    regions: { right: { type: string }[] };
    siteChrome: { account?: boolean; demo?: boolean; locales?: string[] };
  };
  assert.deepEqual(out.regions.right.map((i) => i.type), ["language", "account", "cta"]);
  assert.equal(out.siteChrome.account, true);
  assert.equal(out.siteChrome.demo, false);
  assert.deepEqual(out.siteChrome.locales, ["es"]);
  assert.equal(withPublishedShellAccountChrome("site_footer", props), props);
});

test("PublishedShell routes landmark props through the account-chrome helper", () => {
  const shell = readFileSync(
    join(process.cwd(), "src/components/site-shell/PublishedShell.tsx"),
    "utf8",
  );
  assert.match(shell, /publishedShellLandmarkProps/);
  const calls = shell.match(/publishedShellLandmarkProps\(/g) ?? [];
  assert.ok(calls.length >= 2, `expected ≥2 call sites, got ${calls.length}`);
  const bridge = readFileSync(
    join(process.cwd(), "src/components/site-shell/published-shell-landmark-props.ts"),
    "utf8",
  );
  assert.match(bridge, /withPublishedShellAccountChrome/);
});
