import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildGenerationSystemPrompt,
  coerceToSections,
  generateBuilderNodes,
  parseModelJson,
  GENERATION_PROMPT_IMAGE_ROLES,
  GENERATION_PROMPT_KINDS,
} from "./generate-nodes";
import {
  GENERATION_ALLOWED_KINDS,
  GENERATION_ICON_NAMES,
  IMAGE_ROLE_TO_PHOTO,
} from "./generation-allowed-kinds";
import { BUILDER_NODE_REGISTRY } from "@/lib/site-admin/builder-node/registry";
import { BUILDER_ICON_NAMES } from "@/lib/site-admin/builder-node/icon-registry";
import { PAGE_DESIGN_PHOTOS } from "@/lib/site-admin/builder-node/page-designs/photos";
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

const PHOTO_VALUES = new Set<string>(Object.values(PAGE_DESIGN_PHOTOS));

function collectNodes(tree: BuilderNodeTree): BuilderNode[] {
  const out: BuilderNode[] = [];
  const walk = (node: BuilderNode) => {
    out.push(node);
    const children = (node as { children?: BuilderNode[] }).children;
    if (Array.isArray(children)) children.forEach(walk);
  };
  tree.forEach(walk);
  return out;
}

function stubModel(payload: unknown) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  return async () => text;
}

// ── Drift: the prompt vocabulary must match the real registry ──────────────

test("every generation kind is a real BUILDER_NODE_REGISTRY kind", () => {
  for (const kind of GENERATION_ALLOWED_KINDS) {
    assert.ok(kind in BUILDER_NODE_REGISTRY, `unknown kind in generation set: ${kind}`);
  }
  // The prompt grammar names exactly the allowed kinds.
  assert.deepEqual([...GENERATION_PROMPT_KINDS].sort(), [...GENERATION_ALLOWED_KINDS].sort());
});

test("prompt grammar text names every allowed kind and image role", () => {
  const prompt = buildGenerationSystemPrompt();
  for (const kind of GENERATION_ALLOWED_KINDS) {
    assert.ok(prompt.includes(`"kind":"${kind}"`) || prompt.includes(`- ${kind}`), `prompt omits ${kind}`);
  }
  for (const role of GENERATION_PROMPT_IMAGE_ROLES) {
    assert.ok(prompt.includes(`"${role}"`), `prompt omits image role ${role}`);
  }
});

test("image roles all resolve to a real curated photo", () => {
  for (const role of GENERATION_PROMPT_IMAGE_ROLES) {
    const src = IMAGE_ROLE_TO_PHOTO[role as keyof typeof IMAGE_ROLE_TO_PHOTO];
    assert.ok(PHOTO_VALUES.has(src), `image role ${role} maps to a non-curated src`);
  }
});

test("generation icon names are all valid registry icons", () => {
  for (const name of GENERATION_ICON_NAMES) {
    assert.ok((BUILDER_ICON_NAMES as ReadonlyArray<string>).includes(name));
  }
});

// ── Pipeline: model output → validated, editable tree ──────────────────────

const HERO_AND_SERVICES = {
  sections: [
    {
      kind: "section",
      label: "Hero",
      children: [
        {
          kind: "container",
          props: { layout: "stack", gap: "m", align: "center", style: { paddingY: "l" } },
          children: [
            { kind: "heading", props: { text: "Faces that move culture", level: 1, style: { size: "display" } } },
            { kind: "paragraph", props: { text: "A boutique roster booked by brands setting the pace." } },
            { kind: "cta_group", props: { align: "center" }, children: [{ kind: "button", props: { label: "Book a model", href: "/inquire", tone: "primary" } }] },
            { kind: "image", props: { role: "hero", alt: "Runway" } },
          ],
        },
      ],
    },
    {
      kind: "section",
      label: "Services",
      children: [
        { kind: "heading", props: { text: "What we do", level: 2 } },
        {
          kind: "container",
          props: { layout: "grid", columns: 3, gap: "m" },
          children: [
            { kind: "card", props: { variant: "elevated" }, children: [{ kind: "heading", props: { text: "Editorial", level: 3 } }, { kind: "paragraph", props: { text: "Campaign casting." } }] },
            { kind: "card", props: { variant: "elevated" }, children: [{ kind: "heading", props: { text: "Runway", level: 3 } }, { kind: "paragraph", props: { text: "Show bookings." } }] },
            { kind: "card", props: { variant: "elevated" }, children: [{ kind: "heading", props: { text: "Commercial", level: 3 } }, { kind: "paragraph", props: { text: "Brand work." } }] },
          ],
        },
      ],
    },
  ],
};

test("generateBuilderNodes turns model output into a valid, editable page tree", async () => {
  const result = await generateBuilderNodes({
    brief: "a homepage for a boutique modeling agency",
    scope: "page",
    generateWithModel: stubModel(HERO_AND_SERVICES),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  // The returned tree passes the SAME gate the gallery-insert path uses.
  const validation = validateBuilderNodeTree(result.tree);
  assert.equal(validation.ok, true);

  const nodes = collectNodes(result.tree);
  // Roots are all sections.
  for (const root of result.tree) assert.equal(root.kind, "section");
  // Every node has a fresh, unique, builder-prefixed id.
  const ids = new Set<string>();
  for (const node of nodes) {
    assert.match(node.id, /^builder-/);
    assert.ok(!ids.has(node.id), `duplicate id ${node.id}`);
    ids.add(node.id);
    assert.ok(node.kind in BUILDER_NODE_REGISTRY);
  }
  // Every image points at a curated photo, never a model-supplied URL.
  for (const node of nodes) {
    if (node.kind === "image") {
      assert.ok(PHOTO_VALUES.has((node.props as { src: string }).src));
    }
  }
});

test("section scope yields exactly one section", async () => {
  const result = await generateBuilderNodes({
    brief: "a services section with three cards",
    scope: "section",
    generateWithModel: stubModel({ sections: [HERO_AND_SERVICES.sections[1]] }),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.tree.length, 1);
  assert.equal(result.tree[0]!.kind, "section");
});

// ── Hostile input: coerce must repair or drop, never corrupt ───────────────

test("coerce hardens hostile model output into a valid tree", () => {
  const hostile = {
    sections: [
      {
        kind: "section",
        children: [
          // unknown kind → dropped
          { kind: "hero_banner", props: { text: "nope" } },
          // heading missing text → dropped
          { kind: "heading", props: { level: 2 } },
          // valid heading with an oversized text → clamped
          { kind: "heading", props: { text: "x".repeat(9000), level: 2 } },
          // image with a hostile URL + a role → URL discarded, curated photo used
          { kind: "image", props: { src: "https://evil.example.com/track.png", role: "portrait" } },
          // hallucinated icon → mapped to a safe default
          { kind: "icon", props: { icon: "definitely_not_an_icon" } },
          // stack container with columns > 1 (invalid superRefine) → columns dropped
          { kind: "container", props: { layout: "stack", columns: 4 }, children: [{ kind: "paragraph", props: { text: "ok" } }] },
          // button missing label/href → filled with safe defaults
          { kind: "button", props: {} },
        ],
      },
    ],
  };

  const coerced = coerceToSections(hostile);
  const validation = validateBuilderNodeTree(coerced);
  assert.equal(validation.ok, true, "coerced tree must validate");
  assert.ok(validation.tree.length >= 1, "the section must survive, not be dropped whole");

  const nodes = collectNodes(validation.tree);
  // The good nodes survived (heading, image, icon, container, button) — not a vacuous empty tree.
  assert.ok(nodes.length >= 5, `expected real content to survive, got ${nodes.length} nodes`);
  const kinds = nodes.map((n) => n.kind);
  assert.ok(!kinds.includes("hero_banner" as never), "unknown kind survived");

  // No image carries the hostile URL.
  for (const node of nodes) {
    if (node.kind === "image") {
      assert.ok(PHOTO_VALUES.has((node.props as { src: string }).src));
    }
    if (node.kind === "heading") {
      assert.ok((node.props as { text: string }).text.length <= 240);
    }
    if (node.kind === "icon") {
      assert.ok((BUILDER_ICON_NAMES as ReadonlyArray<string>).includes((node.props as { icon: string }).icon));
    }
    if (node.kind === "container") {
      const props = node.props as { layout: string; columns?: number };
      if (props.layout !== "grid") assert.equal(props.columns, undefined);
    }
    if (node.kind === "button") {
      const props = node.props as { label: string; href: string };
      assert.ok(props.label.length > 0 && props.href.length > 0);
    }
  }
});

test("empty model output resolves to EMPTY (caller falls back)", async () => {
  const result = await generateBuilderNodes({
    brief: "a homepage",
    scope: "page",
    generateWithModel: async () => null,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "EMPTY");
});

test("too-short brief is rejected before any model call", async () => {
  let called = false;
  const result = await generateBuilderNodes({
    brief: "ab",
    scope: "page",
    generateWithModel: async () => {
      called = true;
      return "{}";
    },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "BRIEF_TOO_SHORT");
  assert.equal(called, false);
});

test("parseModelJson strips code fences and stray prose", () => {
  assert.deepEqual(parseModelJson('```json\n{"sections":[]}\n```'), { sections: [] });
  assert.deepEqual(parseModelJson('Sure! Here you go: {"sections":[]} — enjoy'), { sections: [] });
  assert.equal(parseModelJson("not json at all"), null);
  assert.equal(parseModelJson(null), null);
});
