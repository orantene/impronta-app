import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { editorT } from "./editor-i18n";
import { SectionEditorI18nProvider } from "@/lib/site-admin/sections/shared/section-editor-i18n";
import { ValuesTrioEditor } from "@/lib/site-admin/sections/values_trio/Editor";
import { StatsEditor } from "@/lib/site-admin/sections/stats/Editor";
import { FaqAccordionEditor } from "@/lib/site-admin/sections/faq_accordion/Editor";

/**
 * WAVE 4.5 — proves the section Editor PANELS actually render Spanish.
 *
 * The parity guard proves a catalog ENTRY exists. That is not the same claim.
 * These panels are auto-rendered by `ZodSchemaForm` from the Zod schema, so
 * their labels are `humanize(fieldName)` computed at render time, and they
 * reach their translator through the `useSectionT()` context seam rather than
 * importing it (lib may not import edit-chrome). Any one of those three links
 * can break while every catalog key is present and every other test is green:
 * a missing provider renders perfect English and reports nothing.
 *
 * So: render the real components, with the real ES translator, and read the
 * markup. Three ZodSchemaForm-driven panels, picked because they exercise
 * scalars, an enum chip row and an array repeater between them.
 */

const t = (text: string) => editorT(text, "es");

function renderPanelEs(node: React.ReactElement): string {
  return renderToStaticMarkup(
    <SectionEditorI18nProvider t={t}>{node}</SectionEditorI18nProvider>,
  );
}

test("values_trio panel renders Spanish field labels, not English", () => {
  const html = renderPanelEs(
    <ValuesTrioEditor initial={{} as never} onChange={() => {}} />,
  );
  assert.match(html, /Antetítulo/, "eyebrow label must be Spanish");
  assert.match(html, /Estilo del número/, "numberStyle label must be Spanish");
  assert.doesNotMatch(html, />Eyebrow</, "English 'Eyebrow' must not survive");
  assert.doesNotMatch(html, />Number style</, "English 'Number style' must not survive");
});

test("stats panel renders Spanish, including the group header", () => {
  const html = renderPanelEs(<StatsEditor initial={{} as never} onChange={() => {}} />);
  assert.match(html, /Antetítulo/);
  assert.match(html, />Contenido</, "the ZodSchemaForm group header must be Spanish");
  assert.doesNotMatch(html, />Eyebrow</);
});

test("faq_accordion panel renders Spanish, including enum chips", () => {
  const html = renderPanelEs(
    <FaqAccordionEditor initial={{} as never} onChange={() => {}} />,
  );
  // `title` humanizes to "Title" and the array group to "Items": both derived
  // at render time by ZodSchemaForm, which is exactly the path that would
  // silently stay English if the provider seam broke.
  assert.match(html, />Título</, "derived field label must be Spanish");
  assert.match(html, /Elementos · 3/, "array group header + count must be Spanish");
  assert.match(html, />Con borde</, "humanized enum option must be Spanish");
  assert.doesNotMatch(html, />Title</);
  assert.doesNotMatch(html, />Bordered</);
});

test("without a provider the panels stay English (safe default, no blanks)", () => {
  // The seam defaults to identity so a panel rendered outside the editor
  // (tests, the composer route) shows its English source rather than nothing.
  const html = renderToStaticMarkup(
    <ValuesTrioEditor initial={{} as never} onChange={() => {}} />,
  );
  assert.match(html, /Headline/, "English must pass through untranslated");
});
