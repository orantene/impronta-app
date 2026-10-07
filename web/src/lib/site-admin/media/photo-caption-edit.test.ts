import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyCaptionEdit,
  captionNeedsSave,
  PHOTO_CAPTION_MAX_CHARS,
  readCaptionDrafts,
} from "./photo-caption-edit";
import { resolvePortfolioCaption } from "../builder-node/portfolio-i18n";

test("primary language writes metadata.caption, never caption_i18n", () => {
  const out = applyCaptionEdit({}, "es", "es", "  Sesión en la playa ");
  assert.equal(out.caption, "Sesión en la playa");
  assert.equal(out.caption_i18n, undefined);
});

test("second language writes caption_i18n.<locale> and leaves the primary alone", () => {
  const out = applyCaptionEdit({ caption: "Hola" }, "en", "es", "Hello");
  assert.equal(out.caption, "Hola");
  assert.deepEqual(out.caption_i18n, { en: "Hello" });
});

test("empty text removes the key; an emptied map is removed", () => {
  const a = applyCaptionEdit({ caption: "Hola" }, "es", "es", "   ");
  assert.equal("caption" in a, false);
  const b = applyCaptionEdit({ caption_i18n: { en: "Hello" } }, "en", "es", "");
  assert.equal("caption_i18n" in b, false);
  const c = applyCaptionEdit({ caption_i18n: { en: "Hello", fr: "Salut" } }, "en", "es", "");
  assert.deepEqual(c.caption_i18n, { fr: "Salut" });
});

test("caps at 200 characters", () => {
  const out = applyCaptionEdit({}, "es", "es", "x".repeat(500));
  assert.equal((out.caption as string).length, PHOTO_CAPTION_MAX_CHARS);
});

test("never drops other metadata keys and never mutates the input", () => {
  const input = {
    alt_i18n: { en: "A beach" },
    albumId: "a1",
    note: "n",
    caption_i18n: { fr: "Plage" },
  };
  const copy = JSON.parse(JSON.stringify(input));
  const out = applyCaptionEdit(input, "en", "es", "Beach");
  assert.deepEqual(out.alt_i18n, { en: "A beach" });
  assert.equal(out.albumId, "a1");
  assert.equal(out.note, "n");
  assert.deepEqual(out.caption_i18n, { fr: "Plage", en: "Beach" });
  assert.deepEqual(input, copy);
});

test("null metadata and a locale tag like en-US are handled", () => {
  assert.deepEqual(applyCaptionEdit(null, "en-US", "es", "Hi").caption_i18n, { en: "Hi" });
  assert.equal(applyCaptionEdit(undefined, "ES-mx", "es", "Hola").caption, "Hola");
});

test("captionNeedsSave ignores whitespace-only changes", () => {
  assert.equal(captionNeedsSave("Hola", " Hola "), false);
  assert.equal(captionNeedsSave(undefined, ""), false);
  assert.equal(captionNeedsSave("Hola", "Hola!"), true);
});

test("readCaptionDrafts maps primary to caption and the rest to caption_i18n", () => {
  const drafts = readCaptionDrafts(
    { caption: "Hola", caption_i18n: { en: "Hello" } },
    ["es", "en"],
    "es",
  );
  assert.deepEqual(drafts, { es: "Hola", en: "Hello" });
});

test("round trip: a saved caption resolves for an EN and an ES visitor", () => {
  let meta = applyCaptionEdit({}, "es", "es", "Sesión en la playa");
  meta = applyCaptionEdit(meta, "en", "es", "Beach session");
  assert.equal(resolvePortfolioCaption(meta, "en", "es"), "Beach session");
  assert.equal(resolvePortfolioCaption(meta, "es", "es"), "Sesión en la playa");
  // Clearing the English caption falls back to the primary, never to nothing.
  const cleared = applyCaptionEdit(meta, "en", "es", "");
  assert.equal(resolvePortfolioCaption(cleared, "en", "es"), "Sesión en la playa");
});
