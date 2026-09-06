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

// ─── The start route once built a GOOGLE authorization URL for every workspace
// connect, regardless of provider, so an Instagram connect landed on Google's
// consent screen. Every branch now goes through this one helper; pin what it
// produces per provider so the route cannot drift again.
import {
  buildConnectionAuthorizationRedirect,
  getConnectionOAuthRedirectUri,
} from "./providers";

test("redirect URI is per-VENDOR and never the google route for a social provider", () => {
  const app = "https://app.tulala.digital/";
  assert.equal(
    getConnectionOAuthRedirectUri(CONNECTION_OAUTH_PROVIDERS.instagram, app),
    "https://app.tulala.digital/api/connections/oauth/callback/instagram",
  );
  assert.equal(
    getConnectionOAuthRedirectUri(CONNECTION_OAUTH_PROVIDERS.tiktok, app),
    "https://app.tulala.digital/api/connections/oauth/callback/tiktok",
  );
  assert.equal(
    getConnectionOAuthRedirectUri(CONNECTION_OAUTH_PROVIDERS.youtube, app),
    "https://app.tulala.digital/api/connections/oauth/callback/google",
  );
});

test("a workspace instagram connect authorizes at instagram.com with the instagram callback", () => {
  for (const p of Object.values(CONNECTION_OAUTH_PROVIDERS)) {
    process.env[p.clientIdEnv] = `${p.key}-id`;
    process.env[p.clientSecretEnv] = `${p.key}-secret`;
  }
  const res = buildConnectionAuthorizationRedirect({
    provider: CONNECTION_OAUTH_PROVIDERS.instagram,
    state: "s",
    appUrl: "https://app.tulala.digital",
  });
  assert.ok(res.ok);
  const url = new URL(res.url);
  assert.equal(url.host, "www.instagram.com");
  assert.equal(url.searchParams.get("client_id"), "instagram-id");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://app.tulala.digital/api/connections/oauth/callback/instagram",
  );
  assert.doesNotMatch(res.url, /google/);

  const yt = buildConnectionAuthorizationRedirect({
    provider: CONNECTION_OAUTH_PROVIDERS.youtube,
    state: "s",
    appUrl: "https://app.tulala.digital",
  });
  assert.ok(yt.ok);
  assert.equal(new URL(yt.url).host, "accounts.google.com");
  assert.equal(new URL(yt.url).searchParams.get("access_type"), "offline");
});
