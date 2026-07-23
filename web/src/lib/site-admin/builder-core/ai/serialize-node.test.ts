import { test } from "node:test";
import assert from "node:assert/strict";

import { serializeBuilderSubtreeForRevise, builderNodeKindOf } from "./serialize-node";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

const node = (v: unknown): BuilderNode => v as unknown as BuilderNode;

test("serializer strips ids, keeps grammar props + curated style, drops unknown keys", () => {
  const s = JSON.parse(
    serializeBuilderSubtreeForRevise(
      node({ id: "abc", kind: "heading", props: { text: "Hi there", level: 3, style: { align: "center", bogus: "nope" } } }),
    ),
  );
  assert.equal(s.kind, "heading");
  assert.equal(s.id, undefined, "node id is stripped");
  assert.equal(s.props.text, "Hi there");
  assert.equal(s.props.level, 3);
  assert.equal(s.props.style.align, "center", "curated style key kept");
  assert.equal(s.props.style.bogus, undefined, "non-curated style key dropped");
});

test("serializer never leaks the resolved image src and hands back a role", () => {
  const s = JSON.parse(
    serializeBuilderSubtreeForRevise(
      node({ id: "i", kind: "image", props: { src: "https://cdn.example/p.jpg", alt: "Model", style: { aspectRatio: "3:4" } } }),
    ),
  );
  assert.equal(s.props.src, undefined, "resolved src is never serialized");
  assert.equal(s.props.role, "portrait", "role inferred from the 3:4 aspect ratio");
  assert.equal(s.props.alt, "Model");
});

test("serializer recurses children and preserves structure", () => {
  const s = JSON.parse(
    serializeBuilderSubtreeForRevise(
      node({
        id: "c",
        kind: "container",
        props: { layout: "grid", columns: 3 },
        children: [
          { id: "a", kind: "card", props: { variant: "elevated" }, children: [{ id: "h", kind: "heading", props: { text: "One", level: 3 } }] },
        ],
      }),
    ),
  );
  assert.equal(s.props.layout, "grid");
  assert.equal(s.props.columns, 3);
  assert.equal(s.children[0].kind, "card");
  assert.equal(s.children[0].children[0].props.text, "One");
});

test("builderNodeKindOf returns the kind or null", () => {
  assert.equal(builderNodeKindOf(node({ kind: "paragraph" })), "paragraph");
  assert.equal(builderNodeKindOf(node({})), null);
});
