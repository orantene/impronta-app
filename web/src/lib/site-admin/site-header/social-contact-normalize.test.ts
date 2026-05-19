import assert from "node:assert/strict";
import test from "node:test";

import {
  headerContactHref,
  normalizeHeaderContactLink,
  normalizeHeaderSocialLink,
} from "./social-contact-normalize";

test("normalizes supported social handles into platform URLs", () => {
  assert.deepEqual(normalizeHeaderSocialLink("tiktok", "@impronta"), {
    platform: "tiktok",
    href: "https://tiktok.com/@impronta",
  });
  assert.deepEqual(normalizeHeaderSocialLink("instagram", "impronta.models"), {
    platform: "instagram",
    href: "https://instagram.com/impronta.models",
  });
});

test("drops wrong-platform social URLs instead of rendering broken anchors", () => {
  assert.equal(
    normalizeHeaderSocialLink("youtube", "https://tiktok.com/@impront"),
    null,
  );
  assert.equal(
    normalizeHeaderSocialLink("instagram", "https://example.com/impronta"),
    null,
  );
});

test("normalizes contact links for header href rendering", () => {
  assert.deepEqual(
    normalizeHeaderContactLink("whatsapp", "https://wa.me/5219840000000, etc."),
    { type: "whatsapp", value: "5219840000000" },
  );
  assert.equal(
    headerContactHref("whatsapp", "https://wa.me/5219840000000, etc."),
    "https://wa.me/5219840000000",
  );
  assert.equal(headerContactHref("phone", "+52 999 22"), null);
  assert.equal(headerContactHref("phone", "+52 984 000 0000"), "tel:+529840000000");
});
