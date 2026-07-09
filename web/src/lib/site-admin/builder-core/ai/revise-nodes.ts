/**
 * AI-3 — freeform builder REVISER.
 *
 * The read-modify-return sibling of `generate-nodes.ts`. Where the generator
 * turns a blank brief into a new tree, this takes an EXISTING selected block +
 * a plain-language change request and returns a revised candidate of the SAME
 * shape, which the client previews (desktop + mobile) and then Replaces or
 * Inserts-below — the model never mutates the page directly.
 *
 * Reuse over reinvention: the model output is still treated as hostile and flows
 * through the exact same gate the generator uses —
 *   parse → coerceToSections → re-mint ids → validateBuilderNodeTree
 * so every curated-kind / style / brand invariant holds identically. The only
 * revise-specific logic is (1) a prompt addendum that reframes the task as
 * "keep what works, change only what's asked", (2) root-kind reconciliation so
 * a non-section block comes back as that same block (not wrapped in a section),
 * and (3) image `src` carry-over by ordinal so revising copy never silently
 * swaps the photos the user already placed.
 *
 * SERVER-ONLY (via the coercion/registry imports). The model call is injected
 * (`ModelGenerateFn`), so this stays pure + unit-testable with a stubbed model.
 */
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import { cloneBuilderTreeWithFreshIds } from "@/lib/site-admin/builder-node/page-designs/expand-repeaters";
import { makeId } from "@/lib/site-admin/builder-node/make-id";
import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import {
  buildGenerationSystemPrompt,
  coerceToSections,
  parseModelJson,
  GENERATION_OUTPUT_SCHEMA,
  type GenerationPalette,
  type ModelGenerateFn,
  type ThemePolarity,
} from "./generate-nodes";
import { serializeBuilderSubtreeForRevise, builderNodeKindOf } from "./serialize-node";
import { getLocaleMetadata } from "@/i18n/config";

const MIN_INSTRUCTION_LEN = 2;
const MAX_INSTRUCTION_LEN = 600;
const GEN_MAX_TOKENS = 16000;
const GEN_MAX_TOKENS_RETRY = 24000;

export interface ReviseNodesInput {
  /** The selected subtree to revise (a real, coerced tree node). */
  node: BuilderNode;
  /** The user's plain-language change request. */
  instruction: string;
  generateWithModel: ModelGenerateFn;
  locale?: string;
  themePolarity?: ThemePolarity;
  palette?: GenerationPalette;
}

export type ReviseNodesResult =
  | { ok: true; node: BuilderNode; nodeCount: number; repaired: boolean }
  | {
      ok: false;
      code: "INSTRUCTION_TOO_SHORT" | "UNREADABLE_NODE" | "EMPTY";
      error: string;
    };

/**
 * The revise task framing, appended to the generator's grammar system prompt so
 * every kind/style/brand rule and few-shot still applies verbatim. Only the task
 * changes: edit an existing block instead of composing a blank one.
 */
function buildReviseAddendum(): string {
  return [
    "",
    "TASK OVERRIDE — REVISE MODE:",
    "You are NOT composing a page from scratch. You are revising ONE existing block whose current content is given below in the same JSON grammar you output.",
    "- Preserve everything the change request does not mention: keep the exact copy, structure, block kinds, and styling that already work. Change ONLY what is asked.",
    "- Do not renumber, translate, or reword untouched copy. Do not drop children you were not asked to remove.",
    "- Keep the SAME top-level block kind as the current block unless the request explicitly calls for a different one.",
    "- All the grammar, color, brand-language, punctuation, and hierarchy rules above still apply to whatever you add or change.",
  ].join("\n");
}

function buildReviseUserMessage(node: BuilderNode, instruction: string, locale?: string): string {
  const kind = builderNodeKindOf(node) ?? "container";
  const languageName = getLocaleMetadata(locale ?? "en").label;
  const shapeLine =
    kind === "section"
      ? 'Return {"sections": [ ONE section ]} — the revised version of the section below.'
      : `Return {"sections": [ ONE section whose SINGLE child is the revised "${kind}" block ]}. Do not add sibling blocks unless the change requires them.`;
  return [
    "Revise the block below and return only the JSON object.",
    shapeLine,
    "",
    `LANGUAGE: keep all user-visible copy in ${languageName} (the block's existing language); write any new copy in ${languageName} too.`,
    "",
    `CURRENT BLOCK (kind: "${kind}"):`,
    serializeBuilderSubtreeForRevise(node),
    "",
    `CHANGE REQUESTED: ${instruction}`,
    "",
    'Return only the {"sections": [...]} JSON object, no prose.',
  ].join("\n");
}

/** Collect every image node's `src` in document order (for carry-over). */
function collectImageSrcs(node: BuilderNode): string[] {
  const out: string[] = [];
  const walk = (n: BuilderNode) => {
    if ((n as { kind?: unknown }).kind === "image") {
      const src = (n as { props?: { src?: unknown } }).props?.src;
      if (typeof src === "string" && src.length > 0) out.push(src);
    }
    const kids = (n as { children?: BuilderNode[] }).children;
    if (Array.isArray(kids)) kids.forEach(walk);
  };
  walk(node);
  return out;
}

/**
 * Carry the ORIGINAL photos into the candidate by ordinal. Coercion resolves
 * every generated image to a themed placeholder `src` (the model can't emit a
 * url), so without this a copy-only revision would swap the user's real photos.
 * Matching by position keeps them stable unless the revision changed the image
 * count (added/removed a photo), where a placeholder is the honest fallback.
 */
function carryOverImages(candidate: BuilderNode, originalSrcs: string[]): void {
  if (originalSrcs.length === 0) return;
  let i = 0;
  const walk = (n: BuilderNode) => {
    if ((n as { kind?: unknown }).kind === "image") {
      const props = (n as { props?: Record<string, unknown> }).props;
      if (props && i < originalSrcs.length) {
        props.src = originalSrcs[i];
        i += 1;
      }
    }
    const kids = (n as { children?: BuilderNode[] }).children;
    if (Array.isArray(kids)) kids.forEach(walk);
  };
  walk(candidate);
}

/** Wrap multiple unwrapped blocks in a stack container so the result is one node. */
function wrapInStack(children: BuilderNode[]): BuilderNode {
  return {
    id: makeId("container"),
    kind: "container",
    props: { layout: "stack", gap: "m" },
    children,
  } as unknown as BuilderNode;
}

function countNodes(node: BuilderNode): number {
  let n = 0;
  const walk = (x: BuilderNode) => {
    n += 1;
    const kids = (x as { children?: BuilderNode[] }).children;
    if (Array.isArray(kids)) kids.forEach(walk);
  };
  walk(node);
  return n;
}

/**
 * Run the model once and return a validated candidate of the same root kind as
 * the original, or a failure tag. The candidate is always run through the
 * generator's coerce+validate gate (as a section tree, which is what validate
 * accepts), then unwrapped for a non-section original.
 */
async function runReviseOnce(
  input: ReviseNodesInput,
  originalKind: string,
  maxTokens: number,
  repairNote?: string,
): Promise<{ node: BuilderNode; repaired: boolean } | { fail: true }> {
  const res = await input.generateWithModel({
    systemPrompt: buildGenerationSystemPrompt({
      locale: input.locale,
      themePolarity: input.themePolarity,
      palette: input.palette,
    }) + buildReviseAddendum(),
    userMessage: buildReviseUserMessage(input.node, input.instruction, input.locale),
    jsonSchema: GENERATION_OUTPUT_SCHEMA,
    maxTokens,
    repairNote,
  });
  const parsed = parseModelJson(res.text);
  if (parsed == null) return { fail: true };

  // Coerce to sections (the generator's hostile-input gate), re-mint ids, then
  // validate as a root tree — exactly the generator's pipeline.
  const coerced = coerceToSections(parsed);
  if (coerced.length === 0) return { fail: true };
  const fresh = cloneBuilderTreeWithFreshIds(coerced);
  const validation = validateBuilderNodeTree(fresh);
  const tree: BuilderNodeTree = validation.tree;
  const repaired = !validation.ok;
  if (tree.length === 0) return { fail: true };

  const originalSrcs = collectImageSrcs(input.node);

  if (originalKind === "section") {
    const candidate = tree[0]!;
    carryOverImages(candidate, originalSrcs);
    return { node: candidate, repaired };
  }

  // Non-section original: unwrap the synthetic section coerceToSections produced.
  const kids = (tree[0] as { children?: BuilderNode[] }).children ?? [];
  if (kids.length === 0) return { fail: true };
  const candidate = kids.length === 1 ? kids[0]! : wrapInStack(kids);
  carryOverImages(candidate, originalSrcs);
  return { node: candidate, repaired };
}

/**
 * Revise a selected block from a plain-language instruction. Returns a validated
 * candidate node (same root kind as the input) that the client previews and then
 * Replaces / Inserts-below. One attempt + one plain retry on failure.
 */
export async function reviseBuilderNodes(input: ReviseNodesInput): Promise<ReviseNodesResult> {
  const originalKind = builderNodeKindOf(input.node);
  if (!originalKind) {
    return { ok: false, code: "UNREADABLE_NODE", error: "That block could not be read." };
  }
  const instruction = (input.instruction ?? "").trim();
  if (instruction.length < MIN_INSTRUCTION_LEN) {
    return { ok: false, code: "INSTRUCTION_TOO_SHORT", error: "Describe the change you want." };
  }
  const clipped = { ...input, instruction: instruction.slice(0, MAX_INSTRUCTION_LEN) };

  let result = await runReviseOnce(clipped, originalKind, GEN_MAX_TOKENS);
  if ("fail" in result) {
    result = await runReviseOnce(
      clipped,
      originalKind,
      GEN_MAX_TOKENS_RETRY,
      'RETRY: return ONLY the {"sections":[...]} JSON, complete and valid, revising the block as asked while keeping everything else unchanged.',
    );
  }
  if ("fail" in result) {
    return { ok: false, code: "EMPTY", error: "The AI could not revise that — try rephrasing." };
  }
  return { ok: true, node: result.node, nodeCount: countNodes(result.node), repaired: result.repaired };
}
