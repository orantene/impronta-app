import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDefaultShellTree,
  buildStarterHomePageTree,
} from "./default-max-site-trees";
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";

// Deterministic id factory so tests can assert structure without UUID noise.
function seqIds(): () => string {
  let n = 0;
  return () => `node-${(n += 1)}`;
}

test("default shell tree has a header (logo + nav) and a footer", () => {
  const tree = buildDefaultShellTree(
    { displayName: "Morena" },
    seqIds(),
  );
  assert.equal(tree.length, 2);
  const [header, footer] = tree;
  assert.equal(header.kind, "container");
  assert.equal(footer.kind, "container");
  const headerChildren = (header as { children: { kind: string }[] }).children;
  // No logo URL → wordmark heading + nav.
  assert.deepEqual(
    headerChildren.map((c) => c.kind),
    ["heading", "nav"],
  );
});

test("default shell tree uses an image logo when logoUrl is provided", () => {
  const tree = buildDefaultShellTree(
    { displayName: "Morena", logoUrl: "https://cdn.example/logo.png" },
    seqIds(),
  );
  const headerChildren = (tree[0] as { children: { kind: string }[] }).children;
  assert.equal(headerChildren[0].kind, "image");
});

test("default shell renders the brand ONCE — nav carries no duplicate brand", () => {
  // FIX B — the header logo/wordmark is the single brand. The nav node must NOT
  // also carry a `brand`/`brandHref` (the nav renderer would paint it a second
  // time beside the logo).
  for (const input of [
    { displayName: "Morena" },
    { displayName: "Morena", logoUrl: "https://cdn.example/logo.png" },
  ]) {
    const tree = buildDefaultShellTree(input, seqIds());
    const headerChildren = (tree[0] as {
      children: { kind: string; props: Record<string, unknown> }[];
    }).children;

    const navNode = headerChildren.find((c) => c.kind === "nav");
    assert.ok(navNode, "header should still contain a nav node");
    assert.equal(
      navNode!.props.brand,
      undefined,
      "nav must NOT carry a brand (the header logo is the sole brand)",
    );
    assert.equal(navNode!.props.brandHref, undefined, "nav must carry no brandHref");

    // Exactly ONE brand-bearing node in the header: the logo image OR the
    // wordmark heading — never both, and never a nav brand on top.
    const brandNodes = headerChildren.filter(
      (c) => c.kind === "image" || c.kind === "heading",
    );
    assert.equal(brandNodes.length, 1, "exactly one brand node in the header");
  }
});

test("default shell tree validates through the builder-node validator", () => {
  const tree = buildDefaultShellTree({
    displayName: "Morena",
    logoUrl: "https://cdn.example/logo.png",
  });
  const result = validateBuilderNodeTree(tree);
  assert.ok(result.ok, result.ok ? "" : JSON.stringify(result.issues));
  assert.equal(result.tree.length, 2);
});

test("starter home page tree has a hero heading (and tagline when given)", () => {
  const withTagline = buildStarterHomePageTree(
    { displayName: "Morena", tagline: "Model · Cancún" },
    seqIds(),
  );
  assert.equal(withTagline.length, 1);
  const section = withTagline[0] as { kind: string; children: { kind: string }[] };
  assert.equal(section.kind, "section");
  assert.deepEqual(
    section.children.map((c) => c.kind),
    ["heading", "paragraph"],
  );

  const noTagline = buildStarterHomePageTree({ displayName: "Morena" }, seqIds());
  const sectionNoTag = noTagline[0] as { children: { kind: string }[] };
  assert.deepEqual(
    sectionNoTag.children.map((c) => c.kind),
    ["heading"],
  );
});

test("starter home page tree validates through the builder-node validator", () => {
  const tree = buildStarterHomePageTree({
    displayName: "Morena",
    tagline: "Model · Cancún",
  });
  const result = validateBuilderNodeTree(tree);
  assert.ok(result.ok, result.ok ? "" : JSON.stringify(result.issues));
  assert.equal(result.tree.length, 1);
});

test("trees use unique ids", () => {
  const tree = buildDefaultShellTree({ displayName: "Morena" });
  const ids: string[] = [];
  const walk = (nodes: { id: string; children?: unknown[] }[]) => {
    for (const n of nodes) {
      ids.push(n.id);
      if (Array.isArray(n.children)) {
        walk(n.children as { id: string; children?: unknown[] }[]);
      }
    }
  };
  walk(tree as { id: string; children?: unknown[] }[]);
  assert.equal(new Set(ids).size, ids.length);
});
