import { test } from "node:test";
import assert from "node:assert/strict";

import { introspectSectionSchema, type IntrospectedField } from "./zod-introspect";
import { siteHeaderSchemaV1 } from "../site_header/schema";
import { siteFooterSchemaV1 } from "../site_footer/schema";
import { pressStripSchemaV1 } from "../press_strip/schema";
import { blogDetailSchemaV1 } from "../blog_detail/schema";
import { videoReelSchemaV1 } from "../video_reel/schema";

/**
 * D9 regression — six media fields rendered a bare URL textbox instead of
 * the MediaPicker because their field name wasn't in the
 * `NAME_HINTS` allow-list `<ZodSchemaForm>` uses to swap in the picker.
 *
 * Five of the six are ZodSchemaForm-driven (introspection reaches them,
 * including through nested `brand.logoUrl` / `items[].logoUrl` shapes,
 * since `introspectField` recurses passing only the LOCAL key) — this test
 * locks those five in. `editorial_split_hero.mediaUrl` is the sixth; that
 * Editor is hand-written (no ZodSchemaForm), so it's covered separately by
 * wiring `MediaPicker` directly into `editorial_split_hero/Editor.tsx`
 * rather than by this introspection test.
 */

function findByPath(
  fields: ReadonlyArray<IntrospectedField>,
  path: ReadonlyArray<string>,
): IntrospectedField | null {
  const [head, ...rest] = path;
  const field = fields.find((f) => f.name === head);
  if (!field) return null;
  if (rest.length === 0) return field;
  if (!field.children) return null;
  return findByPath(field.children, rest);
}

test("site_header: brand.logoUrl (nested) gets the image_url hint", () => {
  const fields = introspectSectionSchema(siteHeaderSchemaV1);
  const logoUrl = findByPath(fields, ["brand", "logoUrl"]);
  assert.ok(logoUrl, "brand.logoUrl should be introspected");
  assert.equal(logoUrl!.hint, "image_url");
  const logoAlt = findByPath(fields, ["brand", "logoAlt"]);
  assert.equal(logoAlt?.hint, "alt_text");
});

test("site_footer: brand.logoUrl (nested) gets the image_url hint", () => {
  const fields = introspectSectionSchema(siteFooterSchemaV1);
  const logoUrl = findByPath(fields, ["brand", "logoUrl"]);
  assert.ok(logoUrl, "brand.logoUrl should be introspected");
  assert.equal(logoUrl!.hint, "image_url");
});

test("press_strip: items[].logoUrl (nested in array-of-objects) gets the image_url hint", () => {
  const fields = introspectSectionSchema(pressStripSchemaV1);
  const items = fields.find((f) => f.name === "items");
  assert.ok(items, "items field should be introspected");
  assert.equal(items!.kind, "array_of_objects");
  const logoUrl = items!.children?.find((f) => f.name === "logoUrl");
  assert.ok(logoUrl, "items[].logoUrl should be introspected as a child");
  assert.equal(logoUrl!.hint, "image_url");
});

test("blog_detail: heroImageUrl (flat) gets the image_url hint", () => {
  const fields = introspectSectionSchema(blogDetailSchemaV1);
  const heroImageUrl = fields.find((f) => f.name === "heroImageUrl");
  assert.ok(heroImageUrl);
  assert.equal(heroImageUrl!.hint, "image_url");
  const heroImageAlt = fields.find((f) => f.name === "heroImageAlt");
  assert.equal(heroImageAlt?.hint, "alt_text");
});

test("video_reel: posterUrl (flat) gets the image_url hint", () => {
  const fields = introspectSectionSchema(videoReelSchemaV1);
  const posterUrl = fields.find((f) => f.name === "posterUrl");
  assert.ok(posterUrl);
  assert.equal(posterUrl!.hint, "image_url");
});
