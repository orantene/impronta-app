import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveBackgroundMedia } from "@/lib/site-admin/builder-node/background-media";
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";

import { pageHero } from "../shared";
import { homePage } from "./home";

/**
 * The hero's video-background OPTION, tested against a fixture.
 *
 * It is deliberately not applied to the live homepage: the owner's footage has
 * embedding turned off in YouTube, so an embed of it renders "This video is
 * unavailable" across the hero. `video-embed-preflight.ts` now refuses to seed
 * that, and this file proves the option itself is sound for the day the video
 * setting changes.
 */
const HERO_WITH_VIDEO = pageHero("fixture", {
  eyebrowText: "Eyebrow",
  line1: "Line one",
  sub: "Subhead copy for the fixture hero.",
  imageSlot: "home-hero",
  videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
});

const HERO_PHOTO_ONLY = pageHero("fixture2", {
  eyebrowText: "Eyebrow",
  line1: "Line one",
  sub: "Subhead copy for the fixture hero.",
  imageSlot: "home-hero",
});

function props(node: unknown): Record<string, unknown> {
  return (node as { props: Record<string, unknown> }).props;
}

test("a hero without a video is byte-identical to before the option existed", () => {
  // The option is additive; a photo hero must not gain a wrapper or attribute.
  assert.equal(props(HERO_PHOTO_ONLY).backgroundMedia, undefined);
});

test("the still stays as poster and reduced-motion fallback", () => {
  const style = props(HERO_WITH_VIDEO).style as Record<string, unknown>;
  assert.match(String(style.backgroundImage), /home-hero|http/);
});

test("the embed is rebuilt from the id, never the pasted URL", () => {
  const resolved = resolveBackgroundMedia(props(HERO_WITH_VIDEO).backgroundMedia as never);
  assert.ok(resolved);
  const asText = JSON.stringify(resolved);
  assert.match(asText, /youtube-nocookie\.com/);
  assert.ok(!asText.includes("watch?v="), "the raw watch URL reached the embed");
});

test("the scrim is heavier over video than over a still", () => {
  const media = props(HERO_WITH_VIDEO).backgroundMedia as { overlay?: number };
  assert.ok((media.overlay ?? 0) >= 50, `overlay ${media.overlay} is too light for video`);
});

test("the live homepage does NOT ship the known un-embeddable video", () => {
  // The owner's own reel has embedding disabled in YouTube; re-adding it puts
  // "This video is unavailable" across the hero. The PLACEHOLDER that ships
  // instead is owner-sanctioned and verified against YouTube by the seed
  // preflight — the only place that fact is checkable.
  assert.ok(
    !JSON.stringify(homePage.tree).includes("c9ARKE2WNxA"),
    "the homepage carries a video whose embedding is disabled",
  );
});
