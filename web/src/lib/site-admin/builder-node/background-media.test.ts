/**
 * background-media.test.ts — the security + normalization contract for
 * container background video.
 *
 * The cases that matter here are the ones a hand-check would pass and a real
 * visitor would not: a pasted URL that is not a video, a `javascript:` src, a
 * scrim colour carrying a `url(`, and the back-compat promise that an absent
 * value emits nothing at all.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKGROUND_MEDIA_DEFAULT_OVERLAY_COLOR,
  backgroundMediaSchema,
  hasRenderableBackgroundMedia,
  resolveBackgroundMedia,
  youtubeThumbnailUrl,
} from "./background-media";

// ── Back-compat ───────────────────────────────────────────────────────────

test("no value resolves to null (containers without a background are untouched)", () => {
  assert.equal(resolveBackgroundMedia(undefined), null);
  assert.equal(resolveBackgroundMedia(null), null);
  assert.equal(hasRenderableBackgroundMedia(undefined), false);
});

test("an empty src resolves to null on both lanes", () => {
  assert.equal(resolveBackgroundMedia({ source: "upload", src: "" }), null);
  assert.equal(resolveBackgroundMedia({ source: "youtube", src: "  " }), null);
});

// ── YouTube lane ──────────────────────────────────────────────────────────

test("a watch URL becomes a nocookie embed, never the pasted string", () => {
  const resolved = resolveBackgroundMedia({
    source: "youtube",
    src: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  });
  assert.ok(resolved);
  assert.ok(
    resolved.url.startsWith(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?",
    ),
    `expected a nocookie embed, got ${resolved.url}`,
  );
  // The host must be one the CSP frame-src actually allows.
  assert.equal(new URL(resolved.url).hostname, "www.youtube-nocookie.com");
});

test("every URL shape YouTube hands out is accepted", () => {
  for (const src of [
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  ]) {
    const resolved = resolveBackgroundMedia({ source: "youtube", src });
    assert.ok(resolved, `expected ${src} to resolve`);
    assert.ok(resolved.url.includes("/embed/dQw4w9WgXcQ"), src);
  }
});

test("a background loop needs mute + a self-referencing playlist, or it does not loop", () => {
  const resolved = resolveBackgroundMedia({
    source: "youtube",
    src: "https://youtu.be/dQw4w9WgXcQ",
  });
  assert.ok(resolved);
  const params = new URL(resolved.url).searchParams;
  // `loop=1` alone is a documented no-op on the YouTube embed: it only loops a
  // single video when `playlist` names that same id.
  assert.equal(params.get("loop"), "1");
  assert.equal(params.get("playlist"), "dQw4w9WgXcQ");
  // Autoplay without mute is blocked by every modern browser, which would make
  // the whole feature silently never start.
  assert.equal(params.get("autoplay"), "1");
  assert.equal(params.get("mute"), "1");
  assert.equal(params.get("controls"), "0");
});

test("YouTube derives a poster so reduced motion has something to show", () => {
  const resolved = resolveBackgroundMedia({
    source: "youtube",
    src: "https://youtu.be/dQw4w9WgXcQ",
  });
  assert.equal(resolved?.posterUrl, youtubeThumbnailUrl("dQw4w9WgXcQ"));
});

test("an authored poster wins over the derived YouTube thumbnail", () => {
  const resolved = resolveBackgroundMedia({
    source: "youtube",
    src: "https://youtu.be/dQw4w9WgXcQ",
    poster: "https://cdn.example.com/still.jpg",
  });
  assert.equal(resolved?.posterUrl, "https://cdn.example.com/still.jpg");
});

test("a non-YouTube URL on the youtube lane resolves to null, not a substitution", () => {
  for (const src of [
    "https://vimeo.com/123456789",
    "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
    "https://example.com/not-a-video",
    "https://www.youtube.com/watch?v=short",
    "javascript:alert(1)",
  ]) {
    assert.equal(
      resolveBackgroundMedia({ source: "youtube", src }),
      null,
      `expected ${src} to be rejected`,
    );
  }
});

// ── Upload lane ───────────────────────────────────────────────────────────

test("https and same-origin video URLs are accepted", () => {
  assert.equal(
    resolveBackgroundMedia({
      source: "upload",
      src: "https://project.supabase.co/storage/v1/object/public/media-public/videos/a.mp4",
    })?.url,
    "https://project.supabase.co/storage/v1/object/public/media-public/videos/a.mp4",
  );
  assert.equal(
    resolveBackgroundMedia({ source: "upload", src: "/uploads/a.mp4" })?.url,
    "/uploads/a.mp4",
  );
});

test("non-https schemes and protocol-relative URLs are rejected", () => {
  for (const src of [
    "javascript:alert(1)",
    "data:video/mp4;base64,AAAA",
    "http://insecure.example.com/a.mp4",
    // `//evil.example.com/a.mp4` reads as a path but resolves to another host.
    "//evil.example.com/a.mp4",
  ]) {
    assert.equal(
      resolveBackgroundMedia({ source: "upload", src }),
      null,
      `expected ${src} to be rejected`,
    );
  }
});

test("an unsafe poster is dropped without dropping the video", () => {
  const resolved = resolveBackgroundMedia({
    source: "upload",
    src: "https://cdn.example.com/a.mp4",
    poster: "javascript:alert(1)",
  });
  assert.ok(resolved);
  assert.equal(resolved.posterUrl, null);
  assert.equal(resolved.url, "https://cdn.example.com/a.mp4");
});

// ── Overlay + framing ─────────────────────────────────────────────────────

test("overlay normalizes from int 0-100 to a 0-1 CSS opacity", () => {
  const at = (overlay: number) =>
    resolveBackgroundMedia({
      source: "upload",
      src: "https://cdn.example.com/a.mp4",
      overlay,
    })?.overlayOpacity;
  assert.equal(at(0), 0);
  assert.equal(at(40), 0.4);
  assert.equal(at(100), 1);
  // Out-of-range values clamp rather than emitting an invalid opacity.
  assert.equal(at(-20), 0);
  assert.equal(at(400), 1);
});

test("an omitted overlay is 0, not a surprise scrim", () => {
  assert.equal(
    resolveBackgroundMedia({ source: "upload", src: "https://cdn.example.com/a.mp4" })
      ?.overlayOpacity,
    0,
  );
});

test("overlay colours that could smuggle a fetch fall back to black", () => {
  const at = (overlayColor: string) =>
    resolveBackgroundMedia({
      source: "upload",
      src: "https://cdn.example.com/a.mp4",
      overlayColor,
    })?.overlayColor;
  // Legitimate values survive.
  assert.equal(at("#112233"), "#112233");
  assert.equal(at("rgba(0,0,0,0.5)"), "rgba(0,0,0,0.5)");
  assert.equal(at("var(--token-color-primary, #4c1d95)"), "var(--token-color-primary, #4c1d95)");
  // A `url(` in a colour has no legitimate use and is the injection shape.
  assert.equal(at("url(https://evil.example.com/x)"), BACKGROUND_MEDIA_DEFAULT_OVERLAY_COLOR);
  assert.equal(at('red;background:url("x")'), BACKGROUND_MEDIA_DEFAULT_OVERLAY_COLOR);
});

test("focal point defaults to center", () => {
  assert.equal(
    resolveBackgroundMedia({ source: "upload", src: "https://cdn.example.com/a.mp4" })
      ?.focalPoint,
    "center",
  );
  assert.equal(
    resolveBackgroundMedia({
      source: "upload",
      src: "https://cdn.example.com/a.mp4",
      focalPoint: "50% 20%",
    })?.focalPoint,
    "50% 20%",
  );
});

// ── Schema ────────────────────────────────────────────────────────────────

test("the schema accepts the shape the inspector writes", () => {
  const parsed = backgroundMediaSchema.safeParse({
    source: "youtube",
    src: "https://youtu.be/dQw4w9WgXcQ",
    overlay: 40,
    mediaId: null,
  });
  assert.equal(parsed.success, true);
});

test("the schema rejects an unknown source and a fractional overlay", () => {
  assert.equal(
    backgroundMediaSchema.safeParse({ source: "vimeo", src: "x" }).success,
    false,
  );
  assert.equal(
    backgroundMediaSchema.safeParse({ source: "upload", src: "x", overlay: 40.5 })
      .success,
    false,
  );
});

test("the schema is strict, so a typo'd key fails loudly instead of vanishing", () => {
  assert.equal(
    backgroundMediaSchema.safeParse({
      source: "upload",
      src: "https://cdn.example.com/a.mp4",
      overlayOpacity: 40,
    }).success,
    false,
  );
});
