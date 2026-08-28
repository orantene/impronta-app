import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildGenerationSystemPrompt,
  buildGenerationUserMessage,
  coerceToSections,
  generateBuilderNodes,
  parseModelJson,
  GENERATION_PROMPT_IMAGE_ROLES,
  GENERATION_PROMPT_KINDS,
  type ModelGenerateFn,
} from "./generate-nodes";
import {
  GENERATION_ALLOWED_KINDS,
  GENERATION_ICON_NAMES,
  IMAGE_ROLE_TO_PHOTO,
  CURATED_STYLE_ENUM_VALUES,
  isSafeMinHeight,
} from "./generation-allowed-kinds";
import { BUILDER_NODE_REGISTRY, builderNodeStyleValueSchema } from "@/lib/site-admin/builder-node/registry";
import { scoreGeneratedTree } from "./eval-scorecard";
import { BUILDER_ICON_NAMES } from "@/lib/site-admin/builder-node/icon-registry";
import { PAGE_DESIGN_PHOTOS } from "@/lib/site-admin/builder-node/page-designs/photos";
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import { BUILDER_MAX_TREE_DEPTH } from "@/lib/site-admin/builder-node/tree-depth";
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

function stubModel(payload: unknown): ModelGenerateFn {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  return async () => ({ text, reason: "ok" });
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

test("user message names the target language (AIQ-3)", () => {
  assert.ok(buildGenerationUserMessage("page", "a modeling agency", "en").includes("in English"));
  const es = buildGenerationUserMessage("page", "una agencia", "es");
  assert.ok(es.includes("in Español"), "Spanish named");
  assert.ok(es.includes("Write ALL user-visible copy"), "explicit all-copy rule present");
  // default (no locale) → English, byte-stable
  assert.ok(buildGenerationUserMessage("page", "x").includes("in English"));
});

test("system prompt carries the Language rule + ES few-shot only for es (AIQ-3)", () => {
  const base = buildGenerationSystemPrompt();
  assert.ok(base.includes("- Language:"), "Language RULES bullet present");
  assert.ok(base.includes("in English"), "default names English");
  assert.ok(!base.includes("Reserva tu próxima campaña"), "no ES few-shot in default prompt");
  const es = buildGenerationSystemPrompt({ locale: "es" });
  assert.ok(es.includes("in Español"), "es names Spanish");
  assert.ok(es.includes("Reserva tu próxima campaña"), "ES few-shot present for es");
  // The ES few-shot COPY must not smuggle in an em/en dash (the prompt's own
  // instructional prose legitimately uses them; only the exemplar copy is bound).
  const esExample = es.slice(es.indexOf("Spanish copy"));
  assert.ok(!/[—–]/.test(esExample), "no em/en dashes in the ES few-shot copy");
});

test("color guidance reflects resolved polarity, default byte-preserved (AIQ-12)", () => {
  const unknown = buildGenerationSystemPrompt();
  assert.ok(unknown.includes("polarity is unknown to you"), "no-theme path preserves prior wording");

  const dark = buildGenerationSystemPrompt({ themePolarity: "dark", palette: { background: "#0a0a0a", ink: "#f4f4f5" } });
  assert.ok(dark.includes("polarity is DARK"), "dark polarity stated");
  assert.ok(!dark.includes("polarity is unknown"), "unknown wording removed when known");
  assert.ok(dark.includes("INVERT to light"), "dark page → suggest a light band");

  const light = buildGenerationSystemPrompt({ themePolarity: "light", palette: { background: "#ffffff", ink: "#111111" } });
  assert.ok(light.includes("polarity is LIGHT"));
  assert.ok(light.includes("INVERT to dark"));
});

test("prompt teaches a split-hero (image beside copy), not only the centered stack (AIQ-24)", () => {
  const prompt = buildGenerationSystemPrompt();
  assert.match(prompt, /alternate hero: image beside copy/i);
  assert.ok(prompt.includes('"kind":"split"'), "split-hero exemplar present");
  assert.ok(/"ratio":"(60-40|40-60|50-50|70-30|30-70)"/.test(prompt), "split-hero has a real ratio");
});

test("prompt includes the five content exemplars with brand-safe copy (AIQ-11)", () => {
  const prompt = buildGenerationSystemPrompt();
  assert.match(prompt, /a testimonial with named attribution/i);
  assert.match(prompt, /a 50-50 split/i);
  assert.match(prompt, /closing call-to-action band/i);
  assert.match(prompt, /an FAQ accordion/i);
  assert.match(prompt, /pricing copy/i);
  assert.ok(prompt.includes("Marta Alvi, Head of Casting at Nord Studio"), "named attribution, not anonymous");
  assert.ok(prompt.includes('"kind":"accordion_item"'), "FAQ exemplar uses accordion_item");
  assert.ok(prompt.includes('"kind":"pricing_table"'), "pricing exemplar uses pricing_table");
  // Guard the exemplar COPY (not the rule prose that names dashes) against dashes.
  const exemplarBlock = prompt.slice(prompt.indexOf("EXAMPLE ("));
  assert.ok(!/[—–]/.test(exemplarBlock), "exemplar copy must contain no em/en dashes");
  // Scope to exemplar copy: the brand-language RULE prose legitimately lists the
  // banned commerce words as examples of what to avoid.
  assert.ok(!/\b(add to cart|checkout|buy now|shopping cart)\b/i.test(exemplarBlock), "no commerce vocab in exemplars");
});

test("every few-shot exemplar in the prompt coerces to a valid tree (AIQ-11/24)", () => {
  const prompt = buildGenerationSystemPrompt({ locale: "es" }); // include the ES exemplar too
  const blocks = prompt.split("\n").filter((l) => l.startsWith('{"sections":'));
  assert.ok(blocks.length >= 8, `expected >=8 exemplar JSON blocks, got ${blocks.length}`);
  for (const block of blocks) {
    const tree = coerceToSections(parseModelJson(block));
    const validation = validateBuilderNodeTree(tree);
    assert.equal(validation.ok, true, `exemplar failed to validate: ${block.slice(0, 60)}`);
    assert.ok(validation.tree.length >= 1, "exemplar section survived coerce");
  }
});

test("prompt teaches WHEN to reach for the native data blocks (WS7)", () => {
  const prompt = buildGenerationSystemPrompt();
  // Grammar entries exist for both kinds.
  assert.ok(prompt.includes("- hero_search "), "hero_search grammar line present");
  assert.ok(prompt.includes("- talent_type_grid "), "talent_type_grid grammar line present");
  // The WHEN rule: a roster site leads with search + disciplines.
  assert.match(prompt, /Live agency data/);
  assert.match(prompt, /TALENT AGENCY or roster site/);
  // ...and the WHEN NOT rule is stated in the same bullet.
  assert.match(prompt, /Do NOT use them for a page that is not about a roster/);
  assert.match(prompt, /AT MOST ONCE per page/);
  // The H1 rule survives and is extended, not weakened.
  assert.match(prompt, /EXACTLY ONE heading with level:1 on the whole page/);
  assert.match(prompt, /ITS headline IS that level:1/);
  // The other hard rules are untouched.
  assert.match(prompt, /NEVER use em dashes or en dashes/);
  assert.match(prompt, /You BOOK talent, you do not buy it/);
  assert.match(prompt, /CTA labels: verb-led and specific/);
  // The few-shot exemplar exists and is roster-backed.
  assert.match(prompt, /a search hero over the real roster/i);
  assert.ok(prompt.includes('"kind":"hero_search"'), "hero_search exemplar present");
  assert.ok(prompt.includes('"kind":"talent_type_grid"'), "talent_type_grid exemplar present");
  // The exemplar must not smuggle in a level:1 heading beside the search hero.
  const exemplar = prompt.slice(prompt.indexOf('"kind":"hero_search"'));
  const nextExample = exemplar.indexOf("EXAMPLE (");
  const block = nextExample > 0 ? exemplar.slice(0, nextExample) : exemplar;
  assert.ok(!block.includes('"level":1'), "roster exemplar has no competing level:1 heading");
  // The exemplar carries no href / id props for the model to copy.
  for (const forbidden of ["searchActionHref", "selectedTermIds", "taxonomyTermId", "imageUrl", "seeAllHref"]) {
    assert.ok(!block.includes(forbidden), `roster exemplar must not model ${forbidden}`);
  }
});

test("AIQ-7: paddingY 'xl' survives schema + curated vocab; margins/paddingX stay capped", () => {
  const r = builderNodeStyleValueSchema.safeParse({ paddingY: "xl" });
  assert.ok(r.success && r.data?.paddingY === "xl", "paddingY xl valid");
  for (const v of CURATED_STYLE_ENUM_VALUES.paddingY) {
    assert.ok(builderNodeStyleValueSchema.safeParse({ paddingY: v }).success, `paddingY ${v}`);
  }
  assert.ok(CURATED_STYLE_ENUM_VALUES.paddingY.includes("xl"), "curated paddingY includes xl");
  // paddingX / margins deliberately do NOT gain xl (vertical rhythm only).
  assert.ok(!builderNodeStyleValueSchema.safeParse({ paddingX: "xl" }).success, "paddingX xl rejected");
});

test("AIQ-7: isSafeMinHeight boxes the model to a single safe length token", () => {
  assert.ok(isSafeMinHeight("78svh"));
  assert.ok(isSafeMinHeight("480px"));
  assert.ok(isSafeMinHeight("85dvh"));
  assert.ok(!isSafeMinHeight("calc(100vh - 10px)"));
  assert.ok(!isSafeMinHeight("100"));
  assert.ok(!isSafeMinHeight("red"));
  assert.ok(!isSafeMinHeight(480));
});

test("AIQ-7: sanitizeStyle keeps a safe minHeight + xl paddingY through coerce, drops junk", () => {
  const out = coerceToSections({
    sections: [{
      kind: "section", label: "Hero",
      children: [{
        kind: "container",
        props: { layout: "stack", style: { paddingY: "xl", minHeight: "78svh" } },
        children: [{ kind: "heading", props: { text: "Hi", level: 1 } }],
      }],
    }],
  });
  const container = collectNodes(out).find((n) => n.kind === "container");
  const style = (container?.props as { style?: Record<string, unknown> }).style;
  assert.equal(style?.paddingY, "xl", "xl paddingY survives coerce");
  assert.equal(style?.minHeight, "78svh", "safe minHeight survives coerce");

  const junk = coerceToSections({
    sections: [{
      kind: "section", label: "Hero",
      children: [{ kind: "container", props: { style: { minHeight: "calc(100vh)" } }, children: [{ kind: "heading", props: { text: "x", level: 1 } }] }],
    }],
  });
  const c2 = collectNodes(junk).find((n) => n.kind === "container");
  assert.equal((c2?.props as { style?: Record<string, unknown> }).style?.minHeight, undefined, "unsafe minHeight dropped");
});

test("AIQ-7: prompt documents the xl padding step and hero minHeight", () => {
  const prompt = buildGenerationSystemPrompt();
  assert.ok(prompt.includes('paddingY: "none"|"s"|"m"|"l"|"xl"'), "xl padding grammar");
  assert.ok(prompt.includes("minHeight"), "minHeight grammar");
  assert.ok(/paddingY:"xl"/.test(prompt), "rules steer xl padding");
});

test("AIQ-13: theme-paired band roles accent/muted survive coerce with NO color pair", () => {
  const out = coerceToSections({
    sections: [{
      kind: "section", label: "Bands",
      children: [
        { kind: "container", props: { layout: "stack", style: { background: "accent" } }, children: [{ kind: "heading", props: { text: "Accent", level: 2 } }] },
        { kind: "container", props: { layout: "stack", style: { background: "muted" } }, children: [{ kind: "paragraph", props: { text: "Muted band" } }] },
      ],
    }],
  });
  const containers = collectNodes(out).filter((n) => n.kind === "container");
  const bgs = containers.map((c) => (c.props as { style?: Record<string, unknown> }).style?.background);
  assert.ok(bgs.includes("accent"), "accent band role survives sanitizeStyle");
  assert.ok(bgs.includes("muted"), "muted band role survives sanitizeStyle");
});

test("AIQ-13: prompt offers the theme-paired band roles", () => {
  const prompt = buildGenerationSystemPrompt();
  assert.ok(prompt.includes('background:"accent"'), "prompt names accent band role");
  assert.ok(prompt.includes('background:"muted"'), "prompt names muted band role");
});

test("AIQ-32: system prompt encodes the KEEP invariants (voice/dash/vocab/H1/color)", () => {
  const p = buildGenerationSystemPrompt();
  assert.match(p, /NEVER use em dashes or en dashes/);
  assert.match(p, /NEVER use buyer, cart, checkout, add to cart, shop, purchase/);
  assert.match(p, /You BOOK talent, you do not buy it\./);
  assert.match(p, /NEVER generic labels like/);
  assert.match(p, /EXACTLY ONE heading with level:1 on the whole page/);
  assert.match(p, /opens with a SHORT uppercase eyebrow paragraph/);
  assert.match(p, /backgroundColor AND textColor together on the SAME container/);
  assert.match(p, /a lone color is DROPPED/);
  assert.match(p, /at most ONE deliberate colored band per page/);
});

test("AIQ-32: user message locks the section-count band + section scope", () => {
  assert.match(buildGenerationUserMessage("page", "x"), /3 to 6 sections/);
  assert.match(buildGenerationUserMessage("section", "x"), /EXACTLY ONE section/);
});

test("AIQ-32: a clean stubbed page carries zero scorecard errors through the pipeline", async () => {
  const r = await generateBuilderNodes({ brief: "boutique modeling agency", scope: "page", generateWithModel: stubModel(HERO_AND_SERVICES) });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const card = scoreGeneratedTree(r.tree);
  assert.equal(card.counts.errors, 0, JSON.stringify(card.findings));
});

test("AIQ-32: sanitizeStyle drops a lone color so the tree never carries an orphan", async () => {
  const withLoneColor = {
    sections: [{ kind: "section", label: "X", children: [
      { kind: "heading", props: { text: "Only title", level: 1 } },
      { kind: "paragraph", props: { text: "Body copy here.", style: { textColor: "#ffffff" } } },
    ] }],
  };
  const r = await generateBuilderNodes({ brief: "a services section", scope: "section", generateWithModel: stubModel(withLoneColor) });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const card = scoreGeneratedTree(r.tree);
  assert.equal(card.findings.some((f) => f.code === "lone_color"), false, "sanitizeStyle stripped the orphan");
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

test("a token-width content column is centered (margin-inline auto), full is not", () => {
  const tree = coerceToSections({
    sections: [
      {
        kind: "section",
        label: "Hero",
        children: [
          // reading-width column → must center in its full-bleed parent
          {
            kind: "container",
            props: { layout: "stack", style: { maxWidth: "reading", paddingY: "l" } },
            children: [{ kind: "heading", props: { text: "Centered hero", level: 1 } }],
          },
          // full-width column → must NOT get centering escapes (it already spans)
          {
            kind: "container",
            props: { layout: "grid", columns: 3, style: { maxWidth: "full" } },
            children: [{ kind: "paragraph", props: { text: "row" } }],
          },
        ],
      },
    ],
  });
  const validation = validateBuilderNodeTree(tree);
  assert.equal(validation.ok, true, "centered tree must still validate");

  const containers = collectNodes(validation.tree).filter((n) => n.kind === "container");
  const reading = containers.find(
    (n) => (n.props as { style?: { maxWidth?: string } }).style?.maxWidth === "reading",
  );
  const full = containers.find(
    (n) => (n.props as { style?: { maxWidth?: string } }).style?.maxWidth === "full",
  );
  assert.ok(reading, "reading-width container survived");
  assert.ok(full, "full-width container survived");

  const rs = (reading!.props as unknown as { style: Record<string, unknown> }).style;
  assert.equal(rs.marginLeftFree, "auto");
  assert.equal(rs.marginRightFree, "auto");
  assert.equal(rs.width, "100%");

  const fs = (full!.props as unknown as { style: Record<string, unknown> }).style;
  assert.equal(fs.marginLeftFree, undefined, "full width must not be centered");
  assert.equal(fs.width, undefined);
});

test("color safety: contrast band dropped, orphan color dropped, paired colors kept", () => {
  const tree = coerceToSections({
    sections: [
      {
        kind: "section",
        label: "Bands",
        children: [
          // theme-relative "contrast" band + hardcoded light text = the live
          // unreadable case → background token dropped, orphan textColor dropped.
          {
            kind: "container",
            props: { layout: "stack", style: { background: "contrast", textColor: "#f3ece0" } },
            children: [{ kind: "heading", props: { text: "Orphan light text", level: 2, style: { textColor: "#f3ece0" } } }],
          },
          // self-consistent hex PAIR on one block → kept (readable on any theme).
          {
            kind: "container",
            props: { layout: "stack", style: { backgroundColor: "#15120e", textColor: "#f3ece0" } },
            children: [{ kind: "paragraph", props: { text: "Paired band copy" } }],
          },
        ],
      },
    ],
  });
  const validation = validateBuilderNodeTree(tree);
  assert.equal(validation.ok, true);

  const containers = collectNodes(validation.tree).filter((n) => n.kind === "container");
  // First container: background token gone, orphan textColor gone.
  const bandA = containers[0]!.props as { style?: Record<string, unknown> };
  assert.equal(bandA.style?.background, undefined, "theme-relative contrast band must be dropped");
  assert.equal(bandA.style?.textColor, undefined, "orphan text color must be dropped");
  // The heading child's orphan textColor is also dropped (inherits the theme).
  const heading = collectNodes(validation.tree).find((n) => n.kind === "heading");
  assert.equal((heading!.props as { style?: Record<string, unknown> }).style?.textColor, undefined);

  // Second container: the self-consistent pair survives intact.
  const bandB = containers[1]!.props as { style?: Record<string, unknown> };
  assert.equal(bandB.style?.backgroundColor, "#15120e");
  assert.equal(bandB.style?.textColor, "#f3ece0");
});

test("richer kinds: accordion + items coerce to a valid, editable subtree", () => {
  const tree = coerceToSections({
    sections: [
      {
        kind: "section",
        label: "FAQ",
        children: [
          {
            kind: "accordion",
            // model-supplied defaultOpenItemIds must NOT survive (it would orphan)
            props: { allowMultiple: false, defaultOpenItemIds: ["item-1"] },
            children: [
              { kind: "accordion_item", props: { title: "Do you travel?" }, children: [{ kind: "paragraph", props: { text: "Across the peninsula and beyond." } }] },
              { kind: "accordion_item", props: { title: "How do bookings work?" }, children: [{ kind: "paragraph", props: { text: "A founder handles every booking." } }] },
              // an accordion_item with no title is dropped
              { kind: "accordion_item", props: {}, children: [{ kind: "paragraph", props: { text: "orphan" } }] },
            ],
          },
        ],
      },
    ],
  });
  const validation = validateBuilderNodeTree(tree);
  assert.equal(validation.ok, true, "accordion tree must validate");
  const nodes = collectNodes(validation.tree);
  const accordion = nodes.find((n) => n.kind === "accordion");
  assert.ok(accordion, "accordion survived");
  assert.equal((accordion!.props as { defaultOpenItemIds?: unknown }).defaultOpenItemIds, undefined, "id-referential field must be dropped");
  const items = nodes.filter((n) => n.kind === "accordion_item");
  assert.equal(items.length, 2, "the titled items survive, the untitled one is dropped");
});

test("richer kinds: form coerces to unique-id fields and drops bad types", () => {
  const tree = coerceToSections({
    sections: [
      {
        kind: "section",
        label: "Contact",
        children: [
          {
            kind: "form",
            props: {
              method: "post",
              fields: [
                { name: "name", type: "text", label: "Your name" },
                { name: "name", type: "email", label: "Email" }, // duplicate name → de-duped
                { type: "sql", label: "Injection" }, // invalid type → dropped
                { name: "send", type: "submit", label: "Send inquiry" },
              ],
            },
          },
        ],
      },
    ],
  });
  const validation = validateBuilderNodeTree(tree);
  assert.equal(validation.ok, true, "form tree must validate");
  const form = collectNodes(validation.tree).find((n) => n.kind === "form");
  assert.ok(form, "form survived");
  const fields = (form!.props as { fields: Array<{ id: string; name: string; type: string }> }).fields;
  assert.equal(fields.length, 3, "3 valid fields (bad type dropped)");
  assert.equal(new Set(fields.map((f) => f.id)).size, 3, "field ids are unique");
  assert.equal(new Set(fields.map((f) => f.name)).size, 3, "field names are unique");
  assert.ok(fields.some((f) => f.type === "submit"), "submit field present");
});

test("richer kinds: pricing_table keeps 2-4 valid tiers, drops when under-filled", () => {
  const ok = coerceToSections({
    sections: [
      {
        kind: "section",
        label: "Pricing",
        children: [
          {
            kind: "pricing_table",
            props: {
              tiers: [
                { name: "Starter", price: "$29", period: "month", features: [{ label: "1 shoot", included: true }] },
                { name: "Pro", price: "$79", period: "month", highlighted: true, ctaHref: "javascript:alert(1)" },
                { name: "No price" }, // missing price → dropped
              ],
            },
          },
        ],
      },
    ],
  });
  const okValidation = validateBuilderNodeTree(ok);
  assert.equal(okValidation.ok, true);
  const table = collectNodes(okValidation.tree).find((n) => n.kind === "pricing_table");
  assert.ok(table, "pricing_table survived");
  const tiers = (table!.props as { tiers: Array<{ id: string; ctaHref?: string }> }).tiers;
  assert.equal(tiers.length, 2, "only the 2 priced tiers survive");
  assert.equal(new Set(tiers.map((t) => t.id)).size, 2, "tier ids unique");
  for (const t of tiers) {
    if (t.ctaHref) assert.ok(!/^javascript:/i.test(t.ctaHref), "dangerous ctaHref neutralized");
  }

  // A pricing_table that can't reach 2 valid tiers is dropped entirely.
  const under = coerceToSections({
    sections: [
      {
        kind: "section",
        label: "Pricing",
        children: [
          { kind: "pricing_table", props: { tiers: [{ name: "Only one", price: "$10" }] } },
          { kind: "paragraph", props: { text: "keeps the section alive" } },
        ],
      },
    ],
  });
  assert.equal(collectNodes(validateBuilderNodeTree(under).tree).some((n) => n.kind === "pricing_table"), false, "under-filled pricing_table dropped");
});

test("images get a bounded aspect ratio per role (AIQ-9), model ratio wins", () => {
  const tree = coerceToSections({
    sections: [
      {
        kind: "section",
        label: "Media",
        children: [
          { kind: "image", props: { role: "hero", alt: "hero" } }, // no ratio -> role default
          { kind: "image", props: { role: "portrait", alt: "p" } }, // portrait -> 3:4
          { kind: "image", props: { role: "gallery", alt: "g", style: { aspectRatio: "1:1" } } }, // model wins
        ],
      },
    ],
  });
  const validation = validateBuilderNodeTree(tree);
  assert.equal(validation.ok, true);
  const images = collectNodes(validation.tree).filter((n) => n.kind === "image");
  assert.equal(images.length, 3);
  for (const img of images) {
    const style = (img.props as { style?: Record<string, unknown> }).style ?? {};
    assert.ok(typeof style.aspectRatio === "string", "every image has a bounded aspectRatio");
    assert.equal(style.objectFit, "cover", "object-fit cover safety net");
  }
  const byAlt = (a: string) =>
    images.find((n) => (n.props as { alt?: string }).alt === a)!.props as unknown as { style: Record<string, unknown> };
  assert.equal(byAlt("hero").style.aspectRatio, "21:9");
  assert.equal(byAlt("p").style.aspectRatio, "3:4");
  assert.equal(byAlt("g").style.aspectRatio, "1:1", "a model-chosen ratio is not overwritten");
});

test("empty model output resolves to EMPTY (caller falls back)", async () => {
  const result = await generateBuilderNodes({
    brief: "a homepage",
    scope: "page",
    generateWithModel: async () => ({ text: null, reason: "empty" }),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "EMPTY");
});

test("a truncated first pass retries with a higher token cap (AIQ-15)", async () => {
  const seen: number[] = [];
  const model: ModelGenerateFn = async ({ maxTokens }) => {
    seen.push(maxTokens);
    return seen.length === 1
      ? { text: '{"sections":[', reason: "truncated" } // cut-off JSON
      : { text: JSON.stringify(HERO_AND_SERVICES), reason: "ok" };
  };
  const result = await generateBuilderNodes({ brief: "a homepage", scope: "page", generateWithModel: model });
  assert.equal(result.ok, true);
  assert.deepEqual(seen, [16000, 24000], "second pass raised the cap");
});

test("corrective retry appends a repair note keyed to the first failure (AIQ-21)", async () => {
  const notes: (string | undefined)[] = [];
  const model: ModelGenerateFn = async ({ repairNote }) => {
    notes.push(repairNote);
    return notes.length === 1
      ? { text: "not json at all", reason: "ok" } // parse_failed
      : { text: JSON.stringify(HERO_AND_SERVICES), reason: "ok" };
  };
  const result = await generateBuilderNodes({ brief: "a homepage", scope: "page", generateWithModel: model });
  assert.equal(result.ok, true);
  assert.equal(notes[0], undefined, "first pass carries no note");
  assert.match(notes[1]!, /not valid JSON/, "retry carries the parse-repair note");
});

test("too-short brief is rejected before any model call", async () => {
  let called = false;
  const result = await generateBuilderNodes({
    brief: "ab",
    scope: "page",
    generateWithModel: async () => {
      called = true;
      return { text: "{}", reason: "ok" };
    },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "BRIEF_TOO_SHORT");
  assert.equal(called, false);
});

function nestToDepth(leafDepth: number): unknown {
  // section at depth 1; containers until leafDepth-1; paragraph at leafDepth.
  let node: unknown = { kind: "paragraph", props: { text: "leaf" } };
  for (let d = leafDepth - 1; d >= 2; d--) {
    node = { kind: "container", props: { layout: "stack" }, children: [node] };
  }
  return {
    sections: [{ kind: "section", label: "Deep", children: [node] }],
  };
}

test("AI coerce depth matches BUILDER_MAX_TREE_DEPTH (was a mirrored 8)", () => {
  const atCap = coerceToSections(nestToDepth(BUILDER_MAX_TREE_DEPTH));
  const atCapNodes = collectNodes(atCap);
  assert.ok(
    atCapNodes.some((n) => n.kind === "paragraph"),
    `a ${BUILDER_MAX_TREE_DEPTH}-deep tree must keep the leaf (AI coerce used to drop at 8)`,
  );
  const over = coerceToSections(nestToDepth(BUILDER_MAX_TREE_DEPTH + 1));
  const overNodes = collectNodes(over);
  assert.equal(
    overNodes.some((n) => n.kind === "paragraph"),
    false,
    "one past the cap still drops the leaf",
  );
});

test("parseModelJson strips code fences and stray prose", () => {
  assert.deepEqual(parseModelJson('```json\n{"sections":[]}\n```'), { sections: [] });
  assert.deepEqual(parseModelJson('Sure! Here you go: {"sections":[]} — enjoy'), { sections: [] });
  assert.equal(parseModelJson("not json at all"), null);
  assert.equal(parseModelJson(null), null);
});
