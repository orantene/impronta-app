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
import { getLocaleMetadata } from "@/i18n/config";
import { buildFewShotExamples } from "./generation-few-shots";
import {
  clampString,
  coerceHeroSearchProps,
  coerceTalentTypeGridProps,
} from "./coerce-native-data-blocks";
import {
  CURATED_STYLE_COLOR_KEYS,
  CURATED_STYLE_ENUM_VALUES,
  CURATED_STYLE_FONT_WEIGHT_KEY,
  CURATED_STYLE_MIN_HEIGHT_KEY,
  isSafeMinHeight,
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

/** Why a model call ended — a provider stop reason mapped to a small tag (AIQ-15). */
export type ModelGenerateReason = "ok" | "truncated" | "refusal" | "empty" | "error";

/** Injected model call result — text plus WHY it ended, so the orchestrator can act (AIQ-15). */
export type ModelGenerateResult = { text: string | null; reason: ModelGenerateReason };

/** Orchestrator-internal failure tags (produced by runOnce), a superset of the model reasons. */
export type GenFailReason = ModelGenerateReason | "parse_failed" | "no_valid_nodes";

export type ModelGenerateFn = (input: {
  systemPrompt: string;
  userMessage: string;
  jsonSchema: JsonSchemaForChat;
  maxTokens: number;
  /** Appended to the user message on the corrective retry (AIQ-21). */
  repairNote?: string;
}) => Promise<ModelGenerateResult>;

export type ThemePolarity = "light" | "dark";

/** A few resolved theme swatches to anchor any deliberate colored band (AIQ-12). */
export interface GenerationPalette {
  background?: string;
  ink?: string;
  surfaceRaised?: string;
  primary?: string;
}

export interface GenerateNodesInput {
  brief: string;
  scope: GenerateScope;
  generateWithModel: ModelGenerateFn;
  /** BCP-47 locale of the surface being edited; copy is written in this language (AIQ-3). */
  locale?: string;
  /** The tenant's active theme polarity, if resolvable server-side (AIQ-12). */
  themePolarity?: ThemePolarity;
  /** Resolved theme swatches to anchor a deliberate colored band (AIQ-12). */
  palette?: GenerationPalette;
}

/** Options that shape the static system prompt (AIQ-3 locale, AIQ-12 polarity/palette). */
export interface BuildPromptOpts {
  locale?: string;
  themePolarity?: ThemePolarity;
  palette?: GenerationPalette;
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
// Headroom for adaptive thinking: thinking tokens + the JSON output both count
// toward this cap. A full page is ~2-3k output tokens; the extra budget lets the
// model think without truncating the JSON. Still safe non-streaming (< the ~16k
// where SDK HTTP timeouts start to matter).
const GEN_MAX_TOKENS = 16000;
// AIQ-15: truncation headroom on the corrective pass. Stays inside the SDK's
// non-streaming HTTP-timeout safety; streaming via .finalMessage() is the
// documented follow-up if 24k proves insufficient in the eval.
const GEN_MAX_TOKENS_RETRY = 24000;

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

/**
 * COLOR guidance, adapted to the tenant's resolved theme polarity (AIQ-12).
 * The no-polarity path returns the exact prior wording byte-for-byte, so the
 * default prompt is unchanged; a resolved polarity replaces the "unknown"
 * gamble with a concrete invert-the-band suggestion in the theme's own palette.
 */
function buildColorGuidance(
  polarity: ThemePolarity | undefined,
  palette: GenerationPalette | undefined,
): string {
  if (!polarity) {
    return 'COLOR: the tenant theme already supplies a coherent, readable palette — LEAVE MOST BLOCKS UNCOLORED and let the theme paint them. The theme\'s polarity is unknown to you (a page can be light OR dark), so a hardcoded color is a gamble. Two safe moves only: (1) leave color unset (recommended for nearly every block); (2) to make ONE deliberate colored band, set backgroundColor AND textColor together on the SAME container as a self-consistent pair — e.g. a dark band backgroundColor:"#15120e" with textColor:"#f3ece0", or a cream band backgroundColor:"#f3efe7" with textColor:"#1b1713"; its text children then inherit that color, so leave them uncolored. NEVER set a text color without a matching background on the same block, or a background without its text color — a lone color is DROPPED. Never light-on-light or dark-on-dark.';
  }
  const bg = palette?.background ?? (polarity === "dark" ? "#0a0a0a" : "#ffffff");
  const ink = palette?.ink ?? (polarity === "dark" ? "#f4f4f5" : "#111111");
  const band =
    polarity === "dark"
      ? 'Since this page is DARK, a deliberate band should INVERT to light: backgroundColor:"#f3efe7" with textColor:"#1b1713".'
      : 'Since this page is LIGHT, a deliberate band should INVERT to dark: backgroundColor:"#15120e" with textColor:"#f3ece0".';
  const primaryNote = palette?.primary
    ? ` The theme's primary accent is ${palette.primary}; the theme already paints primary buttons with it, so still do NOT set button colors.`
    : "";
  return `COLOR: the tenant theme already supplies a coherent, readable palette — LEAVE MOST BLOCKS UNCOLORED and let the theme paint them. This page's theme polarity is ${polarity.toUpperCase()} (canvas ${bg}, text ${ink}). ${band}${primaryNote} Two safe moves only: (1) leave color unset (recommended for nearly every block); (2) to make ONE deliberate colored band, set backgroundColor AND textColor together on the SAME container as a self-consistent pair; its text children then inherit that color, so leave them uncolored. NEVER set a text color without a matching background on the same block, or a background without its text color — a lone color is DROPPED. Never light-on-light or dark-on-dark.`;
}

export function buildGenerationSystemPrompt(opts: BuildPromptOpts = {}): string {
  const languageName = getLocaleMetadata(opts.locale ?? "en").label;
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
    '- accordion  props:{allowMultiple:true|false}  children:[accordion_item, ...]. A stack of expandable rows — perfect for an FAQ. Do not try to set an open-by-default row.',
    '- accordion_item  props:{title:"A real question?"}  children:[paragraph, ...]. One row of an accordion; title is the always-visible header, children are the revealed answer. Only valid inside an accordion.',
    '- form       props:{method:"post", fields:[{name:"email", type:"email"|"text"|"tel"|"textarea"|"submit", label:"...", placeholder:"...", required:true}, ...]}. Use for a contact / inquiry section. 2-6 fields, ending with one type:"submit" field. No children.',
    '- hero_search  props:{eyebrow:"...", headline:"...", highlight:"...", subheadline:"...", searchPlaceholder:"Search the roster", searchSubmitLabel:"Search", primaryCtaLabel:"...", secondaryCtaLabel:"...", chips:[{label:"Models"}, ...], statSource:"tenant_talent_count", statCountLabel:"represented talent", layout:"centered"|"split"|"minimal"|"editorial"}. A SEARCH-FIRST hero wired to the agency\'s own directory: a real search box, quick-filter chips, and a live count of the agency\'s represented talent. Its headline renders as the page H1, so a page that opens with hero_search must NOT also contain a heading with level:1. No children, no hrefs, no ids.',
    '- talent_type_grid  props:{eyebrow:"...", headline:"...", subheadline:"...", mode:"dynamic", maxItems:1-18, columns:1-6, showCount:true, seeAllLabel:"View the roster", emptyStateText:"..."}. Discipline cards ("Models", "Voice", "Dancers") derived from the agency\'s OWN roster taxonomy, each linking into the directory. Its headline renders as an H2, so do NOT wrap it in your own eyebrow paragraph + level:2 heading. mode:"dynamic" is right nearly always; only use mode:"manual" with items:[{label:"...", description:"..."}] when the brief names disciplines the agency does not actually represent yet. No children, no hrefs, no ids.',
    '- pricing_table  props:{tiers:[{name:"...", price:"$49", period:"month", description:"...", highlighted:true, features:[{label:"...", included:true}], ctaLabel:"Choose", ctaHref:"/inquire"}, ...]}. 2-4 tiers; mark the recommended one highlighted:true. Prices are strings ("$49" or "Custom"). No children.',
    "",
    "OPTIONAL style object on any block's props (all keys optional — omit unless it earns its place). Only these keys/values survive; anything else is dropped, so do not invent CSS:",
    '  align:"left"|"center"|"right"',
    '  size:"sm"|"md"|"lg"|"xl"|"display"      (heading scale)',
    '  maxWidth:"narrow"|"reading"|"wide"|"full"',
    '  paddingX,marginTop,marginBottom: "none"|"s"|"m"|"l"',
    '  paddingY: "none"|"s"|"m"|"l"|"xl"   ("xl" = full section-scale vertical rhythm, ~96px; use it on a section\'s outer container)',
    '  minHeight: a CSS length like "70svh" or "480px" — set on the hero container so the opening view fills the screen',
    '  background:"none"|"surface"|"accent"|"muted"   (surface = subtle raised panel; accent = a bold band in the tenant\'s brand color with readable paired text; muted = a soft neutral band. All three are theme-paired: the text stays readable automatically, no color pair needed)',
    '  radius:"none"|"sm"|"md"|"lg"|"pill"',
    '  textColor,backgroundColor: a short CSS color — hex like "#1a1a1a" or a keyword, under ~40 chars',
    "  fontWeight: 100-900",
    '  textTransform:"none"|"uppercase"|"lowercase"|"capitalize"   fontStyle:"normal"|"italic"   tone:"default"|"muted"|"strong"',
    '  objectFit:"cover"|"contain"   aspectRatio:"auto"|"1:1"|"4:3"|"3:4"|"16:9"|"21:9"',
    "",
    buildColorGuidance(opts.themePolarity, opts.palette),
    "",
    "RULES",
    "- Copy: write real, specific, on-brand copy, never lorem ipsum or placeholder text. Headlines are short and declarative (5-9 words); body is one or two real sentences. Give the business a plausible concrete name and voice.",
    `- Language: write EVERY piece of user-visible copy (names, headlines, body, eyebrows, button labels, form labels, accordion titles, pricing tiers) in ${languageName}, the language named in the LANGUAGE line of the user message. Never mix languages within the page. Leave hrefs, style tokens, and node kinds unchanged.`,
    "- Punctuation: NEVER use em dashes or en dashes (— or –) in any copy. Use a comma, period, colon, or the word 'and' instead. This is a strict brand style rule.",
    "- Brand language: this is a talent agency, not a store. NEVER use buyer, cart, checkout, add to cart, shop, purchase, or 'pay to DM'. Use client, book, inquire, roster, lineup, casting. You BOOK talent, you do not buy it.",
    "- CTA labels: verb-led and specific (Book talent, Start an inquiry, View the roster, See pricing, Apply as talent). NEVER generic labels like 'Learn more', 'Click here', 'Read more', or 'Submit'.",
    "- Section openers: every section EXCEPT the hero opens with a SHORT uppercase eyebrow paragraph (style: size:sm, tone:muted, textTransform:uppercase) directly above its level:2 heading, so each section has a clear visual ramp instead of a bare heading. hero_search and talent_type_grid are the exception: they render their own eyebrow and title from their props, so set eyebrow/headline on the block itself and add no paragraph or heading around it.",
    "- Hierarchy: EXACTLY ONE heading with level:1 on the whole page — it lives in the hero. If the hero is a hero_search block, ITS headline IS that level:1, so do not emit a heading with level:1 anywhere on the page. Every other section opens with a level:2 heading; cards use level:3. Never skip levels.",
    "- Live agency data: when the brief is a TALENT AGENCY or roster site, the page must show the agency's actual roster, not a description of it. Open the page with a hero_search block (a real directory search plus statSource:\"tenant_talent_count\") instead of a plain heading hero, and include ONE talent_type_grid with mode:\"dynamic\" so the disciplines the agency really represents appear as cards. Both blocks fill themselves in from the agency's own data, so write only the surrounding copy: no roster names, no invented talent counts in your own text, no discipline lists spelled out in a paragraph. Use each block AT MOST ONCE per page. Do NOT use them for a page that is not about a roster (a single photographer's landing page, a pricing page, a contact page, a policy page) or for a section-scope request that did not ask for search or disciplines.",
    "- Rhythm: prefer 2-4 blocks per section. Alternate texture — a text-led section, then a media or card section — rather than stacking identical card grids.",
    "- Layout: one idea per section. Do not nest deeper than 3 levels below a section.",
    '- Rhythm & scale: give each section REAL vertical breathing room — put paddingY:"xl" on the section\'s outer container (paddingY:"l" only for a deliberately tight band), and give the hero container a minHeight of "70svh" to "85svh" so the opening view fills the screen. For a FULL-BLEED colored band, make the section\'s single child a container with style.maxWidth:"full" carrying the backgroundColor+textColor pair, so the color runs edge to edge.',
    '- Restraint: tasteful, editorial, minimal. Reach for whitespace (paddingY, spacer) before decoration. Use at most ONE deliberate colored band per page (usually the closing CTA): build it by setting background:"accent" (a band in the tenant\'s brand color) or background:"muted" (a soft neutral band) on that section\'s container — these carry their own readable text, so leave the children uncolored. Prefer these over a hand-picked backgroundColor+textColor pair; never use a lone color.',
    "",
    ...buildFewShotExamples(opts.locale),
  ].join("\n");
}

export function buildGenerationUserMessage(scope: GenerateScope, brief: string, locale?: string): string {
  const scopeLine =
    scope === "page"
      ? "Generate a COMPLETE PAGE: 3 to 6 sections (e.g. hero, features/services, gallery or stats, testimonials, and a closing call-to-action)."
      : "Generate EXACTLY ONE section for this request.";
  const languageName = getLocaleMetadata(locale ?? "en").label;
  const languageLine = `LANGUAGE: Write ALL user-visible copy in ${languageName}. Do not translate the brief; write the page copy in ${languageName}.`;
  return [scopeLine, "", languageLine, "", `Brief: ${brief}`, "", 'Return only the {"sections": [...]} JSON object.'].join("\n");
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
  // Colors survive only as a self-consistent PAIR (a background with its own
  // readable foreground). A LONE text color sits on the theme's own surface —
  // whose polarity the model can't see — and a lone background leaves the text
  // at the theme default; either can invert to unreadable on a given tenant
  // theme (verified live: cream text with no background rendered invisible on a
  // light theme). Drop the orphan so the theme paints a guaranteed-readable
  // default; keep the pair, which is readable on any theme.
  if (
    (typeof out.textColor === "string") !==
    (typeof out.backgroundColor === "string")
  ) {
    delete out.textColor;
    delete out.backgroundColor;
  }
  const weight = style[CURATED_STYLE_FONT_WEIGHT_KEY];
  if (typeof weight === "number" && Number.isInteger(weight) && weight >= 100 && weight <= 900) {
    out[CURATED_STYLE_FONT_WEIGHT_KEY] = weight;
  }
  // minHeight — a bounded CSS length so a hero/band gets real vertical presence
  // (AIQ-7). Only a single safe length token survives; anything else is dropped.
  const minH = style[CURATED_STYLE_MIN_HEIGHT_KEY];
  if (isSafeMinHeight(minH)) out[CURATED_STYLE_MIN_HEIGHT_KEY] = minH;
  // Center any bounded-width content column. The `maxWidth` TOKEN only sets
  // `max-width`; it never adds `margin-inline: auto`, so a token-width block
  // floats to the LEFT of its full-bleed parent (a cramped column instead of a
  // centered one — verified live on generated heroes). The shipped page-designs
  // avoid this by pairing `maxWidthFree` with explicit `marginLeftFree/RightFree:
  // "auto"`; we do the same here so generated columns center like the presets.
  // `full` is excluded (it already spans the row). These keys are validated
  // free-style escapes (registry `builderNodeStyleValueSchema`), so they never
  // drop the node.
  if (out.maxWidth === "narrow" || out.maxWidth === "reading" || out.maxWidth === "wide") {
    out.width = "100%";
    out.marginLeftFree = "auto";
    out.marginRightFree = "auto";
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Default aspect ratio per image role so a generated image never renders unbounded (AIQ-9). */
function defaultAspectForImageRole(role: unknown): string {
  switch (role) {
    case "hero":
    case "wide":
      return "21:9";
    case "portrait":
    case "team":
      return "3:4";
    default:
      return "4:3";
  }
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
      // Brand-safe default: never the generic "Learn more" tell (AIQ-26).
      const label = clampString(rawProps.label ?? node.label, BUTTON_LABEL_MAX) ?? "Start an inquiry";
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
      const role = rawProps.role ?? node.role;
      const src = photoForImageRole(role);
      const alt = clampString(rawProps.alt ?? node.alt, ALT_MAX);
      // Bound the rendered height (AIQ-9): if the model didn't pick an aspectRatio,
      // apply a sensible default per role + object-fit:cover, so a full-width hero
      // or a portrait never renders unbounded/huge. These are curated enum values.
      const imgStyle: Record<string, unknown> = style ? { ...style } : {};
      if (typeof imgStyle.aspectRatio !== "string") {
        imgStyle.aspectRatio = defaultAspectForImageRole(role);
      }
      if (typeof imgStyle.objectFit !== "string") imgStyle.objectFit = "cover";
      const props: Record<string, unknown> = { src, style: imgStyle };
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
    case "accordion": {
      // Only accordion_item children are valid (drop-policy); coerceChildren
      // enforces it. We deliberately DO NOT emit defaultOpenItemIds: it is
      // id-referential and cloneBuilderTreeWithFreshIds re-mints ids downstream,
      // which would orphan the reference. An all-closed accordion is valid.
      const props: Record<string, unknown> = withStyle({});
      const allowMultiple = rawProps.allowMultiple;
      if (typeof allowMultiple === "boolean") props.allowMultiple = allowMultiple;
      const children = coerceChildren();
      if (children.length === 0) return null; // an accordion with no items is useless
      return emit(props, children);
    }
    case "accordion_item": {
      const title = clampString(rawProps.title ?? node.title, 180);
      if (!title) return null; // title is required by the schema
      return emit(withStyle({ title }), coerceChildren());
    }
    case "form": {
      const rawFields = Array.isArray(rawProps.fields) ? rawProps.fields : [];
      const fields: Array<Record<string, unknown>> = [];
      const seenFieldIds = new Set<string>();
      const seenNames = new Set<string>();
      for (const raw of rawFields.slice(0, 24)) {
        const field = asObject(raw);
        if (!field) continue;
        const type = field.type;
        if (type !== "text" && type !== "email" && type !== "tel" && type !== "textarea" && type !== "submit") {
          continue;
        }
        const label = clampString(field.label, 120) ?? (type === "submit" ? "Send" : "Field");
        // Derive a stable, unique id + name from whatever the model gave (or the label).
        let id = clampString(field.id ?? field.name ?? label, 120) ?? `field-${fields.length + 1}`;
        while (seenFieldIds.has(id)) id = `${id}-${fields.length + 1}`;
        let name = clampString(field.name ?? id, 80) ?? id;
        while (seenNames.has(name)) name = `${name}-${fields.length + 1}`;
        seenFieldIds.add(id);
        seenNames.add(name);
        const out: Record<string, unknown> = { id, name, type, label };
        const placeholder = clampString(field.placeholder, 160);
        if (placeholder) out.placeholder = placeholder;
        if (typeof field.required === "boolean") out.required = field.required;
        fields.push(out);
      }
      if (fields.length === 0) return null; // schema requires >= 1 field
      const props: Record<string, unknown> = withStyle({ fields });
      const method = rawProps.method;
      if (method === "get" || method === "post") props.method = method;
      const honeypotName = clampString(rawProps.honeypotName, 80);
      if (honeypotName) props.honeypotName = honeypotName;
      // action left unset → the form falls back to the tenant's default inquiry sink.
      return emit(props);
    }
    // WS7 Phase 0 — the two NATIVE data blocks. Both are structural leaves, so
    // no children are read. Coercion is allow-list shaped and COPY-ONLY: see
    // coerce-native-data-blocks.ts for exactly which props are dropped and why
    // no model-supplied value can reach a tenant data query.
    case "hero_search": {
      const props = coerceHeroSearchProps(rawProps, style);
      return props ? emit(props) : null;
    }
    case "talent_type_grid": {
      const props = coerceTalentTypeGridProps(rawProps, style);
      return props ? emit(props) : null;
    }
    case "pricing_table": {
      const rawTiers = Array.isArray(rawProps.tiers) ? rawProps.tiers : [];
      const tiers: Array<Record<string, unknown>> = [];
      const seenTierIds = new Set<string>();
      for (const raw of rawTiers.slice(0, 4)) {
        const tier = asObject(raw);
        if (!tier) continue;
        const name = clampString(tier.name, 120);
        const price = clampString(tier.price, 80);
        if (!name || !price) continue; // name + price are required
        let id = clampString(tier.id ?? name, 80) ?? `tier-${tiers.length + 1}`;
        while (seenTierIds.has(id)) id = `${id}-${tiers.length + 1}`;
        seenTierIds.add(id);
        const out: Record<string, unknown> = { id, name, price };
        const description = clampString(tier.description, 500);
        if (description) out.description = description;
        const period = clampString(tier.period, 80);
        if (period) out.period = period;
        const ctaLabel = clampString(tier.ctaLabel, 80);
        if (ctaLabel) out.ctaLabel = ctaLabel;
        let ctaHref = clampString(tier.ctaHref, 500);
        if (ctaHref && /^\s*(?:javascript|data|vbscript):/i.test(ctaHref)) ctaHref = "/inquire";
        if (ctaHref) out.ctaHref = ctaHref;
        if (typeof tier.highlighted === "boolean") out.highlighted = tier.highlighted;
        const rawFeatures = Array.isArray(tier.features) ? tier.features : [];
        const features: Array<Record<string, unknown>> = [];
        for (const rawFeature of rawFeatures.slice(0, 20)) {
          const f = asObject(rawFeature);
          const flabel = clampString(f?.label, 240);
          if (!flabel) continue;
          const feat: Record<string, unknown> = { label: flabel };
          if (typeof f?.included === "boolean") feat.included = f.included;
          features.push(feat);
        }
        if (features.length > 0) out.features = features;
        tiers.push(out);
      }
      if (tiers.length < 2) return null; // schema requires 2-4 tiers
      return emit(withStyle({ tiers }));
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

/**
 * AIQ-21 — a targeted repair instruction appended to the user message on the
 * corrective retry, so the second attempt is NOT byte-identical to the first.
 * Keyed by the first pass's failure reason. Returns undefined when a plain
 * resend is the best available move.
 */
function repairNoteFor(reason: GenFailReason): string | undefined {
  switch (reason) {
    case "truncated":
      return "RETRY: your previous reply was cut off before the JSON closed. Return a COMPLETE, valid JSON object, and prefer fewer sections over an unfinished one.";
    case "parse_failed":
      return 'RETRY: your previous reply was not valid JSON. Return ONLY the {"sections":[...]} object, with no prose, no markdown fences, and no trailing commas.';
    case "no_valid_nodes":
      return 'RETRY: your previous reply had no usable sections. Every top-level item must be {"kind":"section","children":[...]} with at least one valid block child, per the grammar.';
    case "refusal":
      return "RETRY: rephrase as a neutral, professional talent-agency page. Keep the copy brand-safe and on topic.";
    default:
      return undefined; // "empty" / "error" / "ok" — a plain resend is the best we can do
  }
}

async function runOnce(
  input: GenerateNodesInput,
  brief: string,
  maxTokens: number,
  repairNote?: string,
): Promise<{ tree: BuilderNodeTree; repaired: boolean } | { fail: GenFailReason }> {
  const res = await input.generateWithModel({
    systemPrompt: buildGenerationSystemPrompt({
      locale: input.locale,
      themePolarity: input.themePolarity,
      palette: input.palette,
    }),
    userMessage: buildGenerationUserMessage(input.scope, brief, input.locale),
    jsonSchema: GENERATION_OUTPUT_SCHEMA,
    maxTokens,
    repairNote,
  });
  const parsed = parseModelJson(res.text);
  // A non-"ok" reason (truncated/refusal/empty/error) is more actionable than a
  // generic parse failure — surface it so the retry can target the real cause.
  if (parsed == null) return { fail: res.reason === "ok" ? "parse_failed" : res.reason };

  const coerced = coerceToSections(parsed);
  if (coerced.length === 0) return { fail: "no_valid_nodes" };

  // Re-mint every id (the model's ids may collide/repeat) BEFORE validate, which
  // rejects duplicate ids, then run the same gate the gallery-insert path uses.
  const fresh = cloneBuilderTreeWithFreshIds(coerced);
  const validation = validateBuilderNodeTree(fresh);
  if (validation.ok) return { tree: validation.tree, repaired: false };
  // Invalid nodes are dropped; the repaired tree still validates. Use it when
  // it kept at least one section.
  if (validation.tree.length > 0) return { tree: validation.tree, repaired: true };
  return { fail: "no_valid_nodes" };
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

  // One generate + one corrective retry. On a TRUNCATED first pass, retry with a
  // higher token cap (thinking + JSON share the budget) so a good-but-cut page is
  // recovered instead of silently dropping to the preset composer (AIQ-15). The
  // retry also carries a failure-specific repair note (AIQ-21).
  let result = await runOnce(input, clipped, GEN_MAX_TOKENS);
  if ("fail" in result) {
    const firstFail = result.fail;
    const retryTokens = firstFail === "truncated" ? GEN_MAX_TOKENS_RETRY : GEN_MAX_TOKENS;
    result = await runOnce(input, clipped, retryTokens, repairNoteFor(firstFail));
  }
  if ("fail" in result) {
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
