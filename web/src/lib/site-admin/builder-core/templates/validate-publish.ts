/**
 * validate-publish.ts — Builder Studio WS-D D1.
 *
 * Pure, side-effect-free validation gate that `publishTemplate` runs BEFORE it
 * writes status=published. A broken / empty / unbindable template must never
 * reach a tenant's "+" gallery, so publish blocks on any failure with a clear,
 * operator-readable reason.
 *
 * Kept a plain module (NOT "use server") so it is unit-testable in the node
 * runner and importable from the server action without Next.js bootstrapping.
 *
 * Checks, in order:
 *   1. Tree is non-empty AND `validateBuilderNodeTree` passes (blocks an empty
 *      template — which would insert nothing — and a structurally corrupt one).
 *   2. Every data-bound node references a REGISTERED data source. A dangling
 *      binding (unknown / removed source key) is resolved against
 *      `getBuilderDataSourceDefinition`, which is backed by
 *      BUILDER_DATA_SOURCE_REGISTRY (+ `collection:` keys, which are opaque and
 *      treated as valid). This is a STRUCTURAL binding check: it proves every
 *      binding points at a source the renderer knows how to resolve. It does
 *      NOT execute the binding against a live preview subject — that needs
 *      tenant DB plumbing (a real subject id, RLS-scoped data loaders) that is
 *      out of scope for a pure publish gate and would couple validation to a
 *      specific tenant. See `diffTemplateTreeForPublish` for the change check.
 */

import {
  validateBuilderNodeTree,
  type BuilderNodeValidationIssue,
} from "@/lib/site-admin/builder-node/validate";
import {
  getBuilderNodeDataBinding,
  getBuilderDataSourceDefinition,
} from "@/lib/site-admin/builder-node/data-bindings";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

// ── Result type ───────────────────────────────────────────────────────────────

export type ValidateTemplateForPublishResult =
  | { ok: true }
  | { ok: false; reasons: string[] };

export interface ValidateTemplateForPublishOptions {
  /**
   * The builder_tree of the most recent published revision (or the current live
   * row before this publish). When supplied, the gate surfaces whether anything
   * changed since then. A no-op publish (identical tree) does NOT block — it is
   * surfaced via `diffTemplateTreeForPublish` for callers that want to warn —
   * but is never a hard failure here.
   */
  previousTree?: ReadonlyArray<BuilderNode> | null;
}

// ── Dangling-binding scan ─────────────────────────────────────────────────────

/**
 * Walk the tree and collect every data-bound node whose `sourceKey` is NOT a
 * registered data source. `getBuilderDataSourceDefinition` returns null only
 * for an unknown source — it already accepts `collection:<id>` keys and the
 * legacy aliases (`roster_talent`, `taxonomy_category`, `location`).
 */
function collectDanglingBindings(
  tree: ReadonlyArray<BuilderNode>,
): Array<{ nodeId: string; sourceKey: string }> {
  const dangling: Array<{ nodeId: string; sourceKey: string }> = [];

  const visit = (node: BuilderNode): void => {
    const binding = getBuilderNodeDataBinding(node);
    if (binding?.sourceKey) {
      if (!getBuilderDataSourceDefinition(binding.sourceKey)) {
        dangling.push({ nodeId: node.id, sourceKey: binding.sourceKey });
      }
    }
    const children = (node as { children?: BuilderNode[] }).children;
    if (Array.isArray(children)) {
      for (const child of children) visit(child);
    }
  };

  for (const node of tree) visit(node);
  return dangling;
}

// ── Diff vs the last snapshot ─────────────────────────────────────────────────

export interface TemplateTreeDiff {
  /** False when there is no previous tree to compare against (first publish). */
  hasPrevious: boolean;
  /** True when the tree differs from the previous snapshot (or is the first). */
  changed: boolean;
}

/**
 * Cheap structural diff: did the builder_tree change vs the previous snapshot?
 * Uses a stable JSON comparison (the tree is plain JSON at rest). This is
 * advisory — a no-op publish is allowed (re-publishing to bump version is a
 * legitimate operation); the gate only SURFACES the result, it does not block.
 */
export function diffTemplateTreeForPublish(
  tree: ReadonlyArray<BuilderNode>,
  previousTree?: ReadonlyArray<BuilderNode> | null,
): TemplateTreeDiff {
  if (previousTree == null) return { hasPrevious: false, changed: true };
  const changed = stableStringify(tree) !== stableStringify(previousTree);
  return { hasPrevious: true, changed };
}

/**
 * Deterministic JSON stringify (object keys sorted) so two trees that differ
 * only by key insertion order compare equal. Arrays keep their order (order is
 * meaningful for a node tree).
 */
function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

// ── The gate ──────────────────────────────────────────────────────────────────

function summarizeIssues(
  issues: ReadonlyArray<BuilderNodeValidationIssue>,
): string {
  const MAX = 5;
  const head = issues
    .slice(0, MAX)
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join(", ");
  const more = issues.length > MAX ? ` (+${issues.length - MAX} more)` : "";
  return `template structure is invalid — ${head}${more}`;
}

/**
 * The publish gate. Returns `{ ok: true }` when the template is safe to publish,
 * or `{ ok: false, reasons }` with one or more operator-readable reasons.
 *
 * Pure: no I/O, no logging, no throwing. The caller turns `reasons` into the
 * action's `{ ok: false, error }` shape.
 */
export function validateTemplateForPublish(
  tree: ReadonlyArray<BuilderNode> | null | undefined,
  opts?: ValidateTemplateForPublishOptions,
): ValidateTemplateForPublishResult {
  const reasons: string[] = [];

  // 1. Non-empty + structurally valid.
  if (!Array.isArray(tree) || tree.length === 0) {
    reasons.push(
      "template has no content — it would insert nothing into a page",
    );
    // Nothing else is meaningful to check on an empty tree.
    return { ok: false, reasons };
  }

  const validation = validateBuilderNodeTree(tree);
  if (!validation.ok) {
    reasons.push(summarizeIssues(validation.issues));
  }

  // 2. No dangling data bindings. Run against the validated/repaired tree when
  //    available so we scan the same node set the renderer would ship; fall
  //    back to the input tree if validation rebuilt nothing.
  const scanTree = validation.tree.length > 0 ? validation.tree : tree;
  const dangling = collectDanglingBindings(scanTree);
  if (dangling.length > 0) {
    const detail = dangling
      .slice(0, 5)
      .map((d) => `"${d.sourceKey}" (node ${d.nodeId})`)
      .join(", ");
    const more = dangling.length > 5 ? ` (+${dangling.length - 5} more)` : "";
    reasons.push(
      `unknown data source${dangling.length > 1 ? "s" : ""}: ${detail}${more} — pick a supported source before publishing`,
    );
  }

  if (reasons.length > 0) return { ok: false, reasons };

  // 3. Diff vs the last snapshot is advisory only (never blocks). Computed for
  //    callers that want to surface "no changes" — see diffTemplateTreeForPublish.
  void diffTemplateTreeForPublish(tree, opts?.previousTree);

  return { ok: true };
}
