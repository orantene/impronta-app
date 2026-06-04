import test from "node:test";
import assert from "node:assert/strict";

import {
  isMediaEmbedProvider,
  parseMediaUrl,
  safeEmbedUrl,
  MEDIA_EMBED_FRAME_HOSTS,
} from "./media-embed";

// ─────────────────────────────────────────────────────────────────────────────
// parseMediaUrl — valid provider URLs normalize to { provider, externalId }
// ─────────────────────────────────────────────────────────────────────────────

test("parseMediaUrl: YouTube watch URL → video id", () => {
  const r = parseMediaUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(r?.provider, "youtube");
  assert.equal(r?.externalId, "dQw4w9WgXcQ");
  assert.equal(r?.itemKind, "video");
  assert.equal(r?.canonicalUrl, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
});

test("parseMediaUrl: youtu.be short URL → video id", () => {
  const r = parseMediaUrl("https://youtu.be/dQw4w9WgXcQ");
  assert.equal(r?.provider, "youtube");
  assert.equal(r?.externalId, "dQw4w9WgXcQ");
});

test("parseMediaUrl: YouTube embed + shorts paths", () => {
  assert.equal(
    parseMediaUrl("https://www.youtube.com/embed/dQw4w9WgXcQ")?.externalId,
    "dQw4w9WgXcQ",
  );
  assert.equal(
    parseMediaUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")?.externalId,
    "dQw4w9WgXcQ",
  );
});

test("parseMediaUrl: Vimeo numeric id", () => {
  const r = parseMediaUrl("https://vimeo.com/123456789");
  assert.equal(r?.provider, "vimeo");
  assert.equal(r?.externalId, "123456789");
  assert.equal(r?.canonicalUrl, "https://vimeo.com/123456789");
});

test("parseMediaUrl: player.vimeo.com/video/<id>", () => {
  assert.equal(
    parseMediaUrl("https://player.vimeo.com/video/123456789")?.externalId,
    "123456789",
  );
});

test("parseMediaUrl: Spotify track/playlist/album/artist", () => {
  const id = "a".repeat(22);
  assert.deepEqual(
    {
      provider: parseMediaUrl(`https://open.spotify.com/track/${id}`)?.provider,
      externalId: parseMediaUrl(`https://open.spotify.com/track/${id}`)
        ?.externalId,
      itemKind: parseMediaUrl(`https://open.spotify.com/track/${id}`)?.itemKind,
    },
    { provider: "spotify", externalId: `track/${id}`, itemKind: "track" },
  );
  assert.equal(
    parseMediaUrl(`https://open.spotify.com/playlist/${id}`)?.itemKind,
    "playlist",
  );
  assert.equal(
    parseMediaUrl(`https://open.spotify.com/album/${id}`)?.itemKind,
    "album",
  );
  assert.equal(
    parseMediaUrl(`https://open.spotify.com/artist/${id}`)?.itemKind,
    "profile",
  );
});

test("parseMediaUrl: Spotify with query string still parses (id validated)", () => {
  const id = "b".repeat(22);
  const r = parseMediaUrl(`https://open.spotify.com/track/${id}?si=abc`);
  assert.equal(r?.externalId, `track/${id}`);
});

test("parseMediaUrl: SoundCloud track path", () => {
  const r = parseMediaUrl("https://soundcloud.com/artist/track-name");
  assert.equal(r?.provider, "soundcloud");
  assert.equal(r?.externalId, "artist/track-name");
  assert.equal(r?.itemKind, "track");
  assert.equal(r?.canonicalUrl, "https://soundcloud.com/artist/track-name");
});

// ─────────────────────────────────────────────────────────────────────────────
// parseMediaUrl — malicious / unsupported inputs are REJECTED (null)
// ─────────────────────────────────────────────────────────────────────────────

test("parseMediaUrl rejects javascript: and data: URLs", () => {
  assert.equal(parseMediaUrl("javascript:alert(1)"), null);
  assert.equal(
    parseMediaUrl("data:text/html,<script>alert(1)</script>"),
    null,
  );
});

test("parseMediaUrl rejects look-alike / attacker-controlled hosts", () => {
  // Subdomain spoof and path-confusion attempts must not be recognized.
  assert.equal(
    parseMediaUrl("https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ"),
    null,
  );
  assert.equal(
    parseMediaUrl("https://evil.com/open.spotify.com/track/" + "a".repeat(22)),
    null,
  );
  assert.equal(parseMediaUrl("https://notvimeo.com/123456789"), null);
});

test("parseMediaUrl rejects unsupported providers and arbitrary URLs", () => {
  assert.equal(parseMediaUrl("https://tiktok.com/@x/video/123"), null);
  assert.equal(parseMediaUrl("https://example.com/cool"), null);
  assert.equal(parseMediaUrl("not a url"), null);
  assert.equal(parseMediaUrl(""), null);
});

test("parseMediaUrl rejects malformed provider ids", () => {
  // YouTube id must be 11 url-safe chars.
  assert.equal(parseMediaUrl("https://www.youtube.com/watch?v=short"), null);
  assert.equal(
    parseMediaUrl("https://www.youtube.com/watch?v=" + "x".repeat(40)),
    null,
  );
  // Vimeo id must be numeric.
  assert.equal(parseMediaUrl("https://vimeo.com/notanumber"), null);
  // Spotify id must be 22 base62 chars.
  assert.equal(parseMediaUrl("https://open.spotify.com/track/short"), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// safeEmbedUrl — { provider, id } → privacy-friendly allowlisted iframe src
// ─────────────────────────────────────────────────────────────────────────────

test("safeEmbedUrl: YouTube uses youtube-nocookie.com", () => {
  assert.equal(
    safeEmbedUrl("youtube", "dQw4w9WgXcQ"),
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  );
});

test("safeEmbedUrl: Vimeo uses player.vimeo.com", () => {
  assert.equal(
    safeEmbedUrl("vimeo", "123456789"),
    "https://player.vimeo.com/video/123456789",
  );
});

test("safeEmbedUrl: Spotify uses open.spotify.com/embed", () => {
  const id = "c".repeat(22);
  assert.equal(
    safeEmbedUrl("spotify", `track/${id}`),
    `https://open.spotify.com/embed/track/${id}`,
  );
});

test("safeEmbedUrl: SoundCloud uses w.soundcloud.com player with encoded url", () => {
  const src = safeEmbedUrl("soundcloud", "artist/track-name");
  assert.ok(src?.startsWith("https://w.soundcloud.com/player/?url="));
  assert.ok(
    src?.includes(encodeURIComponent("https://soundcloud.com/artist/track-name")),
  );
});

test("safeEmbedUrl: unknown provider → null", () => {
  assert.equal(safeEmbedUrl("tiktok", "abc"), null);
  assert.equal(safeEmbedUrl("evil", "x"), null);
  assert.equal(safeEmbedUrl("", ""), null);
});

test("safeEmbedUrl: malformed ids → null (no injection)", () => {
  assert.equal(safeEmbedUrl("youtube", "../../etc/passwd"), null);
  assert.equal(safeEmbedUrl("vimeo", "1; DROP TABLE"), null);
  assert.equal(safeEmbedUrl("spotify", "track/short"), null);
  assert.equal(safeEmbedUrl("soundcloud", "a b"), null);
  assert.equal(safeEmbedUrl("soundcloud", "javascript:alert(1)"), null);
});

test("safeEmbedUrl output host is always in the frame-src allowlist", () => {
  const id22 = "d".repeat(22);
  const outputs = [
    safeEmbedUrl("youtube", "dQw4w9WgXcQ"),
    safeEmbedUrl("vimeo", "123456789"),
    safeEmbedUrl("spotify", `track/${id22}`),
    safeEmbedUrl("soundcloud", "artist/track-name"),
  ];
  for (const out of outputs) {
    assert.ok(out, "expected a safe embed url");
    const host = new URL(out!).origin;
    assert.ok(
      MEDIA_EMBED_FRAME_HOSTS.includes(host as (typeof MEDIA_EMBED_FRAME_HOSTS)[number]),
      `host ${host} must be in MEDIA_EMBED_FRAME_HOSTS`,
    );
  }
});

test("isMediaEmbedProvider guards the provider union", () => {
  assert.ok(isMediaEmbedProvider("youtube"));
  assert.ok(isMediaEmbedProvider("soundcloud"));
  assert.ok(!isMediaEmbedProvider("tiktok"));
  assert.ok(!isMediaEmbedProvider(""));
});
