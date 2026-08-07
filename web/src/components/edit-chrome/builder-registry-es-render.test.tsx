import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { SectionEditorI18nProvider } from "@/lib/site-admin/sections/shared/section-editor-i18n";
import { editorT } from "./editor-i18n";
import { ElementLibraryInsertPicker } from "./element-library-insert-picker";
import { AiRewriteButton } from "./inspectors/AiRewriteButton";
import { InspectorRowDelete } from "./inspectors/kit/inspector-item-row";

/**
 * WAVE 4.6 — proves the BUILDER-REGISTRY copy actually renders in Spanish.
 *
 * The registry (`lib/site-admin/builder-node/**`) authors its node-kind labels,
 * descriptions and element-library headings in English and cannot import
 * edit-chrome, so every one of those strings is translated at an edit-chrome
 * RENDER boundary. A catalog entry existing proves nothing about whether the
 * boundary was actually applied: that was precisely the failure this lane was
 * handed, where "CONTAINER BLOCK" and "Container" kept painting English while
 * the parity guard was green (the strings were never `t()`-wrapped at all).
 *
 * So: render the real components and read the markup.
 *
 * `useEditorLocale` seeds from `navigator.language` on first render and only
 * upgrades from the cookie in an effect, so a server render resolves "en"
 * unless the navigator says otherwise. Stubbing it here is not a workaround for
 * a broken locale path; it is how we reach the ES branch in a render with no
 * effects. (The cookie path itself is exercised in the browser, and separately
 * the storefront locale middleware rewrites `locale=es` to `en` on tenants with
 * no Spanish public locale, which is why a naive local cookie QA reads English.)
 */
/**
 * `detectEditorLocale()` runs in the `useState` initializer, i.e. at RENDER
 * time, so stubbing navigator here (before any test body runs) is enough.
 */
Object.defineProperty(globalThis, "navigator", {
  value: { language: "es-ES" },
  configurable: true,
  writable: true,
});

test("the element library renders registry kind labels and headings in Spanish", () => {
  const html = renderToStaticMarkup(
    <ElementLibraryInsertPicker
      variant="inspector"
      allowedKinds={["container", "cta_group", "heading", "code", "masonry"]}
      onPick={() => {}}
    />,
  );

  // Category headings (mvp-allow-list.ts).
  assert.match(html, /Maquetación|Diseño/, "the Layout category must be Spanish");
  assert.match(html, /Acciones/, "the Actions category must be Spanish");
  assert.match(html, /Utilidades/, "the Utility category must be Spanish");
  // Kind labels (registry.ts / mvp-allow-list.ts).
  assert.match(html, /Contenedor/, "the container kind label must be Spanish");
  assert.match(html, /Grupo de CTA/, "the cta_group kind label must be Spanish");
  assert.match(html, /Mosaico/, "the masonry kind label must be Spanish");
  // Chrome authored in the picker itself.
  assert.match(html, /Buscar bloques/, "the search placeholder must be Spanish");

  assert.doesNotMatch(html, />Container</, "English 'Container' must not survive");
  assert.doesNotMatch(html, />CTA group</, "English 'CTA group' must not survive");
  assert.doesNotMatch(html, />Utility</, "English 'Utility' must not survive");
});

test("the composed kind lines keep their token and read naturally in Spanish", () => {
  // The inspector header prints these (CSS-uppercased into "BLOQUE CONTENEDOR").
  const block = editorT("{label} block", "es").replace(
    "{label}",
    editorT("Container", "es"),
  );
  assert.equal(block, "Bloque Contenedor");

  const section = editorT("{label} section", "es").replace(
    "{label}",
    editorT("Hero", "es"),
  );
  assert.match(section, /^Sección /, "the section line must be Spanish");

  for (const key of ["{label} block", "{label} section", "{label} blocks", "{label} pattern"]) {
    assert.ok(
      editorT(key, "es").includes("{label}"),
      `${key} must keep its interpolation token intact`,
    );
  }
});

test("InspectorRowDelete's default 'Remove' reaches the operator in Spanish", () => {
  const html = renderToStaticMarkup(<InspectorRowDelete onClick={() => {}} />);
  assert.match(html, /aria-label="Quitar"/, "the accessible name must be Spanish");
  assert.doesNotMatch(html, /aria-label="Remove"/);
});

test("AiRewriteButton takes Spanish from the section panel it is mounted in", () => {
  // Its only mount site is ZodSchemaForm, inside a section Editor panel. It used
  // to resolve its own locale from the cookie, so it rendered English inside a
  // Spanish panel wherever that read had not resolved yet. It now prefers the
  // host panel's translator.
  const html = renderToStaticMarkup(
    <SectionEditorI18nProvider t={(text: string) => editorT(text, "es")}>
      <AiRewriteButton
        sectionTypeKey="hero"
        fieldName="eyebrow"
        currentValue=""
        onApply={() => {}}
      />
    </SectionEditorI18nProvider>,
  );
  assert.match(html, /Reescribir/, "the trigger must be Spanish");
  assert.doesNotMatch(html, /title="Rewrite with AI"/);
});
