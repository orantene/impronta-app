/**
 * event_program drawer — the pure rules: which layouts open a drawer by
 * default, the CTA label fallback, the video allowlist (YouTube / Vimeo only,
 * mirrored from the embed block's host list), the hero choice, Instagram.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import type { PublicScheduleItem } from "@/app/(public)/_events/event-program-actions";
import { drawerEnabled, drawerHero, instagramHref, itemCta, videoEmbedSrc } from "./event-program-drawer-model";

const t = (k: string) => ({ reserveSpot: "Reserve a spot", seeMore: "See more" })[k] ?? k;

function item(overrides: Partial<PublicScheduleItem> = {}): PublicScheduleItem {
  return {
    id: "x", kind: "set", title: "x", subtitle: null, description: null, startsAt: null, endsAt: null, timeTba: false,
    sessionId: null, spaceId: null, performer: null, coverUrl: null, media: { gallery: [], video: null },
    links: { href: null, label: null, instagram: null, website: null }, sponsor: null, tags: [], sortOrder: 0,
    ...overrides,
  };
}

test("drawerEnabled: timeline / cards / lineup by default, compact / schedule off, the prop overrides", () => {
  assert.equal(drawerEnabled("timeline", undefined), true);
  assert.equal(drawerEnabled("cards", undefined), true);
  assert.equal(drawerEnabled("lineup", undefined), true);
  assert.equal(drawerEnabled("compact", undefined), false);
  assert.equal(drawerEnabled("schedule", undefined), false);
  assert.equal(drawerEnabled("timeline", false), false);
  assert.equal(drawerEnabled("compact", true), true);
});

test("itemCta: needs an http(s) href; the authored label wins; empty on workshop/class reads Reserve a spot, elsewhere See more", () => {
  assert.equal(itemCta(item(), t), null);
  assert.equal(itemCta(item({ links: { href: "javascript:alert(1)", label: "x", instagram: null, website: null } }), t), null);
  assert.deepEqual(itemCta(item({ kind: "workshop", links: { href: "https://a.example", label: null, instagram: null, website: null } }), t), { href: "https://a.example", label: "Reserve a spot" });
  assert.deepEqual(itemCta(item({ kind: "class", links: { href: "https://a.example", label: "  ", instagram: null, website: null } }), t), { href: "https://a.example", label: "Reserve a spot" });
  assert.deepEqual(itemCta(item({ kind: "set", links: { href: "https://a.example", label: null, instagram: null, website: null } }), t), { href: "https://a.example", label: "See more" });
  assert.deepEqual(itemCta(item({ kind: "workshop", links: { href: "https://a.example", label: "Sign up", instagram: null, website: null } }), t), { href: "https://a.example", label: "Sign up" });
});

test("videoEmbedSrc: YouTube (watch, short, embed, youtu.be) and Vimeo only; https only; nothing else embeds", () => {
  assert.equal(videoEmbedSrc("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assert.equal(videoEmbedSrc("https://youtu.be/dQw4w9WgXcQ?t=10"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assert.equal(videoEmbedSrc("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assert.equal(videoEmbedSrc("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assert.equal(videoEmbedSrc("https://vimeo.com/123456789"), "https://player.vimeo.com/video/123456789");
  assert.equal(videoEmbedSrc("https://player.vimeo.com/video/123456789"), "https://player.vimeo.com/video/123456789");
  assert.equal(videoEmbedSrc("http://www.youtube.com/watch?v=dQw4w9WgXcQ"), null, "https only");
  assert.equal(videoEmbedSrc("https://attacker.example/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(videoEmbedSrc("https://www.youtube.com.attacker.example/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(videoEmbedSrc("https://www.youtube.com/watch?v=<script>"), null);
  assert.equal(videoEmbedSrc("not a url"), null);
  assert.equal(videoEmbedSrc(null), null);
});

test("the video hosts are the embed block's video hosts", () => {
  const registry = readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "registry.ts"), "utf8");
  for (const host of ["youtube.com", "youtube-nocookie.com", "vimeo.com"]) {
    assert.match(registry, new RegExp(`"${host.replace(".", "\\.")}"`), `${host} is in the embed allowlist`);
  }
});

test("drawerHero: cover, else the performer hero, else the first gallery image; instagramHref", () => {
  assert.equal(drawerHero(item()), null);
  assert.equal(drawerHero(item({ media: { gallery: ["https://g/1.jpg"], video: null } })), "https://g/1.jpg");
  assert.equal(drawerHero(item({ performer: { name: "A", tba: false, profileHref: null, heroUrl: "https://h.jpg", instagram: null, bio: null }, media: { gallery: ["https://g/1.jpg"], video: null } })), "https://h.jpg");
  assert.equal(drawerHero(item({ coverUrl: "https://c.jpg", performer: { name: "A", tba: false, profileHref: null, heroUrl: "https://h.jpg", instagram: null, bio: null } })), "https://c.jpg");
  assert.equal(instagramHref("@ana.sofia"), "https://www.instagram.com/ana.sofia/");
  assert.equal(instagramHref("https://instagram.com/ana"), "https://instagram.com/ana");
  assert.equal(instagramHref("  "), null);
});
