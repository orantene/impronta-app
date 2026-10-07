import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { createBuilderNode } from "@/lib/site-admin/builder-node/create";
import { BUILDER_NODE_REGISTRY } from "@/lib/site-admin/builder-node/registry";
import { BUILDER_2027_INSPECTOR_GROUPS } from "@/lib/site-admin/builder-node/builder-2027-fields";

const itemsOf = (n: BuilderNode) => (n.props as { items: Array<{ text: string }> }).items.map((i) => i.text);

test("schema: source is optional and additive; new tickers and the Maison v2 ticker default to services", () => {
  const schema = BUILDER_NODE_REGISTRY.marquee.propsSchema;
  assert.equal(schema.safeParse({ items: [{ text: "a" }, { text: "b" }] }).success, true);
  assert.equal(schema.safeParse({ source: "services" }).success, true);
  assert.equal(schema.safeParse({ source: "custom" }).success, true);
  assert.equal(schema.safeParse({ source: "rss" }).success, false);
  const created = createBuilderNode("marquee");
  assert.equal((created.props as { source?: string }).source, "services");
  assert.ok(((created.props as { items?: unknown[] }).items ?? []).length >= 2, "keeps fallback words");
});

test("the Maison v2 ticker seeds with the services source and keeps its token words as the fallback", async () => {
  const { buildMaisonV2Payload } = await import("./theme-catalog/collection/maison-v2");
  const find = (nodes: BuilderNode[]): BuilderNode | undefined => {
    for (const n of nodes) {
      if (n.kind === "marquee") return n;
      const hit = find((n as { children?: BuilderNode[] }).children ?? []);
      if (hit) return hit;
    }
    return undefined;
  };
  const t = find(buildMaisonV2Payload().homeTree)!;
  assert.equal((t.props as { source?: string }).source, "services");
  assert.deepEqual(itemsOf(t), ["{{service1}}", "{{service2}}", "{{service3}}"]);
});

test("inspector: the Words group comes first, offers the two sources, and defaults to custom when unset", () => {
  const first = BUILDER_2027_INSPECTOR_GROUPS.marquee[0]!;
  assert.equal(first.title, "Words");
  const field = first.fields[0]!;
  assert.equal(field.control, "select");
  if (field.control !== "select") return;
  assert.equal(field.prop, "source");
  assert.equal(field.fallback, "custom");
  assert.deepEqual(field.options.map((o) => o.value), ["services", "custom"]);
  for (const text of [field.label, first.note ?? "", ...field.options.map((o) => o.label)]) {
    assert.ok(!/[–—]/.test(text), `no dashes in: ${text}`);
  }
});
