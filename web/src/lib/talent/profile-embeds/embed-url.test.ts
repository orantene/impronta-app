import test from "node:test";
import assert from "node:assert/strict";

import {
  PROFILE_EMBED_FRAME_HOSTS,
  PROFILE_EMBED_PROVIDERS,
  isProfileEmbedProvider,
  normalizePressUrl,
  parseProfileEmbedUrl,
  profileEmbedIframeSrc,
} from "./embed-url";

// ─────────────────────────────────────────────────────────────────────────────
// Happy path — one URL shape per marketed provider
// ─────────────────────────────────────────────────────────────────────────────

test("parseProfileEmbedUrl: all six marketed providers are recognized", () => {
  const cases: Array<[string, string, string]> = [
    ["https://www.instagram.com/p/CxYzAbCdEfG/", "instagram", "CxYzAbCdEfG"],
    [
      "https://www.tiktok.com/@someone/video/7212345678901234567",
      "tiktok",
      "7212345678901234567",
    ],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube", "dQw4w9WgXcQ"],
    [
      "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
      "spotify",
      "track/4cOdK2wGLETKBW3PvgPWqT",
    ],
    ["https://soundcloud.com/artist/some-track", "soundcloud", "artist/some-track"],
    ["https://vimeo.com/123456789", "vimeo", "123456789"],
  ];
  for (const [url, provider, externalId] of cases) {
    const parsed = parseProfileEmbedUrl(url);
    assert.equal(parsed?.provider, provider, `provider for ${url}`);
    assert.equal(parsed?.externalId, externalId, `externalId for ${url}`);
  }
});

test("PROFILE_EMBED_PROVIDERS covers exactly the six marketed providers", () => {
  assert.deepEqual([...PROFILE_EMBED_PROVIDERS].sort(), [
    "instagram",
    "soundcloud",
    "spotify",
    "tiktok",
    "vimeo",
    "youtube",
  ]);
  assert.equal(isProfileEmbedProvider("youtube"), true);
  assert.equal(isProfileEmbedProvider("facebook"), false);
  assert.equal(isProfileEmbedProvider("javascript"), false);
});

test("parseProfileEmbedUrl: Instagram reels and YouTube shorts normalize", () => {
  assert.equal(
    parseProfileEmbedUrl("https://instagram.com/reel/CxYzAbCdEfG/")?.externalId,
    "CxYzAbCdEfG",
  );
  assert.equal(
    parseProfileEmbedUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")?.provider,
    "youtube",
  );
  assert.equal(
    parseProfileEmbedUrl("https://youtu.be/dQw4w9WgXcQ")?.externalId,
    "dQw4w9WgXcQ",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// HOSTILE INPUT — every one of these MUST return null
// ─────────────────────────────────────────────────────────────────────────────

test("parseProfileEmbedUrl rejects dangerous URL schemes", () => {
  const hostile = [
    "javascript:alert(1)",
    "JavaScript:alert(document.domain)",
    "  javascript:alert(1)  ",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "blob:https://www.youtube.com/abc",
    "//www.youtube.com/watch?v=dQw4w9WgXcQ",
  ];
  for (const raw of hostile) {
    assert.equal(parseProfileEmbedUrl(raw), null, `must reject: ${raw}`);
  }
});

test("parseProfileEmbedUrl rejects lookalike and suffix-attack hostnames", () => {
  const lookalikes = [
    "https://www.youtube.com.evil.tld/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.attacker.io/watch?v=dQw4w9WgXcQ",
    "https://notyoutube.com/watch?v=dQw4w9WgXcQ",
    "https://evil.tld/www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://instagram.com.phish.example/p/CxYzAbCdEfG/",
    "https://tiktok.evil.tld/@someone/video/7212345678901234567",
    "https://open.spotify.com.evil.tld/track/4cOdK2wGLETKBW3PvgPWqT",
    "https://vimeo.co/123456789",
    "https://user:pass@evil.tld/watch?v=dQw4w9WgXcQ",
  ];
  for (const raw of lookalikes) {
    assert.equal(parseProfileEmbedUrl(raw), null, `must reject: ${raw}`);
  }
});

test("parseProfileEmbedUrl rejects open-redirect style URLs on allow-listed hosts", () => {
  const redirects = [
    "https://www.youtube.com/redirect?q=https://evil.tld",
    "https://www.youtube.com/redirect?event=x&q=https%3A%2F%2Fevil.tld",
    "https://vimeo.com/out?url=https://evil.tld",
    "https://open.spotify.com/redirect?to=https://evil.tld",
    "https://www.instagram.com/accounts/login/?next=https://evil.tld",
    // Host is allow-listed but the *path* carries no embeddable content id.
    "https://www.youtube.com/@channel",
    "https://www.tiktok.com/@someone",
  ];
  for (const raw of redirects) {
    assert.equal(parseProfileEmbedUrl(raw), null, `must reject: ${raw}`);
  }
});

test("parseProfileEmbedUrl rejects malformed ids on allow-listed hosts", () => {
  const malformed = [
    "https://www.youtube.com/watch?v=tooshort",
    "https://www.youtube.com/watch?v=<script>alert(1)</script>",
    "https://vimeo.com/not-a-number",
    "https://open.spotify.com/track/short",
    "https://open.spotify.com/wallet/4cOdK2wGLETKBW3PvgPWqT",
    "https://www.tiktok.com/@someone/video/abc",
    "https://www.instagram.com/p/a/",
    "",
    "   ",
    `https://www.youtube.com/watch?v=${"a".repeat(4000)}`,
  ];
  for (const raw of malformed) {
    assert.equal(parseProfileEmbedUrl(raw), null, `must reject: ${raw}`);
  }
});

test("parseProfileEmbedUrl rejects non-string input defensively", () => {
  for (const bad of [null, undefined, 42, {}, []]) {
    assert.equal(
      parseProfileEmbedUrl(bad as unknown as string),
      null,
      `must reject: ${String(bad)}`,
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// profileEmbedIframeSrc — the value that actually reaches the DOM
// ─────────────────────────────────────────────────────────────────────────────

test("profileEmbedIframeSrc: every generated src lands on an allow-listed frame host", () => {
  const inputs: Array<[string, string]> = [
    ["instagram", "CxYzAbCdEfG"],
    ["tiktok", "7212345678901234567"],
    ["youtube", "dQw4w9WgXcQ"],
    ["spotify", "track/4cOdK2wGLETKBW3PvgPWqT"],
    ["soundcloud", "artist/some-track"],
    ["vimeo", "123456789"],
  ];
  for (const [provider, id] of inputs) {
    const src = profileEmbedIframeSrc(provider, id);
    assert.ok(src, `expected a src for ${provider}`);
    const origin = new URL(src).origin;
    assert.ok(
      (PROFILE_EMBED_FRAME_HOSTS as readonly string[]).includes(origin),
      `${origin} must be in PROFILE_EMBED_FRAME_HOSTS (and next.config.ts frame-src)`,
    );
  }
});

test("profileEmbedIframeSrc: YouTube uses the privacy-friendly no-cookie host", () => {
  assert.equal(
    profileEmbedIframeSrc("youtube", "dQw4w9WgXcQ"),
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  );
});

test("profileEmbedIframeSrc rejects unknown providers and forged ids", () => {
  assert.equal(profileEmbedIframeSrc("evil", "anything"), null);
  assert.equal(profileEmbedIframeSrc("youtube", "../../evil"), null);
  assert.equal(
    profileEmbedIframeSrc("instagram", "abc/../../../evil"),
    null,
  );
  assert.equal(profileEmbedIframeSrc("tiktok", "1'\"><script>"), null);
  assert.equal(profileEmbedIframeSrc("vimeo", "javascript:alert(1)"), null);
  assert.equal(profileEmbedIframeSrc("instagram", ""), null);
  assert.equal(
    profileEmbedIframeSrc("instagram", null as unknown as string),
    null,
  );
});

test("profileEmbedIframeSrc: a parsed URL always round-trips to a usable src", () => {
  const urls = [
    "https://www.instagram.com/p/CxYzAbCdEfG/",
    "https://www.tiktok.com/@someone/video/7212345678901234567",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://open.spotify.com/playlist/4cOdK2wGLETKBW3PvgPWqT",
    "https://soundcloud.com/artist/some-track",
    "https://vimeo.com/123456789",
  ];
  for (const url of urls) {
    const parsed = parseProfileEmbedUrl(url);
    assert.ok(parsed, `expected a parse for ${url}`);
    assert.ok(
      profileEmbedIframeSrc(parsed.provider, parsed.externalId),
      `expected a src for ${url}`,
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizePressUrl — plain anchors, so scheme is the boundary
// ─────────────────────────────────────────────────────────────────────────────

test("normalizePressUrl accepts http(s) links on any host", () => {
  assert.equal(
    normalizePressUrl("https://vogue.com/article/x"),
    "https://vogue.com/article/x",
  );
  assert.equal(
    normalizePressUrl("  https://www.nytimes.com/2026/01/01/a.html  "),
    "https://www.nytimes.com/2026/01/01/a.html",
  );
  // Scheme-less paste is upgraded to https, never left relative.
  assert.equal(normalizePressUrl("vogue.com/article/x"), "https://vogue.com/article/x");
});

test("normalizePressUrl rejects XSS-capable and malformed hrefs", () => {
  const hostile = [
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "",
    "   ",
    "not a url at all",
    "localhost",
    `https://vogue.com/${"a".repeat(4000)}`,
  ];
  for (const raw of hostile) {
    assert.equal(normalizePressUrl(raw), null, `must reject: ${raw}`);
  }
  for (const bad of [null, undefined, 7, {}]) {
    assert.equal(normalizePressUrl(bad as unknown as string), null);
  }
});
