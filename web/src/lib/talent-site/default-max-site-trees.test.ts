import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDefaultShellTree,
  buildStarterHomePageTree,
} from "./default-max-site-trees";
import { hasRenderableBuilderNodes } from "@/lib/site-admin/builder-node/render";
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import { siteHeaderSchemaV1 } from "@/lib/site-admin/sections/site_header/schema";

// Deterministic id factory so tests can assert structure without UUID noise.
function seqIds(): () => string {
  let n = 0;
  return () => `node-${(n += 1)}`;
}

function headerConfig(input: Parameters<typeof buildDefaultShellTree>[0]) {
  const tree = buildDefaultShellTree(input, seqIds());
  return (tree[0].props as { sectionProps?: Record<string, unknown> })
    .sectionProps as Record<string, unknown>;
}

test("default shell tree has a site_header landmark and a footer", () => {
  const tree = buildDefaultShellTree({ displayName: "Morena" }, seqIds());
  assert.equal(tree.length, 2);
  const [header, footer] = tree;
  // Part B — the premium header is a self-contained site_header landmark.
  assert.equal(header.kind, "section");
  assert.equal(
    (header.props as { sectionTypeKey?: string }).sectionTypeKey,
    "site_header",
  );
  assert.equal(footer.kind, "container");
});

test("default shell header carries the talent brand + logo in its config", () => {
  const cfg = headerConfig({
    displayName: "Morena",
    logoUrl: "https://cdn.example/logo.png",
  });
  const brand = cfg.brand as { label?: string; logoUrl?: string };
  assert.equal(brand.label, "Morena");
  assert.equal(brand.logoUrl, "https://cdn.example/logo.png");
  assert.equal(cfg.brandDisplay, "image-and-text");
});

test("default shell header is talent-scoped (explicit brand → agency reads skipped)", () => {
  // The wordmark/logo are passed explicitly so the agency-tenant-scoped
  // identity resolvers short-circuit — a talent header never shows the
  // managing agency's brand. Transparent over the hero, solid on scroll.
  for (const input of [
    { displayName: "Morena" },
    { displayName: "Morena", logoUrl: "https://cdn.example/logo.png" },
  ]) {
    const cfg = headerConfig(input);
    assert.equal((cfg.brand as { label?: string }).label, "Morena");
    assert.equal(cfg.tone, "transparent");
    assert.equal(cfg.scrollTone, "solid");
  }
});

test("default shell header config is a valid SiteHeaderV1 (component will accept it)", () => {
  const parsed = siteHeaderSchemaV1.safeParse(headerConfig({ displayName: "Morena" }));
  assert.ok(
    parsed.success,
    parsed.success ? "" : JSON.stringify(parsed.error.issues),
  );
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
  assert.equal(section.kind, "container");
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

test("the starter home tree is RENDERABLE by the public site renderer (D-MSG-411)", () => {
  // `renderTalentMaxSite` answers 404 when `hasRenderableBuilderNodes` says the
  // published page is empty. A top-level `section` never renders in freeform
  // mode, so a starter built from sections produced a published site that 404'd
  // forever. Assert the app's own starter passes its own renderer.
  for (const tree of [
    buildStarterHomePageTree({ displayName: "Morena" }),
    buildStarterHomePageTree({ displayName: "Morena", tagline: "Model · Cancún" }),
  ]) {
    assert.equal(hasRenderableBuilderNodes(tree, { mode: "freeform" }), true);
    assert.equal(hasRenderableBuilderNodes(tree), true);
  }
});

test("the shell header stays a SHELL SECTION, not a page block (D-MSG-411)", () => {
  // The page-block fix must not be "finished" by flipping the header too: the
  // header is a shell slot and only renders through the shell path. Pin both
  // its kind and its slot so a bulk section-to-container sweep fails here.
  const shell = buildDefaultShellTree({ displayName: "Morena" });
  const header = shell.find(
    (node) => (node.props as { slotKey?: string } | undefined)?.slotKey === "header",
  );
  assert.ok(header, "the default shell tree must carry a header slot");
  assert.equal(header?.kind, "section");
});
