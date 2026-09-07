import assert from "node:assert/strict";
import { test } from "node:test";

import { connectionPopupResponse } from "./popup-response";

const APP = "https://app.tulala.digital";

async function bodyOf(res: Response): Promise<string> {
  return await res.text();
}

test("a success posts to the app origin, never to a wildcard", async () => {
  const body = await bodyOf(
    connectionPopupResponse(APP, { connection_success: "instagram", connection_account: "tulala" }),
  );
  assert.match(body, /"https:\/\/app\.tulala\.digital"/);
  assert.doesNotMatch(body, /postMessage\(message, ?"\*"\)/);
  assert.match(body, /"success":true/);
});

test("a failure carries the vendor's reason so both routes read the same", async () => {
  const body = await bodyOf(
    connectionPopupResponse(APP, {
      connection_error: "connect_failed",
      connection_message: "That Instagram account is personal.",
    }),
  );
  assert.match(body, /"success":false/);
  assert.match(body, /That Instagram account is personal\./);
});

test("a hostile vendor string cannot break out of the script tag", async () => {
  // The error text comes from Instagram or TikTok, and the handle from the
  // connecting account's own profile. JSON.stringify does NOT escape `<`.
  const body = await bodyOf(
    connectionPopupResponse(APP, {
      connection_error: "connect_failed",
      connection_message: "</script><img src=x onerror=alert(1)>",
    }),
  );
  assert.doesNotMatch(body, /<\/script><img/);
  assert.match(body, /\\u003c\/script/);
});

test("an unparseable app URL refuses to post rather than broadcasting", async () => {
  const body = await bodyOf(connectionPopupResponse("not a url", { connection_success: "tiktok" }));
  assert.match(body, /targetOrigin = ""/);
  assert.match(body, /targetOrigin && window\.opener/);
});

test("the outcome page is never cached", () => {
  const res = connectionPopupResponse(APP, { connection_success: "instagram" });
  assert.equal(res.headers.get("cache-control"), "no-store");
});
