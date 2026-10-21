import { test } from "node:test";
import assert from "node:assert/strict";

import { CHANGELOG_SYNC_SECRET_HEADER, isAuthorizedSyncRequest } from "./sync-auth";

const headers = (h: Record<string, string>) => (name: string) => h[name.toLowerCase()] ?? null;
const secrets = { cronSecret: "cron-secret-value", syncSecret: "notion-secret-value" };

test("cron bearer and the Notion button secret are both accepted", () => {
  assert.equal(isAuthorizedSyncRequest(headers({ authorization: "Bearer cron-secret-value" }), secrets), true);
  assert.equal(isAuthorizedSyncRequest(headers({ [CHANGELOG_SYNC_SECRET_HEADER]: "notion-secret-value" }), secrets), true);
});

test("wrong, missing or crossed secrets are refused", () => {
  assert.equal(isAuthorizedSyncRequest(headers({}), secrets), false);
  assert.equal(isAuthorizedSyncRequest(headers({ authorization: "Bearer nope" }), secrets), false);
  assert.equal(isAuthorizedSyncRequest(headers({ authorization: "Bearer notion-secret-value" }), secrets), false);
  assert.equal(isAuthorizedSyncRequest(headers({ [CHANGELOG_SYNC_SECRET_HEADER]: "cron-secret-value" }), secrets), false);
});

test("an unset secret never matches an empty header", () => {
  assert.equal(isAuthorizedSyncRequest(headers({ authorization: "Bearer " }), { cronSecret: "" }), false);
  assert.equal(isAuthorizedSyncRequest(headers({ [CHANGELOG_SYNC_SECRET_HEADER]: "" }), { syncSecret: "" }), false);
  assert.equal(isAuthorizedSyncRequest(headers({ [CHANGELOG_SYNC_SECRET_HEADER]: "x" }), { cronSecret: "c" }), false);
});
