/**
 * The Nail Designer band's copy in both languages. Found on book-jorgelina /en after 7b: the band carried
 * only an `es` overlay, and on a Spanish-primary site the English visitor's walk (en, then the primary
 * `es`) reached the Spanish overlay before the English base text.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { renderBuilderNodes, type BuilderNodeContentLocaleOptions } from "@/lib/site-admin/builder-node/render";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { NAIL_BAND_ID, nailBand, normalizeNailBand } from "./app-placement";

const loc = (locale: string): BuilderNodeContentLocaleOptions => ({ locale, defaultLocale: "es", chain: [locale, "es"] });
const text = (band: BuilderNode, locale: string) =>
  renderToStaticMarkup(<>{renderBuilderNodes([band], { contentLocale: loc(locale) })}</>)
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

const SPANISH = ["Pruébalo", "Diseña tus uñas antes de tu cita", "Elige forma, color y arte, y envía tu diseño con tu reserva."];
const ENGLISH = ["Try it", "Design your nails before your visit", "Pick shape, colour and art, and send your design with your booking."];

test("a new band reads English for an English visitor and Spanish for a Spanish one, on a Spanish-primary site", () => {
  const band = nailBand();
  const en = text(band, "en");
  const es = text(band, "es");
  for (const t of ENGLISH) assert.ok(en.includes(t), `en: ${t}`);
  for (const t of SPANISH) assert.ok(!en.includes(t), `en must not show Spanish: ${t}`);
  for (const t of SPANISH) assert.ok(es.includes(t), `es: ${t}`);
  for (const t of ENGLISH) assert.ok(!es.includes(t), `es must not show English: ${t}`);
});

/** A band baked into a real tree before both languages were written: only an `es` overlay. */
function oldBand(): BuilderNode {
  const band = JSON.parse(JSON.stringify(nailBand())) as { children: Array<{ id: string; i18n?: Record<string, unknown>; props: { i18n?: Record<string, unknown> } }> };
  for (const kid of band.children) {
    if (kid.i18n) delete kid.i18n.en;
    if (kid.props.i18n) delete kid.props.i18n.en;
  }
  return band as unknown as BuilderNode;
}

test("a baked es-only band shows the bug until it is healed, then reads English on /en", () => {
  assert.ok(text(oldBand(), "en").includes("Diseña tus uñas"), "the unhealed band reproduces the Spanish-on-/en bug");
  const healed = normalizeNailBand(oldBand());
  const en = text(healed, "en");
  for (const t of ENGLISH) assert.ok(en.includes(t));
  for (const t of SPANISH) assert.ok(!en.includes(t));
  for (const t of SPANISH) assert.ok(text(healed, "es").includes(t));
});

test("healing is stable: a second pass changes nothing, and a talent's own text for a language is kept", () => {
  const once = normalizeNailBand(oldBand());
  assert.equal(JSON.stringify(normalizeNailBand(once)), JSON.stringify(once));
  const edited = JSON.parse(JSON.stringify(oldBand())) as { children: Array<{ id: string; i18n: Record<string, Record<string, string>>; props: { i18n: Record<string, Record<string, string>> } }> };
  const heading = edited.children.find((k) => k.id === `${NAIL_BAND_ID}-heading`)!;
  heading.i18n.en = { text: "Create your nail art first" };
  heading.props.i18n.en = { text: "Create your nail art first" };
  const healed = normalizeNailBand(edited as unknown as BuilderNode);
  assert.ok(text(healed, "en").includes("Create your nail art first"));
});
