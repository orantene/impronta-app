import assert from "node:assert/strict";
import test from "node:test";

import { collectSocialFeedProviders } from "./social-feed-source";
import type { BuilderNode } from "./types";

function node(kind: string, props: Record<string, unknown>, children?: BuilderNode[]): BuilderNode {
  return { id: `${kind}-${Math.random()}`, kind, props, ...(children ? { children } : {}) } as unknown as BuilderNode;
}

test("returns nothing for a tree without connected feeds", () => {
  assert.deepEqual(
    collectSocialFeedProviders([
      node("text", {}),
      node("social_feed", { source: "manual", provider: "instagram", items: [] }),
    ]),
    [],
  );
});

test("finds a connected feed at any depth and defaults the provider to instagram", () => {
  const tree = [
    node("section", {}, [
      node("row", {}, [node("social_feed", { source: "connected", items: [] })]),
    ]),
  ];
  assert.deepEqual(collectSocialFeedProviders(tree), ["instagram"]);
});

test("a mixed block needs both vendors; duplicates collapse", () => {
  const tree = [
    node("social_feed", { source: "connected", provider: "mixed", items: [] }),
    node("social_feed", { source: "connected", provider: "tiktok", items: [] }),
  ];
  assert.deepEqual(collectSocialFeedProviders(tree).sort(), ["instagram", "tiktok"]);
});
