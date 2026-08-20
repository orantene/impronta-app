import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { renderBuilderNodes, BuilderNodeRendererStyles } from "./render";
import type { BuilderNodeTree } from "./types";
import { validateBuilderNodeTree } from "./validate";

/**
 * Field-box styling crosses four layers — schema, type, renderer, stylesheet —
 * and tonight's engine audit found the same failure shape over and over: a
 * capability wired at three of the four, green everywhere, dead in the
 * operator's hands. Each test here pins one seam, so dropping any layer fails
 * loudly instead of shipping a control that does nothing.
 */

const FORM: BuilderNodeTree = [
  {
    id: "f1",
    kind: "form",
    props: {
      action: "internal",
      method: "post",
      fields: [
        { id: "a", name: "name", type: "text", label: "Name", required: true },
        { id: "s", name: "submit", type: "submit", label: "Send" },
      ],
      fieldBorderColor: "#c9a227",
      fieldBackground: "rgba(255,255,255,0.08)",
      fieldCornerRadius: "10px",
    },
  } as never,
];

test("schema: field styling SURVIVES validation, not merely passes it", () => {
  // zod's default object behavior STRIPS unknown keys silently. A schema that
  // never learned these props would still return ok:true here - and the save
  // path, which persists the PARSED tree, would quietly drop the styling on
  // every publish. Asserting on the parsed output is what makes this test
  // able to fail.
  const result = validateBuilderNodeTree(FORM);
  assert.ok(result.ok, JSON.stringify(!result.ok && result.issues));
  const props = (result.ok ? result.tree[0] : FORM[0])!.props as Record<string, unknown>;
  assert.equal(props.fieldBorderColor, "#c9a227");
  assert.equal(props.fieldBackground, "rgba(255,255,255,0.08)");
  assert.equal(props.fieldCornerRadius, "10px");
});

test("renderer: the props come out as custom properties on the form element", () => {
  const raw = renderToStaticMarkup(<>{renderBuilderNodes(FORM, {} as never)}</>);
  const markup = raw.replace(/<style[\s\S]*?<\/style>/g, "");
  assert.match(markup, /--bn-form-field-border:\s*#c9a227/);
  assert.match(markup, /--bn-form-field-bg:\s*rgba\(255,255,255,0\.08\)/);
  assert.match(markup, /--bn-form-field-radius:\s*10px/);
});

test("renderer: unset props emit no custom properties (existing forms unchanged)", () => {
  const bare: BuilderNodeTree = [
    {
      id: "f2",
      kind: "form",
      props: {
        action: "internal",
        fields: [{ id: "a", name: "name", type: "text", label: "Name" }],
      },
    } as never,
  ];
  const raw = renderToStaticMarkup(<>{renderBuilderNodes(bare, {} as never)}</>);
  assert.doesNotMatch(raw.replace(/<style[\s\S]*?<\/style>/g, ""), /--bn-form-field/);
});

test("stylesheet: the field rules actually consume the variables", () => {
  const css = renderToStaticMarkup(<BuilderNodeRendererStyles />);
  for (const v of ["--bn-form-field-border", "--bn-form-field-bg", "--bn-form-field-radius"]) {
    assert.ok(css.includes(`var(${v}`), `${v} is emitted by the renderer but nothing styles with it`);
  }
});

test("stylesheet: a submitted form collapses to just the banner", () => {
  const css = renderToStaticMarkup(<BuilderNodeRendererStyles />);
  assert.ok(
    css.includes('[data-form-submitted] &gt; :not([data-form-result-banner])') ||
      css.includes("[data-form-submitted] > :not([data-form-result-banner])"),
    "the success-collapse rule is missing - an emptied form under a thank-you reads as 'fill me in again'",
  );
});
