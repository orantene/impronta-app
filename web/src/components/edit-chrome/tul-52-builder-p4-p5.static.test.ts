import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { overlayWriteLocale } from "@/lib/site-admin/builder-node/i18n-overlay";

const read = (rel: string) =>
  readFileSync(join(process.cwd(), "src/components/edit-chrome", rel), "utf8");

test("TUL-52 P4: overlayWriteLocale routes edits to where the canvas reads", () => {
  const seeded = { es: { text: "El detalle es mi oficio." }, en: { text: "The detail is my craft." } };
  assert.equal(overlayWriteLocale(seeded, "es", "es", "text"), "es");
  assert.equal(overlayWriteLocale(seeded, "en", "es", "text"), "en");
  assert.equal(overlayWriteLocale({ en: { text: "Hi" } }, "es", "es", "text"), null);
  assert.equal(overlayWriteLocale(undefined, "es", "es", "text"), null);
  assert.equal(overlayWriteLocale(seeded, "es", "es", "label"), null);
});

test("TUL-52 P4: the inspector's default tab reads and writes the shadowing i18n[default] entry", () => {
  const src = read("inspectors/builder-node-content.tsx");
  const field = src.slice(src.indexOf("export function BuilderNodeLocalizableTextField"));
  assert.match(field, /const primaryValue = overlayWriteLocale\(overlay, defaultLocale, defaultLocale, prop\)/);
  assert.match(field, /if \(locale === defaultLocale\) return primaryValue;/);
  assert.match(field, /overlayWriteLocale\(overlay, locale, defaultLocale, prop\) === null/);
});

test("TUL-52 P5: Vista previa hides the inspector dock instead of painting an empty card", () => {
  const src = read("inspector-dock.tsx");
  assert.match(src, /const dockOpen = inspectorDockOpen && !previewing;/);
});
