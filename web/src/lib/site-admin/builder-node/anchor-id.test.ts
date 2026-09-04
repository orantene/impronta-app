import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeAnchorId, anchorIdAttrs } from "./anchor-id";
import { validateBuilderNodeTree } from "./validate";
import type { BuilderNode } from "./types";

test("normalizeAnchorId slugifies what an operator actually types", () => {
  assert.equal(normalizeAnchorId("menu"), "menu");
  assert.equal(normalizeAnchorId("Our Menu"), "our-menu");
  assert.equal(normalizeAnchorId("  Our  Menu!  "), "our-menu");
  assert.equal(normalizeAnchorId("Reservas y Menú"), "reservas-y-men");
  assert.equal(normalizeAnchorId("book_now"), "book-now");
  assert.equal(normalizeAnchorId("a---b"), "a-b");
});

test("a value with nothing usable in it carries NO anchor", () => {
  // undefined (not "" and not a stray id) is what keeps a node without an
  // anchor byte-identical to before this change.
  for (const junk of ["", "   ", "!!!", "---", "！", 42, null, undefined, {}, []]) {
    assert.equal(normalizeAnchorId(junk), undefined, `junk: ${String(junk)}`);
  }
});

test("a digit-leading anchor is prefixed, because querySelector THROWS on one", () => {
  // Not cosmetic: `document.querySelector("#2fast")` raises a
  // SyntaxError rather than returning null, so anything scanning for the
  // target dies instead of simply not finding it. That reads to an operator
  // as "the page is broken", not "that anchor is wrong".
  assert.equal(normalizeAnchorId("2 fast"), "n-2-fast");
  assert.equal(normalizeAnchorId("123"), "n-123");
  // Only a LEADING digit is a problem.
  assert.equal(normalizeAnchorId("level2"), "level2");
});

test("the normalized anchor is always a valid CSS identifier", () => {
  // The whole point is that `href="#x"` resolves, so every output must survive
  // being put in a selector. Guards the slug rules as a SHAPE rather than
  // pinning specific strings, so a future rule change cannot quietly ship an
  // id that throws.
  const inputs = ["Our Menu!", "2 fast", "a".repeat(200), "Ñoño & Co", "--x--"];
  for (const input of inputs) {
    const out = normalizeAnchorId(input);
    if (out === undefined) continue;
    assert.match(out, /^[a-z][a-z0-9-]*$/, `not a safe identifier: ${out}`);
    assert.ok(out.length <= 66, `too long: ${out.length}`);
    assert.doesNotThrow(
      () => new RegExp(`^${out}$`),
      `unsafe in a pattern: ${out}`,
    );
  }
});

test("anchorIdAttrs reads props first-class, not just the base mirror", () => {
  // props is the patch landing zone: a freshly-patched value exists ONLY there
  // until the next validate pass. If the renderer read the base alone, an
  // operator would type an anchor, see nothing change, and reasonably conclude
  // the feature does not work.
  assert.deepEqual(anchorIdAttrs({ anchorId: "menu" }), { id: "menu" });
  assert.deepEqual(anchorIdAttrs({ props: { anchorId: "Our Menu" } }), {
    id: "our-menu",
  });
  assert.deepEqual(anchorIdAttrs({}), {});
  assert.deepEqual(anchorIdAttrs({ props: { anchorId: "  " } }), {});
});

test("a node with no anchor emits NO id key at all", () => {
  // `{}` and not `{ id: undefined }`. Spreading the latter still adds the
  // attribute in some renderers, which would change the output of every
  // existing tree on the site.
  assert.deepEqual(Object.keys(anchorIdAttrs({})), []);
});

test("anchorId survives a validate round-trip on props AND base", () => {
  // validateBuilderNodeTree rebuilds each node as { id, kind, props, children }
  // and strips any prop a per-kind schema does not declare. Without the carrier
  // entry the anchor would vanish on the next reload — silently, and only for
  // operators who had already saved one.
  const tree: BuilderNode[] = [
    {
      id: "n1",
      kind: "container",
      // props IS the runtime patch landing zone — `onPatchBuilderNodeProps`
      // takes a Record<string, unknown>, so the inspector writes anchorId here
      // at runtime. The per-kind props union does not declare it (that is what
      // BuilderNodeBase is for), so the cast models reality rather than hiding
      // a type error.
      props: { layout: "stack", anchorId: "Our Menu" },
      children: [],
      // The cast is on the NODE, not on props: casting props alone widens it to
      // the whole union, which then no longer narrows against kind:"container".
    } as unknown as BuilderNode,
  ];
  const result = validateBuilderNodeTree(tree);
  assert.equal(result.ok, true, "tree should validate");
  if (!result.ok) return;

  const node = result.tree[0] as BuilderNode & { anchorId?: string };
  assert.equal(node.anchorId, "our-menu", "base mirror carries the anchor");
  assert.equal(
    (node.props as Record<string, unknown>).anchorId,
    "our-menu",
    "props stays the source of truth",
  );
});

test("clearing an anchor removes it from BOTH props and base", () => {
  const tree: BuilderNode[] = [
    {
      id: "n1",
      kind: "container",
      props: { layout: "stack", anchorId: "   " },
      children: [],
    } as unknown as BuilderNode,
  ];
  const result = validateBuilderNodeTree(tree);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const node = result.tree[0] as BuilderNode & { anchorId?: string };
  assert.equal(node.anchorId, undefined);
  assert.equal("anchorId" in (node.props as Record<string, unknown>), false);
});
