import assert from "node:assert/strict";
import test from "node:test";

import {
  CONNECTION_OAUTH_PROVIDERS,
  buildConnectionAuthorizationUrl,
  getConnectionOAuthProvider,
} from "./providers";

// The YouTube flow is live and money-adjacent; generalizing the registry for
// Instagram/TikTok must not move it. These pin its wire format.
test("youtube keeps its google vendor, scope and offline-access params", () => {
  const yt = getConnectionOAuthProvider("youtube");
  assert.ok(yt);
  assert.equal(yt.oauthProvider, "google");
  assert.deepEqual(yt.scopes, [
    "https://www.googleapis.com/auth/youtube.readonly",
  ]);
  // Google only returns a refresh token with offline access + a consent prompt.
  assert.equal(yt.authorizationParams.access_type, "offline");
  assert.equal(yt.authorizationParams.prompt, "consent");
});

test("instagram requests ONLY instagram_business_basic", () => {
  // Extra scopes (publishing/messaging/insights) add App Review rejection risk
  // and a read-only feed needs none of them.
  const ig = getConnectionOAuthProvider("instagram");
  assert.ok(ig);
  assert.deepEqual(ig.scopes, ["instagram_business_basic"]);
  // Must be the Instagram-Login authorize host, not a Facebook one: the
  // facebook.com variant forces tenants to have a linked Facebook Page.
  assert.match(ig.authorizationUrl, /^https:\/\/www\.instagram\.com\//);
});

test("tiktok requests only the read scopes the feed needs", () => {
  const tt = getConnectionOAuthProvider("tiktok");
  assert.ok(tt);
  assert.deepEqual(tt.scopes, ["user.info.basic", "video.list"]);
});

test("tiktok authorize uses client_key, others use client_id", () => {
  const tt = CONNECTION_OAUTH_PROVIDERS.tiktok;
  const yt = CONNECTION_OAUTH_PROVIDERS.youtube;
  process.env[tt.clientIdEnv] = "tt-id";
  process.env[tt.clientSecretEnv] = "tt-secret";
  process.env[yt.clientIdEnv] = "g-id";
  process.env[yt.clientSecretEnv] = "g-secret";

  const ttUrl = buildConnectionAuthorizationUrl({
    provider: tt,
    state: "s",
    redirectUri: "https://app.example.com/cb",
  });
  assert.ok(ttUrl.ok);
  const tturl = new URL(ttUrl.url);
  assert.equal(tturl.searchParams.get("client_key"), "tt-id");
  assert.equal(tturl.searchParams.get("client_id"), null);

  const ytUrl = buildConnectionAuthorizationUrl({
    provider: yt,
    state: "s",
    redirectUri: "https://app.example.com/cb",
  });
  assert.ok(ytUrl.ok);
  assert.equal(new URL(ytUrl.url).searchParams.get("client_id"), "g-id");
});

test("an unconfigured provider reports a reason instead of throwing", () => {
  // This is what lets the Settings card render "Setup required" honestly rather
  // than a Connect button that 500s before the app is registered.
  const ig = CONNECTION_OAUTH_PROVIDERS.instagram;
  delete process.env[ig.clientIdEnv];
  delete process.env[ig.clientSecretEnv];
  const res = buildConnectionAuthorizationUrl({
    provider: ig,
    state: "s",
    redirectUri: "https://app.example.com/cb",
  });
  assert.equal(res.ok, false);
});
