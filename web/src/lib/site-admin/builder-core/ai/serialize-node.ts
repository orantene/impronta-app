/**
 * AI-3 (revise) — serialize an EXISTING builder subtree back into the SAME
 * grammar the generator emits, so the model can read what a block already
 * contains and change only what the user asked (see [[revise-nodes]]).
 *
 * This is the app-importable sibling of the eval judge's `serializeTree`
 * (scripts/ai-builder-eval/judge.ts), which is script-only. Where the judge
 * needs a one-line-per-node summary for scoring, revise needs a FAITHFUL,
 * round-trippable description: it strips runtime-only fields (node ids, the
 * resolved image `src`, instance/override bookkeeping) and keeps exactly the
 * props + curated style keys the generation grammar defines, so the model sees
 * a clean, editable version of its own output shape and can preserve verbatim
 * copy it isn't asked to touch.
 *
 * Pure + dependency-light (types only) so it stays unit-testable and safe to
 * import from both the server action and any client that needs a preview label.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  CURATED_STYLE_COLOR_KEYS,
  CURATED_STYLE_ENUM_VALUES,
  CURATED_STYLE_FONT_WEIGHT_KEY,
  CURATED_STYLE_MIN_HEIGHT_KEY,
  type CuratedStyleEnumKey,
} from "./generation-allowed-kinds";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Keep only the curated style keys the grammar documents (mirrors sanitizeStyle's key set). */
function pickStyle(raw: unknown): Record<string, unknown> | undefined {
  const style = asRecord(raw);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(CURATED_STYLE_ENUM_VALUES) as CuratedStyleEnumKey[]) {
    if (typeof style[key] === "string") out[key] = style[key];
  }
  for (const key of CURATED_STYLE_COLOR_KEYS) {
    if (typeof style[key] === "string") out[key] = style[key];
  }
  if (typeof style[CURATED_STYLE_FONT_WEIGHT_KEY] === "number") {
    out[CURATED_STYLE_FONT_WEIGHT_KEY] = style[CURATED_STYLE_FONT_WEIGHT_KEY];
  }
  if (typeof style[CURATED_STYLE_MIN_HEIGHT_KEY] === "string") {
    out[CURATED_STYLE_MIN_HEIGHT_KEY] = style[CURATED_STYLE_MIN_HEIGHT_KEY];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Best-effort reverse of `photoForImageRole`: a coerced image node carries a
 * resolved `src` (a themed placeholder) but NOT the role the model picked, so we
 * infer a role from the bounded aspect ratio purely to hand the model a valid
 * `image` block to keep in place. The ACTUAL photo is preserved separately by
 * ordinal carry-over in the composer, so this guess never changes what renders.
 */
function guessImageRole(style: Record<string, unknown>): string {
  switch (style.aspectRatio) {
    case "21:9":
      return "wide";
    case "16:9":
      return "hero";
    case "3:4":
      return "portrait";
    case "1:1":
      return "gallery";
    default:
      return "gallery";
  }
}

/** Rebuild one node in the generation grammar's shape (drop ids + runtime-only props). */
function toGrammarNode(node: BuilderNode): Record<string, unknown> | null {
  const kind = (node as { kind?: unknown }).kind;
  if (typeof kind !== "string") return null;
  const props = asRecord((node as { props?: unknown }).props);
  const style = pickStyle(props.style);
  const rawKids = (node as { children?: unknown }).children;
  const kids = Array.isArray(rawKids)
    ? rawKids.map((c) => toGrammarNode(c as BuilderNode)).filter((n): n is Record<string, unknown> => n != null)
    : [];

  const out: Record<string, unknown> = { kind };
  const p: Record<string, unknown> = {};
  const keep = (k: string) => {
    if (props[k] !== undefined && props[k] !== null) p[k] = props[k];
  };

  switch (kind) {
    case "section":
      if (typeof node.props === "object" && typeof (props.label ?? (node as { label?: unknown }).label) === "string") {
        out.label = props.label ?? (node as { label?: unknown }).label;
      }
      break;
    case "container":
      keep("layout"); keep("gap"); keep("columns"); keep("align");
      break;
    case "split":
      keep("ratio"); keep("gap");
      break;
    case "card":
      keep("variant");
      break;
    case "cta_group":
      keep("align");
      break;
    case "heading":
      keep("text"); keep("level");
      break;
    case "paragraph":
      keep("text");
      break;
    case "button":
      keep("label"); keep("href"); keep("tone");
      break;
    case "image": {
      // Role is not stored post-coercion; infer one so the model keeps an image
      // block here. The real src is carried over by ordinal in the composer.
      p.role = guessImageRole(asRecord(props.style));
      keep("alt");
      break;
    }
    case "icon":
      keep("icon"); keep("size"); keep("label");
      break;
    case "divider":
      keep("tone");
      break;
    case "spacer":
      keep("size");
      break;
    case "accordion":
      keep("allowMultiple");
      break;
    case "accordion_item":
      keep("title");
      break;
    case "form":
      keep("method"); keep("fields");
      break;
    case "pricing_table":
      keep("tiers");
      break;
    default:
      // Unknown/non-generation kind — pass the kind through so the model still
      // sees the slot; props are dropped (the composer coercion will handle it).
      break;
  }

  if (style) p.style = style;
  if (Object.keys(p).length > 0) out.props = p;
  if (kids.length > 0) out.children = kids;
  return out;
}

/**
 * Serialize a selected subtree into a compact JSON string in the generation
 * grammar. This is the "here is what the block currently contains" payload the
 * revise prompt embeds. Returns `"{}"` for an unreadable node (never throws).
 */
export function serializeBuilderSubtreeForRevise(node: BuilderNode): string {
  const grammar = toGrammarNode(node);
  return JSON.stringify(grammar ?? {}, null, 2);
}

/** The top-level kind of a node, or null if it isn't a readable node. */
export function builderNodeKindOf(node: BuilderNode): string | null {
  const kind = (node as { kind?: unknown }).kind;
  return typeof kind === "string" ? kind : null;
}
