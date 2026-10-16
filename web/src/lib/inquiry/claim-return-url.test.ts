import { test } from "node:test";
import assert from "node:assert/strict";

import { claimNextParam, siteReturnUrlFromRequest } from "./claim-return-url";

const APP = "https://app.tulala.digital";

test("booking on a site host returns the full page URL from a same-host referer", () => {
  assert.equal(
    siteReturnUrlFromRequest({
      host: "jorgelina.com",
      referer: "https://jorgelina.com/servicios?x=1#top",
      appUrl: APP,
    }),
    "https://jorgelina.com/servicios?x=1",
  );
});

test("without a usable referer the site root is used", () => {
  assert.equal(siteReturnUrlFromRequest({ host: "jorgelina.com", referer: null, appUrl: APP }), "https://jorgelina.com/");
  assert.equal(
    siteReturnUrlFromRequest({ host: "jorgelina.com", referer: "https://evil.com/x", appUrl: APP }),
    "https://jorgelina.com/",
  );
});

test("app host, missing host and odd hosts yield null (keep the workspace next)", () => {
  assert.equal(siteReturnUrlFromRequest({ host: "app.tulala.digital", referer: null, appUrl: APP }), null);
  assert.equal(siteReturnUrlFromRequest({ host: "", referer: null, appUrl: APP }), null);
  assert.equal(siteReturnUrlFromRequest({ host: "evil.com/x", referer: null, appUrl: APP }), null);
  assert.equal(siteReturnUrlFromRequest({ host: "a@b.com", referer: null, appUrl: APP }), null);
});

test("host port is dropped and case normalized; local http origin kept", () => {
  assert.equal(siteReturnUrlFromRequest({ host: "JOR.Tulala.digital:443", referer: null, appUrl: APP }), "https://jor.tulala.digital/");
  assert.equal(
    siteReturnUrlFromRequest({ host: "jor.lvh.me:3001", referer: "http://jor.lvh.me:3001/x", appUrl: "http://app.lvh.me:3001" }),
    "http://jor.lvh.me:3001/x",
  );
});

test("claimNextParam prefers the site URL, else the client messages path", () => {
  assert.equal(claimNextParam("acme", "https://jorgelina.com/servicios"), "https://jorgelina.com/servicios");
  assert.equal(claimNextParam("acme", null), "/acme/client/messages");
  assert.equal(claimNextParam("acme", "javascript:alert(1)"), "/acme/client/messages");
});

test("all three claim-email senders pass the site return URL", async () => {
  const { readFileSync } = await import("node:fs");
  const path = await import("node:path");
  const root = path.resolve(__dirname, "../..");
  const chat = readFileSync(path.join(root, "app/t/[profileCode]/_actions/guest-chat-actions.ts"), "utf8");
  assert.equal(chat.match(/returnUrl: await readSiteReturnUrl\(\)/g)?.length, 2);
  const book = readFileSync(path.join(root, "lib/server-actions/instant-book-action.ts"), "utf8");
  assert.match(book, /returnUrl: await readSiteReturnUrl\(\)/);
  const link = readFileSync(path.join(root, "lib/inquiry/guest-claim-link.ts"), "utf8");
  assert.match(link, /claimNextParam\(args\.tenantSlug, args\.returnUrl/);
});
