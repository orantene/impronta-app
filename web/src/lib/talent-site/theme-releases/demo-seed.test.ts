import assert from "node:assert/strict";
import test from "node:test";

import { seedDemoBeforeAfter } from "./demo-seed";
import { beforeAfterBlock } from "../theme-catalog/section-kit-before-after";
import type { DesignPayload } from "../theme-catalog/types";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

let n = 0;
const payload = (): DesignPayload => ({ shellTree: [], homeTree: [beforeAfterBlock(() => `i${++n}`)], tokenDefaults: {} }) as unknown as DesignPayload;

function srcs(tree: BuilderNode[]): string[] {
  const out: string[] = [];
  const walk = (x: BuilderNode) => {
    if (x.kind === "image") out.push((x.props as { src: string }).src);
    for (const c of (x as { children?: BuilderNode[] }).children ?? []) walk(c);
  };
  tree.forEach(walk);
  return out;
}

test("demo seeding fills the two empty Before / After slots from the demo gallery, real sites never", () => {
  const p = payload();
  assert.deepEqual(srcs(p.homeTree), ["", ""]);
  const seeded = seedDemoBeforeAfter(p);
  assert.deepEqual(srcs(seeded.homeTree), ["{{gallery2}}", "{{gallery3}}"]);
  assert.deepEqual(srcs(p.homeTree), ["", ""], "catalog payload is never mutated");
});

test("demo seeding leaves other empty images alone and already-set photos untouched", () => {
  const img = (src: string): BuilderNode => ({ id: `x${++n}`, kind: "image", props: { src, alt: "a" } }) as BuilderNode;
  const p = { shellTree: [], homeTree: [img(""), img("https://cdn.example.com/a.jpg")], tokenDefaults: {} } as unknown as DesignPayload;
  assert.deepEqual(srcs(seedDemoBeforeAfter(p).homeTree), ["", "https://cdn.example.com/a.jpg"]);
});
