import assert from "node:assert/strict";
import test from "node:test";

import {
  CONNECTION_OAUTH_PROVIDERS,
  buildConnectionAuthorizationUrl,
} from "./providers";

// The callback route is per-VENDOR. A redirect URI that does not match the
// vendor's own route sends the operator to a 404 after a successful consent —
// the worst possible failure point, because the account IS connected upstream.
test("each provider's redirect URI matches its own callback vendor", () => {
  for (const provider of Object.values(CONNECTION_OAUTH_PROVIDERS)) {
    process.env[provider.clientIdEnv] = "id";
    process.env[provider.clientSecretEnv] = "secret";
    const redirectUri = `https://app.example.com/api/connections/oauth/callback/${provider.oauthProvider}`;
    const res = buildConnectionAuthorizationUrl({
      provider,
      state: "s",
      redirectUri,
    });
    assert.ok(res.ok, provider.key);
    assert.equal(
      new URL(res.url).searchParams.get("redirect_uri"),
      redirectUri,
      provider.key,
    );
  }
});

test("instagram authorizes against instagram.com, never facebook.com", () => {
  // The Facebook-Login variant would force every connecting account to own a
  // linked Facebook Page — a support burden we deliberately avoid.
  const ig = CONNECTION_OAUTH_PROVIDERS.instagram;
  assert.match(ig.authorizationUrl, /^https:\/\/www\.instagram\.com\//);
  assert.doesNotMatch(ig.authorizationUrl, /facebook\.com/);
  assert.match(ig.tokenUrl, /^https:\/\/api\.instagram\.com\//);
});

test("scopes stay minimal (App Review rejection risk scales with scope count)", () => {
  assert.deepEqual(CONNECTION_OAUTH_PROVIDERS.instagram.scopes, [
    "instagram_business_basic",
  ]);
  assert.deepEqual(CONNECTION_OAUTH_PROVIDERS.tiktok.scopes, [
    "user.info.basic",
    "video.list",
  ]);
});

test("an unconfigured vendor reports a reason rather than throwing", () => {
  // This is what lets the Settings card render "Setup required" honestly
  // before the Meta/TikTok apps are registered.
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

test("every provider declares distinct credential env vars", () => {
  // A copy-paste that reused Google's env vars for Instagram would "work" in
  // dev (both set) and fail confusingly in prod.
  const seen = new Set<string>();
  for (const p of Object.values(CONNECTION_OAUTH_PROVIDERS)) {
    assert.ok(!seen.has(p.clientIdEnv), `${p.key} reuses ${p.clientIdEnv}`);
    seen.add(p.clientIdEnv);
  }
});
