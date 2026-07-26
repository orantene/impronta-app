import assert from "node:assert/strict";
import test from "node:test";

import { createBuilderNode } from "./create";
import { BUILDER_NODE_REGISTRY } from "./registry";

// REGRESSION: the schema required z.string().url() while createBuilderNode
// seeds an empty url. Every insert was created, rejected by validation, and
// dropped SILENTLY — the block could not be added to a page at all. Unit tests
// passed because none of them ran the insert → validate path.
test("a freshly created social_post node passes its own schema", () => {
  const node = createBuilderNode("social_post");
  assert.equal(node.kind, "social_post");
  const parsed = BUILDER_NODE_REGISTRY.social_post.propsSchema.safeParse(
    node.props,
  );
  assert.equal(
    parsed.success,
    true,
    `seeded node must validate, got: ${JSON.stringify(parsed.error?.issues ?? [])}`,
  );
});

test("every seeded node kind passes its own schema", () => {
  // Generalized so the next kind to grow a stricter schema cannot regress the
  // same way this one did.
  for (const kind of Object.keys(BUILDER_NODE_REGISTRY) as Array<
    keyof typeof BUILDER_NODE_REGISTRY
  >) {
    let node;
    try {
      node = createBuilderNode(kind);
    } catch {
      continue; // kinds with no factory are covered elsewhere
    }
    const res = BUILDER_NODE_REGISTRY[kind].propsSchema.safeParse(node.props);
    assert.equal(
      res.success,
      true,
      `${kind}: seeded props must satisfy its schema — ${JSON.stringify(
        res.error?.issues ?? [],
      )}`,
    );
  }
});

test("a non-empty social_post url must still be an allow-listed post", () => {
  const schema = BUILDER_NODE_REGISTRY.social_post.propsSchema;
  assert.equal(
    schema.safeParse({ provider: "instagram", url: "https://evil.test/p/x" })
      .success,
    false,
  );
  assert.equal(
    schema.safeParse({
      provider: "instagram",
      url: "https://www.instagram.com/p/CabcD_12-xy/",
    }).success,
    true,
  );
});
