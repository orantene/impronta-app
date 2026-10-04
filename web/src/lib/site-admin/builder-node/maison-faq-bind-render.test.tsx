/**
 * FAQ-bound accordion expands from dataSources.talentFaqItems (W16).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { BuilderNode } from "./types";
import { renderBuilderNodes } from "./render";

test("accordion bindSource talent_faq_items renders published questions", () => {
  const tree: BuilderNode[] = [
    {
      id: "faq",
      kind: "accordion",
      props: { bindSource: "talent_faq_items", allowMultiple: true },
      children: [],
    },
  ];
  const html = renderToStaticMarkup(
    <>
      {renderBuilderNodes(tree, {
        mode: "freeform",
        includeRendererStyles: false,
        includeFontLinks: false,
        dataSources: {
          talentFaqItems: [
            { id: "1", question: "¿Cómo reservo una cita?", answer: "Desde la web." },
          ],
        },
      })}
    </>,
  );
  assert.match(html, /data-faq-bind="talent_faq_items"/);
  assert.match(html, /Cómo reservo una cita/);
  assert.match(html, /Desde la web/);
});
