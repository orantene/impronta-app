/**
 * AI-2 — freeform builder GENERATOR.
 *
 * Turns a one-line brief into a NOVEL, validated `BuilderNode` tree the user can
 * edit like any hand-placed block. This is the capability the shipped
 * `text-to-page.ts` does NOT have: that module only re-ranks a fixed list of
 * preset designs and bakes one; this one lets the model compose real sections /
 * blocks with real copy, constrained to a curated kind + style vocabulary.
 *
 * The single load-bearing invariant: the model's raw output is treated as
 * HOSTILE until proven valid. It flows through
 *   parse → coerce (fill/clamp/sanitize) → re-mint ids → validateBuilderNodeTree
 * before it can reach a surface. `validateBuilderNodeTree` (the same gate the
 * gallery insert + preset composer use) drops any node that still fails and
 * returns a best-effort repaired tree, so a few bad nodes degrade to a valid
 * subset rather than corrupting the page. On empty output we retry once, and the
 * ACTION layer falls back to the preset composer so the user is never dead-ended.
 *
 * SERVER-ONLY (imports the registry). It has NO provider import — the model call
 * is injected (`ModelGenerateFn`), mirroring `rankWithModel` in `text-to-page.ts`
 * so this module stays pure + unit-testable with a stubbed model response.
 */

import { BUILDER_NODE_REGISTRY } from "@/lib/site-admin/builder-node/registry";
import { builderNodeKindAllowedAtRoot } from "@/lib/site-admin/builder-node/drop-policy";
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import { cloneBuilderTreeWithFreshIds } from "@/lib/site-admin/builder-node/page-designs/expand-repeaters";
import { makeId } from "@/lib/site-admin/builder-node/make-id";
import type {
  BuilderNode,
  BuilderNodeKind,
  BuilderNodeTree,
} from "@/lib/site-admin/builder-node/types";
import type { JsonSchemaForChat } from "@/lib/ai/provider";
import {
  CURATED_STYLE_COLOR_KEYS,
  CURATED_STYLE_ENUM_VALUES,
  CURATED_STYLE_FONT_WEIGHT_KEY,
  FREEFORM_SECTION_TYPE_KEY,
  GENERATION_ALLOWED_KINDS,
  GENERATION_ICON_NAMES,
  IMAGE_ROLES,
  isGenerationKind,
  isSafeStyleColor,
  photoForImageRole,
  safeIconName,
  type CuratedStyleEnumKey,
  type GenerationKind,
} from "./generation-allowed-kinds";

export type GenerateScope = "page" | "section";

/** Injected model call — returns the raw text (a JSON object) or null on any provider failure. */
export type ModelGenerateFn = (input: {
  systemPrompt: string;
  userMessage: string;
  jsonSchema: JsonSchemaForChat;
  maxTokens: number;
}) => Promise<string | null>;

export interface GenerateNodesInput {
  brief: string;
  scope: GenerateScope;
  generateWithModel: ModelGenerateFn;
}

export type GenerateNodesResult =
  | { ok: true; tree: BuilderNodeTree; nodeCount: number; repaired: boolean }
  | { ok: false; code: "BRIEF_TOO_SHORT" | "NO_MODEL" | "EMPTY"; error: string };

const MIN_BRIEF_LEN = 3;
const MAX_BRIEF_LEN = 400;
const MAX_TOTAL_NODES = 180; // hard DoS/cost cap (validate has depth 8 but no count cap)
const MAX_COERCE_DEPTH = 8; // mirror validate's default maxDepth
const HEADING_MAX = 240;
const PARAGRAPH_MAX = 5000;
const BUTTON_LABEL_MAX = 80;
const HREF_MAX = 500;
const ALT_MAX = 240;
const LABEL_MAX = 120;
const GEN_MAX_TOKENS = 8000;

// ── Prompt ────────────────────────────────────────────────────────────────

/**
 * The output envelope handed to the adapter. Anthropic gets this schema appended
 * to the system prompt (prompt-enforced JSON — BuilderNode is recursive, which
 * native structured outputs forbid); the real per-kind grammar lives in the
 * system prompt below and the real gate is `validateBuilderNodeTree`.
 */
export const GENERATION_OUTPUT_SCHEMA: JsonSchemaForChat = {
  name: "builder_sections",
  // Non-strict: the tree is recursive/open (items are free-form node objects),
  // which OpenAI's STRICT json_schema mode forbids. Anthropic ignores this flag
  // (it just stringifies the schema into the prompt); validation is the real gate.
  strict: false,
  schema: {
    type: "object",
    required: ["sections"],
    properties: {
      sections: {
        type: "array",
        description: "One or more page sections, each a builder node tree (see the grammar).",
        items: { type: "object" },
      },
    },
  },
};

export function buildGenerationSystemPrompt(): string {
  return [
    "You are a website page-builder engine for a talent-agency platform. Given a brief, you output JSON describing page sections built from a fixed set of block types. The user edits every block afterward, so make each block real and specific.",
    "",
    'OUTPUT: a single JSON object {"sections": [Section, ...]}. No prose, no markdown fences.',
    "",
    "A Section is: {\"kind\":\"section\",\"label\":\"Short name\",\"children\":[block, ...]}.",
    "",
    "BLOCK TYPES (a block is {\"kind\":..., \"props\":{...}, \"children\":[...] }):",
    '- container  props:{layout:"stack"|"row"|"grid", gap:"s"|"m"|"l", columns:1-4 (grid only), align:"start"|"center"|"end"|"stretch"}  children:any blocks. Group vertical content with layout:"stack"; make a card grid with layout:"grid",columns:3.',
    '- split      props:{ratio:"50-50"|"40-60"|"60-40"|"30-70"|"70-30", gap:"s"|"m"|"l"}  children:[left, right] (exactly two). Use for image-beside-text.',
    '- card       props:{variant:"elevated"|"outline"|"ghost"}  children: heading, paragraph, button, image ONLY.',
    '- cta_group  props:{align:"start"|"center"|"end"}  children: button(s) ONLY.',
    '- heading    props:{text:"...", level:1-4}. One per section, usually level 2.',
    '- paragraph  props:{text:"..."}.',
    '- button     props:{label:"...", href:"/inquire", tone:"primary"|"secondary"}.',
    '- image      props:{role:"hero"|"wide"|"portrait"|"gallery"|"team", alt:"..."}. NEVER a url — pick the closest role; a real photo is filled in.',
    `- icon       props:{icon:${GENERATION_ICON_NAMES.map((n) => `"${n}"`).join("|")}, size:"sm"|"md"|"lg"|"xl"}.`,
    '- divider    props:{tone:"default"|"muted"}.',
    '- spacer     props:{size:"s"|"m"|"l"}.',
    "",
    "OPTIONAL style object on any block's props (all keys optional — omit unless it earns its place). Only these keys/values survive; anything else is dropped, so do not invent CSS:",
    '  align:"left"|"center"|"right"',
    '  size:"sm"|"md"|"lg"|"xl"|"display"      (heading scale)',
    '  maxWidth:"narrow"|"reading"|"wide"|"full"',
    '  paddingX,paddingY,marginTop,marginBottom: "none"|"s"|"m"|"l"',
    '  background:"none"|"surface"|"contrast"   (contrast = dark band)',
    '  radius:"none"|"sm"|"md"|"lg"|"pill"',
    '  textColor,backgroundColor: a short CSS color — hex like "#1a1a1a" or a keyword, under ~40 chars',
    "  fontWeight: 100-900",
    '  textTransform:"none"|"uppercase"|"lowercase"|"capitalize"   fontStyle:"normal"|"italic"   tone:"default"|"muted"|"strong"',
    '  objectFit:"cover"|"contain"   aspectRatio:"auto"|"1:1"|"4:3"|"3:4"|"16:9"|"21:9"',
    "",
    'COLOR: default to a warm editorial palette. For a dark band use background:"contrast" (or backgroundColor near "#15120e") with light text (textColor near "#f3ece0"). Cream surfaces use backgroundColor near "#f3efe7" with ink text near "#1b1713". Use at most one accent hex for eyebrows/rules. Never put light text on a light background or dark on dark.',
    "",
    "RULES",
    "- Copy: write real, specific, on-brand copy — never lorem ipsum or placeholder text. Headlines are short and declarative (5-9 words); body is one or two real sentences. Give the business a plausible concrete name and voice.",
    "- Hierarchy: EXACTLY ONE heading with level:1 on the whole page — it lives in the hero. Every other section opens with a level:2 heading; cards use level:3. Never skip levels.",
    "- Rhythm: prefer 2-4 blocks per section. Alternate texture — a text-led section, then a media or card section — rather than stacking identical card grids.",
    "- Layout: one idea per section. Do not nest deeper than 3 levels below a section.",
    '- Restraint: tasteful, editorial, minimal. Reach for whitespace (paddingY, spacer) before decoration. At most one background:"contrast" band per page (a hero or a closing CTA).',
    "",
    "EXAMPLE (one hero section):",
    JSON.stringify({
      sections: [
        {
          kind: "section",
          label: "Hero",
          children: [
            {
              kind: "container",
              props: { layout: "stack", gap: "m", align: "center", style: { paddingY: "l", maxWidth: "reading" } },
              children: [
                { kind: "paragraph", props: { text: "A boutique modeling agency", style: { align: "center", size: "sm", textTransform: "uppercase", tone: "muted" } } },
                { kind: "heading", props: { text: "Faces that move culture", level: 1, style: { size: "display", align: "center" } } },
                { kind: "paragraph", props: { text: "A boutique roster of models booked by the brands setting the pace.", style: { align: "center", maxWidth: "reading" } } },
                {
                  kind: "cta_group",
                  props: { align: "center" },
                  children: [{ kind: "button", props: { label: "Book a model", href: "/inquire", tone: "primary" } }],
                },
                { kind: "image", props: { role: "hero", alt: "Model on a studio runway" } },
              ],
            },
          ],
        },
      ],
    }),
    "",
    "EXAMPLE (a 3-card services grid):",
    JSON.stringify({
      sections: [
        {
          kind: "section",
          label: "Services",
          children: [
            { kind: "heading", props: { text: "What we do", level: 2, style: { align: "center" } } },
            {
              kind: "container",
              props: { layout: "grid", columns: 3, gap: "m" },
              children: [
                {
                  kind: "card",
                  props: { variant: "elevated" },
                  children: [
                    { kind: "heading", props: { text: "Editorial", level: 3 } },
                    { kind: "paragraph", props: { text: "Campaign and lookbook casting for print and digital." } },
                  ],
                },
                {
                  kind: "card",
                  props: { variant: "elevated" },
                  children: [
                    { kind: "heading", props: { text: "Runway", level: 3 } },
                    { kind: "paragraph", props: { text: "Season fittings and show bookings across fashion weeks." } },
                  ],
                },
                {
                  kind: "card",
                  props: { variant: "elevated" },
                  children: [
                    { kind: "heading", props: { text: "Commercial", level: 3 } },
                    { kind: "paragraph", props: { text: "Brand, lifestyle, and product work with usage handled." } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }),
  ].join("\n");
}

export function buildGenerationUserMessage(scope: GenerateScope, brief: string): string {
  const scopeLine =
    scope === "page"
      ? "Generate a COMPLETE PAGE: 3 to 6 sections (e.g. hero, features/services, gallery or stats, testimonials, and a closing call-to-action)."
      : "Generate EXACTLY ONE section for this request.";
  return [scopeLine, "", `Brief: ${brief}`, "", 'Return only the {"sections": [...]} JSON object.'].join("\n");
}

// ── Parse ───────────────────────────────────────────────────────────────────

/** Robustly extract the JSON object from the model text (strip fences, slice to the outermost braces). */
export function parseModelJson(text: string | null | undefined): unknown {
  if (!text) return null;
  let raw = text.trim();
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  try {
    return JSON.parse(raw);
  } catch {
    // Fall back to the outermost {...} span in case the model added stray prose.
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ── Coerce ────────────────────────────────────────────────────────────────

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function clampString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, max);
}

function childKindAllowed(parentKind: BuilderNodeKind, childKind: BuilderNodeKind): boolean {
  const policy = BUILDER_NODE_REGISTRY[parentKind].children;
  if (policy.type === "any") return true;
  if (policy.type === "none") return false;
  return policy.kinds.includes(childKind);
}

/**
 * Keep only curated style keys, and only values guaranteed to pass
 * `builderNodeStyleSchema` — so a kept `style` can never drop the node.
 */
function sanitizeStyle(raw: unknown): Record<string, unknown> | undefined {
  const style = asObject(raw);
  if (!style) return undefined;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(CURATED_STYLE_ENUM_VALUES) as CuratedStyleEnumKey[]) {
    const allowed = CURATED_STYLE_ENUM_VALUES[key] as ReadonlyArray<string>;
    const value = style[key];
    if (typeof value === "string" && allowed.includes(value)) out[key] = value;
  }
  for (const key of CURATED_STYLE_COLOR_KEYS) {
    if (isSafeStyleColor(style[key])) out[key] = style[key];
  }
  const weight = style[CURATED_STYLE_FONT_WEIGHT_KEY];
  if (typeof weight === "number" && Number.isInteger(weight) && weight >= 100 && weight <= 900) {
    out[CURATED_STYLE_FONT_WEIGHT_KEY] = weight;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

interface CoerceCtx {
  count: { n: number };
}

/** Coerce one raw model node into a guaranteed-valid BuilderNode, or null to drop it. */
function coerceNode(
  raw: unknown,
  parentKind: BuilderNodeKind | null,
  depth: number,
  ctx: CoerceCtx,
): BuilderNode | null {
  if (depth > MAX_COERCE_DEPTH || ctx.count.n >= MAX_TOTAL_NODES) return null;
  const node = asObject(raw);
  if (!node) return null;
  const kind = node.kind;
  if (!isGenerationKind(kind)) return null;
  // Root nodes (parentKind === null) must be root-allowed (a section for us);
  // nested nodes must satisfy the parent's child policy.
  if (parentKind === null) {
    if (!builderNodeKindAllowedAtRoot(kind)) return null;
  } else if (!childKindAllowed(parentKind, kind)) {
    return null;
  }

  const rawProps = asObject(node.props) ?? {};
  const style = sanitizeStyle(rawProps.style ?? node.style);

  const withStyle = (props: Record<string, unknown>): Record<string, unknown> =>
    style ? { ...props, style } : props;

  const emit = (props: Record<string, unknown>, children?: BuilderNode[]): BuilderNode => {
    ctx.count.n += 1;
    const base = { id: makeId(kind as BuilderNodeKind), kind, props } as Record<string, unknown>;
    if (children) base.children = children;
    return base as unknown as BuilderNode;
  };

  const coerceChildren = (): BuilderNode[] => {
    const rawChildren = Array.isArray(node.children) ? node.children : [];
    const out: BuilderNode[] = [];
    for (const child of rawChildren) {
      const coerced = coerceNode(child, kind as BuilderNodeKind, depth + 1, ctx);
      if (coerced) out.push(coerced);
      if (ctx.count.n >= MAX_TOTAL_NODES) break;
    }
    return out;
  };

  switch (kind as GenerationKind) {
    case "section": {
      const props: Record<string, unknown> = { sectionTypeKey: FREEFORM_SECTION_TYPE_KEY };
      const label = clampString(node.label ?? rawProps.label, LABEL_MAX);
      if (label) props.label = label;
      return emit(props, coerceChildren());
    }
    case "container": {
      const layoutRaw = rawProps.layout;
      const layout =
        layoutRaw === "row" || layoutRaw === "grid" || layoutRaw === "stack" ? layoutRaw : "stack";
      const props: Record<string, unknown> = withStyle({ layout });
      const gap = rawProps.gap;
      if (gap === "s" || gap === "m" || gap === "l") props.gap = gap;
      const align = rawProps.align;
      if (align === "start" || align === "center" || align === "end" || align === "stretch") {
        props.align = align;
      }
      // columns > 1 is ONLY valid under layout:"grid" (container superRefine).
      const columns = rawProps.columns;
      if (layout === "grid" && typeof columns === "number" && columns >= 1 && columns <= 4) {
        props.columns = Math.trunc(columns);
      }
      return emit(props, coerceChildren());
    }
    case "split": {
      const ratio = rawProps.ratio;
      const props: Record<string, unknown> = withStyle({});
      if (["50-50", "40-60", "60-40", "30-70", "70-30"].includes(ratio as string)) {
        props.ratio = ratio;
      }
      const gap = rawProps.gap;
      if (gap === "s" || gap === "m" || gap === "l") props.gap = gap;
      return emit(props, coerceChildren());
    }
    case "card": {
      const variant = rawProps.variant;
      const props: Record<string, unknown> = withStyle({});
      if (variant === "elevated" || variant === "outline" || variant === "ghost") {
        props.variant = variant;
      }
      return emit(props, coerceChildren());
    }
    case "cta_group": {
      const align = rawProps.align;
      const props: Record<string, unknown> = withStyle({});
      if (align === "start" || align === "center" || align === "end" || align === "stretch") {
        props.align = align;
      }
      return emit(props, coerceChildren());
    }
    case "heading": {
      const text = clampString(rawProps.text ?? node.text, HEADING_MAX);
      if (!text) return null;
      const lvl = rawProps.level;
      const level = lvl === 1 || lvl === 2 || lvl === 3 || lvl === 4 ? lvl : 2;
      return emit(withStyle({ text, level }));
    }
    case "paragraph": {
      const text = clampString(rawProps.text ?? node.text, PARAGRAPH_MAX);
      if (!text) return null;
      return emit(withStyle({ text }));
    }
    case "button": {
      const label = clampString(rawProps.label ?? node.label, BUTTON_LABEL_MAX) ?? "Learn more";
      let href = clampString(rawProps.href ?? node.href, HREF_MAX) ?? "/inquire";
      // Defense-in-depth: never carry a dangerous href scheme into the tree (it is
      // also neutralized at render, but keep the source clean).
      if (/^\s*(?:javascript|data|vbscript):/i.test(href)) href = "/inquire";
      const props: Record<string, unknown> = withStyle({ label, href });
      const tone = rawProps.tone;
      if (tone === "primary" || tone === "secondary") props.tone = tone;
      return emit(props);
    }
    case "image": {
      const src = photoForImageRole(rawProps.role ?? node.role);
      const alt = clampString(rawProps.alt ?? node.alt, ALT_MAX);
      const props: Record<string, unknown> = withStyle({ src });
      if (alt) props.alt = alt;
      return emit(props);
    }
    case "icon": {
      const icon = safeIconName(rawProps.icon ?? node.icon);
      const props: Record<string, unknown> = withStyle({ icon });
      const size = rawProps.size;
      if (size === "sm" || size === "md" || size === "lg" || size === "xl") props.size = size;
      const label = clampString(rawProps.label, LABEL_MAX);
      if (label) props.label = label;
      return emit(props);
    }
    case "divider": {
      const tone = rawProps.tone;
      const props: Record<string, unknown> = withStyle({});
      if (tone === "default" || tone === "muted") props.tone = tone;
      return emit(props);
    }
    case "spacer": {
      const size = rawProps.size;
      const props: Record<string, unknown> = withStyle({
        size: size === "s" || size === "m" || size === "l" ? size : "m",
      });
      return emit(props);
    }
    default:
      return null;
  }
}

/** Normalize the model output into an array of raw section-level nodes. */
function normalizeRawSections(parsed: unknown): unknown[] {
  const obj = asObject(parsed);
  if (obj && Array.isArray(obj.sections)) return obj.sections;
  if (Array.isArray(parsed)) return parsed;
  if (obj) return [obj];
  return [];
}

/**
 * Coerce raw model output into a valid ROOT tree of `section` nodes. A top-level
 * node that is not itself a section is wrapped in one (root only accepts sections
 * et al.), so no content is lost to a missing wrapper.
 */
export function coerceToSections(parsed: unknown): BuilderNode[] {
  const ctx: CoerceCtx = { count: { n: 0 } };
  const rawSections = normalizeRawSections(parsed);
  const out: BuilderNode[] = [];
  for (const rawSection of rawSections) {
    if (ctx.count.n >= MAX_TOTAL_NODES) break;
    const obj = asObject(rawSection);
    if (obj && obj.kind === "section") {
      const section = coerceNode(rawSection, null, 1, ctx);
      const kids = (section as { children?: BuilderNode[] } | null)?.children;
      // Drop a section whose children all failed coercion — a blank section is
      // worse than nothing (expert review P2b).
      if (section && Array.isArray(kids) && kids.length > 0) {
        out.push(section);
      }
      continue;
    }
    // Not a section — wrap the coerced block in a synthetic section so it is
    // valid at the root.
    const child = coerceNode(rawSection, "section", 2, ctx);
    if (child) {
      ctx.count.n += 1;
      out.push({
        id: makeId("section"),
        kind: "section",
        props: { sectionTypeKey: FREEFORM_SECTION_TYPE_KEY },
        children: [child],
      } as unknown as BuilderNode);
    }
  }
  return out;
}

// ── Orchestrate ─────────────────────────────────────────────────────────────

async function runOnce(
  input: GenerateNodesInput,
  brief: string,
): Promise<{ tree: BuilderNodeTree; repaired: boolean } | null> {
  const text = await input.generateWithModel({
    systemPrompt: buildGenerationSystemPrompt(),
    userMessage: buildGenerationUserMessage(input.scope, brief),
    jsonSchema: GENERATION_OUTPUT_SCHEMA,
    maxTokens: GEN_MAX_TOKENS,
  });
  const parsed = parseModelJson(text);
  if (parsed == null) return null;

  const coerced = coerceToSections(parsed);
  if (coerced.length === 0) return null;

  // Re-mint every id (the model's ids may collide/repeat) BEFORE validate, which
  // rejects duplicate ids, then run the same gate the gallery-insert path uses.
  const fresh = cloneBuilderTreeWithFreshIds(coerced);
  const validation = validateBuilderNodeTree(fresh);
  if (validation.ok) return { tree: validation.tree, repaired: false };
  // Invalid nodes are dropped; the repaired tree still validates. Use it when
  // it kept at least one section.
  if (validation.tree.length > 0) return { tree: validation.tree, repaired: true };
  return null;
}

function countNodes(tree: BuilderNodeTree): number {
  let n = 0;
  const walk = (node: BuilderNode) => {
    n += 1;
    const children = (node as { children?: BuilderNode[] }).children;
    if (Array.isArray(children)) children.forEach(walk);
  };
  tree.forEach(walk);
  return n;
}

/**
 * Compose a validated freeform tree from a brief. Returns `EMPTY` when the model
 * produced nothing usable after one retry — the caller (action) then falls back
 * to the deterministic preset composer so the user always gets a page.
 */
export async function generateBuilderNodes(
  input: GenerateNodesInput,
): Promise<GenerateNodesResult> {
  const brief = (input.brief ?? "").trim();
  if (brief.length < MIN_BRIEF_LEN) {
    return { ok: false, code: "BRIEF_TOO_SHORT", error: "Add a few words describing what you want." };
  }
  const clipped = brief.slice(0, MAX_BRIEF_LEN);

  // One generate + one retry. `runOnce` returns null on empty/parse failure.
  let result = await runOnce(input, clipped);
  if (!result) result = await runOnce(input, clipped);
  if (!result) {
    return { ok: false, code: "EMPTY", error: "The AI could not build that — try rephrasing." };
  }
  return {
    ok: true,
    tree: result.tree,
    nodeCount: countNodes(result.tree),
    repaired: result.repaired,
  };
}

/** Re-exported for the drift test — the exact kinds named in the prompt grammar. */
export const GENERATION_PROMPT_KINDS: ReadonlyArray<string> = [
  ...GENERATION_ALLOWED_KINDS,
];

/** Re-exported for the drift test — the image roles named in the prompt. */
export const GENERATION_PROMPT_IMAGE_ROLES: ReadonlyArray<string> = [...IMAGE_ROLES];
