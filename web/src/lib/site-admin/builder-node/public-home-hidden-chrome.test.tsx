/**
 * TUL-699: public home chrome that must stay invisible or absent.
 * - the form honeypot is visually hidden but still a fillable text input, and
 *   its label follows the page language (content locale first);
 * - the skip link is sr-only until focused;
 * - a carousel rail whose slides all render nothing leaves no blank band.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { SkipToContent } from "@/components/accessibility/skip-to-content";
import { renderBuilderNodes } from "./render";
import type { BuilderNode } from "./types";

const formNode = {
  id: "form-1",
  kind: "form",
  props: {
    sectionId: "11111111-2222-3333-4444-555555555555",
    fields: [{ id: "send", type: "submit", name: "send", label: "Enviar" }],
  },
} as unknown as BuilderNode;

function html(nodes: BuilderNode[], extra: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, {
      mode: "freeform",
      includeRendererStyles: false,
      ...extra,
    } as never) as React.ReactElement,
  );
}

function honeypotBlock(markup: string): string {
  const m = markup.match(/<div aria-hidden="true"[^>]*>(?:(?!<\/div>).)*name="website"[^>]*\/?>(?:(?!<\/div>).)*<\/div>/s);
  assert.ok(m, "honeypot block missing");
  return m[0];
}

test("honeypot label follows the content locale when no visitor locale is passed", () => {
  const out = html([formNode], {
    contentLocale: { locale: "es", defaultLocale: "es", chain: [] },
  });
  assert.ok(honeypotBlock(out).includes("Deja este campo vacío"));
  assert.ok(!out.includes("Leave this field empty"));
});

test("honeypot uses the visually-hidden clip pattern and stays a fillable text input", () => {
  const block = honeypotBlock(html([formNode]));
  assert.match(block, /clip(-path)?:/i, "needs a clip so it never paints");
  assert.match(block, /white-space:nowrap/i);
  assert.ok(!/display:\s*none|visibility:\s*hidden/i.test(block), "bots must still be able to fill it");
  assert.ok(block.includes('type="text"') && block.includes('tabindex="-1"'));
});

test("skip link is sr-only until focused", () => {
  const out = renderToStaticMarkup(<SkipToContent locale="es" />);
  const cls = out.match(/class="([^"]*)"/)?.[1] ?? "";
  assert.ok(cls.split(" ").includes("sr-only"));
  assert.ok(cls.includes("focus:not-sr-only"));
  assert.ok(out.includes("Saltar al contenido"));
});

test("a rail carousel with no renderable slide renders nothing", () => {
  const rail = {
    id: "car-1",
    kind: "carousel",
    props: {},
    children: [{ id: "img-1", kind: "image", props: { src: "", alt: "" } }],
  } as unknown as BuilderNode;
  const out = html([rail]);
  assert.ok(!out.includes("site-builder-node--carousel"), out);
});
