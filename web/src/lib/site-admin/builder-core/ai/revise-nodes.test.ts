import { test } from "node:test";
import assert from "node:assert/strict";

import { reviseBuilderNodes } from "./revise-nodes";
import type { ModelGenerateFn } from "./generate-nodes";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

/** A stub model that returns a fixed payload and optionally captures the prompt. */
function stub(payload: unknown, capture?: (userMessage: string) => void): ModelGenerateFn {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  return async ({ userMessage }) => {
    capture?.(userMessage);
    return { text, reason: "ok" };
  };
}

const node = (v: unknown): BuilderNode => v as unknown as BuilderNode;

const SECTION_INPUT = node({
  id: "sec1",
  kind: "section",
  props: { sectionTypeKey: "freeform-section", label: "Hero" },
  children: [{ id: "h", kind: "heading", props: { text: "Old headline", level: 2 } }],
});

const CARD_INPUT = node({
  id: "card1",
  kind: "card",
  props: { variant: "elevated" },
  children: [{ id: "h", kind: "heading", props: { text: "Card title", level: 3 } }],
});

test("revising a SECTION returns a section-kind candidate", async () => {
  const model = stub({
    sections: [
      { kind: "section", label: "Hero", children: [{ kind: "heading", props: { text: "Bolder headline", level: 2 } }] },
    ],
  });
  const res = await reviseBuilderNodes({ node: SECTION_INPUT, instruction: "make the headline bolder", generateWithModel: model });
  assert.ok(res.ok, "revise succeeded");
  if (res.ok) assert.equal(res.node.kind, "section", "section in → section out");
});

test("revising a NON-section block unwraps the synthetic section back to that kind", async () => {
  // The model returns a section WRAPPING the revised card (the reuse of
  // coerceToSections always wraps); the composer must unwrap to the card.
  const model = stub({
    sections: [
      {
        kind: "section",
        children: [
          { kind: "card", props: { variant: "outline" }, children: [{ kind: "heading", props: { text: "Better title", level: 3 } }] },
        ],
      },
    ],
  });
  const res = await reviseBuilderNodes({ node: CARD_INPUT, instruction: "outline variant, better title", generateWithModel: model });
  assert.ok(res.ok);
  if (res.ok) {
    assert.equal(res.node.kind, "card", "card in → card out (not a section wrapper)");
    const kids = (res.node as { children?: BuilderNode[] }).children ?? [];
    assert.equal(kids[0]?.kind, "heading");
  }
});

test("existing photos are carried over by ordinal (copy edits don't swap images)", async () => {
  const ORIGINAL_SRC = "https://original.example/portrait.jpg";
  const withImage = node({
    id: "c1",
    kind: "container",
    props: { layout: "stack" },
    children: [{ id: "img1", kind: "image", props: { src: ORIGINAL_SRC, style: { aspectRatio: "3:4", objectFit: "cover" } } }],
  });
  const model = stub({
    sections: [
      {
        kind: "section",
        children: [
          {
            kind: "container",
            props: { layout: "stack" },
            children: [
              { kind: "image", props: { role: "portrait", alt: "A portrait" } },
              { kind: "heading", props: { text: "New caption", level: 3 } },
            ],
          },
        ],
      },
    ],
  });
  const res = await reviseBuilderNodes({ node: withImage, instruction: "add a caption under the photo", generateWithModel: model });
  assert.ok(res.ok);
  if (res.ok) {
    assert.equal(res.node.kind, "container");
    const kids = (res.node as { children?: BuilderNode[] }).children ?? [];
    const img = kids.find((k) => k.kind === "image") as { props?: { src?: string } } | undefined;
    assert.equal(img?.props?.src, ORIGINAL_SRC, "original photo preserved, not swapped for a placeholder");
  }
});

test("the existing block content + the change are both in the prompt", async () => {
  let captured = "";
  const model = stub(
    { sections: [{ kind: "section", children: [{ kind: "heading", props: { text: "x", level: 2 } }] }] },
    (m) => {
      captured = m;
    },
  );
  await reviseBuilderNodes({ node: SECTION_INPUT, instruction: "shorten it", generateWithModel: model });
  assert.ok(captured.includes("Old headline"), "the block's current copy is serialized into the prompt");
  assert.ok(captured.includes("CHANGE REQUESTED: shorten it"), "the change request is in the prompt");
});

test("too-short instruction is rejected before any model call", async () => {
  let called = false;
  const model: ModelGenerateFn = async () => {
    called = true;
    return { text: "{}", reason: "ok" };
  };
  const res = await reviseBuilderNodes({ node: SECTION_INPUT, instruction: " ", generateWithModel: model });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, "INSTRUCTION_TOO_SHORT");
  assert.equal(called, false, "no model call for an empty instruction");
});

test("an unreadable node is rejected", async () => {
  const res = await reviseBuilderNodes({ node: node({}), instruction: "do something", generateWithModel: stub({}) });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, "UNREADABLE_NODE");
});

test("a failed first attempt retries and can still succeed", async () => {
  let calls = 0;
  const model: ModelGenerateFn = async () => {
    calls += 1;
    return calls === 1
      ? { text: null, reason: "empty" }
      : { text: JSON.stringify({ sections: [{ kind: "section", children: [{ kind: "heading", props: { text: "ok", level: 2 } }] }] }), reason: "ok" };
  };
  const res = await reviseBuilderNodes({ node: SECTION_INPUT, instruction: "try again please", generateWithModel: model });
  assert.equal(calls, 2, "retried once");
  assert.ok(res.ok);
});
