/**
 * TUL-1812: a public visitor never sees "Hours are not published yet."
 * The band is hidden on the published site and kept in the editor preview.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { isEmptyPlaceholderBand } from "./empty-placeholder-band";

const para = (text: string, extra: Record<string, unknown> = {}) => ({ kind: "paragraph", props: { text, ...extra } });
const band = (children: unknown[]) => ({ kind: "container", props: {}, children });

test("a band holding only the template empty line is a placeholder, in either locale", () => {
  assert.equal(isEmptyPlaceholderBand(band([para("El horario aún no está publicado.")])), true);
  assert.equal(isEmptyPlaceholderBand(band([para("Hours are not published yet.")])), true);
  assert.equal(
    isEmptyPlaceholderBand(band([para("El horario aún no está publicado.", { i18n: { en: { text: "Hours are not published yet." } } })])),
    true,
  );
});

test("a band with real hours, a heading, or an owner-written line is kept", () => {
  assert.equal(isEmptyPlaceholderBand(band([para("Lun-Vie 9:00-18:00")])), false);
  assert.equal(isEmptyPlaceholderBand(band([{ kind: "heading", props: { text: "Horario" } }, para("El horario aún no está publicado.")])), false);
  assert.equal(
    isEmptyPlaceholderBand(band([para("El horario aún no está publicado.", { i18n: { en: { text: "Open by appointment" } } })])),
    false,
  );
  assert.equal(isEmptyPlaceholderBand(band([])), false);
  assert.equal(isEmptyPlaceholderBand(para("Hours are not published yet.")), false);
});

test("the container renderer hides it for visitors and keeps it for the editor preview", () => {
  const src = readFileSync(join(__dirname, "render.tsx"), "utf8");
  assert.match(src, /!options\.contentLocale\?\.editorPreview && isEmptyPlaceholderBand\(node[^)]*\)\) return null/);
});
