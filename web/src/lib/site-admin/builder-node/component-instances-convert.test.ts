import { test } from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "./types";
import {
  tagAsInstance,
  wrapNodeAsInstanceRoot,
  canConvertNodeToComponent,
} from "./component-instances";

function container(id: string, children: BuilderNode[] = []): BuilderNode {
  return {
    id,
    kind: "container",
    props: { layout: "stack" },
    children,
  } as BuilderNode;
}

test("wrapNodeAsInstanceRoot leaves container/card unchanged", () => {
  const root = container("c1");
  assert.equal(wrapNodeAsInstanceRoot(root, "wrap"), root);
});

test("wrapNodeAsInstanceRoot wraps a heading in a stack container", () => {
  const heading: BuilderNode = {
    id: "h1",
    kind: "heading",
    props: { text: "Hello", level: 2 },
  };
  const wrapped = wrapNodeAsInstanceRoot(heading, "wrap-1");
  assert.equal(wrapped.id, "wrap-1");
  assert.equal(wrapped.kind, "container");
  assert.deepEqual(
    (wrapped as BuilderNode & { children: BuilderNode[] }).children,
    [heading],
  );
  const tagged = tagAsInstance(wrapped, "cmp-9");
  assert.equal((tagged.props as { instanceOf?: string }).instanceOf, "cmp-9");
});

test("canConvertNodeToComponent rejects section, locked, and role-bound nodes", () => {
  assert.equal(
    canConvertNodeToComponent({
      id: "sec",
      kind: "section",
      props: { sectionTypeKey: "custom" },
      children: [],
    } as BuilderNode).ok,
    false,
  );
  assert.equal(
    canConvertNodeToComponent({
      ...container("c-lock"),
      locked: true,
    }).ok,
    false,
  );
  assert.equal(
    canConvertNodeToComponent({
      id: "x:heading:headline",
      kind: "heading",
      props: { text: "Role", level: 2 },
    }).ok,
    false,
  );
  assert.equal(canConvertNodeToComponent(container("ok")).ok, true);
});
