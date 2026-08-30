import assert from "node:assert/strict";
import { test } from "node:test";

import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

import {
  applySignupCopyFields,
  extractSignupCopyFields,
  parseSignupCopyReplacements,
  sanitizeSignupCopy,
} from "./signup-copy-adapt";

function heading(id: string, text: string): BuilderNode {
  return {
    id,
    kind: "heading",
    props: { text, level: 1 },
  };
}

test("extract walks copy keys, skips placeholders, quotes, and short chrome", () => {
  const tree: BuilderNodeTree = [
    heading("h1", "Come dine with us tonight"),
    {
      id: "cta",
      kind: "button",
      props: { label: "Book", href: "/book" },
    },
    heading("hero", "Hello {{business.name}}"),
  ];
  const withQuote = [
    ...tree,
    {
      id: "review",
      kind: "container",
      props: {
        layout: "stack",
        quote: "The best meal of my life, truly unforgettable.",
      },
      children: [],
    },
  ] as unknown as BuilderNodeTree;
  const fields = extractSignupCopyFields(withQuote);
  assert.equal(fields.length, 1);
  assert.equal(fields[0]!.text, "Come dine with us tonight");
});

test("sanitize strips template braces and house-forbidden dashes", () => {
  const em = "A warm room\u2014open late";
  const en = "Hours 12\u201310";
  assert.equal(sanitizeSignupCopy(em), "A warm room - open late");
  assert.equal(sanitizeSignupCopy(en), "Hours 12 - 10");
  assert.equal(sanitizeSignupCopy("  {{secret}}  "), "secret");
  assert.equal(sanitizeSignupCopy("   "), null);
});

test("parseSignupCopyReplacements reads the replacements object and drops junk", () => {
  const parsed = parseSignupCopyReplacements(
    '```json\n{"replacements":{"a":"Hello there everyone","b":"","c":12}}\n```',
  );
  assert.equal(parsed.get("a"), "Hello there everyone");
  assert.equal(parsed.has("b"), false);
  assert.equal(parsed.has("c"), false);
  assert.equal(parseSignupCopyReplacements("not json").size, 0);
});

test("apply rewrites matching copy and leaves the original tree on a miss", () => {
  const tree: BuilderNodeTree = [heading("h1", "Come dine with us tonight")];
  const fields = extractSignupCopyFields(tree);
  const miss = applySignupCopyFields(tree, fields, new Map([["nope", "Other"]]));
  assert.equal(miss, tree);

  const hit = applySignupCopyFields(
    tree,
    fields,
    new Map([[fields[0]!.id, "Casa Muna is open for dinner"]]),
  );
  assert.notEqual(hit, tree);
  const headingNode = hit[0];
  assert.ok(headingNode && headingNode.kind === "heading");
  assert.equal(headingNode.props.text, "Casa Muna is open for dinner");
});
