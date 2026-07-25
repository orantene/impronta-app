import assert from "node:assert/strict";
import test from "node:test";

import { parseSocialPostUrl } from "./social-post-url";

test("instagram posts, reels and tv resolve to a canonical url", () => {
  for (const kind of ["p", "reel", "tv"]) {
    const parsed = parseSocialPostUrl(
      `https://www.instagram.com/${kind}/CabcD_12-xy/`,
    );
    assert.ok(parsed, kind);
    assert.equal(parsed.provider, "instagram");
    assert.equal(parsed.id, "CabcD_12-xy");
    assert.equal(
      parsed.canonicalUrl,
      `https://www.instagram.com/${kind}/CabcD_12-xy/`,
    );
  }
});

test("instagram accepts a bare paste and query junk without echoing it", () => {
  const parsed = parseSocialPostUrl(
    "instagram.com/p/CabcD_12-xy/?igshid=tracking&utm_source=x",
  );
  assert.ok(parsed);
  // The canonical URL is REBUILT, so tracking params cannot ride along into
  // public page markup.
  assert.equal(parsed.canonicalUrl, "https://www.instagram.com/p/CabcD_12-xy/");
});

test("tiktok video urls keep the handle the blockquote needs", () => {
  const parsed = parseSocialPostUrl(
    "https://www.tiktok.com/@riviera.maya/video/7412345678901234567",
  );
  assert.ok(parsed);
  assert.equal(parsed.provider, "tiktok");
  assert.equal(parsed.id, "7412345678901234567");
  assert.equal(parsed.handle, "riviera.maya");
  assert.equal(
    parsed.canonicalUrl,
    "https://www.tiktok.com/@riviera.maya/video/7412345678901234567",
  );
});

test("non-embeddable and unknown shapes are rejected, not rendered empty", () => {
  const rejected = [
    // Profile + story: not embeddable. Rendering these gives a blank block.
    "https://www.instagram.com/riviera.maya/",
    "https://www.instagram.com/stories/riviera.maya/123/",
    // Short link: resolving needs a redirect follow in the render path.
    "https://vm.tiktok.com/ZMabcdef/",
    // TikTok profile, no video id.
    "https://www.tiktok.com/@riviera.maya",
    "",
    "not a url",
  ];
  for (const url of rejected) {
    assert.equal(parseSocialPostUrl(url), null, url);
  }
});

test("lookalike hosts are rejected", () => {
  // A naive `includes("instagram.com")` would accept every one of these.
  const spoofs = [
    "https://instagram.com.evil.test/p/CabcD_12-xy/",
    "https://evil-instagram.com/p/CabcD_12-xy/",
    "https://notinstagram.com/p/CabcD_12-xy/",
    "https://tiktok.com.evil.test/@a/video/7412345678901234567",
  ];
  for (const url of spoofs) {
    assert.equal(parseSocialPostUrl(url), null, url);
  }
});

test("javascript: and non-https schemes are rejected", () => {
  assert.equal(parseSocialPostUrl("javascript:alert(1)//instagram.com/p/x"), null);
  assert.equal(parseSocialPostUrl("http://www.instagram.com/p/CabcD_12-xy/"), null);
  assert.equal(parseSocialPostUrl("data:text/html,<script>"), null);
});

test("malformed ids are rejected", () => {
  // Path traversal / injection attempts in the id position.
  assert.equal(parseSocialPostUrl("https://www.instagram.com/p/../../etc"), null);
  assert.equal(parseSocialPostUrl('https://www.instagram.com/p/a"onerror=x'), null);
  // TikTok ids are numeric.
  assert.equal(
    parseSocialPostUrl("https://www.tiktok.com/@a/video/not-numeric"),
    null,
  );
});
