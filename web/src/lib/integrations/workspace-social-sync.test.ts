import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveYouTubePublishUrl,
  YOUTUBE_SHOW_ON_PUBLIC_SITE_KEY,
} from "./workspace-social-sync";

// ─────────────────────────────────────────────────────────────────────────────
// resolveYouTubePublishUrl — the pure publish-decision the sync respects.
//
// Slice 1 decouples *verification* from *publishing*: connecting a workspace
// YouTube channel must NOT auto-publish it to the public site. The channel URL
// is mirrored into agency_business_identity.social_youtube ONLY when the
// workspace has explicitly opted in via show_on_public_site === true.
// ─────────────────────────────────────────────────────────────────────────────

test("publishes the channel URL when the toggle is ON", () => {
  const url = resolveYouTubePublishUrl({
    profile_url: "https://youtube.com/@studio",
    [YOUTUBE_SHOW_ON_PUBLIC_SITE_KEY]: true,
  });
  assert.equal(url, "https://youtube.com/@studio");
});

test("does NOT publish when the toggle is OFF (default privacy-first)", () => {
  const url = resolveYouTubePublishUrl({
    profile_url: "https://youtube.com/@studio",
    [YOUTUBE_SHOW_ON_PUBLIC_SITE_KEY]: false,
  });
  assert.equal(url, null);
});

test("does NOT publish when the toggle key is ABSENT (default OFF)", () => {
  // A connected channel with no explicit opt-in stays private.
  const url = resolveYouTubePublishUrl({
    profile_url: "https://youtube.com/@studio",
  });
  assert.equal(url, null);
});

test("does NOT publish when the toggle is a truthy non-boolean (strict === true)", () => {
  const url = resolveYouTubePublishUrl({
    profile_url: "https://youtube.com/@studio",
    [YOUTUBE_SHOW_ON_PUBLIC_SITE_KEY]: "true" as unknown as boolean,
  });
  assert.equal(url, null);
});

test("does NOT publish when the toggle is ON but the URL is empty/whitespace", () => {
  assert.equal(
    resolveYouTubePublishUrl({
      profile_url: "   ",
      [YOUTUBE_SHOW_ON_PUBLIC_SITE_KEY]: true,
    }),
    null,
  );
  assert.equal(
    resolveYouTubePublishUrl({ [YOUTUBE_SHOW_ON_PUBLIC_SITE_KEY]: true }),
    null,
  );
});

test("trims the published URL", () => {
  const url = resolveYouTubePublishUrl({
    profile_url: "  https://youtube.com/@studio  ",
    [YOUTUBE_SHOW_ON_PUBLIC_SITE_KEY]: true,
  });
  assert.equal(url, "https://youtube.com/@studio");
});

test("returns null for null/undefined config", () => {
  assert.equal(resolveYouTubePublishUrl(null), null);
  assert.equal(resolveYouTubePublishUrl(undefined), null);
});
